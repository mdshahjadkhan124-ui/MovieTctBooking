import { Router } from "express";
import express from "express";
import * as webhookController from "../controllers/webhookController.js";

const router = Router();

// express.raw() here (not express.json()) — Stripe signature verification
// needs the exact raw request bytes, not a re-serialized parsed object.
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  webhookController.handleStripeWebhook
);

export default router;
