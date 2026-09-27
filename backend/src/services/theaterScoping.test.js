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
import * as screenService from "./screenService.js";
import * as showtimeService from "./showtimeService.js";
import * as analyticsService from "./analyticsService.js";

// Cross-tenant authorization: a theater_admin for Theater A must never read,
// modify or delete Theater B's resources, and must never see B's figures.
// Two fully parallel fixtures (A and B) are built so every assertion can name
// a concrete document that exists and is legitimately readable by the OTHER
// admin — a 403 here means "denied", not "there was nothing there anyway".
const runId = Date.now();

let server;
let baseUrl;
let redisClient;
let movie;
let theaterA;
let theaterB;
let screenA;
let screenB;
let showtimeA;
let showtimeB;
let adminA;
let adminB;
let adminACookie;
let superAdminUser;

const password = "password123";

const login = async (email) => {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie").split(";")[0]; // "token=..."
};

const api = (path, { method = "GET", body, cookie = adminACookie } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body && { "Content-Type": "application/json" }),
      ...(cookie && { Cookie: cookie }),
      "X-Requested-With": "XMLHttpRequest",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

const futureStart = (hoursFromNow) => new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);

beforeAll(async () => {
  await connectDB();
  redisClient = await connectRedis();

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  movie = await Movie.create({ title: `Scoping Movie ${runId}`, durationMinutes: 100 });

  [theaterA, theaterB] = await Theater.create([
    { name: `Scoping Theater A ${runId}`, location: { city: "Scopeville" } },
    { name: `Scoping Theater B ${runId}`, location: { city: "Scopeville" } },
  ]);

  [screenA, screenB] = await Screen.create([
    { theater: theaterA._id, name: "Scoping Screen A", layout: { rows: 2, columns: 5 } },
    { theater: theaterB._id, name: "Scoping Screen B", layout: { rows: 2, columns: 5 } },
  ]);

  [showtimeA, showtimeB] = await Showtime.create([
    {
      movie: movie._id,
      screen: screenA._id,
      theater: theaterA._id,
      startTime: futureStart(48),
      price: 200,
      format: "2D",
    },
    {
      movie: movie._id,
      screen: screenB._id,
      theater: theaterB._id,
      startTime: futureStart(72),
      price: 300,
      format: "2D",
    },
  ]);

  // Distinct amounts so an unscoped analytics result is identifiable by value
  // rather than only by count.
  await Booking.create([
    {
      user: new mongoose.Types.ObjectId(),
      showtime: showtimeA._id,
      theater: theaterA._id,
      seatIds: ["A1"],
      amount: 200,
      status: "confirmed",
    },
    {
      user: new mongoose.Types.ObjectId(),
      showtime: showtimeB._id,
      theater: theaterB._id,
      seatIds: ["A1"],
      amount: 300,
      status: "confirmed",
    },
  ]);

  adminA = await User.create({
    name: "Scoping Admin A",
    email: `scoping-admin-a-${runId}@example.com`,
    password,
    role: "theater_admin",
    theater: theaterA._id,
  });
  adminB = await User.create({
    name: "Scoping Admin B",
    email: `scoping-admin-b-${runId}@example.com`,
    password,
    role: "theater_admin",
    theater: theaterB._id,
  });
  superAdminUser = await User.create({
    name: "Scoping Super Admin",
    email: `scoping-super-${runId}@example.com`,
    password,
    role: "super_admin",
  });

  adminACookie = await login(adminA.email);
}, 30000);

afterAll(async () => {
  await Booking.deleteMany({ theater: { $in: [theaterA._id, theaterB._id] } });
  await Showtime.deleteMany({ _id: { $in: [showtimeA._id, showtimeB._id] } });
  await Screen.deleteMany({ _id: { $in: [screenA._id, screenB._id] } });
  await Theater.deleteMany({ _id: { $in: [theaterA._id, theaterB._id] } });
  await Movie.deleteOne({ _id: movie._id });
  await User.deleteMany({ _id: { $in: [adminA._id, adminB._id, superAdminUser._id] } });
  await new Promise((resolve) => server.close(resolve));
  await redisClient.quit();
  await mongoose.disconnect();
});

