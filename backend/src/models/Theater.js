import mongoose from "mongoose";

const theaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: {
      address: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
    },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

theaterSchema.index({ "location.city": 1 });

export const Theater = mongoose.model("Theater", theaterSchema);
