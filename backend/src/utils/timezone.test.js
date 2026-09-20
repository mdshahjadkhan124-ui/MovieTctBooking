import { describe, it, expect } from "vitest";
import { zonedWeekdayAndHour, zonedDayRange, DEFAULT_TIMEZONE } from "./timezone.js";

describe("zonedWeekdayAndHour", () => {
  it("reads the wall-clock hour in the theater's timezone, not the server's", () => {
    // 13:30 UTC is 19:00 in Kolkata (+5:30) — prime time there, afternoon in UTC.
    const instant = new Date("2026-09-16T13:30:00Z"); // a Wednesday
    expect(zonedWeekdayAndHour(instant, "Asia/Kolkata")).toEqual({
      weekday: "Wed",
      hour: 19,
      isWeekend: false,
    });
    expect(zonedWeekdayAndHour(instant, "UTC").hour).toBe(13);
  });

  it("reports the weekday of the theater's own day, even across the date line of midnight", () => {
    // Friday 20:00 UTC is already Saturday 01:30 in Kolkata.
    const instant = new Date("2026-09-18T20:00:00Z");
    expect(zonedWeekdayAndHour(instant, "UTC")).toMatchObject({ weekday: "Fri", isWeekend: false });
    expect(zonedWeekdayAndHour(instant, "Asia/Kolkata")).toMatchObject({
      weekday: "Sat",
      hour: 1,
      isWeekend: true,
    });
  });

  it("treats midnight as hour 0, not 24", () => {
    expect(zonedWeekdayAndHour(new Date("2026-09-16T18:30:00Z"), "Asia/Kolkata").hour).toBe(0);
  });

  it("defaults to the app's timezone", () => {
    const instant = new Date("2026-09-16T13:30:00Z");
    expect(zonedWeekdayAndHour(instant)).toEqual(zonedWeekdayAndHour(instant, DEFAULT_TIMEZONE));
  });
});

describe("zonedDayRange", () => {
  it("spans the theater's calendar day, in UTC instants", () => {
    const { start, end } = zonedDayRange("2026-09-19", "Asia/Kolkata");
    // Kolkata midnight is 18:30 UTC the previous day.
    expect(start.toISOString()).toBe("2026-09-18T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-09-19T18:30:00.000Z");
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });

  it("matches UTC midnights when the zone is UTC", () => {
    const { start, end } = zonedDayRange("2026-09-19", "UTC");
    expect(start.toISOString()).toBe("2026-09-19T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });

  it("handles a zone that observes DST", () => {
    // New York is UTC-4 in July (EDT).
    const { start, end } = zonedDayRange("2026-07-15", "America/New_York");
    expect(start.toISOString()).toBe("2026-07-15T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-07-16T04:00:00.000Z");
  });

  it("includes a showtime at the very start of the day and excludes the next day's", () => {
    const { start, end } = zonedDayRange("2026-09-19", "Asia/Kolkata");
    const firstShow = new Date("2026-09-19T00:05:00+05:30");
    const nextDayShow = new Date("2026-09-20T00:05:00+05:30");
    expect(firstShow >= start && firstShow < end).toBe(true);
    expect(nextDayShow >= end).toBe(true);
  });
});
