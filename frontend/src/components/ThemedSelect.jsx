// A plain <select> (real, native, keyboard/screen-reader friendly — not a
// custom listbox) with the OS-default chrome replaced by a themed border,
// focus ring, and chevron. Used everywhere a dropdown appears (navbar city,
// home page filters, waitlist seat count) so they all read as one system.
//
// `tone` picks a complete, self-contained set of border/text/hover/icon
// classes rather than letting a caller pass one-off overrides — two plain
// utility classes for the same property (e.g. text-gray-700 AND
// text-primary) are equal-specificity, so which one wins depends on
// Tailwind's generated rule order, not source order in the class string.
// That's what silently broke `hidden` vs the wrapper's own `inline-block`
// earlier — tone sidesteps the whole class of bug by construction.
const TONES = {
  neutral: {
    border: "border-gray-300",
    text: "text-gray-700",
    hoverBorder: "hover:border-primary/60",
    icon: "text-gray-400",
  },
  primary: {
    border: "border-primary/50",
    text: "text-primary",
    hoverBorder: "hover:border-primary",
    icon: "text-primary",
  },
};

// `className` lands on the OUTER wrapper, not the <select> itself — a
// caller passing responsive visibility (e.g. "hidden md:block" for the
// navbar's city select on mobile) needs the chevron icon to hide along
// with it. The chevron is a sibling <svg>, not a select child, so
// `hidden` on the select alone would leave a lone chevron floating with
// no control under it.
const ThemedSelect = ({ className = "", tone = "neutral", ...props }) => {
  const t = TONES[tone];
  return (
    <div className={`relative inline-block ${className}`}>
      <select
        {...props}
        className={`appearance-none rounded-md border ${t.border} bg-white py-2 pl-3 pr-8 text-sm ${t.text} outline-none transition-colors ${t.hoverBorder} focus:border-primary focus:ring-2 focus:ring-primary/20`}
      />
      <svg
        className={`pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${t.icon}`}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 7.5L10 12.5L15 7.5" />
      </svg>
    </div>
  );
};

export default ThemedSelect;
