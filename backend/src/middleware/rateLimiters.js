import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "../config/redis.js";

const envInt = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export const GLOBAL_RATE_LIMIT_WINDOW_MS = envInt("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
export const GLOBAL_RATE_LIMIT_MAX = envInt("RATE_LIMIT_MAX", 100);
export const AUTH_RATE_LIMIT_WINDOW_MS = envInt("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000);
export const AUTH_RATE_LIMIT_MAX = envInt("AUTH_RATE_LIMIT_MAX", 5);

const rateLimitedResponse = (req, res) => {
  res.status(429).json({
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
  });
};

// A Redis-backed store, not express-rate-limit's default in-memory one —
// an in-memory counter is per Node PROCESS, so the instant this app runs as
// more than one process (Render's autoscaling, PM2 cluster mode, any
// horizontal scaling) each instance would keep its own separate count,
// silently multiplying the real limit by however many instances happen to
// handle a given caller's requests (3 instances = an effective 300/15min,
// not 100). Redis makes the counter shared, so the limit is the limit
// regardless of how many processes are serving traffic.
const redisStoreWithPrefix = (prefix) =>
  new RedisStore({
    sendCommand: (...args) => getRedisClient().sendCommand(args),
    prefix,
  });

export const createRateLimiter = ({ windowMs, max, prefix }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true, // RateLimit-* response headers
    legacyHeaders: false,
    store: redisStoreWithPrefix(prefix),
    handler: rateLimitedResponse,
  });

// Automated tests share one Redis instance across every test file in the
// suite (this project doesn't spin up an isolated Redis per test run), so a
// real, shared-counter limiter mounted on the app would make passing the
// suite dependent on its total request volume staying under the production
// limit forever — inherently flaky as the suite grows. Skipped only under
// vitest (NODE_ENV=test is vitest's own default, never set this way for a
// real deployment); the limiter's own logic is still fully exercised via
// dedicated, always-on instances in hardening.test.js.
const isTestEnv = () => process.env.NODE_ENV === "test";

// RedisStore sends a SCRIPT LOAD to Redis the moment it's constructed, and
// app.js (which mounts the middlewares below) is imported before
// server.js's connectRedis() resolves — so the limiters can't be built at
// module load. They also must not be built inside a request: express-rate-
// limit flags that as ERR_ERL_CREATED_IN_REQUEST_HANDLER. Instead server.js
// calls initRateLimiters() once at startup, after Redis connects and before
// the server starts listening; the exported middlewares just delegate to
// whatever it built.
let globalLimiter = null;
let authLimiter = null;

export const initRateLimiters = () => {
  globalLimiter = createRateLimiter({
    windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
    max: GLOBAL_RATE_LIMIT_MAX,
    prefix: "rl:global:",
  });
  authLimiter = createRateLimiter({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
    max: AUTH_RATE_LIMIT_MAX,
    prefix: "rl:auth:",
  });
};

// Fails closed: a request reaching an uninitialized limiter is a startup
// ordering bug, and silently skipping rate limiting would hide it.
const delegateTo = (getLimiter, name) => (req, res, next) => {
  if (isTestEnv()) return next();
  const limiter = getLimiter();
  if (!limiter) return next(new Error(`${name} used before initRateLimiters() was called`));
  return limiter(req, res, next);
};

export const globalRateLimiter = delegateTo(() => globalLimiter, "globalRateLimiter");
export const authRateLimiter = delegateTo(() => authLimiter, "authRateLimiter");