const forbidden = { statusCode: 403, code: "FORBIDDEN" };

describe("theater_admin scoping: screens", () => {
  it("cannot read another theater's screen", async () => {
    await expect(screenService.getScreenById(adminA, screenB._id)).rejects.toMatchObject(forbidden);
  });

  it("can read its own screen — proving the 403 above is a denial, not a missing document", async () => {
    const screen = await screenService.getScreenById(adminA, screenA._id);
    expect(screen._id.toString()).toBe(screenA._id.toString());
  });

  it("cannot update another theater's screen, and the document is left untouched", async () => {
    await expect(
      screenService.updateScreen(adminA, screenB._id, { name: "Hijacked" })
    ).rejects.toMatchObject(forbidden);

    const untouched = await Screen.findById(screenB._id);
    expect(untouched.name).toBe("Scoping Screen B");
  });

  it("cannot delete another theater's screen, and the document survives", async () => {
    await expect(screenService.deleteScreen(adminA, screenB._id)).rejects.toMatchObject(forbidden);
    expect(await Screen.findById(screenB._id)).not.toBeNull();
  });

  it("cannot create a screen under another theater", async () => {
    await expect(
      screenService.createScreen(adminA, {
        theater: theaterB._id,
        name: "Planted Screen",
        layout: { rows: 1, columns: 5 },
      })
    ).rejects.toMatchObject(forbidden);

    expect(await Screen.findOne({ name: "Planted Screen" })).toBeNull();
  });

  it("listing returns only its own theater's screens", async () => {
    const { screens } = await screenService.listScreens(adminA, {}, { limit: 100 });
    const ids = screens.map((s) => s._id.toString());
    expect(ids).toContain(screenA._id.toString());
    expect(ids).not.toContain(screenB._id.toString());
  });

  it("cannot widen its own listing by passing another theater as a filter", async () => {
    const { screens } = await screenService.listScreens(
      adminA,
      { theater: theaterB._id.toString() },
      { limit: 100 }
    );
    expect(screens.map((s) => s._id.toString())).not.toContain(screenB._id.toString());
  });
});

describe("theater_admin scoping: showtimes", () => {
  it("cannot read another theater's showtime", async () => {
    await expect(
      showtimeService.getShowtimeByIdAdmin(adminA, showtimeB._id)
    ).rejects.toMatchObject(forbidden);
  });

  it("can read its own showtime", async () => {
    const found = await showtimeService.getShowtimeByIdAdmin(adminA, showtimeA._id);
    expect(found._id.toString()).toBe(showtimeA._id.toString());
  });

  it("cannot update another theater's showtime, and the price is left untouched", async () => {
    await expect(
      showtimeService.updateShowtime(adminA, showtimeB._id, { price: 1 })
    ).rejects.toMatchObject(forbidden);

    const untouched = await Showtime.findById(showtimeB._id);
    expect(untouched.price).toBe(300);
  });

  it("cannot delete another theater's showtime, and the document survives", async () => {
    await expect(showtimeService.deleteShowtime(adminA, showtimeB._id)).rejects.toMatchObject(
      forbidden
    );
    expect(await Showtime.findById(showtimeB._id)).not.toBeNull();
  });

  it("cannot create a showtime on another theater's screen", async () => {
    await expect(
      showtimeService.createShowtime(adminA, {
        movie: movie._id,
        screen: screenB._id,
        startTime: futureStart(96),
        price: 100,
        format: "2D",
      })
    ).rejects.toMatchObject(forbidden);
  });

  it("cannot move its own showtime onto another theater's screen", async () => {
    await expect(
      showtimeService.updateShowtime(adminA, showtimeA._id, { screen: screenB._id.toString() })
    ).rejects.toMatchObject(forbidden);

    const untouched = await Showtime.findById(showtimeA._id);
    expect(untouched.screen.toString()).toBe(screenA._id.toString());
    expect(untouched.theater.toString()).toBe(theaterA._id.toString());
  });

  it("listing returns only its own theater's showtimes, even with a foreign theater filter", async () => {
    const own = await showtimeService.listShowtimesAdmin(adminA, {}, { limit: 100 });
    expect(own.showtimes.map((s) => s._id.toString())).toContain(showtimeA._id.toString());
    expect(own.showtimes.map((s) => s._id.toString())).not.toContain(showtimeB._id.toString());

    const filtered = await showtimeService.listShowtimesAdmin(
      adminA,
      { theater: theaterB._id.toString() },
      { limit: 100 }
    );
    expect(filtered.showtimes.map((s) => s._id.toString())).not.toContain(
      showtimeB._id.toString()
    );
  });
});

