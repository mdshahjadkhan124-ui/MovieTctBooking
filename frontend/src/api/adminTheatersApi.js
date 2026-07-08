import { apiSlice } from "./apiSlice.js";

export const adminTheatersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminTheaters: builder.query({
      query: () => "/admin/theaters",
      transformResponse: (response) => response.data.theaters,
      providesTags: ["Theater"],
    }),
    getAdminTheaterById: builder.query({
      query: (id) => `/admin/theaters/${id}`,
      transformResponse: (response) => response.data.theater,
      providesTags: (result, error, id) => [{ type: "Theater", id }],
    }),
    createTheater: builder.mutation({
      query: (body) => ({ url: "/admin/theaters", method: "POST", body }),
      transformResponse: (response) => response.data.theater,
      invalidatesTags: ["Theater"],
    }),
    updateTheater: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/admin/theaters/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response) => response.data.theater,
      invalidatesTags: ["Theater"],
    }),
  }),
});

export const {
  useGetAdminTheatersQuery,
  useGetAdminTheaterByIdQuery,
  useCreateTheaterMutation,
  useUpdateTheaterMutation,
} = adminTheatersApi;
