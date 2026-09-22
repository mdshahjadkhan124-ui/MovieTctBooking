import { defineConfig } from "vitest/config";

// Pure-logic suites: no database, no Redis, no Stripe, no secrets. Split into
// their own project so they run anywhere — a fresh clone, or CI with no
// credentials — in about a second, instead of every run paying for an
// in-memory MongoDB plus real network calls.
//
// Everything else is an integration suite by design: the seat-locking races,
// webhook idempotency and refund behaviour are only worth anything when
// exercised against real Redis and Stripe's test mode, so those keep running
// against the real thing.
const UNIT_TEST_FILES = [
  "src/services/seatRecommendation.test.js",
  "src/services/pricingService.test.js",
  "src/services/refundPolicyService.test.js",
  "src/services/refundPolicy.parity.test.js",
  "src/utils/buildSeatGrid.test.js",
  "src/utils/buildSeatGrid.parity.test.js",
  "src/utils/timezone.test.js",
  "src/utils/pagination.test.js",
  "src/seed/bootstrapCityMap.test.js",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: UNIT_TEST_FILES,
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.test.js"],
          exclude: ["**/node_modules/**", ...UNIT_TEST_FILES],
          // Only these suites need a database, so only they pay for it.
          globalSetup: "./vitest.global-setup.js",
        },
      },
    ],
  },
});
