import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { adminIdentityMiddleware } from "./lib/auth";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const app: Express = express();

pool.on("error", (error) => {
  logger.error({
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    code: "code" in error && typeof error.code === "string" ? error.code : undefined,
  }, "PostgreSQL connection pool error");
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(
  cors({
    credentials: true,
    origin: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api/admin", adminIdentityMiddleware);
app.use("/api/storage/uploads/request-url", adminIdentityMiddleware);
app.use("/api", router);

const requestErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const details = err && typeof err === "object" ? err as Record<string, unknown> : {};
  const statusValue = details.status ?? details.statusCode;
  const statusCode = typeof statusValue === "number" && statusValue >= 400 && statusValue <= 599
    ? statusValue
    : 500;

  req.log.error({
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
    code: typeof details.code === "string" ? details.code : undefined,
    databaseTable: typeof details.table === "string" ? details.table : undefined,
    databaseColumn: typeof details.column === "string" ? details.column : undefined,
    method: req.method,
    path: req.path,
  }, "Unhandled API request error");

  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : error.message,
    requestId: req.id,
  });
};

app.use(requestErrorHandler);

// 프론트엔드 빌드 결과물(artifacts/english-learning/dist/public)의 실제 절대 경로 계산
const clientBuildPath = path.resolve(
  import.meta.dirname,
  "../../../artifacts/english-learning/dist/public"
);

app.use(express.static(clientBuildPath));

// SPA 라우팅: API가 아닌 요청은 모두 index.html 응답
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  const indexPath = path.join(clientBuildPath, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  next();
});

export default app;