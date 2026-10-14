import { useEffect, useRef, useState } from 'react';
import type {
  Assignment,
  AssignmentFolder,
  LearningContent,
  LearningContentInput,
  LearningContentLevel,
} from '@workspace/api-client-react';
import { CheckCircle2, Download, FileSpreadsheet, Languages, LoaderCircle, UploadCloud } from 'lucide-react';
import {
  createLearningContentCsv,
  parseLearningContentCsv,
  type ParsedLearningContentCsvItem,
} from '@/lib/learning-content-csv';
import { getDefaultLearningContent, LEARNING_CONTENT_UPDATED_EVENT } from '@/lib/learning-content';
import { apiFetch } from '@/lib/api-fetch';

const levelOrder: LearningContentLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const levelLabels: Record<LearningContentLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
};

function getWordFolderPath(folderId: number, folders: AssignmentFolder[]): string {
  const path: string[] = [];
  const seen = new Set<number>();
  let folder = folders.find((item) => item.id === folderId);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    path.unshift(folder.name);
    folder = folder.parentFolderId == null
      ? undefined
      : folders.find((item) => item.id === folder!.parentFolderId);
  }
  return path.join(' / ');
}

type UploadState = {
  fileName: string;
  preview: ParsedLearningContentCsvItem[] | null;
  error: string;
};

type SentenceDraft = { english: string; korean: string };
type WordDraft = { word: string; meaning: string };
const INITIAL_WORD_ASSIGNMENT_DESCRIPTION = '초기화면 단어 설정에서 저장한 단어 자료';

function parseSavedWordDraft(assignment: Assignment | undefined): WordDraft | null {
  if (!assignment) return null;
  const rows = assignment.materialContent.split(/\r?\n/).filter(Boolean);
  const pairs = rows.map((row) => {
    const separator = row.indexOf('||');
    if (separator < 1) return null;
    const word = row.slice(0, separator).trim();
    const meaning = row.slice(separator + 2).trim();
    return word && meaning ? { word, meaning } : null;
  });
  if (!pairs.length || pairs.some((pair) => !pair)) return null;
  return {
    word: pairs.map((pair) => pair!.word).join('\n'),
    meaning: pairs.map((pair) => pair!.meaning).join('\n'),
  };
}

const defaultSentenceDrafts = (): Record<LearningContentLevel, SentenceDraft> => ({
  Beginner: {
    english: getDefaultLearningContent('Beginner').exampleSentence,
    korean: getDefaultLearningContent('Beginner').exampleKorean,
  },
  Intermediate: {
    english: getDefaultLearningContent('Intermediate').exampleSentence,
    korean: getDefaultLearningContent('Intermediate').exampleKorean,
  },
  Advanced: {
    english: getDefaultLearningContent('Advanced').exampleSentence,
    korean: getDefaultLearningContent('Advanced').exampleKorean,
  },
});

const defaultWordDrafts = (): Record<LearningContentLevel, WordDraft> => ({
  Beginner: {
    word: getDefaultLearningContent('Beginner').word,
    meaning: getDefaultLearningContent('Beginner').shortMeaning,
  },
  Intermediate: {
    word: getDefaultLearningContent('Intermediate').word,
    meaning: getDefaultLearningContent('Intermediate').shortMeaning,
  },
  Advanced: {
    word: getDefaultLearningContent('Advanced').word,
    meaning: getDefaultLearningContent('Advanced').shortMeaning,
  },
});

const emptyUploads = (): Record<LearningContentLevel, UploadState> => ({
  Beginner: { fileName: '', preview: null, error: '' },
  Intermediate: { fileName: '', preview: null, error: '' },
  Advanced: { fileName: '', preview: null, error: '' },
});

