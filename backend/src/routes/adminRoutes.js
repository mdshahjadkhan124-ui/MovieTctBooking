import { Router } from "express";
import * as adminController from "../controllers/adminController.js";
import * as analyticsController from "../controllers/analyticsController.js";
import { protect, authorize } from "../middleware/auth.js";
import { validateCreateUser } from "../validators/authValidators.js";

const router = Router();

router.post(
  "/users",
  protect,
  authorize("super_admin"),
  validateCreateUser,
  adminController.createUser
);

router.get(
  "/analytics",
  protect,
  authorize("super_admin", "theater_admin"),
  analyticsController.getAnalytics
);

export default router;
