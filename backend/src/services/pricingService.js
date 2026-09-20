// Pure, DB-free pricing math — every threshold/multiplier lives here as a
// named constant so the surge rules are one place to read and tune, not
// buried inline. Nothing in this file touches Mongo/Redis; callers compute
// occupancy (via showtimeService.getUnavailableSeatIds) and pass it in.
import { zonedWeekdayAndHour, DEFAULT_TIMEZONE } from "../utils/timezone.js";

// Tiered by % of seats currently locked-or-booked for the showtime.
// maxOccupancy is exclusive except the last tier (Infinity catches 100%).
export const OCCUPANCY_TIERS = [
  { maxOccupancy: 0.5, multiplier: 1.0, label: "Standard demand (<50% booked)" },
  { maxOccupancy: 0.75, multiplier: 1.15, label: "Filling up (50-75% booked)" },
  { maxOccupancy: 0.9, multiplier: 1.3, label: "Almost full (75-90% booked)" },
  { maxOccupancy: Infinity, multiplier: 1.5, label: "Nearly sold out (90%+ booked)" },
];

// A seat's position multiplier: front-row or edge-column seats have the
// worst viewing angle, so that discount takes priority over category even
// for a seat the admin marked "premium" — otherwise category decides it.
export const POSITION_MULTIPLIERS = {
  EDGE_OR_FRONT: 0.85,
  PREMIUM: 1.3,
  REGULAR: 1.0,
};

export const TIME_MULTIPLIERS = {
  PRIME: 1.2, // weekend, or a weekday prime-time slot
  OFF_PEAK: 0.9, // matinee
  STANDARD: 1.0,
};

const PRIME_TIME_START_HOUR = 18; // 6pm
const PRIME_TIME_END_HOUR = 22; // 10pm, exclusive
const MATINEE_END_HOUR = 12; // before noon counts as matinee/off-peak

const getOccupancyFactor = (occupancy) =>
  OCCUPANCY_TIERS.find((tier) => occupancy < tier.maxOccupancy);

const getPositionFactor = (seat, totalColumns) => {
  const isFrontRow = seat.row === "A";
  const isEdgeSeat = seat.col === 1 || seat.col === totalColumns;
  if (isFrontRow || isEdgeSeat) {
    return { multiplier: POSITION_MULTIPLIERS.EDGE_OR_FRONT, label: "Front row / edge seat" };
  }
  if (seat.category?.toLowerCase() === "premium") {
    return { multiplier: POSITION_MULTIPLIERS.PREMIUM, label: "Premium seat" };
  }
  return { multiplier: POSITION_MULTIPLIERS.REGULAR, label: "Regular seat" };
};

// Read in the THEATER's timezone, not the server's. A 7pm show in Bengaluru
// is prime time for the people buying tickets to it; on Render (UTC) the
// server's own clock would call that 13:30 and quietly drop the surge.
const getTimeFactor = (startTime, timeZone) => {
  const { hour, isWeekend } = zonedWeekdayAndHour(startTime, timeZone);
  const isPrimeTime = hour >= PRIME_TIME_START_HOUR && hour < PRIME_TIME_END_HOUR;

  if (isWeekend || isPrimeTime) {
    return { multiplier: TIME_MULTIPLIERS.PRIME, label: "Weekend / prime time (6-10pm)" };
  }
  if (hour < MATINEE_END_HOUR) {
    return { multiplier: TIME_MULTIPLIERS.OFF_PEAK, label: "Matinee / off-peak" };
  }
  return { multiplier: TIME_MULTIPLIERS.STANDARD, label: "Standard time" };
};

/**
 * finalPrice = basePrice x occupancyMultiplier x positionMultiplier x
 * timeMultiplier, rounded to the nearest rupee. `seat` is one element from
 * buildSeatGrid's flattened output ({ id, row, col, category, status });
 * `showtime` must have `.screen.layout.columns` and `.startTime` available
 * (populate("screen") first). `occupancy` is a 0-1 fraction the caller
 * computes from getUnavailableSeatIds(). `timeZone` is the theater's zone —
 * callers pass it so time-of-day pricing means the cinema's clock; it falls
 * back to the app default for older records that have none.
 */
export const calculateSeatPrice = (
  basePrice,
  seat,
  showtime,
  occupancy,
  timeZone = DEFAULT_TIMEZONE
) => {
  const totalColumns = showtime?.screen?.layout?.columns ?? 0;

  const occupancyFactor = getOccupancyFactor(occupancy);
  const positionFactor = getPositionFactor(seat, totalColumns);
  const timeFactor = getTimeFactor(showtime.startTime, timeZone);

  const rawPrice =
    basePrice * occupancyFactor.multiplier * positionFactor.multiplier * timeFactor.multiplier;
  const finalPrice = Math.round(rawPrice);

  return {
    finalPrice,
    breakdown: {
      basePrice,
      occupancy: {
        value: occupancy,
        multiplier: occupancyFactor.multiplier,
        label: occupancyFactor.label,
      },
      position: { multiplier: positionFactor.multiplier, label: positionFactor.label },
      time: { multiplier: timeFactor.multiplier, label: timeFactor.label },
      finalPrice,
    },
  };
};
