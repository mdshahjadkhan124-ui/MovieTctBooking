import "dotenv/config";
import http from "node:http";
import mongoose from "mongoose";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app.js";
import { connectDB } from "../config/db.js";
import { connectRedis } from "../config/redis.js";
import { Booking } from "../models/Booking.js";
import { Movie } from "../models/Movie.js";
import { Theater } from "../models/Theater.js";
import { Screen } from "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { User } from "../models/User.js";
import * as showtimeService from "./showtimeService.js";
import * as movieService from "./movieService.js";
import * as theaterService from "./theaterService.js";
import * as screenService from "./screenService.js";

const runId = Date.now();

let server;
let baseUrl;
let redisClient;
let movie;
let theater;
let screen;
let showtime;
let user;
let authCookie;

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();

// 2 rows x 10 columns -> A1..A10, B1..B10 (20 seats: enough to exceed the
// 10-seat cap in a single request).
beforeAll(async () => {
  await connectDB();
  redisClient = await connectRedis();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  movie = await Movie.create({ title: "Showtime Service Test Movie", durationMinutes: 100 });
  theater = await Theater.create({ name: "Showtime Service Test Theater", location: { city: "Testville" } });
  screen = await Screen.create({
    theater: theater._id,
    name: "Showtime Service Test Screen",
    layout: { rows: 2, columns: 10 },
  });
  showtime = await Showtime.create({
    movie: movie._id,
    screen: screen._id,
    theater: theater._id,
    startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
    price: 200,
    format: "2D",
  });

  const email = `showtime-service-${runId}@example.com`;
  const password = "password123";
  user = await User.create({ name: "Showtime Service Tester", email, password });
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ email, password }),
  });
  expect(loginRes.status).toBe(200);
  authCookie = loginRes.headers.get("set-cookie").split(";")[0]; // "token=..."
}, 30000);

afterAll(async () => {
  for await (const keys of redisClient.scanIterator({ MATCH: `lock:${showtime._id}:*` })) {
    for (const key of keys) await redisClient.del(key);
  }
  await redisClient.del(`locks:${showtime._id}`);
  await Booking.deleteMany({ showtime: showtime._id });
  await Showtime.deleteOne({ _id: showtime._id });
  await Screen.deleteOne({ _id: screen._id });
  await Theater.deleteOne({ _id: theater._id });
  await Movie.deleteOne({ _id: movie._id });
  await User.deleteOne({ _id: user._id });
  await new Promise((resolve) => server.close(resolve));
  await redisClient.quit();
  await mongoose.disconnect();
});

const api = (path, { method = "GET", body, cookie = authCookie } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body && { "Content-Type": "application/json" }),
      ...(cookie && { Cookie: cookie }),
      // What the browser app sends; the CSRF guard requires it on
      // state-changing requests (see middleware/csrf.js).
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body && JSON.stringify(body),
  });

