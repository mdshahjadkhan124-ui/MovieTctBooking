import { Link } from "react-router-dom";
import { useGetMyBookingsQuery } from "../api/bookingsApi.js";

const STATUS_STYLES = {
  confirmed: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

const StatusBadge = ({ status }) => (
  <span
    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLES[status] || "bg-gray-100 text-gray-600"}`}
  >
    {status}
  </span>
);

const MyBookingsPage = () => {
  const { data: bookings, isLoading, isError } = useGetMyBookingsQuery();

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
        <Link
          key={booking._id}
          to={`/bookings/${booking._id}/ticket`}
          className="flex flex-col gap-2 rounded-md border border-gray-200 p-4 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium text-gray-900">{booking.showtime?.movie?.title}</p>
            <p className="text-sm text-gray-500">
              {booking.theater?.name} &middot;{" "}
              {new Date(booking.showtime?.startTime).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">
              Seats: {booking.seatIds.join(", ")} &middot; &#8377;{booking.amount}
            </p>
          </div>
          <StatusBadge status={booking.status} />
        </Link>
      ))}
    </section>
  );
};

export default MyBookingsPage;
