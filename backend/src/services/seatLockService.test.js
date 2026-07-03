import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { connectRedis } from "../config/redis.js";
import {
  acquireLocks,
  releaseLocksByToken,
  getLockedSeatIds,
  verifyLockOwnership,
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
  for await (const keys of client.scanIterator({ MATCH: `lock:${TEST_SHOWTIME_PREFIX}*` })) {
    for (const key of keys) {
      await client.del(key);
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
});
