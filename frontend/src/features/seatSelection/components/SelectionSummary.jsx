const SelectionSummary = ({ selectedSeatIds, pricePerSeat, onProceed }) => {
  const count = selectedSeatIds.length;
  const total = count * (pricePerSeat ?? 0);

  return (
    <div className="sticky bottom-0 flex flex-col gap-3 border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-gray-700">
        {count === 0 ? (
          <span className="text-gray-400">Select seats to continue</span>
        ) : (
          <>
            <p className="font-medium">
              {count} seat{count > 1 ? "s" : ""}: {selectedSeatIds.join(", ")}
            </p>
            <p className="text-gray-500">Total: &#8377;{total}</p>
          </>
        )}
      </div>
      <button
        type="button"
        disabled={count === 0}
        onClick={onProceed}
        className="rounded-md bg-primary px-6 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        Proceed
      </button>
    </div>
  );
};

export default SelectionSummary;
