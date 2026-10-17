import {
  GenerateReadingQuestionsBody,
  GenerateReadingQuestionsResponse,
  GradeReadingShortAnswerBody,
  GradeReadingShortAnswerParams,
  GradeReadingShortAnswerResponse,
  ListAdminReadingPassagesResponse,
  ListReadingPassagesQueryParams,
  ListReadingPassagesResponse,
  SaveReadingPassageBody,
  SaveReadingPassageResponse,
} from "@workspace/api-zod";
import { db, readingPassagesTable, type ReadingQuestion } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { getUserId, isAdmin } from "../lib/auth";

const router: IRouter = Router();
const gradeLevel = 6;
const questionTypes: ReadingQuestion["type"][] = ["true_false", "multiple_choice", "short_answer"];

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

function validateQuestions(value: unknown): value is ReadingQuestion[] {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const questions = value as ReadingQuestion[];
  const typeSet = new Set(questions.map((item) => item?.type));
  if (questionTypes.some((type) => !typeSet.has(type)) || typeSet.size !== 3) return false;
  return questions.every((item) =>
    typeof item.prompt === "string"
    && item.prompt.trim().length > 0
    && typeof item.answer === "string"
    && item.answer.trim().length > 0
    && Array.isArray(item.options)
    && (item.type !== "multiple_choice" || (
      item.options.length === 3 && item.options.every((option) => typeof option === "string")
      && item.options.includes(item.answer)
    ))
    && (item.type !== "true_false" || ["true", "false"].includes(item.answer.toLowerCase()))
    && (item.type !== "short_answer" || item.options.length === 0),
  );
}

function validPassage(passage: string): boolean {
  const count = (passage.match(/[.!?](?:["')\]]*)?(?:\s|$)/g) ?? []).length;
  return count >= 3 && count <= 5;
}

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
  res.json(ListReadingPassagesResponse.parse(rows));
});

router.get("/admin/reading/passages", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const rows = await db.select().from(readingPassagesTable).orderBy(desc(readingPassagesTable.createdAt));
  res.json(ListAdminReadingPassagesResponse.parse(rows));
});

router.post("/admin/reading/passages/generate", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = GenerateReadingQuestionsBody.safeParse(req.body);
  if (!parsed.success || !validPassage(parsed.data.passage)) {
    res.status(400).json({ error: "영어 지문은 3~5문장으로 입력해 주세요." });
    return;
  }
  try {
    const content = await askClaude(
      "You write reading-comprehension questions for Korean elementary school grade 6. Use only facts explicitly stated in the passage. Every correct answer must be directly supported by the passage. Use easy English and short sentences. Return only valid JSON.",
      `Create exactly three questions from this passage and return {"questions":[...]} with one of each type: true_false (answer is "true" or "false"), multiple_choice (exactly 3 short English options and answer equals one option), and short_answer (answer is a short English phrase). Every question and option must be answerable from the passage. Passage:\n${parsed.data.passage}`,
    );
    const output = parseJsonObject(content);
    if (!validateQuestions(output.questions)) throw new Error("Invalid question set");
    res.json(GenerateReadingQuestionsResponse.parse(output.questions));
  } catch (error) {
    req.log.error({ err: error }, "Reading question generation failed");
    res.status(503).json({ error: "AI question generation failed" });
  }
});

router.post("/admin/reading/passages", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = SaveReadingPassageBody.safeParse(req.body);
  if (!parsed.success || !validPassage(parsed.data.passage) || !validateQuestions(parsed.data.questions)) {
    res.status(400).json({ error: "지문은 3~5문장, 문제는 O/X·객관식·짧은 답 각 1개로 저장해 주세요." });
    return;
  }
  const [saved] = await db.insert(readingPassagesTable).values({
    grade: gradeLevel,
    title: parsed.data.title.trim(),
    passage: parsed.data.passage.trim(),
    questions: parsed.data.questions,
  }).returning();
  res.status(201).json(SaveReadingPassageResponse.parse(saved));
});

router.post("/reading/passages/:passageId/short-answer", async (req: Request, res: Response): Promise<void> => {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const params = GradeReadingShortAnswerParams.safeParse(req.params);
  const parsed = GradeReadingShortAnswerBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid answer" });
    return;
  }
  const [passage] = await db.select().from(readingPassagesTable)
    .where(eq(readingPassagesTable.id, params.data.passageId));
  const question = passage?.questions[parsed.data.questionIndex];
  if (!passage || !question || question.type !== "short_answer") {
    res.status(404).json({ error: "Passage or question not found" });
    return;
  }
  try {
    const content = await askClaude(
      "Grade a grade-6 student's short English answer. Compare only with the passage and expected answer. Accept one or two spelling mistakes when meaning is clear. Mark correct if the meaning matches. Give kind feedback in Korean, only one or two short sentences. Return only JSON with boolean correct and string feedback.",
      JSON.stringify({
        passage: passage.passage,
        question: question.prompt,
        expectedAnswer: question.answer,
        studentAnswer: parsed.data.answer,
      }),
    );
    const result = parseJsonObject(content);
    if (typeof result.correct !== "boolean" || typeof result.feedback !== "string") {
      throw new Error("Invalid grading response");
    }
    res.json(GradeReadingShortAnswerResponse.parse({
      correct: result.correct,
      feedback: result.feedback.slice(0, 220),
    }));
  } catch (error) {
    req.log.error({ err: error, passageId: passage.id }, "Reading short answer grading failed");
    res.status(503).json({ error: "잠깐 쉬고 있어요, 다시 해 볼까요?" });
  }
});

export default router;
