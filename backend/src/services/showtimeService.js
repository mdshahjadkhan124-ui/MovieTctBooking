import { Movie } from "../models/Movie.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { Theater } from "../models/Theater.js";
import { Booking } from "../models/Booking.js";
import { AppError } from "../utils/AppError.js";
import { assertTheaterAccess } from "../utils/assertTheaterAccess.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { recommendSeats } from "./seatRecommendation.js";
import * as seatLockService from "./seatLockService.js";
import { emitSeatsUpdated } from "../config/socket.js";
import { calculateSeatPrice } from "./pricingService.js";
import { zonedDayRange } from "../utils/timezone.js";

const getConfirmedBookedSeatIds = async (showtimeId) => {
  const bookings = await Booking.find({ showtime: showtimeId, status: "confirmed" }).select(
    "seatIds"
  );
  return bookings.flatMap((booking) => booking.seatIds);
};

/**
 * The seat grid's real "unavailable" set for a showtime — active Redis
 * locks (temporary holds) union'd with confirmed bookings (permanent).
 * A lock is released once a booking confirms (see bookingService), so
 * Redis alone can't answer "is this seat gone forever" — this is the one
 * place that combines both, used for the /locks response and the emitted
 * seatsUpdated payload. (lockSeats uses a caller-aware variant, since the
 * caller's OWN locks don't make a seat unavailable to them.)
 */
export const getUnavailableSeatIds = async (showtimeId) => {
  const [lockedSeatIds, bookedSeatIds] = await Promise.all([
    seatLockService.getLockedSeatIds(showtimeId),
    getConfirmedBookedSeatIds(showtimeId),
  ]);
  return Array.from(new Set([...lockedSeatIds, ...bookedSeatIds]));
};

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

  // Any booking — including cancelled and failed ones — reads its movie,
  // screen and times through this showtime, so deleting it would break a
  // customer's own booking history. `isActive: false` pulls a showtime from
  // sale without destroying that history.
  const bookingCount = await Booking.countDocuments({ showtime: id });
  if (bookingCount > 0) {
    throw new AppError(
      `Can't delete this showtime — ${bookingCount} booking(s) reference it. Deactivate it instead.`,
      409,
      "HAS_DEPENDENTS"
    );
  }

  await showtime.deleteOne();
};

export const getShowtimeByIdAdmin = async (user, id) => {
  const showtime = await Showtime.findById(id);
  if (!showtime) throw new AppError("Showtime not found", 404, "NOT_FOUND");
  assertTheaterAccess(user, showtime.theater);
  return showtime;
};

export const listShowtimesAdmin = async (user, filters = {}, { skip = 0, limit } = {}) => {
  const query = {};
  if (filters.theater) query.theater = filters.theater;
  if (filters.movie) query.movie = filters.movie;
  if (user.role === "theater_admin") query.theater = user.theater;

  const [showtimes, total] = await Promise.all([
    Showtime.find(query).sort({ startTime: 1 }).skip(skip).limit(limit),
    Showtime.countDocuments(query),
  ]);
  return { showtimes, total };
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

  const unavailableSeatIds = await getUnavailableSeatIds(id);
  const grid = buildSeatGrid(showtime.screen.layout, new Set(unavailableSeatIds));
  return recommendSeats(grid, count);
};

