import { asyncHandler } from "../utils/asyncHandler.js";
import * as waitlistService from "../services/waitlistService.js";

export const join = asyncHandler(async (req, res) => {
  const entry = await waitlistService.joinWaitlist(
    req.user._id.toString(),
    req.params.id,
    req.body.seatsRequested
  );
  res.status(201).json({ success: true, data: { entry }, message: "" });
});

export const leave = asyncHandler(async (req, res) => {
  await waitlistService.leaveWaitlist(req.user._id.toString(), req.params.id);
  res.json({ success: true, data: {}, message: "" });
});

export const myStatus = asyncHandler(async (req, res) => {
  const status = await waitlistService.getMyWaitlistStatus(
    req.user._id.toString(),
    req.params.id
  );
  res.json({ success: true, data: { status }, message: "" });
});
