import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Showtime } from "../models/Showtime.js";
import { AppError } from "../utils/AppError.js";

export const createMovie = (data) => Movie.create(data);

export const updateMovie = async (id, updates) => {
  const movie = await Movie.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!movie) throw new AppError("Movie not found", 404, "NOT_FOUND");
  return movie;
};

export const deleteMovie = async (id) => {
  const movie = await Movie.findByIdAndDelete(id);
  if (!movie) throw new AppError("Movie not found", 404, "NOT_FOUND");
};

export const getMovieById = async (id, { includeInactive = false } = {}) => {
  const movie = await Movie.findById(id);
  if (!movie || (!includeInactive && !movie.isActive)) {
    throw new AppError("Movie not found", 404, "NOT_FOUND");
  }
  return movie;
};

export const listMovies = async (filters = {}, { includeInactive = false } = {}) => {
  const query = {};
  if (!includeInactive) query.isActive = true;
  if (filters.language) query.language = filters.language;
  if (filters.genre) query.genres = filters.genre;
  if (filters.search) {
    // Escape regex metacharacters so a title search can't be used to inject
    // an arbitrary pattern (e.g. a ReDoS-prone or always-true regex).
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.title = { $regex: escaped, $options: "i" };
  }

  if (filters.city) {
    // Movie has no city field of its own — "movies in city X" means movies
    // with an active showtime at an active theater in that city.
    const theaterIds = await Theater.find({
      "location.city": filters.city,
      isActive: true,
    }).distinct("_id");
    const movieIds = await Showtime.find({
      theater: { $in: theaterIds },
      isActive: true,
    }).distinct("movie");
    query._id = { $in: movieIds };
  }

  return Movie.find(query).sort({ releaseDate: -1 });
};
