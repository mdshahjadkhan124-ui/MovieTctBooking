const ITEMS = [
  { label: "Available", className: "border border-gray-300 bg-white" },
  { label: "Selected", className: "border border-primary bg-primary" },
  { label: "Unavailable", className: "border border-gray-200 bg-gray-100" },
  { label: "Booked", className: "border border-gray-200 bg-gray-300" },
];

const Legend = () => (
  <div className="flex flex-wrap items-center justify-center gap-4 border-t border-gray-100 py-4 text-xs text-gray-600">
    {ITEMS.map((item) => (
      <div key={item.label} className="flex items-center gap-1.5">
        <span className={`h-4 w-4 rounded-t-md ${item.className}`} />
        {item.label}
      </div>
    ))}
  </div>
);

export default Legend;
