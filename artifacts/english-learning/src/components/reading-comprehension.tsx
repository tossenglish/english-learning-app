import { useEffect, useState } from 'react';
import { BookOpenCheck, Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

type QuestionType = 'true_false' | 'multiple_choice' | 'short_answer';
type Question = { type: QuestionType; prompt: string; options: string[]; answer: string; explanationNote?: string };
type StudentQuestion = Pick<Question, 'type' | 'prompt' | 'options'>;
type Passage = { id: number; grade: number; title: string; passage: string; questions: StudentQuestion[]; createdAt: string };
type AdminPassage = Omit<Passage, 'questions'> & { questions: Question[] };
const labels: Record<QuestionType, string> = { true_false: 'O/X', multiple_choice: '객관식', short_answer: '짧은 답' };
const genericError = '잠깐 쉬고 있어요, 다시 해 볼까요?';
const limitError = '오늘은 여기까지! 내일 또 만나요';
const emptyQuestion = (type: QuestionType): Question => ({
  type, prompt: '', options: type === 'multiple_choice' ? ['', '', ''] : [],
  answer: type === 'true_false' ? 'true' : '',
});

async function responseError(response: Response) {
  if (response.status === 429) return limitError;
  return genericError;
}

export function AdminReadingBuilder() {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<AdminPassage[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const loadSaved = async () => {
    setSavedLoading(true);
    setSavedError('');
    try {
      const r = await apiFetch('/api/admin/reading/passages', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403
        ? '관리자 계정 로그인 상태를 확인해 주세요.'
        : '저장된 지문을 불러오지 못했습니다.');
      setSaved(await r.json() as AdminPassage[]);
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : '저장된 지문을 불러오지 못했습니다.');
    } finally {
      setSavedLoading(false);
    }
  };
  useEffect(() => { void loadSaved(); }, []);
  const updateQuestion = (index: number, updates: Partial<Question>) =>
    setQuestions((current) => current.map((q, i) => i === index ? { ...q, ...updates } : q));
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const r = await apiFetch('/api/admin/reading/passages', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: 6, title, passage, questions }),
      });
      const data = await r.json().catch(() => null) as AdminPassage | { error?: string } | null;
      if (!r.ok || !data || !('id' in data)) throw new Error((data as { error?: string } | null)?.error ?? '저장하지 못했습니다.');
      setSaved((items) => [data, ...items]); setTitle(''); setPassage(''); setQuestions([]);
      setMessage('저장했습니다. 학생 화면에 표시됩니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };
  return <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7" data-testid="reading-admin-builder">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-[hsl(var(--accent)/.12)] p-2 text-[hsl(var(--accent))]"><BookOpenCheck size={20} /></span><div><h2 className="text-xl font-bold">읽기 이해 · 6학년</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">지문과 문제를 직접 작성하세요. 해설 메모는 학생에게 보이지 않습니다.</p></div></div>
    <label className="mt-5 block text-sm font-semibold">지문 제목<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border p-3" /></label>
    <label className="mt-3 block text-sm font-semibold">영어 지문<textarea value={passage} onChange={(e) => setPassage(e.target.value)} rows={5} maxLength={3000} className="mt-1.5 w-full rounded-xl border p-3 leading-relaxed" placeholder="3~5개의 짧은 영어 문장을 입력하세요." /></label>
    <div className="mt-4 flex flex-wrap gap-2">{(['true_false', 'multiple_choice', 'short_answer'] as QuestionType[]).map((type) => <button key={type} type="button" onClick={() => setQuestions((items) => [...items, emptyQuestion(type)])} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold"><Plus size={15} />{labels[type]} 추가</button>)}</div>
    {questions.map((q, i) => <article key={i} className="mt-4 rounded-2xl border p-4">
      <header className="flex items-center justify-between"><h3 className="font-bold">{i + 1}. {labels[q.type]}</h3><button type="button" aria-label="문제 삭제" onClick={() => setQuestions((items) => items.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose-600"><Trash2 size={17} /></button></header>
      <label className="mt-2 block text-xs font-semibold">질문<input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5 text-sm" /></label>
      {q.type === 'multiple_choice' && <div className="mt-2 grid gap-2 sm:grid-cols-3">{q.options.map((option, j) => <label key={j} className="text-xs font-semibold">보기 {j + 1}<input value={option} onChange={(e) => { const options = [...q.options]; options[j] = e.target.value; updateQuestion(i, { options, answer: q.answer === option ? e.target.value : q.answer }); }} className="mt-1 w-full rounded-lg border p-2.5 text-sm" /></label>)}</div>}
      <label className="mt-2 block text-xs font-semibold">정답{q.type === 'true_false' ? <select value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 block rounded-lg border p-2.5"><option value="true">O / 맞음</option><option value="false">X / 틀림</option></select> : q.type === 'multiple_choice' ? <select value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5">{q.options.map((o, j) => <option key={j} value={o}>{o || `보기 ${j + 1}`}</option>)}</select> : <input value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5" />}</label>
      <label className="mt-2 block text-xs font-semibold">해설 메모 (선택)<textarea value={q.explanationNote ?? ''} onChange={(e) => updateQuestion(i, { explanationNote: e.target.value })} rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="정답 근거나 설명 방향을 적어 주세요." /></label>
    </article>)}
    {questions.length > 0 && <button type="button" onClick={() => void save()} disabled={busy || !title.trim()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />} 저장</button>}
    {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm">{message}</p>}{error && <p role="alert" className="mt-3 text-sm font-bold text-rose-600">{error}</p>}
    <div className="mt-6 border-t pt-4">
      <h3 className="font-bold">저장된 지문 ({saved.length})</h3>
      {savedLoading && <p role="status" className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">저장된 지문을 불러오는 중이에요…</p>}
      {savedError && <div role="alert" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <p>{savedError}</p>
        <button type="button" onClick={() => void loadSaved()} className="mt-2 font-bold underline">다시 불러오기</button>
      </div>}
      {!savedLoading && !savedError && saved.length === 0 && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">저장된 지문이 없습니다.</p>}
      {saved.map((item) => <div key={item.id} className="mt-2 rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-sm"><b>{item.title}</b><p className="mt-1 line-clamp-2 text-xs">{item.passage}</p></div>)}
    </div>
  </section>;
}

export default function ReadingComprehensionPractice() {
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<Passage | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [shortResults, setShortResults] = useState<Record<number, { correct: boolean; feedback: string }>>({});
  const [shortAnswers, setShortAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState('');
  const [passagesLoading, setPassagesLoading] = useState(true);
  const [passagesError, setPassagesError] = useState(false);
  const [loading, setLoading] = useState<Record<number, boolean>>({});
  const loadPassages = async () => {
    setPassagesLoading(true);
    setPassagesError(false);
    try {
      const r = await apiFetch('/api/reading/passages?grade=6', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error('Reading passages request failed');
      setPassages(await r.json() as Passage[]);
    } catch {
      setPassagesError(true);
    } finally {
      setPassagesLoading(false);
    }
  };
  useEffect(() => { void loadPassages(); }, []);
  const explain = async (index: number, answer: string) => {
    if (!selected) return;
    setLoading((x) => ({ ...x, [index]: true })); setFailed('');
    try {
      const r = await apiFetch(`/api/reading/passages/${selected.id}/explanation`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIndex: index, answer }) });
      if (!r.ok) { setFailed(await responseError(r)); return; }
      const result = await r.json() as { feedback: string }; setExplanations((x) => ({ ...x, [index]: result.feedback }));
    } catch { setFailed(genericError); }
    finally { setLoading((x) => ({ ...x, [index]: false })); }
  };
  const answerObjective = async (index: number, answer: string) => {
    if (!selected) return;
    setAnswers((x) => ({ ...x, [index]: answer })); setResults((x) => { const n = { ...x }; delete n[index]; return n; });
    setExplanations((x) => { const n = { ...x }; delete n[index]; return n; }); setFailed('');
    try {
      const r = await apiFetch(`/api/reading/passages/${selected.id}/objective-answer`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIndex: index, answer }) });
      if (!r.ok) { setFailed(genericError); return; }
      const result = await r.json() as { correct: boolean }; setResults((x) => ({ ...x, [index]: result.correct }));
      if (!result.correct) await explain(index, answer);
    } catch { setFailed(genericError); }
  };
  const checkShortAnswer = async (index: number) => {
    if (!selected || !shortAnswers[index]?.trim()) return;
    setBusy((x) => ({ ...x, [index]: true })); setFailed('');
    try {
      const r = await apiFetch(`/api/reading/passages/${selected.id}/short-answer`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIndex: index, answer: shortAnswers[index] }) });
      if (!r.ok) { setFailed(await responseError(r)); return; }
      const result = await r.json() as { correct: boolean; feedback: string };
      setShortResults((x) => ({ ...x, [index]: result }));
    } catch { setFailed(genericError); }
    finally { setBusy((x) => ({ ...x, [index]: false })); }
  };
  return <main className="mx-auto max-w-4xl space-y-6 pb-24">
    <header><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Reading · Grade 6</p><h1 className="mt-2 text-3xl font-bold">읽기 이해<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">지문을 읽고 문제를 풀어 보세요.</p></header>
    {failed && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm font-bold text-amber-900">{failed}</p>}
    {!selected ? <section className="grid gap-3 sm:grid-cols-2">
      {passagesLoading && <p role="status" className="col-span-full rounded-2xl bg-[hsl(var(--card))] p-6 text-center text-sm">읽기 지문을 불러오는 중이에요…</p>}
      {passagesError && <div role="alert" className="col-span-full rounded-2xl bg-amber-100 p-6 text-center text-sm font-semibold text-amber-900">
        <p>{genericError}</p>
        <button type="button" onClick={() => void loadPassages()} className="mt-3 rounded-lg border border-amber-900/30 px-3 py-2 font-bold">다시 시도</button>
      </div>}
      {!passagesLoading && !passagesError && passages.map((item) => <button key={item.id} onClick={() => { setSelected(item); setAnswers({}); setResults({}); setExplanations({}); setShortAnswers({}); setShortResults({}); }} className="rounded-2xl border bg-[hsl(var(--card))] p-5 text-left"><h2 className="font-bold">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm">{item.passage}</p><span className="mt-3 inline-block text-xs font-bold">지문 읽기 →</span></button>)}
      {!passagesLoading && !passagesError && !passages.length && <p className="col-span-full rounded-2xl bg-[hsl(var(--card))] p-6 text-center text-sm">아직 저장된 읽기 지문이 없어요. 선생님이 지문을 저장하면 여기에 표시됩니다.</p>}
    </section> : <section className="space-y-5">
      <button onClick={() => setSelected(null)} className="text-sm font-bold">← 지문 목록</button>
      <article className="rounded-3xl bg-[hsl(var(--sidebar))] p-6 text-white sm:p-8"><p className="font-mono text-xs uppercase tracking-widest text-white/60">Read the passage</p><h2 className="mt-3 text-2xl font-bold">{selected.title}</h2><p className="mt-5 whitespace-pre-line text-lg leading-relaxed">{selected.passage}</p></article>
      {selected.questions.map((q, i) => <article key={i} className="rounded-2xl border bg-[hsl(var(--card))] p-5"><p className="text-xs font-bold">{i + 1}. {labels[q.type]}</p><h3 className="mt-2 font-bold">{q.prompt}</h3>
        {q.type === 'true_false' && <div className="mt-4 flex gap-3">{[['true', 'O · 맞아요'], ['false', 'X · 아니에요']].map(([v, label]) => <button key={v} onClick={() => void answerObjective(i, v)} className="rounded-xl border px-5 py-3 font-bold">{label}</button>)}</div>}
        {q.type === 'multiple_choice' && <div className="mt-4 grid gap-2">{q.options.map((option, j) => <button key={j} onClick={() => void answerObjective(i, option)} className="rounded-xl border p-3 text-left text-sm font-semibold">{String.fromCharCode(65 + j)}. {option}</button>)}</div>}
        {q.type !== 'short_answer' && results[i] !== undefined && <div className="mt-3"><p className={`text-sm font-bold ${results[i] ? 'text-emerald-700' : 'text-rose-700'}`}>{results[i] ? '정답이에요!' : '다시 지문에서 찾아볼까요?'}</p><button disabled={loading[i]} onClick={() => void explain(i, answers[i])} className="mt-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">{loading[i] ? '설명 준비 중…' : '왜 그래요?'}</button>{explanations[i] && <p role="status" className="mt-2 rounded-xl bg-sky-50 p-3 text-sm">{explanations[i]}</p>}</div>}
        {q.type === 'short_answer' && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={shortAnswers[i] ?? ''} onChange={(e) => setShortAnswers((x) => ({ ...x, [i]: e.target.value }))} className="min-w-0 flex-1 rounded-xl border bg-white p-3 text-sm text-slate-900" placeholder="영어로 짧게 써 보세요" /><button disabled={busy[i] || !shortAnswers[i]?.trim()} onClick={() => void checkShortAnswer(i)} className="rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-50">{busy[i] ? '확인 중…' : '답 확인'}</button></div>}
        {q.type === 'short_answer' && shortResults[i] && <p role="status" className={`mt-3 rounded-xl p-3 text-sm font-semibold ${shortResults[i].correct ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{shortResults[i].feedback}</p>}
      </article>)}
    </section>}
  </main>;
}
