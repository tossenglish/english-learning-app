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
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv'];

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\r/g, '\n')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z“"'])/)
    .map((sentence) => sentence.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((sentence) => /[a-zA-Z]/.test(sentence) && sentence.length >= 3)
    .slice(0, 20);
}

function createMaterial(assignment: Assignment, text: string): PracticeMaterial {
  const sentences = splitIntoSentences(text).map((english, index) => ({
    id: index + 1,
    english,
    korean: '업로드한 자료의 문장을 직접 이해하고 영어로 표현해보세요.',
    hint: `${english.split(/\s+/).slice(0, 3).join(' ')}…`,
  }));

  if (sentences.length === 0) {
    throw new Error('연습할 영어 문장을 찾지 못했습니다.');
  }

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

  const material = createMaterial(assignment, sourceText);
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