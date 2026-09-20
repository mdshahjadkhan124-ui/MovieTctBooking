import { asyncHandler } from "../utils/asyncHandler.js";
import * as authService from "../services/authService.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";

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

export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { admins, total } = await authService.listTheaterAdmins({ skip, limit });
  res.json({
    success: true,
    data: { users: admins, pagination: paginationMeta({ page, limit, total }) },
    message: "",
  });
});
