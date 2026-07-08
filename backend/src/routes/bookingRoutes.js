import { Router } from "express";
import * as bookingController from "../controllers/bookingController.js";
import { protect } from "../middleware/auth.js";
import { validateCheckoutRequest } from "../validators/bookingValidators.js";

const router = Router();

router.post("/checkout", protect, validateCheckoutRequest, bookingController.checkout);
router.get("/me", protect, bookingController.listMine);
router.get("/:id", protect, bookingController.getById);
router.post("/:id/cancel", protect, bookingController.cancel);

export default router;
