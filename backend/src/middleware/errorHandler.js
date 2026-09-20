import { AppError } from "../utils/AppError.js";

// A unique-index violation (Mongo error 11000) says which field(s) collided
// in keyValue, e.g. { email: "a@b.com" }. Only the field NAMES are used —
// never the values — so the message can't echo user input back.
const duplicateKeyMessage = (err) => {
  const fields = Object.keys(err.keyValue ?? err.keyPattern ?? {});
  if (fields.length === 1 && fields[0] === "email") return "Email already in use";
  if (fields.length > 0) return `A record with this ${fields.join(" + ")} already exists`;
  return "Duplicate value";
};

export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message },
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: { code: "DUPLICATE", message: duplicateKeyMessage(err) },
    });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: err.message },
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: `Invalid ${err.path}: ${err.value}` },
    });
  }

  console.error(err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
};

export const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: `Route ${req.originalUrl} not found` },
  });
};
