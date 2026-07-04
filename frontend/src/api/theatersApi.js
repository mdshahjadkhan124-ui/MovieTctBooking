import { apiSlice } from "./apiSlice.js";

export const theatersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTheaters: builder.query({
      query: () => "/theaters",
      transformResponse: (response) => response.data.theaters,
      providesTags: ["Theater"],
    }),
  }),
});

export const { useGetTheatersQuery } = theatersApi;
