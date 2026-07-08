import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Elements } from "@stripe/react-stripe-js";
import {
  useGetShowtimeByIdQuery,
  useLockSeatsMutation,
  useGetLockedSeatsQuery,
} from "../api/showtimesApi.js";
import { useCheckoutMutation, useLazyGetBookingByIdQuery } from "../api/bookingsApi.js";
import { stripePromise } from "../lib/stripe.js";
import { socket } from "../lib/socket.js";
import { buildSeatGrid } from "../utils/buildSeatGrid.js";
import { toggleSeat, clearSelection } from "../features/seatSelection/seatSelectionSlice.js";
import ScreenIndicator from "../features/seatSelection/components/ScreenIndicator.jsx";
import SeatGrid from "../features/seatSelection/components/SeatGrid.jsx";
import Legend from "../features/seatSelection/components/Legend.jsx";
import SelectionSummary from "../features/seatSelection/components/SelectionSummary.jsx";
import CheckoutForm from "../features/seatSelection/components/CheckoutForm.jsx";

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 10;
const LOCK_REFRESH_INTERVAL_MS = 12000;

const SeatSelectionPage = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { data: showtime, isLoading, isError } = useGetShowtimeByIdQuery(id);

  // Socket.IO is the primary source of truth for lock state; polling is the
  // fallback for when it's unavailable (Render's free tier idles WebSocket
  // connections out, and any network blip drops them too). Polling pauses
  // itself (pollingInterval: 0) whenever the socket is live, and resumes the
  // instant it isn't — no manual coordination beyond that flag.
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [realtimeLockedSeatIds, setRealtimeLockedSeatIds] = useState(null);

  const { data: polledLockedSeatIds = [] } = useGetLockedSeatsQuery(id, {
    pollingInterval: isSocketConnected ? 0 : LOCK_REFRESH_INTERVAL_MS,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  });
  const lockedSeatIds =
    isSocketConnected && realtimeLockedSeatIds !== null
      ? realtimeLockedSeatIds
      : polledLockedSeatIds;

  const selectedSeatIds = useSelector((state) => state.seatSelection.selectedSeatIds);

  const [lockSeats] = useLockSeatsMutation();
  const [checkout] = useCheckoutMutation();
  const [fetchBooking] = useLazyGetBookingByIdQuery();

  // idle -> locking -> awaiting_payment -> confirming -> success | error
  const [checkoutState, setCheckoutState] = useState("idle");
  const [checkoutError, setCheckoutError] = useState("");
  const [clientSecret, setClientSecret] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const pollTimeoutRef = useRef(null);

  useEffect(() => {
    dispatch(clearSelection());
    setCheckoutState("idle");
    setCheckoutError("");
    setClientSecret(null);
    setBookingId(null);
  }, [id, dispatch]);

  useEffect(() => () => clearTimeout(pollTimeoutRef.current), []);

  // Joins this showtime's room and listens for real-time lock changes.
  // Reconnection is handled by socket.io-client itself (on by default) —
  // "connect" fires again after a drop, and rejoining the room there is
  // required because a reconnect is a new socket id, not a resumed one.
  useEffect(() => {
    setRealtimeLockedSeatIds(null);

    const handleConnect = () => {
      setIsSocketConnected(true);
      socket.emit("joinShowtime", id);
    };
    const handleDisconnect = () => setIsSocketConnected(false);
    const handleSeatsUpdated = (payload) => {
      if (payload.showtimeId === id) setRealtimeLockedSeatIds(payload.lockedSeatIds);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleDisconnect);
    socket.on("seatsUpdated", handleSeatsUpdated);
    socket.connect();

    return () => {
      socket.emit("leaveShowtime", id);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleDisconnect);
      socket.off("seatsUpdated", handleSeatsUpdated);
      socket.disconnect();
      setIsSocketConnected(false);
    };
  }, [id]);

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading seats...</p>;
  }

  if (isError || !showtime) {
    return <p className="px-8 py-24 text-center text-red-600">Could not load this showtime.</p>;
  }

  // Seats locked by other users render as "booked" (unavailable); a seat the
  // current user has selected themselves — including once they've locked it
  // at checkout — is excluded here so it keeps rendering as their selection.
  const lockedByOthers = new Set(
    lockedSeatIds.filter((seatId) => !selectedSeatIds.includes(seatId))
  );
  const grid = buildSeatGrid(showtime.screen?.layout, lockedByOthers);

  const handleToggleSeat = (seat) => {
    if (checkoutState !== "idle") return; // seats are locked in once checkout has started
    dispatch(toggleSeat({ id: seat.id, status: seat.status }));
  };

  const pollBookingStatus = (targetBookingId, attemptsLeft) => {
    if (attemptsLeft <= 0) {
      setCheckoutError("Payment succeeded, but confirmation is taking longer than expected. Check your bookings shortly.");
      setCheckoutState("error");
      return;
    }
    pollTimeoutRef.current = setTimeout(async () => {
      const result = await fetchBooking(targetBookingId);
      const status = result.data?.status;
      if (status === "confirmed") {
        setCheckoutState("success");
      } else if (status === "failed") {
        setCheckoutError("Your payment succeeded but the seats were no longer available, so it was refunded.");
        setCheckoutState("error");
      } else {
        pollBookingStatus(targetBookingId, attemptsLeft - 1);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleProceed = async () => {
    setCheckoutError("");
    setCheckoutState("locking");
    try {
      await lockSeats({ showtimeId: id, seatIds: selectedSeatIds }).unwrap();
      const result = await checkout({ showtimeId: id, seatIds: selectedSeatIds }).unwrap();
      setClientSecret(result.clientSecret);
      setBookingId(result.bookingId);
      setCheckoutState("awaiting_payment");
    } catch (err) {
      const message =
        err?.data?.error?.message ||
        (err?.status === 409
          ? "Some of these seats were just taken by someone else. Please pick different seats."
          : "Could not start checkout. Please try again.");
      setCheckoutError(message);
      setCheckoutState("error");
    }
  };

  const handleCharged = () => {
    setCheckoutState("confirming");
    pollBookingStatus(bookingId, POLL_MAX_ATTEMPTS);
  };

  const handlePaymentError = (message) => {
    setCheckoutError(message);
    setCheckoutState("error");
  };

  const handleRetry = () => {
    setCheckoutError("");
    setClientSecret(null);
    setBookingId(null);
    setCheckoutState("idle");
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

      <p className="flex items-center justify-center gap-1.5 pb-4 text-xs text-gray-400">
        <span
          className={`h-1.5 w-1.5 rounded-full ${isSocketConnected ? "bg-green-500" : "bg-gray-300"}`}
        />
        {isSocketConnected ? "Live seat updates" : "Updating every 12s"}
      </p>

      {checkoutState === "awaiting_payment" && clientSecret && (
        <div className="px-4 py-4">
          <Elements stripe={stripePromise}>
            <CheckoutForm
              clientSecret={clientSecret}
              onCharged={handleCharged}
              onError={handlePaymentError}
            />
          </Elements>
        </div>
      )}

      {checkoutState === "confirming" && (
        <p className="px-4 py-4 text-center text-sm text-gray-500">Confirming your booking...</p>
      )}

      {checkoutState === "success" && (
        <p className="px-4 py-4 text-center text-sm font-medium text-green-600">
          Booking confirmed! Seats: {selectedSeatIds.join(", ")}
        </p>
      )}

      {checkoutState === "error" && (
        <div className="flex flex-col items-center gap-2 px-4 py-4">
          <p className="text-center text-sm font-medium text-red-600">{checkoutError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-sm font-medium text-primary underline"
          >
            Try again
          </button>
        </div>
      )}

      {checkoutState !== "success" && (
        <SelectionSummary
          selectedSeatIds={selectedSeatIds}
          pricePerSeat={showtime.price}
          onProceed={handleProceed}
          disabled={checkoutState !== "idle"}
          busy={checkoutState === "locking"}
        />
      )}
    </section>
  );
};

export default SeatSelectionPage;
