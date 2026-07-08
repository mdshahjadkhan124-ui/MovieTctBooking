const StatCard = ({ label, value, sublabel }) => (
  <div className="rounded-md border border-gray-200 bg-white p-4">
    <p className="text-xs font-medium text-gray-500">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    {sublabel && <p className="mt-0.5 text-xs text-gray-500">{sublabel}</p>}
  </div>
);

export default StatCard;
