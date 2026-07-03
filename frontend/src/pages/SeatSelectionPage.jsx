import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useGetShowtimeByIdQuery } from "../api/showtimesApi.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { toggleSeat, clearSelection } from "../features/seatSelection/seatSelectionSlice.js";
import ScreenIndicator from "../features/seatSelection/components/ScreenIndicator.jsx";
import SeatGrid from "../features/seatSelection/components/SeatGrid.jsx";
import Legend from "../features/seatSelection/components/Legend.jsx";
import SelectionSummary from "../features/seatSelection/components/SelectionSummary.jsx";

// Real booked-seat data (Redis locks + confirmed bookings) arrives in Sprint 5;
// until then every showtime is treated as having zero booked seats.
const EMPTY_BOOKED_SEATS = new Set();

const SeatSelectionPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { data: showtime, isLoading, isError } = useGetShowtimeByIdQuery(id);
  const selectedSeatIds = useSelector((state) => state.seatSelection.selectedSeatIds);

  useEffect(() => {
    dispatch(clearSelection());
  }, [id, dispatch]);

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading seats...</p>;
  }

  if (isError || !showtime) {
    return <p className="px-8 py-24 text-center text-red-600">Could not load this showtime.</p>;
  }

  const grid = buildSeatGrid(showtime.screen?.layout, EMPTY_BOOKED_SEATS);

  const handleToggleSeat = (seat) => {
    dispatch(toggleSeat({ id: seat.id, status: seat.status }));
  };

  const handleProceed = () => {
    // Booking flow (locking, payment, confirmation) is Sprint 5 — stub only.
    console.log("Proceed with seats:", selectedSeatIds);
  };

  return (
    <section className="flex flex-col pb-24">
      <div className="px-4 py-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">{showtime.movie?.title}</h1>
        <p className="text-sm text-gray-500">
          {showtime.theater?.name} &middot; {showtime.screen?.name} &middot;{" "}
          {new Date(showtime.startTime).toLocaleString()}
        </p>
      </div>

      <ScreenIndicator />
      <SeatGrid grid={grid} selectedSeatIds={selectedSeatIds} onToggleSeat={handleToggleSeat} />
      <Legend />
      <SelectionSummary
        selectedSeatIds={selectedSeatIds}
        pricePerSeat={showtime.price}
        onProceed={handleProceed}
      />
    </section>
  );
};

export default SeatSelectionPage;
