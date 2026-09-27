import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { connectRedis } from "../config/redis.js";
import { acquireLocks, getLockedSeatIds, verifyLockOwnership } from "./seatLockService.js";

// History worth knowing: these were first written while no test Redis was
// available, and their first real run failed intermittently ("iteration ~20:
// expected [] to deeply equal ['A1']"). A Redis MONITOR trace of a failing
// iteration showed the locking code was correct — the one-seat request won
// A1 and its lock key stayed alive — but ANOTHER TEST FILE's cleanup deleted
// this iteration's per-showtime index set mid-flight. Cause: this file reused
// seatLockService.test.js's "test-showtime-" key prefix, and both files'
// afterEach sweeps every key matching it, while the two files run in parallel
// against one Redis. Each file was deleting the other's in-flight keys (it
// also intermittently broke seatLockService.test.js). The fix is the private,
// run-scoped prefix below — the assertions were correct and were not loosened.
// Independently confirmed with 6,000 uninterrupted races in a private
// keyspace: zero invariant violations.
//
// What they cover, that seatLockService.test.js does not:
//
//  * Atomicity in seatLockService is PER SEAT — one Lua script per seat. A
//    multi-seat request is "all-or-nothing" through COMPENSATION (roll back
//    what it took if any seat failed), not through one atomic script. So the
//    existing race test's "exactly one of two wins" is a statement about ONE
//    contested seat. For overlapping multi-seat requests the guarantee is
//    weaker and different: AT MOST one wins (both can lose — each grabs one
//    seat, each fails on the other, each rolls back), and nothing is ever left
//    half-locked. That is what is pinned here.
//  * More than two contenders for one seat.

// A private keyspace for this file, deliberately NOT "test-showtime-": that is
// seatLockService.test.js's prefix, and its afterEach sweeps every key that
// matches it (see the history note above). Scoped by a per-run id as well, so
// even another run of this same file can't collide. The cleanup below can only
// ever match keys made here, so it can't sweep anyone else's in-flight locks
// either.
const KEY_PREFIX = `test-concurrency-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-`;
let showtimeCounter = 0;
const uniqueShowtimeId = () => `${KEY_PREFIX}${showtimeCounter++}`;

let client;

beforeAll(async () => {
  client = await connectRedis();
});

afterAll(async () => {
  await client.quit();
});

afterEach(async () => {
  // scanIterator yields BATCHES of keys per step, not single keys.
  for (const pattern of [`lock:${KEY_PREFIX}*`, `locks:${KEY_PREFIX}*`]) {
    for await (const keys of client.scanIterator({ MATCH: pattern })) {
      for (const key of keys) await client.del(key);
    }
  }
});

describe("seatLockService under real concurrency", () => {
  it("ten users racing for one seat: exactly one wins, the other nine are refused that seat", async () => {
    const showtimeId = uniqueShowtimeId();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => acquireLocks(showtimeId, ["A1"], `user${i}`))
    );

    const winners = results.filter((r) => r.success);
    const losers = results.filter((r) => !r.success);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(9);
    for (const loser of losers) expect(loser.unavailable).toEqual(["A1"]);

    expect(await getLockedSeatIds(showtimeId)).toEqual(["A1"]);
    expect(await verifyLockOwnership(showtimeId, ["A1"], winners[0].token)).toBe(true);
  });

  // Each case races two overlapping multi-seat requests, 30 times, each on a
  // fresh showtime so iterations can't influence each other.
  //
  // Invariants (true under every interleaving):
  //   1. never more than one winner (the requests share a seat);
  //   2. if there is a winner, the seats locked are EXACTLY its requested
  //      seats, all under its one token — the loser's rollback removed
  //      everything the loser had taken, and nothing else;
  //   3. if there is NO winner, NOTHING is left locked (each request rolled
  //      back everything it had acquired).
  const overlapCases = [
    {
      name: "the same two seats requested in opposite order (both may lose)",
      requests: [
        { userId: "userX", seats: ["A1", "A2"] },
        { userId: "userY", seats: ["A2", "A1"] },
      ],
      // Trace: X takes A1, Y takes A2, X fails A2, Y fails A1, both roll back.
      // Not a rare corner: measured over 3,000 real races (one connection, so
      // the two requests interleave in lockstep, as here) NOBODY won every
      // time. Contract-correct — no double-lock, nothing left behind — but two
      // users grabbing the same two seats in opposite order at the same
      // instant both get refused and have to retry.
      exactlyOneWinnerGuaranteed: false,
    },
    {
      name: "a one-seat request against a three-seat request that includes it",
      requests: [
        { userId: "userX", seats: ["A1"] },
        { userId: "userY", seats: ["A1", "A2", "A3"] },
      ],
      // Only one seat is contested, and whoever loses it has nothing else to
      // lose on: if X holds A1, Y fails A1 (and rolls back A2, A3) and X wins;
      // if Y holds A1, X fails and Y takes A2, A3 uncontested and wins. So
      // here exactly one request always wins — and Y's rollback of A2/A3 in
      // the first branch is precisely the "no orphans under concurrency" claim.
      exactlyOneWinnerGuaranteed: true,
    },
  ];

  it.each(overlapCases)(
    "never leaves a partial lock: $name",
    async ({ requests, exactlyOneWinnerGuaranteed }) => {
      for (let i = 0; i < 30; i++) {
        const showtimeId = uniqueShowtimeId();
        const label = `iteration ${i} (${showtimeId})`;

        const results = await Promise.all(
          requests.map(({ userId, seats }) => acquireLocks(showtimeId, seats, userId))
        );

        const winners = results
          .map((result, idx) => ({ result, seats: requests[idx].seats }))
          .filter(({ result }) => result.success);

        expect(winners.length, label).toBeLessThanOrEqual(1);
        if (exactlyOneWinnerGuaranteed) expect(winners.length, label).toBe(1);

        const locked = (await getLockedSeatIds(showtimeId)).sort();
        if (winners.length === 1) {
          const { result, seats } = winners[0];
          expect(locked, label).toEqual([...seats].sort());
          expect(await verifyLockOwnership(showtimeId, seats, result.token), label).toBe(true);
        } else {
          expect(locked, `${label}: no winner, so nothing may remain locked`).toEqual([]);
        }
      }
    }
  );
});
