const ChartCard = ({ title, subtitle, isEmpty, emptyMessage = "Not enough data yet.", children }) => (
  <div className="rounded-md border border-gray-200 bg-white p-4">
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
    <div className="mt-3">
      {isEmpty ? (
        <p className="flex h-60 items-center justify-center text-center text-sm text-gray-400">
          {emptyMessage}
        </p>
      ) : (
        children
      )}
    </div>
  </div>
);

export default ChartCard;
