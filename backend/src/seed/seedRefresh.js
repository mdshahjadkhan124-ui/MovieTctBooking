import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { rescheduleShowtimes } from "./rescheduleShowtimes.js";

// Lives in its own module purely so the scheduling logic can be tested (see
// rescheduleShowtimes.test.js) — importing this file would run the seed,
// since it calls run() at the top level, same reason bootstrapCityMap.js
// was split out of seedCatalog.js.
const run = async () => {
  await connectDB();
  const { rescheduled, unchanged, skipped } = await rescheduleShowtimes();
  console.log(
    `seed:refresh — rescheduled ${rescheduled}, already current ${unchanged}, skipped ${skipped} (has a non-demo booking).`
  );
  await mongoose.disconnect();
};

run();
