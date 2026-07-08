import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGetMoviesQuery } from "../../api/moviesApi.js";
import { useGetTheatersQuery } from "../../api/theatersApi.js";
import { useGetAdminScreensQuery } from "../../api/adminScreensApi.js";
import {
  useGetAdminShowtimeByIdQuery,
  useCreateShowtimeMutation,
  useUpdateShowtimeMutation,
} from "../../api/adminShowtimesApi.js";

const FORMATS = ["2D", "3D", "IMAX"];

const pad = (n) => String(n).padStart(2, "0");

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in the browser's local time
// — Date's local getters (not the UTC ones) round-trip that correctly.
const toDatetimeLocalValue = (isoOrDate) => {
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const toFormState = (showtime) => ({
  movieId: showtime.movie,
  screenId: showtime.screen,
  startTime: toDatetimeLocalValue(showtime.startTime),
  price: String(showtime.price ?? ""),
  format: showtime.format ?? "2D",
  language: showtime.language ?? "",
  isActive: showtime.isActive ?? true,
});

// The future-time rule only applies when startTime is actually being set —
// an existing showtime can legitimately already be in the past (e.g. an
// old seed), and an admin editing its price shouldn't be blocked from
// saving just because they didn't touch the time.
const validate = (form, originalStartTime) => {
  if (!form.movieId) return "Movie is required";
  if (!form.screenId) return "Screen is required";
  if (!form.startTime) return "Start time is required";
  const startTimeChanged = form.startTime !== originalStartTime;
  if (startTimeChanged && new Date(form.startTime).getTime() <= Date.now()) {
    return "Start time must be in the future";
  }
  if (form.price === "" || Number.isNaN(Number(form.price)) || Number(form.price) < 0) {
    return "Price must be a non-negative number";
  }
  if (!FORMATS.includes(form.format)) return "Format must be 2D, 3D, or IMAX";
  return "";
};

const AdminShowtimeFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: movies } = useGetMoviesQuery({});
  const { data: theaters } = useGetTheatersQuery();
  const { data: screens } = useGetAdminScreensQuery();

  const { data: existingShowtime, isLoading: isLoadingShowtime } = useGetAdminShowtimeByIdQuery(
    id,
    { skip: !isEdit }
  );
  const [createShowtime, { isLoading: isCreating }] = useCreateShowtimeMutation();
  const [updateShowtime, { isLoading: isUpdating }] = useUpdateShowtimeMutation();

  const [form, setForm] = useState({
    movieId: "",
    screenId: "",
    startTime: "",
    price: "",
    format: "2D",
    language: "",
    isActive: true,
  });
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);
  const [originalStartTime, setOriginalStartTime] = useState("");

  useEffect(() => {
    if (existingShowtime) {
      const state = toFormState(existingShowtime);
      setForm(state);
      setOriginalStartTime(state.startTime);
    }
  }, [existingShowtime]);

  const handleChange = (field) => (e) => {
    const value = field === "isActive" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const selectedMovie = movies?.find((m) => m._id === form.movieId);

  // The backend also auto-computes endTime from movie duration on create,
  // but update() only recomputes it when explicitly sent — so this is
  // computed and sent on every save, not just create, to keep the two
  // paths consistent (see showtimeService.updateShowtime).
  const computedEndTime = useMemo(() => {
    if (!form.startTime || !selectedMovie) return null;
    const start = new Date(form.startTime);
    if (Number.isNaN(start.getTime())) return null;
    return new Date(start.getTime() + selectedMovie.durationMinutes * 60 * 1000);
  }, [form.startTime, selectedMovie]);

  const screensByTheater = useMemo(() => {
    const groups = new Map();
    for (const screen of screens ?? []) {
      const theaterId = screen.theater;
      if (!groups.has(theaterId)) groups.set(theaterId, []);
      groups.get(theaterId).push(screen);
    }
    return groups;
  }, [screens]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);
    const validationError = validate(form, originalStartTime);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError("");

    const payload = {
      movie: form.movieId,
      screen: form.screenId,
      startTime: new Date(form.startTime).toISOString(),
      endTime: computedEndTime ? computedEndTime.toISOString() : undefined,
      price: Number(form.price),
      format: form.format,
      isActive: form.isActive,
    };
    if (form.language) payload.language = form.language;

    try {
      if (isEdit) {
        await updateShowtime({ id, ...payload }).unwrap();
      } else {
        await createShowtime(payload).unwrap();
      }
      setSuccess(true);
      setTimeout(() => navigate("/admin/showtimes"), 700);
    } catch (err) {
      // Surfaces the backend's real message, including the 409
      // "This screen already has an overlapping showtime in that window"
      // from showtimeService's assertNoOverlap — not a generic fallback.
      setFormError(err?.data?.error?.message || "Could not save showtime");
    }
  };

  if (isEdit && isLoadingShowtime) {
    return <p className="text-gray-500">Loading showtime...</p>;
  }

  const isSaving = isCreating || isUpdating;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">
        {isEdit ? "Edit Showtime" : "Add Showtime"}
      </h1>

      <form onSubmit={handleSubmit} className="flex max-w-lg flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Movie *
          <select
            value={form.movieId}
            onChange={handleChange("movieId")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          >
            <option value="">Select a movie</option>
            {movies?.map((m) => (
              <option key={m._id} value={m._id}>
                {m.title} ({m.durationMinutes} min)
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Screen *
          <select
            value={form.screenId}
            onChange={handleChange("screenId")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          >
            <option value="">Select a screen</option>
            {[...screensByTheater.entries()].map(([theaterId, theaterScreens]) => (
              <optgroup
                key={theaterId}
                label={theaters?.find((t) => t._id === theaterId)?.name ?? theaterId}
              >
                {theaterScreens.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Start time *
          <input
            type="datetime-local"
            value={form.startTime}
            onChange={handleChange("startTime")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <p className="text-xs text-gray-500">
          End time (auto-computed from movie duration):{" "}
          {computedEndTime ? computedEndTime.toLocaleString() : "—"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Price *
            <input
              type="number"
              min="0"
              value={form.price}
              onChange={handleChange("price")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Format *
            <select
              value={form.format}
              onChange={handleChange("format")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Language
          <input
            type="text"
            value={form.language}
            onChange={handleChange("language")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isActive} onChange={handleChange("isActive")} />
          Active
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
            onClick={() => navigate("/admin/showtimes")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminShowtimeFormPage;
