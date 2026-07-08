import { asyncHandler } from "../utils/asyncHandler.js";
import * as analyticsService from "../services/analyticsService.js";

export const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await analyticsService.getAnalytics(req.user);
  res.json({ success: true, data: { analytics }, message: "" });
});
