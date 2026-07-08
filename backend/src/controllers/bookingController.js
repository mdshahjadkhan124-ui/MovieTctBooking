import { asyncHandler } from "../utils/asyncHandler.js";
import * as bookingService from "../services/bookingService.js";

export const checkout = asyncHandler(async (req, res) => {
  const { showtimeId, seatIds } = req.body;
  const result = await bookingService.createCheckout(
    req.user._id.toString(),
    showtimeId,
    seatIds
  );
  res.status(201).json({ success: true, data: result, message: "" });
});

export const listMine = asyncHandler(async (req, res) => {
  const bookings = await bookingService.listUserBookings(req.user._id.toString());
  res.json({ success: true, data: { bookings }, message: "" });
});

export const getById = asyncHandler(async (req, res) => {
  const booking = await bookingService.getBookingById(
    req.user._id.toString(),
    req.params.id
  );
  res.json({ success: true, data: { booking }, message: "" });
});

export const cancel = asyncHandler(async (req, res) => {
  const result = await bookingService.cancelBooking(
    req.user._id.toString(),
    req.params.id
  );
  res.json({ success: true, data: result, message: "" });
});
