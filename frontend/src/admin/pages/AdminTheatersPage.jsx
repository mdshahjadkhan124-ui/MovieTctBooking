import { useState } from "react";
import { Link } from "react-router-dom";
import { useGetMeQuery } from "../../api/authApi.js";
import { useGetAdminTheatersQuery, useUpdateTheaterMutation } from "../../api/adminTheatersApi.js";

const AdminTheatersPage = () => {
  const { data: user, isLoading: isLoadingUser } = useGetMeQuery();
  const isSuperAdmin = user?.role === "super_admin";

  // Theater management is a super_admin-only route on the backend (unlike
  // Movies, there's no read-only fallback for other roles) — skip the
  // request entirely for a theater_admin rather than firing a call that's
  // guaranteed to 403.
  const { data: theaters, isLoading, isError } = useGetAdminTheatersQuery(undefined, {
    skip: !isSuperAdmin,
  });
  const [updateTheater] = useUpdateTheaterMutation();
  const [togglingId, setTogglingId] = useState(null);
  const [actionError, setActionError] = useState("");

  const handleToggleActive = async (theater) => {
    setActionError("");
    setTogglingId(theater._id);
    try {
      await updateTheater({ id: theater._id, isActive: !theater.isActive }).unwrap();
    } catch (err) {
      setActionError(err?.data?.error?.message || "Could not update theater status");
    } finally {
      setTogglingId(null);
    }
  };

  if (isLoadingUser) return <p className="text-gray-500">Loading...</p>;

  if (!isSuperAdmin) {
    return (
      <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
        Theater management is restricted to super admins.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Theaters</h1>
        <Link
          to="/admin/theaters/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add theater
        </Link>
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}

      {isLoading && <p className="text-gray-500">Loading theaters...</p>}
      {isError && <p className="text-red-600">Failed to load theaters.</p>}

      {theaters && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {theaters.map((theater) => (
                <tr key={theater._id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{theater.name}</td>
                  <td className="px-4 py-3 text-gray-600">{theater.location?.city}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {theater.owner ?? "Unassigned"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        theater.isActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {theater.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <Link
                        to={`/admin/theaters/${theater._id}/edit`}
                        className="text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        disabled={togglingId === theater._id}
                        onClick={() => handleToggleActive(theater)}
                        className="text-gray-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {theater.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {theaters.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-500">No theaters yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminTheatersPage;
