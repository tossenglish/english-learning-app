import { useEffect, useState } from 'react';
import { BookOpenCheck, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

type Question = {
  type: 'true_false' | 'multiple_choice' | 'short_answer';
  prompt: string;
  options: string[];
  answer: string;
};
type Passage = { id: number; grade: number; title: string; passage: string; questions: Question[]; createdAt: string };
const questionLabels: Record<Question['type'], string> = {
  true_false: 'O/X 문제',
  multiple_choice: '객관식',
  short_answer: '짧은 영어 답',
};
const childError = '잠깐 쉬고 있어요, 다시 해 볼까요?';

export function AdminReadingBuilder() {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<Passage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadSaved = async () => {
    try {
      const response = await apiFetch('/api/admin/reading/passages', { credentials: 'include', cache: 'no-store' });
      if (response.ok) setSaved(await response.json() as Passage[]);
    } catch { /* Existing saved passages remain visible if refresh fails. */ }
  };
  useEffect(() => { void loadSaved(); }, []);

  const generate = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/admin/reading/passages/generate', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: 6, passage }),
      });
      const data = await response.json().catch(() => null) as Question[] | { error?: string } | null;
      if (!response.ok || !Array.isArray(data)) throw new Error((data as { error?: string } | null)?.error ?? '문제를 만들지 못했습니다.');
      const order: Question['type'][] = ['true_false', 'multiple_choice', 'short_answer'];
      setQuestions([...data].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)));
      setMessage('문제를 만들었어요. 지문 내용과 정답을 검토하고 필요한 부분을 수정한 뒤 저장해 주세요.');
    } catch (e) { setError(e instanceof Error ? e.message : '문제를 만들지 못했습니다.'); }
    finally { setBusy(false); }
  };
  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setQuestions((current) => current.map((q, i) => i === index ? { ...q, ...updates } : q));
  };
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await apiFetch('/api/admin/reading/passages', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: 6, title, passage, questions }),
      });
      const result = await response.json().catch(() => null) as Passage | { error?: string } | null;
      if (!response.ok || !result || !('id' in result)) throw new Error((result as { error?: string } | null)?.error ?? '저장하지 못했습니다.');
      setSaved((current) => [result, ...current]);
      setMessage('저장했습니다. 학생 화면에 바로 표시됩니다.');
      setTitle(''); setPassage(''); setQuestions([]);
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7" data-testid="reading-admin-builder">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-[hsl(var(--accent)/.12)] p-2 text-[hsl(var(--accent))]"><BookOpenCheck size={20} /></span><div><h2 className="text-xl font-bold">읽기 이해 · 6학년</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">3~5문장 지문을 입력하면 AI가 문제 초안을 만들어요. 검토하고 저장한 지문만 학생에게 보여요.</p></div></div>
    <label className="mt-5 block text-sm font-semibold">지문 제목<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3" placeholder="예: A Day at the Park" /></label>
    <label className="mt-3 block text-sm font-semibold">영어 지문<textarea value={passage} onChange={(e) => setPassage(e.target.value)} rows={5} maxLength={3000} className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 leading-relaxed" placeholder="3~5개의 짧은 영어 문장을 입력하세요." /></label>
    <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void generate()} disabled={busy || passage.trim().length < 30} className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{busy ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />} AI로 문제 만들기</button>{questions.length === 3 && <button type="button" onClick={() => void save()} disabled={busy || !title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Check size={16} /> 저장</button>}</div>
    {message && <p role="status" className="mt-3 rounded-xl bg-[hsl(var(--secondary)/.6)] p-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm font-semibold text-[hsl(var(--destructive))]">{error}</p>}
    {questions.map((q, i) => <article key={q.type} className="mt-4 rounded-2xl border border-[hsl(var(--border))] p-4">
      <h3 className="text-sm font-bold">{i + 1}. {questionLabels[q.type]}</h3>
      <label className="mt-2 block text-xs font-semibold">문제<input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })} className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-sm" /></label>
      {q.type === 'multiple_choice' && <div className="mt-2 grid gap-2 sm:grid-cols-3">{q.options.map((option, j) => <label key={j} className="text-xs font-semibold">보기 {j + 1}<input value={option} onChange={(e) => { const options = [...q.options]; options[j] = e.target.value; updateQuestion(i, { options, answer: options.includes(q.answer) ? q.answer : options[0] }); }} className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-sm" /></label>)}</div>}
      <label className="mt-2 block text-xs font-semibold">정답{q.type === 'true_false' ? <select value={q.answer.toLowerCase()} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 block rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5"><option value="true">O / True</option><option value="false">X / False</option></select> : q.type === 'multiple_choice' ? <select value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 block w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5">{q.options.map((option, j) => <option key={j} value={option}>{option || `보기 ${j + 1}`}</option>)}</select> : <input value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-2.5 text-sm" />}</label>
    </article>)}
    <div className="mt-6 border-t border-[hsl(var(--border))] pt-4"><h3 className="font-bold">저장된 지문 ({saved.length})</h3>{saved.map((item) => <div key={item.id} className="mt-2 rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-sm"><b>{item.title}</b><p className="mt-1 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{item.passage}</p></div>)}</div>
  </section>;
}

export default function ReadingComprehensionPractice() {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<Passage | null>(null);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [shortAnswer, setShortAnswer] = useState('');
  const [shortResult, setShortResult] = useState<{ correct: boolean; feedback: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    apiFetch('/api/reading/passages?grade=6', { credentials: 'include' })
      .then(async (r) => { if (!r.ok) throw new Error(); return r.json() as Promise<Passage[]>; })
      .then((items) => { setPassages(items); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  const checkShortAnswer = async (index: number) => {
    if (!selected || !shortAnswer.trim() || busy) return;
    setBusy(true); setShortResult(null);
    try {
      const response = await apiFetch(`/api/reading/passages/${selected.id}/short-answer`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIndex: index, answer: shortAnswer }),
      });
      if (!response.ok) throw new Error();
      setShortResult(await response.json() as { correct: boolean; feedback: string });
      setFailed(false);
    } catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-4xl space-y-6 pb-24">
    <header><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Reading · Grade 6</p><h1 className="mt-2 text-3xl font-bold">읽기 이해<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">지문을 읽고 세 가지 문제를 풀어 보세요.</p></header>
    {failed && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm font-bold text-amber-900">{childError}</p>}
    {!selected ? <section className="grid gap-3 sm:grid-cols-2">{passages.map((item) => <button key={item.id} onClick={() => { setSelected(item); setAnswers({}); setShortAnswer(''); setShortResult(null); }} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-left hover:border-[hsl(var(--accent))]"><h2 className="font-bold">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{item.passage}</p><span className="mt-3 inline-block text-xs font-bold text-[hsl(var(--accent))]">지문 읽기 →</span></button>)}
      {!passages.length && !failed && <p className="col-span-full rounded-2xl bg-[hsl(var(--card))] p-6 text-center text-sm">아직 저장된 읽기 지문이 없어요.</p>}</section> : <section className="space-y-5">
      <button onClick={() => setSelected(null)} className="text-sm font-bold text-[hsl(var(--accent))]">← 지문 목록</button>
      <article className="rounded-3xl bg-[hsl(var(--sidebar))] p-6 text-white sm:p-8"><p className="font-mono text-xs uppercase tracking-widest text-white/60">Read the passage</p><h2 className="mt-3 text-2xl font-bold">{selected.title}</h2><p className="mt-5 whitespace-pre-line text-lg leading-relaxed">{selected.passage}</p></article>
      {selected.questions.map((q, i) => <article key={i} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5"><p className="text-xs font-bold text-[hsl(var(--accent))]">{i + 1}. {questionLabels[q.type]}</p><h3 className="mt-2 font-bold">{q.prompt}</h3>
        {q.type === 'true_false' && <div className="mt-4 flex gap-3">{['true', 'false'].map((choice) => <button key={choice} onClick={() => setAnswers((prev) => ({ ...prev, [i]: choice === q.answer.toLowerCase() }))} className={`rounded-xl border px-5 py-3 font-bold ${answers[i] === (choice === q.answer.toLowerCase()) ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.12)]' : 'border-[hsl(var(--border))]'}`}>{choice === 'true' ? 'O · 맞아요' : 'X · 아니에요'}</button>)}</div>}
        {q.type === 'multiple_choice' && <div className="mt-4 grid gap-2">{q.options.map((option, j) => <button key={j} onClick={() => setAnswers((prev) => ({ ...prev, [i]: option === q.answer }))} className={`rounded-xl border p-3 text-left text-sm font-semibold ${answers[i] === (option === q.answer) ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.12)]' : 'border-[hsl(var(--border))]'}`}>{String.fromCharCode(65 + j)}. {option}</button>)}</div>}
        {q.type === 'short_answer' && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={shortAnswer} onChange={(e) => setShortAnswer(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-white p-3 text-sm text-slate-900" placeholder="영어로 짧게 써 보세요" /><button disabled={busy || !shortAnswer.trim()} onClick={() => void checkShortAnswer(i)} className="rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{busy ? '확인 중…' : '답 확인'}</button></div>}
        {q.type === 'short_answer' && shortResult && <p role="status" className={`mt-3 rounded-xl p-3 text-sm font-semibold ${shortResult.correct ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{shortResult.feedback}</p>}
        {q.type !== 'short_answer' && answers[i] !== undefined && <p className={`mt-3 text-sm font-bold ${answers[i] ? 'text-emerald-700' : 'text-rose-700'}`}>{answers[i] ? '정답이에요!' : '다시 지문에서 찾아볼까요?'}</p>}
      </article>)}
    </section>}
  </main>;
}
