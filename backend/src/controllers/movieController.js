import { asyncHandler } from "../utils/asyncHandler.js";
import * as movieService from "../services/movieService.js";

export const listPublic = asyncHandler(async (req, res) => {
  const { city, language, genre } = req.query;
  const movies = await movieService.listMovies({ city, language, genre });
  res.json({ success: true, data: { movies }, message: "" });
});

export const getPublic = asyncHandler(async (req, res) => {
  const movie = await movieService.getMovieById(req.params.id);
  res.json({ success: true, data: { movie }, message: "" });
});

export const listAdmin = asyncHandler(async (req, res) => {
  const { city, language, genre } = req.query;
  const movies = await movieService.listMovies(
    { city, language, genre },
    { includeInactive: true }
  );
  res.json({ success: true, data: { movies }, message: "" });
});

export const getAdmin = asyncHandler(async (req, res) => {
  const movie = await movieService.getMovieById(req.params.id, {
    includeInactive: true,
  });
  res.json({ success: true, data: { movie }, message: "" });
});

export const create = asyncHandler(async (req, res) => {
  const movie = await movieService.createMovie(req.body);
  res.status(201).json({ success: true, data: { movie }, message: "" });
});

export const update = asyncHandler(async (req, res) => {
  const movie = await movieService.updateMovie(req.params.id, req.body);
  res.json({ success: true, data: { movie }, message: "" });
});

export const remove = asyncHandler(async (req, res) => {
  await movieService.deleteMovie(req.params.id);
  res.json({ success: true, data: {}, message: "Movie deleted" });
});
