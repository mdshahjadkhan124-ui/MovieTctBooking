// Smart Seat Recommendation Engine
//
// Given a seat grid (see buildSeatGrid) and a requested seat count `n`, finds
// the best contiguous block of `n` available seats, preferring seats close to
// the horizontal center and within an "ideal" row band (not too close to the
// screen, not too far back). If no single row can fit the whole group, falls
// back to splitting the group across adjacent rows, keeping the split as
// column-aligned and tightly clustered as possible.
//
// Pure function: no Express, no DB, no I/O. `grid` already encodes booked/
// unavailable seats via each seat's `status` (see buildSeatGrid, which is what
// actually accepts the bookedSeats input) — this function just has to respect
// `status`, so there is a single source of truth for seat availability instead
// of this function and the grid disagreeing about it.

// ---- Named weights (tune here, not inline) ----
// Column-centering weight: how much being off-center (horizontally) costs.
const W_COL = 1;
// Row-band weight: how much being outside the ideal row band costs. Weighted
// higher than column centering because which "zone" of the theater you're in
// matters more to the viewing experience than being a seat or two off-center.
const W_ROW = 3;
// Rows in front of the ideal band are penalized more steeply than rows behind
// it — a too-close row hurts the experience worse than a slightly-too-far-back one.
const FRONT_ROW_MULTIPLIER = 2;
const BACK_ROW_MULTIPLIER = 1;
// Phase 2 only: extra cost for adjacent-row picks whose column ranges don't
// line up with each other (keeps a split group sitting roughly above/below
// each other rather than diagonally scattered).
const W_SPREAD = 2;

const isAvailable = (seat) => Boolean(seat) && seat.status === "available";

const columnCenterPenalty = (startCol, endCol, columns) => {
  const idealCenter = (1 + columns) / 2;
  const windowCenter = (startCol + endCol) / 2;
  return Math.abs(windowCenter - idealCenter);
};

// Ideal band = middle third of rows (0-indexed, inclusive). Rows before it are
// "too close to the screen"; rows after it are "too far back".
const rowBandPenalty = (rowIndex, totalRows) => {
  const bandStart = Math.floor(totalRows / 3);
  const bandEnd = totalRows - Math.floor(totalRows / 3) - 1;

  if (rowIndex < bandStart) return (bandStart - rowIndex) * FRONT_ROW_MULTIPLIER;
  if (rowIndex > bandEnd) return (rowIndex - bandEnd) * BACK_ROW_MULTIPLIER;
  return 0;
};

// ---- Phase 1: single-row sliding window ----
//
// For each row, a running "streak" counts consecutive available seats ending
// at the current column (reset to 0 the moment a non-available seat is hit).
// A window of width n ending at index i is valid iff streak[i] >= n — this
// makes each step O(1) (no rescanning the window), so scanning one row is
// O(row length) and the whole grid is O(total seats).
const findBestSingleRowWindow = (grid, n, columns, totalRows) => {
  let best = null;

  for (let r = 0; r < totalRows; r++) {
    const row = grid[r];
    if (row.length < n) continue;

    let streak = 0;
    for (let i = 0; i < row.length; i++) {
      streak = isAvailable(row[i]) ? streak + 1 : 0;
      if (streak < n) continue;

      const windowStartIdx = i - n + 1;
      const startCol = row[windowStartIdx].col;
      const endCol = row[i].col;
      const score =
        W_COL * columnCenterPenalty(startCol, endCol, columns) +
        W_ROW * rowBandPenalty(r, totalRows);

      if (!best || score < best.score) {
        const seats = row.slice(windowStartIdx, i + 1).map((seat) => seat.id);
        best = { seats, score };
      }
    }
  }

  return best;
};

// ---- Phase 2: adjacent-row fallback ----
//
// Only reached when no single row can fit all n seats contiguously. Splits n
// across k >= 2 adjacent rows, distributing seats as evenly as possible
// (e.g. n=5 across 2 rows -> lengths [3,2]), then searches for the shared
// column position that lets every row in the split sit as close to each
// other (and to center) as possible.
//
// Naively letting each row independently pick its own best-centered window
// does NOT minimize cross-row spread: a row might have a slightly-off-center
// option that lines up far better with another row's only good option. So
// instead we try every plausible shared "anchor" column (bounded by screen
// width) and, for each anchor, let every row pick its closest-matching
// window to that anchor — then score the whole combination jointly and keep
// the best across all anchors.

const maximalRuns = (row) => {
  const runs = [];
  let runStart = null;

  for (let i = 0; i < row.length; i++) {
    if (isAvailable(row[i])) {
      if (runStart === null) runStart = i;
    } else if (runStart !== null) {
      runs.push({ startIdx: runStart, endIdx: i - 1 });
      runStart = null;
    }
  }
  if (runStart !== null) runs.push({ startIdx: runStart, endIdx: row.length - 1 });

  return runs;
};

