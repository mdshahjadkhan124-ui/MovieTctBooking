import { apiSlice } from "./apiSlice.js";

export const adminMoviesApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAdminMovies: builder.query({
      query: () => "/admin/movies",
      transformResponse: (response) => response.data.movies,
      providesTags: ["Movie"],
    }),
    getAdminMovieById: builder.query({
      query: (id) => `/admin/movies/${id}`,
      transformResponse: (response) => response.data.movie,
      providesTags: (result, error, id) => [{ type: "Movie", id }],
    }),
    createMovie: builder.mutation({
      query: (body) => ({ url: "/admin/movies", method: "POST", body }),
      transformResponse: (response) => response.data.movie,
      invalidatesTags: ["Movie"],
    }),
    updateMovie: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/admin/movies/${id}`,
        method: "PATCH",
        body,
      }),
      transformResponse: (response) => response.data.movie,
      invalidatesTags: ["Movie"],
    }),
  }),
});

export const {
  useGetAdminMoviesQuery,
  useGetAdminMovieByIdQuery,
  useCreateMovieMutation,
  useUpdateMovieMutation,
} = adminMoviesApi;
