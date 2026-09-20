import { apiSlice } from "./apiSlice.js";

export const showtimesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getShowtimeById: builder.query({
      query: (id) => `/showtimes/${id}`,
      transformResponse: (response) => response.data.showtime,
      providesTags: (result, error, id) => [{ type: "Showtime", id }],
    }),
    lockSeats: builder.mutation({
      query: ({ showtimeId, seatIds }) => ({
        url: `/showtimes/${showtimeId}/lock`,
        method: "POST",
        body: { seatIds },
      }),
      transformResponse: (response) => response.data,
    }),
    // Releases only the seats still held under `token` (ownership-guarded
    // server-side), so it's safe to call with a stale token.
    releaseSeatLocks: builder.mutation({
      query: ({ showtimeId, token }) => ({
        url: `/showtimes/${showtimeId}/lock`,
        method: "DELETE",
        body: { token },
      }),
      transformResponse: (response) => response.data.released,
    }),
    getLockedSeats: builder.query({
      query: (showtimeId) => `/showtimes/${showtimeId}/locks`,
      transformResponse: (response) => response.data.lockedSeatIds,
    }),
    getShowtimesByMovie: builder.query({
      // `city` is the navbar's currently-selected city ("" means "All
      // Cities") — omitted entirely rather than sent as "" so it matches
      // the same "no filter" behavior the backend already gives a missing
      // param, instead of relying on it also treating "" as falsy.
      query: ({ movieId, city }) => ({
        url: "/showtimes",
        params: { movie: movieId, ...(city && { city }) },
      }),
      transformResponse: (response) => response.data.showtimes,
      providesTags: (result, error, { movieId }) => [{ type: "Showtime", id: `movie-${movieId}` }],
    }),
    getSeatPricing: builder.query({
      query: (showtimeId) => `/showtimes/${showtimeId}/pricing`,
      transformResponse: (response) => response.data,
    }),
  }),
});

export const {
  useGetShowtimeByIdQuery,
  useLockSeatsMutation,
  useReleaseSeatLocksMutation,
  useGetLockedSeatsQuery,
  useGetShowtimesByMovieQuery,
  useGetSeatPricingQuery,
} = showtimesApi;
