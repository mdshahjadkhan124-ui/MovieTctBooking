import mongoose from "mongoose";
import { DEFAULT_TIMEZONE } from "../utils/timezone.js";

const theaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: {
      address: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
    },
    // IANA zone this venue's clock runs on. Prime-time/weekend pricing and
    // "showtimes on date X" are answered in this zone, so they don't change
    // meaning when the server does (local in dev, UTC on Render).
    timezone: { type: String, trim: true, default: DEFAULT_TIMEZONE },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

theaterSchema.index({ "location.city": 1 });

export const Theater = mongoose.model("Theater", theaterSchema);
