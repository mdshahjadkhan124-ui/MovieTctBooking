import { describe, it, expect } from "vitest";
import { calculateRefund } from "./refundPolicyService.js";

const NOW = new Date("2026-01-15T12:00:00.000Z");
const hoursFromNow = (hours) => new Date(NOW.getTime() + hours * 60 * 60 * 1000);
const booking = { amount: 1000 };

describe("calculateRefund", () => {
  it("24+ hours before showtime -> 100% refund", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(24) }, NOW);
    expect(result).toEqual({
      allowed: true,
      refundPercent: 100,
      refundAmount: 1000,
      reason: expect.stringContaining("full refund"),
    });
  });

  it("well past 24 hours before showtime -> 100% refund", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(72) }, NOW);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(1000);
  });

  it("6-24 hours before showtime -> 50% refund", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(10) }, NOW);
    expect(result).toEqual({
      allowed: true,
      refundPercent: 50,
      refundAmount: 500,
      reason: expect.stringContaining("50% refund"),
    });
  });

  it("just under the 24-hour boundary -> 50% refund", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(23.9) }, NOW);
    expect(result.refundPercent).toBe(50);
  });

  it("exactly at the 24-hour boundary -> 100% refund (boundary is inclusive)", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(24) }, NOW);
    expect(result.refundPercent).toBe(100);
  });

  it("exactly at the 6-hour boundary -> 50% refund (boundary is inclusive)", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(6) }, NOW);
    expect(result.refundPercent).toBe(50);
  });

  it("just under the 6-hour boundary -> 0% refund", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(5.9) }, NOW);
    expect(result.refundPercent).toBe(0);
  });

  it("less than 6 hours before showtime -> 0% refund, but still allowed", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(2) }, NOW);
    expect(result).toEqual({
      allowed: true,
      refundPercent: 0,
      refundAmount: 0,
      reason: expect.stringContaining("no refund"),
    });
  });

  it("after showtime start -> cancellation not allowed", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(-1) }, NOW);
    expect(result.allowed).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toMatch(/already started/i);
  });

  it("exactly at showtime start -> cancellation not allowed", () => {
    const result = calculateRefund(booking, { startTime: hoursFromNow(0) }, NOW);
    expect(result.allowed).toBe(false);
  });

  it("50% refund amount rounds to the nearest rupee", () => {
    const result = calculateRefund({ amount: 199 }, { startTime: hoursFromNow(10) }, NOW);
    // 199 * 0.5 = 99.5 -> rounds to 100
    expect(result.refundAmount).toBe(100);
  });
});
