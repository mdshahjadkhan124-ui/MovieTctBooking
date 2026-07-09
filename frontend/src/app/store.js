import { configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { apiSlice } from "../api/apiSlice.js";
import seatSelectionReducer from "../features/seatSelection/seatSelectionSlice.js";
import cityReducer from "../features/city/citySlice.js";

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    seatSelection: seatSelectionReducer,
    city: cityReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware),
});

// Enables refetchOnFocus/refetchOnReconnect query options below.
setupListeners(store.dispatch);
