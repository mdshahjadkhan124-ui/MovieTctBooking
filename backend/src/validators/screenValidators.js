import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

export const validateCreateScreen = (req, res, next) => {
  const { theater, name, layout } = req.body;

  if (!theater || !mongoose.isValidObjectId(theater)) {
    throw new AppError(
      "A valid theater id is required",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (!isNonEmptyString(name)) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  if (!layout || !isPositiveInt(layout.rows) || !isPositiveInt(layout.columns)) {
    throw new AppError(
      "layout.rows and layout.columns are required positive integers",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (layout.seatCategories !== undefined && !Array.isArray(layout.seatCategories)) {
    throw new AppError(
      "layout.seatCategories must be an array",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (layout.unavailableSeats !== undefined && !Array.isArray(layout.unavailableSeats)) {
    throw new AppError(
      "layout.unavailableSeats must be an array",
      400,
      "VALIDATION_ERROR"
    );
  }

  next();
};

export const validateUpdateScreen = (req, res, next) => {
  const { name, layout } = req.body;

  if (name !== undefined && !isNonEmptyString(name)) {
    throw new AppError("Name must be a non-empty string", 400, "VALIDATION_ERROR");
  }
  if (layout !== undefined) {
    if (layout.rows !== undefined && !isPositiveInt(layout.rows)) {
      throw new AppError(
        "layout.rows must be a positive integer",
        400,
        "VALIDATION_ERROR"
      );
    }
    if (layout.columns !== undefined && !isPositiveInt(layout.columns)) {
      throw new AppError(
        "layout.columns must be a positive integer",
        400,
        "VALIDATION_ERROR"
      );
    }
    if (
      layout.seatCategories !== undefined &&
      !Array.isArray(layout.seatCategories)
    ) {
      throw new AppError(
        "layout.seatCategories must be an array",
        400,
        "VALIDATION_ERROR"
      );
    }
    if (
      layout.unavailableSeats !== undefined &&
      !Array.isArray(layout.unavailableSeats)
    ) {
      throw new AppError(
        "layout.unavailableSeats must be an array",
        400,
        "VALIDATION_ERROR"
      );
    }
  }

  next();
};
