import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimiters.js";
import { validateSignup, validateLogin } from "../validators/authValidators.js";

const router = Router();

// Much tighter than the global API limit — these are the two endpoints an
// attacker would actually use to brute-force a password or mass-create
// accounts, not just generic traffic. logout/me stay under the global
// limit only; there's no credential-guessing surface there.
router.post("/signup", authRateLimiter, validateSignup, authController.signup);
router.post("/login", authRateLimiter, validateLogin, authController.login);
router.post("/logout", authController.logout);
router.get("/me", protect, authController.me);

export default router;
