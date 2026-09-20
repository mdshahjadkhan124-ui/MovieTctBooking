import { Booking } from "../models/Booking.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";
import { stripe } from "../config/stripe.js";
import * as seatLockService from "./seatLockService.js";
import { getUnavailableSeatIds } from "./showtimeService.js";
import { emitSeatsUpdated } from "../config/socket.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { calculateSeatPrice } from "./pricingService.js";
import { calculateRefund } from "./refundPolicyService.js";
import * as waitlistService from "./waitlistService.js";

// The one place checkout amount gets decided — recomputed fresh from
// current occupancy every time, independent of whatever the client last
// displayed. There is no `price` field anywhere in the checkout request
// body (validateCheckoutRequest only looks at showtimeId/seatIds), so a
// client-sent price isn't rejected so much as structurally never read.
const priceSelectedSeats = async (showtime, seatIds, timeZone) => {
  const seatsById = new Map(buildSeatGrid(showtime.screen.layout).flat().map((s) => [s.id, s]));
  const unavailableSeatIds = await getUnavailableSeatIds(showtime._id.toString());
  const totalSeats = seatsById.size;
  const occupancy = totalSeats > 0 ? unavailableSeatIds.length / totalSeats : 0;

  let amount = 0;
  const priceBreakdown = [];
  for (const seatId of seatIds) {
    const seat = seatsById.get(seatId);
    if (!seat) throw new AppError(`Unknown seat: ${seatId}`, 400, "INVALID_SEATS");
    const { finalPrice, breakdown } = calculateSeatPrice(
      showtime.price,
      seat,
      showtime,
      occupancy,
      timeZone
    );
    amount += finalPrice;
    priceBreakdown.push({ seatId, finalPrice, breakdown });
  }
  return { amount, priceBreakdown };
};

export const createCheckout = async (userId, showtimeId, seatIds) => {
  // theater comes along for its timezone, so the price charged uses the same
  // cinema-clock rules the seat page quoted.
  const showtime = await Showtime.findById(showtimeId)
    .populate("screen")
    .populate("theater", "timezone");
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

  const { amount, priceBreakdown } = await priceSelectedSeats(
    showtime,
    seatIds,
    showtime.theater?.timezone
  );

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
    // `.theater` is populated above (for its timezone), so take the id.
    theater: showtime.theater?._id ?? showtime.theater,
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

const refundPercentOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Pays out a refund that's recorded as owed ("pending") and only then marks
 * it completed — so nothing is ever recorded as refunded before Stripe says
 * it happened. Safe to call repeatedly:
 *  - the idempotency key means a retry after a lost/failed response returns
 *    the SAME Stripe refund instead of issuing a second one;
 *  - the conditional update can't double-write;
 *  - a booking that isn't owed a refund is a no-op.
 */
const settleRefund = async (booking) => {
  if (booking.refundStatus !== "pending") return booking;

  const refund = await stripe.refunds.create(
    {
      payment_intent: booking.paymentIntentId,
      amount: Math.round(booking.refundAmount * 100),
    },
    { idempotencyKey: `refund_${booking._id}` }
  );

  const settled = await Booking.findOneAndUpdate(
    { _id: booking._id, refundStatus: "pending" },
    { refundId: refund.id, refundStatus: "completed" },
    { returnDocument: "after" }
  );
  return settled ?? booking;
};

// Used on the request-driven path (cancellation): the cancellation itself
// has already committed, so a Stripe failure must not look like "nothing
// happened" — it reports what's true (cancelled, refund still owed) and
// invites the retry that finishes it.
const settleRefundOrReportPending = async (booking) => {
  try {
    return await settleRefund(booking);
  } catch (err) {
    console.error("Refund call failed; left pending for retry:", err);
    throw new AppError(
      "Your booking is cancelled and the seats are released, but the refund didn't go through. Please try again to complete the refund.",
      502,
      "REFUND_NOT_COMPLETED"
    );
  }
};

export const cancelBooking = async (userId, bookingId) => {
  const booking = await Booking.findById(bookingId).populate("showtime");
  if (!booking) throw new AppError("Booking not found", 404, "NOT_FOUND");
  if (booking.user.toString() !== userId) {
    throw new AppError("Not authorized to cancel this booking", 403, "FORBIDDEN");
  }

  // A cancellation whose refund never went through is resumable, not lost:
  // retrying the same cancel finishes the refund rather than reporting
  // "already cancelled" while quietly keeping the money. It pays out the
  // refundAmount stored when the cancellation was claimed, so retrying
  // hours later can't re-rate it against a closer showtime.
  if (booking.status === "cancelled" && booking.refundStatus === "pending") {
    const settled = await settleRefundOrReportPending(booking);
    await settled.populate(BOOKING_POPULATE);
    return {
      booking: settled,
      refundPercent: refundPercentOf(settled.refundAmount, settled.amount),
      refundAmount: settled.refundAmount,
      reason: "Refund completed for a cancellation that was already recorded.",
    };
  }

  if (booking.status !== "confirmed") {
    throw new AppError(
      `Only confirmed bookings can be cancelled (this one is ${booking.status})`,
      409,
      "NOT_CANCELLABLE"
    );
  }

  const { allowed, refundPercent, refundAmount, reason } = calculateRefund(
    booking,
    booking.showtime,
    new Date()
  );
  if (!allowed) {
    throw new AppError(reason, 409, "CANCELLATION_WINDOW_CLOSED");
  }

  // Atomically claim confirmed -> cancelled BEFORE touching Stripe, same
  // shape as handlePaymentSucceeded's claim below. Whoever wins this is the
  // only caller that will ever process the refund for this booking — a
  // concurrent or retried cancel request finds nothing left to claim and
  // fails cleanly (ALREADY_CANCELLED) instead of double-refunding.
  //
  // The claim also records what's owed and that it's unpaid ("pending"),
  // which is what survives a Stripe failure below and lets a retry finish
  // the job.
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "confirmed" },
    {
      status: "cancelled",
      cancelledAt: new Date(),
      refundAmount,
      refundStatus: refundAmount > 0 ? "pending" : "not_required",
    },
    { returnDocument: "after" }
  );
  if (!claimed) {
    throw new AppError("This booking was already cancelled", 409, "ALREADY_CANCELLED");
  }

  // Cancelling frees the seats: getUnavailableSeatIds only counts
  // status: "confirmed" bookings, so this one's seatIds drop out of that
  // set the instant the status above changed — the broadcast just tells
  // anyone already looking at this showtime, in real time. This runs before
  // the refund so the seats are released even if the payout needs a retry.
  const showtimeId = booking.showtime._id.toString();
  emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));

  // Cancellation is the primary, event-driven trigger for advancing the
  // waitlist (see waitlistService's own doc comment for the other,
  // opportunistic triggers). Never let a waitlist bug fail a cancellation
  // that has already committed by this point.
  try {
    await waitlistService.processWaitlist(showtimeId);
  } catch (err) {
    console.error("Waitlist processing failed after cancellation:", err);
  }

  const settled = await settleRefundOrReportPending(claimed);
  await settled.populate(BOOKING_POPULATE);

  return { booking: settled, refundPercent, refundAmount, reason };
};

