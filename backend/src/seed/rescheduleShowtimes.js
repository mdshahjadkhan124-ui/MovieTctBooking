import { Showtime } from "../models/Showtime.js";
import { Booking } from "../models/Booking.js";
// Never referenced directly, only through .populate() below — but that
// needs each schema registered on the caller's connection, and this module
// is also invoked standalone (via seedRefresh.js, not through app.js's
// import chain), so nothing else would import them first.
import "../models/Theater.js";
import "../models/Screen.js";
import "../models/User.js";
import {
  zonedDateString,
  zonedDateTime,
  zonedWeekdayAndHour,
  addDaysToDateString,
} from "../utils/timezone.js";

// How many upcoming calendar days a screen's showtimes get spread across.
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
 * Rolls forward with the showtime any booking whose OWN user is one of
 * seed:analytics-demo's synthetic accounts (User.isSeedDemo — see that
 * field's own comment on why this, and not the accounts' email pattern, is
 * the trust boundary: an email domain isn't reserved, an isSeedDemo-shaped
 * request body field is structurally unreachable). A showtime is skipped —
 * left exactly as it is — if ANY booking against it belongs to a non-demo
 * user (including a dangling/deleted user reference, treated as non-demo:
 * fail closed rather than assume). A real+demo mix skips too: real tickets
 * always win, never partially edited around. This app is deployed and
 * publicly reachable, so "showtime with a booking" can mean a real
 * visitor's real (Stripe test-mode) ticket, not just a seeded demo entry.
 *
 * No Booking field duplicates its showtime's date/time — it only ever
 * references `showtime` by id (see models/Booking.js) — so a demo booking
 * that rolls forward needs no field of its own updated to match; the next
 * read of it (always via a join/populate) sees the showtime's new time
 * automatically. Checked again below, right where a rolled booking would
 * otherwise need updating, in case that schema ever changes.
 *
 * Idempotent: run it twice on the same calendar day and every showtime lands
 * in the same slot both times — the sort and the collision resolution are
 * both deterministic functions of input that hasn't changed. Run it again on
 * a later day and every offset simply advances relative to that new "today"
 * — the intended anti-staleness effect, not drift.
 *
 * @param {object} showtimeFilter - merged into the initial Showtime query,
 *   alongside isActive: true. The real seed script always calls this with
 *   none (every active showtime, its whole job) — this exists so a test can
 *   scope a run to its own fixtures (e.g. `{ theater: theaterId }`) rather
 *   than operating on the entire collection, which in this suite is shared,
 *   live, and being written to by other test files at the same time.
 * @returns {{ rescheduled: number, unchanged: number, skipped: number }}
 */
export const rescheduleShowtimes = async (showtimeFilter = {}) => {
  const showtimes = await Showtime.find({ isActive: true, ...showtimeFilter })
    .populate("theater", "timezone")
    .populate("screen")
    .sort({ startTime: 1 });

  // Every booking (any status) against any of these showtimes, with just
  // enough of its user populated to tell a synthetic demo account from a
  // real one. A missing/deleted user populates as null, which the demo-only
  // check below treats as non-demo — fail closed, never assume.
  const bookings = await Booking.find({
    showtime: { $in: showtimes.map((s) => s._id) },
  })
    .select("showtime user")
    .populate("user", "isSeedDemo");

  const bookingsByShowtime = new Map(); // showtimeId -> Booking[]
  for (const booking of bookings) {
    const key = booking.showtime.toString();
    if (!bookingsByShowtime.has(key)) bookingsByShowtime.set(key, []);
    bookingsByShowtime.get(key).push(booking);
  }

  const isDemoOnly = (showtimeId) => {
    const bookingsHere = bookingsByShowtime.get(showtimeId.toString());
    if (!bookingsHere) return true; // no bookings at all — nothing to protect
    return bookingsHere.every((b) => b.user?.isSeedDemo === true);
  };

  const byScreen = new Map(); // screenId -> Showtime[]
  let skipped = 0;
  for (const showtime of showtimes) {
    if (!isDemoOnly(showtime._id)) {
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
      // No Booking write follows — bookingsByShowtime's entries for this
      // showtime (if any: this branch only runs for a demo-only or
      // no-booking showtime) reference it by id alone, nothing on them
      // encodes its date/time (see models/Booking.js), so there is nothing
      // to keep in sync.
    }
  }

  return { rescheduled, unchanged, skipped };
};
