import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { validateSignup, validateLogin } from "../validators/authValidators.js";

const router = Router();

router.post("/signup", validateSignup, authController.signup);
router.post("/login", validateLogin, authController.login);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

export default router;
