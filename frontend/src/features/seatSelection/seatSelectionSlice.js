import { createSlice } from "@reduxjs/toolkit";

const DEFAULT_MAX_SEATS = 10;

const initialState = {
  selectedSeatIds: [],
  maxSeats: DEFAULT_MAX_SEATS,
};

const seatSelectionSlice = createSlice({
  name: "seatSelection",
  initialState,
  reducers: {
    toggleSeat: (state, action) => {
      const { id, status } = action.payload;
      if (status !== "available") return; // unavailable/booked seats are a no-op

      const index = state.selectedSeatIds.indexOf(id);
      if (index !== -1) {
        state.selectedSeatIds.splice(index, 1);
        return;
      }
      if (state.selectedSeatIds.length >= state.maxSeats) return; // cap reached, no-op
      state.selectedSeatIds.push(id);
    },
    clearSelection: (state) => {
      state.selectedSeatIds = [];
    },
    setMaxSeats: (state, action) => {
      state.maxSeats = action.payload;
    },
  },
});

export const { toggleSeat, clearSelection, setMaxSeats } = seatSelectionSlice.actions;
export default seatSelectionSlice.reducer;
