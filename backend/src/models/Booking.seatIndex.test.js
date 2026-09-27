import "dotenv/config";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { connectDB } from "../config/db.js";
import { Booking } from "./Booking.js";

// The database-level backstop behind the Redis seat locks: a unique, PARTIAL,
// multikey index on { showtime, seatIds } filtered to status "confirmed"
// (Booking.js). Redis makes a double-sale vanishingly unlikely; this index is
// what makes it impossible, no matter what Redis believed — e.g. a lock that
// expired in the gap between the webhook verifying ownership and writing
// "confirmed".
//
// These tests talk to Mongo only — no Redis, no Stripe — which is the point:
// "the DB rejects a duplicate confirmed booking even if Redis is bypassed"
// is a claim about the index, so it is tested at the index. (The end-to-end
// version, through the webhook, lives in bookingService.test.js.)

const showtimeIds = [];
const newShowtime = () => {
  const id = new mongoose.Types.ObjectId();
  showtimeIds.push(id);
  return id;
};
const theater = new mongoose.Types.ObjectId();

const bookingFor = (showtime, seatIds, status) => ({
  user: new mongoose.Types.ObjectId(),
  showtime,
  theater,
  seatIds,
  amount: 200,
  status,
});

// Resolves to the error a write throws, failing the test if it doesn't throw.
const rejectionOf = async (write) => {
  try {
    await write();
  } catch (err) {
    return err;
  }
  throw new Error("expected the write to be rejected, but it succeeded");
};

const expectSeatIndexViolation = (err) => {
  expect(err.code).toBe(11000);
  // Names THIS index, not some other unique index (e.g. paymentIntentId).
  expect(err.keyPattern).toMatchObject({ showtime: 1, seatIds: 1 });
};

beforeAll(async () => {
  await connectDB();
  // Unique indexes build asynchronously; without this, an insert could land
  // before the index exists and never collide (see errorHandler.test.js).
  await Booking.init();
});

afterAll(async () => {
  await Booking.deleteMany({ showtime: { $in: showtimeIds } });
  await mongoose.disconnect();
});

describe("Booking { showtime, seatIds } unique partial index: one CONFIRMED booking per seat", () => {
  it("rejects a second confirmed booking for the same seat of the same showtime", async () => {
    const showtime = newShowtime();
    await Booking.create(bookingFor(showtime, ["A1"], "confirmed"));

    const err = await rejectionOf(() => Booking.create(bookingFor(showtime, ["A1"], "confirmed")));

    expectSeatIndexViolation(err);
    expect(await Booking.countDocuments({ showtime, seatIds: "A1", status: "confirmed" })).toBe(1);
  });

  it("rejects on PARTIAL overlap — one shared seat is enough (the index is multikey over seatIds)", async () => {
    const showtime = newShowtime();
    await Booking.create(bookingFor(showtime, ["B1", "B2"], "confirmed"));

    // B2 is shared; B3 is new. Still refused: the whole booking, not just B2.
    const err = await rejectionOf(() =>
      Booking.create(bookingFor(showtime, ["B2", "B3"], "confirmed"))
    );

    expectSeatIndexViolation(err);
    // The rejected booking left nothing behind — B3 is still free.
    expect(await Booking.countDocuments({ showtime, seatIds: "B3" })).toBe(0);
  });

  it("does not block unrelated seats, nor the same seat on a different showtime", async () => {
    const showtime = newShowtime();
    const otherShowtime = newShowtime();
    await Booking.create(bookingFor(showtime, ["C1"], "confirmed"));

    await expect(Booking.create(bookingFor(showtime, ["C2"], "confirmed"))).resolves.toBeDefined();
    await expect(
      Booking.create(bookingFor(otherShowtime, ["C1"], "confirmed"))
    ).resolves.toBeDefined();
  });

  it("the partial filter: pending, failed and cancelled bookings hold no claim on a seat", async () => {
    const showtime = newShowtime();

    // Any number of non-confirmed bookings can coexist for one seat...
    await Booking.create(bookingFor(showtime, ["D1"], "pending"));
    await Booking.create(bookingFor(showtime, ["D1"], "pending"));
    await Booking.create(bookingFor(showtime, ["D1"], "failed"));
    await Booking.create(bookingFor(showtime, ["D1"], "cancelled"));

    // ...and none of them stops a real confirmed booking from taking it,
    await expect(Booking.create(bookingFor(showtime, ["D1"], "confirmed"))).resolves.toBeDefined();

    // ...after which the seat is claimed like any other.
    const err = await rejectionOf(() => Booking.create(bookingFor(showtime, ["D1"], "confirmed")));
    expectSeatIndexViolation(err);
  });

  it("a cancelled booking releases its seat: it can be confirmed again by someone else", async () => {
    const showtime = newShowtime();
    const first = await Booking.create(bookingFor(showtime, ["E1"], "confirmed"));

    await Booking.updateOne({ _id: first._id }, { status: "cancelled" });

    await expect(Booking.create(bookingFor(showtime, ["E1"], "confirmed"))).resolves.toBeDefined();
  });

  it("the webhook scenario: a pending booking for an already-sold seat is created fine, but confirming it is what the index refuses", async () => {
    const showtime = newShowtime();
    await Booking.create(bookingFor(showtime, ["F1"], "confirmed"));

    // Redis knew nothing about the sale, so a second checkout got through and
    // sits as "pending" — allowed, since pending holds no claim.
    const late = await Booking.create(bookingFor(showtime, ["F1"], "pending"));

    // The commit step (bookingService, the pending -> confirmed transition) is
    // where the double-sale is stopped, atomically, by the database.
    const err = await rejectionOf(() =>
      Booking.findOneAndUpdate({ _id: late._id, status: "pending" }, { status: "confirmed" })
    );

    expectSeatIndexViolation(err);
    expect((await Booking.findById(late._id)).status).toBe("pending");
  });
});
