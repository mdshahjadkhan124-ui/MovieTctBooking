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
import * as seatLockService from "./seatLockService.js";
import * as bookingService from "./bookingService.js";
import { getUnavailableSeatIds } from "./showtimeService.js";
import { calculateSeatPrice } from "./pricingService.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";

let server;
let baseUrl;
let redisClient;
let movie;
let theater;
let screen;
let showtime;
let showtimeFarFuture;
let showtimeSoon;
let showtimeVerySoon;
let showtimeStarted;

const userId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  await connectDB();
  redisClient = await connectRedis();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  movie = await Movie.create({ title: "Booking Test Movie", durationMinutes: 100 });
  theater = await Theater.create({
    name: "Booking Test Theater",
    location: { city: "Testville" },
  });
  screen = await Screen.create({
    theater: theater._id,
    name: "Test Screen",
    layout: { rows: 3, columns: 5 },
  });
  showtime = await Showtime.create({
    movie: movie._id,
    screen: screen._id,
    theater: theater._id,
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    endTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
    price: 200,
    format: "2D",
  });

  // Dedicated showtimes for cancellation tests, deliberately far from any
  // refund-tier boundary (unlike `showtime` above, which sits right at the
  // 24h line) so these tests are never flaky against real wall-clock drift
  // between beforeAll and whenever a given test actually runs.
  const makeShowtime = (hoursFromNow) =>
    Showtime.create({
      movie: movie._id,
      screen: screen._id,
      theater: theater._id,
      startTime: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000),
      endTime: new Date(Date.now() + (hoursFromNow + 2) * 60 * 60 * 1000),
      price: 200,
      format: "2D",
    });
  showtimeFarFuture = await makeShowtime(48);
  showtimeSoon = await makeShowtime(10);
  showtimeVerySoon = await makeShowtime(2);
  showtimeStarted = await makeShowtime(-1);
}, 30000);

