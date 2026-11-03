import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storageRouter from "./storage";
import assignmentsRouter from "./assignments";
import learningContentRouter from "./learning-content";
import homeVideoRouter from "./home-video";
import translationsRouter from "./translations";
import readingComprehensionRouter from "./reading-comprehension";
import attendanceRouter from "./attendance";
import wordsRouter from "./words";
import wordsRouter from "./words";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(assignmentsRouter);
router.use(learningContentRouter);
router.use(homeVideoRouter);
router.use(translationsRouter);
router.use(readingComprehensionRouter);
router.use(attendanceRouter);
router.use(wordsRouter);
router.use(wordsRouter);

export default router;