const seatRange = (row, from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${row}${from + i}`);

describe("showtimeService.lockSeats", () => {
  it("lets a user lock seats they already hold again (e.g. 'Try again' after a declined card)", async () => {
    const id = showtime._id.toString();

    const first = await showtimeService.lockSeats(id, ["A1", "A2"], userA);
    expect(first.success).toBe(true);

    const retry = await showtimeService.lockSeats(id, ["A1", "A2"], userA);
    expect(retry.success).toBe(true);
    expect(retry.token).not.toBe(first.token);
  });

  it("still rejects seats held by a different user", async () => {
    const id = showtime._id.toString();

    const heldByA = await showtimeService.lockSeats(id, ["A3"], userA);
    expect(heldByA.success).toBe(true);

    await expect(showtimeService.lockSeats(id, ["A3"], userB)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_SEATS",
    });
  });

  it("never treats a confirmed-booked seat as re-lockable, even for the user who booked it", async () => {
    const id = showtime._id.toString();
    await Booking.create({
      user: userA,
      showtime: showtime._id,
      theater: theater._id,
      seatIds: ["B1"],
      amount: 200,
      status: "confirmed",
    });

    await expect(showtimeService.lockSeats(id, ["B1"], userA)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_SEATS",
    });
  });
});

describe("delete guards (nothing is deleted out from under its dependents)", () => {
  const superAdmin = { role: "super_admin" };

  it("refuses to delete a movie that still has showtimes", async () => {
    await expect(movieService.deleteMovie(movie._id.toString())).rejects.toMatchObject({
      statusCode: 409,
      code: "HAS_DEPENDENTS",
    });
    expect(await Movie.findById(movie._id)).not.toBeNull();
  });

  it("refuses to delete a theater that still has screens or showtimes", async () => {
    await expect(theaterService.deleteTheater(theater._id.toString())).rejects.toMatchObject({
      statusCode: 409,
      code: "HAS_DEPENDENTS",
    });
    expect(await Theater.findById(theater._id)).not.toBeNull();
  });

  it("refuses to delete a screen that still has showtimes", async () => {
    await expect(
      screenService.deleteScreen(superAdmin, screen._id.toString())
    ).rejects.toMatchObject({ statusCode: 409, code: "HAS_DEPENDENTS" });
    expect(await Screen.findById(screen._id)).not.toBeNull();
  });

  it("refuses to delete a showtime that bookings reference", async () => {
    // A booking was created against this showtime earlier in this file.
    await expect(
      showtimeService.deleteShowtime(superAdmin, showtime._id.toString())
    ).rejects.toMatchObject({ statusCode: 409, code: "HAS_DEPENDENTS" });
    expect(await Showtime.findById(showtime._id)).not.toBeNull();
  });

  it("still deletes records nothing depends on", async () => {
    const spareMovie = await Movie.create({ title: "Unused Movie", durationMinutes: 90 });
    const spareTheater = await Theater.create({
      name: "Unused Theater",
      location: { city: "Testville" },
    });
    const spareScreen = await Screen.create({
      theater: spareTheater._id,
      name: "Unused Screen",
      layout: { rows: 1, columns: 2 },
    });

    await screenService.deleteScreen(superAdmin, spareScreen._id.toString());
    await theaterService.deleteTheater(spareTheater._id.toString());
    await movieService.deleteMovie(spareMovie._id.toString());

    expect(await Screen.findById(spareScreen._id)).toBeNull();
    expect(await Theater.findById(spareTheater._id)).toBeNull();
    expect(await Movie.findById(spareMovie._id)).toBeNull();
  });
});

describe("showtimeService.getShowtimeRecommendation", () => {
  it("never suggests a seat that is locked by someone else or already booked", async () => {
    const id = showtime._id.toString();
    const lockedByOther = ["B2", "B3", "B4", "B5"];
    const held = await showtimeService.lockSeats(id, lockedByOther, userB);
    expect(held.success).toBe(true);

    // Unavailable at this point: A1-A3 (locked by userA above), B1 (booked
    // above), B2-B5 (just locked by userB).
    const unavailable = new Set(["A1", "A2", "A3", "B1", ...lockedByOther]);
    const recommendation = await showtimeService.getShowtimeRecommendation(id, 4);

    expect(recommendation.seats).toHaveLength(4);
    for (const seatId of recommendation.seats) {
      expect(unavailable.has(seatId)).toBe(false);
    }
  });
});

describe("seat-count limits (through the real app)", () => {
  it("POST /lock rejects more than 10 seats in one request", async () => {
    const res = await api(`/api/showtimes/${showtime._id}/lock`, {
      method: "POST",
      body: { seatIds: [...seatRange("A", 4, 10), ...seatRange("B", 5, 8)] }, // 11 seats
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /lock rejects duplicate seat ids", async () => {
    const res = await api(`/api/showtimes/${showtime._id}/lock`, {
      method: "POST",
      body: { seatIds: ["B9", "B9"] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /bookings/checkout rejects more than 10 seats or duplicate seat ids", async () => {
    const tooMany = await api("/api/bookings/checkout", {
      method: "POST",
      body: { showtimeId: showtime._id.toString(), seatIds: [...seatRange("A", 1, 10), "B10"] },
    });
    expect(tooMany.status).toBe(400);

    const duplicates = await api("/api/bookings/checkout", {
      method: "POST",
      body: { showtimeId: showtime._id.toString(), seatIds: ["B10", "B10"] },
    });
    expect(duplicates.status).toBe(400);
  });

  it("GET /recommend rejects a count above 10, and still serves a valid count", async () => {
    const tooMany = await api(`/api/showtimes/${showtime._id}/recommend?count=11`, { cookie: null });
    expect(tooMany.status).toBe(400);
    expect((await tooMany.json()).error.code).toBe("VALIDATION_ERROR");

    const valid = await api(`/api/showtimes/${showtime._id}/recommend?count=2`, { cookie: null });
    expect(valid.status).toBe(200);
    expect((await valid.json()).data.recommendation.seats).toHaveLength(2);
  });

  it("an anonymous POST /lock gets 401 (what the seat page uses to redirect to login)", async () => {
    const res = await api(`/api/showtimes/${showtime._id}/lock`, {
      method: "POST",
      body: { seatIds: ["B9"] },
      cookie: null,
    });
    expect(res.status).toBe(401);
  });
});
