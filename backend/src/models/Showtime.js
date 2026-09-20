import mongoose from "mongoose";

const showtimeSchema = new mongoose.Schema(
  {
    movie: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Movie",
      required: true,
    },
    screen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Screen",
      required: true,
    },
    theater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Theater",
      required: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    price: { type: Number, min: 0 },
    format: { type: String, enum: ["2D", "3D", "IMAX"] },
    language: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

showtimeSchema.index({ screen: 1, startTime: 1 });
// "Showtimes for this movie" backs the movie detail page and the admin
// filter, and the movie delete guard counts against it. Without this it's a
// full collection scan of every showtime ever created.
showtimeSchema.index({ movie: 1, startTime: 1 });
// analyticsService's occupancy pipeline scopes Showtime by theater for a
// theater_admin's role-scoped view.
showtimeSchema.index({ theater: 1 });

export const Showtime = mongoose.model("Showtime", showtimeSchema);
