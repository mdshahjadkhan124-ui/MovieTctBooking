import { AppError } from "../utils/AppError.js";

export const validateJoinWaitlist = (req, res, next) => {
  const { seatsRequested } = req.body;
  if (!Number.isInteger(seatsRequested) || seatsRequested <= 0) {
    throw new AppError("seatsRequested must be a positive integer", 400, "VALIDATION_ERROR");
  }

  next();
};
