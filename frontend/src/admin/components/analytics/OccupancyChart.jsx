import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, CHART_TEXT } from "./chartColors.js";
import ChartCard from "./ChartCard.jsx";

const toPercent = (value) => Math.round(value * 100);

const OccupancyChart = ({ occupancy }) => {
  const byTheater = occupancy?.byTheater ?? [];
  const data = byTheater.map((t) => ({ ...t, occupancyPercent: toPercent(t.avgOccupancy) }));

  return (
    <ChartCard
      title="Occupancy Rate"
      subtitle="Avg. booked seats ÷ capacity, per theater"
      isEmpty={!occupancy || occupancy.overall.showtimeCount === 0}
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ right: 16 }}>
          <CartesianGrid vertical={false} stroke={CHART_TEXT.gridline} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_TEXT.secondary, fontSize: 12 }}
            axisLine={{ stroke: CHART_TEXT.gridline }}
            tickLine={false}
          />
          <YAxis
            unit="%"
            domain={[0, 100]}
            tick={{ fill: CHART_TEXT.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip formatter={(value) => [`${value}%`, "Occupancy"]} />
          <Bar
            dataKey="occupancyPercent"
            name="Occupancy"
            fill={CHART_COLORS.green}
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default OccupancyChart;
