import { Booking } from "../models/Booking.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";
import { stripe } from "../config/stripe.js";
import * as seatLockService from "./seatLockService.js";
import { getUnavailableSeatIds } from "./showtimeService.js";
import { emitSeatsUpdated } from "../config/socket.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { calculateSeatPrice } from "./pricingService.js";

// The one place checkout amount gets decided — recomputed fresh from
// current occupancy every time, independent of whatever the client last
// displayed. There is no `price` field anywhere in the checkout request
// body (validateCheckoutRequest only looks at showtimeId/seatIds), so a
// client-sent price isn't rejected so much as structurally never read.
const priceSelectedSeats = async (showtime, seatIds) => {
  const seatsById = new Map(buildSeatGrid(showtime.screen.layout).flat().map((s) => [s.id, s]));
  const unavailableSeatIds = await getUnavailableSeatIds(showtime._id.toString());
  const totalSeats = seatsById.size;
  const occupancy = totalSeats > 0 ? unavailableSeatIds.length / totalSeats : 0;

  let amount = 0;
  const priceBreakdown = [];
  for (const seatId of seatIds) {
    const seat = seatsById.get(seatId);
    if (!seat) throw new AppError(`Unknown seat: ${seatId}`, 400, "INVALID_SEATS");
    const { finalPrice, breakdown } = calculateSeatPrice(showtime.price, seat, showtime, occupancy);
    amount += finalPrice;
    priceBreakdown.push({ seatId, finalPrice, breakdown });
  }
  return { amount, priceBreakdown };
};

export const createCheckout = async (userId, showtimeId, seatIds) => {
  const showtime = await Showtime.findById(showtimeId).populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }
  if (typeof showtime.price !== "number" || showtime.price <= 0) {
    throw new AppError("This showtime has no price set", 400, "NO_PRICE");
  }

  // Re-derive lock ownership from Redis state rather than trusting the
  // client to resend a token — see getOwnedLockToken's own comment.
  const token = await seatLockService.getOwnedLockToken(showtimeId, seatIds, userId);
  if (!token) {
    throw new AppError(
      "You no longer hold a lock on all of these seats",
      409,
      "LOCKS_NOT_OWNED"
    );
  }

  const { amount, priceBreakdown } = await priceSelectedSeats(showtime, seatIds);

  // Stripe amounts are in the smallest currency unit (paise for INR).
  // payment_method_types is pinned to "card" (rather than Stripe's automatic
  // payment methods) so confirmation never requires a redirect return_url —
  // there's no browser round-trip in this flow's test-mode confirmation.
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: "inr",
    payment_method_types: ["card"],
    metadata: {
      userId,
      showtimeId: showtimeId.toString(),
      seatIds: JSON.stringify(seatIds),
      // Stashed here (not on the Booking document) so the webhook handler,
      // which only has the PaymentIntent, can re-verify ownership later
      // with an exact token match via verifyLockOwnership.
      lockToken: token,
    },
  });

  const booking = await Booking.create({
    user: userId,
    showtime: showtime._id,
    theater: showtime.theater,
    seatIds,
    amount,
    status: "pending",
    paymentIntentId: paymentIntent.id,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    bookingId: booking._id,
    amount,
    priceBreakdown,
  };
};

// Bookings only store refs (showtime, theater) — history/ticket views need
// the movie title and screen name, so both read paths populate the same way.
const BOOKING_POPULATE = [
  { path: "showtime", populate: [{ path: "movie" }, { path: "screen" }] },
  { path: "theater" },
];

export const listUserBookings = (userId) =>
  Booking.find({ user: userId }).sort({ createdAt: -1 }).populate(BOOKING_POPULATE);

export const getBookingById = async (userId, bookingId) => {
  const booking = await Booking.findById(bookingId).populate(BOOKING_POPULATE);
  if (!booking) throw new AppError("Booking not found", 404, "NOT_FOUND");
  if (booking.user.toString() !== userId) {
    throw new AppError("Not authorized to view this booking", 403, "FORBIDDEN");
  }
  return booking;
};

const handlePaymentSucceeded = async (paymentIntent) => {
  const booking = await Booking.findOne({ paymentIntentId: paymentIntent.id });
  if (!booking || booking.status !== "pending") return; // unknown or already resolved — idempotent no-op

  const token = paymentIntent.metadata?.lockToken;
  const stillOwned = token
    ? await seatLockService.verifyLockOwnership(
        booking.showtime.toString(),
        booking.seatIds,
        token
      )
    : false;
  const intendedStatus = stillOwned ? "confirmed" : "failed";

  // Atomically claim the pending -> intendedStatus transition. If a
  // concurrent delivery of this same event already resolved this booking,
  // this matches nothing and we skip the side effects below — that's what
  // makes a re-delivered webhook safe to no-op rather than double-acting.
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending" },
    { status: intendedStatus }
  );
  if (!claimed) return;

  if (intendedStatus === "confirmed") {
    const showtimeId = booking.showtime.toString();
    await seatLockService.releaseLocksByToken(showtimeId, token);
    // The lock is gone from Redis now, but getUnavailableSeatIds re-includes
    // these seats via the Booking we just confirmed above — so the broadcast
    // still shows them unavailable, permanently, not just until the lock
    // would have expired.
    emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
  } else {
    await stripe.refunds.create({ payment_intent: paymentIntent.id });
  }
};

const handlePaymentFailed = async (paymentIntent) => {
  const booking = await Booking.findOne({ paymentIntentId: paymentIntent.id });
  if (!booking || booking.status !== "pending") return;

  // No refund/lock-release needed here — nothing was ever charged, and the
  // seat locks simply expire on their own TTL.
  await Booking.findOneAndUpdate({ _id: booking._id, status: "pending" }, { status: "failed" });
};

export const handleStripeWebhookEvent = async (event) => {
  if (event.type === "payment_intent.succeeded") {
    await handlePaymentSucceeded(event.data.object);
  } else if (event.type === "payment_intent.payment_failed") {
    await handlePaymentFailed(event.data.object);
  }
  // Other event types aren't relevant to booking-commit and are ignored.
};