describe("theater_admin scoping: analytics", () => {
  it("sees only its own theater's revenue, not the other theater's", async () => {
    const a = await analyticsService.getAnalytics(adminA);
    const b = await analyticsService.getAnalytics(adminB);

    expect(a.revenue.confirmedRevenue).toBe(200);
    expect(b.revenue.confirmedRevenue).toBe(300);
  });

  it("never names another theater in the per-theater breakdown", async () => {
    const { theaterPerformance, occupancy } = await analyticsService.getAnalytics(adminA);

    const perfIds = theaterPerformance.map((t) => t.theaterId.toString());
    expect(perfIds).toEqual([theaterA._id.toString()]);

    const occupancyIds = occupancy.byTheater.map((t) => t.theaterId.toString());
    expect(occupancyIds).not.toContain(theaterB._id.toString());
  });

  it("a super_admin's global view does include both theaters", async () => {
    const { theaterPerformance } = await analyticsService.getAnalytics(superAdminUser);
    const ids = theaterPerformance.map((t) => t.theaterId.toString());
    expect(ids).toContain(theaterA._id.toString());
    expect(ids).toContain(theaterB._id.toString());
  });

  // An aggregation's `$match: {}` matches everything, so a theater_admin with
  // no theater assigned would have been handed every theater's figures while
  // being refused any single screen. Fail closed instead.
  it("refuses a theater_admin with no theater assigned instead of returning global figures", async () => {
    const orphaned = { role: "theater_admin", theater: undefined };
    await expect(analyticsService.getAnalytics(orphaned)).rejects.toMatchObject(forbidden);
    await expect(screenService.listScreens(orphaned, {}, { limit: 10 })).rejects.toMatchObject(
      forbidden
    );
    await expect(
      showtimeService.listShowtimesAdmin(orphaned, {}, { limit: 10 })
    ).rejects.toMatchObject(forbidden);
  });
});

// The service layer is where the ownership checks live, but the contract the
// client sees is an HTTP status — these confirm AppError(403) actually
// surfaces as 403 through the error handler rather than a 400 or 500.
describe("theater_admin scoping: HTTP status contract", () => {
  it("GET /api/admin/screens/:id for another theater responds 403 FORBIDDEN", async () => {
    const res = await api(`/api/admin/screens/${screenB._id}`);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("PATCH /api/admin/showtimes/:id for another theater responds 403", async () => {
    const res = await api(`/api/admin/showtimes/${showtimeB._id}`, {
      method: "PATCH",
      body: { price: 1 },
    });
    expect(res.status).toBe(403);
  });

  it("DELETE /api/admin/screens/:id for another theater responds 403", async () => {
    const res = await api(`/api/admin/screens/${screenB._id}`, { method: "DELETE" });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/screens/:id for its own theater still responds 200", async () => {
    const res = await api(`/api/admin/screens/${screenA._id}`);
    expect(res.status).toBe(200);
  });
});
