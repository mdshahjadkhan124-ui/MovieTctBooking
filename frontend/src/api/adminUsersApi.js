import { apiSlice } from "./apiSlice.js";

export const adminUsersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTheaterAdmins: builder.query({
      query: () => "/admin/users",
      transformResponse: (response) => response.data.users,
      providesTags: ["AdminUser"],
    }),
    createTheaterAdmin: builder.mutation({
      query: (body) => ({
        url: "/admin/users",
        method: "POST",
        body: { ...body, role: "theater_admin" },
      }),
      transformResponse: (response) => response.data.user,
      invalidatesTags: ["AdminUser"],
    }),
  }),
});

export const { useGetTheaterAdminsQuery, useCreateTheaterAdminMutation } = adminUsersApi;
