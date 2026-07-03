import { describe, it, expect } from "vitest";
import { recommendSeats } from "./seatRecommendation.js";

const makeSeat = (row, col, status = "available") => ({
  id: `${row}${col}`,
  row,
  col,
  category: "regular",
  status,
});

// Build a single row of `length` seats, all available except columns listed
// in `overrides` (a map of col -> status).
const makeRow = (rowLetter, length, overrides = {}) => {
  const row = [];
  for (let c = 1; c <= length; c++) {
    row.push(makeSeat(rowLetter, c, overrides[c] ?? "available"));
  }
  return row;
};

describe("recommendSeats", () => {
  it("single row exact fit: n equals the whole row", () => {
    const grid = [makeRow("A", 5)];
    const result = recommendSeats(grid, 5);

    expect(result.type).toBe("single");
    expect(result.seats).toEqual(["A1", "A2", "A3", "A4", "A5"]);
  });

  it("picks the center window over an edge window in a single row", () => {
    // 11 columns, ideal center = col 6. n=3 -> the only zero-penalty window
    // is cols 5-7 (center exactly 6), beating edge windows like cols 1-3.
    const grid = [makeRow("A", 11)];
    const result = recommendSeats(grid, 3);

    expect(result.type).toBe("single");
    expect(result.seats).toEqual(["A5", "A6", "A7"]);
  });

  it("avoids a front row in favor of a center-band row", () => {
    // 9 rows (A..I), 1 seat each. Ideal band (middle third) = rows D,E,F
    // (indices 3-5). Front row A should never be picked when a banded row
    // is equally available.
    const grid = ["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((r) => makeRow(r, 1));
    const result = recommendSeats(grid, 1);

    expect(result.type).toBe("single");
    expect(result.seats[0]).not.toMatch(/^A/);
    expect(result.seats[0][0]).toMatch(/[DEF]/);
  });

  it("a booked seat breaks contiguity, forcing a smaller valid window around it", () => {
    // 7 columns, col4 booked (mid-row). n=3 can't cross col4, so the only
    // valid windows are cols1-3 and cols5-7 (tied score) — first found wins.
    const grid = [makeRow("A", 7, { 4: "booked" })];
    const result = recommendSeats(grid, 3);

    expect(result.type).toBe("single");
    expect(result.seats).toEqual(["A1", "A2", "A3"]);
    // Confirm the booked seat itself is never included in any recommendation.
    expect(result.seats).not.toContain("A4");
  });

  it("falls back to a split when n is larger than any single row", () => {
    // 3 rows of 5 seats each, all available. n=8 can't fit in any one row
    // (max 5), so it must split across exactly 2 adjacent rows (4+4).
    const grid = [makeRow("A", 5), makeRow("B", 5), makeRow("C", 5)];
    const result = recommendSeats(grid, 8);

    expect(result.type).toBe("split");
    expect(result.seats).toHaveLength(8);

    const rowsUsed = new Set(result.seats.map((id) => id[0]));
    expect(rowsUsed.size).toBe(2); // exactly 2 rows, not 3 — smallest k preferred
    for (const r of rowsUsed) {
      expect(["A", "B", "C"]).toContain(r);
    }
  });

  it("splits minimizing spread: prefers cross-row alignment over each row's own best center", () => {
    // 10 columns (ideal center = col 5.5). Neither row can solo-satisfy n=4
    // (each row's longest run is only 2 seats), so this genuinely requires
    // Phase 2. n=4 across 2 rows -> lengths [2,2].
    //
    // Row A has two 2-seat runs: cols 1-2 and cols 7-8. In isolation, row A's
    // *own* best-centered pick would be cols 7-8 (distance 2 from center)
    // over cols 1-2 (distance 4). Row B has only one run: cols 1-2 — its only
    // option, regardless of what row A does.
    //
    // If row A greedily picked its own best window (cols 7-8) while row B is
    // stuck at cols 1-2, the two windows would be 6 columns apart (high
    // spread). The tightly-aligned choice — row A ALSO taking cols 1-2 to
    // match row B — has a worse per-row center score but zero spread, and
    // should win once spread is weighted in.
    const rowAOverrides = { 3: "unavailable", 4: "unavailable", 5: "unavailable", 6: "unavailable", 9: "unavailable", 10: "unavailable" };
    const rowBOverrides = { 3: "unavailable", 4: "unavailable", 5: "unavailable", 6: "unavailable", 7: "unavailable", 8: "unavailable", 9: "unavailable", 10: "unavailable" };
    const grid = [makeRow("A", 10, rowAOverrides), makeRow("B", 10, rowBOverrides)];
    const result = recommendSeats(grid, 4);

    expect(result.type).toBe("split");
    expect(result.seats.sort()).toEqual(["A1", "A2", "B1", "B2"].sort());
  });

  it("returns null when n seats genuinely cannot be seated", () => {
    // Single row, single seat available out of 5 — no single-row window and
    // not enough rows to split across (only 1 row total).
    const grid = [makeRow("A", 5, { 1: "unavailable", 2: "unavailable", 4: "unavailable", 5: "unavailable" })];
    const result = recommendSeats(grid, 2);

    expect(result).toBeNull();
  });

  it("handles n=1 (a single seat request)", () => {
    const grid = [makeRow("A", 3, { 2: "booked" })];
    const result = recommendSeats(grid, 1);

    expect(result.type).toBe("single");
    expect(result.seats).toHaveLength(1);
    expect(["A1", "A3"]).toContain(result.seats[0]);
  });

  it("handles requesting a full row exactly", () => {
    const grid = [makeRow("A", 8), makeRow("B", 8)];
    const result = recommendSeats(grid, 8);

    expect(result.type).toBe("single");
    expect(result.seats).toHaveLength(8);
    expect(new Set(result.seats.map((id) => id[0])).size).toBe(1); // all one row
  });

  it("returns null for invalid input (n <= 0, non-integer n, or empty grid)", () => {
    expect(recommendSeats([makeRow("A", 5)], 0)).toBeNull();
    expect(recommendSeats([makeRow("A", 5)], -1)).toBeNull();
    expect(recommendSeats([makeRow("A", 5)], 2.5)).toBeNull();
    expect(recommendSeats([], 1)).toBeNull();
  });
});
