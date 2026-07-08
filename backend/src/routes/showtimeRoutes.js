import { Router } from "express";
import * as showtimeController from "../controllers/showtimeController.js";
import * as waitlistController from "../controllers/waitlistController.js";
import { protect } from "../middleware/auth.js";
import {
  validateRecommendQuery,
  validateLockRequest,
  validateReleaseRequest,
} from "../validators/showtimeValidators.js";
import { validateJoinWaitlist } from "../validators/waitlistValidators.js";

const router = Router();

router.get("/", showtimeController.listPublic);
router.get("/:id", showtimeController.getPublic);
router.get("/:id/recommend", validateRecommendQuery, showtimeController.recommend);
router.get("/:id/pricing", showtimeController.pricing);
router.get("/:id/locks", showtimeController.lockStatus);
router.post("/:id/lock", protect, validateLockRequest, showtimeController.lock);
router.delete("/:id/lock", protect, validateReleaseRequest, showtimeController.releaseLock);
router.post("/:id/waitlist", protect, validateJoinWaitlist, waitlistController.join);
router.delete("/:id/waitlist", protect, waitlistController.leave);
router.get("/:id/waitlist/me", protect, waitlistController.myStatus);

export default router;
