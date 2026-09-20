import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    showtime: { type: mongoose.Schema.Types.ObjectId, ref: "Showtime", required: true },
    theater: { type: mongoose.Schema.Types.ObjectId, ref: "Theater", required: true },
    seatIds: { type: [String], required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed", "cancelled"],
      default: "pending",
    },
    // unique+sparse: every booking gets one at creation in practice, but
    // sparse keeps the door open for a future booking path that doesn't.
    paymentIntentId: { type: String, unique: true, sparse: true },
    // Populated only when status is "cancelled" — refundAmount is 0 (not
    // unset) for a within-6-hours cancellation, so its presence/absence
    // isn't itself meaningful, only cancelledAt is (a cheap "was this ever
    // cancelled" check without a status comparison).
    refundAmount: { type: Number },
    refundId: { type: String },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1 });
// Seat availability asks "which seats are confirmed-booked for this
// showtime?" on every lock, every /locks poll, every pricing and
// recommendation call — the hottest read in the app. The unique index below
// can serve the showtime prefix for confirmed rows, but only this one covers
// any status (the delete guard counts all bookings for a showtime) without
// depending on that index's partial filter.
bookingSchema.index({ showtime: 1, status: 1 });
// The last line of defence against selling one seat twice. Redis locks make
// that race vanishingly unlikely, but not impossible: a lock can expire in
// the gap between the webhook verifying ownership and writing "confirmed".
// This is multikey (seatIds is an array), so it enforces one CONFIRMED
// booking per (showtime, seat) inside the database itself, no matter what
// Redis believed. The partial filter is what keeps it from blocking
// legitimate reuse — cancelled and failed bookings hold no claim on a seat,
// so those seats stay bookable.
bookingSchema.index(
  { showtime: 1, seatIds: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);
// Every analyticsService pipeline either scopes by theater, filters by
// status, or both (revenue/cancellation-rate/top-movies/peak-times/
// theater-performance) — one compound index serves all of them.
bookingSchema.index({ theater: 1, status: 1 });

export const Booking = mongoose.model("Booking", bookingSchema);
