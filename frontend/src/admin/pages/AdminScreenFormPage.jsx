import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGetMeQuery } from "../../api/authApi.js";
import { useGetTheatersQuery } from "../../api/theatersApi.js";
import {
  useGetAdminScreenByIdQuery,
  useCreateScreenMutation,
  useUpdateScreenMutation,
} from "../../api/adminScreensApi.js";
import { buildSeatGrid } from "../../utils/buildSeatGrid.js";
import SeatGrid from "../../features/seatSelection/components/SeatGrid.jsx";

const EMPTY_CATEGORY = { category: "", rowsText: "" };

const toFormState = (screen) => ({
  theaterId: screen.theater,
  name: screen.name ?? "",
  rows: String(screen.layout?.rows ?? ""),
  columns: String(screen.layout?.columns ?? ""),
  categories: (screen.layout?.seatCategories ?? []).map((c) => ({
    category: c.category,
    rowsText: (c.rows ?? []).join(", "),
  })),
  unavailableSeatsText: (screen.layout?.unavailableSeats ?? []).join(", "),
});

// Same shape buildSeatGrid/recommendSeats consume — see Sprint 3/4. Built
// fresh on every render from form state so the preview below is always the
// literal payload that will be submitted, not an approximation of it.
const buildLayout = (form) => ({
  rows: Number(form.rows) || 0,
  columns: Number(form.columns) || 0,
  seatCategories: form.categories
    .map((c) => ({
      category: c.category.trim(),
      rows: c.rowsText
        .split(",")
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean),
    }))
    .filter((c) => c.category && c.rows.length > 0),
  unavailableSeats: form.unavailableSeatsText
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
});

const validate = (form) => {
  if (!form.theaterId) return "Theater is required";
  if (!form.name.trim()) return "Screen name is required";
  const rows = Number(form.rows);
  const columns = Number(form.columns);
  if (!Number.isInteger(rows) || rows <= 0) return "Rows must be a positive integer";
  if (!Number.isInteger(columns) || columns <= 0) return "Columns must be a positive integer";
  return "";
};

const noop = () => {};

const AdminScreenFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: user } = useGetMeQuery();
  const isSuperAdmin = user?.role === "super_admin";
  const { data: theaters } = useGetTheatersQuery();

  const { data: existingScreen, isLoading: isLoadingScreen } = useGetAdminScreenByIdQuery(id, {
    skip: !isEdit,
  });
  const [createScreen, { isLoading: isCreating }] = useCreateScreenMutation();
  const [updateScreen, { isLoading: isUpdating }] = useUpdateScreenMutation();

  const [form, setForm] = useState({
    theaterId: "",
    name: "",
    rows: "8",
    columns: "12",
    categories: [EMPTY_CATEGORY],
    unavailableSeatsText: "",
  });
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (existingScreen) setForm(toFormState(existingScreen));
    else if (!isEdit && !isSuperAdmin && user?.theater) {
      setForm((f) => ({ ...f, theaterId: user.theater }));
    }
  }, [existingScreen, isEdit, isSuperAdmin, user]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleCategoryChange = (index, field) => (e) => {
    setForm((f) => {
      const categories = [...f.categories];
      categories[index] = { ...categories[index], [field]: e.target.value };
      return { ...f, categories };
    });
  };

  const addCategory = () =>
    setForm((f) => ({ ...f, categories: [...f.categories, { ...EMPTY_CATEGORY }] }));

  const removeCategory = (index) =>
    setForm((f) => ({ ...f, categories: f.categories.filter((_, i) => i !== index) }));

  const layout = useMemo(() => buildLayout(form), [form]);
  const previewGrid = useMemo(() => buildSeatGrid(layout), [layout]);

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
      if (isEdit) {
        await updateScreen({ id, name: form.name.trim(), layout }).unwrap();
      } else {
        await createScreen({ theater: form.theaterId, name: form.name.trim(), layout }).unwrap();
      }
      setSuccess(true);
      setTimeout(() => navigate("/admin/screens"), 700);
    } catch (err) {
      setFormError(err?.data?.error?.message || "Could not save screen");
    }
  };

  if (isEdit && isLoadingScreen) {
    return <p className="text-gray-500">Loading screen...</p>;
  }

  const isSaving = isCreating || isUpdating;
  const theaterName = theaters?.find((t) => t._id === form.theaterId)?.name ?? form.theaterId;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">{isEdit ? "Edit Screen" : "Add Screen"}</h1>

      <div className="flex flex-wrap gap-8">
        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Theater *
            {isEdit || !isSuperAdmin ? (
              <input
                type="text"
                value={theaterName || "—"}
                disabled
                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500"
              />
            ) : (
              <select
                value={form.theaterId}
                onChange={handleChange("theaterId")}
                className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">Select a theater</option>
                {theaters?.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Screen name *
            <input
              type="text"
              value={form.name}
              onChange={handleChange("name")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Rows *
              <input
                type="number"
                min="1"
                value={form.rows}
                onChange={handleChange("rows")}
                className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Columns *
              <input
                type="number"
                min="1"
                value={form.columns}
                onChange={handleChange("columns")}
                className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Seat categories</span>
              <button
                type="button"
                onClick={addCategory}
                className="text-xs font-medium text-primary"
              >
                + Add category
              </button>
            </div>
            {form.categories.map((cat, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Category (e.g. Premium)"
                  value={cat.category}
                  onChange={handleCategoryChange(index, "category")}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="Rows (e.g. A, B)"
                  value={cat.rowsText}
                  onChange={handleCategoryChange(index, "rowsText")}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => removeCategory(index)}
                  className="text-sm text-gray-400 hover:text-red-600"
                  aria-label="Remove category"
                >
                  &times;
                </button>
              </div>
            ))}
            <p className="text-xs text-gray-400">
              Rows not covered by any category default to "regular".
            </p>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            Unavailable seats (comma-separated seat ids)
            <input
              type="text"
              placeholder="A5, C1, H12"
              value={form.unavailableSeatsText}
              onChange={handleChange("unavailableSeatsText")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {success && <p className="text-sm text-green-600">Saved!</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/admin/screens")}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Live preview</span>
          <div className="rounded-md border border-gray-200 bg-white py-4">
            {previewGrid.length > 0 ? (
              <SeatGrid grid={previewGrid} selectedSeatIds={[]} onToggleSeat={noop} />
            ) : (
              <p className="px-4 text-sm text-gray-400">
                Enter rows and columns to preview the layout.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminScreenFormPage;
