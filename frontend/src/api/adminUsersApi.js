import { apiSlice } from "./apiSlice.js";

export const adminUsersApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getTheaterAdmins: builder.query({
      // Small list today; one max-size page keeps this table unchanged
      // while the API itself is paginated.
      query: () => ({ url: "/admin/users", params: { limit: 100 } }),
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
