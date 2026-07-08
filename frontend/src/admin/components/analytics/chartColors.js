// Validated categorical + status palette (see the dataviz skill's
// palette.md) — colors stay in this fixed slot order across charts; a
// chart with a single series just picks one slot rather than cycling
// through all of them.
export const CHART_COLORS = {
  blue: "#2a78d6",
  aqua: "#1baf7a",
  yellow: "#eda100",
  green: "#008300",
  violet: "#4a3aa7",
  red: "#e34948",
  magenta: "#e87ba4",
  orange: "#eb6834",
};

// Reserved for state (confirmed/cancelled), never reused as a generic
// categorical slot.
export const STATUS_COLORS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const CHART_TEXT = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  gridline: "#e1e0d9",
};
