import { quizQuestions, quizQuestionCount, quizQuestionVersion, type QuizQuestion } from "../routes/quiz-questions";

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
  const parsedChoices = Array.isArray(choices)
    ? choices.filter((choice): choice is string => typeof choice === "string" && choice.length > 0)
    : [];
  if (
    typeof id !== "string"
    || !id
    || typeof text !== "string"
    || !text
    || !Array.isArray(choices)
    || parsedChoices.length !== choices.length
    || parsedChoices.length < 2
    || parsedChoices.length > 5
    || typeof answer !== "number"
    || !Number.isInteger(answer)
    || answer < 0
    || answer >= parsedChoices.length
    || (explanation !== undefined && typeof explanation !== "string")
  ) {
    return null;
  }
  return {
    id,
    text,
    choices: parsedChoices,
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
  if (!process.env.GOOGLE_SCRIPT_URL && !process.env.GOOGLE_SCRIPT_SECRET) {
    return {
      questions: quizQuestions,
      count: quizQuestionCount,
      version: quizQuestionVersion,
    };
  }

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
    || typeof result.version !== "string"
    || !result.version
  ) {
    throw new Error("Google Apps Script returned invalid quiz settings");
  }

  return {
    questions,
    count: result.count,
    version: result.version,
  };
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
