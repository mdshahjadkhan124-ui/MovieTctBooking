import { apiSlice } from "./apiSlice.js";

export const moviesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMovies: builder.query({
      query: (filters = {}) => {
        const params = Object.fromEntries(
          Object.entries(filters).filter(([, value]) => Boolean(value))
        );
        return { url: "/movies", params };
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
