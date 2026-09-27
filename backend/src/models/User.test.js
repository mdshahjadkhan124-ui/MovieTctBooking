import { describe, it, expect } from "vitest";
import { User } from "./User.js";

// Pure schema validation — no DB connection needed (Document#validate()
// only runs schema-level validators; it never touches Mongo, so this
// belongs in the unit project, not integration). Covers the conditional
// `required` on `theater`: required for theater_admin only, so a plain user
// or a super_admin (global access, no single theater to assign) must remain
// valid with none.
const base = { name: "Test User", email: "schema-test@example.com", password: "password123" };

describe("User schema: theater required for theater_admin only", () => {
  it("rejects a theater_admin with no theater", async () => {
    const user = new User({ ...base, role: "theater_admin" });
    await expect(user.validate()).rejects.toMatchObject({
      errors: { theater: expect.anything() },
    });
  });

  it("accepts a theater_admin with a theater", async () => {
    const user = new User({ ...base, role: "theater_admin", theater: "507f1f77bcf86cd799439011" });
    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("accepts a plain user with no theater", async () => {
    const user = new User({ ...base, role: "user" });
    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("accepts a super_admin with no theater", async () => {
    const user = new User({ ...base, role: "super_admin" });
    await expect(user.validate()).resolves.toBeUndefined();
  });
});
