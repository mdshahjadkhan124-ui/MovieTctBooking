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
    name: "PVR Vega City",
    location: { address: "Vega City Mall, Bannerghatta Road", city: "Bengaluru" },
  },
  {
    name: "Cinepolis Andheri",
    location: { address: "Fun Republic, Andheri West", city: "Mumbai" },
  },
  {
    name: "PVR Phoenix Marketcity",
    location: { address: "Phoenix Marketcity, Kurla", city: "Mumbai" },
  },
  {
    name: "INOX R-City",
    location: { address: "R-City Mall, Ghatkopar", city: "Mumbai" },
  },
  {
    name: "PVR Select Citywalk",
    location: { address: "Select Citywalk, Saket", city: "Delhi" },
  },
  {
    name: "INOX Nehru Place",
    location: { address: "Nehru Place", city: "Delhi" },
  },
  {
    name: "PVR Rajouri Garden",
    location: { address: "Rajouri Garden", city: "Delhi" },
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

const SHOWTIMES_PER_THEATER = 3;
const HOUR_SLOTS = [10, 13, 16, 19]; // typical showtimes: 10am/1pm/4pm/7pm
// Per-screen slot search depth. A screen only ever needs a handful of these
// (a few movies x a few slots), so this is generous headroom, not a real
// expected ceiling — it exists purely so a scheduling bug fails loudly
// instead of looping.
const MAX_SLOT_SEARCH_ATTEMPTS = 400;

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
  return { theaterDocs, screenDocs };
};

// Which cities each movie is CURRENTLY showing in, using only the theaters
// that exist before this run adds any new ones. This is what "relevant
// city" means for a movie below — captured up front so a movie's set of
// cities never silently grows on a later re-run just because a city it was
// never in gained more theaters.
const computeMovieCityRelevance = async () => {
  const theaters = await Theater.find({}).lean();
  const cityByTheaterId = Object.fromEntries(
    theaters.map((t) => [t._id.toString(), t.location?.city])
  );
  const showtimes = await Showtime.find({ isActive: true }).select("movie theater").lean();

  const map = new Map(); // movieId -> Set<city>
  for (const st of showtimes) {
    const city = cityByTheaterId[st.theater.toString()];
    if (!city) continue;
    const key = st.movie.toString();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(city);
  }
  return map;
};

// Uses the real admin showtimeService.createShowtime path (not a raw
// Showtime.create) so the same overlap-per-screen rule that protects the
// admin API also protects seed data — a synthetic super_admin bypasses the
// theater-ownership check that only applies to theater_admin callers.
const SEED_ADMIN_USER = { role: "super_admin" };

// One monotonically-advancing (dayOffset, hour) cursor per screen, shared
// across every movie scheduled on it. Each call hands out the next slot and
// moves on regardless of whether the caller ends up using it — so a screen
// that already has showtimes from an earlier run (scattered across whatever
// slots the old seed logic picked) just gets swept past via the
// SHOWTIME_OVERLAP catch below, never revisited, and every movie still
// needing slots gets fresh, non-colliding ones.
const makeSlotCursor = () => {
  const cursors = new Map(); // screenId -> { dayOffset, hourIndex }
  return (screenId) => {
    if (!cursors.has(screenId)) cursors.set(screenId, { dayOffset: 1, hourIndex: 0 });
    const cursor = cursors.get(screenId);
    const slot = { dayOffset: cursor.dayOffset, hour: HOUR_SLOTS[cursor.hourIndex] };
    cursor.hourIndex += 1;
    if (cursor.hourIndex >= HOUR_SLOTS.length) {
      cursor.hourIndex = 0;
      cursor.dayOffset += 1;
    }
    return slot;
  };
};

// Tops up every (movie, theater) pair implied by movieCityMap to at least
// SHOWTIMES_PER_THEATER future showtimes — counting whatever already
// exists first, so a re-run (or the theaters that already had 1 showtime
// from the original seed) only ever creates the shortfall, never
// duplicates.
const seedShowtimesForMovies = async (movieDocs, theaterDocs, screenDocs, movieCityMap) => {
  const screenByTheaterId = new Map(screenDocs.map((s) => [s.theater.toString(), s]));
  const theatersByCity = new Map();
  for (const theater of theaterDocs) {
    const city = theater.location?.city;
    if (!city) continue;
    if (!theatersByCity.has(city)) theatersByCity.set(city, []);
    theatersByCity.get(city).push(theater);
  }

  const nextSlot = makeSlotCursor();
  const now = new Date();
  let created = 0;

  for (const movie of movieDocs) {
    const cities = movieCityMap.get(movie._id.toString());
    if (!cities) continue; // this movie has no relevant city yet — nothing to seed

    for (const city of cities) {
      const theaters = theatersByCity.get(city) || [];
      for (const theater of theaters) {
        const screen = screenByTheaterId.get(theater._id.toString());
        if (!screen) continue;

        const existingCount = await Showtime.countDocuments({
          movie: movie._id,
          screen: screen._id,
          isActive: true,
          startTime: { $gt: now },
        });

        let needed = SHOWTIMES_PER_THEATER - existingCount;
        let attempts = 0;
        while (needed > 0 && attempts < MAX_SLOT_SEARCH_ATTEMPTS) {
          attempts += 1;
          const { dayOffset, hour } = nextSlot(screen._id.toString());
          const startTime = new Date();
          startTime.setDate(startTime.getDate() + dayOffset);
          startTime.setHours(hour, 0, 0, 0);

          try {
            await showtimeService.createShowtime(SEED_ADMIN_USER, {
              movie: movie._id.toString(),
              screen: screen._id.toString(),
              startTime: startTime.toISOString(),
              price: 220,
              format: "2D",
              language: movie.language,
            });
            created += 1;
            needed -= 1;
          } catch (err) {
            if (err.code !== "SHOWTIME_OVERLAP") throw err;
            // Slot already taken (an earlier seed run, most likely) —
            // the cursor has already moved on to the next one.
          }
        }

        if (needed > 0) {
          console.warn(
            `Could not fully seed "${movie.title}" at ${theater.name} — ${needed} slot(s) short after ${attempts} attempts.`
          );
        }
      }
    }
  }

  console.log(`Created ${created} new showtime(s).`);
};

const run = async () => {
  await connectDB();

  await retireOldDemoMovies();
  const movieDocs = await seedTmdbMovies();
  // Snapshot relevance BEFORE adding any new theaters — see
  // computeMovieCityRelevance's own comment for why the ordering matters.
  const movieCityMap = await computeMovieCityRelevance();
  const { theaterDocs, screenDocs } = await seedTheatersAndScreens();
  await seedShowtimesForMovies(movieDocs, theaterDocs, screenDocs, movieCityMap);

  console.log("Catalog seed complete.");
  await mongoose.disconnect();
};

run();
