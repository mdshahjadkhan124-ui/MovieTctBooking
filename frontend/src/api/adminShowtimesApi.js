import { apiSlice } from "./apiSlice.js";

export const adminShowtimesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminShowtimes: builder.query({
      query: (filters = {}) => {
        const params = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value))
        );
        return { url: "/admin/showtimes", params };
      },
      transformResponse: (response) => response.data.showtimes,
      providesTags: ["Showtime"],
    }),
    getAdminShowtimeById: builder.query({
      query: (id) => `/admin/showtimes/${id}`,
      transformResponse: (response) => response.data.showtime,
      providesTags: (result, error, id) => [{ type: "Showtime", id }],
    }),
    createShowtime: builder.mutation({
      query: (body) => ({ url: "/admin/showtimes", method: "POST", body }),
      transformResponse: (response) => response.data.showtime,
      invalidatesTags: ["Showtime"],
    }),
    updateShowtime: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/admin/showtimes/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response) => response.data.showtime,
      invalidatesTags: ["Showtime"],
    }),
  }),
});

export const {
  useGetAdminShowtimesQuery,
  useGetAdminShowtimeByIdQuery,
  useCreateShowtimeMutation,
  useUpdateShowtimeMutation,
} = adminShowtimesApi;
