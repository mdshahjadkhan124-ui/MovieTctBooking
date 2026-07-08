import { useState } from "react";
import { Link } from "react-router-dom";
import { useGetMeQuery } from "../../api/authApi.js";
import { useGetAdminMoviesQuery, useUpdateMovieMutation } from "../../api/adminMoviesApi.js";

const AdminMoviesPage = () => {
  const { data: user } = useGetMeQuery();
  const isSuperAdmin = user?.role === "super_admin";

  const { data: movies, isLoading, isError } = useGetAdminMoviesQuery();
  const [updateMovie, { isLoading: isToggling }] = useUpdateMovieMutation();
  const [togglingId, setTogglingId] = useState(null);
  const [error, setError] = useState("");

  const handleToggleActive = async (movie) => {
    setError("");
    setTogglingId(movie._id);
    try {
      await updateMovie({ id: movie._id, isActive: !movie.isActive }).unwrap();
    } catch (err) {
      setError(err?.data?.error?.message || "Could not update movie status");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Movies</h1>
        {isSuperAdmin && (
          <Link
            to="/admin/movies/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Add movie
          </Link>
        )}
      </div>

      {!isSuperAdmin && (
        <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Movie management is restricted to super admins. You can view the catalog below.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoading && <p className="text-gray-500">Loading movies...</p>}
      {isError && <p className="text-red-600">Failed to load movies.</p>}

      {movies && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Genres</th>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Status</th>
                {isSuperAdmin && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movies.map((movie) => (
                <tr key={movie._id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{movie.title}</td>
                  <td className="px-4 py-3 text-gray-600">{movie.genres?.join(", ")}</td>
                  <td className="px-4 py-3 text-gray-600">{movie.language}</td>
                  <td className="px-4 py-3 text-gray-600">{movie.rating ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        movie.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {movie.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {isSuperAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-3">
                        <Link
                          to={`/admin/movies/${movie._id}/edit`}
                          className="text-primary hover:underline"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          disabled={isToggling && togglingId === movie._id}
                          onClick={() => handleToggleActive(movie)}
                          className="text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {movie.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {movies.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-500">No movies yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminMoviesPage;
