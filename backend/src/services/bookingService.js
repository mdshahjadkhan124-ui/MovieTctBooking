import { Booking } from "../models/Booking.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";
import { stripe } from "../config/stripe.js";
import * as seatLockService from "./seatLockService.js";

export const createCheckout = async (userId, showtimeId, seatIds) => {
  const showtime = await Showtime.findById(showtimeId);
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

  const amount = showtime.price * seatIds.length;

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

  return { clientSecret: paymentIntent.client_secret, bookingId: booking._id };
};

export const listUserBookings = (userId) =>
  Booking.find({ user: userId }).sort({ createdAt: -1 });

export const getBookingById = async (userId, bookingId) => {
  const booking = await Booking.findById(bookingId);
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
    await seatLockService.releaseLocksByToken(booking.showtime.toString(), token);
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
