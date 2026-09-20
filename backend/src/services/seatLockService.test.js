import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { connectRedis } from "../config/redis.js";
import {
  acquireLocks,
  releaseLocksByToken,
  getLockedSeatIds,
  verifyLockOwnership,
  shortenLockTtlForTests,
  LOCK_TTL_MS,
} from "./seatLockService.js";

const TEST_SHOWTIME_PREFIX = "test-showtime-";
const uniqueShowtimeId = () =>
  `${TEST_SHOWTIME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let client;

beforeAll(async () => {
  client = await connectRedis();
});

afterAll(async () => {
  await client.quit();
});

afterEach(async () => {
  // Clean up this run's test keys so tests never leak state into each other.
  // scanIterator yields batches of keys per cursor step, not one at a time.
  // Both the seat locks and the per-showtime index they're tracked in.
  for (const pattern of [`lock:${TEST_SHOWTIME_PREFIX}*`, `locks:${TEST_SHOWTIME_PREFIX}*`]) {
    for await (const keys of client.scanIterator({ MATCH: pattern })) {
      for (const key of keys) {
        await client.del(key);
      }
    }
  }
});

describe("seatLockService", () => {
  it("exactly one of two concurrent lock attempts on the same seat wins", async () => {
    const showtimeId = uniqueShowtimeId();

    const [resultA, resultB] = await Promise.all([
      acquireLocks(showtimeId, ["A1"], "userA"),
      acquireLocks(showtimeId, ["A1"], "userB"),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const failures = [resultA, resultB].filter((r) => !r.success);
    expect(failures).toHaveLength(1);
    expect(failures[0].unavailable).toEqual(["A1"]);
  });

  it("rolls back partial locks when one seat of many is already taken (no orphans)", async () => {
    const showtimeId = uniqueShowtimeId();

    const preLock = await acquireLocks(showtimeId, ["A2"], "otherUser");
    expect(preLock.success).toBe(true);

    const result = await acquireLocks(showtimeId, ["A1", "A2", "A3"], "userA");
    expect(result.success).toBe(false);
    expect(result.unavailable).toEqual(["A2"]);

    // A1 and A3 must NOT remain locked — only the pre-existing A2 lock exists.
    const locked = await getLockedSeatIds(showtimeId);
    expect(locked.sort()).toEqual(["A2"]);
  });

  it("ownership-guarded release: user A cannot release user B's lock", async () => {
    const showtimeId = uniqueShowtimeId();

    const lockA = await acquireLocks(showtimeId, ["A1"], "userA");
    const lockB = await acquireLocks(showtimeId, ["A2"], "userB");
    expect(lockA.success).toBe(true);
    expect(lockB.success).toBe(true);

    const released = await releaseLocksByToken(showtimeId, lockA.token);
    expect(released).toEqual(["A1"]);

    const stillLocked = await getLockedSeatIds(showtimeId);
    expect(stillLocked).toEqual(["A2"]);

    const bStillOwnsA2 = await verifyLockOwnership(showtimeId, ["A2"], lockB.token);
    expect(bStillOwnsA2).toBe(true);
  });

  it("TTL expiry returns a seat to available", async () => {
    const showtimeId = uniqueShowtimeId();

    const shortLock = await acquireLocks(showtimeId, ["A1"], "userA", { ttlMs: 150 });
    expect(shortLock.success).toBe(true);

    const blockedImmediately = await acquireLocks(showtimeId, ["A1"], "userB");
    expect(blockedImmediately.success).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 350));

    const afterExpiry = await acquireLocks(showtimeId, ["A1"], "userB");
    expect(afterExpiry.success).toBe(true);
  });

  it("lock-status (getLockedSeatIds) reflects active locks, including after release", async () => {
    const showtimeId = uniqueShowtimeId();

    expect(await getLockedSeatIds(showtimeId)).toEqual([]);

    const lockResult = await acquireLocks(showtimeId, ["A1", "A2"], "userA");
    expect(lockResult.success).toBe(true);
    expect((await getLockedSeatIds(showtimeId)).sort()).toEqual(["A1", "A2"]);

    await releaseLocksByToken(showtimeId, lockResult.token);
    expect(await getLockedSeatIds(showtimeId)).toEqual([]);
  });

  it("tracks locked seats in a per-showtime index and clears it on release (no keyspace scan needed)", async () => {
    const showtimeId = uniqueShowtimeId();
    const indexKey = `locks:${showtimeId}`;

    const lock = await acquireLocks(showtimeId, ["A1", "A2"], "userA");
    expect((await client.sMembers(indexKey)).sort()).toEqual(["A1", "A2"]);
    // The index can't outlive the locks it tracks.
    expect(await client.pTTL(indexKey)).toBeGreaterThan(0);

    await releaseLocksByToken(showtimeId, lock.token);
    expect(await client.sMembers(indexKey)).toEqual([]);
  });

  it("prunes seats whose lock expired, so the index can't report stale locks", async () => {
    const showtimeId = uniqueShowtimeId();
    const indexKey = `locks:${showtimeId}`;

    await acquireLocks(showtimeId, ["A1"], "userA", { ttlMs: 150 });
    expect(await client.sMembers(indexKey)).toEqual(["A1"]);

    await new Promise((resolve) => setTimeout(resolve, 350));

    // The lock is gone; the read reports the seat free AND cleans the index.
    expect(await getLockedSeatIds(showtimeId)).toEqual([]);
    expect(await client.sMembers(indexKey)).toEqual([]);
  });

  it("a user can re-acquire seats they already hold (e.g. retry after a declined card) — new token, TTL refreshed", async () => {
    const showtimeId = uniqueShowtimeId();

    const first = await acquireLocks(showtimeId, ["A1", "A2"], "userA");
    expect(first.success).toBe(true);
    // Simulate time having passed since the original lock.
    await shortenLockTtlForTests(showtimeId, ["A1", "A2"], 5000);

    const retry = await acquireLocks(showtimeId, ["A1", "A2"], "userA");
    expect(retry.success).toBe(true);
    expect(retry.token).not.toBe(first.token);

    // One consistent token across the seats (what checkout requires), and
    // the old token no longer owns anything.
    expect(await verifyLockOwnership(showtimeId, ["A1", "A2"], retry.token)).toBe(true);
    expect(await verifyLockOwnership(showtimeId, ["A1"], first.token)).toBe(false);

    const remainingTtl = await client.pTTL(`lock:${showtimeId}:A1`);
    expect(remainingTtl).toBeGreaterThan(LOCK_TTL_MS - 60_000);
  });

  it("re-acquiring never takes over another user's lock", async () => {
    const showtimeId = uniqueShowtimeId();

    const lockB = await acquireLocks(showtimeId, ["A1"], "userB");
    expect(lockB.success).toBe(true);

    const attemptA = await acquireLocks(showtimeId, ["A1"], "userA");
    expect(attemptA).toEqual({ success: false, unavailable: ["A1"] });
    expect(await verifyLockOwnership(showtimeId, ["A1"], lockB.token)).toBe(true);
  });

  it("a failed request leaves the caller's existing holds exactly as they were", async () => {
    const showtimeId = uniqueShowtimeId();

    const heldByA = await acquireLocks(showtimeId, ["A1"], "userA");
    const heldByB = await acquireLocks(showtimeId, ["A2"], "userB");
    expect(heldByA.success && heldByB.success).toBe(true);

    // A1 is A's own seat (re-acquirable), A2 is B's — so the request as a
    // whole must fail, and rolling back must restore A1 to A's ORIGINAL
    // token rather than deleting A's existing hold.
    const result = await acquireLocks(showtimeId, ["A1", "A2"], "userA");
    expect(result).toEqual({ success: false, unavailable: ["A2"] });

    expect(await verifyLockOwnership(showtimeId, ["A1"], heldByA.token)).toBe(true);
    expect(await verifyLockOwnership(showtimeId, ["A2"], heldByB.token)).toBe(true);
    expect(await client.pTTL(`lock:${showtimeId}:A1`)).toBeGreaterThan(0);
  });
});
