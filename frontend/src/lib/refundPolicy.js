// Client-side PREVIEW ONLY — mirrors backend/src/services/refundPolicyService.js's
// thresholds exactly so the modal can show an accurate figure before the user
// confirms. The server always recomputes this authoritatively when the cancel
// endpoint is actually called; this copy never decides anything by itself.

export const FULL_REFUND_THRESHOLD_HOURS = 24;
export const PARTIAL_REFUND_THRESHOLD_HOURS = 6;

export const FULL_REFUND_PERCENT = 100;
export const PARTIAL_REFUND_PERCENT = 50;
export const NO_REFUND_PERCENT = 0;

export const previewRefund = (booking, showtime, now = new Date()) => {
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
  const hoursLabel = Math.floor(hoursUntilShowtime);
  if (hoursUntilShowtime >= FULL_REFUND_THRESHOLD_HOURS) {
    refundPercent = FULL_REFUND_PERCENT;
    reason = `Cancelling ${hoursLabel} hours before showtime — full refund.`;
  } else if (hoursUntilShowtime >= PARTIAL_REFUND_THRESHOLD_HOURS) {
    refundPercent = PARTIAL_REFUND_PERCENT;
    reason = `Cancelling ${hoursLabel} hours before showtime — 50% refund.`;
  } else {
    refundPercent = NO_REFUND_PERCENT;
    reason = `Cancelling ${hoursLabel} hours before showtime — no refund.`;
  }

  const refundAmount = Math.round((booking.amount * refundPercent) / 100);
  return { allowed: true, refundPercent, refundAmount, reason };
};
