import { apiSlice } from "./apiSlice.js";

export const moviesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMovies: builder.query({
      query: (filters = {}) => {
        const params = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value))
        );
        // The API pages at 20 by default. The browse grid is meant to show
        // the whole catalog at once, which fits well inside one max-size
        // page today — revisit with a "Load more" here if it stops fitting.
        return { url: "/movies", params: { ...params, limit: 100 } };
      },
      transformResponse: (response) => response.data.movies,
      providesTags: ["Movie"],
    }),
    getMovieById: builder.query({
      query: (id) => `/movies/${id}`,
      transformResponse: (response) => response.data.movie,
      providesTags: (result, error, id) => [{ type: "Movie", id }],
    }),
  }),
});

export const { useGetMoviesQuery, useGetMovieByIdQuery } = moviesApi;
