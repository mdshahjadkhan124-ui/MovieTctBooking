import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
// Theater and Screen are never referenced directly below, only through
// .populate() — but that populate needs their schemas registered on this
// connection, and run as a standalone script (not through app.js's import
// chain) nothing else here would import them first.
import "../models/Theater.js";
import "../models/Screen.js";
import { Showtime } from "../models/Showtime.js";
import { Booking } from "../models/Booking.js";
import {
  zonedDateString,
  zonedDateTime,
  zonedWeekdayAndHour,
  addDaysToDateString,
} from "../utils/timezone.js";

// How many upcoming calendar days a screen's showtimes get spread across.
// Matches the task's own framing ("the next 7 days starting today").
const SPREAD_DAYS = 7;

/**
 * Keeps a deployed demo's showtimes perpetually "upcoming" without
 * reseeding the whole catalogue: every showtime keeps its own time-of-day
 * (read and reapplied in its own theater's timezone, not the machine
 * running this script) but is moved onto one of the next SPREAD_DAYS
 * calendar days — so a demo left running for a week+ never runs out of
 * bookable showtimes the way a one-time seed inevitably would.
 *
 * Grouped and reassigned PER SCREEN, not globally: two showtimes on
 * different screens landing on the same day/hour is normal (that's two
 * different theaters both showing something at 7pm), but two showtimes on
 * the SAME screen at the same day/hour would be a real double-booking, so
 * collisions are only tracked and avoided within a screen's own group.
 *
 * Skips any showtime that has at least one booking against it (any status —
 * a cancelled booking still records what that showtime WAS, same reasoning
 * showtimeService.deleteShowtime's dependents check uses). This app is
 * deployed and publicly reachable, so a "demo" showtime can carry a real
 * visitor's real (Stripe test-mode) ticket; silently moving the date out
 * from under it would misrepresent what they hold. The cost: once a
 * showtime picks up its first booking — including the ones
 * seed:analytics-demo deliberately adds — this script stops refreshing its
 * date. There's no field distinguishing a synthetic demo booking from a
 * real visitor's, so this errs toward never touching a booking rather than
 * guessing which bookings are safe to override.
 *
 * Idempotent: run it twice on the same calendar day and every showtime lands
 * in the same slot both times — the sort and the collision resolution are
 * both deterministic functions of input that hasn't changed. Run it again on
 * a later day and every offset simply advances relative to that new "today"
 * — the intended anti-staleness effect, not drift.
 */
const run = async () => {
  await connectDB();

  const showtimes = await Showtime.find({ isActive: true })
    .populate("theater", "timezone")
    .populate("screen")
    .sort({ startTime: 1 });

  const bookedShowtimeIds = new Set(
    (await Booking.distinct("showtime")).map((id) => id.toString())
  );

  const byScreen = new Map(); // screenId -> Showtime[]
  let skipped = 0;
  for (const showtime of showtimes) {
    if (bookedShowtimeIds.has(showtime._id.toString())) {
      skipped += 1;
      continue;
    }
    const screenId = showtime.screen._id.toString();
    if (!byScreen.has(screenId)) byScreen.set(screenId, []);
    byScreen.get(screenId).push(showtime);
  }

  const now = new Date();
  let rescheduled = 0;
  let unchanged = 0;
  for (const screenShowtimes of byScreen.values()) {
    const timeZone = screenShowtimes[0].theater?.timezone;
    const today = zonedDateString(now, timeZone);
    const takenSlots = new Set(); // "dayOffset:hour" already used on this screen

    for (const [index, showtime] of screenShowtimes.entries()) {
      const { hour } = zonedWeekdayAndHour(showtime.startTime, timeZone);

      // Round-robin starting position, then advance day-by-day (wrapping
      // within the 7-day window) past two disqualifiers: this exact
      // (day, hour) already used on this screen, or — dayOffset 0 (today)
      // only — the preserved hour has already passed today. "Tomorrow" at
      // any hour is always still ahead of `now`, so this always terminates
      // within one lap: it can only ever reject dayOffset 0.
      let dayOffset = index % SPREAD_DAYS;
      let candidateStart = zonedDateTime(addDaysToDateString(today, dayOffset), hour, timeZone);
      let probes = 0;
      while (
        (takenSlots.has(`${dayOffset}:${hour}`) || candidateStart <= now) &&
        probes < SPREAD_DAYS
      ) {
        dayOffset = (dayOffset + 1) % SPREAD_DAYS;
        candidateStart = zonedDateTime(addDaysToDateString(today, dayOffset), hour, timeZone);
        probes += 1;
      }
      takenSlots.add(`${dayOffset}:${hour}`);

      const newStartTime = candidateStart;

      if (newStartTime.getTime() === showtime.startTime.getTime()) {
        unchanged += 1;
        continue;
      }

      // Duration is a plain elapsed-time delta, so shifting the day never
      // changes it — no need to re-derive it from the movie's runtime.
      const durationMs = showtime.endTime
        ? showtime.endTime.getTime() - showtime.startTime.getTime()
        : null;

      showtime.startTime = newStartTime;
      if (durationMs !== null) {
        showtime.endTime = new Date(newStartTime.getTime() + durationMs);
      }
      await showtime.save();
      rescheduled += 1;
    }
  }

  console.log(
    `seed:refresh — rescheduled ${rescheduled}, already current ${unchanged}, skipped ${skipped} (has booking(s)).`
  );
  await mongoose.disconnect();
};

run();
