import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import assignmentsRouter from "./assignments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(assignmentsRouter);

export default router;
