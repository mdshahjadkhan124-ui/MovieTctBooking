import { Showtime } from "../models/Showtime.js";
import { WaitlistEntry } from "../models/WaitlistEntry.js";
import { AppError } from "../utils/AppError.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import * as seatLockService from "./seatLockService.js";
import { getUnavailableSeatIds } from "./showtimeService.js";
import { emitSeatsUpdated, emitWaitlistOffer } from "../config/socket.js";

// How long a notified user's exclusive hold on the offered seats lasts —
// implemented as an ordinary seat lock (see seatLockService), just created
// server-side on the user's behalf instead of from a client lock request,
// so checkout's existing ownership check (getOwnedLockToken) recognizes it
// with zero changes to the booking flow.
export const WAITLIST_HOLD_TTL_MS = 10 * 60 * 1000; // 10 minutes

const ACTIVE_STATUSES = ["waiting", "notified"];

const availableSeatIds = async (showtime) => {
  const allSeatIds = buildSeatGrid(showtime.screen.layout)
    .flat()
    .map((seat) => seat.id);
  const unavailable = new Set(await getUnavailableSeatIds(showtime._id.toString()));
  return allSeatIds.filter((id) => !unavailable.has(id));
};

export const joinWaitlist = async (userId, showtimeId, seatsRequested) => {
  const showtime = await Showtime.findById(showtimeId).populate("screen");
  if (!showtime || !showtime.isActive) {
    throw new AppError("Showtime not found", 404, "NOT_FOUND");
  }

  const totalSeats = buildSeatGrid(showtime.screen.layout).flat().length;
  if (seatsRequested > totalSeats) {
    throw new AppError(
      `This screen only has ${totalSeats} seats`,
      400,
      "VALIDATION_ERROR"
    );
  }

  try {
    return await WaitlistEntry.create({
      user: userId,
      showtime: showtimeId,
      seatsRequested,
      status: "waiting",
    });
  } catch (err) {
    // The partial unique index (user+showtime, active statuses only) is
    // what actually prevents a duplicate under concurrent double-submits —
    // this converts that DB-level rejection into a clean, expected 409
    // rather than a raw duplicate-key error.
    if (err.code === 11000) {
      throw new AppError(
        "You're already on the waitlist for this showtime",
        409,
        "ALREADY_ON_WAITLIST"
      );
    }
    throw err;
  }
};

