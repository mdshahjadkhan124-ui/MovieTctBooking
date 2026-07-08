import { useState } from "react";
import { Link } from "react-router-dom";
import { useGetMoviesQuery } from "../../api/moviesApi.js";
import { useGetTheatersQuery } from "../../api/theatersApi.js";
import { useGetAdminScreensQuery } from "../../api/adminScreensApi.js";
import {
  useGetAdminShowtimesQuery,
  useUpdateShowtimeMutation,
} from "../../api/adminShowtimesApi.js";

const AdminShowtimesPage = () => {
  const [movieFilter, setMovieFilter] = useState("");
  const [theaterFilter, setTheaterFilter] = useState("");

  // Movies/theaters are looked up via the public endpoints (not the
  // super_admin-only admin ones) purely for display — a theater_admin can
  // reach this page too, and only needs names for the showtimes they can
  // already see (which are scoped to their own theater server-side).
  const { data: movies } = useGetMoviesQuery({});
  const { data: theaters } = useGetTheatersQuery();
  const { data: screens } = useGetAdminScreensQuery();

  const {
    data: showtimes,
    isLoading,
    isError,
  } = useGetAdminShowtimesQuery({ movie: movieFilter, theater: theaterFilter });
  const [updateShowtime] = useUpdateShowtimeMutation();
  const [togglingId, setTogglingId] = useState(null);
  const [actionError, setActionError] = useState("");

  const movieTitle = (id) => movies?.find((m) => m._id === id)?.title ?? id;
  const theaterName = (id) => theaters?.find((t) => t._id === id)?.name ?? id;
  const screenName = (id) => screens?.find((s) => s._id === id)?.name ?? id;

  const handleToggleActive = async (showtime) => {
    setActionError("");
    setTogglingId(showtime._id);
    try {
      await updateShowtime({ id: showtime._id, isActive: !showtime.isActive }).unwrap();
    } catch (err) {
      setActionError(err?.data?.error?.message || "Could not update showtime status");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Showtimes</h1>
        <Link
          to="/admin/showtimes/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add showtime
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={movieFilter}
          onChange={(e) => setMovieFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All movies</option>
          {movies?.map((m) => (
            <option key={m._id} value={m._id}>
              {m.title}
            </option>
          ))}
        </select>

        <select
          value={theaterFilter}
          onChange={(e) => setTheaterFilter(e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All theaters</option>
          {theaters?.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {isLoading && <p className="text-gray-500">Loading showtimes...</p>}
      {isError && <p className="text-red-600">Failed to load showtimes.</p>}

      {showtimes && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Movie</th>
                <th className="px-4 py-3">Theater</th>
                <th className="px-4 py-3">Screen</th>
                <th className="px-4 py-3">Start time</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {showtimes.map((showtime) => (
                <tr key={showtime._id}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {movieTitle(showtime.movie)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{theaterName(showtime.theater)}</td>
                  <td className="px-4 py-3 text-gray-600">{screenName(showtime.screen)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(showtime.startTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{showtime.format}</td>
                  <td className="px-4 py-3 text-gray-600">&#8377;{showtime.price}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        showtime.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {showtime.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        to={`/admin/showtimes/${showtime._id}/edit`}
                        className="text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        disabled={togglingId === showtime._id}
                        onClick={() => handleToggleActive(showtime)}
                        className="text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {showtime.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {showtimes.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-500">No showtimes yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminShowtimesPage;
