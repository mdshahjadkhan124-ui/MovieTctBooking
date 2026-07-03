import { Router } from "express";
import * as showtimeController from "../controllers/showtimeController.js";
import { protect, authorize } from "../middleware/auth.js";
import {
  validateCreateShowtime,
  validateUpdateShowtime,
} from "../validators/showtimeValidators.js";

const router = Router();

router.use(protect, authorize("theater_admin", "super_admin"));

router.get("/", showtimeController.listAdmin);
router.get("/:id", showtimeController.getAdmin);
router.post("/", validateCreateShowtime, showtimeController.create);
router.patch("/:id", validateUpdateShowtime, showtimeController.update);
router.delete("/:id", showtimeController.remove);

export default router;
