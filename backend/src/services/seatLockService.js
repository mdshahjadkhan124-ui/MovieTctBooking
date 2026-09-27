import crypto from "crypto";
import { getRedisClient } from "../config/redis.js";

// How long a lock survives without being renewed/released — long enough for
// a user to pick seats and get through checkout, short enough that an
// abandoned selection frees up quickly for someone else.
export const LOCK_TTL_MS = 7 * 60 * 1000; // 7 minutes

const keyPrefix = (showtimeId) => `lock:${showtimeId}:`;
const lockKey = (showtimeId, seatId) => `${keyPrefix(showtimeId)}${seatId}`;

// Index of which seats this showtime currently has locks for. Reads used to
// SCAN for `lock:{showtimeId}:*`, which walks the WHOLE Redis keyspace —
// every other showtime's locks and every rate-limit counter — on an endpoint
// polled every few seconds per viewer. This set makes a read touch only the
// seats actually held for one showtime.
//
// It's an index, not the source of truth: seat keys still expire on their own
// TTL, so a member can outlive its lock. Reads treat a member whose key is
// gone as free and prune it (see liveLocks), which keeps the set honest
// without any cleanup job. Its own expiry is refreshed past the longest lock
// so an abandoned set can't linger.
const lockSetKey = (showtimeId) => `locks:${showtimeId}`;
const SET_TTL_BUFFER_MS = 60 * 1000;

// Token = userId + random bytes, so ownership is verifiable (the userId is
// there for debuggability/auditing) without a second lookup table — the
// Redis value itself IS the ownership credential.
const ownerPrefix = (userId) => `${userId}:`;
const generateToken = (userId) => `${ownerPrefix(userId)}${crypto.randomBytes(16).toString("hex")}`;

// Atomic acquire-or-re-own: takes the seat if it's free, OR if the caller
// already holds it (value starts with their userId prefix) — e.g. retrying
// checkout after a declined card, which would otherwise be blocked by the
// caller's own still-live lock. Re-owning swaps in the new token and a fresh
// TTL, and returns the previous value + remaining TTL so a rollback can put
// the caller's original hold back exactly as it was. A seat held by anyone
// else is never touched. Doing the check and the write in one script is what
// stops a lock that expires mid-check from being overwritten.
// KEYS: [1] seat lock, [2] this showtime's seat index.
// ARGV: [1] new token, [2] owner prefix, [3] lock TTL ms, [4] seat id,
//       [5] index TTL ms, [6] "1" if re-owning an already-held seat is
//       allowed, "0" if not (see acquireLocks' `reown` option).
const ACQUIRE_OR_REOWN_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])
  redis.call("SADD", KEYS[2], ARGV[4])
  redis.call("PEXPIRE", KEYS[2], ARGV[5])
  return {1}
end
if ARGV[6] == "1" and string.sub(current, 1, string.len(ARGV[2])) == ARGV[2] then
  local remaining = redis.call("PTTL", KEYS[1])
  redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])
  redis.call("SADD", KEYS[2], ARGV[4])
  redis.call("PEXPIRE", KEYS[2], ARGV[5])
  return {1, current, remaining}
end
return {0}
`;

// Rollback counterpart for a re-owned seat: only if this request's token is
// still there, put the previous value back with its previous remaining TTL.
// If there's nothing left to restore, the seat leaves the index too.
const RESTORE_IF_OWNER_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  if tonumber(ARGV[3]) > 0 then
    redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
  else
    redis.call("DEL", KEYS[1])
    redis.call("SREM", KEYS[2], ARGV[4])
  end
  return 1
end
return 0
`;

// Atomic check-and-delete: only removes the key if its value still matches
// the caller's token. Never a blind DELETE — a blind delete could remove a
// lock some other request already legitimately re-acquired after this one
// expired or was released.
const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  redis.call("SREM", KEYS[2], ARGV[2])
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

const releaseIfOwner = async (showtimeId, seatId, token) => {
  const client = getRedisClient();
  const result = await client.eval(RELEASE_IF_OWNER_SCRIPT, {
    keys: [lockKey(showtimeId, seatId), lockSetKey(showtimeId)],
    arguments: [token, seatId],
  });
  return result === 1;
};

/**
 * Seats this showtime currently has live locks for, as [seatId, token] pairs.
 * Members whose lock has expired are pruned here — the index self-heals on
 * read instead of needing a sweeper.
 */
const liveLocks = async (showtimeId) => {
  const client = getRedisClient();
  const seatIds = await client.sMembers(lockSetKey(showtimeId));
  if (seatIds.length === 0) return [];

  const values = await client.mGet(seatIds.map((seatId) => lockKey(showtimeId, seatId)));
  const live = [];
  const stale = [];
  seatIds.forEach((seatId, i) => {
    if (values[i] === null) stale.push(seatId);
    else live.push([seatId, values[i]]);
  });
  if (stale.length > 0) await client.sRem(lockSetKey(showtimeId), stale);
  return live;
};

const restoreIfOwner = async (showtimeId, seatId, token, previous) => {
  const client = getRedisClient();
  await client.eval(RESTORE_IF_OWNER_SCRIPT, {
    keys: [lockKey(showtimeId, seatId), lockSetKey(showtimeId)],
    arguments: [token, previous.value, String(previous.remainingMs)],
  });
};