afterAll(async () => {
  const allShowtimeIds = [
    showtime._id,
    showtimeFarFuture._id,
    showtimeSoon._id,
    showtimeVerySoon._id,
    showtimeStarted._id,
  ];
  await Booking.deleteMany({ showtime: { $in: allShowtimeIds } });
  await Showtime.deleteMany({ _id: { $in: allShowtimeIds } });
  await Screen.deleteOne({ _id: screen._id });
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

const failedEvent = (paymentIntent) => ({
  id: `evt_test_fail_${paymentIntent.id}`,
  type: "payment_intent.payment_failed",
  data: { object: paymentIntent },
});

// Full lock -> checkout -> real Stripe confirm -> webhook-relayed confirm,
// used by the cancellation tests below, which only care about what happens
// after a booking is already genuinely "confirmed".
const checkoutAndConfirm = async (showtimeDoc, seatIds) => {
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

describe("booking checkout + Stripe webhook", () => {
  it("happy path: lock -> checkout -> succeeded webhook -> confirmed, locks consumed", async () => {
    const seatIds = ["A1", "A2"];
    const lockResult = await seatLockService.acquireLocks(
      showtime._id.toString(),
      seatIds,
      userId
    );
    expect(lockResult.success).toBe(true);

    const { bookingId } = await bookingService.createCheckout(
      userId,
      showtime._id.toString(),
      seatIds
    );
    const booking = await Booking.findById(bookingId);
    expect(booking.status).toBe("pending");

    const confirmedIntent = await stripe.paymentIntents.confirm(booking.paymentIntentId, {
      payment_method: "pm_card_visa",
    });
    expect(confirmedIntent.status).toBe("succeeded");

    const { status } = await signAndPost(succeededEvent(confirmedIntent));
    expect(status).toBe(200);

    const updated = await Booking.findById(bookingId);
    expect(updated.status).toBe("confirmed");

    const stillLocked = await seatLockService.getLockedSeatIds(showtime._id.toString());
    expect(stillLocked).not.toContain("A1");
    expect(stillLocked).not.toContain("A2");
  }, 20000);

  it("expired lock at webhook time -> booking failed + refund issued", async () => {
    const seatIds = ["B1", "B2"];
    const lockResult = await seatLockService.acquireLocks(
      showtime._id.toString(),
      seatIds,
      userId,
      { ttlMs: 150 }
    );
    expect(lockResult.success).toBe(true);

    const { bookingId } = await bookingService.createCheckout(
      userId,
      showtime._id.toString(),
      seatIds
    );
    const booking = await Booking.findById(bookingId);

    const confirmedIntent = await stripe.paymentIntents.confirm(booking.paymentIntentId, {
      payment_method: "pm_card_visa",
    });

    // Let the lock TTL genuinely expire before the webhook is processed —
    // simulating a user who paid just as their hold ran out.
    await new Promise((resolve) => setTimeout(resolve, 400));

    const { status } = await signAndPost(succeededEvent(confirmedIntent));
    expect(status).toBe(200);

    const updated = await Booking.findById(bookingId);
    expect(updated.status).toBe("failed");

    const refunds = await stripe.refunds.list({ payment_intent: booking.paymentIntentId });
    expect(refunds.data.length).toBeGreaterThan(0);
  }, 20000);

  it("duplicate webhook delivery is idempotent (no double-processing)", async () => {
    const seatIds = ["A3", "A4"];
    await seatLockService.acquireLocks(showtime._id.toString(), seatIds, userId);
    const { bookingId } = await bookingService.createCheckout(
      userId,
      showtime._id.toString(),
      seatIds
    );
    const booking = await Booking.findById(bookingId);

    const confirmedIntent = await stripe.paymentIntents.confirm(booking.paymentIntentId, {
      payment_method: "pm_card_visa",
    });

    const event = succeededEvent(confirmedIntent);
    const first = await signAndPost(event);
    expect(first.status).toBe(200);

    const afterFirst = await Booking.findById(bookingId);
    expect(afterFirst.status).toBe("confirmed");
    const updatedAtAfterFirst = afterFirst.updatedAt.getTime();

    const second = await signAndPost(event);
    expect(second.status).toBe(200);

    const afterSecond = await Booking.findById(bookingId);
    expect(afterSecond.status).toBe("confirmed");
    // No re-write happened on the redelivered event — genuine no-op, not
    // just "still ends up confirmed".
    expect(afterSecond.updatedAt.getTime()).toBe(updatedAtAfterFirst);
  }, 20000);

  it("rejects a webhook with a bad signature", async () => {
    const payload = JSON.stringify({
      id: "evt_fake",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_fake" } },
    });

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef" },
      body: payload,
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("payment_intent.payment_failed sets the booking to failed", async () => {
    const seatIds = ["A5", "B3"];
    await seatLockService.acquireLocks(showtime._id.toString(), seatIds, userId);
    const { bookingId } = await bookingService.createCheckout(
      userId,
      showtime._id.toString(),
      seatIds
    );
    const booking = await Booking.findById(bookingId);

    // Don't actually confirm the payment — simulate Stripe reporting this
    // intent as failed instead. payment_failed handling never calls back
    // into the Stripe API (nothing was charged), so the real remote status
    // of this PaymentIntent doesn't matter for this test.
    const fakeFailedIntent = {
      id: booking.paymentIntentId,
      status: "requires_payment_method",
      metadata: { lockToken: "irrelevant" },
    };

    const { status } = await signAndPost(failedEvent(fakeFailedIntent));
    expect(status).toBe(200);

    const updated = await Booking.findById(bookingId);
    expect(updated.status).toBe("failed");
  }, 20000);

  it("checkout computes price server-side, independent of anything a client could send", async () => {
    const seatIds = ["C1"];
    await seatLockService.acquireLocks(showtime._id.toString(), seatIds, userId);

    // createCheckout's signature is (userId, showtimeId, seatIds) — there is
    // no price parameter to smuggle a client-sent value through even if
    // bookingController.checkout didn't already ignore one (it only ever
    // destructures showtimeId/seatIds off req.body). This proves the amount
    // actually stored matches pricingService's own independent math for the
    // live occupancy at the time, not an arbitrary/attacker-supplied number.
    const { bookingId, amount } = await bookingService.createCheckout(
      userId,
      showtime._id.toString(),
      seatIds
    );

    const booking = await Booking.findById(bookingId);
    expect(booking.amount).toBe(amount);

    const populatedShowtime = await Showtime.findById(showtime._id).populate("screen");
    const grid = buildSeatGrid(populatedShowtime.screen.layout).flat();
    const seat = grid.find((s) => s.id === "C1");
    const unavailableSeatIds = await getUnavailableSeatIds(showtime._id.toString());
    const occupancy = unavailableSeatIds.length / grid.length;
    const expected = calculateSeatPrice(populatedShowtime.price, seat, populatedShowtime, occupancy);

    expect(booking.amount).toBe(expected.finalPrice);
  });
});

describe("booking cancellation", () => {
  it("24+ hours before showtime -> full refund, cancelled, seats freed", async () => {
    const seatIds = ["A1"];
    const bookingId = await checkoutAndConfirm(showtimeFarFuture, seatIds);
    const original = await Booking.findById(bookingId);

    const result = await bookingService.cancelBooking(userId, bookingId);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(original.amount);
    expect(result.booking.status).toBe("cancelled");
    expect(result.booking.refundId).toBeTruthy();
    expect(result.booking.cancelledAt).toBeTruthy();

    const refunds = await stripe.refunds.list({ payment_intent: original.paymentIntentId });
    expect(refunds.data.some((r) => r.amount === Math.round(result.refundAmount * 100))).toBe(
      true
    );

    const unavailable = await getUnavailableSeatIds(showtimeFarFuture._id.toString());
    expect(unavailable).not.toContain("A1");
  }, 20000);

  it("6-24 hours before showtime -> 50% refund", async () => {
    const seatIds = ["A2"];
    const bookingId = await checkoutAndConfirm(showtimeSoon, seatIds);
    const original = await Booking.findById(bookingId);

    const result = await bookingService.cancelBooking(userId, bookingId);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(Math.round(original.amount * 0.5));
    expect(result.booking.status).toBe("cancelled");
  }, 20000);

  it("less than 6 hours before showtime -> 0% refund, still cancels, no Stripe refund created", async () => {
    const seatIds = ["A3"];
    const bookingId = await checkoutAndConfirm(showtimeVerySoon, seatIds);
    const original = await Booking.findById(bookingId);
    const refundsBefore = await stripe.refunds.list({ payment_intent: original.paymentIntentId });

    const result = await bookingService.cancelBooking(userId, bookingId);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.booking.status).toBe("cancelled");
    expect(result.booking.refundId).toBeFalsy();

    const refundsAfter = await stripe.refunds.list({ payment_intent: original.paymentIntentId });
    expect(refundsAfter.data.length).toBe(refundsBefore.data.length);
  }, 20000);

  it("after showtime has started -> cancellation rejected, booking stays confirmed", async () => {
    const seatIds = ["A4"];
    const bookingId = await checkoutAndConfirm(showtimeStarted, seatIds);

    await expect(bookingService.cancelBooking(userId, bookingId)).rejects.toMatchObject({
      statusCode: 409,
      code: "CANCELLATION_WINDOW_CLOSED",
    });

    const stillConfirmed = await Booking.findById(bookingId);
    expect(stillConfirmed.status).toBe("confirmed");
  }, 20000);

  it("only the booking's owner can cancel it", async () => {
    const seatIds = ["A5"];
    const bookingId = await checkoutAndConfirm(showtimeFarFuture, seatIds);
    const otherUserId = new mongoose.Types.ObjectId().toString();

    await expect(bookingService.cancelBooking(otherUserId, bookingId)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    const stillConfirmed = await Booking.findById(bookingId);
    expect(stillConfirmed.status).toBe("confirmed");
  }, 20000);

  it("cancelling a non-confirmed (pending) booking is rejected", async () => {
    const seatIds = ["B1"];
    await seatLockService.acquireLocks(showtimeFarFuture._id.toString(), seatIds, userId);
    const { bookingId } = await bookingService.createCheckout(
      userId,
      showtimeFarFuture._id.toString(),
      seatIds
    );
    // Deliberately never confirmed via webhook — stays "pending".

    await expect(bookingService.cancelBooking(userId, bookingId)).rejects.toMatchObject({
      statusCode: 409,
      code: "NOT_CANCELLABLE",
    });
  }, 20000);

  it("double-cancel (sequential) is idempotent — second attempt fails cleanly, never double-refunds", async () => {
    const seatIds = ["B2"];
    const bookingId = await checkoutAndConfirm(showtimeFarFuture, seatIds);

    const first = await bookingService.cancelBooking(userId, bookingId);
    expect(first.booking.status).toBe("cancelled");

    // Once cancelled, the earlier status check ("only confirmed bookings can
    // be cancelled") is what a sequential second call actually hits — a
    // clean, correct rejection either way. ALREADY_CANCELLED (below) is the
    // deeper guard for a genuine concurrent race, not reachable here since
    // this second call reads the already-updated status before ever
    // attempting the atomic claim.
    await expect(bookingService.cancelBooking(userId, bookingId)).rejects.toMatchObject({
      statusCode: 409,
      code: "NOT_CANCELLABLE",
    });

    const refunds = await stripe.refunds.list({ payment_intent: first.booking.paymentIntentId });
    expect(refunds.data.length).toBe(1);
  }, 20000);

  it("double-cancel (concurrent race) never double-refunds — only one of two simultaneous requests wins", async () => {
    const seatIds = ["B3"];
    const bookingId = await checkoutAndConfirm(showtimeFarFuture, seatIds);

    // Both requests read status: "confirmed" before either has written —
    // this is exactly the race the atomic findOneAndUpdate claim (not the
    // earlier status check) is there to close. Exactly one should succeed;
    // the other should fail with ALREADY_CANCELLED, and Stripe should only
    // ever see one refund.
    const [resultA, resultB] = await Promise.allSettled([
      bookingService.cancelBooking(userId, bookingId),
      bookingService.cancelBooking(userId, bookingId),
    ]);

    const fulfilled = [resultA, resultB].filter((r) => r.status === "fulfilled");
    const rejected = [resultA, resultB].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: "ALREADY_CANCELLED" });

    const finalBooking = await Booking.findById(bookingId);
    expect(finalBooking.status).toBe("cancelled");

    const refunds = await stripe.refunds.list({ payment_intent: finalBooking.paymentIntentId });
    expect(refunds.data.length).toBe(1);
  }, 20000);
});
