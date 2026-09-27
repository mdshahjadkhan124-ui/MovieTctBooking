import "dotenv/config";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { connectDB } from "../config/db.js";
import { connectRedis } from "../config/redis.js";
import app from "../app.js";
import { createRateLimiter } from "./rateLimiters.js";
import { sanitizeInput } from "./sanitize.js";
import { User } from "../models/User.js";

let redisClient;
let realServer;
let realBaseUrl; // the actual, fully-wired app — used for sanitization + header checks
let testServer;
let testBaseUrl; // a minimal isolated app — used to exercise real 429 behavior
// deterministically, without a shared Redis counter leaking into (or being
// polluted by) every other test file in the suite via the app's real,
// production-scale limiters (which are also skipped under NODE_ENV=test —
// see rateLimiters.js's own comment on why).
const testRunId = Date.now();

beforeAll(async () => {
  await connectDB();
  redisClient = await connectRedis();

  realServer = http.createServer(app);
  await new Promise((resolve) => realServer.listen(0, resolve));
  realBaseUrl = `http://127.0.0.1:${realServer.address().port}`;

  const testApp = express();
  testApp.use(express.json());
  // Mirrors app.js's actual exemption mechanism for the Stripe webhook: a
  // route registered BEFORE the limiter middleware never reaches it.
  testApp.post("/exempt", (req, res) => res.json({ ok: true }));
  // /strict carries its own route-scoped limiter, registered before the
  // blanket testApp.use() below — otherwise it would ALSO pass through
  // (and be exhausted by) the /limited middleware, the same way
  // /api/auth/login passes through both its own strict limiter and the
  // general one in the real app.
  testApp.post(
    "/strict",
    createRateLimiter({ windowMs: 60_000, max: 2, prefix: `rl:test-strict:${testRunId}:` }),
    (req, res) => res.json({ ok: true })
  );

  // A store that fails exactly the way a real one does mid-outage (see
  // rateLimiters.js's own reasoning for why this fails open) — deterministic
  // and isolated: it never touches the real Redis connection every other
  // test in this file still needs working, and the failure fires on every
  // single call rather than depending on real network timing.
  //
  // Registered BEFORE the blanket testApp.use() below, for the same reason as
  // /strict: anything registered after it also passes through the blanket
  // limiter, whose per-IP counter earlier tests in this file have already
  // exhausted. Registered after it, this route's requests were answered by
  // that blanket limiter with real 429s (RateLimit-Limit: 3, its own max)
  // and never reached the failing store at all — so the test observed real
  // rate limiting, not the outage path it exists to check.
  const alwaysFailingStore = {
    increment: async () => {
      throw new Error("simulated Redis outage");
    },
    decrement: async () => {},
    resetKey: async () => {},
  };
  testApp.post(
    "/redis-down",
    createRateLimiter({
      windowMs: 60_000,
      max: 1,
      prefix: `rl:test-redis-down:${testRunId}:`,
      store: alwaysFailingStore,
    }),
    (req, res) => res.json({ ok: true })
  );

  testApp.use(createRateLimiter({ windowMs: 60_000, max: 3, prefix: `rl:test-limited:${testRunId}:` }));
  testApp.post("/limited", (req, res) => res.json({ ok: true }));

  testServer = http.createServer(testApp);
  await new Promise((resolve) => testServer.listen(0, resolve));
  testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
}, 30000);

afterAll(async () => {
  for await (const keys of redisClient.scanIterator({ MATCH: `rl:test-*:${testRunId}:*` })) {
    for (const key of keys) await redisClient.del(key);
  }
  await new Promise((resolve) => realServer.close(resolve));
  await new Promise((resolve) => testServer.close(resolve));
  await redisClient.quit();
  await mongoose.disconnect();
});

