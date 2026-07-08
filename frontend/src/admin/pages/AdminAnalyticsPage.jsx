import { useGetMeQuery } from "../../api/authApi.js";
import { useGetAnalyticsQuery } from "../../api/analyticsApi.js";
import StatCard from "../components/analytics/StatCard.jsx";
import TopMoviesChart from "../components/analytics/TopMoviesChart.jsx";
import PeakTimesChart from "../components/analytics/PeakTimesChart.jsx";
import OccupancyChart from "../components/analytics/OccupancyChart.jsx";
import CancellationDonut from "../components/analytics/CancellationDonut.jsx";
import TheaterPerformanceChart from "../components/analytics/TheaterPerformanceChart.jsx";

const formatInr = (amount) => `₹${(amount ?? 0).toLocaleString("en-IN")}`;

const AdminAnalyticsPage = () => {
  const { data: user } = useGetMeQuery();
  const { data: analytics, isLoading, isError } = useGetAnalyticsQuery();

  if (isLoading) {
    return <p className="text-gray-500">Loading analytics...</p>;
  }

  if (isError || !analytics) {
    return <p className="text-red-600">Could not load analytics.</p>;
  }

  const { revenue, topMovies, occupancy, peakBookingTimes, theaterPerformance } = analytics;
  const totalDecidedBookings = revenue.confirmedCount + revenue.cancelledCount;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        {user?.role === "theater_admin" && (
          <p className="text-sm text-gray-500">Showing data for your theater only.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Confirmed revenue" value={formatInr(revenue.confirmedRevenue)} />
        <StatCard label="Refunded" value={formatInr(revenue.totalRefunded)} />
        <StatCard
          label="Cancellation rate"
          value={`${Math.round(revenue.cancellationRate * 100)}%`}
          sublabel={
            totalDecidedBookings > 0
              ? `${revenue.cancelledCount} of ${totalDecidedBookings} bookings`
              : "No bookings yet"
          }
        />
        <StatCard
          label="Avg. occupancy"
          value={`${Math.round(occupancy.overall.avgOccupancy * 100)}%`}
          sublabel={`${occupancy.overall.showtimeCount} showtime${occupancy.overall.showtimeCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopMoviesChart topMovies={topMovies} />
        <PeakTimesChart peakBookingTimes={peakBookingTimes} />
        <OccupancyChart occupancy={occupancy} />
        <CancellationDonut revenue={revenue} />
        <TheaterPerformanceChart theaterPerformance={theaterPerformance} />
      </div>
    </div>
  );
};

export default AdminAnalyticsPage;
