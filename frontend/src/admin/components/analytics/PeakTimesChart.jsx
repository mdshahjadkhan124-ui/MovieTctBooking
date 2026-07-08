import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS, CHART_TEXT } from "./chartColors.js";
import ChartCard from "./ChartCard.jsx";

const formatHour = (hour) => `${hour}:00`;

const PeakTimesChart = ({ peakBookingTimes }) => {
  const hasData = peakBookingTimes?.some((h) => h.count > 0);

  return (
    <ChartCard
      title="Peak Booking Times"
      subtitle="Confirmed bookings by hour of day (UTC)"
      isEmpty={!hasData}
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={peakBookingTimes} margin={{ left: -16, right: 16 }}>
          <CartesianGrid vertical={false} stroke={CHART_TEXT.gridline} />
          <XAxis
            dataKey="hour"
            tickFormatter={formatHour}
            interval={3}
            tick={{ fill: CHART_TEXT.muted, fontSize: 11 }}
            axisLine={{ stroke: CHART_TEXT.gridline }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: CHART_TEXT.muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip labelFormatter={formatHour} formatter={(value) => [value, "Bookings"]} />
          <Line
            type="monotone"
            dataKey="count"
            name="Bookings"
            stroke={CHART_COLORS.blue}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.blue }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

export default PeakTimesChart;
