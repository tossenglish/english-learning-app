import { useEffect, useState } from 'react';
import type {
  Assignment,
  AssignmentMember,
  LearningLevel,
  MaterialType,
} from '@workspace/api-client-react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';

export type AssignmentResource = {
  name: string;
  objectPath: string;
};

const levelLabels: Record<LearningLevel, string> = {
  Beginner: '초급',
  Intermediate: '중급',
  Advanced: '고급',
  All: '전체 레벨',
};

const courseOptions: Array<{ value: LearningLevel; label: string }> = [
  { value: 'Beginner', label: '초급 과정' },
  { value: 'Intermediate', label: '중급 과정' },
  { value: 'Advanced', label: '고급 과정' },
  { value: 'All', label: '공통 과정' },
];

export default function AdminAssignments({
  latestUpload,
}: {
  latestUpload: AssignmentResource | null;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<AssignmentMember[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('sentence');
  const [materialContent, setMaterialContent] = useState('');
  const [level, setLevel] = useState<LearningLevel>('Intermediate');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [resourcePath, setResourcePath] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [listLevel, setListLevel] = useState<LearningLevel>('Intermediate');

  const visibleAssignments = assignments.filter((assignment) =>
    listLevel === 'All' ? assignment.level === 'All' : assignment.level === listLevel,
  );

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/assignments', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('과제 목록을 불러오지 못했습니다.');
      setAssignments(await response.json() as Assignment[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '과제 목록 오류');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssignments();
    fetch('/api/admin/members', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json() as Promise<AssignmentMember[]>;
      })
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!latestUpload) return;
    setResourcePath(latestUpload.objectPath);
    setResourceName(latestUpload.name);
  }, [latestUpload]);

  const saveAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/assignments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          materialType,
          materialContent: materialContent.trim(),
          level,
          assigneeUserId: assigneeUserId || null,
          dueDate: dueDate || null,
          resourcePath: resourcePath || null,
          resourceName: resourceName || null,
          isPublished,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '과제를 저장하지 못했습니다.');
      }

      const created = await response.json() as Assignment;
      setAssignments((current) => [created, ...current]);
      setListLevel(level);
      setTitle('');
      setDescription('');
      setMaterialContent('');
      setMaterialType('sentence');
      setDueDate('');
      setAssigneeUserId('');
      setResourcePath('');
      setResourceName('');
      setIsPublished(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '과제 저장 오류');
    } finally {
      setSaving(false);
    }
  };

  const removeAssignment = async (assignment: Assignment) => {
    if (!window.confirm(`“${assignment.title}” 과제를 삭제할까요?`)) return;

    const response = await fetch(`/api/admin/assignments/${assignment.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) {
      setError('과제를 삭제하지 못했습니다.');
      return;
    }
    setAssignments((current) => current.filter(({ id }) => id !== assignment.id));
  };

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-9">
       <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <ClipboardList size={20} />
        </span>
        <div>
           <h2 className="text-xl font-bold">과정별 과제 등록</h2>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
             과정을 선택해 저장하면 해당 과정 회원에게만 과제가 보여요.
          </p>
        </div>
      </div>

      <form onSubmit={saveAssignment} className="mt-7 grid gap-5">
        <label className="grid gap-2">
          <span className="text-xs font-bold">과제 제목</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
            placeholder="예: 오늘의 표현 3문장 받아쓰기"
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:border-[hsl(var(--accent))]"
          />
        </label>
        <div className="grid gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 sm:p-5">
          <div>
            <span className="text-xs font-bold">학습자료 유형</span>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
              파일을 첨부하지 않아도 직접 입력한 내용을 회원에게 바로 연습 자료로 제공할 수 있어요.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-3 transition-colors ${materialType === 'sentence' ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)]' : 'border-[hsl(var(--border))]'}`}>
              <input
                type="radio"
                name="material-type"
                value="sentence"
                checked={materialType === 'sentence'}
                onChange={() => setMaterialType('sentence')}
                className="sr-only"
              />
              <span className="block text-sm font-bold">문장</span>
              <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">한 줄에 영어 문장 하나</span>
            </label>
            <label className={`cursor-pointer rounded-xl border p-3 transition-colors ${materialType === 'word' ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)]' : 'border-[hsl(var(--border))]'}`}>
              <input
                type="radio"
                name="material-type"
                value="word"
                checked={materialType === 'word'}
                onChange={() => setMaterialType('word')}
                className="sr-only"
              />
              <span className="block text-sm font-bold">단어</span>
              <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">한 줄에 단어 하나</span>
            </label>
          </div>
          <label className="grid gap-2">
            <span className="text-xs font-bold">직접 입력 자료</span>
            <textarea
              value={materialContent}
              onChange={(event) => setMaterialContent(event.target.value)}
              maxLength={20000}
              rows={6}
              placeholder={materialType === 'sentence'
                ? 'I take a short walk every morning.\nSmall habits make a big difference.||작은 습관이 큰 차이를 만들어요.'
                : 'apple||사과\ncurious||호기심 많은'}
              className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
            />
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              줄바꿈으로 항목을 나눠요. 영어 뒤에 <strong>||</strong>를 쓰면 한글 뜻도 직접 입력할 수 있어요.
            </span>
          </label>
        </div>
        <label className="grid gap-2">
          <span className="text-xs font-bold">학습 안내</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="회원이 수행할 내용을 적어주세요."
            className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
          />
        </label>
         <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-2">
            <span className="text-xs font-bold">배정 대상</span>
            <select
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm font-semibold outline-none focus:border-[hsl(var(--accent))]"
            >
              <option value="">레벨 전체에 배정</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}{member.email ? ` · ${member.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
             <span className="text-xs font-bold">배정 과정</span>
            <select
              value={level}
              onChange={(event) => setLevel(event.target.value as LearningLevel)}
              disabled={Boolean(assigneeUserId)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm font-semibold outline-none focus:border-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
            >
               {courseOptions.map(({ value, label }) => (
                 <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2">
            <span className="text-xs font-bold">마감일</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>
        </div>

        {resourcePath && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[hsl(var(--secondary)/.7)] px-4 py-3">
            <span className="flex min-w-0 items-center gap-2 text-xs font-bold">
              <FileText size={16} />
              <span className="truncate">{resourceName || '첨부 자료'}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setResourcePath('');
                setResourceName('');
              }}
              className="text-xs font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              첨부 해제
            </button>
          </div>
        )}

        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--accent))]"
            />
            등록 즉시 회원에게 공개
          </label>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="button-pop inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-45"
          >
            {saving ? <LoaderCircle className="animate-spin" size={17} /> : <Plus size={17} />}
            {saving ? '저장 중...' : '과제 등록'}
          </button>
        </div>
      </form>

      {error && (
        <p className="mt-5 rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]">
          {error}
        </p>
      )}

       <div className="mt-9 border-t border-[hsl(var(--border))] pt-7">
        <div className="flex items-center justify-between">
           <div>
             <h3 className="font-bold">과정별 등록 과제</h3>
             <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
               {courseOptions.find((course) => course.value === listLevel)?.label}에 저장된 과제
             </p>
           </div>
           <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{visibleAssignments.length}개</span>
        </div>
         <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="과제 과정 선택">
           {courseOptions.map(({ value, label }) => (
             <button
               key={value}
               type="button"
               role="tab"
               aria-selected={listLevel === value}
               data-testid={`button-assignment-course-${value.toLowerCase()}`}
               onClick={() => setListLevel(value)}
               className={`rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                 listLevel === value
                   ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                   : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent)/.6)] hover:text-[hsl(var(--foreground))]'
               }`}
             >
               {label}
             </button>
           ))}
         </div>
        {loading ? (
          <LoaderCircle className="mx-auto mt-8 animate-spin text-[hsl(var(--accent))]" size={24} />
         ) : visibleAssignments.length === 0 ? (
          <p className="mt-6 rounded-xl bg-[hsl(var(--muted)/.55)] px-4 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
             이 과정에 등록된 과제가 없어요.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
             {visibleAssignments.map((assignment) => (
              <article key={assignment.id} className="rounded-2xl border border-[hsl(var(--border))] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[hsl(var(--secondary))] px-2.5 py-1 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">
                        {assignment.assigneeUserId
                          ? `개별 · ${assignment.assigneeName || '회원'}`
                          : levelLabels[assignment.level]}
                      </span>
                      {!assignment.isPublished && (
                        <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 text-[10px] font-bold">비공개</span>
                      )}
                    </div>
                    <h4 className="mt-2 font-bold">{assignment.title}</h4>
                    {assignment.description && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{assignment.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">
                      {assignment.dueDate && <span className="flex items-center gap-1"><CalendarDays size={12} /> {assignment.dueDate}</span>}
                      {assignment.resourceName && <span className="flex items-center gap-1"><FileText size={12} /> {assignment.resourceName}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeAssignment(assignment)}
                    aria-label={`${assignment.title} 삭제`}
                    className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}