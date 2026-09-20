import { describe, it, expect } from "vitest";
import {
  calculateRefund,
  FULL_REFUND_THRESHOLD_HOURS,
  PARTIAL_REFUND_THRESHOLD_HOURS,
  FULL_REFUND_PERCENT,
  PARTIAL_REFUND_PERCENT,
  NO_REFUND_PERCENT,
} from "./refundPolicyService.js";
// Test-only import across the app boundary — never bundled or deployed.
import {
  previewRefund,
  FULL_REFUND_THRESHOLD_HOURS as UI_FULL_THRESHOLD,
  PARTIAL_REFUND_THRESHOLD_HOURS as UI_PARTIAL_THRESHOLD,
  FULL_REFUND_PERCENT as UI_FULL_PERCENT,
  PARTIAL_REFUND_PERCENT as UI_PARTIAL_PERCENT,
  NO_REFUND_PERCENT as UI_NO_PERCENT,
} from "../../../frontend/src/lib/refundPolicy.js";

// The cancellation modal quotes a refund before the user commits; the server
// then decides the real one. If those two ever disagree, the user is told one
// number and paid another — so the MONEY has to match exactly. The wording
// deliberately differs (the UI says "Cancelling 30 hours before…", the server
// states the tier), so these tests compare amounts, not prose.
const NOW = new Date("2026-05-10T12:00:00Z");
const hoursFromNow = (hours) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);

const cases = [
  ["well outside the full-refund window", 72],
  ["just above the full-refund threshold", FULL_REFUND_THRESHOLD_HOURS + 0.5],
  ["exactly at the full-refund threshold", FULL_REFUND_THRESHOLD_HOURS],
  ["just inside the partial window", FULL_REFUND_THRESHOLD_HOURS - 0.5],
  ["mid partial window", 12],
  ["exactly at the partial threshold", PARTIAL_REFUND_THRESHOLD_HOURS],
  ["just below the partial threshold", PARTIAL_REFUND_THRESHOLD_HOURS - 0.5],
  ["close to showtime", 0.5],
  ["showtime already started", -1],
];

describe("refund policy: the UI preview and the server agree on the money", () => {
  it("uses the same thresholds and percentages on both sides", () => {
    expect(UI_FULL_THRESHOLD).toBe(FULL_REFUND_THRESHOLD_HOURS);
    expect(UI_PARTIAL_THRESHOLD).toBe(PARTIAL_REFUND_THRESHOLD_HOURS);
    expect(UI_FULL_PERCENT).toBe(FULL_REFUND_PERCENT);
    expect(UI_PARTIAL_PERCENT).toBe(PARTIAL_REFUND_PERCENT);
    expect(UI_NO_PERCENT).toBe(NO_REFUND_PERCENT);
  });

  it.each(cases)("quotes the same refund %s", (_label, hours) => {
    const booking = { amount: 777 }; // odd number: rounding must match too
    const showtime = { startTime: hoursFromNow(hours) };

    const server = calculateRefund(booking, showtime, NOW);
    const preview = previewRefund(booking, showtime, NOW);

    expect(preview.allowed).toBe(server.allowed);
    expect(preview.refundPercent).toBe(server.refundPercent);
    expect(preview.refundAmount).toBe(server.refundAmount);
  });
});
