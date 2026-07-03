import { Router } from "express";
import * as theaterController from "../controllers/theaterController.js";

const router = Router();

router.get("/", theaterController.listPublic);

export default router;
