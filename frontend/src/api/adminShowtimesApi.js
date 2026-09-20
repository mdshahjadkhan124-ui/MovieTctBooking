import { apiSlice } from "./apiSlice.js";
import { mergePagedItems } from "./mergePagedItems.js";

export const adminShowtimesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Paged, and merged into one growing list — this table is the longest in
    // the app (every showtime ever scheduled), so it can't be fetched whole.
    getAdminShowtimes: builder.query({
      query: ({ page = 1, ...filters } = {}) => {
        const params = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value))
        );
        return { url: "/admin/showtimes", params: { ...params, page } };
      },
      transformResponse: (response) => ({
        showtimes: response.data.showtimes,
        pagination: response.data.pagination,
      }),
      // One cache entry per filter combination, pages appended into it.
      // Changing a filter starts a fresh list; page 1 always replaces.
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        // Everything except `page` identifies the list; the page number is
        // what gets merged into it.
        const { page: _page, ...filters } = queryArgs ?? {};
        return `${endpointName}(${JSON.stringify(filters)})`;
      },
      // Merged by id, not concatenated: activating/deactivating a showtime
      // invalidates this list, which refetches the page loaded last — those
      // rows must refresh in place rather than appear twice.
      merge: (cached, incoming, { arg }) => {
        if ((arg?.page ?? 1) === 1) return incoming;
        return {
          showtimes: mergePagedItems(cached.showtimes, incoming.showtimes),
          pagination: incoming.pagination,
        };
      },
      forceRefetch: ({ currentArg, previousArg }) =>
        (currentArg?.page ?? 1) !== (previousArg?.page ?? 1),
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
