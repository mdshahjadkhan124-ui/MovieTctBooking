import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import { connectDB } from "../config/db.js";
import { Theater } from "../models/Theater.js";
import { User } from "../models/User.js";
import * as authService from "./authService.js";

let theater;

beforeAll(async () => {
  await connectDB();
  theater = await Theater.create({
    name: "Auth Service Test Theater",
    location: { city: "Testville" },
  });
});

describe("createElevatedUser", () => {
  it("creates a theater_admin scoped to the given theater", async () => {
    const user = await authService.createElevatedUser({
      name: "Theater Manager",
      email: "manager.authtest@example.com",
      password: "password123",
      role: "theater_admin",
      theater: theater._id,
    });

    expect(user.role).toBe("theater_admin");
    expect(String(user.theater)).toBe(String(theater._id));
    expect(user).not.toHaveProperty("password");
  });

  it("defaults role to theater_admin when role is omitted", async () => {
    const user = await authService.createElevatedUser({
      name: "Default Role Manager",
      email: "default-role.authtest@example.com",
      password: "password123",
      theater: theater._id,
    });

    expect(user.role).toBe("theater_admin");
  });

  it("rejects a duplicate email with a 409 DUPLICATE error", async () => {
    await authService.createElevatedUser({
      name: "First",
      email: "duplicate.authtest@example.com",
      password: "password123",
      theater: theater._id,
    });

    await expect(
      authService.createElevatedUser({
        name: "Second",
        email: "duplicate.authtest@example.com",
        password: "password123",
        theater: theater._id,
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE" });
  });
});

describe("listTheaterAdmins", () => {
  it("returns only theater_admin accounts, with their theater populated", async () => {
    await authService.createElevatedUser({
      name: "List Test Manager",
      email: "list-test.authtest@example.com",
      password: "password123",
      role: "theater_admin",
      theater: theater._id,
    });
    await User.create({
      name: "List Test Super",
      email: "list-test-super.authtest@example.com",
      password: "password123",
      role: "super_admin",
    });
    await User.create({
      name: "List Test Plain User",
      email: "list-test-user.authtest@example.com",
      password: "password123",
    });

    const admins = await authService.listTheaterAdmins();

    expect(admins.every((admin) => admin.role === "theater_admin")).toBe(true);
    const created = admins.find((admin) => admin.email === "list-test.authtest@example.com");
    expect(created).toBeDefined();
    expect(String(created.theater.id)).toBe(String(theater._id));
    expect(created.theater.name).toBe(theater.name);
    expect(created.theater.city).toBe("Testville");
    expect(created).not.toHaveProperty("password");
  });

  it("returns theater: null for a theater_admin with no theater assigned", async () => {
    await User.create({
      name: "Unassigned Manager",
      email: "unassigned.authtest@example.com",
      password: "password123",
      role: "theater_admin",
    });

    const admins = await authService.listTheaterAdmins();
    const unassigned = admins.find((admin) => admin.email === "unassigned.authtest@example.com");

    expect(unassigned.theater).toBeNull();
  });
});
