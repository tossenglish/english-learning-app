import { quizQuestionCount, quizQuestionVersion, quizQuestions, type QuizQuestion } from "../routes/quiz-questions";

export type QuizBank = {
  questions: QuizQuestion[];
  count: number;
  version: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseQuestion(value: unknown): QuizQuestion | null {
  if (!isRecord(value)) return null;
  const { id, text, choices, answer, explanation } = value;
  if (
    typeof id !== "string"
    || !id
    || typeof text !== "string"
    || !text
    || !Array.isArray(choices)
    || choices.length < 2
    || choices.length > 5
    || !choices.every((choice) => typeof choice === "string" && choice.length > 0)
    || typeof answer !== "number"
    || !Number.isInteger(answer)
    || answer < 0
    || answer >= choices.length
    || (explanation !== undefined && typeof explanation !== "string")
  ) {
    return null;
  }
  return {
    id,
    text,
    choices,
    answer,
    explanation: typeof explanation === "string" ? explanation : "",
  };
}

async function callQuizScript(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = process.env.GOOGLE_SCRIPT_URL;
  const secret = process.env.GOOGLE_SCRIPT_SECRET;
  if (!url || !secret) throw new Error("GOOGLE_SCRIPT_URL and GOOGLE_SCRIPT_SECRET are required");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...payload, secret }),
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  const result: unknown = await response.json();
  if (!response.ok || !isRecord(result) || result.ok !== true) {
    throw new Error(`Google Apps Script request failed with status ${response.status}`);
  }
  return result;
}

export async function getQuizBank(): Promise<QuizBank> {
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const scriptSecret = process.env.GOOGLE_SCRIPT_SECRET;
  if (!scriptUrl && !scriptSecret) {
    return {
      questions: quizQuestions,
      count: quizQuestionCount,
      version: quizQuestionVersion,
    };
  }
  if (!scriptUrl || !scriptSecret) throw new Error("Both Google Apps Script settings must be configured");

  const result = await callQuizScript({ action: "getQuestions" });
  if (!Array.isArray(result.questions)) throw new Error("Google Apps Script returned invalid quiz questions");
  const questions = result.questions
    .map(parseQuestion)
    .filter((question): question is QuizQuestion => question !== null);
  if (questions.length !== result.questions.length) {
    throw new Error("Google Apps Script returned an invalid quiz question");
  }
  if (
    typeof result.count !== "number"
    || !Number.isInteger(result.count)
    || result.count < 0
    || result.count > questions.length
    || typeof result.version !== "string"
    || !result.version
  ) {
    throw new Error("Google Apps Script returned invalid quiz settings");
  }

  return { questions, count: result.count, version: result.version };
}

export async function saveQuizBank(questions: QuizQuestion[], count: number): Promise<void> {
  await callQuizScript({ action: "saveQuestions", questions, count });
}

export async function saveQuizScore(payload: {
  name: string;
  score: number;
  total: number;
  picked: string;
}): Promise<void> {
  await callQuizScript(payload);
}
