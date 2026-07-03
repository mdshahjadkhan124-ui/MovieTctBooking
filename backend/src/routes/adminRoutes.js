import { Router } from "express";
import * as adminController from "../controllers/adminController.js";
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

export default router;
