import { createSlice } from "@reduxjs/toolkit";

// "" means "All Cities" — the honest default: no theater data has been
// hardcoded/guessed as the user's city, so nothing is filtered out until
// they actually pick one from the navbar.
const initialState = {
  selectedCity: "",
};

const citySlice = createSlice({
  name: "city",
  initialState,
  reducers: {
    setCity: (state, action) => {
      state.selectedCity = action.payload;
    },
  },
});

export const { setCity } = citySlice.actions;
export default citySlice.reducer;
