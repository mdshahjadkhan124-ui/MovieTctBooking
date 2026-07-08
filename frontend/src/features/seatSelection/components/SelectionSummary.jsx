const SelectionSummary = ({ selectedSeatIds, seatPricesById, onProceed, disabled, busy }) => {
  const count = selectedSeatIds.length;
  const prices = selectedSeatIds
    .map((seatId) => ({ seatId, price: seatPricesById?.[seatId] }))
    .filter((entry) => entry.price);
  const pricingReady = prices.length === count;
  const total = prices.reduce((sum, { price }) => sum + price.finalPrice, 0);
  const first = prices[0]?.price;

  return (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] sm:flex-row sm:items-start sm:justify-between">
      <div className="text-sm text-gray-700">
        {count === 0 ? (
          <span className="text-gray-400">Select seats to continue</span>
        ) : !pricingReady ? (
          <span className="text-gray-400">Calculating price...</span>
        ) : (
          <>
            <p className="font-medium">
              {count} seat{count > 1 ? "s" : ""}: {selectedSeatIds.join(", ")}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
              <li>Base price: &#8377;{first.breakdown.basePrice} / seat</li>
              <li>
                {first.breakdown.occupancy.label}: &times;{first.breakdown.occupancy.multiplier}
              </li>
              <li>
                {first.breakdown.time.label}: &times;{first.breakdown.time.multiplier}
              </li>
              {prices.map(({ seatId, price }) => (
                <li key={seatId}>
                  {seatId} ({price.breakdown.position.label}): &#8377;{price.finalPrice}
                </li>
              ))}
            </ul>
            <p className="mt-1 font-semibold text-gray-900">Total: &#8377;{total}</p>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={count === 0 || disabled || !pricingReady}
        onClick={onProceed}
        className="shrink-0 rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Locking seats..." : "Proceed"}
      </button>
    </div>
  );
};

export default SelectionSummary;
