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

  await getRedisClient().set(key(payload.jti), "1", { PX: Math.ceil(remainingMs) });
  return true;
};

/**
 * True if this token id was revoked (i.e. its owner logged out).
 *
 * Fails CLOSED: every authenticated request goes through this (see
 * middleware/auth.js's `protect`), so if Redis can't be reached we genuinely
 * don't know whether the token was revoked — defaulting to "not revoked"
 * would let a logged-out or compromised session straight through. Refusing
 * the request outright (503) is the safe failure mode; never assume false.
 * Without this catch, the raw Redis rejection would reach the central error
 * handler's generic 500 branch (errorHandler.js), which is still a refusal,
 * just with a less honest status code and no indication it's transient.
 */
export const isTokenRevoked = async (jti) => {
  if (!jti) return false; // pre-denylist tokens: can't be revoked, only expire

  try {
    return (await getRedisClient().exists(key(jti))) === 1;
  } catch (err) {
    console.error("Redis error while checking token denylist:", err);
    throw new AppError(
      "Service temporarily unavailable",
      503,
      "SERVICE_UNAVAILABLE"
    );
  }
};
