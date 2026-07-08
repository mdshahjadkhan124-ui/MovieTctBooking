// Pure, DB-free refund math — same shape as pricingService: named
// thresholds/percentages at the top, one function, no side effects. Callers
// pass `now` explicitly (bookingService always calls with `new Date()`) so
// this stays trivially testable without mocking the clock.

export const FULL_REFUND_THRESHOLD_HOURS = 24;
export const PARTIAL_REFUND_THRESHOLD_HOURS = 6;

export const FULL_REFUND_PERCENT = 100;
export const PARTIAL_REFUND_PERCENT = 50;
export const NO_REFUND_PERCENT = 0;

/**
 * calculateRefund(booking, showtime, now) -> { allowed, refundPercent,
 * refundAmount, reason }. `booking.amount` is the original charge; `now`
 * defaults to the current time but is always passed explicitly by callers.
 * `allowed` is false once the showtime has started — cancellation is
 * refused entirely at that point, not just zero-refunded.
 */
export const calculateRefund = (booking, showtime, now = new Date()) => {
  const hoursUntilShowtime =
    (new Date(showtime.startTime).getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilShowtime <= 0) {
    return {
      allowed: false,
      refundPercent: 0,
      refundAmount: 0,
      reason: "This showtime has already started — cancellation is no longer allowed.",
    };
  }

  let refundPercent;
  let reason;
  if (hoursUntilShowtime >= FULL_REFUND_THRESHOLD_HOURS) {
    refundPercent = FULL_REFUND_PERCENT;
    reason = `Cancelled ${FULL_REFUND_THRESHOLD_HOURS}+ hours before showtime — full refund.`;
  } else if (hoursUntilShowtime >= PARTIAL_REFUND_THRESHOLD_HOURS) {
    refundPercent = PARTIAL_REFUND_PERCENT;
    reason = `Cancelled ${PARTIAL_REFUND_THRESHOLD_HOURS}-${FULL_REFUND_THRESHOLD_HOURS} hours before showtime — 50% refund.`;
  } else {
    refundPercent = NO_REFUND_PERCENT;
    reason = `Cancelled less than ${PARTIAL_REFUND_THRESHOLD_HOURS} hours before showtime — no refund.`;
  }

  const refundAmount = Math.round((booking.amount * refundPercent) / 100);
  return { allowed: true, refundPercent, refundAmount, reason };
};
