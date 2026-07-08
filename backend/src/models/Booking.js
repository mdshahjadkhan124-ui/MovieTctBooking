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
// Every analyticsService pipeline either scopes by theater, filters by
// status, or both (revenue/cancellation-rate/top-movies/peak-times/
// theater-performance) — one compound index serves all of them.
bookingSchema.index({ theater: 1, status: 1 });

export const Booking = mongoose.model("Booking", bookingSchema);
