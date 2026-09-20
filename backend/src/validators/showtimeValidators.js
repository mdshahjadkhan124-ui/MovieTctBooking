import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

const FORMATS = ["2D", "3D", "IMAX"];

// Max seats in one lock / checkout / recommendation request. The seat
// selection UI caps at the same number (seatSelectionSlice's
// DEFAULT_MAX_SEATS); this is the server-side enforcement of it.
export const MAX_SEATS_PER_BOOKING = 10;

// Shared by the lock and checkout validators. Duplicates are rejected, not
// just tolerated: a seat listed twice would otherwise be locked once but
// priced (and charged) twice at checkout.
export const assertValidSeatIds = (seatIds) => {
  if (
    !Array.isArray(seatIds) ||
    seatIds.length === 0 ||
    !seatIds.every((id) => typeof id === "string" && id.trim().length > 0)
  ) {
    throw new AppError(
      "seatIds must be a non-empty array of strings",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    throw new AppError(
      `You can book at most ${MAX_SEATS_PER_BOOKING} seats at a time`,
      400,
      "VALIDATION_ERROR"
    );
  }
  if (new Set(seatIds).size !== seatIds.length) {
    throw new AppError("seatIds must not contain duplicates", 400, "VALIDATION_ERROR");
  }
};

const isValidDate = (v) => !Number.isNaN(new Date(v).getTime());

export const validateCreateShowtime = (req, res, next) => {
  const { movie, screen, startTime, endTime, price, format } = req.body;

  if (!movie || !mongoose.isValidObjectId(movie)) {
    throw new AppError("A valid movie id is required", 400, "VALIDATION_ERROR");
  }
  if (!screen || !mongoose.isValidObjectId(screen)) {
    throw new AppError("A valid screen id is required", 400, "VALIDATION_ERROR");
  }
  if (!startTime || !isValidDate(startTime)) {
    throw new AppError("A valid startTime is required", 400, "VALIDATION_ERROR");
  }
  if (endTime !== undefined) {
    if (!isValidDate(endTime)) {
      throw new AppError("endTime must be a valid date", 400, "VALIDATION_ERROR");
    }
    if (new Date(endTime) <= new Date(startTime)) {
      throw new AppError("endTime must be after startTime", 400, "VALIDATION_ERROR");
    }
  }
  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    throw new AppError(
      "price must be a non-negative number",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (format !== undefined && !FORMATS.includes(format)) {
    throw new AppError("format must be one of 2D, 3D, IMAX", 400, "VALIDATION_ERROR");
  }

  next();
};

export const validateRecommendQuery = (req, res, next) => {
  const count = Number(req.query.count);
  if (!Number.isInteger(count) || count <= 0 || count > MAX_SEATS_PER_BOOKING) {
    throw new AppError(
      `count must be an integer from 1 to ${MAX_SEATS_PER_BOOKING}`,
      400,
      "VALIDATION_ERROR"
    );
  }

  next();
};

export const validateLockRequest = (req, res, next) => {
  assertValidSeatIds(req.body.seatIds);
  next();
};

export const validateReleaseRequest = (req, res, next) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") {
    throw new AppError("token is required", 400, "VALIDATION_ERROR");
  }

  next();
};

export const validateUpdateShowtime = (req, res, next) => {
  const { movie, screen, startTime, endTime, price, format } = req.body;

  if (movie !== undefined && !mongoose.isValidObjectId(movie)) {
    throw new AppError("movie must be a valid id", 400, "VALIDATION_ERROR");
  }
  if (screen !== undefined && !mongoose.isValidObjectId(screen)) {
    throw new AppError("screen must be a valid id", 400, "VALIDATION_ERROR");
  }
  if (startTime !== undefined && !isValidDate(startTime)) {
    throw new AppError("startTime must be a valid date", 400, "VALIDATION_ERROR");
  }
  if (endTime !== undefined && !isValidDate(endTime)) {
    throw new AppError("endTime must be a valid date", 400, "VALIDATION_ERROR");
  }
  if (
    startTime !== undefined &&
    endTime !== undefined &&
    new Date(endTime) <= new Date(startTime)
  ) {
    throw new AppError("endTime must be after startTime", 400, "VALIDATION_ERROR");
  }
  if (price !== undefined && (typeof price !== "number" || price < 0)) {
    throw new AppError(
      "price must be a non-negative number",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (format !== undefined && !FORMATS.includes(format)) {
    throw new AppError("format must be one of 2D, 3D, IMAX", 400, "VALIDATION_ERROR");
  }

  next();
};
