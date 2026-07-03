import { apiSlice } from "./apiSlice.js";

export const moviesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMovies: builder.query({
      query: (params) => ({ url: "/movies", params }),
      transformResponse: (response) => response.data.movies,
      providesTags: ["Movie"],
    }),
  }),
});

export const { useGetMoviesQuery } = moviesApi;
