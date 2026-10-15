import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useListAssignments, getListAssignmentsQueryKey, type Assignment, type LearningLevel } from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, RotateCcw, SpellCheck, Type, X } from 'lucide-react';
import { parseDirectMaterial } from '@/lib/practice-material';

type TypingEntry = ReturnType<typeof parseDirectMaterial>[number];

const levelLabels: Record<LearningLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
  All: '공통',
};

export default function TypingPractice({ level }: { level: Exclude<LearningLevel, 'All'> }) {
  const params = { level };
  const { data: assignments, isLoading, isError, error, refetch, isFetching } = useListAssignments(params, {
    query: { queryKey: getListAssignmentsQueryKey(params) },
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [position, setPosition] = useState(0);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [complete, setComplete] = useState(false);

  const accessibleAssignments = useMemo(() => (assignments ?? [])
    .filter((assignment) =>
      assignment.isPublished
      && (assignment.level === level || assignment.level === 'All')
      && Boolean(assignment.materialContent?.trim()))
    .map((assignment) => ({
      assignment,
      entries: parseDirectMaterial(assignment.materialContent, assignment.materialType),
    }))
    .filter(({ entries }) => entries.length > 0), [assignments, level]);

  const selected = accessibleAssignments.find(({ assignment }) => assignment.id === selectedId);
  const current: TypingEntry | undefined = selected?.entries[position];
  const begin = (assignment: Assignment) => {
    setSelectedId(assignment.id);
    setPosition(0);
    setAnswer('');
    setChecked(null);
    setRevealed(false);
    setCorrectCount(0);
    setComplete(false);
  };

  const checkAnswer = () => {
    if (!current || !answer.trim()) return;
    const right = answer.trim().toLocaleLowerCase() === current.english.trim().toLocaleLowerCase();
    setChecked(right);
    setRevealed(false);
    if (right) setCorrectCount((count) => count + 1);
  };

  const nextEntry = () => {
    if (!selected) return;
    if (position >= selected.entries.length - 1) {
      setComplete(true);
      return;
    }
    setPosition((index) => index + 1);
    setAnswer('');
    setChecked(null);
    setRevealed(false);
  };

  const leavePractice = () => {
    setSelectedId(null);
    setPosition(0);
    setAnswer('');
    setChecked(null);
    setRevealed(false);
    setComplete(false);
  };

  return (
    <div className="mx-auto max-w-[1080px] space-y-7">
      <section className="rise-in flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            <Type size={14} /> A little practice, one letter at a time
          </p>
          <h1 className="text-3xl font-extrabold tracking-[-.055em] sm:text-4xl" data-testid="text-typing-title">
            영어타자 익히기<span className="text-[hsl(var(--accent))]">.</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            수업에서 만난 단어와 문장을 직접 입력해봐요. 천천히, 정확하게 쓰면 충분해요.
          </p>
        </div>
        <div className="rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-bold text-[hsl(var(--muted-foreground))]" data-testid="text-typing-level">
          {levelLabels[level]} 레벨 자료
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[.88fr_1.12fr]">
        <section className="rise-in stagger-1 overflow-hidden rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" aria-labelledby="typing-material-title">
          <div className="border-b border-[hsl(var(--border))] p-5 sm:p-6">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[.17em] text-[hsl(var(--accent))]">Your class materials</p>
            <h2 id="typing-material-title" className="mt-1 text-lg font-extrabold">연습할 과제 고르기</h2>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">공개된 과제 중 입력할 자료를 선택해요.</p>
          </div>
          <div className="space-y-2 p-4 sm:p-5" aria-live="polite">
            {isLoading ? (
              <div className="space-y-3 py-2" role="status" data-testid="status-typing-loading" aria-label="과제를 불러오는 중">
                {[0, 1, 2].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl bg-[hsl(var(--muted))]" />)}
                <span className="sr-only">공개 과제를 불러오고 있어요.</span>
              </div>
            ) : isError ? (
              <div className="rounded-2xl border border-[hsl(var(--destructive)/.22)] bg-[hsl(var(--destructive)/.06)] p-5" role="alert" data-testid="status-typing-error">
                <p className="text-sm font-bold">과제를 불러오지 못했어요.</p>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  {error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.'}
                </p>
                <button type="button" onClick={() => void refetch()} disabled={isFetching} data-testid="button-typing-retry" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-60">
                  <RotateCcw size={14} /> 다시 불러오기
                </button>
              </div>
            ) : accessibleAssignments.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.65)] px-5 py-8 text-center" data-testid="status-typing-empty">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><SpellCheck size={20} /></span>
                <p className="mt-3 text-sm font-extrabold">아직 고를 수 있는 과제가 없어요</p>
                <p className="mt-1 max-w-[250px] text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">선생님이 공개한 단어·문장 과제가 생기면 이곳에서 타자 연습을 할 수 있어요.</p>
                <Link href="/dashboard" data-testid="link-typing-empty-dashboard" className="mt-4 inline-flex items-center gap-2 text-xs font-extrabold text-[hsl(var(--accent))]">
                  오늘의 연습으로 돌아가기 <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              accessibleAssignments.map(({ assignment, entries }) => {
                const active = selectedId === assignment.id;
                return (
                  <button
                    key={assignment.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => begin(assignment)}
                    data-testid={`button-typing-material-${assignment.id}`}
                    className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] ${active ? 'border-[hsl(var(--accent)/.65)] bg-[hsl(var(--secondary)/.5)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] hover:border-[hsl(var(--accent)/.45)] hover:bg-[hsl(var(--secondary)/.25)]'}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'}`}>
                      {assignment.materialType === 'word' ? <SpellCheck size={18} /> : <Type size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{assignment.title}</span>
                      <span className="mt-1 block text-[11px] font-semibold text-[hsl(var(--muted-foreground))]">
                        {assignment.materialType === 'word' ? '단어' : '문장'} · {entries.length}개 · {levelLabels[assignment.level]}
                      </span>
                    </span>
                    <ArrowRight size={16} className={`shrink-0 transition-transform ${active ? 'translate-x-0.5 text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground)/.6)] group-hover:translate-x-0.5'}`} />
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="rise-in stagger-2 overflow-hidden rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" aria-label="타자 연습">
          {!selected ? (
            <div className="relative flex min-h-[380px] flex-col items-center justify-center overflow-hidden p-7 text-center sm:min-h-[440px]">
              <div className="absolute inset-x-0 top-0 h-32 bg-[hsl(var(--secondary)/.38)]" />
              <img src="/english-mascot-trio-transparent.png" alt="함께 연습하는 영어 친구들" className="mascot-art relative z-10 mb-3 w-44 object-contain sm:w-52" />
              <h2 className="relative z-10 text-xl font-extrabold tracking-[-.04em]">준비되면 과제를 골라주세요</h2>
              <p className="relative z-10 mt-2 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">왼쪽 목록에서 익숙한 자료를 선택하면 첫 번째 항목부터 시작할게요.</p>
              <span className="relative z-10 mt-5 rounded-full bg-[hsl(var(--secondary))] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">선택한 과제의 내용만 사용해요</span>
            </div>
          ) : complete ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center p-7 text-center sm:min-h-[440px]" data-testid="status-typing-complete" role="status">
              <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><CheckCircle2 size={32} /></span>
              <p className="mt-5 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Practice complete</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-[-.05em]">끝까지 해냈어요!</h2>
              <p className="mt-2 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">
                <span className="font-bold text-[hsl(var(--foreground))]">{selected.assignment.title}</span> 자료 {selected.entries.length}개 중 {correctCount}개를 정확히 입력했어요.
              </p>
              <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row">
                <button type="button" onClick={() => begin(selected.assignment)} data-testid="button-typing-again" className="button-pop inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))]">
                  <RotateCcw size={15} /> 다시 연습하기
                </button>
                <button type="button" onClick={leavePractice} data-testid="button-typing-choose-another" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-xs font-bold hover:bg-[hsl(var(--muted))]">
                  다른 과제 고르기 <ArrowRight size={15} />
                </button>
              </div>
            </div>
          ) : current ? (
            <div className="p-5 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]">Typing practice</p>
                  <h2 className="mt-1 truncate text-sm font-extrabold" data-testid="text-typing-assignment">{selected.assignment.title}</h2>
                </div>
                <button type="button" onClick={leavePractice} data-testid="button-typing-back-to-list" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]">
                  <ArrowLeft size={14} /> 과제 목록
                </button>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]" role="progressbar" aria-label="연습 진행률" aria-valuemin={0} aria-valuemax={selected.entries.length} aria-valuenow={position + 1}>
                  <div className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500" style={{ width: `${((position + 1) / selected.entries.length) * 100}%` }} />
                </div>
                <span className="whitespace-nowrap font-mono text-[10px] font-bold text-[hsl(var(--muted-foreground))]" data-testid="text-typing-position">{position + 1} / {selected.entries.length}</span>
              </div>
              <div className="mt-6 rounded-[22px] bg-[hsl(var(--sidebar))] px-5 py-6 text-[hsl(var(--sidebar-foreground))] sm:px-7 sm:py-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-[hsl(var(--sidebar-accent))] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--sidebar-foreground)/.8)]">{selected.assignment.materialType === 'word' ? '단어' : '문장'} 입력</span>
                  <span className="font-mono text-[9px] font-bold uppercase tracking-[.13em] text-[hsl(var(--sidebar-foreground)/.45)]">Look · Type · Check</span>
                </div>
                <p className="mt-6 break-words font-sans text-2xl font-extrabold leading-snug tracking-[-.035em] sm:text-3xl" lang="ko" data-testid="text-typing-prompt">{current.korean}</p>
                <p className="mt-3 text-xs text-[hsl(var(--sidebar-foreground)/.58)]">{current.hint}</p>
              </div>
              <form className="mt-5" onSubmit={(event) => { event.preventDefault(); if (checked === null || checked === false) checkAnswer(); else nextEntry(); }}>
                <label htmlFor="typing-answer" className="mb-2 block text-xs font-extrabold">영어로 입력해 보세요</label>
                <input
                  id="typing-answer"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={answer}
                  onChange={(event) => { setAnswer(event.target.value); setChecked(null); }}
                  disabled={checked === true}
                  placeholder="여기에 영어를 입력해요"
                  data-testid="input-typing-answer"
                  aria-describedby="typing-feedback"
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3.5 font-mono text-base font-bold text-[hsl(var(--foreground))] outline-none transition-colors placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:text-[hsl(var(--muted-foreground)/.65)] focus:border-[hsl(var(--accent)/.7)] focus:ring-2 focus:ring-[hsl(var(--ring)/.2)] disabled:opacity-75"
                />
                <div id="typing-feedback" className="mt-3 min-h-7" aria-live="polite">
                  {checked === true && !revealed && <p className="flex items-center gap-2 text-sm font-extrabold text-[hsl(var(--secondary-foreground))]" data-testid="status-typing-correct"><CheckCircle2 size={17} /> 맞았어요! 정확하게 입력했어요.</p>}
                  {checked === true && revealed && <p className="flex items-center gap-2 text-sm font-extrabold text-[hsl(var(--muted-foreground))]" data-testid="status-typing-revealed"><CheckCircle2 size={17} /> 정답을 확인했어요. 다음 항목으로 넘어가요.</p>}
                  {checked === false && <div className="flex items-start gap-2 text-sm font-bold text-[hsl(var(--destructive))]" data-testid="status-typing-incorrect"><X size={17} className="mt-0.5 shrink-0" /><span>조금 달라요. 다시 입력하거나 정답을 확인해 보세요.<span className="mt-1 block font-mono text-xs font-semibold text-[hsl(var(--muted-foreground))]">정답: {current.english}</span></span></div>}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  {checked === true ? (
                    <button type="button" onClick={nextEntry} data-testid="button-typing-next" className="button-pop inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))]">
                      {position === selected.entries.length - 1 ? '연습 마치기' : '다음 항목'} <ArrowRight size={17} />
                    </button>
                  ) : checked === false ? (
                    <>
                  <button type="submit" data-testid="button-typing-check-again" className="button-pop inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))]">
                        <RotateCcw size={16} /> 다시 확인하기
                      </button>
                      <button type="button" onClick={() => { setAnswer(current.english); setChecked(true); setRevealed(true); }} data-testid="button-typing-reveal" className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] px-4 py-3.5 text-sm font-bold hover:bg-[hsl(var(--muted))]">
                        정답 입력하기 <Check size={16} />
                      </button>
                    </>
                  ) : (
                    <button type="submit" disabled={!answer.trim()} data-testid="button-typing-check" className="button-pop inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3.5 text-sm font-extrabold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50">
                      <Check size={16} /> 정답 확인하기
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
