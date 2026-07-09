import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import * as showtimeService from "../services/showtimeService.js";
import { getMovieForSeed } from "../services/tmdbService.js";

// Old static demo titles being replaced by real TMDB data. Movies with real
// bookings against them are deactivated instead of deleted (see below) —
// this list is only the ones confirmed to have zero bookings.
const RETIRED_DEMO_TITLES = [
  "The Last Horizon",
  "Monsoon Wedding Blues",
  "Steel City",
  "Dilli Nights",
];

// Had real bookings (including a confirmed one) against it at the time this
// catalog was refreshed with TMDB data — deactivated rather than deleted so
// those bookings/tickets keep resolving correctly.
const DEACTIVATED_DEMO_TITLES = ["Silent Ember"];

// A curated mix (not TMDB's "popular" list, which skews Hollywood/anime) so
// the catalog reliably has both Bollywood and Hollywood titles.
// A plain string is searched as-is; { title, year } disambiguates a title
// that's too common on its own (e.g. "Queen" matches many unrelated films
// across markets — the 2013 Kangana Ranaut film needs the release year).
const TMDB_SEED_TITLES = [
  "3 Idiots",
  "Dangal",
  "PK",
  "Jawan",
  "Gully Boy",
  "Zindagi Na Milegi Dobara",
  { title: "Queen", year: 2014 }, // TMDB records its release date as 2014-03-07, not 2013
  "Andhadhun",
  "Inception",
  "The Dark Knight",
  "Interstellar",
  "Oppenheimer",
  "The Shawshank Redemption",
  "Avengers: Endgame",
  "La La Land",
  // Second batch — 15 -> 24 movies, same Bollywood/Hollywood mix.
  "RRR",
  "Kabir Singh",
  "Bajrangi Bhaijaan",
  "Barfi!",
  "The Matrix",
  "Parasite",
  "Spider-Man: No Way Home",
  "Pulp Fiction",
  "Whiplash",
];

const sampleTheaters = [
  {
    name: "PVR Orion Mall",
    location: { address: "Orion Mall, Rajajinagar", city: "Bengaluru" },
  },
  {
    name: "INOX Nexus",
    location: { address: "Nexus Mall, Koramangala", city: "Bengaluru" },
  },
  {
    name: "Cinepolis Andheri",
    location: { address: "Fun Republic, Andheri West", city: "Mumbai" },
  },
  {
    name: "PVR Select Citywalk",
    location: { address: "Select Citywalk, Saket", city: "Delhi" },
  },
  {
    name: "INOX Nehru Place",
    location: { address: "Nehru Place", city: "Delhi" },
  },
];

const STANDARD_LAYOUT = {
  rows: 8,
  columns: 12,
  seatCategories: [
    { category: "Premium", rows: ["A", "B"] },
    { category: "Regular", rows: ["C", "D", "E", "F", "G", "H"] },
  ],
  unavailableSeats: [],
};

const SHOWTIMES_PER_MOVIE = 3;
const DAY_OFFSETS = [1, 2, 3]; // upcoming days, not "now", so nothing looks stale
const HOUR_SLOTS = [10, 13, 16, 19]; // typical showtimes: 10am/1pm/4pm/7pm

const retireOldDemoMovies = async () => {
  for (const title of RETIRED_DEMO_TITLES) {
    const movie = await Movie.findOne({ title });
    if (!movie) continue;
    const showtimeIds = await Showtime.find({ movie: movie._id }).distinct("_id");
    await Showtime.deleteMany({ _id: { $in: showtimeIds } });
    await Movie.deleteOne({ _id: movie._id });
    console.log(`Deleted "${title}" and its ${showtimeIds.length} showtime(s).`);
  }

  for (const title of DEACTIVATED_DEMO_TITLES) {
    const result = await Movie.findOneAndUpdate({ title }, { isActive: false });
    if (result) console.log(`Deactivated "${title}" (kept — has real bookings against it).`);
  }
};

