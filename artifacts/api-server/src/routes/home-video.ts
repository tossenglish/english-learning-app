import {
  GetHomeVideoSettingsResponse,
  UpdateHomeVideoSettingsBody,
  UpdateHomeVideoSettingsResponse,
} from "@workspace/api-zod";
import { db, homeVideoSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin } from "../lib/auth";

const router: IRouter = Router();
const settingId = 1;

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

function toSettingsResponse(setting?: {
  videoId: string | null;
  objectPath: string | null;
  resourceName: string | null;
} | null) {
  const videoId = setting?.videoId ?? null;
  return {
    videoId,
    youtubeUrl: videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : null,
    objectPath: setting?.objectPath ?? null,
    resourceName: setting?.resourceName ?? null,
  };
}

router.get(
  "/home-video",
  async (req: Request, res: Response): Promise<void> => {
    if (!getUserId(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const [setting] = await db
      .select({
        videoId: homeVideoSettingsTable.videoId,
        objectPath: homeVideoSettingsTable.objectPath,
        resourceName: homeVideoSettingsTable.resourceName,
      })
      .from(homeVideoSettingsTable)
      .where(eq(homeVideoSettingsTable.id, settingId))
      .limit(1);

    res.json(GetHomeVideoSettingsResponse.parse(
      toSettingsResponse(setting ?? null),
    ));
  },
);

router.put(
  "/admin/home-video",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const parsed = UpdateHomeVideoSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { objectPath, resourceName } = parsed.data;
    const validPath =
      objectPath === null ||
      /^\/objects\/uploads\/[A-Za-z0-9-]+$/.test(objectPath);
    const validName =
      resourceName === null ||
      (resourceName.trim().length > 0 && resourceName.length <= 255);
    if (!validPath || !validName || (objectPath === null) !== (resourceName === null)) {
      res.status(400).json({
        error: "업로드된 영상 파일 정보가 올바르지 않습니다.",
      });
      return;
    }

    if (objectPath === null) {
      await db
        .delete(homeVideoSettingsTable)
        .where(eq(homeVideoSettingsTable.id, settingId));
    } else {
      await db
        .insert(homeVideoSettingsTable)
        .values({ id: settingId, videoId: null, objectPath, resourceName })
        .onConflictDoUpdate({
          target: homeVideoSettingsTable.id,
          set: { videoId: null, objectPath, resourceName, updatedAt: new Date() },
        });
    }

    res.json(
      UpdateHomeVideoSettingsResponse.parse({
        videoId: null,
        youtubeUrl: null,
        objectPath,
        resourceName,
      }),
    );
  },
);

export default router;
