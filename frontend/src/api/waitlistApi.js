import { apiSlice } from "./apiSlice.js";

export const waitlistApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    joinWaitlist: builder.mutation({
      query: ({ showtimeId, seatsRequested }) => ({
        url: `/showtimes/${showtimeId}/waitlist`,
        method: "POST",
        body: { seatsRequested },
      }),
      transformResponse: (response) => response.data.entry,
      invalidatesTags: (result, error, { showtimeId }) => [{ type: "Waitlist", id: showtimeId }],
    }),
    leaveWaitlist: builder.mutation({
      query: (showtimeId) => ({
        url: `/showtimes/${showtimeId}/waitlist`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, showtimeId) => [{ type: "Waitlist", id: showtimeId }],
    }),
    getMyWaitlistStatus: builder.query({
      query: (showtimeId) => `/showtimes/${showtimeId}/waitlist/me`,
      transformResponse: (response) => response.data.status,
      providesTags: (result, error, showtimeId) => [{ type: "Waitlist", id: showtimeId }],
    }),
  }),
});

export const {
  useJoinWaitlistMutation,
  useLeaveWaitlistMutation,
  useGetMyWaitlistStatusQuery,
} = waitlistApi;
