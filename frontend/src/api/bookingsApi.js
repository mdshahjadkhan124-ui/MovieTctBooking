import { apiSlice } from "./apiSlice.js";
import { mergePagedItems } from "./mergePagedItems.js";

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
    // Paged: a long-standing account can have hundreds of bookings. Pages
    // are merged into one growing list so "Load more" appends rather than
    // replaces, and the cache key ignores `page` for the same reason.
    getMyBookings: builder.query({
      query: ({ page = 1 } = {}) => ({ url: "/bookings/me", params: { page } }),
      transformResponse: (response) => ({
        bookings: response.data.bookings,
        pagination: response.data.pagination,
      }),
      // One cache entry for the whole list regardless of page...
      serializeQueryArgs: ({ endpointName }) => endpointName,
      // ...into which each newly fetched page is merged by id. Page 1
      // replaces outright (a fresh list); later pages append, and a page
      // that arrives twice — which is what a cancellation's refetch does —
      // refreshes those rows instead of duplicating them.
      merge: (cached, incoming, { arg }) => {
        if ((arg?.page ?? 1) === 1) return incoming;
        return {
          bookings: mergePagedItems(cached.bookings, incoming.bookings),
          pagination: incoming.pagination,
        };
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        (currentArg?.page ?? 1) !== (previousArg?.page ?? 1),
      providesTags: ["Booking"],
    }),
    cancelBooking: builder.mutation({
      query: (id) => ({
        url: `/bookings/${id}/cancel`,
        method: "POST",
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ["Booking"],
    }),
  }),
});

export const {
  useCheckoutMutation,
  useLazyGetBookingByIdQuery,
  useGetBookingByIdQuery,
  useGetMyBookingsQuery,
  useCancelBookingMutation,
} = bookingsApi;
