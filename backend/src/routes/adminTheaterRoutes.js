import { Router } from "express";
import * as theaterController from "../controllers/theaterController.js";
import { protect, authorize } from "../middleware/auth.js";
import {
  validateCreateTheater,
  validateUpdateTheater,
} from "../validators/theaterValidators.js";

const router = Router();

router.use(protect, authorize("super_admin"));

router.get("/", theaterController.listAdmin);
router.get("/:id", theaterController.getAdmin);
router.post("/", validateCreateTheater, theaterController.create);
router.patch("/:id", validateUpdateTheater, theaterController.update);
router.delete("/:id", theaterController.remove);

export default router;
