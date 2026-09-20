import "dotenv/config";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll } from "vitest";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Booking } from "../models/Booking.js";
import { errorHandler } from "./errorHandler.js";

const runId = Date.now();

const mockRes = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

// Captures the real error Mongo throws for a unique-index violation, rather
// than a hand-built imitation — the handler depends on the driver's actual
// error shape (code 11000 + keyValue).
const duplicateKeyErrorFrom = async (createTwice) => {
  try {
    await createTwice();
  } catch (err) {
    return err;
  }
  throw new Error("expected a duplicate-key error");
};

beforeAll(async () => {
  await connectDB();
  // Unique indexes are built asynchronously; without these, the second
  // insert could land before the index exists and never collide.
  await User.init();
  await Booking.init();
});

describe("errorHandler: duplicate-key (11000) errors", () => {
  it("reports a duplicate User email as 'Email already in use'", async () => {
    const email = `dup-email-${runId}@example.com`;
    const err = await duplicateKeyErrorFrom(async () => {
      await User.create({ name: "First", email, password: "password123" });
      await User.create({ name: "Second", email, password: "password123" });
    });

    const res = mockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: { code: "DUPLICATE", message: "Email already in use" },
    });
  });

  it("names the actual colliding field for non-email duplicates, without echoing its value", async () => {
    const paymentIntentId = `pi_dup_${runId}`;
    const bookingData = () => ({
      user: new mongoose.Types.ObjectId(),
      showtime: new mongoose.Types.ObjectId(),
      theater: new mongoose.Types.ObjectId(),
      seatIds: ["A1"],
      amount: 100,
      paymentIntentId,
    });
    const err = await duplicateKeyErrorFrom(async () => {
      await Booking.create(bookingData());
      await Booking.create(bookingData());
    });

    const res = mockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE");
    expect(res.body.error.message).toBe("A record with this paymentIntentId already exists");
    expect(res.body.error.message).not.toContain(paymentIntentId);
  });

  it("falls back to a generic message when the error doesn't say which field collided", () => {
    const res = mockRes();
    errorHandler({ code: 11000 }, {}, res, () => {});

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toEqual({ code: "DUPLICATE", message: "Duplicate value" });
  });
});
