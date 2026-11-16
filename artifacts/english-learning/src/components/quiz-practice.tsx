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
        if (!response.ok) throw new Error('문제를 불러오지 못했어요.');
        const data = await response.json() as { questions?: PublicQuestion[] };
        if (!Array.isArray(data.questions) || data.questions.length === 0) {
          throw new Error('등록된 문제가 없어요.');
        }
        setQuestions(data.questions);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(cause instanceof Error ? cause.message : '문제를 불러오지 못했어요.');
        }
      })
      .finally(() => setLoading(false));
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
        body: JSON.stringify({ name, answers }),
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

  const resultFor = (id: string) => graded?.results.find((result) => result.id === id);

  return (
    <div className="mx-auto max-w-[820px] space-y-7">
      <section className="rise-in flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <Sparkles size={14} /> Quick quiz
          </p>
          <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">새 문제풀이<span className="text-[hsl(var(--accent))]">.</span></h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">문제를 풀고 제출하면 바로 채점 결과를 확인할 수 있어요.</p>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">
          홈으로 <ArrowRight size={14} />
        </Link>
      </section>

      {graded && (
        <section className="rise-in rounded-[24px] border border-[hsl(var(--primary)/.2)] bg-[hsl(var(--secondary)/.55)] p-5 sm:p-7" aria-live="polite">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
              <CheckCircle2 size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[hsl(var(--secondary-foreground))]">풀이 완료</p>
              <h2 className="mt-1 text-xl font-bold">{name}님, {graded.total}문제 중 {graded.score}문제 정답이에요!</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">점수 {graded.score} / {graded.total}</p>
              {!graded.saved && (
                <p className="mt-3 text-xs font-semibold text-[hsl(var(--accent))]">
                  채점은 완료됐지만 점수를 구글 시트에 저장하지 못했어요. 선생님께 알려 주세요.
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={retry} className="button-pop mt-5 inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm font-bold">
            <RotateCcw size={15} /> 다시 풀기
          </button>
        </section>
      )}

      <section className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] sm:p-7">
        <label htmlFor="quiz-name" className="block text-sm font-bold">이름</label>
        <input
          id="quiz-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!!graded}
          maxLength={30}
          autoComplete="name"
          className="mt-2 w-full max-w-sm rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:border-[hsl(var(--ring))] disabled:opacity-70"
          placeholder="이름을 입력해 주세요"
        />
      </section>

      {loading ? (
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]" role="status">문제를 불러오는 중...</div>
      ) : questions.map((question, index) => {
        const result = resultFor(question.id);
        return (
          <section key={question.id} className="rise-in rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-[var(--shadow-sm)] sm:p-7">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-sm font-extrabold text-[hsl(var(--secondary-foreground))]">{index + 1}</span>
              <h2 className="text-base font-bold leading-relaxed sm:text-lg">{question.text}</h2>
            </div>
            <div className="space-y-2">
              {question.choices.map((choice, choiceIndex) => {
                const selected = answers[question.id] === choiceIndex;
                const correctAnswer = result?.correctIndex === choiceIndex;
                const wrongSelection = result?.picked === choiceIndex && !result.correct;
                const colorClass = correctAnswer
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'
                  : wrongSelection
                    ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100'
                    : selected
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--secondary)/.55)]'
                      : 'border-[hsl(var(--border))] hover:border-[hsl(var(--accent)/.55)] hover:bg-[hsl(var(--muted)/.5)]';
                return (
                  <label key={choiceIndex} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${colorClass} ${graded ? 'cursor-default' : ''}`}>
                    <input
                      type="radio"
                      name={question.id}
                      checked={selected}
                      disabled={!!graded}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: choiceIndex }))}
                      className="accent-[hsl(var(--primary))]"
                    />
                    <span>{choice}</span>
                  </label>
                );
              })}
            </div>
            {result && (
              <p className="mt-4 text-sm leading-relaxed" aria-live="polite">
                <span className={`font-bold ${result.correct ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                  {result.correct ? '정답이에요!' : '아쉬워요.'}
                </span>{' '}{result.explanation}
              </p>
            )}
          </section>
        );
      })}

      {error && <p className="rounded-xl border border-[hsl(var(--destructive)/.25)] bg-[hsl(var(--destructive)/.08)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]" role="alert">{error}</p>}
      {!graded && (
        <button
          type="button"
          onClick={submitQuiz}
          disabled={loading || submitting || questions.length === 0}
          className="button-pop inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[hsl(var(--primary))] px-5 py-4 text-sm font-extrabold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <ClipboardList size={17} /> {submitting ? '채점 중...' : '제출하고 채점하기'}
        </button>
      )}
    </div>
  );
}
