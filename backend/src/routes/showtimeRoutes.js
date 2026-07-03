import { Router } from "express";
import * as showtimeController from "../controllers/showtimeController.js";

const router = Router();

router.get("/", showtimeController.listPublic);
router.get("/:id", showtimeController.getPublic);

export default router;
