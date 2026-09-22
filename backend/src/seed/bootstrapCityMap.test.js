import { describe, it, expect } from "vitest";
import { bootstrapEveryMovieInEveryCity } from "./bootstrapCityMap.js";

// The bug this guards against: seedCatalog infers a movie's cities from
// existing showtimes, so against an empty database it inferred nothing,
// skipped every movie, and produced a catalogue with no showtimes at all —
// movies and theaters, but nothing a user could actually book.
const movie = (id) => ({ _id: id });
const theater = (city) => ({ location: { city } });

describe("bootstrapEveryMovieInEveryCity", () => {
  it("pairs every movie with every city, so a fresh seed has something bookable", () => {
    const map = bootstrapEveryMovieInEveryCity(
      [movie("m1"), movie("m2")],
      [theater("Bengaluru"), theater("Mumbai")]
    );

    expect(map.size).toBe(2);
    expect([...map.get("m1")]).toEqual(["Bengaluru", "Mumbai"]);
    expect([...map.get("m2")]).toEqual(["Bengaluru", "Mumbai"]);
  });

  it("keys by string id, which is how seedShowtimesForMovies looks them up", () => {
    // ObjectId-like: a real Mongoose _id is an object whose toString() is the hex id.
    const objectIdish = { toString: () => "507f1f77bcf86cd799439011" };
    const map = bootstrapEveryMovieInEveryCity([{ _id: objectIdish }], [theater("Delhi")]);

    expect(map.has("507f1f77bcf86cd799439011")).toBe(true);
  });

  it("de-duplicates cities when several theaters share one", () => {
    const map = bootstrapEveryMovieInEveryCity(
      [movie("m1")],
      [theater("Pune"), theater("Pune"), theater("Chennai")]
    );

    expect([...map.get("m1")].sort()).toEqual(["Chennai", "Pune"]);
  });

  it("ignores theaters with no city rather than producing an undefined key", () => {
    const map = bootstrapEveryMovieInEveryCity(
      [movie("m1")],
      [theater("Kolkata"), { location: {} }, {}]
    );

    expect([...map.get("m1")]).toEqual(["Kolkata"]);
  });

  it("returns an empty map when there are no movies", () => {
    expect(bootstrapEveryMovieInEveryCity([], [theater("Jaipur")]).size).toBe(0);
  });
});
