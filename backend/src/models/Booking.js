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
      enum: ["pending", "confirmed", "failed"],
      default: "pending",
    },
    // unique+sparse: every booking gets one at creation in practice, but
    // sparse keeps the door open for a future booking path that doesn't.
    paymentIntentId: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

bookingSchema.index({ user: 1 });

export const Booking = mongoose.model("Booking", bookingSchema);
