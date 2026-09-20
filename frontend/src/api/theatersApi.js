import { apiSlice } from "./apiSlice.js";

export const theatersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTheaters: builder.query({
      // Small list today; one max-size page keeps this table unchanged
      // while the API itself is paginated.
      query: () => ({ url: "/theaters", params: { limit: 100 } }),
      transformResponse: (response) => response.data.theaters,
      providesTags: ["Theater"],
    }),
  }),
});

export const { useGetTheatersQuery } = theatersApi;
