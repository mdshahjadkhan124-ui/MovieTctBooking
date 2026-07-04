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
      invalidatesTags: ["Booking"],
    }),
    getBookingById: builder.query({
      query: (id) => `/bookings/${id}`,
      transformResponse: (response) => response.data.booking,
      providesTags: (result, error, id) => [{ type: "Booking", id }],
    }),
    getMyBookings: builder.query({
      query: () => "/bookings/me",
      transformResponse: (response) => response.data.bookings,
      providesTags: ["Booking"],
    }),
  }),
});

export const {
  useCheckoutMutation,
  useLazyGetBookingByIdQuery,
  useGetBookingByIdQuery,
  useGetMyBookingsQuery,
} = bookingsApi;
