import { randomInt } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { getUserId, isAdmin } from "../lib/auth";
import { getQuizBank, saveQuizBank, saveQuizScore, type QuizBank } from "../lib/quiz-sheet";
import type { QuizQuestion } from "./quiz-questions";

const router: IRouter = Router();
const maxQuestions = 200;
const maxChoices = 5;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function requireQuizAdmin(req: Request, res: Response): Promise<boolean> {
  if (!getUserId(req)) {
    res.status(401).json({ error: "로그인해 주세요." });
    return false;
  }
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "퀴즈 출제 관리자 권한이 필요해요." });
    return false;
  }
  return true;
}

function publicQuestions(questions: QuizQuestion[], count: number): QuizQuestion[] {
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return count > 0 ? shuffled.slice(0, Math.min(count, shuffled.length)) : shuffled;
}

router.get("/quiz", async (req: Request, res: Response): Promise<void> => {
  try {
    const bank = await getQuizBank();
    const questions = publicQuestions(bank.questions, bank.count);
    if (questions.length === 0) {
      res.status(503).json({ error: "등록된 문제가 없어요." });
      return;
    }
    res.json({
      version: bank.version,
      questions: questions.map(({ id, text, choices }) => ({ id, text, choices })),
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load quiz questions");
    res.status(502).json({ error: "문제를 불러오지 못했어요." });
  }
});

router.get("/admin/questions", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireQuizAdmin(req, res))) return;
  try {
    const bank = await getQuizBank();
    res.json({ questions: bank.questions, count: bank.count });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load quiz questions for administration");
    res.status(502).json({ error: "문제를 불러오지 못했어요." });
  }
});

router.put("/admin/questions", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireQuizAdmin(req, res))) return;
  if (!process.env.GOOGLE_SCRIPT_URL || !process.env.GOOGLE_SCRIPT_SECRET) {
    res.status(503).json({ error: "문제 저장을 위해 GOOGLE_SCRIPT_URL과 GOOGLE_SCRIPT_SECRET을 설정해 주세요." });
    return;
  }

  const body: unknown = req.body;
  if (!isRecord(body) || !Array.isArray(body.questions)) {
    res.status(400).json({ error: "잘못된 요청입니다." });
    return;
  }
  if (body.questions.length === 0 || body.questions.length > maxQuestions) {
    res.status(400).json({ error: `문제는 1개부터 ${maxQuestions}개까지 등록할 수 있어요.` });
    return;
  }

  const questions: QuizQuestion[] = [];
  const seenIds = new Set<string>();
  for (const [index, rawQuestion] of body.questions.entries()) {
    if (!isRecord(rawQuestion)) {
      res.status(400).json({ error: `${index + 1}번 문제를 확인해 주세요.` });
      return;
    }

    const id = typeof rawQuestion.id === "string" ? rawQuestion.id.trim().slice(0, 40) : "";
    const text = typeof rawQuestion.text === "string" ? rawQuestion.text.trim().slice(0, 500) : "";
    const choices = Array.isArray(rawQuestion.choices)
      ? rawQuestion.choices.map((choice) =>
        typeof choice === "string" ? choice.trim().slice(0, 200) : "",
      )
      : [];
    const answer = typeof rawQuestion.answer === "number" ? rawQuestion.answer : -1;
    const explanation = typeof rawQuestion.explanation === "string"
      ? rawQuestion.explanation.trim().slice(0, 500)
      : "";

    if (
      !id
      || seenIds.has(id)
      || !text
      || choices.length < 2
      || choices.length > maxChoices
      || choices.some((choice) => !choice)
      || !Number.isInteger(answer)
      || answer < 0
      || answer >= choices.length
    ) {
      res.status(400).json({
        error: `${index + 1}번 문제를 확인해 주세요. (문제, 보기 2~5개, 정답 선택)`,
      });
      return;
    }

    seenIds.add(id);
    questions.push({ id, text, choices, answer, explanation });
  }

  const rawCount = body.count === undefined ? 0 : Number(body.count);
  if (!Number.isInteger(rawCount) || rawCount < 0 || rawCount > questions.length) {
    res.status(400).json({ error: "출제 문항 수를 확인해 주세요." });
    return;
  }

  try {
    await saveQuizBank(questions, rawCount);
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to save quiz questions");
    res.status(502).json({ error: "저장하지 못했어요." });
  }
});

router.post("/quiz/grade", async (req: Request, res: Response): Promise<void> => {
  const body: unknown = req.body;
  if (!isRecord(body)) {
    res.status(400).json({ error: "잘못된 요청입니다." });
    return;
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 30) : "";
  if (!name) {
    res.status(400).json({ error: "이름을 입력해 주세요." });
    return;
  }
  if (
    typeof body.version !== "string"
    || !Array.isArray(body.questionIds)
    || !isRecord(body.answers)
  ) {
    res.status(400).json({ error: "문제를 새로고침한 뒤 다시 제출해 주세요." });
    return;
  }

  let bank: QuizBank;
  try {
    bank = await getQuizBank();
  } catch (error) {
    req.log.error({ err: error }, "Failed to load quiz questions for grading");
    res.status(502).json({ error: "채점할 문제를 불러오지 못했어요." });
    return;
  }
  if (body.version !== bank.version) {
    res.status(409).json({ error: "문제가 바뀌었어요. 페이지를 새로고침한 뒤 다시 풀어 주세요." });
    return;
  }

  const questionIds = body.questionIds;
  const answers = body.answers;
  if (
    questionIds.length === 0
    || questionIds.length > bank.questions.length
    || !questionIds.every((id) => typeof id === "string")
    || new Set(questionIds).size !== questionIds.length
    || Object.keys(answers).length !== questionIds.length
  ) {
    res.status(400).json({ error: "모든 문제에 답을 골라 주세요." });
    return;
  }

  const bankById = new Map(bank.questions.map((question) => [question.id, question]));
  const selectedQuestions: QuizQuestion[] = [];
  const selectedAnswers: number[] = [];
  for (const id of questionIds as string[]) {
    const question = bankById.get(id);
    const picked = answers[id];
    if (
      !question
      || typeof picked !== "number"
      || !Number.isInteger(picked)
      || picked < 0
      || picked >= question.choices.length
    ) {
      res.status(409).json({ error: "문제가 바뀌었어요. 페이지를 새로고침한 뒤 다시 풀어 주세요." });
      return;
    }
    selectedQuestions.push(question);
    selectedAnswers.push(picked);
  }

  const results = selectedQuestions.map((question, index) => {
    const picked = selectedAnswers[index];
    return {
      id: question.id,
      picked,
      correctIndex: question.answer,
      correct: picked === question.answer,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  const total = results.length;
  let saved = false;

  if (process.env.GOOGLE_SCRIPT_URL && process.env.GOOGLE_SCRIPT_SECRET) {
    try {
      await saveQuizScore({
        name,
        score,
        total,
        picked: results.map((result) => `${result.id}:${result.picked + 1}`).join(","),
      });
      saved = true;
    } catch (error) {
      req.log.warn({ err: error }, "Failed to save quiz score to Google Sheets");
    }
  }

  res.json({ score, total, results, saved });
});

export default router;
