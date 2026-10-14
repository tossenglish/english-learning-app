import { useEffect, useRef, useState } from 'react';
import type {
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

const emptyUploads = (): Record<LearningContentLevel, UploadState> => ({
  Beginner: { fileName: '', preview: null, error: '' },
  Intermediate: { fileName: '', preview: null, error: '' },
  Advanced: { fileName: '', preview: null, error: '' },
});

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
  const [uploads, setUploads] = useState<Record<LearningContentLevel, UploadState>>(emptyUploads);
  const [loading, setLoading] = useState(true);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [savingLevel, setSavingLevel] = useState<LearningContentLevel | null>(null);
  const [savingSentenceLevel, setSavingSentenceLevel] = useState<LearningContentLevel | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/admin/learning-content', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('현재 단어 콘텐츠를 불러오지 못했습니다.');
        return response.json() as Promise<LearningContent[]>;
      })
      .then((content) => {
        setCurrentContent(content);
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
      .then((folders) => setWordFolders(folders.filter((folder) =>
        folder.materialType === 'word' || folder.materialType === 'mixed',
      )))
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

  const saveLevel = async (level: LearningContentLevel) => {
    const preview = uploads[level].preview;
    if (!preview?.length || savingLevel || savingSentenceLevel) return;
    const folderId = folderByLevel[level];
    if (!folderId) {
      setStatusMessage(`${levelLabels[level]} 과정에서 저장할 단어 폴더를 선택해 주세요.`);
      setStatusIsError(true);
      return;
    }
    setSavingLevel(level);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const todayWord = preview[0];
      const assignmentResponse = await apiFetch('/api/admin/assignments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${levelLabels[level]} 단어 자료 - ${todayWord.word}`.slice(0, 160),
          description: '초기화면 단어 설정에서 저장한 단어 자료',
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
      window.dispatchEvent(new CustomEvent(LEARNING_CONTENT_UPDATED_EVENT, { detail: [updated] }));
      setUploads((current) => ({ ...current, [level]: { fileName: '', preview: null, error: '' } }));
      if (fileInputRefs.current[level]) fileInputRefs.current[level]!.value = '';
      const selectedFolder = wordFolders.find((folder) => String(folder.id) === folderId);
      setStatusMessage(`${preview.length}개 단어를 ${levelLabels[level]} 과정 "${selectedFolder?.name ?? '선택한 폴더'}" 폴더에 저장했습니다. 과제는 초안으로 보관됩니다.`);
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
          초급·중급·고급 과정마다 저장할 단어 폴더를 선택하세요. 각 CSV에는 단어와 뜻 두 열만 넣고, 과정당 최대 200개까지 등록할 수 있습니다.
        </p>
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
                  과제 관리에서 단어 폴더를 먼저 만들어 주세요.
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
                  disabled={!upload.preview?.length || !folderByLevel[level] || Boolean(savingLevel) || Boolean(savingSentenceLevel)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45"
                  data-testid={`button-save-word-${level.toLowerCase()}`}
                >
                  {saving ? <LoaderCircle className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                  {saving ? '저장 중' : `${upload.preview?.length ?? 0}개 저장`}
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
