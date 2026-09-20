import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useGetBookingByIdQuery } from "../api/bookingsApi.js";

const ETicketPage = () => {
  const { id } = useParams();
  const { data: booking, isLoading, isError } = useGetBookingByIdQuery(id);

  if (isLoading) {
    return <p className="px-8 py-24 text-center text-gray-500">Loading ticket...</p>;
  }

  if (isError || !booking) {
    return <p className="px-8 py-24 text-center text-red-600">Could not load this booking.</p>;
  }

  if (booking.status === "pending") {
    return (
      <p className="px-8 py-24 text-center text-sm text-yellow-700">
        This booking is still awaiting payment confirmation. Check back shortly.
      </p>
    );
  }

  if (booking.status === "failed") {
    return (
      <p className="px-8 py-24 text-center text-sm text-red-600">
        This booking failed and was refunded — no ticket was issued.
      </p>
    );
  }

  const showtime = booking.showtime;

  // Deliberately no QR code and no ticket styling — a cancelled booking
  // must never look like something that could be scanned at the door.
  if (booking.status === "cancelled") {
    return (
      <section className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-lg border border-gray-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Booking cancelled
          </p>
          <h1 className="mt-1 text-lg font-semibold text-gray-900">{showtime?.movie?.title}</h1>
          <p className="mt-2 text-sm text-gray-600">
            This ticket is no longer valid and can't be used for entry.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Showtime</dt>
              <dd className="text-gray-700">{new Date(showtime?.startTime).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Seats</dt>
              <dd className="text-gray-700">{booking.seatIds.join(", ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-400">Refund</dt>
              <dd className="text-gray-700">
                &#8377;{booking.refundAmount ?? 0}
                {booking.refundStatus === "pending" && (
                  <span className="text-gray-500"> (processing)</span>
                )}
              </dd>
            </div>
            {booking.cancelledAt && (
              <div>
                <dt className="text-xs text-gray-400">Cancelled on</dt>
                <dd className="text-gray-700">{new Date(booking.cancelledAt).toLocaleString()}</dd>
              </div>
            )}
          </dl>
        </div>
      </section>
    );
  }

  // Only a confirmed booking gets a ticket — any other status reaching here
  // shouldn't render something that looks valid either.
  if (booking.status !== "confirmed") {
    return (
      <p className="px-8 py-24 text-center text-sm text-gray-500">
        No valid ticket exists for this booking.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-10 print:py-0">
      <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
        <div className="bg-primary px-5 py-4 text-white">
          <p className="text-xs uppercase tracking-wide opacity-80">E-Ticket</p>
          <h1 className="text-lg font-semibold">{showtime?.movie?.title}</h1>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">Theater</p>
              <p className="font-medium text-gray-900">{booking.theater?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Screen</p>
              <p className="font-medium text-gray-900">{showtime?.screen?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Showtime</p>
              <p className="font-medium text-gray-900">
                {new Date(showtime?.startTime).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Seats</p>
              <p className="font-medium text-gray-900">{booking.seatIds.join(", ")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Amount paid</p>
              <p className="font-medium text-gray-900">&#8377;{booking.amount}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Booking ID</p>
              <p className="break-all font-mono text-xs font-medium text-gray-900">
                {booking._id}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-dashed border-gray-300 px-5 py-5">
          <div className="flex flex-col items-center gap-2">
            <QRCodeSVG value={booking._id} size={140} />
            <p className="text-xs text-gray-400">Scan to verify this booking</p>
          </div>
        </div>

        <div className="bg-navy px-5 py-3 text-center text-xs text-white/70">
          MovieBooking &middot; Confirmed booking
        </div>
      </div>
    </section>
  );
};

export default ETicketPage;
