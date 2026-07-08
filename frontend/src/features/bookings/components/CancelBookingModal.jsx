import { previewRefund } from "../../../lib/refundPolicy.js";

const CancelBookingModal = ({ booking, onClose, onConfirm, isSubmitting, error }) => {
  const preview = previewRefund(booking, booking.showtime, new Date());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-booking-title"
    >
      <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-lg">
        <h2 id="cancel-booking-title" className="text-base font-semibold text-gray-900">
          Cancel this booking?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {booking.showtime?.movie?.title} &middot; Seats: {booking.seatIds.join(", ")}
        </p>

        {preview.allowed ? (
          <div className="mt-3 rounded-md bg-surface px-3 py-2 text-sm text-gray-700">
            <p className="font-medium text-gray-900">
              You&apos;ll receive a {preview.refundPercent}% refund (&#8377;
              {preview.refundAmount})
            </p>
            <p className="mt-0.5 text-xs text-gray-500">{preview.reason}</p>
          </div>
        ) : (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {preview.reason}
          </p>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || !preview.allowed}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Cancelling..." : "Confirm cancellation"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelBookingModal;
