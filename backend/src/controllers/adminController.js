import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";

export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, theater } = req.body;
  const user = await authService.createElevatedUser({
    name,
    email,
    password,
    role,
    theater,
  });
  res.status(201).json({ success: true, data: { user }, message: "" });
});
