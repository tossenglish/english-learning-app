import { useEffect, useState } from 'react';
import type { Assignment, LearningLevel } from '@workspace/api-client-react';
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  FileText,
  LoaderCircle,
} from 'lucide-react';

const levelLabels: Record<LearningLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
  All: '공통',
};

export default function LevelAssignments({
  level,
  onAssignmentsChange,
  onStartPractice,
}: {
  level: Exclude<LearningLevel, 'All'>;
  onAssignmentsChange?: (assignments: Assignment[]) => void;
  onStartPractice?: (assignment: Assignment) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/assignments?level=${encodeURIComponent(level)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json() as Promise<Assignment[]>;
      })
      .then((loaded) => {
        setAssignments(loaded);
        onAssignmentsChange?.(loaded);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAssignments([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [level, onAssignmentsChange]);

  return (
    <section className="rise-in stagger-2 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Level assignments</p>
          <h3 className="mt-2 text-lg font-bold">나에게 배정된 과제</h3>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <ClipboardCheck size={19} />
        </span>
      </div>

      {loading ? (
        <LoaderCircle className="mx-auto mt-7 animate-spin text-[hsl(var(--accent))]" size={22} />
      ) : assignments.length === 0 ? (
        <p className="mt-5 rounded-xl bg-[hsl(var(--muted)/.55)] px-4 py-6 text-center text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
          현재 {levelLabels[level]} 레벨에 등록된 과제가 없어요.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {assignments.map((assignment) => (
            <article key={assignment.id} className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.75)] p-4">
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
              {assignment.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{assignment.description}</p>
              )}
              {assignment.resourcePath && (
                <a
                  href={`/api/storage${assignment.resourcePath}`}
                  target="_blank"
                  rel="noreferrer"
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
                onClick={() => onStartPractice?.(assignment)}
                className="button-pop mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))]"
              >
                이 자료로 연습 시작 <ArrowRight size={14} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}