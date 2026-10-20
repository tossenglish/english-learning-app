import { useEffect, useState } from 'react';
import { useUser } from '@clerk/react';
import { BookOpenCheck, Check, LoaderCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  useDeleteAdminReadingPassage,
  useUpdateAdminReadingPassage,
} from '@workspace/api-client-react';
import { apiFetch } from '@/lib/api-fetch';

type QuestionType = 'true_false';
type Question = { type: 'true_false'; prompt: string; options: string[]; answer: 'true' | 'false'; explanationNote?: string };
type StoredQuestion = { type: 'true_false' | 'multiple_choice' | 'short_answer'; prompt: string; options: string[]; answer: string; explanationNote?: string };
type StudentQuestion = Pick<Question, 'type' | 'prompt' | 'options'>;
type Passage = { id: number; grade: number; title: string; passage: string; questions: StudentQuestion[]; createdAt: string };
type AdminPassage = Omit<Passage, 'questions'> & { questions: StoredQuestion[] };
type StoredReadingProgress = {
  signature: string;
  answers: Record<number, string>;
  results: Record<number, boolean>;
  explanations: Record<number, string>;
};
const labels: Record<QuestionType, string> = { true_false: 'O/X' };
const genericError = '잠깐 쉬고 있어요, 다시 해 볼까요?';
const limitError = '오늘은 여기까지! 내일 또 만나요';
const emptyQuestion = (): Question => ({ type: 'true_false', prompt: '', options: [], answer: 'true' });
const READING_SELECTION_STORAGE_PREFIX = 'english-learning:reading-selection:v1';
const READING_PROGRESS_STORAGE_PREFIX = 'english-learning:reading-progress:v1';

function getReadingSelectionKey(userId: string) {
  return `${READING_SELECTION_STORAGE_PREFIX}:${encodeURIComponent(userId)}`;
}

function getReadingProgressKey(userId: string, passageId: number) {
  return `${READING_PROGRESS_STORAGE_PREFIX}:${encodeURIComponent(userId)}:${passageId}`;
}

