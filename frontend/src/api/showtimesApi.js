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
  }),
});

export const { useGetShowtimeByIdQuery, useLockSeatsMutation } = showtimesApi;
