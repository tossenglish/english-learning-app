import { Router, type IRouter, type Request, type Response } from "express";
import { quizQuestions } from "./quiz-questions";

const router: IRouter = Router();

router.get("/quiz", (_req, res) => {
  res.json({
    questions: quizQuestions.map(({ id, text, choices }) => ({ id, text, choices })),
  });
});

router.post("/quiz/grade", async (req: Request, res: Response): Promise<void> => {
  const body: unknown = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.status(400).json({ error: "잘못된 요청입니다." });
    return;
  }

  const { name: rawName, answers } = body as Record<string, unknown>;
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 30) : "";
  if (!name) {
    res.status(400).json({ error: "이름을 입력해 주세요." });
    return;
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    res.status(400).json({ error: "모든 문제에 답을 골라 주세요." });
    return;
  }

  const answerMap = answers as Record<string, unknown>;
  if (quizQuestions.some((question) =>
    !Number.isInteger(answerMap[question.id])
    || (answerMap[question.id] as number) < 0
    || (answerMap[question.id] as number) >= question.choices.length,
  )) {
    res.status(400).json({ error: "모든 문제에 답을 골라 주세요." });
    return;
  }

  const results = quizQuestions.map((question) => {
    const picked = answerMap[question.id] as number;
    return {
      id: question.id,
      picked,
      correctIndex: question.answer,
      correct: picked === question.answer,
      explanation: question.explanation,
    };
  });
  const score = results.filter((result) => result.correct).length;
  const total = quizQuestions.length;
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const scriptSecret = process.env.GOOGLE_SCRIPT_SECRET;
  let saved = false;

  if (scriptUrl && scriptSecret) {
    try {
      const response = await fetch(scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          secret: scriptSecret,
          name,
          score,
          total,
          picked: results.map((result) => result.picked + 1).join(","),
        }),
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      const data: unknown = await response.json();
      saved = response.ok
        && !!data
        && typeof data === "object"
        && "ok" in data
        && data.ok === true;
      if (!saved) {
        req.log.warn({ status: response.status }, "Quiz score was not saved to Google Sheets");
      }
    } catch (error) {
      req.log.warn({ err: error }, "Failed to save quiz score to Google Sheets");
    }
  }

  res.json({ score, total, results, saved });
});

export default router;
