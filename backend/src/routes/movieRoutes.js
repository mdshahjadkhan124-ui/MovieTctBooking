import { Router } from "express";
import * as movieController from "../controllers/movieController.js";

const router = Router();

router.get("/", movieController.listPublic);
router.get("/:id", movieController.getPublic);

export default router;
