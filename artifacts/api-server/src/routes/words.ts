import { db, sharedWordsTable } from "@workspace/db";
import { Router, type IRouter } from "express";

import { isAdmin } from "../lib/auth";

const router: IRouter = Router();
const MAX_WORDS = 2000;

type Word = { en: string; ko: string };

function cleanWords(list: unknown): Word[] {
  const out: Word[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(list) ? list : []) {
    const en = String(item?.en ?? "").trim().slice(0, 100);
    const ko = String(item?.ko ?? "").trim().slice(0, 200);
    if (!en || !ko) continue;
    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ en, ko });
    if (out.length >= MAX_WORDS) break;
  }
  return out;
}

async function checkAdmin(req: Parameters<typeof isAdmin>[0]): Promise<boolean> {
  try {
    return await isAdmin(req);
  } catch {
    return false;
  }
}

router.get("/words", async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const rows = await db
      .select({ en: sharedWordsTable.en, ko: sharedWordsTable.ko })
      .from(sharedWordsTable)
      .orderBy(sharedWordsTable.position, sharedWordsTable.id);
    res.json({ words: rows, canEdit: await checkAdmin(req) });
  } catch (error) {
    req.log.error({ error }, "Failed to read shared words");
    res.status(500).json({ error: "Failed to read words" });
  }
});

router.put("/words", async (req, res) => {
  if (!(await checkAdmin(req))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  const words = cleanWords(req.body?.words);
  if (!words.length) {
    res.status(400).json({ error: "No valid words" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await tx.delete(sharedWordsTable);
      await tx
        .insert(sharedWordsTable)
        .values(words.map((w, i) => ({ en: w.en, ko: w.ko, position: i })));
    });
    res.json({ ok: true, count: words.length });
  } catch (error) {
    req.log.error({ error }, "Failed to save shared words");
    res.status(500).json({ error: "Failed to save words" });
  }
});

export default router;
