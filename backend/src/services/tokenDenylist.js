import jwt from "jsonwebtoken";
import { getRedisClient } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";

// A JWT is self-contained: the server can't "delete" one, so logging out by
// clearing the cookie only stops the browser from sending it — a copy taken
// beforehand (XSS, shared machine, leaked logs) would keep working until it
// expired. This denylist is the missing revocation: a token id recorded here
// is refused by `protect`, and the entry expires exactly when the token
// would have, so Redis never accumulates dead keys.
const key = (jti) => `denylist:jwt:${jti}`;

/**
 * Both denylist operations fail CLOSED on a Redis error: revokeToken (logout)
 * and isTokenRevoked (every authenticated request, via middleware/auth.js's
 * `protect`) are the two halves of one authentication decision — did THIS
 * session get revoked — and losing either one open would let a logged-out
 * or compromised session keep acting as its owner. 503, not the central
 * error handler's generic 500 fallback, so the client sees "try again",
 * not "something is broken". Deliberately the opposite choice from
 * rateLimiters.js's store-error handling, which fails OPEN: a request-count
 * throttle failing open for a bit is a much smaller, non-account-specific
 * risk than an authentication check failing open ever is.
 */
const failClosedOnRedisError = async (fn, context) => {
  try {
    return await fn();
  } catch (err) {
    console.error(`Redis error ${context}:`, err);
    throw new AppError("Service temporarily unavailable", 503, "SERVICE_UNAVAILABLE");
  }
};

/**
 * Revokes the token in a cookie value. Returns whether anything was
 * actually revoked — a malformed/expired token, or one issued before tokens
 * carried an id, has nothing to revoke.
 */
export const revokeToken = async (token) => {
  if (!token) return false;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return false; // invalid or already expired — nothing worth denylisting
  }

  const remainingMs = payload.exp * 1000 - Date.now();
  if (!payload.jti || remainingMs <= 0) return false;

  await failClosedOnRedisError(
    () => getRedisClient().set(key(payload.jti), "1", { PX: Math.ceil(remainingMs) }),
    "while revoking a token"
  );
  return true;
};

/** True if this token id was revoked (i.e. its owner logged out). */
export const isTokenRevoked = async (jti) => {
  if (!jti) return false; // pre-denylist tokens: can't be revoked, only expire

  return failClosedOnRedisError(
    async () => (await getRedisClient().exists(key(jti))) === 1,
    "while checking the token denylist"
  );
};