// Best `length`-wide sub-window within [startIdx, endIdx] (inclusive indices
// into `row`), closest to `targetCol`.
const bestSubWindowToward = (row, startIdx, endIdx, length, targetCol) => {
  const idealStartCol = targetCol - (length - 1) / 2;

  // col is always idx+1 in a full grid row, so the ideal start column
  // converts directly to index space; clamp it within the run's bounds.
  const minStartIdx = startIdx;
  const maxStartIdx = endIdx - length + 1;
  const windowStartIdx = Math.min(maxStartIdx, Math.max(minStartIdx, Math.round(idealStartCol - 1)));
  const windowEndIdx = windowStartIdx + length - 1;
  const startCol = row[windowStartIdx].col;
  const endCol = row[windowEndIdx].col;
  const centerCol = (startCol + endCol) / 2;

  return {
    centerCol,
    seats: row.slice(windowStartIdx, windowEndIdx + 1).map((seat) => seat.id),
  };
};

// For one row and a required length, find the qualifying sub-window closest
// to `targetCol` across ALL of that row's available runs — a shorter run
// near the target can beat a longer run far off to the side.
const bestWindowToward = (row, requiredLength, targetCol) => {
  let best = null;
  for (const run of maximalRuns(row)) {
    const runLength = run.endIdx - run.startIdx + 1;
    if (runLength < requiredLength) continue;

    const candidate = bestSubWindowToward(row, run.startIdx, run.endIdx, requiredLength, targetCol);
    const distance = Math.abs(candidate.centerCol - targetCol);
    if (!best || distance < best.distance) {
      best = { ...candidate, distance };
    }
  }
  return best;
};

// All distinct permutations of an array (small arrays only — see caller).
function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr;
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const perm of permutations(rest)) {
      yield [arr[i], ...perm];
    }
  }
}

// Length assignments to try for a block of k rows: how many seats each row
// in the block should contribute, distributed as evenly as possible.
// Group bookings splitting across more than 5 rows are unrealistic, so beyond
// that we skip the permutation search and just assign in row order — still
// correct, just not exhaustively optimal for a case that shouldn't occur.
const MAX_PERMUTATION_ROWS = 5;
const lengthAssignmentsFor = (n, k) => {
  const base = Math.floor(n / k);
  const remainder = n % k;
  const lengths = [
    ...Array(remainder).fill(base + 1),
    ...Array(k - remainder).fill(base),
  ];

  if (k > MAX_PERMUTATION_ROWS) return [lengths];
  return [...permutations(lengths)];
};

const findBestSplit = (grid, n, columns, totalRows) => {
  let best = null;
  const idealCenter = (1 + columns) / 2;

  const maxK = Math.min(n, totalRows);
  for (let k = 2; k <= maxK; k++) {
    for (let r = 0; r + k <= totalRows; r++) {
      const blockRows = grid.slice(r, r + k);

      for (const lengths of lengthAssignmentsFor(n, k)) {
        // Try every plausible shared column anchor and let each row pick its
        // closest-matching window to it, then score the combo as a whole.
        for (let anchor = 1; anchor <= columns; anchor++) {
          const windows = [];
          let feasible = true;

          for (let i = 0; i < k; i++) {
            const window = bestWindowToward(blockRows[i], lengths[i], anchor);
            if (!window) {
              feasible = false;
              break;
            }
            windows.push(window);
          }
          if (!feasible) continue;

          const colScore = windows.reduce(
            (sum, w) => sum + W_COL * Math.abs(w.centerCol - idealCenter),
            0
          );
          const rowScore = windows.reduce(
            (sum, _, i) => sum + W_ROW * rowBandPenalty(r + i, totalRows),
            0
          );
          const centerCols = windows.map((w) => w.centerCol);
          const spreadScore = W_SPREAD * (Math.max(...centerCols) - Math.min(...centerCols));
          const score = colScore + rowScore + spreadScore;

          if (!best || score < best.score) {
            const seats = windows.flatMap((w) => w.seats);
            best = { seats, score };
          }
        }
      }
    }

    // Prefer the smallest k that yields any valid split (tighter cluster)
    // over a "better-scoring" split that needs more rows.
    if (best) break;
  }

  return best;
};

/**
 * @param {Array<Array<{ id: string, row: string, col: number, category: string, status: string }>>} grid
 * @param {number} n - requested seat count
 * @param {object} [options] - reserved for future weight/tuning overrides
 * @returns {{ type: 'single'|'split', seats: string[], score: number } | null}
 */
export const recommendSeats = (grid, n, options = {}) => {
  void options; // no overrides yet; kept in the signature for forward compatibility

  if (!Array.isArray(grid) || grid.length === 0 || !Number.isInteger(n) || n <= 0) {
    return null;
  }

  const totalRows = grid.length;
  const columns = grid.reduce((max, row) => Math.max(max, row.length), 0);

  const single = findBestSingleRowWindow(grid, n, columns, totalRows);
  if (single) {
    return { type: "single", seats: single.seats, score: single.score };
  }

  const split = findBestSplit(grid, n, columns, totalRows);
  if (split) {
    return { type: "split", seats: split.seats, score: split.score };
  }

  return null;
};