function getReadingPassageSignature(passage: Passage) {
  return JSON.stringify({
    title: passage.title,
    passage: passage.passage,
    questions: passage.questions,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStoredStringMap(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<number, string>>((result, [key, item]) => {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && typeof item === 'string') result[index] = item;
    return result;
  }, {});
}

function readStoredBooleanMap(value: unknown) {
  if (!isRecord(value)) return {};
  return Object.entries(value).reduce<Record<number, boolean>>((result, [key, item]) => {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && typeof item === 'boolean') result[index] = item;
    return result;
  }, {});
}

function readStoredReadingProgress(userId: string, passage: Passage): StoredReadingProgress | null {
  try {
    const stored = localStorage.getItem(getReadingProgressKey(userId, passage.id));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    const signature = getReadingPassageSignature(passage);
    if (!isRecord(parsed) || parsed.signature !== signature) return null;
    return {
      signature,
      answers: readStoredStringMap(parsed.answers),
      results: readStoredBooleanMap(parsed.results),
      explanations: readStoredStringMap(parsed.explanations),
    };
  } catch {
    return null;
  }
}

function readLastReadingPassageId(userId: string) {
  try {
    const id = Number(localStorage.getItem(getReadingSelectionKey(userId)));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

async function responseError(response: Response) {
  if (response.status === 429) return limitError;
  return genericError;
}

function adminMutationError(error: unknown, fallback: string) {
  if (isRecord(error) && isRecord(error.data) && typeof error.data.error === 'string') {
    return error.data.error;
  }
  return error instanceof Error ? error.message : fallback;
}

export function AdminReadingBuilder() {
  const [title, setTitle] = useState('');
  const [passage, setPassage] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<AdminPassage[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const updatePassageMutation = useUpdateAdminReadingPassage({
    request: { credentials: 'include' },
  });
  const deletePassageMutation = useDeleteAdminReadingPassage({
    request: { credentials: 'include' },
  });

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

  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setPassage('');
    setQuestions([]);
    setMessage('');
    setError('');
  };

  const editSavedPassage = (item: AdminPassage) => {
    const editableQuestions = item.questions
      .filter((question): question is Question => question.type === 'true_false')
      .map((question) => ({ ...question, options: [...question.options] }));
    const preservedCount = item.questions.length - editableQuestions.length;
    setEditingId(item.id);
    setTitle(item.title);
    setPassage(item.passage);
    setQuestions(editableQuestions);
    setError('');
    setMessage(preservedCount > 0
      ? `편집 중입니다. 기존 O/X 외 문제 ${preservedCount}개는 저장해도 그대로 보존됩니다.`
      : '저장된 지문을 편집 중입니다.');
  };

  const updateQuestion = (index: number, updates: Partial<Question>) =>
    setQuestions((current) => current.map((q, i) => i === index ? { ...q, ...updates } : q));

  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (editingId !== null) {
        const data = await updatePassageMutation.mutateAsync({
          passageId: editingId,
          data: {
            title: title.trim(),
            passage: passage.trim(),
            ...(questions.length > 0 ? { questions } : {}),
          },
        });
        setSaved((items) => items.map((item) => item.id === data.id ? data : item));
        resetEditor();
        setMessage('읽기 지문을 수정했습니다.');
        return;
      }

      const r = await apiFetch('/api/admin/reading/passages', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade: 6, title, passage, questions }),
      });
      const data = await r.json().catch(() => null) as AdminPassage | { error?: string } | null;
      if (!r.ok || !data || !('id' in data)) throw new Error((data as { error?: string } | null)?.error ?? '저장하지 못했습니다.');
      setSaved((items) => [data, ...items]); resetEditor();
      setMessage('저장했습니다. 학생 화면에 표시됩니다.');
    } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
    finally { setBusy(false); }
  };

  const deleteSavedPassage = async (item: AdminPassage) => {
    if (!window.confirm(`“${item.title}” 지문을 삭제할까요? 학생 화면에서도 더 이상 표시되지 않습니다.`)) return;
    setDeletingId(item.id);
    setError('');
    setMessage('');
    try {
      await deletePassageMutation.mutateAsync({ passageId: item.id });
      setSaved((items) => items.filter((savedItem) => savedItem.id !== item.id));
      if (editingId === item.id) resetEditor();
      setMessage('읽기 지문을 삭제했습니다.');
    } catch (deleteError) {
      setError(adminMutationError(deleteError, '읽기 지문을 삭제하지 못했습니다.'));
    } finally {
      setDeletingId(null);
    }
  };

  return <section className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7" data-testid="reading-admin-builder">
    <div className="flex items-start gap-3"><span className="rounded-xl bg-[hsl(var(--accent)/.12)] p-2 text-[hsl(var(--accent))]"><BookOpenCheck size={20} /></span><div><h2 className="text-xl font-bold">읽기 이해 · 6학년</h2><p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">지문과 문제를 직접 작성하세요. 해설 메모는 학생에게 보이지 않습니다.</p></div></div>
    <label className="mt-5 block text-sm font-semibold">지문 제목<input data-testid="input-reading-passage-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1.5 w-full rounded-xl border p-3" /></label>
    <label className="mt-3 block text-sm font-semibold">영어 지문<textarea data-testid="input-reading-passage-text" value={passage} onChange={(e) => setPassage(e.target.value)} rows={5} maxLength={3000} className="mt-1.5 w-full rounded-xl border p-3 leading-relaxed" placeholder="3~5개의 짧은 영어 문장을 입력하세요." /></label>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" data-testid="button-add-reading-question" onClick={() => setQuestions((items) => [...items, emptyQuestion()])} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-bold"><Plus size={15} />O/X 문제 추가</button></div>
    {questions.map((q, i) => <article key={i} className="mt-4 rounded-2xl border p-4">
      <header className="flex items-center justify-between"><h3 className="font-bold">{i + 1}. {labels[q.type]}</h3><button type="button" aria-label="문제 삭제" data-testid={`button-remove-reading-question-${i}`} disabled={editingId !== null && questions.length === 1} title={editingId !== null && questions.length === 1 ? 'O/X 문제는 최소 1개가 필요합니다.' : undefined} onClick={() => setQuestions((items) => items.filter((_, j) => j !== i))} className="rounded-lg p-2 text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={17} /></button></header>
      <label className="mt-2 block text-xs font-semibold">질문<input data-testid={`input-reading-question-${i}`} value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })} className="mt-1 w-full rounded-lg border p-2.5 text-sm" /></label>
      <label className="mt-2 block text-xs font-semibold">정답<select data-testid={`select-reading-answer-${i}`} value={q.answer} onChange={(e) => updateQuestion(i, { answer: e.target.value as Question['answer'] })} className="mt-1 block rounded-lg border p-2.5"><option value="true">O / 맞음</option><option value="false">X / 틀림</option></select></label>
      <label className="mt-2 block text-xs font-semibold">해설 메모 (선택)<textarea data-testid={`input-reading-explanation-note-${i}`} value={q.explanationNote ?? ''} onChange={(e) => updateQuestion(i, { explanationNote: e.target.value })} rows={2} maxLength={1000} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="정답 근거나 설명 방향을 적어 주세요." /></label>
    </article>)}
    {editingId !== null && questions.length === 0 && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">현재 편집 가능한 O/X 문제가 없습니다. 지문과 제목을 수정해도 기존 문제는 그대로 보존됩니다.</p>}
    {(questions.length > 0 || editingId !== null) && <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" data-testid="button-save-reading-passage" onClick={() => void save()} disabled={busy || updatePassageMutation.isPending || !title.trim() || !passage.trim() || (editingId === null && questions.length === 0)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">
        {busy || updatePassageMutation.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}
        {editingId === null ? '저장' : '변경 저장'}
      </button>
      {editingId !== null && <button type="button" data-testid="button-cancel-reading-passage-edit" onClick={resetEditor} disabled={busy || updatePassageMutation.isPending} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-bold disabled:opacity-50"><X size={16} />취소</button>}
    </div>}
    {message && <p role="status" data-testid="status-reading-passage-message" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm">{message}</p>}{error && <p role="alert" data-testid="status-reading-passage-error" className="mt-3 text-sm font-bold text-rose-600">{error}</p>}
    <div className="mt-6 border-t pt-4">
      <h3 className="font-bold">저장된 지문 ({saved.length})</h3>
      {savedLoading && <p role="status" className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">저장된 지문을 불러오는 중이에요…</p>}
      {savedError && <div role="alert" className="mt-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
        <p>{savedError}</p>
        <button type="button" onClick={() => void loadSaved()} className="mt-2 font-bold underline">다시 불러오기</button>
      </div>}
      {!savedLoading && !savedError && saved.length === 0 && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">저장된 지문이 없습니다.</p>}
      {saved.map((item) => <div key={item.id} data-testid={`card-saved-reading-passage-${item.id}`} className="mt-2 flex flex-col gap-3 rounded-xl bg-[hsl(var(--muted)/.4)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><b>{item.title}</b><p className="mt-1 line-clamp-2 text-xs">{item.passage}</p></div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" data-testid={`button-edit-reading-passage-${item.id}`} aria-label={`${item.title} 편집`} onClick={() => editSavedPassage(item)} disabled={busy || updatePassageMutation.isPending || deletingId !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-bold disabled:opacity-50"><Pencil size={14} />편집</button>
          <button type="button" data-testid={`button-delete-reading-passage-${item.id}`} aria-label={`${item.title} 삭제`} onClick={() => void deleteSavedPassage(item)} disabled={busy || updatePassageMutation.isPending || deletingId !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 px-3 text-xs font-bold text-rose-700 disabled:opacity-50">
            {deletingId === item.id ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}삭제
          </button>
        </div>
      </div>)}
    </div>
  </section>;
}

export default function ReadingComprehensionPractice() {
  const { user } = useUser();
  const [readingStateOwnerId, setReadingStateOwnerId] = useState<string | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selected, setSelected] = useState<Passage | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [results, setResults] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
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
      const loaded = await r.json() as Passage[];
      setPassages(loaded);
      if (user?.id) {
        const lastPassageId = readLastReadingPassageId(user.id);
        const lastPassage = loaded.find((item) => item.id === lastPassageId);
        if (lastPassage) {
          const saved = readStoredReadingProgress(user.id, lastPassage);
          setSelected(lastPassage);
          setAnswers(saved?.answers ?? {});
          setResults(saved?.results ?? {});
          setExplanations(saved?.explanations ?? {});
        } else {
          setSelected(null);
          setAnswers({});
          setResults({});
          setExplanations({});
        }
      }
      setReadingStateOwnerId(user?.id ?? null);
    } catch {
      setPassagesError(true);
    } finally {
      setPassagesLoading(false);
    }
  };
  useEffect(() => { void loadPassages(); }, [user?.id]);
  useEffect(() => {
    if (!user?.id || readingStateOwnerId !== user.id || !selected) return;
    try {
      localStorage.setItem(getReadingSelectionKey(user.id), String(selected.id));
      localStorage.setItem(
        getReadingProgressKey(user.id, selected.id),
        JSON.stringify({
          signature: getReadingPassageSignature(selected),
          answers,
          results,
          explanations,
        } satisfies StoredReadingProgress),
      );
    } catch {
      // Reading can continue if browser storage is unavailable.
    }
  }, [answers, explanations, readingStateOwnerId, results, selected, user?.id]);
  const choosePassage = (passage: Passage) => {
    const saved = user?.id ? readStoredReadingProgress(user.id, passage) : null;
    setSelected(passage);
    setAnswers(saved?.answers ?? {});
    setResults(saved?.results ?? {});
    setExplanations(saved?.explanations ?? {});
  };
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
  return <main className="mx-auto max-w-4xl space-y-6 pb-24">
    <header><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Reading · Grade 6</p><h1 className="mt-2 text-3xl font-bold">읽기 이해<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">지문을 읽고 문제를 풀어 보세요.</p></header>
    {failed && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm font-bold text-amber-900">{failed}</p>}
      {!selected ? <section className="grid gap-3 sm:grid-cols-2">
      {passagesLoading && <p role="status" className="col-span-full rounded-2xl bg-[hsl(var(--card))] p-6 text-center text-sm">읽기 지문을 불러오는 중이에요…</p>}
      {passagesError && <div role="alert" className="col-span-full rounded-2xl bg-amber-100 p-6 text-center text-sm font-semibold text-amber-900">
        <p>{genericError}</p>
        <button type="button" onClick={() => void loadPassages()} className="mt-3 rounded-lg border border-amber-900/30 px-3 py-2 font-bold">다시 시도</button>
      </div>}
      {!passagesLoading && !passagesError && passages.map((item) => <button key={item.id} onClick={() => choosePassage(item)} className="rounded-2xl border bg-[hsl(var(--card))] p-5 text-left"><h2 className="font-bold">{item.title}</h2><p className="mt-2 line-clamp-2 text-sm">{item.passage}</p><span className="mt-3 inline-block text-xs font-bold">지문 읽기 →</span></button>)}
      {!passagesLoading && !passagesError && !passages.length && <p className="col-span-full rounded-2xl bg-[hsl(var(--card))] p-6 text-center text-sm">아직 저장된 읽기 지문이 없어요. 선생님이 지문을 저장하면 여기에 표시됩니다.</p>}
    </section> : <section className="space-y-5">
       <button onClick={() => {
         setSelected(null); setAnswers({}); setResults({}); setExplanations({});
         if (user?.id) {
           try { localStorage.removeItem(getReadingSelectionKey(user.id)); } catch { /* Ignore unavailable storage. */ }
         }
       }} className="text-sm font-bold">← 지문 목록</button>
      <article className="rounded-3xl bg-[hsl(var(--sidebar))] p-6 text-white sm:p-8"><p className="font-mono text-xs uppercase tracking-widest text-white/60">Read the passage</p><h2 className="mt-3 text-2xl font-bold">{selected.title}</h2><p className="mt-5 whitespace-pre-line text-lg leading-relaxed">{selected.passage}</p></article>
      {selected.questions.map((q, i) => <article key={i} className="rounded-2xl border bg-[hsl(var(--card))] p-5"><p className="text-xs font-bold">{i + 1}. {labels[q.type]}</p><h3 className="mt-2 font-bold">{q.prompt}</h3>
        <div className="mt-4 flex gap-3">{[['true', 'O · 맞아요'], ['false', 'X · 아니에요']].map(([v, label]) => <button key={v} onClick={() => void answerObjective(i, v)} className="rounded-xl border px-5 py-3 font-bold">{label}</button>)}</div>
        {results[i] !== undefined && <div className="mt-3"><p className={`text-sm font-bold ${results[i] ? 'text-emerald-700' : 'text-rose-700'}`}>{results[i] ? '정답이에요!' : '다시 지문에서 찾아볼까요?'}</p><button disabled={loading[i]} onClick={() => void explain(i, answers[i])} className="mt-2 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50">{loading[i] ? '설명 준비 중…' : '왜 그래요?'}</button>{explanations[i] && <p role="status" className="mt-2 rounded-xl bg-sky-50 p-3 text-sm">{explanations[i]}</p>}</div>}
      </article>)}
    </section>}
  </main>;
}
