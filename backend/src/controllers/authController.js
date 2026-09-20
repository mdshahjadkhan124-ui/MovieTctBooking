import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken, cookieOptions } from "../utils/generateToken.js";
import * as authService from "../services/authService.js";
import { revokeToken } from "../services/tokenDenylist.js";

export const signup = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const user = await authService.signup({ name, email, password });
  res.status(201).json({ success: true, data: { user }, message: "" });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, userId } = await authService.login({ email, password });

  const token = generateToken(userId);
  res.cookie("token", token, cookieOptions());

  res.json({ success: true, data: { user }, message: "" });
});

export const logout = asyncHandler(async (req, res) => {
  // Clearing the cookie only disarms this browser; revoking the token is
  // what stops a copy of it being replayed from anywhere else.
  await revokeToken(req.cookies?.token);
  res.clearCookie("token", cookieOptions());
  res.json({ success: true, data: {}, message: "Logged out" });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: authService.toSafeUser(req.user) }, message: "" });
});
