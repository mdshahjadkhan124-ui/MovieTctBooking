import { asyncHandler } from "../utils/asyncHandler.js";
import * as screenService from "../services/screenService.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";

export const list = asyncHandler(async (req, res) => {
  const { theater } = req.query;
  const { page, limit, skip } = parsePagination(req.query);
  const { screens, total } = await screenService.listScreens(req.user, { theater }, { skip, limit });
  res.json({
    success: true,
    data: { screens, pagination: paginationMeta({ page, limit, total }) },
    message: "",
  });
});

export const getOne = asyncHandler(async (req, res) => {
  const screen = await screenService.getScreenById(req.user, req.params.id);
  res.json({ success: true, data: { screen }, message: "" });
});

export const create = asyncHandler(async (req, res) => {
  const screen = await screenService.createScreen(req.user, req.body);
  res.status(201).json({ success: true, data: { screen }, message: "" });
});

export const update = asyncHandler(async (req, res) => {
  const screen = await screenService.updateScreen(
    req.user,
    req.params.id,
    req.body
  );
  res.json({ success: true, data: { screen }, message: "" });
});

export const remove = asyncHandler(async (req, res) => {
  await screenService.deleteScreen(req.user, req.params.id);
  res.json({ success: true, data: {}, message: "Screen deleted" });
});