export const lockSeats = async (showtimeId, seatIds, userId) => {
  const showtime = await Showtime.findById(showtimeId).populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }

  // Two different failures, deliberately kept apart because they mean
  // different things to the caller:
  //
  //  1. INVALID — a typo'd seat id, or one the layout itself disables. That
  //     is bad input and will never succeed on retry: 400 INVALID_SEATS.
  //  2. TAKEN — a real seat that someone ELSE holds or has already booked.
  //     That is a conflict, not bad input — it may even free up again — so
  //     it goes down the same 409 SEATS_UNAVAILABLE path as a race lost
  //     inside acquireLocks, and the client sees one shape for "someone got
  //     there first" whichever check caught it.
  //
  // Seats the caller already holds count as neither, so retrying checkout
  // (e.g. after a declined card) re-acquires them instead of failing
  // against the caller's own lock. (acquireLocks' atomic script is what
  // actually prevents two users locking one seat; this upfront check
  // additionally catches the confirmed-booking case, which Redis has no
  // record of once that booking's lock was released.)
  const layoutGrid = buildSeatGrid(showtime.screen.layout);
  const realSeatIds = new Set(
    layoutGrid.flat().filter((seat) => seat.status === "available").map((seat) => seat.id)
  );
  const invalidSeatIds = seatIds.filter((id) => !realSeatIds.has(id));
  if (invalidSeatIds.length > 0) {
    throw new AppError(
      `Invalid or unavailable seat(s): ${invalidSeatIds.join(", ")}`,
      400,
      "INVALID_SEATS"
    );
  }

  const [bookedSeatIds, lockedByOthers] = await Promise.all([
    getConfirmedBookedSeatIds(showtimeId),
    seatLockService.getSeatIdsLockedByOthers(showtimeId, userId),
  ]);
  const takenSeatIds = new Set([...bookedSeatIds, ...lockedByOthers]);
  const unavailable = seatIds.filter((id) => takenSeatIds.has(id));
  if (unavailable.length > 0) {
    return { success: false, unavailable };
  }

  const result = await seatLockService.acquireLocks(showtimeId, seatIds, userId);
  if (result.success) {
    // Broadcast is a side effect of a successful lock, not a dependency of
    // it — emitSeatsUpdated never throws, so a socket outage can't fail a
    // real lock acquisition.
    emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
  }
  return result;
};

export const releaseSeatLocks = async (showtimeId, token) => {
  const released = await seatLockService.releaseLocksByToken(showtimeId, token);
  emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
  return released;
};

export const getLockedSeats = (showtimeId) => getUnavailableSeatIds(showtimeId);

/**
 * Live per-seat pricing for a showtime: every seat in the layout, priced
 * against the CURRENT occupancy at request time — this is why it's computed
 * fresh per request rather than cached/stored, occupancy shifts as seats
 * sell. Purely informational for display; checkout (bookingService) recomputes
 * this independently server-side rather than trusting whatever the client
 * last saw here.
 */
export const getSeatPricing = async (showtimeId) => {
  // theater is pulled in for its timezone: time-of-day pricing is decided on
  // the cinema's clock, not the server's.
  const showtime = await Showtime.findById(showtimeId)
    .populate("screen")
    .populate("theater", "timezone");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }
  if (typeof showtime.price !== "number" || showtime.price <= 0) {
    throw new AppError("This showtime has no price set", 400, "NO_PRICE");
  }

  const allSeats = buildSeatGrid(showtime.screen.layout).flat();
  const unavailableSeatIds = await getUnavailableSeatIds(showtimeId);
  const occupancy = allSeats.length > 0 ? unavailableSeatIds.length / allSeats.length : 0;

  const timeZone = showtime.theater?.timezone;
  const seatPrices = allSeats.map((seat) => {
    const { finalPrice, breakdown } = calculateSeatPrice(
      showtime.price,
      seat,
      showtime,
      occupancy,
      timeZone
    );
    return { seatId: seat.id, category: seat.category, finalPrice, breakdown };
  });

  return { basePrice: showtime.price, occupancy, seatPrices };
};

export const listPublicShowtimes = async (filters = {}, { skip = 0, limit } = {}) => {
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
    // "Showtimes on the 19th" means the 19th where the cinema is. Computed
    // in the app's timezone rather than the server's, so the same query
    // returns the same day's shows in dev (IST) and on Render (UTC).
    // Per-theater zones would need one range per zone; every venue here is
    // in one country, so the default zone is the honest simplification.
    const { start, end } = zonedDayRange(filters.date);
    query.startTime = { $gte: start, $lt: end };
  }

  const [showtimes, total] = await Promise.all([
    Showtime.find(query)
      .populate("movie")
      .populate("theater")
      .populate("screen")
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(limit),
    Showtime.countDocuments(query),
  ]);
  return { showtimes, total };
};
