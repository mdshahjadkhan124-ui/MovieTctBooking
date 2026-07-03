import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { User } from "../models/User.js";

const run = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ role: "super_admin" });
  if (existing) {
    console.log(`super_admin already exists (${existing.email}), skipping.`);
  } else {
    const admin = await User.create({
      name: "Super Admin",
      email,
      password,
      role: "super_admin",
    });
    console.log(`Created super_admin: ${admin.email}`);
  }

  await mongoose.disconnect();
};

run();
