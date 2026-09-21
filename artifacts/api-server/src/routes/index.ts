import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import assignmentsRouter from "./assignments";
import learningContentRouter from "./learning-content";
import translationsRouter from "./translations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(assignmentsRouter);
router.use(learningContentRouter);
router.use(translationsRouter);

export default router;
