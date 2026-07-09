import "dotenv/config";
import http from "node:http";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app.js";
import { connectDB } from "../config/db.js";
import { connectRedis } from "../config/redis.js";
import { stripe } from "../config/stripe.js";
import { Booking } from "../models/Booking.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { WaitlistEntry } from "../models/WaitlistEntry.js";
import * as seatLockService from "./seatLockService.js";
import * as bookingService from "./bookingService.js";
import * as waitlistService from "./waitlistService.js";

let server;
let baseUrl;
let redisClient;
let movie;
let theater;
let screenSmall; // 1 row x 2 columns -> seats A1, A2
let screenSingle; // 1 row x 1 column -> seat A1

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();
const userC = new mongoose.Types.ObjectId().toString();
const otherUser = new mongoose.Types.ObjectId().toString();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const makeShowtime = (screen, hoursFromNow = 24) =>
  Showtime.create({
    movie: movie._id,
    screen: screen._id,
    theater: theater._id,
    startTime: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
    endTime: new Date(Date.now() + (hoursFromNow + 2) * 60 * 60 * 1000),
    price: 200,
    format: "2D",
  });

beforeAll(async () => {
  await connectDB();
  redisClient = await connectRedis();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  movie = await Movie.create({ title: "Waitlist Test Movie", durationMinutes: 100 });
  theater = await Theater.create({
    name: "Waitlist Test Theater",
    location: { city: "Testville" },
  });
  screenSmall = await Screen.create({
    theater: theater._id,
    name: "Small Screen",
    layout: { rows: 1, columns: 2 },
  });
  screenSingle = await Screen.create({
    theater: theater._id,
    name: "Single-Seat Screen",
    layout: { rows: 1, columns: 1 },
  });
}, 30000);

afterAll(async () => {
  const showtimes = await Showtime.find({ theater: theater._id }).select("_id");
  const showtimeIds = showtimes.map((s) => s._id);
  await WaitlistEntry.deleteMany({ showtime: { $in: showtimeIds } });
  await Booking.deleteMany({ showtime: { $in: showtimeIds } });
  await Showtime.deleteMany({ _id: { $in: showtimeIds } });
  await Screen.deleteMany({ theater: theater._id });
  await Theater.deleteOne({ _id: theater._id });
  await Movie.deleteOne({ _id: movie._id });
  await new Promise((resolve) => server.close(resolve));
  await redisClient.quit();
  await mongoose.disconnect();
});

const signAndPost = async (eventPayload) => {
  const payload = JSON.stringify(eventPayload);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": header },
    body: payload,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
};

const succeededEvent = (paymentIntent) => ({
  id: `evt_test_${paymentIntent.id}`,
  type: "payment_intent.succeeded",
  data: { object: paymentIntent },
});

// Full lock -> checkout -> real Stripe confirm -> webhook-relayed confirm.
// Mirrors bookingService.test.js's own helper of the same name.
const checkoutAndConfirm = async (userId, showtimeDoc, seatIds) => {
  await seatLockService.acquireLocks(showtimeDoc._id.toString(), seatIds, userId);
  const { bookingId } = await bookingService.createCheckout(
    userId,
    showtimeDoc._id.toString(),
    seatIds
  );
  const booking = await Booking.findById(bookingId);
  const confirmedIntent = await stripe.paymentIntents.confirm(booking.paymentIntentId, {
    payment_method: "pm_card_visa",
  });
  const { status } = await signAndPost(succeededEvent(confirmedIntent));
  expect(status).toBe(200);
  return bookingId;
};

