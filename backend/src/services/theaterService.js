import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";

export const createTheater = (data) => Theater.create(data);

export const updateTheater = async (id, updates) => {
  const theater = await Theater.findByIdAndUpdate(id, updates, {
    returnDocument: "after",
    runValidators: true,
  });
  if (!theater) throw new AppError("Theater not found", 404, "NOT_FOUND");
  return theater;
};

export const deleteTheater = async (id) => {
  // Screens and showtimes both reference a theater; bookings reference it
  // directly too (denormalized for analytics). Deleting one out from under
  // them orphans all of it — `isActive: false` is the way to retire a venue.
  const [screenCount, showtimeCount] = await Promise.all([
    Screen.countDocuments({ theater: id }),
    Showtime.countDocuments({ theater: id }),
  ]);
  if (screenCount > 0 || showtimeCount > 0) {
    throw new AppError(
      `Can't delete this theater — it still has ${screenCount} screen(s) and ${showtimeCount} showtime(s). Deactivate it instead.`,
      409,
      "HAS_DEPENDENTS"
    );
  }

  const theater = await Theater.findByIdAndDelete(id);
  if (!theater) throw new AppError("Theater not found", 404, "NOT_FOUND");
};

export const getTheaterById = async (id, { includeInactive = false } = {}) => {
  const theater = await Theater.findById(id);
  if (!theater || (!includeInactive && !theater.isActive)) {
    throw new AppError("Theater not found", 404, "NOT_FOUND");
  }
  return theater;
};

export const listTheaters = async (
  filters = {},
  { includeInactive = false, skip = 0, limit } = {}
) => {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (filters.city) query["location.city"] = filters.city;

  const [theaters, total] = await Promise.all([
    Theater.find(query).sort({ name: 1 }).skip(skip).limit(limit),
    Theater.countDocuments(query),
  ]);
  return { theaters, total };
};
