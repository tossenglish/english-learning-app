import {
  BulkUpsertLearningContentBody,
  BulkUpsertLearningContentResponse,
  GetLearningContentQueryParams,
  GetLearningContentResponse,
  ListAdminLearningContentResponse,
  UpsertLearningContentBody,
  UpsertLearningContentParams,
  UpsertLearningContentResponse,
} from "@workspace/api-zod";
import { learningContentTable, db } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin } from "../lib/auth";

const router: IRouter = Router();

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.put(
  "/admin/learning-content",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const parsed = BulkUpsertLearningContentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const levels = new Set<string>();
    for (const item of parsed.data.items) {
      if (levels.has(item.level)) {
        res.status(400).json({ error: `중복된 레벨이 있습니다: ${item.level}` });
        return;
      }
      levels.add(item.level);

      if (!item.content.quizOptions.includes(item.content.correctMeaning)) {
        res.status(400).json({ error: `${item.level}의 퀴즈 보기에 정답이 포함되어야 합니다.` });
        return;
      }
    }

    const savedContent = await db.transaction(async (tx) => {
      const saved = [];
      for (const item of parsed.data.items) {
        const [content] = await tx
          .insert(learningContentTable)
          .values({
            level: item.level,
            ...item.content,
          })
          .onConflictDoUpdate({
            target: learningContentTable.level,
            set: {
              ...item.content,
              updatedAt: new Date(),
            },
          })
          .returning();
        saved.push(content);
      }
      return saved;
    });

    res.json(BulkUpsertLearningContentResponse.parse(savedContent));
  },
);

router.get(
  "/learning-content",
  async (req: Request, res: Response): Promise<void> => {
    if (!getUserId(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const query = GetLearningContentQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const [content] = await db
      .select()
      .from(learningContentTable)
      .where(eq(learningContentTable.level, query.data.level))
      .limit(1);

    if (!content) {
      res.status(404).json({ error: "Learning content not found" });
      return;
    }

    res.json(GetLearningContentResponse.parse(content));
  },
);

router.get(
  "/admin/learning-content",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const content = await db
      .select()
      .from(learningContentTable)
      .orderBy(desc(learningContentTable.updatedAt));

    res.json(ListAdminLearningContentResponse.parse(content));
  },
);

router.put(
  "/admin/learning-content/:level",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = UpsertLearningContentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpsertLearningContentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [existing] = await db
      .select({ id: learningContentTable.id })
      .from(learningContentTable)
      .where(eq(learningContentTable.level, params.data.level))
      .limit(1);

    const [content] = existing
      ? await db
          .update(learningContentTable)
          .set(parsed.data)
          .where(eq(learningContentTable.id, existing.id))
          .returning()
      : await db
          .insert(learningContentTable)
          .values({
            level: params.data.level,
            ...parsed.data,
          })
          .returning();

    res.json(UpsertLearningContentResponse.parse(content));
  },
);

export default router;