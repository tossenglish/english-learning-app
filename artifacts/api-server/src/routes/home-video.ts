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

function getYoutubeVideoId(value: string): string | null | undefined {
  const input = value.trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password
  ) {
    return undefined;
  }

  const hostname = url.hostname.toLowerCase();
  const allowedHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be",
  ]);
  if (!allowedHosts.has(hostname)) return undefined;

  let videoId: string | null = null;
  if (hostname === "youtu.be" || hostname === "www.youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (url.pathname === "/watch") {
    videoId = url.searchParams.get("v");
  } else {
    videoId = url.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)/)?.[1] ?? null;
  }

  return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)
    ? videoId
    : undefined;
}

function toSettingsResponse(videoId: string | null) {
  return {
    videoId,
    youtubeUrl: videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : null,
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
      .select({ videoId: homeVideoSettingsTable.videoId })
      .from(homeVideoSettingsTable)
      .where(eq(homeVideoSettingsTable.id, settingId))
      .limit(1);

    res.json(GetHomeVideoSettingsResponse.parse(
      toSettingsResponse(setting?.videoId ?? null),
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

    const videoId = getYoutubeVideoId(parsed.data.youtubeUrl);
    if (videoId === undefined) {
      res.status(400).json({
        error: "유효한 YouTube 영상 또는 라이브 링크를 입력해 주세요.",
      });
      return;
    }

    if (videoId === null) {
      await db
        .delete(homeVideoSettingsTable)
        .where(eq(homeVideoSettingsTable.id, settingId));
    } else {
      await db
        .insert(homeVideoSettingsTable)
        .values({ id: settingId, videoId })
        .onConflictDoUpdate({
          target: homeVideoSettingsTable.id,
          set: { videoId, updatedAt: new Date() },
        });
    }

    res.json(UpdateHomeVideoSettingsResponse.parse(toSettingsResponse(videoId)));
  },
);

export default router;