/**
 * All-or-nothing multi-seat lock. Attempts every seat (even after a
 * conflict) so the caller gets the complete list of unavailable seats in one
 * response, then rolls back anything it did acquire in this request if any
 * seat failed — no partial locks are ever left behind, and seats the caller
 * already held before this request are restored to that earlier hold rather
 * than released.
 *
 * Seats the caller already holds are re-acquired under the new token with a
 * fresh TTL (see ACQUIRE_OR_REOWN_SCRIPT); seats held by anyone else are
 * unavailable.
 *
 * `ttlMs` is overridable (defaulting to LOCK_TTL_MS) purely so tests can
 * verify expiry behavior without waiting out the real 7-minute TTL; callers
 * outside tests should never pass it.
 *
 * `reown` (default true) is what makes retry-after-declined-card work: a
 * human resubmitting checkout for seats they already hold must re-acquire
 * them rather than be told their own seats are "unavailable". That same
 * silent takeover is wrong for waitlistService.processWaitlist's offer path,
 * whose caller is the SYSTEM, not the seat's holder — two concurrent
 * processWaitlist runs (a cancellation racing the sweeper, say) can both
 * pick the same candidate and both call acquireLocks for the same seats
 * under that one candidate's userId. With reown left on, the second call
 * would silently re-own the first call's just-taken hold under a fresh
 * token; whichever call then loses the Mongo "claim this offer" race
 * releases what it thinks is its own token — which, after the re-own, was
 * actually the winner's live hold — deleting it out from under an offer
 * that's still shown to the user as active. Passing reown:false there
 * instead makes the second call see the seat as genuinely unavailable (the
 * first call's hold, not its own to take over), so it does nothing and
 * `processWaitlist` cleanly no-ops on that seat this round — the correct
 * outcome, since the seat already has a live offer on it.
 */
export const acquireLocks = async (
  showtimeId,
  seatIds,
  userId,
  { ttlMs = LOCK_TTL_MS, reown = true } = {}
) => {
  const client = getRedisClient();
  const token = generateToken(userId);

  const acquired = []; // { seatId, previous: { value, remainingMs } | null }
  const unavailable = [];

  for (const seatId of seatIds) {
    // Atomic per seat — this is what makes "exactly one of two concurrent
    // requests wins" true.
    const [ok, previousValue, previousRemainingMs] = await client.eval(ACQUIRE_OR_REOWN_SCRIPT, {
      keys: [lockKey(showtimeId, seatId), lockSetKey(showtimeId)],
      arguments: [
        token,
        ownerPrefix(userId),
        String(ttlMs),
        seatId,
        String(ttlMs + SET_TTL_BUFFER_MS),
        reown ? "1" : "0",
      ],
    });
    if (ok === 1) {
      acquired.push({
        seatId,
        previous: previousValue ? { value: previousValue, remainingMs: previousRemainingMs } : null,
      });
    } else {
      unavailable.push(seatId);
    }
  }

  if (unavailable.length > 0) {
    await Promise.all(
      acquired.map(({ seatId, previous }) =>
        previous
          ? restoreIfOwner(showtimeId, seatId, token, previous)
          : releaseIfOwner(showtimeId, seatId, token)
      )
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
  const released = [];

  // Only this showtime's own seats are considered — no keyspace scan.
  for (const [seatId, value] of await liveLocks(showtimeId)) {
    if (value !== token) continue;
    if (await releaseIfOwner(showtimeId, seatId, token)) released.push(seatId);
  }

  return released;
};

/**
 * Test-only: shortens the remaining TTL on already-acquired locks so a test
 * can wait out a real expiry without either (a) acquiring with a TTL so
 * short it expires mid-setup against real network latency, or (b) sleeping
 * for the full production TTL. Acquire normally, do whatever slow setup is
 * needed, then call this right before the point where expiry should matter.
 */
export const shortenLockTtlForTests = async (showtimeId, seatIds, ttlMs) => {
  const client = getRedisClient();
  await Promise.all(
    seatIds.map((seatId) => client.pExpire(lockKey(showtimeId, seatId), ttlMs))
  );
};

/**
 * Seat IDs currently locked for a showtime by anyone OTHER than `userId` —
 * i.e. what that user genuinely can't take. A lock that expired since the
 * index was written is pruned and (correctly) treated as free.
 */
export const getSeatIdsLockedByOthers = async (showtimeId, userId) => {
  const owner = ownerPrefix(userId);
  return (await liveLocks(showtimeId))
    .filter(([, value]) => !value.startsWith(owner))
    .map(([seatId]) => seatId);
};

/** Seat IDs currently locked (by anyone) for a showtime. */
export const getLockedSeatIds = async (showtimeId) =>
  (await liveLocks(showtimeId)).map(([seatId]) => seatId);

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

  const prefix = ownerPrefix(userId);
  const allOwnedByUser = values.every((value) => value !== null && value.startsWith(prefix));
  const allSameToken = values.every((value) => value === values[0]);

  return allOwnedByUser && allSameToken ? values[0] : null;
};
