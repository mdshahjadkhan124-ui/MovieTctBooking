import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetAdminTheaterByIdQuery,
  useCreateTheaterMutation,
  useUpdateTheaterMutation,
} from "../../api/adminTheatersApi.js";

const EMPTY_FORM = { name: "", address: "", city: "", owner: "" };

const toFormState = (theater) => ({
  name: theater.name ?? "",
  address: theater.location?.address ?? "",
  city: theater.location?.city ?? "",
  owner: theater.owner ?? "",
});

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

const validate = (form) => {
  if (!form.name.trim()) return "Name is required";
  if (!form.city.trim()) return "City is required";
  if (form.owner && !OBJECT_ID_RE.test(form.owner.trim())) {
    return "Owner must be a valid user id (24-character hex string)";
  }
  return "";
};

const toPayload = (form) => {
  const payload = {
    name: form.name.trim(),
    location: { city: form.city.trim() },
  };
  if (form.address) payload.location.address = form.address.trim();
  if (form.owner) payload.owner = form.owner.trim();
  return payload;
};

const AdminTheaterFormPage = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const { data: existingTheater, isLoading: isLoadingTheater } = useGetAdminTheaterByIdQuery(id, {
    skip: !isEdit,
  });
  const [createTheater, { isLoading: isCreating }] = useCreateTheaterMutation();
  const [updateTheater, { isLoading: isUpdating }] = useUpdateTheaterMutation();

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (existingTheater) setForm(toFormState(existingTheater));
  }, [existingTheater]);

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
        await updateTheater({ id, ...payload }).unwrap();
      } else {
        await createTheater(payload).unwrap();
      }
      setSuccess(true);
      setTimeout(() => navigate("/admin/theaters"), 700);
    } catch (err) {
      setFormError(err?.data?.error?.message || "Could not save theater");
    }
  };

  if (isEdit && isLoadingTheater) {
    return <p className="text-gray-500">Loading theater...</p>;
  }

  const isSaving = isCreating || isUpdating;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">
        {isEdit ? "Edit Theater" : "Add Theater"}
      </h1>

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
          Address
          <input
            type="text"
            value={form.address}
            onChange={handleChange("address")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          City *
          <input
            type="text"
            value={form.city}
            onChange={handleChange("city")}
            className="rounded-md border border-gray-300 px-3 py-2 outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Owner (theater_admin user id)
          <input
            type="text"
            value={form.owner}
            onChange={handleChange("owner")}
            placeholder="Leave blank if unassigned"
            className="rounded-md border border-gray-300 px-3 py-2 font-mono text-xs outline-none focus:border-primary"
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
            onClick={() => navigate("/admin/theaters")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminTheaterFormPage;
