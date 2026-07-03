import { describe, it, expect } from "vitest";
import { buildSeatGrid } from "./buildSeatGrid.js";

describe("buildSeatGrid", () => {
  it("generates row letters and seat ids from rows/columns", () => {
    const grid = buildSeatGrid({ rows: 2, columns: 3 });

    expect(grid).toHaveLength(2);
    expect(grid[0]).toHaveLength(3);
    expect(grid[0].map((s) => s.id)).toEqual(["A1", "A2", "A3"]);
    expect(grid[1].map((s) => s.id)).toEqual(["B1", "B2", "B3"]);
    expect(grid[0][0]).toMatchObject({ id: "A1", row: "A", col: 1 });
  });

  it("maps each row to its category via seatCategories", () => {
    const grid = buildSeatGrid({
      rows: 3,
      columns: 2,
      seatCategories: [
        { category: "premium", rows: ["A"] },
        { category: "regular", rows: ["B", "C"] },
      ],
    });

    expect(grid[0].every((s) => s.category === "premium")).toBe(true);
    expect(grid[1].every((s) => s.category === "regular")).toBe(true);
    expect(grid[2].every((s) => s.category === "regular")).toBe(true);
  });

  it("falls back to 'regular' for rows not covered by any seatCategory", () => {
    const grid = buildSeatGrid({
      rows: 2,
      columns: 1,
      seatCategories: [{ category: "premium", rows: ["A"] }],
    });

    expect(grid[0][0].category).toBe("premium");
    expect(grid[1][0].category).toBe("regular");
  });

  it("marks seats listed in unavailableSeats as unavailable", () => {
    const grid = buildSeatGrid({
      rows: 2,
      columns: 3,
      unavailableSeats: ["A2", "B1"],
    });

    const byId = Object.fromEntries(grid.flat().map((s) => [s.id, s]));
    expect(byId.A2.status).toBe("unavailable");
    expect(byId.B1.status).toBe("unavailable");
    expect(byId.A1.status).toBe("available");
    expect(byId.A3.status).toBe("available");
  });

  it("marks seats in the bookedSeats set as booked", () => {
    const grid = buildSeatGrid(
      { rows: 1, columns: 3 },
      new Set(["A1", "A3"])
    );

    const byId = Object.fromEntries(grid[0].map((s) => [s.id, s]));
    expect(byId.A1.status).toBe("booked");
    expect(byId.A2.status).toBe("available");
    expect(byId.A3.status).toBe("booked");
  });

  it("treats unavailableSeats as taking precedence over bookedSeats for the same id", () => {
    const grid = buildSeatGrid(
      { rows: 1, columns: 1, unavailableSeats: ["A1"] },
      new Set(["A1"])
    );

    expect(grid[0][0].status).toBe("unavailable");
  });

  it("defaults to an empty bookedSeats set, leaving all seats available/unavailable only", () => {
    const grid = buildSeatGrid({ rows: 1, columns: 2, unavailableSeats: ["A1"] });

    expect(grid[0][0].status).toBe("unavailable");
    expect(grid[0][1].status).toBe("available");
  });

  it("returns an empty grid for a layout with zero rows or columns", () => {
    expect(buildSeatGrid({ rows: 0, columns: 5 })).toEqual([]);
    expect(buildSeatGrid({ rows: 3, columns: 0 })[0]).toEqual([]);
  });
});
