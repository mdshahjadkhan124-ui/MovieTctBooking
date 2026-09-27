import "dotenv/config";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectDB } from "../config/db.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { Booking } from "../models/Booking.js";
import { User } from "../models/User.js";
import { rescheduleShowtimes } from "./rescheduleShowtimes.js";

const runId = Date.now();

let movie;
let theater;
let demoUser;
let realUser;

// One screen per scenario, so each showtime's own screen-scoped
// collision-avoidance group is independent and each scenario's outcome
// can't be muddied by another's slot assignment.
let screenDemoOnly;
let screenRealOnly;
let screenMix;

let showtimeDemoOnly;
let showtimeRealOnly;
let showtimeMix;

const staleStart = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  await connectDB();

  movie = await Movie.create({ title: `Reschedule Test Movie ${runId}`, durationMinutes: 100 });
  theater = await Theater.create({
    name: `Reschedule Test Theater ${runId}`,
    location: { city: "Testville" },
    timezone: "Asia/Kolkata",
  });

  demoUser = await User.create({
    name: "Reschedule Demo Viewer",
    email: `reschedule-demo-${runId}@seed.local`,
    password: "DemoPass123!",
    isSeedDemo: true,
  });
  realUser = await User.create({
    name: "Reschedule Real Visitor",
    email: `reschedule-real-${runId}@example.com`,
    password: "password123",
  });

  screenDemoOnly = await Screen.create({
    theater: theater._id,
    name: "Reschedule Screen Demo-Only",
    layout: { rows: 2, columns: 5 },
  });
  screenRealOnly = await Screen.create({
    theater: theater._id,
    name: "Reschedule Screen Real-Only",
    layout: { rows: 2, columns: 5 },
  });
  screenMix = await Screen.create({
    theater: theater._id,
    name: "Reschedule Screen Mixed",
    layout: { rows: 2, columns: 5 },
  });

  const mk = (screenId) =>
    Showtime.create({
      movie: movie._id,
      screen: screenId,
      theater: theater._id,
      startTime: staleStart(),
      endTime: new Date(staleStart().getTime() + 2 * 60 * 60 * 1000),
      price: 200,
      format: "2D",
    });

  showtimeDemoOnly = await mk(screenDemoOnly._id);
  showtimeRealOnly = await mk(screenRealOnly._id);
  showtimeMix = await mk(screenMix._id);

  await Booking.create([
    {
      user: demoUser._id,
      showtime: showtimeDemoOnly._id,
      theater: theater._id,
      seatIds: ["A1"],
      amount: 200,
      status: "confirmed",
    },
    {
      user: demoUser._id,
      showtime: showtimeDemoOnly._id,
      theater: theater._id,
      seatIds: ["A2"],
      amount: 200,
      status: "cancelled",
    },
    {
      user: realUser._id,
      showtime: showtimeRealOnly._id,
      theater: theater._id,
      seatIds: ["A1"],
      amount: 200,
      status: "confirmed",
    },
    {
      user: demoUser._id,
      showtime: showtimeMix._id,
      theater: theater._id,
      seatIds: ["A1"],
      amount: 200,
      status: "confirmed",
    },
    {
      user: realUser._id,
      showtime: showtimeMix._id,
      theater: theater._id,
      seatIds: ["A2"],
      amount: 200,
      status: "confirmed",
    },
  ]);
}, 30000);

afterAll(async () => {
  const showtimeIds = [showtimeDemoOnly._id, showtimeRealOnly._id, showtimeMix._id];
  await Booking.deleteMany({ showtime: { $in: showtimeIds } });
  await Showtime.deleteMany({ _id: { $in: showtimeIds } });
  await Screen.deleteMany({ _id: { $in: [screenDemoOnly._id, screenRealOnly._id, screenMix._id] } });
  await Theater.deleteOne({ _id: theater._id });
  await Movie.deleteOne({ _id: movie._id });
  await User.deleteMany({ _id: { $in: [demoUser._id, realUser._id] } });
  await mongoose.disconnect();
});

describe("rescheduleShowtimes: the isSeedDemo boundary", () => {
  it("rolls forward a showtime whose only bookings are from demo users, and its bookings move with it (still reference the same showtime, unduplicated)", async () => {
    const before = await Showtime.findById(showtimeDemoOnly._id);
    expect(before.startTime.getTime()).toBeLessThan(Date.now()); // sanity: fixture really is stale

    await rescheduleShowtimes({ theater: theater._id });

    const after = await Showtime.findById(showtimeDemoOnly._id);
    expect(after.startTime.getTime()).toBeGreaterThan(Date.now());
    expect(after.startTime.getTime()).not.toBe(before.startTime.getTime());

    // "moves with it": the bookings still reference this showtime (by id,
    // the only link there is — see models/Booking.js) and are still
    // exactly the two seeded, not duplicated or dropped.
    const bookings = await Booking.find({ showtime: showtimeDemoOnly._id });
    expect(bookings).toHaveLength(2);
    expect(bookings.map((b) => b.seatIds[0]).sort()).toEqual(["A1", "A2"]);
  });

  it("leaves a showtime with a real booking untouched", async () => {
    const before = await Showtime.findById(showtimeRealOnly._id);

    await rescheduleShowtimes({ theater: theater._id });

    const after = await Showtime.findById(showtimeRealOnly._id);
    expect(after.startTime.getTime()).toBe(before.startTime.getTime());
    expect(after.startTime.getTime()).toBeLessThan(Date.now()); // still stale — untouched, not just "still valid"
  });

  it("leaves a showtime with a real+demo mix untouched — real tickets always win", async () => {
    const before = await Showtime.findById(showtimeMix._id);

    await rescheduleShowtimes({ theater: theater._id });

    const after = await Showtime.findById(showtimeMix._id);
    expect(after.startTime.getTime()).toBe(before.startTime.getTime());
  });

  it("is idempotent: running it twice more produces no further change and no duplicate bookings", async () => {
    const afterFirst = await Showtime.findById(showtimeDemoOnly._id);

    const stats1 = await rescheduleShowtimes({ theater: theater._id });
    const stats2 = await rescheduleShowtimes({ theater: theater._id });

    const afterRepeat = await Showtime.findById(showtimeDemoOnly._id);
    expect(afterRepeat.startTime.getTime()).toBe(afterFirst.startTime.getTime());

    // This run's own demo-only showtime already landed in its slot before
    // this test (the earlier test in this file rescheduled it); both calls
    // here should find nothing left to move for it.
    expect(stats1.rescheduled).toBe(0);
    expect(stats2.rescheduled).toBe(0);

    const bookings = await Booking.find({ showtime: showtimeDemoOnly._id });
    expect(bookings).toHaveLength(2);
  });
});
