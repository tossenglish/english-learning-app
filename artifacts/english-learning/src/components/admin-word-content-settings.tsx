import { useEffect, useRef, useState } from 'react';
import type {
  LearningContent,
  LearningContentBatchItem,
  LearningContentLevel,
  LearningContentInput,
} from '@workspace/api-client-react';
import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, UploadCloud } from 'lucide-react';
import {
  createLearningContentCsv,
  parseLearningContentCsv,
  type ParsedLearningContentCsvItem,
} from '@/lib/learning-content-csv';
import { getDefaultLearningContent, LEARNING_CONTENT_UPDATED_EVENT } from '@/lib/learning-content';

const levelOrder: LearningContentLevel[] = ['Beginner', 'Intermediate', 'Advanced'];
const levelLabels: Record<LearningContentLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
};
const maxFileSize = 1024 * 1024;

function getContentInput(saved: LearningContent | undefined, level: LearningContentLevel): LearningContentInput {
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
  correctMeaning: string,
  uploadedItems: ParsedLearningContentCsvItem[],
  currentContent: LearningContent[],
) {
  const saved = currentContent.find((item) => item.level === level);
  if (
    saved?.shortMeaning === correctMeaning &&
    saved.correctMeaning === correctMeaning &&
    saved.quizOptions.includes(correctMeaning)
  ) {
    return saved.quizOptions;
  }

  const defaults = getDefaultLearningContent(level);
  const candidates = [
    ...uploadedItems.filter((item) => item.level !== level).map((item) => item.content.shortMeaning),
    ...currentContent.filter((item) => item.level !== level).map((item) => item.shortMeaning),
    ...currentContent.flatMap((item) =>
      item.quizOptions.filter((option) => option !== item.correctMeaning),
    ),
    ...defaults.quizOptions.filter((option) => option !== defaults.correctMeaning),
  ];
  const distractors = [...new Set(
    candidates
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value !== correctMeaning),
  )];
  if (distractors.length === 0) distractors.push('다른 뜻');
  if (distractors.length === 1) {
    distractors.push(distractors[0] === '다른 뜻' ? '비슷한 표현' : '다른 뜻');
  }

  const options = distractors.slice(0, 3);
  const correctIndex = [...`${level}:${word}`].reduce(
    (sum, character) => sum + character.charCodeAt(0),
    0,
  ) % (options.length + 1);
  options.splice(correctIndex, 0, correctMeaning);
  return options;
}

