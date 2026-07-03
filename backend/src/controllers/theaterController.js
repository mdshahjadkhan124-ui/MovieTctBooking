import { asyncHandler } from "../utils/asyncHandler.js";
import * as theaterService from "../services/theaterService.js";

export const listPublic = asyncHandler(async (req, res) => {
  const { city } = req.query;
  const theaters = await theaterService.listTheaters({ city });
  res.json({ success: true, data: { theaters }, message: "" });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const { city } = req.query;
  const theaters = await theaterService.listTheaters(
    { city },
    { includeInactive: true }
  );
  res.json({ success: true, data: { theaters }, message: "" });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const theater = await theaterService.getTheaterById(req.params.id, {
    includeInactive: true,
  });
  res.json({ success: true, data: { theater }, message: "" });
});

export const create = asyncHandler(async (req, res) => {
  const theater = await theaterService.createTheater(req.body);
  res.status(201).json({ success: true, data: { theater }, message: "" });
});

export const update = asyncHandler(async (req, res) => {
  const theater = await theaterService.updateTheater(req.params.id, req.body);
  res.json({ success: true, data: { theater }, message: "" });
});

export const remove = asyncHandler(async (req, res) => {
  await theaterService.deleteTheater(req.params.id);
  res.json({ success: true, data: {}, message: "Theater deleted" });
});
