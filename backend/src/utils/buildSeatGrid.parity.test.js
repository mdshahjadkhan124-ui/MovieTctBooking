import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeatGrid as backendBuildSeatGrid } from "./buildSeatGrid.js";
// Reaching into the frontend is fine HERE: test files are never bundled or
// deployed, so this crosses a boundary the shipped code can't.
import { buildSeatGrid as frontendBuildSeatGrid } from "../../../frontend/src/utils/buildSeatGrid.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SOURCE = path.join(here, "buildSeatGrid.js");
const FRONTEND_COPY = path.join(here, "..", "..", "..", "frontend", "src", "utils", "buildSeatGrid.js");

// The seat map a user clicks and the grid the recommendation engine scores
// must agree exactly; they live in two files because the apps deploy from
// separate roots (see backend/scripts/syncSharedCode.js). These tests are
// what stop the copies drifting.
const layouts = [
  { rows: 8, columns: 12, seatCategories: [{ category: "Premium", rows: ["A", "B"] }] },
  { rows: 3, columns: 5, unavailableSeats: ["A1", "B3"] },
  { rows: 1, columns: 1 },
  { rows: 0, columns: 0 },
  {
    rows: 5,
    columns: 6,
    seatCategories: [
      { category: "Premium", rows: ["A"] },
      { category: "Recliner", rows: ["E"] },
    ],
    unavailableSeats: ["C3", "E6"],
  },
];

describe("buildSeatGrid stays identical across backend and frontend", () => {
  it("the frontend copy is in sync with the backend source (run `npm run sync:shared`)", () => {
    const source = fs.readFileSync(BACKEND_SOURCE, "utf8");
    const copy = fs.readFileSync(FRONTEND_COPY, "utf8");
    // The copy is the source plus a generated banner.
    expect(copy.endsWith(source)).toBe(true);
    expect(copy).toContain("GENERATED FILE");
  });

  it.each(layouts.map((layout, i) => [i, layout]))(
    "produces the same grid for layout %i",
    (_i, layout) => {
      expect(frontendBuildSeatGrid(layout)).toEqual(backendBuildSeatGrid(layout));
    }
  );

  it("marks booked seats identically", () => {
    const layout = { rows: 4, columns: 4, unavailableSeats: ["A1"] };
    const booked = new Set(["B2", "C3", "A1"]);
    expect(frontendBuildSeatGrid(layout, booked)).toEqual(backendBuildSeatGrid(layout, booked));
  });

  it("handles a missing layout the same way", () => {
    expect(frontendBuildSeatGrid(undefined)).toEqual(backendBuildSeatGrid(undefined));
  });
});
