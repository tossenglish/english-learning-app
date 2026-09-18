import type { Assignment } from '@workspace/api-client-react';

export type PracticeSentence = {
  id: number;
  english: string;
  korean: string;
  hint: string;
};

export type PracticeMaterial = {
  assignmentId: number;
  title: string;
  sentences: PracticeSentence[];
};

const STORAGE_KEY = 'english-learning:active-practice-material';
const TRANSLATION_CACHE_PREFIX = 'english-learning:translations:';
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv'];

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z“"'])/)
    .map((sentence) => sentence.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((sentence) => /[a-zA-Z]/.test(sentence) && sentence.length >= 3)
    .slice(0, 20);
}

function translationCacheKey(sentences: string[]) {
  let hash = 2166136261;
  for (const character of sentences.join('\n')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${TRANSLATION_CACHE_PREFIX}${(hash >>> 0).toString(16)}`;
}

async function translateSentences(sentences: string[]): Promise<string[]> {
  const cacheKey = translationCacheKey(sentences);
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const translations = JSON.parse(cached) as string[];
      if (translations.length === sentences.length) return translations;
    } catch {
      localStorage.removeItem(cacheKey);
    }
  }

  const response = await fetch('/api/openai/translations', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentences }),
  });
  if (!response.ok) throw new Error('한글 해석을 만들지 못했습니다.');

  const body = await response.json() as { translations: string[] };
  if (!Array.isArray(body.translations) || body.translations.length !== sentences.length) {
    throw new Error('한글 해석 결과가 올바르지 않습니다.');
  }

  localStorage.setItem(cacheKey, JSON.stringify(body.translations));
  return body.translations;
}

async function createMaterial(assignment: Assignment, text: string): Promise<PracticeMaterial> {
  const englishSentences = splitIntoSentences(text);
  if (englishSentences.length === 0) {
    throw new Error('연습할 영어 문장을 찾지 못했습니다.');
  }

  const translations = await translateSentences(englishSentences);
  const sentences = englishSentences.map((english, index) => ({
    id: index + 1,
    english,
    korean: translations[index],
    hint: `${english.split(/\s+/).slice(0, 3).join(' ')}…`,
  }));

  return {
    assignmentId: assignment.id,
    title: assignment.title,
    sentences,
  };
}

export async function prepareAssignmentPractice(
  assignment: Assignment,
): Promise<PracticeMaterial> {
  const resourceName = assignment.resourceName?.toLowerCase() ?? '';
  let sourceText = '';

  if (
    assignment.resourcePath &&
    TEXT_EXTENSIONS.some((extension) => resourceName.endsWith(extension))
  ) {
    const response = await fetch(`/api/storage${assignment.resourcePath}`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error('첨부 자료를 불러오지 못했습니다.');
    sourceText = await response.text();
  } else if (assignment.description) {
    sourceText = assignment.description;
  } else if (assignment.resourcePath) {
    throw new Error('현재 자동 연습은 TXT, Markdown, CSV 자료를 지원합니다.');
  }

  const material = await createMaterial(assignment, sourceText);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(material));
  return material;
}

export function readActivePracticeMaterial(): PracticeMaterial | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PracticeMaterial;
    if (!parsed.title || !Array.isArray(parsed.sentences) || parsed.sentences.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}