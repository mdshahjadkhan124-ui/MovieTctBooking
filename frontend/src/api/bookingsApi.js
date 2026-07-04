import { apiSlice } from "./apiSlice.js";

export const bookingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    checkout: builder.mutation({
      query: ({ showtimeId, seatIds }) => ({
        url: "/bookings/checkout",
        method: "POST",
        body: { showtimeId, seatIds },
      }),
      transformResponse: (response) => response.data,
    }),
    getBookingById: builder.query({
      query: (id) => `/bookings/${id}`,
      transformResponse: (response) => response.data.booking,
    }),
  }),
});

export const { useCheckoutMutation, useLazyGetBookingByIdQuery } = bookingsApi;
