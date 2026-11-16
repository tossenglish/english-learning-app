import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ClipboardList, FileUp, Plus, Save, Trash2 } from 'lucide-react';
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
const maxQuestions = 200;
const maxImportSize = 1024 * 1024;

function createQuestion(): EditableQuestion {
  return {
    id: `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text: '',
    choices: ['', '', '', ''],
    answer: 0,
    explanation: '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export default function QuizAdmin() {
  const { isLoaded, isSignedIn } = useUser();
  const { isAdmin, isChecking } = useAdminAccess();
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

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
        if (
          !Array.isArray(data.questions)
          || typeof data.count !== 'number'
          || !Number.isInteger(data.count)
        ) {
          throw new Error('문제 응답 형식이 올바르지 않아요.');
        }
        setQuestions(data.questions);
        setCount(data.count);
        setLoaded(true);
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
        ? {
          ...question,
          choices: question.choices.map((choice, optionIndex) =>
            optionIndex === choiceIndex ? value : choice,
          ),
        }
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

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    if (file.size > maxImportSize) {
      setMessage('문제 파일은 1MB 이하의 JSON 파일만 가져올 수 있어요.');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage('파일을 읽지 못했어요. 올바른 JSON 파일인지 확인해 주세요.');
      return;
    }

    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) ? parsed.questions : undefined;
    if (!Array.isArray(items) || items.length === 0) {
      setMessage('파일에서 문제를 찾지 못했어요.');
      return;
    }
    if (items.length + questions.length > maxQuestions) {
      setMessage(`문제는 최대 ${maxQuestions}개까지 등록할 수 있어요.`);
      return;
    }

    try {
      const imported = items.map((item: unknown, index: number): EditableQuestion => {
        if (!isRecord(item)) throw new Error(`파일의 ${index + 1}번째 문제 형식이 올바르지 않아요.`);
        const text = typeof item.text === 'string' ? item.text.trim().slice(0, 500) : '';
        const choices = Array.isArray(item.choices)
          ? item.choices.map((choice) =>
            typeof choice === 'string' ? choice.trim().slice(0, 200) : "",
          )
          : [];
        const fileAnswer = item.answer;
        const answer = typeof fileAnswer === 'number' && Number.isInteger(fileAnswer)
          ? fileAnswer - 1
          : -1;
        if (
          !text
          || choices.length < 2
          || choices.length > maxChoices
          || choices.some((choice) => !choice)
          || answer < 0
          || answer >= choices.length
        ) {
          throw new Error(`파일의 ${index + 1}번째 문제를 확인해 주세요. (보기 2~5개, 정답번호는 1부터)`);
        }
        return {
          ...createQuestion(),
          text,
          choices,
          answer,
          explanation: typeof item.explanation === 'string' ? item.explanation.trim().slice(0, 500) : '',
        };
      });
      setQuestions((current) => [...current, ...imported]);
      setMessage(`📂 ${imported.length}개 문제를 가져왔어요. 내용을 확인한 뒤 저장하기를 눌러 주세요.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '문제를 가져오지 못했어요.');
    }
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
      || question.choices.length > maxChoices
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
    return <p className="mx-auto max-w-lg rounded-2xl bg-[hsl(var(--card))] p-6 text-sm" role="status">관리자 권한을 확인하고 있어요...</p>;
  }
  if (!isSignedIn || !isAdmin) {
    return (
      <section className="mx-auto max-w-lg rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h1 className="text-xl font-extrabold">퀴즈 출제 관리</h1>
        <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
          {!isSignedIn ? '관리자 계정으로 로그인해 주세요.' : '퀴즈 출제 관리자 권한이 필요해요.'}
        </p>
        {!isSignedIn && <Link href="/sign-in" className="mt-4 inline-block font-bold text-[hsl(var(--accent))]">로그인</Link>}
      </section>
    );
  }
  if (!loaded) {
    return (
      <section className="mx-auto max-w-lg rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <h1 className="text-xl font-extrabold">퀴즈 출제 관리</h1>
        <p className="mt-3 text-sm" role={message ? 'alert' : 'status'}>{message || '문제를 불러오고 있어요...'}</p>
        {!busy && (
          <button type="button" onClick={() => { setMessage(''); setLoadAttempt((attempt) => attempt + 1); }} className="mt-4 font-bold text-[hsl(var(--accent))]">
            다시 불러오기
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <ClipboardList size={14} /> Teacher tools
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-.05em]">퀴즈 출제 관리<span className="text-[hsl(var(--accent))]">.</span></h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">문제를 직접 만들거나 JSON 파일에서 가져올 수 있어요.</p>
        </div>
        <Link href="/quiz" className="inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))]">
          <ArrowLeft size={15} /> 퀴즈로 돌아가기
        </Link>
      </section>

      <section className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
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
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">0이면 전체 문제를 냅니다.</p>
      </section>

      {questions.map((question, index) => (
        <section key={question.id} className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-extrabold">{index + 1}번 문제</h2>
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`${index + 1}번 문제를 삭제할까요?`)) return;
                setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
                setCount((current) => Math.min(current, questions.length - 1));
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[hsl(var(--destructive))]"
            >
              <Trash2 size={14} /> 삭제
            </button>
          </div>
          <textarea
            value={question.text}
            onChange={(event) => updateQuestion(index, { text: event.target.value })}
            maxLength={500}
            rows={2}
            placeholder="문제를 입력하세요"
            aria-label={`${index + 1}번 문제`}
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
                <span className="w-5 text-xs">{choiceIndex + 1}</span>
                <input
                  value={choice}
                  onChange={(event) => updateChoice(index, choiceIndex, event.target.value)}
                  maxLength={200}
                  placeholder={`보기 ${choiceIndex + 1}`}
                  className={fieldClass}
                />
                <button type="button" onClick={() => removeChoice(index, choiceIndex)} disabled={question.choices.length <= 2} aria-label={`${choiceIndex + 1}번 보기 삭제`} className="px-2 disabled:opacity-30">×</button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => updateQuestion(index, { choices: [...question.choices, ''] })}
            disabled={question.choices.length >= maxChoices}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[hsl(var(--accent))] disabled:opacity-40"
          >
            <Plus size={14} /> 보기 추가
          </button>
          <input
            value={question.explanation}
            onChange={(event) => updateQuestion(index, { explanation: event.target.value })}
            maxLength={500}
            placeholder="해설 (선택)"
            aria-label={`${index + 1}번 문제 해설`}
            className={`${fieldClass} mt-4`}
          />
        </section>
      ))}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setQuestions((current) => [...current, createQuestion()])}
          disabled={questions.length >= maxQuestions}
          className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-bold disabled:opacity-40"
        >
          <Plus size={16} /> 문제 추가
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={questions.length >= maxQuestions}
          className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-bold disabled:opacity-40"
        >
          <FileUp size={16} /> 파일에서 문제 가져오기
        </button>
        <input ref={fileInput} type="file" accept=".json,application/json" onChange={(event) => void importFile(event)} className="hidden" />
        <button
          type="button"
          onClick={() => void saveQuestions()}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-extrabold text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          <Save size={16} /> {busy ? '저장 중...' : '저장하기'}
        </button>
      </div>
      {message && <p role="status" className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-semibold">{message}</p>}
    </div>
  );
}
