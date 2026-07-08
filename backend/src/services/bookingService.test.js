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
}, 30000);

afterAll(async () => {
  await Booking.deleteMany({ showtime: showtime._id });
  await Showtime.deleteOne({ _id: showtime._id });
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
