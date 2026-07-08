import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, CHART_TEXT } from "./chartColors.js";
import ChartCard from "./ChartCard.jsx";

const TheaterPerformanceChart = ({ theaterPerformance }) => (
  <ChartCard
    title="Theater Performance"
    subtitle="Confirmed revenue by theater"
    isEmpty={!theaterPerformance?.length}
  >
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={theaterPerformance} margin={{ right: 16 }}>
        <CartesianGrid vertical={false} stroke={CHART_TEXT.gridline} />
        <XAxis
          dataKey="name"
          tick={{ fill: CHART_TEXT.secondary, fontSize: 12 }}
          axisLine={{ stroke: CHART_TEXT.gridline }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: CHART_TEXT.muted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `₹${v}`}
        />
        <Tooltip formatter={(value) => [`₹${value}`, "Revenue"]} />
        <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.aqua} radius={[4, 4, 0, 0]} barSize={24} />
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
);

export default TheaterPerformanceChart;
