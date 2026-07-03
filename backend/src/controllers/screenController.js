import { asyncHandler } from "../utils/asyncHandler.js";
import * as screenService from "../services/screenService.js";

export const list = asyncHandler(async (req, res) => {
  const { theater } = req.query;
  const screens = await screenService.listScreens(req.user, { theater });
  res.json({ success: true, data: { screens }, message: "" });
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