export default function AdminWordContentSettings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentContent, setCurrentContent] = useState<LearningContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [preview, setPreview] = useState<ParsedLearningContentCsvItem[]>([]);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/learning-content', {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('현재 단어 콘텐츠를 불러오지 못했습니다.');
        return response.json() as Promise<LearningContent[]>;
      })
      .then(setCurrentContent)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setStatusMessage(error instanceof Error ? error.message : '콘텐츠를 불러오지 못했습니다.');
          setStatusIsError(true);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const selectFile = async (file: File | null) => {
    setSelectedFileName(file?.name ?? '');
    setPreview([]);
    setParseError('');
    setStatusMessage('');
    if (!file) return;
    if (file.size > maxFileSize) {
      setParseError('CSV 파일은 1MB 이하로 선택해 주세요.');
      return;
    }

    try {
      setPreview(parseLearningContentCsv(await file.text()));
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'CSV 파일을 읽지 못했습니다.');
    }
  };

  const downloadTemplate = () => {
    const currentByLevel = new Map(currentContent.map((item) => [item.level, item]));
    const items = levelOrder.map((level) => {
      const saved = currentByLevel.get(level);
      return {
        level,
        content: getContentInput(saved, level),
      };
    });
    const file = new Blob([createLearningContentCsv(items)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'home-word-content-template.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const save = async () => {
    if (preview.length === 0 || saving) return;
    setSaving(true);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const currentByLevel = new Map(currentContent.map((item) => [item.level, item]));
      const items: LearningContentBatchItem[] = preview.map(({ level, content }) => ({
        level,
        content: {
          ...getContentInput(currentByLevel.get(level), level),
          ...content,
          quizOptions: makeQuizOptions(
            level,
            content.word,
            content.shortMeaning,
            preview,
            currentContent,
          ),
          correctMeaning: content.shortMeaning,
        },
      }));
      const response = await fetch('/api/admin/learning-content', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '단어 콘텐츠를 저장하지 못했습니다.');
      }

      const saved = await response.json() as LearningContent[];
      setCurrentContent((current) => {
        const byLevel = new Map(current.map((item) => [item.level, item]));
        saved.forEach((item) => byLevel.set(item.level, item));
        return levelOrder.flatMap((level) => {
          const item = byLevel.get(level);
          return item ? [item] : [];
        });
      });
      window.dispatchEvent(new CustomEvent(LEARNING_CONTENT_UPDATED_EVENT, { detail: saved }));
      setStatusMessage(`${saved.length}개 레벨의 초기화면 단어 콘텐츠를 저장했습니다.`);
      setSelectedFileName('');
      setPreview([]);
      setParseError('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
      setStatusIsError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rise-in rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-9">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <FileSpreadsheet size={14} /> Home word settings
          </p>
          <h2 className="text-2xl font-bold tracking-[-.04em]">초기화면 단어 콘텐츠 설정</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            레벨별 오늘의 단어와 학습 카드 내용을 CSV 한 파일로 관리합니다. 업로드한 레벨만 교체되고, 파일에서 빠진 레벨은 그대로 유지됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          disabled={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm font-bold transition-colors hover:bg-[hsl(var(--muted))] disabled:cursor-wait disabled:opacity-50"
        >
          <Download size={16} /> 현재 콘텐츠 CSV 받기
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {levelOrder.map((level) => {
          const saved = currentContent.find((item) => item.level === level);
          return (
            <div key={level} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.6)] p-4">
              <p className="text-xs font-bold text-[hsl(var(--muted-foreground))]">{levelLabels[level]} 과정</p>
              {loading ? (
                <LoaderCircle className="mt-3 animate-spin text-[hsl(var(--accent))]" size={16} />
              ) : (
                <>
                  <p className="mt-2 truncate text-sm font-bold">{saved?.word ?? getDefaultLearningContent(level).word}</p>
                  <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                    {saved?.shortMeaning ?? getDefaultLearningContent(level).shortMeaning}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold">CSV 파일 선택</p>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              레벨별 한 행씩, 최대 3행까지 올릴 수 있어요. 퀴즈 정답은 뜻으로 자동 설정하고 보기는 다른 레벨의 뜻과 기본 보기로 자동 구성합니다. 발음·품사 등 나머지 학습 상세 정보는 기존 값을 유지합니다.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-bold hover:border-[hsl(var(--accent)/.6)]">
            <UploadCloud size={16} />
            {selectedFileName || 'CSV 선택'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="sr-only"
              disabled={saving}
              onChange={(event) => void selectFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {parseError && (
          <p role="alert" className="mt-4 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]">
            {parseError}
          </p>
        )}

        {preview.length > 0 && (
          <div className="mt-5 overflow-hidden rounded-xl border border-[hsl(var(--border))]">
            <div className="flex items-center justify-between bg-[hsl(var(--muted)/.55)] px-4 py-3">
              <p className="text-xs font-bold">저장 전 미리보기</p>
              <span className="font-mono text-[10px] font-bold text-[hsl(var(--muted-foreground))]">{preview.length}개 레벨</span>
            </div>
            <div className="divide-y divide-[hsl(var(--border))]">
              {preview.map(({ level, content }) => (
                <div key={level} className="grid gap-1 px-4 py-3 sm:grid-cols-[90px_1fr_1fr] sm:items-center">
                  <span className="text-xs font-bold text-[hsl(var(--accent))]">{levelLabels[level]} 과정</span>
                  <span className="truncate text-sm font-bold">{content.word}</span>
                  <span className="truncate text-xs text-[hsl(var(--muted-foreground))]">{content.shortMeaning}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          파일 열은 레벨, 단어, 뜻, 예문, 예문 해석 순서입니다.
        </p>
        <button
          type="button"
          onClick={() => void save()}
          disabled={preview.length === 0 || Boolean(parseError) || saving}
          className="button-pop inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {saving ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
          {saving ? '저장 중...' : `${preview.length || 0}개 레벨 콘텐츠 저장`}
        </button>
      </div>
    </section>
  );
}
