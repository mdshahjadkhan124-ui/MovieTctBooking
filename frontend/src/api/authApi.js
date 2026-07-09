import { apiSlice } from "./apiSlice.js";

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query({
      query: () => "/auth/me",
      transformResponse: (response) => response.data.user,
      providesTags: ["Auth"],
    }),
    login: builder.mutation({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
      transformResponse: (response) => response.data.user,
      invalidatesTags: ["Auth"],
    }),
    signup: builder.mutation({
      query: (details) => ({
        url: "/auth/signup",
        method: "POST",
        body: details,
      }),
      transformResponse: (response) => response.data.user,
    }),
    logout: builder.mutation({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Auth"],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // invalidatesTags only triggers a refetch — a refetch that comes
        // back 401 (expected, now logged out) leaves the OLD cached user
        // in place since RTK Query doesn't clear `data` on a failed query.
        // Resetting the whole cache forces every subscriber (navbar,
        // footer, route guards) to drop stale data immediately.
        try {
          await queryFulfilled;
          dispatch(apiSlice.util.resetApiState());
        } catch {
          // Logout request itself failed — leave the cache as-is.
        }
      },
    }),
  }),
});

export const {
  useGetMeQuery,
  useLoginMutation,
  useSignupMutation,
  useLogoutMutation,
} = authApi;
