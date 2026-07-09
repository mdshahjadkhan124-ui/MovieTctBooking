import { useState } from "react";
import { useJoinWaitlistMutation, useLeaveWaitlistMutation } from "../../../api/waitlistApi.js";
import ThemedSelect from "../../../components/ThemedSelect.jsx";

const SEAT_OPTIONS = [1, 2, 3, 4];

const WaitlistPanel = ({ showtimeId, myStatus, onChanged }) => {
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [joinWaitlist, { isLoading: isJoining }] = useJoinWaitlistMutation();
  const [leaveWaitlist, { isLoading: isLeaving }] = useLeaveWaitlistMutation();
  const [error, setError] = useState("");

  const handleJoin = async () => {
    setError("");
    try {
      await joinWaitlist({ showtimeId, seatsRequested }).unwrap();
      onChanged?.();
    } catch (err) {
      setError(err?.data?.error?.message || "Could not join the waitlist.");
    }
  };

  const handleLeave = async () => {
    setError("");
    try {
      await leaveWaitlist(showtimeId).unwrap();
      onChanged?.();
    } catch (err) {
      setError(err?.data?.error?.message || "Could not leave the waitlist.");
    }
  };

  if (myStatus?.status === "waiting") {
    return (
      <div className="mx-4 mt-4 flex flex-col gap-2 rounded-md border border-gray-200 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-700">
          You're <span className="font-semibold">#{myStatus.position}</span> in line for{" "}
          {myStatus.seatsRequested} seat{myStatus.seatsRequested > 1 ? "s" : ""}.
        </p>
        <div className="flex items-center gap-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleLeave}
            disabled={isLeaving}
            className="shrink-0 text-sm font-medium text-red-600 underline-offset-2 hover:underline disabled:opacity-50"
          >
            Leave Waitlist
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-4 flex flex-col gap-2 rounded-md border border-gray-200 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-700">This showtime is full. Join the waitlist:</p>
        <ThemedSelect
          value={seatsRequested}
          onChange={(e) => setSeatsRequested(Number(e.target.value))}
        >
          {SEAT_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} seat{n > 1 ? "s" : ""}
            </option>
          ))}
        </ThemedSelect>
      </div>
      <div className="flex items-center gap-3">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleJoin}
          disabled={isJoining}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Join Waitlist
        </button>
      </div>
    </div>
  );
};

export default WaitlistPanel;
