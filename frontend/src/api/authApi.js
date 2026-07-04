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
    }),
  }),
});

export const {
  useGetMeQuery,
  useLoginMutation,
  useSignupMutation,
  useLogoutMutation,
} = authApi;
