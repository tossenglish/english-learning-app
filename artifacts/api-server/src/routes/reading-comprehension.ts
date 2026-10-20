import {
  CheckReadingObjectiveAnswerBody,
  CheckReadingObjectiveAnswerParams,
  CheckReadingObjectiveAnswerResponse,
  DeleteAdminReadingPassageParams,
  ExplainReadingAnswerBody,
  ExplainReadingAnswerParams,
  ExplainReadingAnswerResponse,
  ListAdminReadingPassagesResponse,
  ListReadingPassagesQueryParams,
  ListReadingPassagesResponse,
  SaveReadingPassageBody,
  SaveReadingPassageResponse,
  UpdateAdminReadingPassageBody,
  UpdateAdminReadingPassageParams,
  UpdateAdminReadingPassageResponse,
} from "@workspace/api-zod";
import {
  db,
  readingAiExplanationsTable,
  readingAiUsageTable,
  readingPassagesTable,
  type ReadingQuestion,
} from "@workspace/db";
import { createHash } from "node:crypto";
import { desc, eq, lt, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { getUserId, isAdmin } from "../lib/auth";

const router: IRouter = Router();
const gradeLevel = 6;
const dailyAiLimit = 20;

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

function parseJsonObject(text: string): Record<string, unknown> {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(clean);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid AI response");
  return parsed as Record<string, unknown>;
}

async function askClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Claude API returned ${response.status}`);
  const result = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const text = result.content?.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("Claude returned no text");
  return text;
}

function validPassage(passage: string): boolean {
  const count = (passage.match(/[.!?](?:["')\]]*)?(?:\s|$)/g) ?? []).length;
  return count >= 3 && count <= 5;
}

function validQuestions(value: unknown): value is ReadingQuestion[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((q) =>
    q && q.type === "true_false"
    && typeof q.prompt === "string" && q.prompt.trim().length > 0
    && typeof q.answer === "string" && ["true", "false"].includes(q.answer.toLowerCase())
    && Array.isArray(q.options) && q.options.length === 0
    && (q.explanationNote === undefined || typeof q.explanationNote === "string"),
  );
}

function todayInSeoul(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function reserveAiCall(userId: string): Promise<boolean> {
  const [reserved] = await db.insert(readingAiUsageTable)
    .values({ userId, usageDate: todayInSeoul(), calls: 1 })
    .onConflictDoUpdate({
      target: [readingAiUsageTable.userId, readingAiUsageTable.usageDate],
      set: { calls: sql`${readingAiUsageTable.calls} + 1` },
      setWhere: lt(readingAiUsageTable.calls, dailyAiLimit),
    })
    .returning({ calls: readingAiUsageTable.calls });
  return Boolean(reserved);
}

function normalizeAnswer(answer: string): string {
  return answer.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

function answerIsCorrect(question: ReadingQuestion, answer: string): boolean {
  if (question.type !== "true_false") return false;
  const normalized = normalizeAnswer(answer);
  const boolAnswer = normalized === "o" ? "true" : normalized === "x" ? "false" : normalized;
  return boolAnswer === normalizeAnswer(question.answer);
}

function makeCacheKey(passageId: number, questionIndex: number, question: ReadingQuestion, passage: string, answer: string) {
  return createHash("sha256").update(JSON.stringify({
    passageId,
    questionIndex,
    passage,
    question: question.prompt,
    options: question.options,
    expectedAnswer: question.answer,
    explanationNote: question.explanationNote ?? "",
    studentAnswer: normalizeAnswer(answer),
  })).digest("hex");
}

async function getObjectiveQuestion(req: Request, passageId: number, questionIndex: number) {
  const [passage] = await db.select().from(readingPassagesTable)
    .where(eq(readingPassagesTable.id, passageId));
  const question = passage?.questions.filter((item) => item.type === "true_false")[questionIndex];
  return passage && question ? { passage, question } : null;
}

function aiSystemPrompt(): string {
  return `너는 초등학교 6학년 영어 선생님이다.
정답은 선생님이 정한 것이 기준이며, 절대 바꾸지 않는다.
설명은 한국어로 2~3문장, 쉽고 따뜻한 말투로 한다.
지문에서 근거가 되는 문장을 영어로 짚어 주고, 틀린 답은 비난하지 말고 어디서 헷갈렸는지 알려 준다.
지문에 없는 내용은 추측해서 말하지 않는다.
문제와 관련 없는 질문이나 대화에는 답하지 않고 '지문을 다시 읽어 볼까?'라고 안내한다.
JSON 객체로 {"feedback":"..."}만 반환한다.`;
}

const rateLimitMessage = "오늘은 여기까지! 내일 또 만나요";
const apiErrorMessage = "잠깐 쉬고 있어요, 다시 해 볼까요?";

router.get("/reading/passages", async (req: Request, res: Response): Promise<void> => {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const query = ListReadingPassagesQueryParams.safeParse({ grade: Number(req.query.grade) });
  if (!query.success) {
    res.status(400).json({ error: "지원하는 학년을 선택해 주세요." });
    return;
  }
  const rows = await db.select().from(readingPassagesTable)
    .where(eq(readingPassagesTable.grade, query.data.grade))
    .orderBy(desc(readingPassagesTable.createdAt));
  const studentRows = rows
    .map((row) => ({
      ...row,
      questions: row.questions
        .filter((question) => question.type === "true_false")
        .map(({ type, prompt, options }) => ({ type, prompt, options })),
    }))
    .filter((row) => row.questions.length > 0);
  res.json(ListReadingPassagesResponse.parse(studentRows));
});

router.get("/admin/reading/passages", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(readingPassagesTable).orderBy(desc(readingPassagesTable.createdAt));
  res.json(ListAdminReadingPassagesResponse.parse(rows));
});

router.post("/admin/reading/passages", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = SaveReadingPassageBody.safeParse(req.body);
  if (!parsed.success || !validPassage(parsed.data.passage) || !validQuestions(parsed.data.questions)) {
    res.status(400).json({ error: "제목을 입력하고, 지문은 3~5문장으로 작성해 주세요. O/X 문제마다 질문과 정답도 확인해 주세요." });
    return;
  }
  const [saved] = await db.insert(readingPassagesTable).values({
    grade: gradeLevel,
    title: parsed.data.title.trim(),
    passage: parsed.data.passage.trim(),
    questions: parsed.data.questions.map((question) => ({
      ...question,
      explanationNote: question.explanationNote?.trim() || undefined,
    })),
  }).returning();
  res.status(201).json(SaveReadingPassageResponse.parse(saved));
});

router.patch("/admin/reading/passages/:passageId", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const params = UpdateAdminReadingPassageParams.safeParse(req.params);
  const parsed = UpdateAdminReadingPassageBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "수정할 제목, 지문, O/X 문제를 확인해 주세요." });
    return;
  }

  const title = parsed.data.title.trim();
  const passageText = parsed.data.passage.trim();
  if (
    !title
    || !validPassage(passageText)
    || (parsed.data.questions !== undefined && !validQuestions(parsed.data.questions))
  ) {
    res.status(400).json({ error: "제목과 지문을 확인하고, 지문은 3~5문장으로 작성해 주세요." });
    return;
  }

  const [existing] = await db.select().from(readingPassagesTable)
    .where(eq(readingPassagesTable.id, params.data.passageId));
  if (!existing) {
    res.status(404).json({ error: "읽기 지문을 찾을 수 없습니다." });
    return;
  }

  const updatedQuestions = parsed.data.questions
    ? [
      ...parsed.data.questions.map((question) => ({
        ...question,
        explanationNote: question.explanationNote?.trim() || undefined,
      })),
      ...existing.questions.filter((question) => question.type !== "true_false"),
    ]
    : existing.questions;
  const [updated] = await db.update(readingPassagesTable)
    .set({
      title,
      passage: passageText,
      questions: updatedQuestions,
    })
    .where(eq(readingPassagesTable.id, params.data.passageId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "읽기 지문을 찾을 수 없습니다." });
    return;
  }
  res.json(UpdateAdminReadingPassageResponse.parse(updated));
});

router.delete("/admin/reading/passages/:passageId", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const params = DeleteAdminReadingPassageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "삭제할 읽기 지문을 확인해 주세요." });
    return;
  }

  const [deleted] = await db.delete(readingPassagesTable)
    .where(eq(readingPassagesTable.id, params.data.passageId))
    .returning({ id: readingPassagesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "읽기 지문을 찾을 수 없습니다." });
    return;
  }
  res.sendStatus(204);
});

router.post("/reading/passages/:passageId/objective-answer", async (req: Request, res: Response): Promise<void> => {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = CheckReadingObjectiveAnswerParams.safeParse(req.params);
  const parsed = CheckReadingObjectiveAnswerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid answer" });
    return;
  }
  const found = await getObjectiveQuestion(req, params.data.passageId, parsed.data.questionIndex);
  if (!found) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  res.json(CheckReadingObjectiveAnswerResponse.parse({
    correct: answerIsCorrect(found.question, parsed.data.answer),
  }));
});

router.post("/reading/passages/:passageId/explanation", async (req: Request, res: Response): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = ExplainReadingAnswerParams.safeParse(req.params);
  const parsed = ExplainReadingAnswerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid answer" });
    return;
  }
  const found = await getObjectiveQuestion(req, params.data.passageId, parsed.data.questionIndex);
  if (!found) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const cacheKey = makeCacheKey(params.data.passageId, parsed.data.questionIndex, found.question, found.passage.passage, parsed.data.answer);
  const [cached] = await db.select().from(readingAiExplanationsTable)
    .where(eq(readingAiExplanationsTable.cacheKey, cacheKey));
  if (cached) {
    res.json(ExplainReadingAnswerResponse.parse({ feedback: cached.feedback }));
    return;
  }
  if (!(await reserveAiCall(userId))) {
    res.status(429).json({ error: rateLimitMessage });
    return;
  }
  try {
    const content = await askClaude(aiSystemPrompt(), JSON.stringify({
      passage: found.passage.passage,
      question: found.question.prompt,
      options: found.question.options,
      teacherAnswer: found.question.answer,
      teacherExplanationNote: found.question.explanationNote ?? "",
      studentAnswer: parsed.data.answer,
      isCorrect: answerIsCorrect(found.question, parsed.data.answer),
    }));
    const result = parseJsonObject(content);
    if (typeof result.feedback !== "string") throw new Error("Invalid explanation response");
    const feedback = result.feedback.slice(0, 500);
    await db.insert(readingAiExplanationsTable).values({ cacheKey, feedback }).onConflictDoNothing();
    const [saved] = await db.select().from(readingAiExplanationsTable)
      .where(eq(readingAiExplanationsTable.cacheKey, cacheKey));
    res.json(ExplainReadingAnswerResponse.parse({ feedback: saved?.feedback ?? feedback }));
  } catch (error) {
    req.log.error({ err: error, passageId: found.passage.id }, "Reading explanation failed");
    res.status(503).json({ error: apiErrorMessage });
  }
});

export default router;
