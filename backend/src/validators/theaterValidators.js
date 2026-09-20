import { AppError } from "../utils/AppError.js";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

// Which admin manages a theater lives on the User (User.theater), set when a
// super_admin creates the account — a theater has no "owner" field of its
// own, so there's only one place that answers "who can manage this venue".
export const validateCreateTheater = (req, res, next) => {
  const { name, location } = req.body;

  if (!isNonEmptyString(name)) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  if (!location || !isNonEmptyString(location.city)) {
    throw new AppError("location.city is required", 400, "VALIDATION_ERROR");
  }

  next();
};

export const validateUpdateTheater = (req, res, next) => {
  const { name, location } = req.body;

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

  next();
};
