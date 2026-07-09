import "dotenv/config";
import http from "node:http";
import express from "express";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

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
