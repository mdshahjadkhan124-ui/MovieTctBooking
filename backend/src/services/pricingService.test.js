import { describe, it, expect } from "vitest";
import { calculateSeatPrice } from "./pricingService.js";

const BASE_PRICE = 200;

// A weekday (Wed 2025-01-15), off-peak-neutral 3pm slot — deliberately
// outside both "prime time" (6-10pm) and "matinee" (<12pm) so the time
// multiplier is a neutral 1.0 and doesn't interfere with the factor under
// test in tests that aren't specifically about time.
const NEUTRAL_STANDARD_TIME = "2025-01-15T15:00:00";
// A weekday prime-time slot (7pm).
const WEEKDAY_PRIME_TIME = "2025-01-15T19:00:00";
// A weekend, but outside prime-time hours (11am Saturday) — still prime
// per the spec ("weekend OR prime-time"), used to confirm weekend alone
// triggers the surge regardless of hour.
const WEEKEND_OFF_HOURS = "2025-01-18T11:00:00";
// A weekday matinee (10am).
const WEEKDAY_MATINEE = "2025-01-15T10:00:00";

const makeShowtime = (startTime, columns = 12) => ({
  startTime,
  screen: { layout: { columns } },
});

// A middle seat: not row A (front), not column 1 or `columns` (edge) — so
// its position multiplier is purely category-driven, isolating the factor
// under test from the position discount.
const regularMiddleSeat = { id: "D6", row: "D", col: 6, category: "regular" };
const premiumMiddleSeat = { id: "D6", row: "D", col: 6, category: "premium" };

describe("calculateSeatPrice", () => {
  it("low occupancy applies no surge (1.0x)", () => {
    const { finalPrice, breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(NEUTRAL_STANDARD_TIME),
      0.2
    );
    expect(breakdown.occupancy.multiplier).toBe(1.0);
    expect(finalPrice).toBe(200);
  });

  it("high occupancy (90%+) applies the top surge tier (1.5x)", () => {
    const { finalPrice, breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(NEUTRAL_STANDARD_TIME),
      0.95
    );
    expect(breakdown.occupancy.multiplier).toBe(1.5);
    expect(finalPrice).toBe(300);
  });

  it("occupancy tiers step correctly at each boundary", () => {
    const at = (occupancy) =>
      calculateSeatPrice(BASE_PRICE, regularMiddleSeat, makeShowtime(NEUTRAL_STANDARD_TIME), occupancy)
        .breakdown.occupancy.multiplier;

    expect(at(0.49)).toBe(1.0);
    expect(at(0.5)).toBe(1.15); // 50% is the start of the next tier
    expect(at(0.74)).toBe(1.15);
    expect(at(0.75)).toBe(1.3);
    expect(at(0.89)).toBe(1.3);
    expect(at(0.9)).toBe(1.5);
    expect(at(1.0)).toBe(1.5);
  });

  it("premium seat costs more than an otherwise-identical regular seat", () => {
    const showtime = makeShowtime(NEUTRAL_STANDARD_TIME);
    const regular = calculateSeatPrice(BASE_PRICE, regularMiddleSeat, showtime, 0.2);
    const premium = calculateSeatPrice(BASE_PRICE, premiumMiddleSeat, showtime, 0.2);

    expect(premium.breakdown.position.multiplier).toBe(1.3);
    expect(regular.breakdown.position.multiplier).toBe(1.0);
    expect(premium.finalPrice).toBeGreaterThan(regular.finalPrice);
    expect(premium.finalPrice).toBe(260);
    expect(regular.finalPrice).toBe(200);
  });

  it("front-row and edge seats get the position discount regardless of category", () => {
    const showtime = makeShowtime(NEUTRAL_STANDARD_TIME, 12);
    const frontRowPremium = { id: "A6", row: "A", col: 6, category: "premium" };
    const edgeRegular = { id: "D1", row: "D", col: 1, category: "regular" };
    const lastColumnRegular = { id: "D12", row: "D", col: 12, category: "regular" };

    for (const seat of [frontRowPremium, edgeRegular, lastColumnRegular]) {
      const { breakdown } = calculateSeatPrice(BASE_PRICE, seat, showtime, 0.2);
      expect(breakdown.position.multiplier).toBe(0.85);
    }
  });

  it("weekday prime-time (6-10pm) applies the surge multiplier", () => {
    const { breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(WEEKDAY_PRIME_TIME),
      0.2
    );
    expect(breakdown.time.multiplier).toBe(1.2);
  });

  it("weekend applies the surge multiplier even outside prime-time hours", () => {
    const { breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(WEEKEND_OFF_HOURS),
      0.2
    );
    expect(breakdown.time.multiplier).toBe(1.2);
  });

  it("weekday matinee (<12pm) applies the off-peak discount", () => {
    const { breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(WEEKDAY_MATINEE),
      0.2
    );
    expect(breakdown.time.multiplier).toBe(0.9);
  });

  it("standard weekday afternoon has no time adjustment (1.0x)", () => {
    const { breakdown } = calculateSeatPrice(
      BASE_PRICE,
      regularMiddleSeat,
      makeShowtime(NEUTRAL_STANDARD_TIME),
      0.2
    );
    expect(breakdown.time.multiplier).toBe(1.0);
  });

  it("combines all three factors multiplicatively and rounds to the nearest rupee", () => {
    // premium (1.3) x high occupancy (1.5) x weekend prime slot (1.2)
    const premiumWeekendSeat = { id: "D6", row: "D", col: 6, category: "premium" };
    const { finalPrice, breakdown } = calculateSeatPrice(
      199, // deliberately not round, to exercise the rounding step
      premiumWeekendSeat,
      makeShowtime("2025-01-18T20:00:00"), // Saturday, 8pm
      0.95
    );

    expect(breakdown.occupancy.multiplier).toBe(1.5);
    expect(breakdown.position.multiplier).toBe(1.3);
    expect(breakdown.time.multiplier).toBe(1.2);
    // 199 * 1.5 * 1.3 * 1.2 = 465.66 -> rounds to 466
    expect(finalPrice).toBe(466);
    expect(Number.isInteger(finalPrice)).toBe(true);
  });

  it("breakdown always reports the same finalPrice as the top-level return value", () => {
    const result = calculateSeatPrice(
      BASE_PRICE,
      premiumMiddleSeat,
      makeShowtime(WEEKDAY_PRIME_TIME),
      0.8
    );
    expect(result.breakdown.finalPrice).toBe(result.finalPrice);
    expect(result.breakdown.basePrice).toBe(BASE_PRICE);
  });
});
