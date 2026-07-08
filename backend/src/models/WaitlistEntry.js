import mongoose from "mongoose";

const waitlistEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    showtime: { type: mongoose.Schema.Types.ObjectId, ref: "Showtime", required: true },
    seatsRequested: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["waiting", "notified", "fulfilled", "expired", "cancelled"],
      default: "waiting",
    },
    notifiedAt: { type: Date },
    // Redis lock token + the exact seats it covers, set only while
    // status === "notified" — needed to release the exact hold on expiry/
    // leave, and to confirm a later booking matches the offer (-> fulfilled).
    // Left in place (not cleared) after the entry resolves as a cheap audit
    // trail of what was actually offered.
    holdToken: { type: String },
    heldSeatIds: { type: [String] },
  },
  { timestamps: true }
);

// FIFO queue scan for a showtime's active entries, in join order.
waitlistEntrySchema.index({ showtime: 1, status: 1, createdAt: 1 });

// Partial unique index: at most one ACTIVE (waiting/notified) entry per user
// per showtime, enforced atomically at the DB level so a duplicate-submit
// race can't slip two active entries through — but still allows the same
// user to join again later after an earlier entry resolved (fulfilled/
// expired/cancelled), since the index simply doesn't apply to those rows.
waitlistEntrySchema.index(
  { user: 1, showtime: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["waiting", "notified"] } } }
);

export const WaitlistEntry = mongoose.model("WaitlistEntry", waitlistEntrySchema);
