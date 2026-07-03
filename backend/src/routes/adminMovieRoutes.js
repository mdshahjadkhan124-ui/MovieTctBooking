import { Router } from "express";
import * as movieController from "../controllers/movieController.js";
import { protect, authorize } from "../middleware/auth.js";
import {
  validateCreateMovie,
  validateUpdateMovie,
} from "../validators/movieValidators.js";

const router = Router();

router.use(protect, authorize("super_admin"));

router.get("/", movieController.listAdmin);
router.get("/:id", movieController.getAdmin);
router.post("/", validateCreateMovie, movieController.create);
router.patch("/:id", validateUpdateMovie, movieController.update);
router.delete("/:id", movieController.remove);

export default router;
