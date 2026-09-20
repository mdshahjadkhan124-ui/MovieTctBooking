// GENERATED FILE — do not edit here.
//
// Mirrored from backend/src/utils/buildSeatGrid.js by `npm run sync:shared`
// (backend/scripts/syncSharedCode.js). The seat grid the UI renders and the
// grid the recommendation engine scores must be identical, and the two apps
// deploy from separate roots so neither can import the other's files.
// Edit the backend copy, re-run the script, and the parity tests will keep
// the two honest.

const DEFAULT_CATEGORY = "regular";

// Rows beyond Z (27+) would need AA/AB-style labels — cinema screens don't
// realistically have that many rows, so this is left unhandled by design.
// Kept byte-for-byte equivalent to frontend/src/utils/buildSeatGrid.js so the
// recommendation engine and the seat selection UI always agree on shape.
const rowLetterFor = (index) => String.fromCharCode(65 + index);

const categoryForRow = (rowLetter, seatCategories) => {
  const match = seatCategories.find((entry) => entry.rows?.includes(rowLetter));
  return match ? match.category : DEFAULT_CATEGORY;
};

/**
 * Pure derivation of a seat grid from a Screen's layout. No Express, no
 * side effects — independently unit-testable and shared in spirit with the
 * frontend's identical utility.
 *
 * @param {{ rows: number, columns: number, seatCategories?: Array<{category: string, rows: string[]}>, unavailableSeats?: string[] }} layout
 * @param {Set<string>} bookedSeats - seat ids to mark "booked"; callers that need live availability pass showtimeService.getUnavailableSeatIds (active locks + confirmed bookings). Defaults to empty.
 * @returns {Array<Array<{ id: string, row: string, col: number, category: string, status: 'available'|'unavailable'|'booked' }>>}
 */
export const buildSeatGrid = (layout, bookedSeats = new Set()) => {
  const { rows = 0, columns = 0, seatCategories = [], unavailableSeats = [] } = layout ?? {};
  const unavailableSet = new Set(unavailableSeats);

  const grid = [];
  for (let r = 0; r < rows; r++) {
    const rowLetter = rowLetterFor(r);
    const category = categoryForRow(rowLetter, seatCategories);
    const seatRow = [];

    for (let c = 1; c <= columns; c++) {
      const id = `${rowLetter}${c}`;
      let status = "available";
      if (unavailableSet.has(id)) {
        status = "unavailable";
      } else if (bookedSeats.has(id)) {
        status = "booked";
      }

      seatRow.push({ id, row: rowLetter, col: c, category, status });
    }

    grid.push(seatRow);
  }

  return grid;
};
