import { useState } from "react";
import { useGetMeQuery } from "../../api/authApi.js";
import { useGetAdminTheatersQuery } from "../../api/adminTheatersApi.js";
import { useGetTheaterAdminsQuery, useCreateTheaterAdminMutation } from "../../api/adminUsersApi.js";

const EMPTY_FORM = { name: "", email: "", password: "", theater: "" };

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const validate = (form) => {
  if (!form.name.trim()) return "Name is required";
  if (!EMAIL_RE.test(form.email)) return "A valid email is required";
  if (form.password.length < 8) return "Password must be at least 8 characters";
  if (!form.theater) return "A theater must be assigned";
  return "";
};

const AdminUsersPage = () => {
  const { data: user, isLoading: isLoadingUser } = useGetMeQuery();
  const isSuperAdmin = user?.role === "super_admin";

  // User management is a super_admin-only route on the backend — skip both
  // requests entirely for anyone else rather than firing calls guaranteed
  // to 403 (same pattern as AdminTheatersPage).
  const { data: theaters } = useGetAdminTheatersQuery(undefined, { skip: !isSuperAdmin });
  const {
    data: admins,
    isLoading: isLoadingAdmins,
    isError: isAdminsError,
  } = useGetTheaterAdminsQuery(undefined, { skip: !isSuperAdmin });
  const [createTheaterAdmin, { isLoading: isCreating }] = useCreateTheaterAdminMutation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);
    const validationError = validate(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");

    try {
      await createTheaterAdmin({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        theater: form.theater,
      }).unwrap();
      setForm(EMPTY_FORM);
      setSuccess(true);
    } catch (err) {
      setFormError(err?.data?.error?.message || "Could not create theater admin");
    }
  };

  if (isLoadingUser) return <p className="text-gray-500">Loading...</p>;

  if (!isSuperAdmin) {
    return (
      <p className="rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
        User management is restricted to super admins.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Users</h1>

        <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name *
            <input
              type="text"
              value={form.name}
              onChange={handleChange("name")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Email *
            <input
              type="email"
              value={form.email}
              onChange={handleChange("email")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password *
            <input
              type="password"
              value={form.password}
              onChange={handleChange("password")}
              placeholder="Min 8 characters"
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Theater *
            <select
              value={form.theater}
              onChange={handleChange("theater")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            >
              <option value="">Select a theater</option>
              {theaters?.map((theater) => (
                <option key={theater._id} value={theater._id}>
                  {theater.name} ({theater.location?.city})
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-gray-500">
            Role is fixed as <span className="font-mono">theater_admin</span>, scoped to the
            selected theater.
          </p>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {success && <p className="text-sm text-green-600">Theater admin created.</p>}

          <div>
            <button
              type="submit"
              disabled={isCreating}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating ? "Creating..." : "Create theater admin"}
            </button>
          </div>
        </form>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Theater Admins</h2>

        {isLoadingAdmins && <p className="text-gray-500">Loading theater admins...</p>}
        {isAdminsError && <p className="text-red-600">Failed to load theater admins.</p>}

        {admins && (
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Assigned Theater</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{admin.name}</td>
                    <td className="px-4 py-3 text-gray-600">{admin.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {admin.theater ? (
                        `${admin.theater.name} (${admin.theater.city})`
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {admins.length === 0 && (
              <p className="px-4 py-6 text-center text-gray-500">No theater admins yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminUsersPage;