describe("waitlist: join / leave / duplicate prevention", () => {
  it("joining puts a user in 'waiting' status; leaving clears it", async () => {
    const showtime = await makeShowtime(screenSmall);

    const entry = await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    expect(entry.status).toBe("waiting");

    const status = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(status).toMatchObject({ status: "waiting", seatsRequested: 1, position: 1 });

    await waitlistService.leaveWaitlist(userA, showtime._id.toString());
    const afterLeave = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(afterLeave).toBeNull();
  });

  it("rejects a duplicate active entry for the same user + showtime", async () => {
    const showtime = await makeShowtime(screenSmall);

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    await expect(
      waitlistService.joinWaitlist(userA, showtime._id.toString(), 1)
    ).rejects.toMatchObject({ statusCode: 409, code: "ALREADY_ON_WAITLIST" });

    await waitlistService.leaveWaitlist(userA, showtime._id.toString());
  });

  it("leaving when not on the waitlist is rejected", async () => {
    const showtime = await makeShowtime(screenSmall);
    await expect(
      waitlistService.leaveWaitlist(userA, showtime._id.toString())
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("waitlist: FIFO ordering", () => {
  it("position reflects join order among waiting entries", async () => {
    const showtime = await makeShowtime(screenSmall);

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    await sleep(20);
    await waitlistService.joinWaitlist(userB, showtime._id.toString(), 1);
    await sleep(20);
    await waitlistService.joinWaitlist(userC, showtime._id.toString(), 1);

    const [statusA, statusB, statusC] = await Promise.all([
      waitlistService.getMyWaitlistStatus(userA, showtime._id.toString()),
      waitlistService.getMyWaitlistStatus(userB, showtime._id.toString()),
      waitlistService.getMyWaitlistStatus(userC, showtime._id.toString()),
    ]);
    expect(statusA.position).toBe(1);
    expect(statusB.position).toBe(2);
    expect(statusC.position).toBe(3);
  });

  it("skips an earlier entry that needs more seats than are free, in favor of a later one that fits — and the resulting hold is exclusive", async () => {
    const showtime = await makeShowtime(screenSmall); // seats: A1, A2

    // Occupy A1 so only 1 seat (A2) is actually free.
    const otherLock = await seatLockService.acquireLocks(
      showtime._id.toString(),
      ["A1"],
      otherUser
    );
    expect(otherLock.success).toBe(true);

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 2); // needs both seats -> can't fit in 1 free
    await sleep(20);
    await waitlistService.joinWaitlist(userB, showtime._id.toString(), 1); // fits in what's free

    await waitlistService.processWaitlist(showtime._id.toString());

    const statusB = await waitlistService.getMyWaitlistStatus(userB, showtime._id.toString());
    expect(statusB.status).toBe("notified");
    expect(statusB.heldSeatIds).toEqual(["A2"]);

    const statusA = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(statusA.status).toBe("waiting");

    // A non-notified third party can't grab the seat reserved for userB
    // during their exclusive window.
    const intruderLock = await seatLockService.acquireLocks(
      showtime._id.toString(),
      ["A2"],
      userC
    );
    expect(intruderLock.success).toBe(false);
    expect(intruderLock.unavailable).toContain("A2");
  });
});

describe("waitlist: cancellation-driven notification + fulfillment", () => {
  it("cancelling a booking that frees the only seat notifies the waitlisted user for it", async () => {
    const showtime = await makeShowtime(screenSingle); // single seat: A1
    const bookingId = await checkoutAndConfirm(otherUser, showtime, ["A1"]);

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    let status = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(status.status).toBe("waiting");

    await bookingService.cancelBooking(otherUser, bookingId);

    status = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(status.status).toBe("notified");
    expect(status.heldSeatIds).toEqual(["A1"]);
    expect(status.holdExpiresAt.getTime()).toBeGreaterThan(Date.now());
  }, 20000);

  it("the notified user actually booking their held seats marks the entry fulfilled", async () => {
    const showtime = await makeShowtime(screenSingle);
    const firstBookingId = await checkoutAndConfirm(otherUser, showtime, ["A1"]);

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    await bookingService.cancelBooking(otherUser, firstBookingId);

    const offer = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(offer.status).toBe("notified");

    await checkoutAndConfirm(userA, showtime, offer.heldSeatIds);

    const entry = await WaitlistEntry.findOne({ user: userA, showtime: showtime._id });
    expect(entry.status).toBe("fulfilled");
  }, 20000);
});

describe("waitlist: hold expiry advances the offer to the next eligible user", () => {
  it("an expired, unbooked offer is released and passed to the next waiting entry", async () => {
    const showtime = await makeShowtime(screenSmall); // seats: A1, A2
    // Generous so userB's real Redis lock (acquired below) stays alive for
    // the rest of the test regardless of network latency — userA's offer is
    // made to look expired by backdating its Mongo `notifiedAt` directly,
    // not by racing a short TTL against wall-clock time.
    const holdTtlMs = 5000;

    await waitlistService.joinWaitlist(userA, showtime._id.toString(), 1);
    await sleep(20);
    await waitlistService.joinWaitlist(userB, showtime._id.toString(), 1);

    await waitlistService.processWaitlist(showtime._id.toString(), { holdTtlMs });
    const firstOffer = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(firstOffer.status).toBe("notified");
    const heldSeat = firstOffer.heldSeatIds[0];

    // reconcileExpiredNotifications decides staleness purely from
    // `notifiedAt` vs. `now - holdTtlMs` (see waitlistService.js) — backdate
    // it directly so the offer is deterministically treated as expired.
    await WaitlistEntry.updateOne(
      { user: userA, showtime: showtime._id, status: "notified" },
      { notifiedAt: new Date(Date.now() - holdTtlMs - 1000) }
    );
    await waitlistService.processWaitlist(showtime._id.toString(), { holdTtlMs });

    const expiredA = await waitlistService.getMyWaitlistStatus(userA, showtime._id.toString());
    expect(expiredA).toBeNull(); // no longer an active (waiting/notified) entry

    const entryA = await WaitlistEntry.findOne({ user: userA, showtime: showtime._id });
    expect(entryA.status).toBe("expired");

    const nextOffer = await waitlistService.getMyWaitlistStatus(userB, showtime._id.toString());
    expect(nextOffer.status).toBe("notified");
    expect(nextOffer.heldSeatIds).toEqual([heldSeat]);

    // The expired hold was actually released in Redis, not just in Mongo —
    // otherwise userB's new hold on the same seat couldn't have succeeded.
    const lockedSeatIds = await seatLockService.getLockedSeatIds(showtime._id.toString());
    expect(lockedSeatIds).toContain(heldSeat);
  }, 10000);
});
