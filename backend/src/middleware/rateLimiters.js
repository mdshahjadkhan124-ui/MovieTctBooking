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
// real deployment); the limiter's own logic is still fully exercised via a
// dedicated, always-on instance in rateLimiters.test.js.
const isTestEnv = () => process.env.NODE_ENV === "test";

// RedisStore.init() (called synchronously inside rateLimit()) sends a
// SCRIPT LOAD to Redis immediately — but app.js (and therefore this
// module) is imported before server.js's connectRedis() resolves, so
// building the limiter at module-load time would race ahead of the
// connection and fail. Deferring construction to the first actual request
// (memoized after that) sidesteps the race entirely: by the time any real
// request arrives, httpServer.listen() has already run, which only happens
// after connectRedis() resolved.
const lazy = (factory) => {
  let instance;
  return (req, res, next) => {
    if (!instance) instance = factory();
    return instance(req, res, next);
  };
};

const maybeSkip = (limiter) => (req, res, next) => (isTestEnv() ? next() : limiter(req, res, next));

export const globalRateLimiter = maybeSkip(
  lazy(() =>
    createRateLimiter({
      windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS,
      max: GLOBAL_RATE_LIMIT_MAX,
      prefix: "rl:global:",
    })
  )
);

export const authRateLimiter = maybeSkip(
  lazy(() =>
    createRateLimiter({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      max: AUTH_RATE_LIMIT_MAX,
      prefix: "rl:auth:",
    })
  )
);
