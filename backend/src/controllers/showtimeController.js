import { asyncHandler } from "../utils/asyncHandler.js";
import * as showtimeService from "../services/showtimeService.js";

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
  res.json({ success: true, data: { released }, message: "" });
});

export const lockStatus = asyncHandler(async (req, res) => {
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
