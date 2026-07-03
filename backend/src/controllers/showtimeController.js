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
