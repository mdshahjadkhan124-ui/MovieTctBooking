import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

export const validateCreateTheater = (req, res, next) => {
  const { name, location, owner } = req.body;

  if (!isNonEmptyString(name)) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  if (!location || !isNonEmptyString(location.city)) {
    throw new AppError("location.city is required", 400, "VALIDATION_ERROR");
  }
  if (owner !== undefined && !mongoose.isValidObjectId(owner)) {
    throw new AppError("owner must be a valid user id", 400, "VALIDATION_ERROR");
  }

  next();
};

export const validateUpdateTheater = (req, res, next) => {
  const { name, location, owner } = req.body;

  if (name !== undefined && !isNonEmptyString(name)) {
    throw new AppError("Name must be a non-empty string", 400, "VALIDATION_ERROR");
  }
  if (location?.city !== undefined && !isNonEmptyString(location.city)) {
    throw new AppError(
      "location.city must be a non-empty string",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (owner !== undefined && !mongoose.isValidObjectId(owner)) {
    throw new AppError("owner must be a valid user id", 400, "VALIDATION_ERROR");
  }

  next();
};
