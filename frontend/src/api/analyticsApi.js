import { apiSlice } from "./apiSlice.js";

export const analyticsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAnalytics: builder.query({
      query: () => "/admin/analytics",
      transformResponse: (response) => response.data.analytics,
      providesTags: ["Analytics"],
    }),
  }),
});

export const { useGetAnalyticsQuery } = analyticsApi;
