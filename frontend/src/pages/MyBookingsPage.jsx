import { useState } from "react";
import { Link } from "react-router-dom";
import { useGetMyBookingsQuery, useCancelBookingMutation } from "../api/bookingsApi.js";
import CancelBookingModal from "../features/bookings/components/CancelBookingModal.jsx";

const STATUS_STYLES = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-200 text-gray-600",
};

const StatusBadge = ({ status }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}
  >
    {status}
  </span>
);

// A booking can only be cancelled while it's confirmed and the showtime
// hasn't started yet — the server enforces this too (NOT_CANCELLABLE /
// CANCELLATION_WINDOW_CLOSED), this just keeps the button from appearing
// where it would only ever fail.
const isCancellable = (booking) =>
  booking.status === "confirmed" &&
  booking.showtime?.startTime &&
  new Date(booking.showtime.startTime) > new Date();

const MyBookingsPage = () => {
  const { data: bookings, isLoading, isError } = useGetMyBookingsQuery();
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState("");

  const closeModal = () => {
    setCancelTarget(null);
    setCancelError("");
  };

  const handleConfirmCancel = async () => {
    setCancelError("");
    try {
      await cancelBooking(cancelTarget._id).unwrap();
      setCancelTarget(null);
    } catch (err) {
      setCancelError(
        err?.data?.error?.message || "Could not cancel this booking. Please try again."
      );
    }
  };

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading your bookings...</p>;
  }

  if (isError) {
    return <p className="px-8 py-24 text-center text-red-600">Could not load your bookings.</p>;
  }

  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-lg font-semibold text-gray-900">My Bookings</h1>

      {bookings.length === 0 && (
        <p className="text-sm text-gray-500">You haven't booked any tickets yet.</p>
      )}

      {bookings.map((booking) => (
        <div
          key={booking._id}
          className="flex flex-col gap-2 rounded-md border border-gray-200 p-4 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
        >
          <Link to={`/bookings/${booking._id}/ticket`} className="flex-1">
            <p className="font-medium text-gray-900">{booking.showtime?.movie?.title}</p>
            <p className="text-sm text-gray-500">
              {booking.theater?.name} &middot;{" "}
              {new Date(booking.showtime?.startTime).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">
              Seats: {booking.seatIds.join(", ")} &middot; &#8377;{booking.amount}
            </p>
            {booking.status === "cancelled" && (
              <p className="text-sm text-gray-500">
                Refund: &#8377;{booking.refundAmount ?? 0}
              </p>
            )}
          </Link>

          <div className="flex flex-row items-center gap-3 sm:flex-col sm:items-end">
            <StatusBadge status={booking.status} />
            {isCancellable(booking) && (
              <button
                type="button"
                onClick={() => setCancelTarget(booking)}
                className="text-xs font-medium text-red-600 underline-offset-2 hover:underline"
              >
                Cancel Booking
              </button>
            )}
          </div>
        </div>
      ))}

      {cancelTarget && (
        <CancelBookingModal
          booking={cancelTarget}
          onClose={closeModal}
          onConfirm={handleConfirmCancel}
          isSubmitting={isCancelling}
          error={cancelError}
        />
      )}
    </section>
  );
};

export default MyBookingsPage;
