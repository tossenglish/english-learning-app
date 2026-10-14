import { useEffect, useState } from 'react';
import type { Assignment, LearningLevel } from '@workspace/api-client-react';
import { apiFetch, openApiFile } from '@/lib/api-fetch';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  MessageCircle,
  SpellCheck,
} from 'lucide-react';

const levelLabels: Record<LearningLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
  All: '공통',
};

export default function LevelAssignments({
  level,
  isAdmin,
  onStartPractice,
}: {
  level: Exclude<LearningLevel, 'All'>;
  isAdmin: boolean;
  onStartPractice?: (assignment: Assignment) => Promise<void>;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'word' | 'sentence'>('word');
  const [startingId, setStartingId] = useState<number | null>(null);
  const [practiceError, setPracticeError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    apiFetch(isAdmin
      ? '/api/admin/assignments'
      : `/api/assignments?level=${encodeURIComponent(level)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json() as Promise<Assignment[]>;
      })
      .then((loaded) => {
        setAssignments(isAdmin
          ? loaded.filter((assignment) =>
            assignment.isPublished && (assignment.level === level || assignment.level === 'All'))
          : loaded);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAssignments([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [isAdmin, level]);

  const selectedAssignments = assignments.filter((assignment) => assignment.materialType === selectedType);
  const wordCount = assignments.filter((assignment) => assignment.materialType === 'word').length;
  const sentenceCount = assignments.filter((assignment) => assignment.materialType === 'sentence').length;

  const startPractice = async (assignment: Assignment) => {
    if (!onStartPractice || startingId != null) return;
    setStartingId(assignment.id);
    setPracticeError('');
    try {
      await onStartPractice(assignment);
    } catch (error) {
      setPracticeError(error instanceof Error ? error.message : '과제를 열지 못했습니다.');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <section className="rise-in stagger-1 overflow-hidden rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-[var(--shadow-sm)]" data-testid="panel-assigned-practice">
      <div className="flex flex-col gap-5 border-b border-[hsl(var(--border))] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--accent))]">Assigned practice</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">출제된 과제</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">단어와 문장 과제를 골라 바로 연습해요.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[hsl(var(--muted)/.65)] p-1.5" role="tablist" aria-label="과제 종류">
          {([
            { value: 'word', label: '단어 과제', count: wordCount, icon: SpellCheck },
            { value: 'sentence', label: '문장 과제', count: sentenceCount, icon: MessageCircle },
          ] as const).map(({ value, label, count, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={selectedType === value}
              aria-controls="assigned-practice-list"
              onClick={() => { setSelectedType(value); setPracticeError(''); }}
              className={`flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-colors ${selectedType === value ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
              data-testid={`tab-assigned-${value}`}
            >
              <Icon size={15} />
              {label}
              <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${selectedType === value ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-[hsl(var(--background))]'}`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div id="assigned-practice-list" role="tabpanel" className="p-6 sm:p-8">
        {practiceError && <p role="alert" className="mb-4 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]" data-testid="status-assigned-practice-error">{practiceError}</p>}
        {loading ? (
          <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <LoaderCircle className="animate-spin text-[hsl(var(--accent))]" size={20} /> 과제를 불러오는 중이에요.
          </div>
        ) : selectedAssignments.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] px-5 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
              {selectedType === 'word' ? <SpellCheck size={19} /> : <MessageCircle size={19} />}
            </span>
            <p className="mt-3 text-sm font-bold">{selectedType === 'word' ? '등록된 단어 과제가 없어요' : '등록된 문장 과제가 없어요'}</p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{levelLabels[level]} 레벨에 새 과제가 출제되면 여기에 표시돼요.</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {selectedAssignments.map((assignment) => (
            <article key={assignment.id} className="flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.75)] p-5" data-testid={`card-assigned-${selectedType}-${assignment.id}`}>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">
                  {levelLabels[assignment.level]}
                </span>
                {assignment.dueDate && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                    <CalendarDays size={11} /> {assignment.dueDate}
                  </span>
                )}
              </div>
              <h4 className="mt-3 font-bold">{assignment.title}</h4>
                <span className="mt-1 inline-flex w-fit rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">
                  {assignment.materialType === 'word' ? '단어 과제' : '문장 과제'}
              </span>
              {assignment.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{assignment.description}</p>
              )}
              {assignment.resourcePath && (
                <a
                  href={`/api/storage${assignment.resourcePath}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    event.preventDefault();
                    void openApiFile(`/api/storage${assignment.resourcePath}`).catch((error: unknown) => {
                      window.alert(error instanceof Error ? error.message : '첨부 파일을 열지 못했습니다.');
                    });
                  }}
                  className="mt-4 flex items-center justify-between border-t border-[hsl(var(--border))] pt-3 text-xs font-bold text-[hsl(var(--accent))]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText size={14} />
                    <span className="truncate">{assignment.resourceName || '첨부 자료 열기'}</span>
                  </span>
                  <ArrowRight size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={() => void startPractice(assignment)}
                disabled={startingId != null}
                className="button-pop mt-auto flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-wait disabled:opacity-70"
                data-testid={`button-start-assigned-${selectedType}-${assignment.id}`}
              >
                {startingId === assignment.id ? <LoaderCircle className="animate-spin" size={14} /> : <ClipboardCheck size={14} />}
                {startingId === assignment.id ? '자료를 준비하고 있어요' : '이 과제 연습하기'} <ArrowRight size={14} />
              </button>
            </article>
          ))}
          </div>
        )}
      </div>
    </section>
  );
}