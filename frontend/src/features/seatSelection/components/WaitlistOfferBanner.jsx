import { useEffect, useState } from "react";

const formatRemaining = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

// Self-contained countdown so the parent only needs to hand over the offer
// and get told when it's gone (booked or expired) — it doesn't need to
// carry a ticking clock in its own state.
const WaitlistOfferBanner = ({ offer, onBookNow, onExpire, busy }) => {
  const [remainingMs, setRemainingMs] = useState(offer.expiresAt - Date.now());

  useEffect(() => {
    const tick = () => setRemainingMs(offer.expiresAt - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [offer.expiresAt]);

  useEffect(() => {
    if (remainingMs <= 0) onExpire();
  }, [remainingMs, onExpire]);

  if (remainingMs <= 0) return null;

  return (
    <div className="mx-4 mt-4 flex flex-col gap-2 rounded-md border border-green-300 bg-green-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-green-800">
          Seats available! You have {formatRemaining(remainingMs)} to book.
        </p>
        <p className="text-sm text-green-700">Reserved for you: {offer.seatIds.join(", ")}</p>
      </div>
      <button
        type="button"
        onClick={onBookNow}
        disabled={busy}
        className="shrink-0 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Book Now
      </button>
    </div>
  );
};

export default WaitlistOfferBanner;
