import { Router } from "express";
import * as showtimeController from "../controllers/showtimeController.js";
import { protect } from "../middleware/auth.js";
import {
  validateRecommendQuery,
  validateLockRequest,
  validateReleaseRequest,
} from "../validators/showtimeValidators.js";

const router = Router();

router.get("/", showtimeController.listPublic);
router.get("/:id", showtimeController.getPublic);
router.get("/:id/recommend", validateRecommendQuery, showtimeController.recommend);
router.get("/:id/locks", showtimeController.lockStatus);
router.post("/:id/lock", protect, validateLockRequest, showtimeController.lock);
router.delete("/:id/lock", protect, validateReleaseRequest, showtimeController.releaseLock);

export default router;
