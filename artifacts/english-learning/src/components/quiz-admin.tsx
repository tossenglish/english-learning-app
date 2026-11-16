import { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Save, Trash2 } from 'lucide-react';
import { Link } from 'wouter';
import { useUser } from '@clerk/react';
import { useAdminAccess } from '@/hooks/use-admin-access';
import { apiFetch } from '@/lib/api-fetch';

type EditableQuestion = {
  id: string;
  text: string;
  choices: string[];
  answer: number;
  explanation: string;
};

const maxChoices = 5;

function createQuestion(): EditableQuestion {
  return {
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: '',
    choices: ['', '', '', ''],
    answer: 0,
    explanation: '',
  };
}

export default function QuizAdmin() {
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [questionsLoaded, setQuestionsLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const { isLoaded, isSignedIn } = useUser();
  const { isAdmin, isChecking } = useAdminAccess();

  useEffect(() => {
    if (!isAdmin || isChecking) return;
    const controller = new AbortController();
    setBusy(true);
    apiFetch('/api/admin/questions', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as {
          questions?: EditableQuestion[];
          count?: number;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || '문제를 불러오지 못했어요.');
        if (!Array.isArray(data.questions) || typeof data.count !== 'number' || !Number.isInteger(data.count)) {
          throw new Error('문제 응답 형식이 올바르지 않아요.');
        }
        setQuestions(data.questions);
        setCount(data.count);
        setQuestionsLoaded(true);
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setMessage(cause instanceof Error ? cause.message : '문제를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [isAdmin, isChecking, loadAttempt]);

  function updateQuestion(index: number, patch: Partial<EditableQuestion>) {
    setQuestions((current) => current.map((question, itemIndex) =>
      itemIndex === index ? { ...question, ...patch } : question,
    ));
  }

  function updateChoice(index: number, choiceIndex: number, value: string) {
    setQuestions((current) => current.map((question, itemIndex) =>
      itemIndex === index
        ? { ...question, choices: question.choices.map((choice, optionIndex) =>
          optionIndex === choiceIndex ? value : choice,
        ) }
        : question,
    ));
  }

  function removeChoice(index: number, choiceIndex: number) {
    setQuestions((current) => current.map((question, itemIndex) => {
      if (itemIndex !== index || question.choices.length <= 2) return question;
      const choices = question.choices.filter((_, optionIndex) => optionIndex !== choiceIndex);
      const answer = choiceIndex === question.answer
        ? 0
        : choiceIndex < question.answer
          ? question.answer - 1
          : question.answer;
      return { ...question, choices, answer };
    }));
  }

  async function saveQuestions() {
    setMessage('');
    if (questions.length === 0) {
      setMessage('문제를 한 개 이상 추가해 주세요.');
      return;
    }
    if (questions.some((question) =>
      !question.text.trim()
      || question.choices.length < 2
      || question.choices.some((choice) => !choice.trim())
      || question.answer < 0
      || question.answer >= question.choices.length,
    )) {
      setMessage('문제와 보기의 빈칸을 채우고 각 문제의 정답을 선택해 주세요.');
      return;
    }
    if (!Number.isInteger(count) || count < 0 || count > questions.length) {
      setMessage('출제 문항 수는 전체 문제 수 이하로 입력해 주세요. 0은 전체 출제입니다.');
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch('/api/admin/questions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions, count }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || '저장에 실패했어요.');
      setMessage('저장했어요. 다음 퀴즈부터 변경한 문제가 출제됩니다.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass = 'w-full rounded-xl border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm outline-none focus:border-[hsl(var(--ring))]';

  if (!isLoaded || isChecking) {
    return (
      <div className="mx-auto w-full max-w-[500px]">
        <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-sm)] sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
            <ClipboardList size={23} />
          </div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Teacher tools</p>
          <h1 className="mt-2 text-2xl font-extrabold">퀴즈 출제 관리</h1>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]" role="status">관리자 권한을 확인하고 있어요...</p>
        </section>
      </div>
    );
  }

  if (!isSignedIn || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-[500px]">
        <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-sm)] sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
            <ClipboardList size={23} />
          </div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Teacher tools</p>
          <h1 className="mt-2 text-2xl font-extrabold">퀴즈 출제 관리</h1>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
            {!isSignedIn ? '관리자 계정으로 로그인해 주세요.' : '퀴즈를 출제할 관리자 권한이 필요해요.'}
          </p>
          {!isSignedIn && (
            <Link
              href="/sign-in"
              className="button-pop mt-5 inline-flex rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))]"
            >
              로그인
            </Link>
          )}
        </section>
      </div>
    );
  }

  if (!questionsLoaded) {
    return (
      <div className="mx-auto w-full max-w-[500px]">
        <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-[var(--shadow-sm)] sm:p-8">
          <h1 className="text-2xl font-extrabold">퀴즈 출제 관리</h1>
          <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]" role={message ? 'alert' : 'status'}>
            {message || (busy ? '문제를 불러오고 있어요...' : '문제를 불러오지 못했어요.')}
          </p>
          {!busy && (
            <button
              type="button"
              onClick={() => {
                setMessage('');
                setLoadAttempt((attempt) => attempt + 1);
              }}
              className="button-pop mt-5 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))]"
            >
              다시 불러오기
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6">
      <section className="rise-in flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <ClipboardList size={14} /> Teacher tools
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-.05em]">퀴즈 출제 관리<span className="text-[hsl(var(--accent))]">.</span></h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">문제를 편집하고 학생들에게 출제할 문항 수를 정하세요.</p>
        </div>
        <Link href="/quiz" className="inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))]">
          <ArrowLeft size={15} /> 퀴즈로 돌아가기
        </Link>
      </section>

      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
        <label htmlFor="quiz-question-count" className="block text-sm font-extrabold">출제 문항 수</label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>전체 {questions.length}문제 중</span>
          <input
            id="quiz-question-count"
            type="number"
            min={0}
            max={questions.length}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="w-24 rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-center font-bold"
          />
          <span>문제를 무작위로 출제</span>
        </div>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">0을 입력하면 전체 문제를 출제합니다. 나머지 숫자는 매번 문제를 무작위로 골라요.</p>
      </section>

      {questions.map((question, index) => (
        <section key={question.id} className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-extrabold">{index + 1}번 문제</h2>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`${index + 1}번 문제를 삭제할까요?`)) {
                  setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
                  setCount((current) => Math.min(current, questions.length - 1));
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive)/.08)]"
            >
              <Trash2 size={14} /> 삭제
            </button>
          </div>
          <label htmlFor={`question-${question.id}`} className="sr-only">문제 내용</label>
          <textarea
            id={`question-${question.id}`}
            value={question.text}
            onChange={(event) => updateQuestion(index, { text: event.target.value })}
            maxLength={500}
            rows={2}
            placeholder="문제를 입력하세요"
            className={fieldClass}
          />
          <p className="mb-2 mt-4 text-xs font-bold text-[hsl(var(--muted-foreground))]">보기 — 정답 왼쪽의 동그라미를 선택하세요.</p>
          <div className="space-y-2">
            {question.choices.map((choice, choiceIndex) => (
              <div key={`${question.id}-${choiceIndex}`} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`answer-${question.id}`}
                  checked={question.answer === choiceIndex}
                  onChange={() => updateQuestion(index, { answer: choiceIndex })}
                  aria-label={`${choiceIndex + 1}번 보기를 정답으로 선택`}
                />
                <span className="w-5 shrink-0 text-xs font-bold text-[hsl(var(--muted-foreground))]">{choiceIndex + 1}</span>
                <input
                  value={choice}
                  onChange={(event) => updateChoice(index, choiceIndex, event.target.value)}
                  maxLength={200}
                  placeholder={`보기 ${choiceIndex + 1}`}
                  aria-label={`${index + 1}번 문제 보기 ${choiceIndex + 1}`}
                  className={fieldClass}
                />
                <button
                  type="button"
                  onClick={() => removeChoice(index, choiceIndex)}
                  disabled={question.choices.length <= 2}
                  aria-label={`${choiceIndex + 1}번 보기 삭제`}
                  className="rounded-lg px-2 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-30"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateQuestion(index, { choices: [...question.choices, ''] })}
            disabled={question.choices.length >= maxChoices}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-[hsl(var(--accent))] hover:bg-[hsl(var(--muted))] disabled:opacity-40"
          >
            <Plus size={14} /> 보기 추가
          </button>
          <label htmlFor={`explanation-${question.id}`} className="mt-4 block text-xs font-bold text-[hsl(var(--muted-foreground))]">해설 (선택)</label>
          <input
            id={`explanation-${question.id}`}
            value={question.explanation}
            onChange={(event) => updateQuestion(index, { explanation: event.target.value })}
            maxLength={500}
            placeholder="정답 해설을 입력하세요"
            className={`${fieldClass} mt-2`}
          />
        </section>
      ))}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setQuestions((current) => [...current, createQuestion()]);
          }}
          disabled={questions.length >= 200}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3 text-sm font-bold hover:bg-[hsl(var(--muted))] disabled:opacity-40"
        >
          <Plus size={16} /> 문제 추가
        </button>
        <button
          type="button"
          onClick={() => void saveQuestions()}
          disabled={busy}
          className="button-pop inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-6 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          <Save size={16} /> {busy ? '저장 중...' : '저장하기'}
        </button>
      </div>
      {message && <p className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-semibold" role="status">{message}</p>}
    </div>
  );
}
