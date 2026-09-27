import { describe, it, expect } from "vitest";
import { recommendSeats } from "./seatRecommendation.js";

// Contract tests for the recommendation engine, written from a read of what
// seatRecommendation.js actually does (not from assumed behavior), and
// mutation-checked: each behavior below was confirmed to be UNPINNED by the
// original suite (a mutant that broke it survived all 11 original tests) and
// is killed by a test here.
//
// Scoring being pinned (all weights are private to the engine, so they are
// restated here on purpose — retuning a weight should fail these tests and
// force the change to be a conscious one):
//   single-row block cost = W_COL(1) * |blockCenterCol - (1 + columns) / 2|
//                         + W_ROW(3) * rowBandPenalty
//   rowBandPenalty: band = middle third of rows; a row `d` rows in FRONT of the
//   band costs d * 2, a row `d` rows BEHIND it costs d * 1.
//   split cost = sum of per-row col costs + sum of per-row band costs
//              + W_SPREAD(2) * (widest center - narrowest center).

const makeSeat = (row, col, status = "available") => ({
  id: `${row}${col}`,
  row,
  col,
  category: "regular",
  status,
});

// A row of `length` seats, all available except columns in `unavailableCols`.
const makeRow = (rowLetter, length, unavailableCols = []) =>
  Array.from({ length }, (_, i) =>
    makeSeat(rowLetter, i + 1, unavailableCols.includes(i + 1) ? "booked" : "available")
  );

const bookedRow = (rowLetter, length) =>
  makeRow(rowLetter, length, Array.from({ length }, (_, i) => i + 1));

const ROWS_A_TO_I = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

// 9 rows x 1 column; only `freeRows` have their seat available. With 9 rows
// the ideal band is D-F (indices 3-5) and columns = 1, so column centering
// contributes exactly 0 and only the ROW cost decides the result.
const nineRowsOnlyFree = (freeRows) =>
  ROWS_A_TO_I.map((letter) => (freeRows.includes(letter) ? makeRow(letter, 1) : bookedRow(letter, 1)));

