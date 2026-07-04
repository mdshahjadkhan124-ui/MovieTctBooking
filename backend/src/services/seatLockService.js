import crypto from "crypto";
import { getRedisClient } from "../config/redis.js";

// How long a lock survives without being renewed/released — long enough for
// a user to pick seats and get through checkout, short enough that an
// abandoned selection frees up quickly for someone else.
export const LOCK_TTL_MS = 7 * 60 * 1000; // 7 minutes

const keyPrefix = (showtimeId) => `lock:${showtimeId}:`;
const lockKey = (showtimeId, seatId) => `${keyPrefix(showtimeId)}${seatId}`;

// Token = userId + random bytes, so ownership is verifiable (the userId is
// there for debuggability/auditing) without a second lookup table — the
// Redis value itself IS the ownership credential.
const generateToken = (userId) => `${userId}:${crypto.randomBytes(16).toString("hex")}`;

// Atomic check-and-delete: only removes the key if its value still matches
// the caller's token. Never a blind DELETE — a blind delete could remove a
// lock some other request already legitimately re-acquired after this one
// expired or was released.
const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const releaseIfOwner = async (key, token) => {
  const client = getRedisClient();
  const result = await client.eval(RELEASE_IF_OWNER_SCRIPT, { keys: [key], arguments: [token] });
  return result === 1;
};

/**
 * All-or-nothing multi-seat lock. Attempts every seat (even after a
 * conflict) so the caller gets the complete list of unavailable seats in one
 * response, then rolls back anything it did acquire in this request if any
 * seat failed — no partial locks are ever left behind.
 *
 * `ttlMs` is overridable (defaulting to LOCK_TTL_MS) purely so tests can
 * verify expiry behavior without waiting out the real 7-minute TTL; callers
 * outside tests should never pass it.
 */
export const acquireLocks = async (showtimeId, seatIds, userId, { ttlMs = LOCK_TTL_MS } = {}) => {
  const client = getRedisClient();
  const token = generateToken(userId);

  const acquired = [];
  const unavailable = [];

  for (const seatId of seatIds) {
    // SET NX PX: atomic set-if-not-exists with expiry in a single command —
    // this is what makes "exactly one of two concurrent requests wins" true.
    const result = await client.set(lockKey(showtimeId, seatId), token, {
      NX: true,
      PX: ttlMs,
    });
    if (result === "OK") {
      acquired.push(seatId);
    } else {
      unavailable.push(seatId);
    }
  }

  if (unavailable.length > 0) {
    await Promise.all(
      acquired.map((seatId) => releaseIfOwner(lockKey(showtimeId, seatId), token))
    );
    return { success: false, unavailable };
  }

  return { success: true, token, expiresAt: Date.now() + ttlMs };
};

/**
 * Releases every currently-locked seat for this showtime whose lock value
 * matches `token` — i.e. "release all of the current holder's locks"
 * without the client needing to remember/resend which exact seatIds it
 * locked. Ownership-guarded per seat via the same atomic script as acquire's
 * rollback path.
 */
export const releaseLocksByToken = async (showtimeId, token) => {
  const client = getRedisClient();
  const prefix = keyPrefix(showtimeId);
  const released = [];

  // scanIterator yields batches of keys per cursor step, not one key at a
  // time — each `keys` here is an array.
  for await (const keys of client.scanIterator({ MATCH: `${prefix}*` })) {
    for (const key of keys) {
      const wasReleased = await releaseIfOwner(key, token);
      if (wasReleased) released.push(key.slice(prefix.length));
    }
  }

  return released;
};

/** Seat IDs currently locked (by anyone) for a showtime. */
export const getLockedSeatIds = async (showtimeId) => {
  const client = getRedisClient();
  const prefix = keyPrefix(showtimeId);
  const seatIds = [];

  for await (const keys of client.scanIterator({ MATCH: `${prefix}*` })) {
    for (const key of keys) {
      seatIds.push(key.slice(prefix.length));
    }
  }

  return seatIds;
};

/**
 * Booking-commit (Sprint 6) calls this to confirm the caller still holds
 * every seat it's about to book, using the exact token from checkout time.
 */
export const verifyLockOwnership = async (showtimeId, seatIds, token) => {
  const client = getRedisClient();
  const values = await Promise.all(
    seatIds.map((seatId) => client.get(lockKey(showtimeId, seatId)))
  );
  return values.every((value) => value === token);
};

/**
 * Checkout (Sprint 6) doesn't receive the lock token from the client — the
 * request body is just { showtimeId, seatIds }. This derives ownership
 * directly from Redis state instead: every seat must currently be locked,
 * all with the SAME token (proving they were locked together in one
 * request), and that token's embedded userId must match the caller.
 * Returns the shared token (to stash for a later exact-match re-check via
 * verifyLockOwnership, e.g. at Stripe webhook time) or null if not owned.
 */
export const getOwnedLockToken = async (showtimeId, seatIds, userId) => {
  const client = getRedisClient();
  const values = await Promise.all(
    seatIds.map((seatId) => client.get(lockKey(showtimeId, seatId)))
  );

  const prefix = `${userId}:`;
  const allOwnedByUser = values.every((value) => value !== null && value.startsWith(prefix));
  const allSameToken = values.every((value) => value === values[0]);

  return allOwnedByUser && allSameToken ? values[0] : null;
};
