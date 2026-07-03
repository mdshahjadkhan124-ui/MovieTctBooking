import mongoose from "mongoose";

const seatCategorySchema = new mongoose.Schema(
  {
    category: { type: String, required: true, trim: true },
    rows: [{ type: String, trim: true }],
  },
  { _id: false }
);

const screenSchema = new mongoose.Schema(
  {
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theater",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    layout: {
      rows: { type: Number, required: true, min: 1 },
      columns: { type: Number, required: true, min: 1 },
      seatCategories: [seatCategorySchema],
      unavailableSeats: [{ type: String, trim: true }],
    },
  },
  { timestamps: true }
);

screenSchema.index({ theater: 1 });

export const Screen = mongoose.model("Screen", screenSchema);