export const leaveWaitlist = async (userId, showtimeId) => {
  const entry = await WaitlistEntry.findOne({
    user: userId,
    showtime: showtimeId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (!entry) {
    throw new AppError("You're not on the waitlist for this showtime", 404, "NOT_FOUND");
  }

  const wasNotified = entry.status === "notified";
  entry.status = "cancelled";
  await entry.save();

  if (wasNotified && entry.holdToken) {
    await seatLockService.releaseLocksByToken(showtimeId, entry.holdToken);
    emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
    // Leaving early frees the hold before its TTL would have — give the
    // next eligible person their shot immediately rather than making them
    // wait out a window nobody is using anymore.
    await processWaitlist(showtimeId);
  }
};

export const getMyWaitlistStatus = async (userId, showtimeId) => {
  await reconcileExpiredNotifications(showtimeId, WAITLIST_HOLD_TTL_MS);

  const entry = await WaitlistEntry.findOne({
    user: userId,
    showtime: showtimeId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (!entry) return null;

  if (entry.status === "waiting") {
    const position =
      (await WaitlistEntry.countDocuments({
        showtime: showtimeId,
        status: "waiting",
        createdAt: { $lt: entry.createdAt },
      })) + 1;
    return {
      status: "waiting",
      seatsRequested: entry.seatsRequested,
      position,
      createdAt: entry.createdAt,
    };
  }

  return {
    status: "notified",
    seatsRequested: entry.seatsRequested,
    heldSeatIds: entry.heldSeatIds,
    notifiedAt: entry.notifiedAt,
    holdExpiresAt: new Date(entry.notifiedAt.getTime() + WAITLIST_HOLD_TTL_MS),
  };
};

/**
 * Redis TTLs don't emit events on their own (no keyspace notifications
 * wired up here — see waitlistService's module comment/CLAUDE notes), so an
 * offer's hold silently disappears from Redis when it expires but the Mongo
 * entry is left saying "notified" until something calls this. Every
 * processWaitlist run starts here, and getMyWaitlistStatus calls it too, so
 * expiry is caught either the next time seats are touched for this showtime
 * or the next time this exact user checks their own status — both are
 * already-frequent checkpoints, so a dedicated poller/cron isn't needed.
 */
const reconcileExpiredNotifications = async (showtimeId, holdTtlMs) => {
  const cutoff = new Date(Date.now() - holdTtlMs);
  const stale = await WaitlistEntry.find({
    showtime: showtimeId,
    status: "notified",
    notifiedAt: { $lte: cutoff },
  });

  for (const entry of stale) {
    // Atomic claim: only this call, and only once, transitions this exact
    // entry out of "notified" — guards against racing a genuine booking
    // that's confirming this same entry to "fulfilled" at the same moment.
    const claimed = await WaitlistEntry.findOneAndUpdate(
      { _id: entry._id, status: "notified" },
      { status: "expired" },
      { new: true }
    );
    if (!claimed) continue;

    if (entry.holdToken) {
      await seatLockService.releaseLocksByToken(showtimeId, entry.holdToken);
      emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
    }
  }
};

/**
 * The core queue-advance step — call this any time seats for a showtime may
 * have freed up (cancellation, a manual lock release, or just opportunistically
 * whenever seat availability is next read). At most one offer is ever
 * outstanding per showtime at a time: if one is already "notified" and still
 * within its window, this is a no-op beyond the expiry check above — the
 * current holder's exclusivity is respected rather than double-booking their
 * seats out from under them.
 *
 * `holdTtlMs` is overridable (defaulting to WAITLIST_HOLD_TTL_MS) purely so
 * tests can verify expiry/advance-to-next behavior without waiting out the
 * real 10-minute window — same reasoning as acquireLocks' own `ttlMs`
 * override. Real callers never pass it.
 */
export const processWaitlist = async (showtimeId, { holdTtlMs = WAITLIST_HOLD_TTL_MS } = {}) => {
  await reconcileExpiredNotifications(showtimeId, holdTtlMs);

  const stillActive = await WaitlistEntry.exists({ showtime: showtimeId, status: "notified" });
  if (stillActive) return;

  const showtime = await Showtime.findById(showtimeId).populate("screen");
  if (!showtime || !showtime.isActive) return;

  const freeSeatIds = await availableSeatIds(showtime);
  if (freeSeatIds.length === 0) return;

  // FIFO, but not strictly blocking: the earliest entry whose request FITS
  // in what's currently free wins, so a party of 4 waiting behind a party
  // of 2 doesn't stall the queue while only 2 seats are actually free.
  const candidates = await WaitlistEntry.find({ showtime: showtimeId, status: "waiting" }).sort({
    createdAt: 1,
  });
  const eligible = candidates.find((c) => c.seatsRequested <= freeSeatIds.length);
  if (!eligible) return;

  const offeredSeatIds = freeSeatIds.slice(0, eligible.seatsRequested);

  const lockResult = await seatLockService.acquireLocks(
    showtimeId,
    offeredSeatIds,
    eligible.user.toString(),
    { ttlMs: holdTtlMs }
  );
  if (!lockResult.success) return; // lost a race for these seats — a later trigger will retry

  const notifiedAt = new Date();
  const claimed = await WaitlistEntry.findOneAndUpdate(
    { _id: eligible._id, status: "waiting" },
    { status: "notified", notifiedAt, holdToken: lockResult.token, heldSeatIds: offeredSeatIds },
    { new: true }
  );
  if (!claimed) {
    // Someone else (a concurrent processWaitlist call) already claimed this
    // entry — don't leave our just-acquired hold dangling.
    await seatLockService.releaseLocksByToken(showtimeId, lockResult.token);
    return;
  }

  emitSeatsUpdated(showtimeId, await getUnavailableSeatIds(showtimeId));
  emitWaitlistOffer(claimed.user.toString(), {
    showtimeId,
    seatIds: offeredSeatIds,
    seatsRequested: claimed.seatsRequested,
    expiresAt: notifiedAt.getTime() + holdTtlMs,
  });
};

/**
 * Booking-commit (handlePaymentSucceeded) calls this once a booking is
 * genuinely confirmed — if the confirming user has a live offer for exactly
 * these seats, that's the waitlist being fulfilled, not a coincidence: the
 * only way to legitimately hold these seatIds under one token is via
 * getOwnedLockToken, and the offer IS that token.
 */
export const fulfillIfMatchingOffer = async (userId, showtimeId, bookedSeatIds) => {
  const entry = await WaitlistEntry.findOne({
    user: userId,
    showtime: showtimeId,
    status: "notified",
  });
  if (!entry) return;

  const offered = [...entry.heldSeatIds].sort();
  const booked = [...bookedSeatIds].sort();
  const matches = offered.length === booked.length && offered.every((id, i) => id === booked[i]);
  if (!matches) return;

  await WaitlistEntry.findOneAndUpdate({ _id: entry._id, status: "notified" }, { status: "fulfilled" });
};
