import { apiSlice } from "./apiSlice.js";

export const adminScreensApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminScreens: builder.query({
      query: (theaterId) => ({
        url: "/admin/screens",
        params: theaterId ? { theater: theaterId } : {},
      }),
      transformResponse: (response) => response.data.screens,
      providesTags: ["Screen"],
    }),
    getAdminScreenById: builder.query({
      query: (id) => `/admin/screens/${id}`,
      transformResponse: (response) => response.data.screen,
      providesTags: (result, error, id) => [{ type: "Screen", id }],
    }),
    createScreen: builder.mutation({
      query: (body) => ({ url: "/admin/screens", method: "POST", body }),
      transformResponse: (response) => response.data.screen,
      invalidatesTags: ["Screen"],
    }),
    updateScreen: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/admin/screens/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response) => response.data.screen,
      invalidatesTags: ["Screen"],
    }),
  }),
});

export const {
  useGetAdminScreensQuery,
  useGetAdminScreenByIdQuery,
  useCreateScreenMutation,
  useUpdateScreenMutation,
} = adminScreensApi;
