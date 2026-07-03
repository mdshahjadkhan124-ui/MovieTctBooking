const STATUS_STYLES = {
  available: "border-gray-300 bg-white text-gray-600 hover:border-primary hover:text-primary",
  unavailable: "border-gray-200 bg-gray-100 text-gray-300 cursor-not-allowed",
  booked: "border-gray-200 bg-gray-300 text-gray-400 cursor-not-allowed",
  selected: "border-primary bg-primary text-white",
};

const Seat = ({ seat, isSelected, onToggle }) => {
  const disabled = seat.status !== "available";
  const styleKey = isSelected ? "selected" : seat.status;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={seat.id}
      aria-label={`Seat ${seat.id}, ${isSelected ? "selected" : seat.status}`}
      aria-pressed={isSelected}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-t-md border text-[10px] font-medium transition-colors ${STATUS_STYLES[styleKey]}`}
    >
      {seat.col}
    </button>
  );
};

export default Seat;
