import { Booking } from "../models/Booking.js";
import { Showtime } from "../models/Showtime.js";

const TOP_MOVIES_LIMIT = 5;

// super_admin sees everything; a theater_admin is scoped to their own
// theater at the QUERY level (folded into every pipeline's own $match/
// $lookup below), never filtered after the fact in JS — so there's no path
// where a theater_admin's response payload ever contains another theater's
// documents to begin with.
const theaterScopeFor = (user) => (user.role === "theater_admin" ? user.theater : null);

const revenuePipeline = (theaterId) => [
  { $match: { ...(theaterId && { theater: theaterId }) } },
  {
    $group: {
      _id: null,
      confirmedRevenue: { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, "$amount", 0] } },
      confirmedCount: { $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] } },
      cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
      totalRefunded: {
        $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, { $ifNull: ["$refundAmount", 0] }, 0] },
      },
    },
  },
];

// Booking has no direct movie reference (only showtime) — one $lookup hop
// to showtimes gets the movie id, grouped/sorted/limited BEFORE the second
// $lookup to movies resolves titles, so that join only ever runs against
// the top N ids, not the whole booking collection.
const topMoviesPipeline = (theaterId) => [
  { $match: { status: "confirmed", ...(theaterId && { theater: theaterId }) } },
  { $lookup: { from: "showtimes", localField: "showtime", foreignField: "_id", as: "showtime" } },
  { $unwind: "$showtime" },
  { $group: { _id: "$showtime.movie", bookingCount: { $sum: 1 }, revenue: { $sum: "$amount" } } },
  { $sort: { bookingCount: -1, revenue: -1 } },
  { $limit: TOP_MOVIES_LIMIT },
  { $lookup: { from: "movies", localField: "_id", foreignField: "_id", as: "movie" } },
  { $unwind: "$movie" },
  { $project: { _id: 0, movieId: "$_id", title: "$movie.title", bookingCount: 1, revenue: 1 } },
];

// Hour-of-day a booking was MADE (not the showtime's start time) — the
// business question is "when do customers book," not "which slots are
// popular" (that's occupancy/theaterPerformance's job instead).
const peakBookingTimesPipeline = (theaterId) => [
  { $match: { status: "confirmed", ...(theaterId && { theater: theaterId }) } },
  { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
  { $project: { _id: 0, hour: "$_id", count: 1 } },
];

// Zero-fills every hour with no bookings — a gap in the data is not the
// same as a real zero for a 24-bar chart, and leaving hours out would
// silently compress the x-axis instead of showing a flat trough.
const fillHourGaps = (hourlyResults) => {
  const countByHour = new Map(hourlyResults.map((r) => [r.hour, r.count]));
  return Array.from({ length: 24 }, (_, hour) => ({ hour, count: countByHour.get(hour) ?? 0 }));
};

const theaterPerformancePipeline = (theaterId) => [
  { $match: { status: "confirmed", ...(theaterId && { theater: theaterId }) } },
  { $group: { _id: "$theater", revenue: { $sum: "$amount" }, bookingCount: { $sum: 1 } } },
  { $lookup: { from: "theaters", localField: "_id", foreignField: "_id", as: "theater" } },
  { $unwind: "$theater" },
  { $project: { _id: 0, theaterId: "$_id", name: "$theater.name", revenue: 1, bookingCount: 1 } },
  { $sort: { revenue: -1 } },
];

/**
 * Occupancy = confirmed booked seats ÷ a showtime's real seat capacity
 * (rows*columns minus the layout's own permanently-unavailable seats — the
 * same capacity definition buildSeatGrid uses everywhere else), averaged
 * across showtimes. Runs off Showtime (not Booking) so a showtime with zero
 * bookings correctly counts as 0% rather than being absent from the
 * average entirely. $facet computes the overall average and the per-theater
 * breakdown in one pass, so the (relatively expensive) $lookup stages above
 * it only ever run once.
 */
const getOccupancy = async (theaterId) => {
  const [result] = await Showtime.aggregate([
    { $match: { ...(theaterId && { theater: theaterId }) } },
    { $lookup: { from: "screens", localField: "screen", foreignField: "_id", as: "screen" } },
    { $unwind: "$screen" },
    {
      $addFields: {
        totalSeats: {
          $subtract: [
            { $multiply: ["$screen.layout.rows", "$screen.layout.columns"] },
            { $size: { $ifNull: ["$screen.layout.unavailableSeats", []] } },
          ],
        },
      },
    },
    {
      $lookup: {
        from: "bookings",
        let: { showtimeId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ["$showtime", "$$showtimeId"] }, { $eq: ["$status", "confirmed"] }] },
            },
          },
          { $project: { seatCount: { $size: "$seatIds" } } },
        ],
        as: "confirmedBookings",
      },
    },
    { $addFields: { bookedSeats: { $sum: "$confirmedBookings.seatCount" } } },
    {
      $addFields: {
        occupancyRate: {
          $cond: [{ $lte: ["$totalSeats", 0] }, 0, { $divide: ["$bookedSeats", "$totalSeats"] }],
        },
      },
    },
    {
      $facet: {
        overall: [
          { $group: { _id: null, avgOccupancy: { $avg: "$occupancyRate" }, showtimeCount: { $sum: 1 } } },
        ],
        byTheater: [
          { $group: { _id: "$theater", avgOccupancy: { $avg: "$occupancyRate" }, showtimeCount: { $sum: 1 } } },
          { $lookup: { from: "theaters", localField: "_id", foreignField: "_id", as: "theater" } },
          { $unwind: "$theater" },
          {
            $project: {
              _id: 0,
              theaterId: "$_id",
              name: "$theater.name",
              avgOccupancy: 1,
              showtimeCount: 1,
            },
          },
          { $sort: { avgOccupancy: -1 } },
        ],
      },
    },
  ]);

  const overall = result.overall[0] ?? { avgOccupancy: 0, showtimeCount: 0 };
  return {
    overall: { avgOccupancy: overall.avgOccupancy, showtimeCount: overall.showtimeCount },
    byTheater: result.byTheater,
  };
};

export const getAnalytics = async (user) => {
  const theaterId = theaterScopeFor(user);

  const [revenueResult, topMovies, occupancy, peakHourly, theaterPerformance] = await Promise.all([
    Booking.aggregate(revenuePipeline(theaterId)),
    Booking.aggregate(topMoviesPipeline(theaterId)),
    getOccupancy(theaterId),
    Booking.aggregate(peakBookingTimesPipeline(theaterId)),
    Booking.aggregate(theaterPerformancePipeline(theaterId)),
  ]);

  const revenue = revenueResult[0] ?? {
    confirmedRevenue: 0,
    confirmedCount: 0,
    cancelledCount: 0,
    totalRefunded: 0,
  };
  const totalDecidedBookings = revenue.confirmedCount + revenue.cancelledCount;
  const cancellationRate =
    totalDecidedBookings > 0 ? revenue.cancelledCount / totalDecidedBookings : 0;

  return {
    revenue: {
      confirmedRevenue: revenue.confirmedRevenue,
      totalRefunded: revenue.totalRefunded,
      confirmedCount: revenue.confirmedCount,
      cancelledCount: revenue.cancelledCount,
      cancellationRate,
    },
    topMovies,
    occupancy,
    peakBookingTimes: fillHourGaps(peakHourly),
    theaterPerformance,
  };
};