const seedTmdbMovies = async () => {
  const movieDocs = [];
  for (const entry of TMDB_SEED_TITLES) {
    const { title, year } = typeof entry === "string" ? { title: entry, year: undefined } : entry;

    const existing = await Movie.findOne({ title: { $regex: `^${title}$`, $options: "i" } });
    // Fully idempotent skip only once a movie has a backdrop — an existing
    // movie from before backdropUrl existed still needs one more TMDB call
    // to backfill it, but that's the only field this patches; everything
    // else about an already-seeded movie is left alone.
    if (existing && existing.backdropUrl) {
      movieDocs.push(existing);
      continue;
    }

    const data = await getMovieForSeed(title, year);
    if (existing) {
      existing.backdropUrl = data.backdropUrl;
      await existing.save();
      movieDocs.push(existing);
      console.log(`Backfilled backdropUrl for "${existing.title}".`);
    } else {
      const movie = await Movie.create(data);
      movieDocs.push(movie);
      console.log(`Fetched and saved "${movie.title}" from TMDB.`);
    }
  }
  return movieDocs;
};

const seedTheatersAndScreens = async () => {
  const theaterDocs = [];
  for (const t of sampleTheaters) {
    let theater = await Theater.findOne({ name: t.name });
    if (!theater) theater = await Theater.create(t);
    theaterDocs.push(theater);
  }

  const screenDocs = [];
  for (const theater of theaterDocs) {
    let screen = await Screen.findOne({ theater: theater._id, name: "Screen 1" });
    if (!screen) {
      screen = await Screen.create({
        theater: theater._id,
        name: "Screen 1",
        layout: STANDARD_LAYOUT,
      });
    }
    screenDocs.push(screen);
  }
  return screenDocs;
};

// Uses the real admin showtimeService.createShowtime path (not a raw
// Showtime.create) so the same overlap-per-screen rule that protects the
// admin API also protects seed data — a synthetic super_admin bypasses the
// theater-ownership check that only applies to theater_admin callers.
const SEED_ADMIN_USER = { role: "super_admin" };

const createShowtimeWithRetry = async (movie, screen, dayOffset, hourSlotIndex) => {
  for (let attempt = 0; attempt < HOUR_SLOTS.length; attempt++) {
    const hour = HOUR_SLOTS[(hourSlotIndex + attempt) % HOUR_SLOTS.length];
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + dayOffset);
    startTime.setHours(hour, 0, 0, 0);

    try {
      return await showtimeService.createShowtime(SEED_ADMIN_USER, {
        movie: movie._id.toString(),
        screen: screen._id.toString(),
        startTime: startTime.toISOString(),
        price: 220,
        format: "2D",
        language: movie.language,
      });
    } catch (err) {
      if (err.code !== "SHOWTIME_OVERLAP") throw err;
      // Slot taken — try the next hour on the same day before giving up.
    }
  }
  return null;
};

const seedShowtimesForMovies = async (movieDocs, screenDocs) => {
  let created = 0;
  let skippedExisting = 0;

  for (let i = 0; i < movieDocs.length; i++) {
    const movie = movieDocs[i];
    const alreadyHasShowtimes = await Showtime.exists({ movie: movie._id });
    if (alreadyHasShowtimes) {
      skippedExisting += 1;
      continue;
    }

    for (let j = 0; j < SHOWTIMES_PER_MOVIE; j++) {
      const screen = screenDocs[(i + j) % screenDocs.length];
      const dayOffset = DAY_OFFSETS[j % DAY_OFFSETS.length];
      const hourSlotIndex = i % HOUR_SLOTS.length;
      const showtime = await createShowtimeWithRetry(movie, screen, dayOffset, hourSlotIndex);
      if (showtime) created += 1;
    }
  }

  console.log(`Created ${created} new showtime(s); ${skippedExisting} movie(s) already had showtimes.`);
};

const run = async () => {
  await connectDB();

  await retireOldDemoMovies();
  const movieDocs = await seedTmdbMovies();
  const screenDocs = await seedTheatersAndScreens();
  await seedShowtimesForMovies(movieDocs, screenDocs);

  console.log("Catalog seed complete.");
  await mongoose.disconnect();
};

run();
