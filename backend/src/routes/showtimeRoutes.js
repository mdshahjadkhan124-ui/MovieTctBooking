import { Router } from "express";
import * as showtimeController from "../controllers/showtimeController.js";
import { validateRecommendQuery } from "../validators/showtimeValidators.js";

const router = Router();

router.get("/", showtimeController.listPublic);
router.get("/:id", showtimeController.getPublic);
router.get("/:id/recommend", validateRecommendQuery, showtimeController.recommend);

export default router;