describe("recommendSeats: row-band scoring, table-driven (every score hand-derived from the weights)", () => {
  const cases = [
    {
      name: "one row ahead of the band loses to one row behind it",
      grid: () => nineRowsOnlyFree(["C", "G"]),
      n: 1,
      expected: { seats: ["G1"], score: 3 },
      why: "C is 1 row in front of the band: 1 x FRONT(2) x W_ROW(3) = 6. G is 1 row behind: 1 x BACK(1) x 3 = 3. A too-close row costs twice a too-far one.",
    },
    {
      name: "the front penalty is a 2x weight, not a ban: near-front still beats far-back",
      grid: () => nineRowsOnlyFree(["C", "I"]),
      n: 1,
      expected: { seats: ["C1"], score: 6 },
      why: "C costs 6 (above). I is 3 rows behind the band: 3 x BACK(1) x 3 = 9. So 2x front < 3x back.",
    },
    {
      name: "equidistant from the band, the back row wins",
      grid: () => nineRowsOnlyFree(["B", "H"]),
      n: 1,
      expected: { seats: ["H1"], score: 6 },
      why: "B is 2 rows in front: 2 x 2 x 3 = 12. H is 2 rows behind: 2 x 1 x 3 = 6.",
    },
    {
      name: "row zone outweighs column centering: an edge seat in the band beats the dead-center seat in the front row",
      // 3 rows -> band is row B only. Row A: only the exact center (col 6 of 11)
      // is free. Row B: only the far-left edge (col 1) is free. Row C is booked.
      grid: () => [
        makeRow("A", 11, [1, 2, 3, 4, 5, 7, 8, 9, 10, 11]),
        makeRow("B", 11, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
        bookedRow("C", 11),
      ],
      n: 1,
      expected: { seats: ["B1"], score: 5 },
      why: "A6: column cost 0, row cost 1 x FRONT(2) x W_ROW(3) = 6 -> 6. B1: column cost |1 - 6| = 5, row cost 0 -> 5. W_ROW(3) > W_COL(1) is what makes 5 < 6.",
    },
    {
      name: "a tie across rows goes to the earliest row of the band",
      grid: () => ROWS_A_TO_I.map((letter) => makeRow(letter, 1)),
      n: 1,
      expected: { seats: ["D1"], score: 0 },
      why: "D, E and F are all in the band with a column cost of 0, so all score 0; the scan keeps the first strictly-better window, so D (the earliest) stands.",
    },
    {
      name: "an even-width tie goes to the leftmost window",
      grid: () => [makeRow("A", 10)],
      n: 3,
      expected: { seats: ["A4", "A5", "A6"], score: 0.5 },
      why: "Ideal center is 5.5. Cols 4-6 (center 5) and 5-7 (center 6) are both 0.5 away; the earlier one is kept.",
    },
  ];

  it.each(cases)("$name — $why", ({ grid, n, expected }) => {
    const result = recommendSeats(grid(), n);

    expect(result.type).toBe("single");
    expect(result.seats).toEqual(expected.seats);
    expect(result.score).toBeCloseTo(expected.score, 9);
  });
});

describe("recommendSeats: Phase 1 (one contiguous block) always beats Phase 2 (a split), even when the split scores better", () => {
  // 3 rows x 6 cols; band is row B only. n = 4.
  //   Row A: fully free -> a single 4-block exists, but in the FRONT row.
  //   Rows B, C: only cols 2-3 free -> neither can hold 4, only a 2+2 split.
  const rowA = () => makeRow("A", 6);
  const rowB = () => makeRow("B", 6, [1, 4, 5, 6]);
  const rowC = () => makeRow("C", 6, [1, 4, 5, 6]);

  it("the split alternative genuinely scores better than the single block (so the priority below is a real decision, not a coincidence)", () => {
    // Row A booked so only the B+C split remains. Split cost: columns
    // |2.5-3.5| + |2.5-3.5| = 2, rows 0 + 3 x BACK(1) = 3, spread 0 -> 5.
    const splitOnly = recommendSeats([bookedRow("A", 6), rowB(), rowC()], 4);

    expect(splitOnly.type).toBe("split");
    expect(splitOnly.seats).toEqual(["B2", "B3", "C2", "C3"]);
    expect(splitOnly.score).toBeCloseTo(5, 9);
  });

  it("...yet with row A free, the engine returns the single block in the worst (front) row rather than the better-scoring split", () => {
    // Single block in A: best window cols 2-5 (center 3.5 = ideal, column cost
    // 0) + row cost 1 x FRONT(2) x 3 = 6. That is WORSE than the split's 5,
    // and it still wins: Phase 1 is a priority, not a competitor.
    const result = recommendSeats([rowA(), rowB(), rowC()], 4);

    expect(result.type).toBe("single");
    expect(result.seats).toEqual(["A2", "A3", "A4", "A5"]);
    expect(result.score).toBeCloseTo(6, 9);
  });
});

describe("recommendSeats: splits use only ADJACENT rows, and spread the party as evenly as possible", () => {
  it("returns null for a party whose free seats exist but can't be chained through adjacent rows", () => {
    // A: cols 5-6 free. B: fully booked. C: cols 5-6 free. Four seats ARE free
    // (so the availableCount guard passes and the split search really runs),
    // but no run of adjacent rows can hold them: any block including both A and
    // C must include B, which has no seat to give.
    const grid = [
      makeRow("A", 6, [1, 2, 3, 4]),
      bookedRow("B", 6),
      makeRow("C", 6, [1, 2, 3, 4]),
    ];

    expect(recommendSeats(grid, 4)).toBeNull();
  });

  it("...and the same free seats DO split when the rows are adjacent (so the null above is about adjacency, not seat position)", () => {
    // Cols 5-6 are 2 each -> col cost |5.5-3.5| x 2 = 4, both rows in band, spread 0.
    const grid = [makeRow("A", 6, [1, 2, 3, 4]), makeRow("B", 6, [1, 2, 3, 4])];
    const result = recommendSeats(grid, 4);

    expect(result.type).toBe("split");
    expect(result.seats).toEqual(["A5", "A6", "B5", "B6"]);
    expect(result.score).toBeCloseTo(4, 9);
  });

  it("splits an odd party as 3 + 2 across the two rows, at the minimum achievable cost", () => {
    // 2 rows x 4 cols, all free, n = 5 (no single row can hold 5). Ideal
    // center 2.5. Best: the 2-wide segment dead-center (cols 2-3, cost 0), the
    // 3-wide segment off-center by 0.5 (cols 1-3 or 2-4, cost 0.5), spread
    // 0.5 x W_SPREAD(2) = 1 -> 1.5. Putting the 2-wide segment at an edge
    // instead costs 2.5, so 1.5 is the floor. Four arrangements tie at 1.5
    // (either row can take the 3; either 3-window works) — the engine's
    // tie-break among them is not part of the contract, the cost is.
    const grid = [makeRow("A", 4), makeRow("B", 4)];
    const result = recommendSeats(grid, 5);

    expect(result.type).toBe("split");
    expect(result.score).toBeCloseTo(1.5, 9);

    const perRow = { A: [], B: [] };
    for (const id of result.seats) perRow[id[0]].push(Number(id.slice(1)));
    expect(perRow.A.length + perRow.B.length).toBe(5);
    expect([perRow.A.length, perRow.B.length].sort()).toEqual([2, 3]); // as evenly as possible

    const optimalArrangements = [
      ["A1", "A2", "A3", "B2", "B3"],
      ["A2", "A3", "A4", "B2", "B3"],
      ["A2", "A3", "B1", "B2", "B3"],
      ["A2", "A3", "B2", "B3", "B4"],
    ];
    expect(optimalArrangements).toContainEqual([...result.seats].sort());
  });
});

describe("recommendSeats: purity", () => {
  const deepFreeze = (grid) => {
    for (const row of grid) {
      for (const seat of row) Object.freeze(seat);
      Object.freeze(row);
    }
    return Object.freeze(grid);
  };

  it("never mutates the grid it is given, and is deterministic for the same input", () => {
    // A grid that exercises BOTH phases in one file of assertions.
    const singleGrid = deepFreeze([makeRow("A", 7, [4]), makeRow("B", 7), makeRow("C", 7)]);
    const splitGrid = deepFreeze([makeRow("A", 4), makeRow("B", 4)]);
    const snapshot = JSON.stringify([singleGrid, splitGrid]);

    // Frozen objects throw on write in strict mode (ES modules always are),
    // so a mutating engine fails here rather than passing silently.
    const firstSingle = recommendSeats(singleGrid, 3);
    const secondSingle = recommendSeats(singleGrid, 3);
    const firstSplit = recommendSeats(splitGrid, 5);
    const secondSplit = recommendSeats(splitGrid, 5);

    expect(secondSingle).toEqual(firstSingle);
    expect(secondSplit).toEqual(firstSplit);
    expect(JSON.stringify([singleGrid, splitGrid])).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Independent oracle. Re-states the DOCUMENTED cost function and brute-forces
// it (every window, every row) instead of using the engine's streak scan, so a
// bug in the engine's algorithm can't hide behind a matching bug in the test.
// ---------------------------------------------------------------------------
const W_COL = 1;
const W_ROW = 3;
const FRONT = 2;
const BACK = 1;

const bandPenalty = (rowIndex, totalRows) => {
  const bandStart = Math.floor(totalRows / 3);
  const bandEnd = totalRows - Math.floor(totalRows / 3) - 1;
  if (rowIndex < bandStart) return (bandStart - rowIndex) * FRONT;
  if (rowIndex > bandEnd) return (rowIndex - bandEnd) * BACK;
  return 0;
};

// Every start index where `len` consecutive seats are all available.
const windowsOf = (row, len) => {
  const out = [];
  for (let s = 0; s + len <= row.length; s++) {
    if (row.slice(s, s + len).every((seat) => seat.status === "available")) out.push(s);
  }
  return out;
};

// Best single-row block by exhaustive scan; ties keep the earliest (row-major,
// then leftmost), which is the documented "first found wins" behavior.
const oracleBestSingle = (grid, n) => {
  const columns = Math.max(...grid.map((row) => row.length));
  const idealCenter = (1 + columns) / 2;
  let best = null;
  grid.forEach((row, r) => {
    for (const s of windowsOf(row, n)) {
      const center = (row[s].col + row[s + n - 1].col) / 2;
      const score = W_COL * Math.abs(center - idealCenter) + W_ROW * bandPenalty(r, grid.length);
      if (!best || score < best.score) {
        best = { seats: row.slice(s, s + n).map((seat) => seat.id), score };
      }
    }
  });
  return best;
};

// Whether ANY split exists under the documented rules: k >= 2 adjacent rows,
// the party divided as evenly as possible, each row's share a contiguous run.
const permutationsOf = (arr) =>
  arr.length <= 1
    ? [arr]
    : arr.flatMap((x, i) =>
        permutationsOf([...arr.slice(0, i), ...arr.slice(i + 1)]).map((rest) => [x, ...rest])
      );

const oracleSplitExists = (grid, n) => {
  for (let k = 2; k <= Math.min(n, grid.length); k++) {
    const base = Math.floor(n / k);
    const remainder = n % k;
    const lengths = [...Array(remainder).fill(base + 1), ...Array(k - remainder).fill(base)];
    const orderings = new Set(permutationsOf(lengths).map((p) => p.join(",")));
    for (let r = 0; r + k <= grid.length; r++) {
      for (const ordering of orderings) {
        const lens = ordering.split(",").map(Number);
        if (lens.every((len, i) => windowsOf(grid[r + i], len).length > 0)) return true;
      }
    }
  }
  return false;
};

// Small deterministic PRNG so "random" grids are identical on every run.
const mulberry32 = (seed) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const randomGrid = (rand, maxRows) => {
  const rows = 1 + Math.floor(rand() * maxRows);
  const cols = 2 + Math.floor(rand() * 9);
  const pAvailable = 0.5 + rand() * 0.45;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      makeSeat(
        String.fromCharCode(65 + r),
        c + 1,
        rand() < pAvailable ? "available" : rand() < 0.5 ? "booked" : "unavailable"
      )
    )
  );
};

const SEED = 20260927;
const GRIDS = 2000;

describe("recommendSeats: Phase 1 equals an independent brute-force optimum on random grids", () => {
  it(`matches the exhaustive scan — exact seats, exact score, same tie-break — across ${GRIDS} seeded grids, and only ever returns 'single' when a block exists`, () => {
    const rand = mulberry32(SEED);
    let withBlock = 0;

    for (let i = 0; i < GRIDS; i++) {
      const grid = randomGrid(rand, 6);
      const n = 1 + Math.floor(rand() * 7);
      const engine = recommendSeats(grid, n);
      const oracle = oracleBestSingle(grid, n);

      if (oracle) {
        withBlock++;
        expect(engine?.type, `grid #${i}, n=${n}`).toBe("single");
        expect(engine.seats, `grid #${i}, n=${n}`).toEqual(oracle.seats);
        expect(engine.score).toBeCloseTo(oracle.score, 9);
      } else {
        expect(engine?.type, `grid #${i}, n=${n}: no single block exists`).not.toBe("single");
      }
    }

    // Guard against a vacuous pass (e.g. a generator that never yields a block).
    expect(withBlock).toBeGreaterThan(GRIDS * 0.4);
  });
});

// Phase 2 (splits) is a heuristic: each row picks the window nearest ONE shared
// anchor column, which is NOT exhaustive. Measured against a brute-force
// optimum over 4,564 random split scenarios it was optimal 99.4% of the time;
// the other 0.6% were 3-5-row splits costing 1-2 points more than the best
// possible. That is consistent with how the code describes itself ("every
// plausible shared anchor"), so optimality is deliberately NOT asserted for
// splits here — that assertion would be false. What always holds, and is
// pinned below, is that every answer is valid and one exists whenever one can.
describe("recommendSeats: every answer is valid, and null means genuinely no arrangement (random grids)", () => {
  it(`holds across ${GRIDS} seeded grids (<= 5 rows, so the documented 6-row permutation cutoff can't apply)`, () => {
    const rand = mulberry32(SEED + 1);
    let splits = 0;

    for (let i = 0; i < GRIDS; i++) {
      const grid = randomGrid(rand, 5);
      const n = 1 + Math.floor(rand() * 7);
      const engine = recommendSeats(grid, n);
      const label = `grid #${i}, n=${n}`;

      const arrangementExists = oracleBestSingle(grid, n) !== null || oracleSplitExists(grid, n);
      expect(engine !== null, label).toBe(arrangementExists);
      if (engine === null) continue;

      // Exactly n distinct seats, every one available in the grid it was given.
      expect(new Set(engine.seats).size, label).toBe(n);
      expect(engine.seats, label).toHaveLength(n);
      const statusById = new Map(grid.flat().map((seat) => [seat.id, seat.status]));
      for (const id of engine.seats) expect(statusById.get(id), `${label} ${id}`).toBe("available");
      expect(Number.isFinite(engine.score), label).toBe(true);

      // Group by row: each row's share must be a contiguous run of columns.
      const byRow = new Map();
      for (const id of engine.seats) {
        const row = id[0];
        byRow.set(row, [...(byRow.get(row) ?? []), Number(id.slice(1))].sort((a, b) => a - b));
      }
      for (const [row, cols] of byRow) {
        expect(cols[cols.length - 1] - cols[0] + 1, `${label} row ${row} contiguous`).toBe(cols.length);
      }

      if (engine.type === "single") {
        expect(byRow.size, label).toBe(1);
      } else {
        splits++;
        expect(engine.type, label).toBe("split");
        // No single block could have been used (Phase 1 priority)...
        expect(oracleBestSingle(grid, n), label).toBeNull();
        // ...the rows form an adjacent run...
        const rowCodes = [...byRow.keys()].map((letter) => letter.charCodeAt(0)).sort((a, b) => a - b);
        expect(rowCodes[rowCodes.length - 1] - rowCodes[0] + 1, `${label} adjacent rows`).toBe(rowCodes.length);
        // ...and the party is spread as evenly as possible.
        const sizes = [...byRow.values()].map((cols) => cols.length);
        expect(Math.max(...sizes) - Math.min(...sizes), `${label} even spread`).toBeLessThanOrEqual(1);
      }
    }

    // Guard against a vacuous pass.
    expect(splits).toBeGreaterThan(20);
  });
});