function parseManualWordDraft(
  draft: WordDraft,
  level: LearningContentLevel,
): ParsedLearningContentCsvItem[] | null {
  if (!draft.word.trim() && !draft.meaning.trim()) return null;

  const words = draft.word.replace(/\r/g, '').trimEnd().split('\n').map((word) => word.trim());
  const meanings = draft.meaning.replace(/\r/g, '').trimEnd().split('\n').map((meaning) => meaning.trim());
  if (words.length !== meanings.length) {
    throw new Error('영어 단어와 한글 뜻의 줄 수를 맞춰 주세요.');
  }
  if (words.length > 200) {
    throw new Error('한 번에 최대 200개까지 저장할 수 있어요.');
  }

  return words.map((word, index) => {
    const meaning = meanings[index];
    if (!word || !meaning) {
      throw new Error(`${index + 1}번째 줄의 단어와 뜻을 모두 입력해 주세요.`);
    }
    if (word.length > 200 || meaning.length > 200) {
      throw new Error(`${index + 1}번째 줄의 단어와 뜻은 각각 200자 이내로 입력해 주세요.`);
    }
    return { level, word, shortMeaning: meaning };
  });
}

function getManualWordDraftCount(draft: WordDraft): number {
  return Math.max(
    draft.word.split(/\r?\n/).filter((word) => word.trim()).length,
    draft.meaning.split(/\r?\n/).filter((meaning) => meaning.trim()).length,
  );
}

async function createDefaultWordFolder(level: LearningContentLevel): Promise<AssignmentFolder> {
  const response = await apiFetch('/api/admin/assignment-folders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `${levelLabels[level]} 단어 자료`,
      materialType: 'word',
      level,
      parentFolderId: null,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || '단어 폴더를 만들지 못했습니다.');
  }
  return response.json() as Promise<AssignmentFolder>;
}

function getContentInput(
  saved: LearningContent | undefined,
  level: LearningContentLevel,
): LearningContentInput {
  if (!saved) return getDefaultLearningContent(level);
  return {
    word: saved.word,
    pronunciation: saved.pronunciation,
    partOfSpeech: saved.partOfSpeech,
    shortMeaning: saved.shortMeaning,
    meaningDetail: saved.meaningDetail,
    englishDefinition: saved.englishDefinition,
    exampleSentence: saved.exampleSentence,
    exampleKorean: saved.exampleKorean,
    quizOptions: saved.quizOptions,
    correctMeaning: saved.correctMeaning,
    tip: saved.tip,
  };
}

function makeQuizOptions(
  level: LearningContentLevel,
  word: string,
  meaning: string,
  currentContent: LearningContent[],
) {
  const saved = currentContent.find((item) => item.level === level);
  if (saved?.shortMeaning === meaning && saved.correctMeaning === meaning) {
    return saved.quizOptions;
  }
  const defaults = getDefaultLearningContent(level);
  const candidates = [
    ...currentContent.filter((item) => item.level !== level).flatMap((item) => [
      item.shortMeaning,
      ...item.quizOptions.filter((option) => option !== item.correctMeaning),
    ]),
    ...defaults.quizOptions.filter((option) => option !== defaults.correctMeaning),
  ];
  const distractors = [...new Set(candidates.map((item) => item.trim()).filter((item) => item && item !== meaning))];
  for (const fallback of ['다른 뜻', '다른 의미', '추가 선택지']) {
    if (distractors.length >= 3) break;
    if (fallback !== meaning && !distractors.includes(fallback)) distractors.push(fallback);
  }
  let fallbackIndex = 1;
  while (distractors.length < 3) {
    const fallback = `뜻 선택지 ${fallbackIndex}`;
    if (fallback !== meaning && !distractors.includes(fallback)) distractors.push(fallback);
    fallbackIndex += 1;
  }
  const options = distractors.slice(0, 3);
  const correctIndex = [...`${level}:${word}`].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4;
  options.splice(correctIndex, 0, meaning);
  return options;
}