describe("Redis-backed rate limiting", () => {
  it("allows requests under the limit, then returns 429 once exceeded", async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${testBaseUrl}/limited`, { method: "POST" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("a 429 response follows the standard error envelope and carries RateLimit-* headers", async () => {
    const res = await fetch(`${testBaseUrl}/limited`, { method: "POST" }); // already exhausted above
    expect(res.status).toBe(429);
    expect(res.headers.get("ratelimit-limit")).toBe("3");
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: { code: "RATE_LIMITED" } });
  });

  it("a stricter limiter (mirroring the auth endpoints) has its own, lower ceiling — independent of the general limit", async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${testBaseUrl}/strict`, { method: "POST" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it("a route registered before the limiter (mirroring the Stripe webhook route) is never rate-limited", async () => {
    const statuses = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${testBaseUrl}/exempt`, { method: "POST" });
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s === 200)).toBe(true);
  });

  it("the live app actually exempts /api/webhooks/stripe — hammering it never 429s (a bad signature 400 is expected instead)", async () => {
    const statuses = [];
    for (let i = 0; i < 8; i++) {
      const res = await fetch(`${realBaseUrl}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" },
        body: JSON.stringify({}),
      });
      statuses.push(res.status);
    }
    expect(statuses.every((s) => s !== 429)).toBe(true);
  });

  it("fails OPEN when the store errors (Redis outage) — the request still succeeds, never 429/500/503, and it's logged loudly", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // max: 1 on this route — if it were failing anything other than fully
    // open, request #2 would 429. Every single call hits the always-failing
    // store, so this also proves it doesn't fail open only once and then
    // fail closed on a retry.
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${testBaseUrl}/redis-down`, { method: "POST" });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200]);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain("failing OPEN");
    expect(logged).toContain(`rl:test-redis-down:${testRunId}:`);

    errorSpy.mockRestore();
  });
});

describe("input sanitization (unit — the exported middleware directly)", () => {
  it("strips $-prefixed and dotted keys from body/query/params, recursively, leaving safe data intact", () => {
    const req = {
      body: { email: { $gt: "" }, nested: { safe: "ok", "a.b": "bad", deeper: { $where: "1" } } },
      query: { filter: { $ne: null } },
      params: { id: "abc123" },
    };
    let nextCalled = false;
    sanitizeInput(req, {}, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.body.email).toEqual({});
    expect(req.body.nested).toEqual({ safe: "ok", deeper: {} });
    expect(req.query.filter).toEqual({});
    expect(req.params.id).toBe("abc123");
  });

  it("sanitizes objects nested inside arrays too", () => {
    const req = { body: { items: [{ ok: 1 }, { $gt: 2 }] }, query: {}, params: {} };
    sanitizeInput(req, {}, () => {});
    expect(req.body.items).toEqual([{ ok: 1 }, {}]);
  });
});

describe("input sanitization (end-to-end, through the real app)", () => {
  it("a login body carrying MongoDB operators cannot bypass auth", async () => {
    const res = await fetch(`${realBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email: { $gt: "" }, password: { $gt: "" } }),
    });
    expect(res.status).not.toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it("a real login with valid credentials still works normally", async () => {
    const email = `hardening-test-${testRunId}@example.com`;
    const password = "TestPass123!";
    await User.create({ name: "Hardening Test", email, password });

    const res = await fetch(`${realBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    await User.deleteOne({ email });
  });
});

describe("CSRF protection", () => {
  const login = (init = {}) =>
    fetch(`${realBaseUrl}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email: "nobody@example.com", password: "whatever123" }),
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });

  it("blocks a state-changing request that carries no X-Requested-With header (what an HTML form post looks like)", async () => {
    const res = await login();
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CSRF_BLOCKED");
  });

  it("blocks a state-changing request sent from another site's origin", async () => {
    const res = await login({
      headers: { "X-Requested-With": "XMLHttpRequest", Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CSRF_BLOCKED");
  });

  it("blocks a cross-site Referer when the browser sent no Origin", async () => {
    const res = await login({
      headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://evil.example.com/attack" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("CSRF_BLOCKED");
  });

  it("allows the real app's request — header present, own origin (login still reaches the handler)", async () => {
    const res = await login({
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        Origin: process.env.CLIENT_URL || "http://localhost:5173",
      },
    });
    // 401 = the credentials were wrong, i.e. it got past CSRF to real auth.
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("leaves safe (GET) requests alone", async () => {
    const res = await fetch(`${realBaseUrl}/api/movies`);
    expect(res.status).toBe(200);
  });

  it("exempts the Stripe webhook, which has no browser headers to send", async () => {
    const res = await fetch(`${realBaseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" },
      body: JSON.stringify({}),
    });
    // Rejected for a bad signature, not blocked as CSRF.
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_SIGNATURE");
  });
});

describe("session revocation on logout", () => {
  const appJson = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };

  const loginAs = async (email, password) => {
    const res = await fetch(`${realBaseUrl}/api/auth/login`, {
      method: "POST",
      headers: appJson,
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    return res.headers.get("set-cookie").split(";")[0]; // "token=..."
  };

  it("a token copied before logout stops working afterwards", async () => {
    const email = `revocation-test-${testRunId}@example.com`;
    const password = "TestPass123!";
    await User.create({ name: "Revocation Test", email, password });

    // Imagine this cookie value was captured (shared machine, leaked log).
    const stolenCookie = await loginAs(email, password);
    const before = await fetch(`${realBaseUrl}/api/auth/me`, { headers: { Cookie: stolenCookie } });
    expect(before.status).toBe(200);

    await fetch(`${realBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { ...appJson, Cookie: stolenCookie },
    });

    // The JWT itself is still perfectly valid and unexpired — only the
    // denylist stops it.
    const after = await fetch(`${realBaseUrl}/api/auth/me`, { headers: { Cookie: stolenCookie } });
    expect(after.status).toBe(401);

    await User.deleteOne({ email });
  });

  it("logging out one session doesn't revoke another session of the same user", async () => {
    const email = `revocation-two-${testRunId}@example.com`;
    const password = "TestPass123!";
    await User.create({ name: "Two Sessions", email, password });

    const laptop = await loginAs(email, password);
    const phone = await loginAs(email, password);

    await fetch(`${realBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { ...appJson, Cookie: laptop },
    });

    expect((await fetch(`${realBaseUrl}/api/auth/me`, { headers: { Cookie: laptop } })).status).toBe(401);
    expect((await fetch(`${realBaseUrl}/api/auth/me`, { headers: { Cookie: phone } })).status).toBe(200);

    await fetch(`${realBaseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { ...appJson, Cookie: phone },
    });
    await User.deleteOne({ email });
  });
});

describe("helmet security headers", () => {
  it("adds standard security headers and removes X-Powered-By, without breaking a normal API response", async () => {
    const res = await fetch(`${realBaseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-powered-by")).toBeNull();
    const body = await res.json();
    expect(body).toMatchObject({ success: true });
  });
});
