import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

const FORMATS = ["2D", "3D", "IMAX"];

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
