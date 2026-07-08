import { Movie } from "../models/Movie.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { Theater } from "../models/Theater.js";
import { AppError } from "../utils/AppError.js";
import { assertTheaterAccess } from "../utils/assertTheaterAccess.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { recommendSeats } from "./seatRecommendation.js";
import * as seatLockService from "./seatLockService.js";
import { emitSeatsUpdated } from "../config/socket.js";

const assertNoOverlap = async (screenId, startTime, endTime, excludeId) => {
  const query = {
    screen: screenId,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const clash = await Showtime.findOne(query);
  if (clash) {
    throw new AppError(
      "This screen already has an overlapping showtime in that window",
      409,
      "SHOWTIME_OVERLAP"
    );
  }
};

export const createShowtime = async (user, data) => {
  const movie = await Movie.findById(data.movie);
  if (!movie) throw new AppError("Movie not found", 404, "NOT_FOUND");

  const screen = await Screen.findById(data.screen);
  if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");

  assertTheaterAccess(user, screen.theater);

  const startTime = new Date(data.startTime);
  // endTime defaults from the movie's own runtime when the caller doesn't
  // supply one, so a showtime is never left without a real end boundary
  // (the overlap check below depends on it).
  const endTime = data.endTime
    ? new Date(data.endTime)
    : new Date(startTime.getTime() + movie.durationMinutes * 60 * 1000);

  await assertNoOverlap(screen._id, startTime, endTime);

  return Showtime.create({
    movie: movie._id,
    screen: screen._id,
    theater: screen.theater, // always derived from the screen, never trusted from the client
    startTime,
    endTime,
    price: data.price,
    format: data.format,
    language: data.language,
  });
};

export const updateShowtime = async (user, id, updates) => {
  const showtime = await Showtime.findById(id);
  if (!showtime) throw new AppError("Showtime not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, showtime.theater);

  if (updates.screen && updates.screen !== showtime.screen.toString()) {
    const screen = await Screen.findById(updates.screen);
    if (!screen) throw new AppError("Screen not found", 404, "NOT_FOUND");
    assertTheaterAccess(user, screen.theater);
    showtime.screen = screen._id;
    showtime.theater = screen.theater;
  }

  if (updates.movie) showtime.movie = updates.movie;
  if (updates.price !== undefined) showtime.price = updates.price;
  if (updates.format) showtime.format = updates.format;
  if (updates.language) showtime.language = updates.language;
  if (updates.isActive !== undefined) showtime.isActive = updates.isActive;
  if (updates.startTime) showtime.startTime = new Date(updates.startTime);
  if (updates.endTime) showtime.endTime = new Date(updates.endTime);

  await assertNoOverlap(showtime.screen, showtime.startTime, showtime.endTime, showtime._id);

  await showtime.save();
  return showtime;
};

export const deleteShowtime = async (user, id) => {
  const showtime = await Showtime.findById(id);
  if (!showtime) throw new AppError("Showtime not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, showtime.theater);
  await showtime.deleteOne();
};

export const getShowtimeByIdAdmin = async (user, id) => {
  const showtime = await Showtime.findById(id);
  if (!showtime) throw new AppError("Showtime not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, showtime.theater);
  return showtime;
};

export const listShowtimesAdmin = async (user, filters = {}) => {
  const query = {};
  if (filters.theater) query.theater = filters.theater;
  if (filters.movie) query.movie = filters.movie;
  if (user.role === "theater_admin") query.theater = user.theater;

  return Showtime.find(query).sort({ startTime: 1 });
};

export const getPublicShowtimeById = async (id) => {
  const showtime = await Showtime.findById(id)
    .populate("movie")
    .populate("theater")
    .populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }
  return showtime;
};

export const getShowtimeRecommendation = async (id, count) => {
  const showtime = await Showtime.findById(id).populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }

  // Real booked-seat data (Redis locks + confirmed bookings) arrives in
  // Sprint 5; until then every showtime is treated as having zero booked
  // seats — buildSeatGrid already accepts and honors that input.
  const grid = buildSeatGrid(showtime.screen.layout, new Set());
  return recommendSeats(grid, count);
};

export const lockSeats = async (showtimeId, seatIds, userId) => {
  const showtime = await Showtime.findById(showtimeId).populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }

  // Reject bogus/typo'd seat ids or ones the layout itself marks unavailable
  // before ever touching Redis — Redis locking is only meaningful for real,
  // layout-available seats.
  const grid = buildSeatGrid(showtime.screen.layout, new Set());
  const validSeatIds = new Set(
    grid.flat().filter((seat) => seat.status === "available").map((seat) => seat.id)
  );
  const invalidSeatIds = seatIds.filter((id) => !validSeatIds.has(id));
  if (invalidSeatIds.length > 0) {
    throw new AppError(
      `Invalid or unavailable seat(s): ${invalidSeatIds.join(", ")}`,
      400,
      "INVALID_SEATS"
    );
  }

  const result = await seatLockService.acquireLocks(showtimeId, seatIds, userId);
  if (result.success) {
    // Broadcast is a side effect of a successful lock, not a dependency of
    // it — emitSeatsUpdated never throws, so a socket outage can't fail a
    // real lock acquisition.
    const lockedSeatIds = await seatLockService.getLockedSeatIds(showtimeId);
    emitSeatsUpdated(showtimeId, lockedSeatIds);
  }
  return result;
};

export const releaseSeatLocks = async (showtimeId, token) => {
  const released = await seatLockService.releaseLocksByToken(showtimeId, token);
  const lockedSeatIds = await seatLockService.getLockedSeatIds(showtimeId);
  emitSeatsUpdated(showtimeId, lockedSeatIds);
  return released;
};

export const getLockedSeats = (showtimeId) => seatLockService.getLockedSeatIds(showtimeId);

export const listPublicShowtimes = async (filters = {}) => {
  const query = { isActive: true };

  if (filters.movie) query.movie = filters.movie;

  if (filters.city) {
    const theaterIds = await Theater.find({
      "location.city": filters.city,
      isActive: true,
    }).distinct("_id");
    query.theater = { $in: theaterIds };
  }

  if (filters.date) {
    const start = new Date(filters.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    query.startTime = { $gte: start, $lt: end };
  }

  return Showtime.find(query)
    .populate("movie")
    .populate("theater")
    .populate("screen")
    .sort({ startTime: 1 });
};
