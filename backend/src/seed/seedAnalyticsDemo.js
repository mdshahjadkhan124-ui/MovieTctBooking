// OPT-IN DEMO SEED — not run automatically by the app or any other script.
// Run manually with `npm run seed:analytics-demo` (from backend/) only when
// you want the Analytics dashboard to look populated for a demo. Generates
// synthetic Bookings (confirmed + a slice of cancelled) spread across the
// last 30 days and across hours of the day, against the REAL catalog
// (movies/theaters/screens/showtimes) `seed:catalog` already created — it
// never invents its own movies/theaters, so it can't diverge from what's
// actually browsable in the app. Booked seats go under a handful of
// clearly-labeled demo users, never a real signed-up account.
import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Showtime } from "../models/Showtime.js";
import "../models/Screen.js"; // registers the Screen schema for .populate("screen") below
import { User } from "../models/User.js";
import { Booking } from "../models/Booking.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";

const DEMO_USER_COUNT = 5;
const CANCELLATION_CHANCE = 0.12;
const DAYS_OF_HISTORY = 30;

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randomInt(0, arr.length - 1)];

const ensureDemoUsers = async () => {
  const users = [];
  for (let i = 1; i <= DEMO_USER_COUNT; i++) {
    const email = `demo-analytics-viewer-${i}@seed.local`;
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: `Demo Viewer ${i}`,
        email,
        password: "DemoPass123!",
        isSeedDemo: true,
      });
    } else if (!user.isSeedDemo) {
      // Backfills an account this script created before isSeedDemo existed,
      // so seed:refresh's demo-only-showtime check (which trusts this field,
      // not the email) still recognizes it on the next run. NOTE: this
      // find-or-create is keyed on email alone, which is not reserved
      // anywhere — if a real visitor had already signed up with this exact
      // address before this script ever ran, this reuses (and now flags)
      // their account rather than creating a fresh one. That's a
      // pre-existing gap in this find-or-create, not something introduced
      // or fixed here; isSeedDemo becoming the boundary going forward
      // doesn't change it, since it can only mark an account this script
      // already decided to treat as its own.
      user.isSeedDemo = true;
      await user.save();
    }
    users.push(user);
  }
  return users;
};

// A random point in the last DAYS_OF_HISTORY days, at a random hour — this
// is what actually makes the peak-times and revenue-trend charts look like
// real usage instead of one giant spike at "right now".
const randomPastCreatedAt = () => {
  const date = new Date();
  date.setDate(date.getDate() - randomInt(0, DAYS_OF_HISTORY));
  date.setHours(randomInt(0, 23), randomInt(0, 59), 0, 0);
  return date;
};

const buildBookingsForShowtime = (showtime, demoUsers, alreadyBookedSeatIds = new Set()) => {
  // Seats already sold to someone real are excluded: this script used to
  // build its grid from the layout alone, so a demo booking could land on a
  // seat an actual customer had confirmed — two confirmed bookings for one
  // seat, which the unique (showtime, seatIds) index now rejects outright.
  const seatIds = buildSeatGrid(showtime.screen.layout, alreadyBookedSeatIds)
    .flat()
    .filter((seat) => seat.status === "available")
    .map((seat) => seat.id);
  if (seatIds.length === 0) return [];

  const targetOccupancy = Math.random() * 0.8 + 0.1; // 10%–90%, never empty or perfectly full
  const targetBookedSeats = Math.max(1, Math.round(seatIds.length * targetOccupancy));
  const shuffled = [...seatIds].sort(() => Math.random() - 0.5);

  const bookings = [];
  let booked = 0;
  while (booked < targetBookedSeats) {
    const partySize = Math.min(randomInt(1, 3), targetBookedSeats - booked);
    const partySeatIds = shuffled.slice(booked, booked + partySize);
    booked += partySize;

    const isCancelled = Math.random() < CANCELLATION_CHANCE;
    const amount = (showtime.price ?? 200) * partySeatIds.length;
    const createdAt = randomPastCreatedAt();

    bookings.push({
      user: pick(demoUsers)._id,
      showtime: showtime._id,
      theater: showtime.theater,
      seatIds: partySeatIds,
      amount,
      status: isCancelled ? "cancelled" : "confirmed",
      ...(isCancelled && {
        refundAmount: Math.round(amount * pick([0, 0.5, 1])),
        cancelledAt: createdAt,
      }),
      createdAt,
      updatedAt: createdAt,
    });
  }
  return bookings;
};

const run = async () => {
  await connectDB();

  const showtimes = await Showtime.find({ isActive: true }).populate("screen");
  if (showtimes.length === 0) {
    console.log("No showtimes found — run `npm run seed:catalog` first, then re-run this script.");
    await mongoose.disconnect();
    return;
  }

  const demoUsers = await ensureDemoUsers();

  // One query for every seat already confirmed across these showtimes, so a
  // re-run tops up demo data around real bookings instead of colliding with
  // them (and with whatever a previous run of this script created).
  const confirmed = await Booking.find({
    showtime: { $in: showtimes.map((s) => s._id) },
    status: "confirmed",
  }).select("showtime seatIds");
  const bookedByShowtime = new Map();
  for (const booking of confirmed) {
    const key = booking.showtime.toString();
    if (!bookedByShowtime.has(key)) bookedByShowtime.set(key, new Set());
    const seats = bookedByShowtime.get(key);
    for (const seatId of booking.seatIds) seats.add(seatId);
  }

  const bookingDocs = showtimes.flatMap((showtime) =>
    buildBookingsForShowtime(
      showtime,
      demoUsers,
      bookedByShowtime.get(showtime._id.toString()) ?? new Set()
    )
  );

  if (bookingDocs.length === 0) {
    console.log("Nothing to seed (no showtime had any available seats).");
    await mongoose.disconnect();
    return;
  }

  // Native driver insert, not Booking.create() — Mongoose's timestamps
  // plugin stamps createdAt with "now" on every doc otherwise, which would
  // defeat the entire point of spreading these across the last 30 days.
  await Booking.collection.insertMany(bookingDocs);
  console.log(
    `Seeded ${bookingDocs.length} demo booking(s) across ${showtimes.length} showtime(s) as ${demoUsers.length} demo user(s).`
  );
  await mongoose.disconnect();
};

run();
