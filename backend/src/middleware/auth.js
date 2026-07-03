import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/User.js";

export const protect = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    throw new AppError("Not authenticated", 401, "UNAUTHENTICATED");
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired token", 401, "UNAUTHENTICATED");
  }

  const user = await User.findById(payload.id);
  if (!user) {
    throw new AppError("User no longer exists", 401, "UNAUTHENTICATED");
  }

  req.user = user;
  next();
});

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError("Not authorized for this action", 403, "FORBIDDEN");
  }
  next();
};
