import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL,
    credentials: "include",
    // Required by the API's CSRF guard on every state-changing request
    // (backend/src/middleware/csrf.js). A cross-site form post — the classic
    // CSRF vector — cannot set a custom header, and any cross-site fetch that
    // tries must first pass a CORS preflight that only our own origin gets.
    prepareHeaders: (headers) => {
      headers.set("X-Requested-With", "XMLHttpRequest");
      return headers;
    },
  }),
  tagTypes: [
    "Movie",
    "Showtime",
    "Auth",
    "Booking",
    "Theater",
    "Screen",
    "Waitlist",
    "Analytics",
    "AdminUser",
  ],
  endpoints: () => ({}),
});
