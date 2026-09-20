import { WaitlistEntry } from "../models/WaitlistEntry.js";
import * as waitlistService from "./waitlistService.js";

// Redis TTLs fire no events (no keyspace notifications wired up), so an
// expired seat hold frees seats with nothing to notice it. That used to be
// covered by running queue processing inside GET /showtimes/:id/locks — a
// read endpoint quietly performing writes on every poll, from any visitor.
// This sweeper is that trigger moved somewhere honest: it runs on a timer in
// the server process, so reads stay reads.
//
// The event-driven triggers still do the real work promptly (cancellation,
// manual lock release, leaving the waitlist); this only catches the case
// nothing else can see.
export const DEFAULT_SWEEP_INTERVAL_MS = 60 * 1000;

/**
 * One pass: advance the queue for every showtime that currently has someone
 * waiting or holding an offer. Returns the showtime ids processed.
 */
export const sweepOnce = async () => {
  const showtimeIds = await WaitlistEntry.distinct("showtime", {
    status: { $in: ["waiting", "notified"] },
  });

  for (const showtimeId of showtimeIds) {
    try {
      await waitlistService.processWaitlist(showtimeId.toString());
    } catch (err) {
      // One bad showtime must not stop the rest of the sweep.
      console.error(`Waitlist sweep failed for showtime ${showtimeId}:`, err);
    }
  }
  return showtimeIds;
};

let timer = null;

export const startWaitlistSweeper = ({ intervalMs = DEFAULT_SWEEP_INTERVAL_MS } = {}) => {
  if (timer) return timer;
  timer = setInterval(() => {
    sweepOnce().catch((err) => console.error("Waitlist sweep failed:", err));
  }, intervalMs);
  // Don't hold the process open on shutdown just for this.
  timer.unref?.();
  return timer;
};

export const stopWaitlistSweeper = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
