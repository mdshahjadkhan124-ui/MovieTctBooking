import { asyncHandler } from "../utils/asyncHandler.js";
import { stripe } from "../config/stripe.js";
import { AppError } from "../utils/AppError.js";
import * as bookingService from "../services/bookingService.js";

export const handleStripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["stripe-signature"];

  let event;
  try {
    // req.body must be the raw, unparsed buffer here — see the express.raw()
    // middleware on this route in routes/webhookRoutes.js. If express.json()
    // ran first, this would be a parsed object and signature verification
    // would always fail.
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    throw new AppError(
      `Webhook signature verification failed: ${err.message}`,
      400,
      "INVALID_SIGNATURE"
    );
  }

  await bookingService.handleStripeWebhookEvent(event);

  res.json({ success: true, data: {}, message: "" });
});
