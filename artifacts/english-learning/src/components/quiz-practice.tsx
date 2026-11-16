import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardList, RotateCcw, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { apiFetch } from '@/lib/api-fetch';

type PublicQuestion = { id: string; text: string; choices: string[] };
type QuizResult = {
  id: string;
  picked: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
};
type GradedQuiz = { score: number; total: number; results: QuizResult[]; saved: boolean };

export default function QuizPractice() {
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [version, setVersion] = useState('');
  const [name, setName] = useState('');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [graded, setGraded] = useState<GradedQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiFetch('/api/quiz', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as {
          questions?: PublicQuestion[];
          version?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || '문제를 불러오지 못했어요.');
        if (!Array.isArray(data.questions) || !data.questions.length || !data.version) {
          throw new Error('등록된 문제가 없거나 문제 정보를 확인하지 못했어요.');
        }
        setQuestions(data.questions);
        setVersion(data.version);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : '문제를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const allAnswered = questions.length > 0
    && questions.every((question) => answers[question.id] !== undefined);

  async function submitQuiz() {
    setError('');
    if (!name.trim()) {
      setError('이름을 입력해 주세요.');
      return;
    }
    if (!allAnswered) {
      setError('모든 문제에 답을 골라 주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch('/api/quiz/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          answers,
          questionIds: questions.map((question) => question.id),
          version,
        }),
      });
      const data = await response.json() as GradedQuiz & { error?: string };
      if (!response.ok) throw new Error(data.error || '채점에 실패했어요.');
      setGraded(data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '채점 중 오류가 발생했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  function retry() {
    setAnswers({});
    setGraded(null);
    setError('');
  }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <Sparkles size={14} /> Quick quiz
          </p>
          <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">문제 풀기<span className="text-[hsl(var(--accent))]">.</span></h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">문제를 풀고 제출하면 바로 채점 결과를 확인할 수 있어요.</p>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">
          홈으로 <ArrowRight size={14} />
        </Link>
      </section>

      {graded && (
        <section className="rounded-[24px] border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--secondary)/.55)] p-5" aria-live="polite">
          <div className="flex items-start gap-4">
            <CheckCircle2 size={26} className="shrink-0 text-[hsl(var(--primary))]" />
            <div>
              <p className="font-bold">{name}님 점수: {graded.score} / {graded.total}</p>
              {!graded.saved && <p className="mt-2 text-xs text-[hsl(var(--accent))]">점수 저장이 안 되었을 수 있어요. 선생님께 알려 주세요.</p>}
            </div>
          </div>
          <button type="button" onClick={retry} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-sm font-bold">
            <RotateCcw size={15} /> 다시 풀기
          </button>
        </section>
      )}

      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <label htmlFor="quiz-name" className="block text-sm font-bold">이름</label>
        <input
          id="quiz-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!!graded}
          maxLength={30}
          autoComplete="name"
          className="mt-2 w-full max-w-sm rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-4 py-3 text-sm"
          placeholder="이름을 입력해 주세요"
        />
      </section>

      {loading && <p role="status" className="rounded-xl bg-[hsl(var(--card))] p-5 text-sm">문제를 불러오는 중...</p>}
      {!loading && questions.map((question, index) => {
        const result = graded?.results.find((item) => item.id === question.id);
        return (
          <section key={question.id} className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <h2 className="mb-4 font-bold">{index + 1}. {question.text}</h2>
            <div className="space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                const isCorrect = result?.correctIndex === choiceIndex;
                const isWrong = result?.picked === choiceIndex && !result.correct;
                const stateClass = isCorrect
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : isWrong
                    ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/30'
                    : answers[question.id] === choiceIndex
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary)/.5)]'
                      : 'border-[hsl(var(--border))]';
                return (
                  <label key={choiceIndex} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${stateClass} ${graded ? 'cursor-default' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={answers[question.id] === choiceIndex}
                      disabled={!!graded}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))}
                    />
                    {choice}
                  </label>
                );
              })}
            </div>
            {result && <p className="mt-4 text-sm">{result.correct ? '정답이에요!' : '아쉬워요.'} {result.explanation}</p>}
          </section>
        );
      })}

      {error && <p role="alert" className="rounded-xl bg-[hsl(var(--destructive)/.08)] p-4 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}
      {!graded && (
        <button
          type="button"
          onClick={() => void submitQuiz()}
          disabled={loading || submitting || !questions.length}
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          <ClipboardList size={17} /> {submitting ? '채점 중...' : '제출하고 채점하기'}
        </button>
      )}
    </div>
  );
}
