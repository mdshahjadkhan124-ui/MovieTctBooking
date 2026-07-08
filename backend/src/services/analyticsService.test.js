import "dotenv/config";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectDB } from "../config/db.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { Booking } from "../models/Booking.js";
import * as analyticsService from "./analyticsService.js";

let movie1, movie2, movie3;
let theater1, theater2, theater3;
let screen1, screen2, screen3;
let showtime1, showtime2, showtime3, showtime4;
let baseline; // super_admin snapshot taken BEFORE this file's fixtures exist
const userId = new mongoose.Types.ObjectId();

const superAdmin = { role: "super_admin" };
const theaterAdminFor = (theaterId) => ({ role: "theater_admin", theater: theaterId });

beforeAll(async () => {
  await connectDB();

  // This is a shared dev database, not an isolated test DB — earlier
  // sprints' real bookings are still in it. A super_admin's view is
  // deliberately global/unscoped, so its tests below compare against this
  // pre-fixture baseline (delta, not an exact total) rather than assuming
  // an empty collection. The theater_admin tests don't need this: they're
  // scoped to theater ids that only exist in this file, so nothing else in
  // the shared DB can leak into them.
  baseline = await analyticsService.getAnalytics(superAdmin);

  movie1 = await Movie.create({ title: "Analytics Movie 1", durationMinutes: 100 });
  movie2 = await Movie.create({ title: "Analytics Movie 2", durationMinutes: 110 });
  movie3 = await Movie.create({ title: "Analytics Movie 3", durationMinutes: 120 });

  theater1 = await Theater.create({ name: "Analytics Theater 1", location: { city: "Testville" } });
  theater2 = await Theater.create({ name: "Analytics Theater 2", location: { city: "Testville" } });
  theater3 = await Theater.create({ name: "Analytics Theater 3 (peak-hours only)", location: { city: "Testville" } });

  // 2x2 = 4 real seats (A1, A2, B1, B2) on every screen used here.
  screen1 = await Screen.create({ theater: theater1._id, name: "Screen 1", layout: { rows: 2, columns: 2 } });
  screen2 = await Screen.create({ theater: theater2._id, name: "Screen 2", layout: { rows: 2, columns: 2 } });
  screen3 = await Screen.create({ theater: theater3._id, name: "Screen 3", layout: { rows: 2, columns: 2 } });

  const future = (h) => new Date(Date.now() + h * 60 * 60 * 1000);
  showtime1 = await Showtime.create({ movie: movie1._id, screen: screen1._id, theater: theater1._id, startTime: future(10), price: 100 });
  showtime2 = await Showtime.create({ movie: movie2._id, screen: screen1._id, theater: theater1._id, startTime: future(20), price: 100 });
  showtime3 = await Showtime.create({ movie: movie3._id, screen: screen2._id, theater: theater2._id, startTime: future(10), price: 100 });
  showtime4 = await Showtime.create({ movie: movie1._id, screen: screen3._id, theater: theater3._id, startTime: future(10), price: 100 });

  await Booking.create([
    // Theater 1 / showtime1 (movie1): 2 confirmed bookings, 3 seats booked, 1 cancelled
    { user: userId, showtime: showtime1._id, theater: theater1._id, seatIds: ["A1", "A2"], amount: 100, status: "confirmed" },
    { user: userId, showtime: showtime1._id, theater: theater1._id, seatIds: ["B1"], amount: 150, status: "confirmed" },
    { user: userId, showtime: showtime1._id, theater: theater1._id, seatIds: ["B2"], amount: 80, status: "cancelled", refundAmount: 40 },
    // Theater 1 / showtime2 (movie2): 1 confirmed booking, 1 seat booked
    { user: userId, showtime: showtime2._id, theater: theater1._id, seatIds: ["A1"], amount: 200, status: "confirmed" },
    // Theater 2 / showtime3 (movie3): 1 confirmed booking, 3 seats booked
    { user: userId, showtime: showtime3._id, theater: theater2._id, seatIds: ["A1", "A2", "B1"], amount: 300, status: "confirmed" },
  ]);
}, 30000);

afterAll(async () => {
  const showtimeIds = [showtime1._id, showtime2._id, showtime3._id, showtime4._id];
  await Booking.deleteMany({ showtime: { $in: showtimeIds } });
  await Showtime.deleteMany({ _id: { $in: showtimeIds } });
  await Screen.deleteMany({ _id: { $in: [screen1._id, screen2._id, screen3._id] } });
  await Theater.deleteMany({ _id: { $in: [theater1._id, theater2._id, theater3._id] } });
  await Movie.deleteMany({ _id: { $in: [movie1._id, movie2._id, movie3._id] } });
  await mongoose.disconnect();
});

