import { useState } from "react";
import { Link } from "react-router-dom";
import { useGetMeQuery } from "../../api/authApi.js";
import { useGetTheatersQuery } from "../../api/theatersApi.js";
import { useGetAdminScreensQuery } from "../../api/adminScreensApi.js";

const AdminScreensPage = () => {
  const { data: user, isLoading: isLoadingUser } = useGetMeQuery();
  const isSuperAdmin = user?.role === "super_admin";
  const { data: theaters } = useGetTheatersQuery();
  const [selectedTheaterId, setSelectedTheaterId] = useState("");

  // theater_admin's screens are already scoped server-side to their own
  // theater, so the filter dropdown only makes sense for super_admin.
  const effectiveTheaterId = isSuperAdmin ? selectedTheaterId : undefined;
  const { data: screens, isLoading, isError } = useGetAdminScreensQuery(
    effectiveTheaterId || undefined,
    { skip: isLoadingUser }
  );

  const theaterName = (id) => theaters?.find((t) => t._id === id)?.name ?? id;

  if (isLoadingUser) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Screens</h1>
        <Link
          to="/admin/screens/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Add screen
        </Link>
      </div>

      {isSuperAdmin && (
        <select
          value={selectedTheaterId}
          onChange={(e) => setSelectedTheaterId(e.target.value)}
          className="w-fit rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-primary"
        >
          <option value="">All theaters</option>
          {theaters?.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {isLoading && <p className="text-gray-500">Loading screens...</p>}
      {isError && <p className="text-red-600">Failed to load screens.</p>}

      {screens && (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Theater</th>
                <th className="px-4 py-3">Screen</th>
                <th className="px-4 py-3">Rows x Columns</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {screens.map((screen) => (
                <tr key={screen._id}>
                  <td className="px-4 py-3 text-gray-600">{theaterName(screen.theater)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{screen.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {screen.layout?.rows} x {screen.layout?.columns}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {screen.layout?.seatCategories?.map((c) => c.category).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/screens/${screen._id}/edit`}
                      className="text-primary hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {screens.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-500">No screens yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminScreensPage;