/**
 * The "they paid but can't have the seats" outcome: mark the booking failed,
 * recording the full charge as a refund we owe, then pay it back. Reached
 * two ways — the hold expired before the webhook arrived, or the database
 * refused the confirmation because another booking already holds a seat.
 *
 * Letting a Stripe failure throw here is deliberate: the resulting 500 makes
 * Stripe redeliver the event, and the resume branch in handlePaymentSucceeded
 * completes the refund on that delivery.
 */
const failAndRefund = async (booking) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: booking._id, status: "pending" },
    { status: "failed", refundAmount: booking.amount, refundStatus: "pending" },
    { returnDocument: "after" }
  );
  if (!claimed) return; // someone else resolved it first
  await settleRefund(claimed);
};

const handlePaymentSucceeded = async (paymentIntent) => {
  const booking = await Booking.findOne({ paymentIntentId: paymentIntent.id });
  if (!booking) return; // unknown payment intent

  // Stripe redelivers any event whose handling failed. If what failed was
  // the refund for a booking already marked failed, finish it here — the
  // status check below would otherwise treat this as "already resolved" and
  // no-op, leaving the customer charged for seats they never got.
  if (booking.status === "failed" && booking.refundStatus === "pending") {
    await settleRefund(booking);
    return;
  }

  if (booking.status !== "pending") return; // already resolved — idempotent no-op

  const token = paymentIntent.metadata?.lockToken;
  const stillOwned = token
    ? await seatLockService.verifyLockOwnership(
        booking.showtime.toString(),
        booking.seatIds,
        token
      )
    : false;
  if (!stillOwned) {
    await failAndRefund(booking);
    return;
  }

  // Atomically claim the pending -> confirmed transition. If a concurrent
  // delivery of this same event already resolved this booking, this matches
  // nothing and we skip the side effects below — that's what makes a
  // re-delivered webhook safe to no-op rather than double-acting.
  let claimed;
  try {
    claimed = await Booking.findOneAndUpdate(
      { _id: booking._id, status: "pending" },
      { status: "confirmed" },
      { returnDocument: "after" }
    );
  } catch (err) {
    // The unique (showtime, seatIds) index on confirmed bookings rejected
    // this write: someone else's booking already holds one of these seats.
    // That's the lock-expired-mid-confirmation race, caught by the database
    // rather than by trusting Redis. Refund rather than sell the seat twice.
    if (err?.code !== 11000) throw err;
    console.error(
      `Confirmation rejected: seats already confirmed elsewhere (booking ${booking._id})`
    );
    await failAndRefund(booking);
    return;
  }
  if (!claimed) return;

  const showtimeId = booking.showtime.toString();
  // Checked before releasing the lock below — fulfillIfMatchingOffer only
  // needs the seatIds, and doing this first means "was this booking the
  // exclusive hold being exercised" is judged against the lock that was
  // actually still there a moment ago, not after it's already gone.
  try {
    await waitlistService.fulfillIfMatchingOffer(
      booking.user.toString(),
      showtimeId,
      booking.seatIds
    );
  } catch (err) {
    console.error("Waitlist fulfillment check failed:", err);
  }
  await seatLockService.releaseLocksByToken(showtimeId, token);
  // The lock is gone from Redis now, but getUnavailableSeatIds re-includes
  // these seats via the Booking we just confirmed above — so the broadcast
  // still shows them unavailable, permanently, not just until the lock
  // would have expired.
  emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
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
