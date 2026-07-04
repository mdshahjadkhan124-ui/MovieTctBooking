import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

export const validateCheckoutRequest = (req, res, next) => {
  const { showtimeId, seatIds } = req.body;

  if (!showtimeId || !mongoose.isValidObjectId(showtimeId)) {
    throw new AppError("A valid showtimeId is required", 400, "VALIDATION_ERROR");
  }
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

  next();
};
