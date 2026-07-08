import { asyncHandler } from "../utils/asyncHandler.js";
import * as showtimeService from "../services/showtimeService.js";
import * as waitlistService from "../services/waitlistService.js";

// showtimeService can't import waitlistService directly (waitlistService
// already depends on showtimeService for seat availability — importing it
// back would be circular), so the two opportunistic triggers below
// (release, and the polled locks read) live here at the controller instead.
// Never let a waitlist bug fail the request it's riding on.
const processWaitlistSafely = async (showtimeId) => {
  try {
    await waitlistService.processWaitlist(showtimeId);
  } catch (err) {
    console.error("Waitlist processing failed:", err);
  }
};

export const listPublic = asyncHandler(async (req, res) => {
  const { movie, city, date } = req.query;
  const showtimes = await showtimeService.listPublicShowtimes({
    movie,
    city,
    date,
  });
  res.json({ success: true, data: { showtimes }, message: "" });
});

export const getPublic = asyncHandler(async (req, res) => {
  const showtime = await showtimeService.getPublicShowtimeById(req.params.id);
  res.json({ success: true, data: { showtime }, message: "" });
});

export const recommend = asyncHandler(async (req, res) => {
  const count = Number(req.query.count);
  const recommendation = await showtimeService.getShowtimeRecommendation(
    req.params.id,
    count
  );
  res.json({
    success: true,
    data: { recommendation },
    message: recommendation ? "" : "No seats available for the requested count.",
  });
});

export const pricing = asyncHandler(async (req, res) => {
  const result = await showtimeService.getSeatPricing(req.params.id);
  res.json({ success: true, data: result, message: "" });
});

export const lock = asyncHandler(async (req, res) => {
  const { seatIds } = req.body;
  const result = await showtimeService.lockSeats(
    req.params.id,
    seatIds,
    req.user._id.toString()
  );

  if (!result.success) {
    return res.status(409).json({
      success: false,
      error: {
        code: "SEATS_UNAVAILABLE",
        message: "Some seats are already locked",
        unavailable: result.unavailable,
      },
    });
  }

  res.json({
    success: true,
    data: { token: result.token, expiresAt: result.expiresAt },
    message: "",
  });
});

export const releaseLock = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const released = await showtimeService.releaseSeatLocks(req.params.id, token);
  // A manual release is an instant, explicit version of "lock expiry" — one
  // of the two seat-freeing events the waitlist is meant to react to.
  await processWaitlistSafely(req.params.id);
  res.json({ success: true, data: { released }, message: "" });
});

export const lockStatus = asyncHandler(async (req, res) => {
  // No Redis keyspace notifications wired up, so an expired offer otherwise
  // sits un-reconciled until something checks — this frequently-polled read
  // is the low-cost opportunistic checkpoint that catches it (see
  // waitlistService's processWaitlist doc comment).
  await processWaitlistSafely(req.params.id);
  const lockedSeatIds = await showtimeService.getLockedSeats(req.params.id);
  res.json({ success: true, data: { lockedSeatIds }, message: "" });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const { theater, movie } = req.query;
  const showtimes = await showtimeService.listShowtimesAdmin(req.user, {
    theater,
    movie,
  });
  res.json({ success: true, data: { showtimes }, message: "" });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const showtime = await showtimeService.getShowtimeByIdAdmin(
    req.user,
    req.params.id
  );
  res.json({ success: true, data: { showtime }, message: "" });
});

export const create = asyncHandler(async (req, res) => {
  const showtime = await showtimeService.createShowtime(req.user, req.body);
  res.status(201).json({ success: true, data: { showtime }, message: "" });
});

export const update = asyncHandler(async (req, res) => {
  const showtime = await showtimeService.updateShowtime(
    req.user,
    req.params.id,
    req.body
  );
  res.json({ success: true, data: { showtime }, message: "" });
});

export const remove = asyncHandler(async (req, res) => {
  await showtimeService.deleteShowtime(req.user, req.params.id);
  res.json({ success: true, data: {}, message: "Showtime deleted" });
});