describe("analyticsService (super_admin — global view, compared as a delta against the pre-fixture baseline)", () => {
  it("sums confirmed revenue correctly and reports refunded/cancelled totals separately", async () => {
    const { revenue } = await analyticsService.getAnalytics(superAdmin);
    expect(revenue.confirmedRevenue - baseline.revenue.confirmedRevenue).toBe(100 + 150 + 200 + 300);
    expect(revenue.confirmedCount - baseline.revenue.confirmedCount).toBe(4);
    expect(revenue.cancelledCount - baseline.revenue.cancelledCount).toBe(1);
    expect(revenue.totalRefunded - baseline.revenue.totalRefunded).toBe(40);
  });

  it("orders top movies by booking count, then revenue as a tiebreaker (filtered to this file's own movies)", async () => {
    const { topMovies } = await analyticsService.getAnalytics(superAdmin);
    const mine = topMovies.filter((m) => m.title.startsWith("Analytics Movie"));
    // movie1: 2 bookings/250 revenue; movie3: 1 booking/300; movie2: 1 booking/200
    expect(mine.map((m) => m.title)).toEqual([
      "Analytics Movie 1",
      "Analytics Movie 3",
      "Analytics Movie 2",
    ]);
    expect(mine[0]).toMatchObject({ bookingCount: 2, revenue: 250 });
  });

  it("computes per-showtime occupancy (confirmed booked seats / real capacity) for this file's own theaters", async () => {
    const { occupancy } = await analyticsService.getAnalytics(superAdmin);
    // showtime1: 3/4 = 0.75, showtime2: 1/4 = 0.25, showtime3: 3/4 = 0.75,
    // showtime4: 0/4 = 0 (no bookings at all — still counts, not absent)
    const t1 = occupancy.byTheater.find((t) => t.theaterId.toString() === theater1._id.toString());
    const t2 = occupancy.byTheater.find((t) => t.theaterId.toString() === theater2._id.toString());
    const t3 = occupancy.byTheater.find((t) => t.theaterId.toString() === theater3._id.toString());
    expect(t1.avgOccupancy).toBeCloseTo((0.75 + 0.25) / 2, 5);
    expect(t2.avgOccupancy).toBeCloseTo(0.75, 5);
    expect(t3.avgOccupancy).toBeCloseTo(0, 5);
  });

  it("groups revenue and bookings by theater", async () => {
    const { theaterPerformance } = await analyticsService.getAnalytics(superAdmin);
    const t1 = theaterPerformance.find((t) => t.theaterId.toString() === theater1._id.toString());
    const t2 = theaterPerformance.find((t) => t.theaterId.toString() === theater2._id.toString());
    expect(t1).toMatchObject({ revenue: 450, bookingCount: 3 });
    expect(t2).toMatchObject({ revenue: 300, bookingCount: 1 });
  });
});

describe("analyticsService (theater_admin — scoped view, tightly isolated by dedicated theater ids)", () => {
  it("only sees its own theater's revenue and cancellation numbers", async () => {
    const { revenue } = await analyticsService.getAnalytics(theaterAdminFor(theater1._id));
    expect(revenue.confirmedRevenue).toBe(100 + 150 + 200);
    expect(revenue.confirmedCount).toBe(3);
    expect(revenue.cancelledCount).toBe(1);
    expect(revenue.cancellationRate).toBeCloseTo(1 / 4, 5);
  });

  it("only sees its own theater's top movies — another theater's movie never appears", async () => {
    const { topMovies } = await analyticsService.getAnalytics(theaterAdminFor(theater1._id));
    const titles = topMovies.map((m) => m.title);
    expect(titles).toContain("Analytics Movie 1");
    expect(titles).toContain("Analytics Movie 2");
    expect(titles).not.toContain("Analytics Movie 3");
  });

  it("only sees its own theater's occupancy and theater-performance rows", async () => {
    const { occupancy, theaterPerformance } = await analyticsService.getAnalytics(
      theaterAdminFor(theater1._id)
    );
    expect(occupancy.overall.showtimeCount).toBe(2);
    expect(occupancy.byTheater).toHaveLength(1);
    expect(occupancy.byTheater[0].theaterId.toString()).toBe(theater1._id.toString());

    expect(theaterPerformance).toHaveLength(1);
    expect(theaterPerformance[0]).toMatchObject({ revenue: 450, bookingCount: 3 });
  });

  it("a theater_admin for a different theater gets entirely different numbers", async () => {
    const scopedT1 = await analyticsService.getAnalytics(theaterAdminFor(theater1._id));
    const scopedT2 = await analyticsService.getAnalytics(theaterAdminFor(theater2._id));
    expect(scopedT2.revenue.confirmedRevenue).toBe(300);
    expect(scopedT2.revenue.confirmedRevenue).not.toBe(scopedT1.revenue.confirmedRevenue);
    expect(scopedT2.topMovies.map((m) => m.title)).toEqual(["Analytics Movie 3"]);
  });
});

describe("analyticsService: peak booking times", () => {
  it("groups confirmed bookings by hour-of-day they were made (UTC, matching $hour's default), zero-filling empty hours", async () => {
    const bookings = await Booking.create([
      { user: userId, showtime: showtime4._id, theater: theater3._id, seatIds: ["A1"], amount: 100, status: "confirmed" },
      { user: userId, showtime: showtime4._id, theater: theater3._id, seatIds: ["A2"], amount: 100, status: "confirmed" },
      { user: userId, showtime: showtime4._id, theater: theater3._id, seatIds: ["B1"], amount: 100, status: "confirmed" },
    ]);

    // Force distinct, known UTC hours (setUTCHours, not setHours — $hour
    // operates on UTC by default regardless of the server's local timezone)
    // so this assertion never depends on wherever the suite happens to run.
    // Goes through the native driver (Booking.collection, not Booking.
    // updateOne) because Mongoose's timestamps plugin otherwise treats
    // createdAt as set-once and silently drops it from a $set update.
    const setUtcHour = (id, hour) => {
      const d = new Date();
      d.setUTCHours(hour, 0, 0, 0);
      return Booking.collection.updateOne({ _id: id }, { $set: { createdAt: d } });
    };
    await Promise.all([
      setUtcHour(bookings[0]._id, 9),
      setUtcHour(bookings[1]._id, 9),
      setUtcHour(bookings[2]._id, 21),
    ]);

    const { peakBookingTimes } = await analyticsService.getAnalytics(theaterAdminFor(theater3._id));
    expect(peakBookingTimes).toHaveLength(24);
    expect(peakBookingTimes.find((h) => h.hour === 9).count).toBe(2);
    expect(peakBookingTimes.find((h) => h.hour === 21).count).toBe(1);
    expect(peakBookingTimes.find((h) => h.hour === 3).count).toBe(0);
  });
});
