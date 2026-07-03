import { AppError } from "../utils/AppError.js";

const CERTIFICATIONS = ["U", "UA", "A"];

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isStringArray = (v) =>
  Array.isArray(v) && v.every((item) => typeof item === "string");

const validateCommonFields = (body, { requireCore }) => {
  const { title, durationMinutes, certification, rating, genres, castList, releaseDate } =
    body;

  if (requireCore || title !== undefined) {
    if (!isNonEmptyString(title)) {
      throw new AppError("Title is required", 400, "VALIDATION_ERROR");
    }
  }
  if (requireCore || durationMinutes !== undefined) {
    if (typeof durationMinutes !== "number" || durationMinutes <= 0) {
      throw new AppError(
        "durationMinutes must be a positive number",
        400,
        "VALIDATION_ERROR"
      );
    }
  }
  if (certification !== undefined && !CERTIFICATIONS.includes(certification)) {
    throw new AppError(
      "certification must be one of U, UA, A",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (
    rating !== undefined &&
    (typeof rating !== "number" || rating < 0 || rating > 10)
  ) {
    throw new AppError(
      "rating must be a number between 0 and 10",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (genres !== undefined && !isStringArray(genres)) {
    throw new AppError("genres must be an array of strings", 400, "VALIDATION_ERROR");
  }
  if (castList !== undefined && !isStringArray(castList)) {
    throw new AppError(
      "castList must be an array of strings",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (releaseDate !== undefined && Number.isNaN(new Date(releaseDate).getTime())) {
    throw new AppError("releaseDate must be a valid date", 400, "VALIDATION_ERROR");
  }
};

export const validateCreateMovie = (req, res, next) => {
  validateCommonFields(req.body, { requireCore: true });
  next();
};

export const validateUpdateMovie = (req, res, next) => {
  validateCommonFields(req.body, { requireCore: false });
  next();
};