export default function AdminWordContentSettings() {
  const fileInputRefs = useRef<Partial<Record<LearningContentLevel, HTMLInputElement | null>>>({});
  const [currentContent, setCurrentContent] = useState<LearningContent[]>([]);
  const [wordFolders, setWordFolders] = useState<AssignmentFolder[]>([]);
  const [folderByLevel, setFolderByLevel] = useState<Record<LearningContentLevel, string>>({
    Beginner: '',
    Intermediate: '',
    Advanced: '',
  });
  const [sentenceDrafts, setSentenceDrafts] = useState(defaultSentenceDrafts);
  const [wordDrafts, setWordDrafts] = useState(defaultWordDrafts);
  const [uploads, setUploads] = useState<Record<LearningContentLevel, UploadState>>(emptyUploads);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<LearningContentLevel | null>(null);
  const [savingSentenceLevel, setSavingSentenceLevel] = useState<LearningContentLevel | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      apiFetch('/api/admin/learning-content', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      }),
      apiFetch('/api/admin/assignments', {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      }),
    ])
      .then(async ([contentResponse, assignmentResponse]) => {
        if (!contentResponse.ok) throw new Error('현재 단어 콘텐츠를 불러오지 못했습니다.');
        if (!assignmentResponse.ok) throw new Error('저장된 단어 자료를 불러오지 못했습니다.');
        const [content, assignments] = await Promise.all([
          contentResponse.json() as Promise<LearningContent[]>,
          assignmentResponse.json() as Promise<Assignment[]>,
        ]);
        setCurrentContent(content);
        const savedWordAssignments = assignments.filter((assignment) =>
          assignment.materialType === 'word'
          && assignment.description === INITIAL_WORD_ASSIGNMENT_DESCRIPTION
          && assignment.level !== 'All',
        );
        setWordDrafts((current) => ({
          Beginner: parseSavedWordDraft(savedWordAssignments.find((item) => item.level === 'Beginner')) ?? {
            word: content.find((item) => item.level === 'Beginner')?.word ?? current.Beginner.word,
            meaning: content.find((item) => item.level === 'Beginner')?.shortMeaning ?? current.Beginner.meaning,
          },
          Intermediate: parseSavedWordDraft(savedWordAssignments.find((item) => item.level === 'Intermediate')) ?? {
            word: content.find((item) => item.level === 'Intermediate')?.word ?? current.Intermediate.word,
            meaning: content.find((item) => item.level === 'Intermediate')?.shortMeaning ?? current.Intermediate.meaning,
          },
          Advanced: parseSavedWordDraft(savedWordAssignments.find((item) => item.level === 'Advanced')) ?? {
            word: content.find((item) => item.level === 'Advanced')?.word ?? current.Advanced.word,
            meaning: content.find((item) => item.level === 'Advanced')?.shortMeaning ?? current.Advanced.meaning,
          },
        }));
        setFolderByLevel((current) => {
          const next = { ...current };
          for (const level of levelOrder) {
            const saved = savedWordAssignments.find((item) => item.level === level);
            if (saved?.folderId != null) next[level] = String(saved.folderId);
          }
          return next;
        });
        setSentenceDrafts((current) => ({
          Beginner: {
            english: content.find((item) => item.level === 'Beginner')?.exampleSentence ?? current.Beginner.english,
            korean: content.find((item) => item.level === 'Beginner')?.exampleKorean ?? current.Beginner.korean,
          },
          Intermediate: {
            english: content.find((item) => item.level === 'Intermediate')?.exampleSentence ?? current.Intermediate.english,
            korean: content.find((item) => item.level === 'Intermediate')?.exampleKorean ?? current.Intermediate.korean,
          },
          Advanced: {
            english: content.find((item) => item.level === 'Advanced')?.exampleSentence ?? current.Advanced.english,
            korean: content.find((item) => item.level === 'Advanced')?.exampleKorean ?? current.Advanced.korean,
          },
        }));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStatusMessage(error instanceof Error ? error.message : '콘텐츠를 불러오지 못했습니다.');
          setStatusIsError(true);
        }
      })
      .finally(() => setLoading(false));
    apiFetch('/api/admin/assignment-folders', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('단어 폴더 목록을 불러오지 못했습니다.');
        return response.json() as Promise<AssignmentFolder[]>;
      })
      .then((folders) => {
        const availableFolders = folders.filter((folder) =>
          folder.materialType === 'word' || folder.materialType === 'mixed',
        );
        setWordFolders(availableFolders);
        setFolderByLevel((current) => {
          const next = { ...current };
          for (const level of levelOrder) {
            if (next[level]) continue;
            const preferred = availableFolders.find((folder) => folder.level === level)
              ?? availableFolders.find((folder) => folder.level == null);
            if (preferred) next[level] = String(preferred.id);
          }
          return next;
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStatusMessage(error instanceof Error ? error.message : '단어 폴더를 불러오지 못했습니다.');
          setStatusIsError(true);
        }
      })
      .finally(() => setFoldersLoading(false));
    return () => controller.abort();
  }, []);

  const selectFile = async (level: LearningContentLevel, file: File | null) => {
    setStatusMessage('');
    setUploads((current) => ({
      ...current,
      [level]: { fileName: file?.name ?? '', preview: null, error: '' },
    }));
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setUploads((current) => ({
        ...current,
        [level]: { fileName: file.name, preview: null, error: 'CSV 파일은 1MB 이하로 선택해 주세요.' },
      }));
      return;
    }
    try {
      const preview = parseLearningContentCsv(await file.text(), level);
      setUploads((current) => ({ ...current, [level]: { fileName: file.name, preview, error: '' } }));
    } catch (error) {
      setUploads((current) => ({
        ...current,
        [level]: {
          fileName: file.name,
          preview: null,
          error: error instanceof Error ? error.message : 'CSV 파일을 읽지 못했습니다.',
        },
      }));
    }
  };

  const downloadTemplate = (level: LearningContentLevel) => {
    const saved = currentContent.find((item) => item.level === level);
    const defaults = getDefaultLearningContent(level);
    const file = new Blob(
      [createLearningContentCsv(saved?.word ?? defaults.word, saved?.shortMeaning ?? defaults.shortMeaning)],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${level.toLowerCase()}-word-content.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const updateWordDraft = (level: LearningContentLevel, field: keyof WordDraft, value: string) => {
    setWordDrafts((current) => ({
      ...current,
      [level]: { ...current[level], [field]: value },
    }));
    setUploads((current) => ({
      ...current,
      [level]: { fileName: '', preview: null, error: '' },
    }));
    if (fileInputRefs.current[level]) fileInputRefs.current[level]!.value = '';
    setStatusMessage('');
  };

  const saveLevel = async (level: LearningContentLevel) => {
    if (savingLevel || savingSentenceLevel) return;
    const draft = wordDrafts[level];
    let preview = uploads[level].preview;
    if (!preview?.length) {
      try {
        preview = parseManualWordDraft(draft, level);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '단어 입력 내용을 확인해 주세요.');
        setStatusIsError(true);
        return;
      }
    }
    if (!preview?.length) {
      setStatusMessage(`${levelLabels[level]} 과정의 단어와 뜻을 모두 입력하거나 CSV를 업로드해 주세요.`);
      setStatusIsError(true);
      return;
    }
    let folderId = folderByLevel[level];
    setSavingLevel(level);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      if (!folderId) {
        const availableFolder = wordFolders.find((folder) => folder.level === level)
          ?? wordFolders.find((folder) => folder.level == null);
        if (availableFolder) {
          folderId = String(availableFolder.id);
        } else {
          const createdFolder = await createDefaultWordFolder(level);
          folderId = String(createdFolder.id);
          setWordFolders((current) => [...current, createdFolder]);
        }
        setFolderByLevel((current) => ({ ...current, [level]: folderId }));
      }
      const todayWord = preview[0];
      const assignmentResponse = await apiFetch('/api/admin/assignments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${levelLabels[level]} 단어 자료 - ${todayWord.word}`.slice(0, 160),
          description: INITIAL_WORD_ASSIGNMENT_DESCRIPTION,
          materialType: 'word',
          folderId: Number(folderId),
          materialContent: preview.map((item) => `${item.word}||${item.shortMeaning}`).join('\n'),
          level,
          assigneeUserId: null,
          dueDate: null,
          resourcePath: null,
          resourceName: null,
          isPublished: false,
        }),
      });
      if (!assignmentResponse.ok) {
        const body = await assignmentResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '단어 폴더에 저장하지 못했습니다.');
      }

      const saved = currentContent.find((item) => item.level === level);
      const content: LearningContentInput = {
        ...getContentInput(saved, level),
        word: todayWord.word,
        shortMeaning: todayWord.shortMeaning,
        correctMeaning: todayWord.shortMeaning,
        quizOptions: makeQuizOptions(level, todayWord.word, todayWord.shortMeaning, currentContent),
      };
      const response = await apiFetch(`/api/admin/learning-content/${level}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '단어 콘텐츠를 저장하지 못했습니다.');
      }
      const updated = await response.json() as LearningContent;
      setCurrentContent((current) => [
        ...current.filter((item) => item.level !== level),
        updated,
      ].sort((left, right) => levelOrder.indexOf(left.level) - levelOrder.indexOf(right.level)));
      setWordDrafts((current) => ({
        ...current,
        [level]: {
          word: preview.map((item) => item.word).join('\n'),
          meaning: preview.map((item) => item.shortMeaning).join('\n'),
        },
      }));
      window.dispatchEvent(new CustomEvent(LEARNING_CONTENT_UPDATED_EVENT, { detail: [updated] }));
      setUploads((current) => ({ ...current, [level]: { fileName: '', preview: null, error: '' } }));
      if (fileInputRefs.current[level]) fileInputRefs.current[level]!.value = '';
      const selectedFolder = wordFolders.find((folder) => String(folder.id) === folderId);
      setStatusMessage(`${preview.length}개 단어를 ${levelLabels[level]} 과정 "${selectedFolder?.name ?? '선택한 폴더'}" 폴더에 저장했습니다. 초기화면 카드에는 첫 단어가 표시되고, 폴더 자료는 초안으로 보관됩니다.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
      setStatusIsError(true);
    } finally {
      setSavingLevel(null);
    }
  };

  const saveSentence = async (level: LearningContentLevel) => {
    const draft = sentenceDrafts[level];
    if (savingLevel || savingSentenceLevel) return;
    if (!draft.english.trim() || !draft.korean.trim()) {
      setStatusMessage(`${levelLabels[level]} 과정의 영어 문장과 해석을 모두 입력해 주세요.`);
      setStatusIsError(true);
      return;
    }
    setSavingSentenceLevel(level);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const saved = currentContent.find((item) => item.level === level);
      const response = await apiFetch(`/api/admin/learning-content/${level}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getContentInput(saved, level),
          exampleSentence: draft.english.trim(),
          exampleKorean: draft.korean.trim(),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '문장 콘텐츠를 저장하지 못했습니다.');
      }
      const updated = await response.json() as LearningContent;
      setCurrentContent((current) => [
        ...current.filter((item) => item.level !== level),
        updated,
      ].sort((left, right) => levelOrder.indexOf(left.level) - levelOrder.indexOf(right.level)));
      window.dispatchEvent(new CustomEvent(LEARNING_CONTENT_UPDATED_EVENT, { detail: [updated] }));
      setStatusMessage(`${levelLabels[level]} 과정 문장과 해석을 저장했습니다.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '문장 저장 중 오류가 발생했습니다.');
      setStatusIsError(true);
    } finally {
      setSavingSentenceLevel(null);
    }
  };

  return (
    <section className="rise-in rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-9">
      <div>
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
          <FileSpreadsheet size={14} /> Home word settings
        </p>
        <h2 className="text-2xl font-bold tracking-[-.04em]">초기화면 단어 콘텐츠 설정</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          초급·중급·고급 과정의 초기화면 단어 카드를 설정합니다. 아래 순서대로 입력하고 저장하세요.
        </p>
      </div>

      <div className="mt-5 rounded-2xl border border-[hsl(var(--accent)/.2)] bg-[hsl(var(--secondary)/.35)] p-4 sm:p-5" data-testid="panel-word-settings-help">
        <h3 className="text-sm font-bold">사용 방법</h3>
        <ol className="mt-3 grid gap-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))] sm:grid-cols-2">
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-white">1</span>
            <span><strong className="text-[hsl(var(--foreground))]">과정을 고르고 단어와 뜻을 입력하세요.</strong> 각각 한 줄에 하나씩, 순서와 줄 수를 똑같이 맞춰 주세요. 예: serendipity ↔ 뜻밖의 행운.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-white">2</span>
            <span><strong className="text-[hsl(var(--foreground))]">직접 입력 또는 CSV 중 하나를 사용하세요.</strong> CSV는 ‘양식 받기’로 만든 뒤 단어·뜻 두 열을 채워 업로드하고 미리보기를 확인하세요. 최대 200개까지 가능합니다.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-white">3</span>
            <span><strong className="text-[hsl(var(--foreground))]">필요하면 폴더를 선택하고 아래의 저장 버튼을 누르세요.</strong> 폴더를 비워두면 과정 폴더를 자동으로 선택하거나 만듭니다.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-[10px] font-bold text-white">4</span>
            <span><strong className="text-[hsl(var(--foreground))]">저장 결과:</strong> 초기화면 카드에는 첫 단어가 표시되고, 전체 단어 목록은 선택한 자료 폴더에 초안으로 보관됩니다.</span>
          </li>
        </ol>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {levelOrder.map((level) => {
          const saved = currentContent.find((item) => item.level === level);
          const upload = uploads[level];
          const saving = savingLevel === level;
          return (
            <article key={level} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.6)] p-4">
              <h3 className="text-sm font-bold">{levelLabels[level]} 과정</h3>
              {loading ? (
                <LoaderCircle className="mt-3 animate-spin text-[hsl(var(--accent))]" size={16} />
              ) : (
                <div className="mt-3 rounded-xl bg-[hsl(var(--muted)/.55)] p-3">
                  <p className="truncate text-sm font-bold">{saved?.word ?? getDefaultLearningContent(level).word}</p>
                  <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {saved?.shortMeaning ?? getDefaultLearningContent(level).shortMeaning}
                  </p>
                </div>
              )}
              <label className="mt-4 grid gap-2 text-xs font-bold">
                영어 단어 · 한 줄에 하나씩
                <textarea
                  value={wordDrafts[level].word}
                  onChange={(event) => updateWordDraft(level, 'word', event.target.value)}
                  maxLength={20000}
                  rows={4}
                  disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  placeholder={'serendipity\ncurious'}
                  className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-xs font-normal leading-relaxed"
                  data-testid={`input-word-${level.toLowerCase()}`}
                />
              </label>
              <label className="mt-3 grid gap-2 text-xs font-bold">
                한글 뜻 · 단어와 같은 줄 순서로 입력
                <textarea
                  value={wordDrafts[level].meaning}
                  onChange={(event) => updateWordDraft(level, 'meaning', event.target.value)}
                  maxLength={20000}
                  rows={4}
                  disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  placeholder={'뜻밖의 행운\n호기심 많은'}
                  className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-xs font-normal leading-relaxed"
                  data-testid={`input-meaning-${level.toLowerCase()}`}
                />
              </label>
              <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                예: 첫 줄 단어 ↔ 첫 줄 뜻 · 영어와 뜻의 줄 수를 같게 맞춰 주세요.
              </p>
              <label className="mt-4 grid gap-2 text-xs font-bold">
                {upload.fileName || '단어 CSV 업로드'}
                <input
                  ref={(element) => { fileInputRefs.current[level] = element; }}
                  type="file"
                  accept=".csv,.txt"
                  disabled={loading || foldersLoading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  onChange={(event) => void selectFile(level, event.currentTarget.files?.[0] ?? null)}
                  className="block w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-xs font-normal"
                  data-testid={`input-word-csv-${level.toLowerCase()}`}
                />
              </label>
                  <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">CSV 열: 단어, 뜻 · 과정당 최대 200개 · 1MB 이하</p>
              <label className="mt-3 grid gap-2 text-xs font-bold">
                저장할 단어 폴더
                <select
                  value={folderByLevel[level]}
                  onChange={(event) => setFolderByLevel((current) => ({ ...current, [level]: event.target.value }))}
                  disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-xs font-normal"
                  data-testid={`select-word-folder-${level.toLowerCase()}`}
                >
                  <option value="">폴더 선택</option>
                  {wordFolders.filter((folder) => folder.level == null || folder.level === level).map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {getWordFolderPath(folder.id, wordFolders)}
                    </option>
                  ))}
                </select>
              </label>
              {!foldersLoading && wordFolders.length === 0 && (
                <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  저장할 폴더가 없으면 이 과정의 단어 폴더를 자동으로 만듭니다.
                </p>
              )}
              {upload.error && <p role="alert" className="mt-3 text-xs font-semibold text-[hsl(var(--destructive))]">{upload.error}</p>}
              {upload.preview && (
                <div className="mt-3 rounded-xl border border-[hsl(var(--border))] p-3">
                  <p className="text-[10px] font-bold text-[hsl(var(--accent))]">저장 미리보기 · {upload.preview.length}개</p>
                  <div className="mt-2 max-h-36 divide-y divide-[hsl(var(--border))] overflow-auto">
                    {upload.preview.map((item, index) => (
                      <div key={`${item.word}-${index}`} className="grid grid-cols-2 gap-2 py-2 text-xs">
                        <span className="truncate font-bold">{item.word}</span>
                        <span className="truncate text-[hsl(var(--muted-foreground))]">{item.shortMeaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadTemplate(level)}
                  disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-xs font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-50"
                >
                  <Download size={14} /> 양식 받기
                </button>
                <button
                  type="button"
                  onClick={() => void saveLevel(level)}
                  disabled={loading || foldersLoading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45"
                  data-testid={`button-save-word-${level.toLowerCase()}`}
                >
                  {saving ? <LoaderCircle className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {saving ? '저장 중' : `${upload.preview?.length ?? getManualWordDraftCount(wordDrafts[level])}개 저장`}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-10 border-t border-[hsl(var(--border))] pt-8">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <Languages size={14} /> Course sentence settings
          </p>
          <h3 className="text-xl font-bold tracking-[-.03em]">과정별 영어 문장과 해석</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            초급·중급·고급 문장과 해석을 각각 저장합니다. 저장한 문장은 초기화면 단어 카드의 예문에도 반영됩니다.
          </p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {levelOrder.map((level) => {
            const draft = sentenceDrafts[level];
            const saving = savingSentenceLevel === level;
            return (
              <article key={`sentence-${level}`} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.6)] p-4">
                <h4 className="mb-4 text-sm font-bold">{levelLabels[level]} 과정</h4>
                <label className="grid gap-2 text-xs font-bold">
                  영어 문장
                  <textarea
                    value={draft.english}
                    onChange={(event) => setSentenceDrafts((current) => ({
                      ...current,
                      [level]: { ...current[level], english: event.target.value },
                    }))}
                    maxLength={2000}
                    rows={3}
                    disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                    placeholder="예: I take a short walk every morning."
                    className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-normal leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
                    data-testid={`textarea-sentence-${level.toLowerCase()}`}
                  />
                </label>
                <label className="mt-3 grid gap-2 text-xs font-bold">
                  한국어 해석
                  <textarea
                    value={draft.korean}
                    onChange={(event) => setSentenceDrafts((current) => ({
                      ...current,
                      [level]: { ...current[level], korean: event.target.value },
                    }))}
                    maxLength={2000}
                    rows={3}
                    disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                    placeholder="예: 나는 매일 아침 짧게 산책해요."
                    className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-normal leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
                    data-testid={`textarea-sentence-korean-${level.toLowerCase()}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void saveSentence(level)}
                  disabled={loading || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45"
                  data-testid={`button-save-sentence-${level.toLowerCase()}`}
                >
                  {saving ? <LoaderCircle className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {saving ? '저장 중' : '문장 저장'}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      {statusMessage && (
        <div
          role={statusIsError ? 'alert' : 'status'}
          className={`mt-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            statusIsError
              ? 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'
              : 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
          }`}
        >
          {statusIsError ? <UploadCloud size={17} /> : <CheckCircle2 size={17} />}
          <span>{statusMessage}</span>
        </div>
      )}
    </section>
  );
}
