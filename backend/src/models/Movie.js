import mongoose from "mongoose";

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    genres: [{ type: String, trim: true }],
    language: { type: String, trim: true },
    certification: { type: String, enum: ["U", "UA", "A"] },
    releaseDate: { type: Date },
    posterUrl: { type: String, trim: true },
    // Wider than the poster — used for the home page hero carousel and the
    // detail page's banner, not for the movie card grid.
    backdropUrl: { type: String, trim: true },
    rating: { type: Number, min: 0, max: 10 },
    castList: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

movieSchema.index({ title: 1 });
movieSchema.index({ isActive: 1 });

export const Movie = mongoose.model("Movie", movieSchema);
