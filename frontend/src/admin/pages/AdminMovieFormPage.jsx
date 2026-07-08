import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetAdminMovieByIdQuery,
  useCreateMovieMutation,
  useUpdateMovieMutation,
} from "../../api/adminMoviesApi.js";

const CERTIFICATIONS = ["U", "UA", "A"];

const EMPTY_FORM = {
  title: "",
  description: "",
  durationMinutes: "",
  genres: "",
  language: "",
  certification: "",
  releaseDate: "",
  posterUrl: "",
  rating: "",
  castList: "",
};

const toFormState = (movie) => ({
  title: movie.title ?? "",
  description: movie.description ?? "",
  durationMinutes: movie.durationMinutes ?? "",
  genres: (movie.genres ?? []).join(", "),
  language: movie.language ?? "",
  certification: movie.certification ?? "",
  releaseDate: movie.releaseDate ? movie.releaseDate.slice(0, 10) : "",
  posterUrl: movie.posterUrl ?? "",
  rating: movie.rating ?? "",
  castList: (movie.castList ?? []).join(", "),
});

const validate = (form) => {
  if (!form.title.trim()) return "Title is required";
  const duration = Number(form.durationMinutes);
  if (!form.durationMinutes || Number.isNaN(duration) || duration <= 0) {
    return "Duration must be a positive number";
  }
  if (form.certification && !CERTIFICATIONS.includes(form.certification)) {
    return "Certification must be U, UA, or A";
  }
  if (form.rating !== "" && (Number.isNaN(Number(form.rating)) || Number(form.rating) < 0 || Number(form.rating) > 10)) {
    return "Rating must be a number between 0 and 10";
  }
  if (form.releaseDate && Number.isNaN(new Date(form.releaseDate).getTime())) {
    return "Release date must be a valid date";
  }
  return "";
};

const toPayload = (form) => {
  const payload = {
    title: form.title.trim(),
    durationMinutes: Number(form.durationMinutes),
    genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
    castList: form.castList.split(",").map((c) => c.trim()).filter(Boolean),
  };
  if (form.description) payload.description = form.description;
  if (form.language) payload.language = form.language;
  if (form.certification) payload.certification = form.certification;
  if (form.releaseDate) payload.releaseDate = form.releaseDate;
  if (form.posterUrl) payload.posterUrl = form.posterUrl;
  if (form.rating !== "") payload.rating = Number(form.rating);
  return payload;
};

const AdminMovieFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: existingMovie, isLoading: isLoadingMovie } = useGetAdminMovieByIdQuery(id, {
    skip: !isEdit,
  });
  const [createMovie, { isLoading: isCreating }] = useCreateMovieMutation();
  const [updateMovie, { isLoading: isUpdating }] = useUpdateMovieMutation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (existingMovie) setForm(toFormState(existingMovie));
  }, [existingMovie]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

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
      const payload = toPayload(form);
      if (isEdit) {
        await updateMovie({ id, ...payload }).unwrap();
      } else {
        await createMovie(payload).unwrap();
      }
      setSuccess(true);
      setTimeout(() => navigate("/admin/movies"), 700);
    } catch (err) {
      setFormError(err?.data?.error?.message || "Could not save movie");
    }
  };

  if (isEdit && isLoadingMovie) {
    return <p className="text-gray-500">Loading movie...</p>;
  }

  const isSaving = isCreating || isUpdating;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">{isEdit ? "Edit Movie" : "Add Movie"}</h1>

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title *
          <input
            type="text"
            value={form.title}
            onChange={handleChange("title")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Description
          <textarea
            value={form.description}
            onChange={handleChange("description")}
            rows={3}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Duration (minutes) *
            <input
              type="number"
              min="1"
              value={form.durationMinutes}
              onChange={handleChange("durationMinutes")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Language
            <input
              type="text"
              value={form.language}
              onChange={handleChange("language")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Genres (comma-separated)
          <input
            type="text"
            value={form.genres}
            onChange={handleChange("genres")}
            placeholder="Action, Drama"
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Cast (comma-separated)
          <input
            type="text"
            value={form.castList}
            onChange={handleChange("castList")}
            placeholder="Actor One, Actor Two"
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Certification
            <select
              value={form.certification}
              onChange={handleChange("certification")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            >
              <option value="">—</option>
              {CERTIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Rating (0-10)
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={form.rating}
              onChange={handleChange("rating")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Release date
            <input
              type="date"
              value={form.releaseDate}
              onChange={handleChange("releaseDate")}
              className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Poster URL
          <input
            type="text"
            value={form.posterUrl}
            onChange={handleChange("posterUrl")}
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
            onClick={() => navigate("/admin/movies")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminMovieFormPage;
