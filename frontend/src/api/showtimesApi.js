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
    getLockedSeats: builder.query({
      query: (showtimeId) => `/showtimes/${showtimeId}/locks`,
      transformResponse: (response) => response.data.lockedSeatIds,
    }),
    getShowtimesByMovie: builder.query({
      query: (movieId) => ({ url: "/showtimes", params: { movie: movieId } }),
      transformResponse: (response) => response.data.showtimes,
      providesTags: (result, error, movieId) => [{ type: "Showtime", id: `movie-${movieId}` }],
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
  useGetLockedSeatsQuery,
  useGetShowtimesByMovieQuery,
  useGetSeatPricingQuery,
} = showtimesApi;
