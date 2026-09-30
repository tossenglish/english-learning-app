import { useEffect, useState } from 'react';
import type {
  LearningContent,
  LearningContentInput,
  LearningContentLevel,
} from '@workspace/api-client-react';
import { Check, LoaderCircle, Pencil } from 'lucide-react';
import { getDefaultLearningContent, type LearnContent } from '@/lib/learning-content';

const levels: Array<{ value: LearningContentLevel; label: string }> = [
  { value: 'Beginner', label: '초급 과정' },
  { value: 'Intermediate', label: '중급 과정' },
  { value: 'Advanced', label: '고급 과정' },
];

const fieldClassName =
  'rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:border-[hsl(var(--accent))]';

function contentToInput(content: LearningContent): LearnContent {
  return {
    word: content.word,
    pronunciation: '',
    partOfSpeech: '',
    shortMeaning: content.shortMeaning,
    meaningDetail: content.meaningDetail,
    englishDefinition: content.englishDefinition,
    exampleSentence: content.exampleSentence,
    exampleKorean: content.exampleKorean,
    quizOptions: content.quizOptions,
    correctMeaning: content.correctMeaning,
    tip: content.tip,
  };
}

function createDefaultDrafts(): Record<LearningContentLevel, LearnContent> {
  return {
    Beginner: { ...getDefaultLearningContent('Beginner') },
    Intermediate: { ...getDefaultLearningContent('Intermediate') },
    Advanced: { ...getDefaultLearningContent('Advanced') },
  };
}

export default function AdminLearningContent() {
  const [drafts, setDrafts] = useState<Record<LearningContentLevel, LearnContent>>(createDefaultDrafts);
  const [level, setLevel] = useState<LearningContentLevel>('Intermediate');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/admin/learning-content', {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('배우기 콘텐츠를 불러오지 못했습니다.');
        const content = await response.json() as LearningContent[];
        setDrafts((current) => {
          const next = { ...current };
          content.forEach((item) => {
            next[item.level] = contentToInput(item);
          });
          return next;
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '배우기 콘텐츠 오류');
      } finally {
        setLoading(false);
      }
    };

    void loadContent();
  }, []);

  const draft = drafts[level];
  const updateDraft = <K extends keyof LearnContent>(field: K, value: LearnContent[K]) => {
    setDrafts((current) => ({
      ...current,
      [level]: { ...current[level], [field]: value },
    }));
    setMessage('');
    setError('');
  };

  const saveContent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const quizOptions = draft.quizOptions.map((option) => option.trim()).filter(Boolean);
    if (quizOptions.length < 2) {
      setError('퀴즈 보기는 두 개 이상 입력해 주세요.');
      return;
    }

    const payload: LearningContentInput = {
      ...draft,
      word: draft.word.trim(),
      pronunciation: '',
      partOfSpeech: '',
      shortMeaning: draft.shortMeaning.trim(),
      meaningDetail: draft.meaningDetail.trim(),
      englishDefinition: draft.englishDefinition.trim(),
      exampleSentence: draft.exampleSentence.trim(),
      exampleKorean: draft.exampleKorean.trim(),
      quizOptions,
      correctMeaning: quizOptions.includes(draft.correctMeaning)
        ? draft.correctMeaning
        : quizOptions[0],
      tip: draft.tip.trim(),
    };

    if (!payload.word || !payload.shortMeaning) {
      setError('단어와 대표 뜻은 반드시 입력해 주세요.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/admin/learning-content/${level}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '배우기 콘텐츠를 저장하지 못했습니다.');
      }

      const saved = await response.json() as LearningContent;
      setDrafts((current) => ({ ...current, [level]: contentToInput(saved) }));
      setMessage('이 과정의 배우기 콘텐츠를 저장했습니다.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '배우기 콘텐츠 저장 오류');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-9">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <Pencil size={20} />
        </span>
        <div>
          <h2 className="text-xl font-bold">배우기 콘텐츠 직접 입력</h2>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            과정별 단어, 뜻, 예문, 퀴즈를 저장하면 회원의 배우기 화면에 바로 반영돼요.
          </p>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="배우기 콘텐츠 과정 선택">
        {levels.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={level === value}
            data-testid={`button-learning-content-${value.toLowerCase()}`}
            onClick={() => {
              setLevel(value);
              setMessage('');
              setError('');
            }}
            className={`rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
              level === value
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent)/.6)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoaderCircle className="mx-auto mt-8 animate-spin text-[hsl(var(--accent))]" size={24} />
      ) : (
        <form onSubmit={saveContent} className="mt-7 grid gap-5">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-xs font-bold">오늘의 단어</span>
              <input value={draft.word} onChange={(event) => updateDraft('word', event.target.value)} maxLength={120} required className={fieldClassName} />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-bold">대표 뜻</span>
            <input value={draft.shortMeaning} onChange={(event) => updateDraft('shortMeaning', event.target.value)} maxLength={200} required className={fieldClassName} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-bold">카드 앞면 설명</span>
              <textarea value={draft.meaningDetail} onChange={(event) => updateDraft('meaningDetail', event.target.value)} maxLength={1000} rows={3} className={`${fieldClassName} resize-y leading-relaxed`} />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">영어 정의</span>
              <textarea value={draft.englishDefinition} onChange={(event) => updateDraft('englishDefinition', event.target.value)} maxLength={1000} rows={3} className={`${fieldClassName} resize-y leading-relaxed`} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-bold">예문</span>
              <textarea value={draft.exampleSentence} onChange={(event) => updateDraft('exampleSentence', event.target.value)} maxLength={1000} rows={3} className={`${fieldClassName} resize-y leading-relaxed`} />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">예문 뜻</span>
              <textarea value={draft.exampleKorean} onChange={(event) => updateDraft('exampleKorean', event.target.value)} maxLength={1000} rows={3} className={`${fieldClassName} resize-y leading-relaxed`} />
            </label>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 sm:p-5">
            <div>
              <span className="text-xs font-bold">의미 퀴즈 보기</span>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">보기는 두 개 이상 입력하고 정답을 선택해 주세요.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <input
                  key={index}
                  value={draft.quizOptions[index] ?? ''}
                  onChange={(event) => {
                    const quizOptions = [...draft.quizOptions];
                    quizOptions[index] = event.target.value;
                    updateDraft('quizOptions', quizOptions);
                  }}
                  maxLength={200}
                  placeholder={`보기 ${index + 1}`}
                  className={fieldClassName}
                />
              ))}
            </div>
            <label className="grid gap-2 sm:max-w-sm">
              <span className="text-xs font-bold">정답</span>
              <select
                value={draft.correctMeaning}
                onChange={(event) => updateDraft('correctMeaning', event.target.value)}
                className={fieldClassName}
              >
                <option value="">정답을 선택하세요</option>
                {draft.quizOptions.filter(Boolean).map((option, index) => (
                  <option key={`${option}-${index}`} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-bold">학습 팁</span>
            <textarea value={draft.tip} onChange={(event) => updateDraft('tip', event.target.value)} maxLength={1000} rows={3} className={`${fieldClassName} resize-y leading-relaxed`} />
          </label>

          {error && <p className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}
          {message && <p className="flex items-center gap-2 rounded-xl bg-[hsl(var(--secondary))] px-4 py-3 text-sm font-semibold text-[hsl(var(--secondary-foreground))]"><Check size={17} /> {message}</p>}

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="button-pop inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45">
              {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Pencil size={17} />}
              {saving ? '저장 중...' : `${levels.find((item) => item.value === level)?.label} 콘텐츠 저장`}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}