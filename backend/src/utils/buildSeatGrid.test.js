import { describe, it, expect } from "vitest";
import { buildSeatGrid } from "./buildSeatGrid.js";

// Smoke tests only — this is a port of frontend/src/utils/buildSeatGrid.js,
// already covered by that file's full test suite. These just guard against
// transcription mistakes now that the API layer depends on this copy too.
describe("buildSeatGrid (backend)", () => {
  it("generates row letters and seat ids from rows/columns", () => {
    const grid = buildSeatGrid({ rows: 2, columns: 3 });
    expect(grid[0].map((s) => s.id)).toEqual(["A1", "A2", "A3"]);
    expect(grid[1].map((s) => s.id)).toEqual(["B1", "B2", "B3"]);
  });

  it("maps rows to categories and marks unavailable seats", () => {
    const grid = buildSeatGrid({
      rows: 2,
      columns: 2,
      seatCategories: [{ category: "premium", rows: ["A"] }],
      unavailableSeats: ["A1"],
    });

    expect(grid[0][0].status).toBe("unavailable");
    expect(grid[0][1].category).toBe("premium");
    expect(grid[1][0].category).toBe("regular");
  });

  it("marks booked seats from the given Set, defaulting to none", () => {
    const grid = buildSeatGrid({ rows: 1, columns: 2 }, new Set(["A1"]));
    expect(grid[0][0].status).toBe("booked");
    expect(grid[0][1].status).toBe("available");
    expect(buildSeatGrid({ rows: 1, columns: 1 })[0][0].status).toBe("available");
  });
});
