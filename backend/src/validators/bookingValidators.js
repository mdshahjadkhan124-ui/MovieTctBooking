import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";
import { assertValidSeatIds } from "./showtimeValidators.js";

export const validateCheckoutRequest = (req, res, next) => {
  const { showtimeId, seatIds } = req.body;

  if (!showtimeId || !mongoose.isValidObjectId(showtimeId)) {
    throw new AppError("A valid showtimeId is required", 400, "VALIDATION_ERROR");
  }
  assertValidSeatIds(seatIds);

  next();
};
