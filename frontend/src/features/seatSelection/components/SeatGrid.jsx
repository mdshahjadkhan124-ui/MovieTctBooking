import Seat from "./Seat.jsx";

const SeatGrid = ({ grid, selectedSeatIds, onToggleSeat }) => {
  const selectedSet = new Set(selectedSeatIds);
  let lastCategory = null;

  return (
    <div className="flex flex-col items-center gap-2 overflow-x-auto px-4 pb-4">
      {grid.map((row) => {
        const rowLetter = row[0]?.row;
        const category = row[0]?.category;
        const showCategoryHeading = category !== lastCategory;
        lastCategory = category;

        return (
          <div key={rowLetter} className="flex flex-col items-center gap-1">
            {showCategoryHeading && (
              <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500 first:mt-0">
                {category}
              </span>
            )}
            <div className="flex items-center gap-3">
              <span className="w-5 shrink-0 text-xs font-semibold text-gray-400">{rowLetter}</span>
              <div className="flex gap-1.5">
                {row.map((seat) => (
                  <Seat
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSet.has(seat.id)}
                    onToggle={() => onToggleSeat(seat)}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SeatGrid;
