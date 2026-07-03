import { Router } from "express";
import * as screenController from "../controllers/screenController.js";
import { protect, authorize } from "../middleware/auth.js";
import {
  validateCreateScreen,
  validateUpdateScreen,
} from "../validators/screenValidators.js";

const router = Router();

router.use(protect, authorize("theater_admin", "super_admin"));

router.get("/", screenController.list);
router.get("/:id", screenController.getOne);
router.post("/", validateCreateScreen, screenController.create);
router.patch("/:id", validateUpdateScreen, screenController.update);
router.delete("/:id", screenController.remove);

export default router;
