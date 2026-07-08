import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, CHART_TEXT } from "./chartColors.js";
import ChartCard from "./ChartCard.jsx";

// Horizontal bars — movie titles are long-named categories, and a single
// series (booking count) only needs one hue, not one color per bar.
const TopMoviesChart = ({ topMovies }) => (
  <ChartCard title="Top Movies" subtitle="By confirmed booking count" isEmpty={!topMovies?.length}>
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={topMovies} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} stroke={CHART_TEXT.gridline} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: CHART_TEXT.muted, fontSize: 12 }}
          axisLine={{ stroke: CHART_TEXT.gridline }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="title"
          width={110}
          tick={{ fill: CHART_TEXT.secondary, fontSize: 12 }}
          axisLine={{ stroke: CHART_TEXT.gridline }}
          tickLine={false}
        />
        <Tooltip formatter={(value) => [value, "Bookings"]} />
        <Bar dataKey="bookingCount" name="Bookings" fill={CHART_COLORS.blue} radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  </ChartCard>
);

export default TopMoviesChart;
