import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";

const sampleMovies = [
  {
    title: "The Last Horizon",
    description: "A crew ventures beyond the edge of known space.",
    durationMinutes: 148,
    genres: ["Sci-Fi", "Adventure"],
    language: "English",
    certification: "UA",
    releaseDate: new Date("2026-01-10"),
    rating: 8.1,
    castList: ["Rhea Kapoor", "Vikram Sen"],
  },
  {
    title: "Monsoon Wedding Blues",
    description: "A chaotic wedding weekend in Jaipur.",
    durationMinutes: 132,
    genres: ["Comedy", "Drama"],
    language: "Hindi",
    certification: "U",
    releaseDate: new Date("2026-02-14"),
    rating: 7.4,
    castList: ["Anaya Rao", "Dev Malhotra"],
  },
  {
    title: "Steel City",
    description: "A detective chases a syndicate through an industrial metropolis.",
    durationMinutes: 121,
    genres: ["Action", "Thriller"],
    language: "English",
    certification: "A",
    releaseDate: new Date("2025-11-05"),
    rating: 6.9,
    castList: ["Marcus Lee", "Ines Duarte"],
  },
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
];

const run = async () => {
  await connectDB();

  const movieDocs = [];
  for (const m of sampleMovies) {
    let movie = await Movie.findOne({ title: m.title });
    if (!movie) movie = await Movie.create(m);
    movieDocs.push(movie);
  }

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
        layout: {
          rows: 8,
          columns: 12,
          seatCategories: [
            { category: "Premium", rows: ["A", "B"] },
            { category: "Regular", rows: ["C", "D", "E", "F", "G", "H"] },
          ],
          unavailableSeats: [],
        },
      });
    }
    screenDocs.push(screen);
  }

  const existingShowtimeCount = await Showtime.countDocuments();
  if (existingShowtimeCount === 0) {
    const now = new Date();
    for (let i = 0; i < screenDocs.length; i++) {
      const screen = screenDocs[i];
      const movie = movieDocs[i % movieDocs.length];
      const startTime = new Date(now.getTime() + (i + 1) * 3 * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + movie.durationMinutes * 60 * 1000);

      await Showtime.create({
        movie: movie._id,
        screen: screen._id,
        theater: screen.theater,
        startTime,
        endTime,
        price: 220,
        format: "2D",
        language: movie.language,
      });
    }
    console.log("Seeded sample showtimes.");
  } else {
    console.log("Showtimes already exist, skipping showtime seed.");
  }

  console.log("Catalog seed complete.");
  await mongoose.disconnect();
};

run();
