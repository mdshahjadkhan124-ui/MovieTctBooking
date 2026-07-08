import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { STATUS_COLORS, CHART_TEXT } from "./chartColors.js";
import ChartCard from "./ChartCard.jsx";

// Confirmed/cancelled is a state, not an arbitrary category — status colors
// (good/critical), not the categorical palette.
const CancellationDonut = ({ revenue }) => {
  const { confirmedCount, cancelledCount, cancellationRate } = revenue;
  const total = confirmedCount + cancelledCount;
  const data = [
    { name: "Confirmed", value: confirmedCount },
    { name: "Cancelled", value: cancelledCount },
  ];
  const colors = [STATUS_COLORS.good, STATUS_COLORS.critical];

  return (
    <ChartCard title="Cancellation Rate" subtitle="Cancelled vs. confirmed bookings" isEmpty={total === 0}>
      <div className="relative">
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={entry.name} fill={colors[i]} />
              ))}
            </Pie>
            <Tooltip formatter={(value, name) => [value, name]} />
            <Legend
              verticalAlign="bottom"
              height={24}
              formatter={(value) => <span style={{ color: CHART_TEXT.secondary }}>{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingBottom: 24 }}
        >
          <span className="text-2xl font-semibold text-gray-900">
            {Math.round(cancellationRate * 100)}%
          </span>
          <span className="text-xs text-gray-500">cancelled</span>
        </div>
      </div>
    </ChartCard>
  );
};

export default CancellationDonut;
