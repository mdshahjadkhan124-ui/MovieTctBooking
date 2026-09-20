import ThemedSelect from "../../../components/ThemedSelect.jsx";

// Entry point for the seat recommendation engine
// (GET /showtimes/:id/recommend). Presentational only: the page owns the
// request and applies the returned seats as the current selection, which is
// what makes them light up in the grid above.
const SeatSuggestion = ({ count, onCountChange, onSuggest, busy, disabled, message }) => (
  <div className="flex flex-col items-center gap-2 border-t border-gray-100 px-4 py-3">
    <div className="flex flex-wrap items-center justify-center gap-2">
      <label htmlFor="suggest-count" className="text-sm text-gray-600">
        Booking for
      </label>
      <ThemedSelect
        id="suggest-count"
        value={count}
        onChange={(e) => onCountChange(Number(e.target.value))}
        disabled={disabled || busy}
        aria-label="Number of seats to suggest"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "seat" : "seats"}
          </option>
        ))}
      </ThemedSelect>
      <button
        type="button"
        onClick={onSuggest}
        disabled={disabled || busy}
        className="rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Finding seats..." : "Suggest best seats"}
      </button>
    </div>
    {message && <p className="text-center text-xs text-gray-600">{message}</p>}
  </div>
);

export default SeatSuggestion;
