import { AppError } from "../utils/AppError.js";

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const validateSignup = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw new AppError("A valid email is required", 400, "VALIDATION_ERROR");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new AppError(
      "Password must be at least 8 characters",
      400,
      "VALIDATION_ERROR"
    );
  }

  next();
};

export const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !EMAIL_RE.test(email)) {
    throw new AppError("A valid email is required", 400, "VALIDATION_ERROR");
  }
  if (!password) {
    throw new AppError("Password is required", 400, "VALIDATION_ERROR");
  }

  next();
};

export const validateCreateUser = (req, res, next) => {
  const { name, email, password, role } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    throw new AppError("Name is required", 400, "VALIDATION_ERROR");
  }
  if (!email || !EMAIL_RE.test(email)) {
    throw new AppError("A valid email is required", 400, "VALIDATION_ERROR");
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new AppError(
      "Password must be at least 8 characters",
      400,
      "VALIDATION_ERROR"
    );
  }
  if (role && !["theater_admin", "super_admin"].includes(role)) {
    throw new AppError("Invalid role", 400, "VALIDATION_ERROR");
  }

  next();
};
