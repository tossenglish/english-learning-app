import { useEffect, useState } from 'react';
import type {
  Assignment,
  AssignmentFolder,
  AssignmentMember,
  LearningLevel,
  MaterialType,
} from '@workspace/api-client-react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  FolderOpen,
  Layers3,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { parseDirectMaterial } from '@/lib/practice-material';

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

const materialFolders: Array<{
  value: MaterialType;
  label: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    value: 'sentence',
    label: '문장 폴더',
    description: '입력한 문장 자료',
    icon: FileText,
  },
  {
    value: 'word',
    label: '단어 폴더',
    description: '입력한 단어 자료',
    icon: Layers3,
  },
];

function parseWordFile(contents: string): string[] {
  return contents
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/^\uFEFF/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^(word|english|단어)(?:\s*[,;\t]|$)/i.test(line))
    .map((line) => {
      if (line.includes('||')) return line;
      const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
      const [word, meaning] = splitDelimitedRow(line, delimiter);
      return meaning ? `${word.trim()}||${meaning.trim()}` : line;
    })
    .filter((line) => line.split(/\s*\|\|\s*/, 1)[0].trim().length > 0);
}

function splitDelimitedRow(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      fields.push(field.trim());
      field = '';
    } else {
      field += character;
    }
  }

  fields.push(field.trim());
  return fields;
}

function parseSentenceFile(contents: string, isCsv: boolean): string[] {
  return contents
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/^\uFEFF/, '').replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^(english|sentence|text|문장)(?:\s*[,;\t]|$)/i.test(line))
    .flatMap((line) => {
      if (line.includes('||')) return [line];

      if (isCsv) {
        const delimiter = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
        const [sentence, meaning] = splitDelimitedRow(line, delimiter);
        return sentence ? [meaning ? `${sentence}||${meaning}` : sentence] : [];
      }

      return [line];
    })
    .filter(Boolean);
}

function combineMaterialColumns(englishText: string, koreanText: string): string {
  const englishRows = englishText.replace(/\r/g, '').trimEnd().split('\n');
  const koreanRows = koreanText.replace(/\r/g, '').trimEnd().split('\n');
  if (!englishText.trim()) return '';

  return englishRows
    .map((english, index) => {
      const wordOrSentence = english.trim();
      if (!wordOrSentence) return '';
      const meaning = koreanRows[index]?.trim();
      return meaning ? `${wordOrSentence}||${meaning}` : wordOrSentence;
    })
    .join('\n')
    .trim();
}

function splitMaterialColumns(content: string): { english: string; korean: string } {
  const englishRows: string[] = [];
  const koreanRows: string[] = [];

  content.replace(/\r/g, '').split('\n').forEach((line) => {
    if (!line.trim()) {
      englishRows.push('');
      koreanRows.push('');
      return;
    }

    const [english, korean = ''] = line.split(/\s*\|\|\s*/, 2);
    englishRows.push(english.trim());
    koreanRows.push(korean.trim());
  });

  return {
    english: englishRows.join('\n'),
    korean: koreanRows.join('\n'),
  };
}

export default function AdminAssignments({
  latestUpload,
}: {
  latestUpload: AssignmentResource | null;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [folders, setFolders] = useState<AssignmentFolder[]>([]);
  const [members, setMembers] = useState<AssignmentMember[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [materialType, setMaterialType] = useState<MaterialType>('sentence');
  const [assignmentFolderId, setAssignmentFolderId] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [materialEnglish, setMaterialEnglish] = useState('');
  const [materialKorean, setMaterialKorean] = useState('');
  const [level, setLevel] = useState<LearningLevel>('Intermediate');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [resourcePath, setResourcePath] = useState('');
  const [resourceName, setResourceName] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [materialImportMessage, setMaterialImportMessage] = useState('');
  const [listLevel, setListLevel] = useState<LearningLevel>('Intermediate');
  const [materialFolder, setMaterialFolder] = useState<MaterialType>('sentence');
  const [folderListFilter, setFolderListFilter] = useState('all');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [updatingMemberIds, setUpdatingMemberIds] = useState<string[]>([]);
  const materialContent = combineMaterialColumns(materialEnglish, materialKorean);
  const foldersForMaterialType = folders.filter((folder) => folder.materialType === materialType);

  const visibleAssignments = assignments.filter((assignment) => {
    const matchesCourse = listLevel === 'All'
      ? assignment.level === 'All'
      : assignment.level === listLevel;
    const matchesSubfolder = folderListFilter === 'all'
      || (folderListFilter === 'unfiled'
        ? assignment.folderId == null
        : assignment.folderId === Number(folderListFilter));
    return matchesCourse && assignment.materialType === materialFolder && matchesSubfolder;
  });

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
    fetch('/api/admin/assignment-folders', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('자료 폴더를 불러오지 못했습니다.');
        return response.json() as Promise<AssignmentFolder[]>;
      })
      .then(setFolders)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '자료 폴더 오류');
      });
    fetch('/api/admin/members', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json() as Promise<AssignmentMember[]>;
      })
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const createAssignmentFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingFolder) return;

    setCreatingFolder(true);
    setError('');
    try {
      const response = await fetch('/api/admin/assignment-folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, materialType }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '하위 폴더를 만들지 못했습니다.');
      }

      const created = await response.json() as AssignmentFolder;
      setFolders((current) => [created, ...current.filter((folder) => folder.id !== created.id)]);
      setAssignmentFolderId(String(created.id));
      setNewFolderName('');
      setMaterialFolder(materialType);
      setFolderListFilter(String(created.id));
      setListLevel(level);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '하위 폴더 생성 오류');
    } finally {
      setCreatingFolder(false);
    }
  };

  useEffect(() => {
    if (!latestUpload) return;
    setResourcePath(latestUpload.objectPath);
    setResourceName(latestUpload.name);
  }, [latestUpload]);

  const updateMemberCourse = async (
    memberId: string,
    course: AssignmentMember['course'],
  ) => {
    setUpdatingMemberIds((current) => [...current, memberId]);
    setError('');
    try {
      const response = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/course`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '회원의 과정을 변경하지 못했습니다.');
      }
      const updated = await response.json() as { memberId: string; course: AssignmentMember['course'] };
      setMembers((current) => current.map((member) => (
        member.id === updated.memberId ? { ...member, course: updated.course } : member
      )));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '과정 배정 오류');
    } finally {
      setUpdatingMemberIds((current) => current.filter((id) => id !== memberId));
    }
  };

  const saveAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || saving) return;

    if (materialContent.trim()) {
      if (materialContent.length > 20000) {
        setError('영어와 한글 자료를 합쳐 20,000자 이내로 등록해 주세요.');
        return;
      }
      const entries = parseDirectMaterial(materialContent, materialType);
      if (entries.length === 0) {
        setError('직접 입력한 자료에서 영어 단어 또는 문장을 찾지 못했습니다.');
        return;
      }
      if (entries.length > 200) {
        setError('한 번에 최대 200개까지 등록할 수 있어요. 자료를 나눠 등록해 주세요.');
        return;
      }
      if (materialKorean.trim()) {
        const englishLines = materialEnglish.replace(/\r/g, '').trimEnd().split('\n');
        const koreanLines = materialKorean.replace(/\r/g, '').split('\n');
        if (englishLines.length !== koreanLines.length) {
          setError('영어 목록과 한글 뜻·해석 목록의 줄 수를 맞춰 주세요.');
          return;
        }
      }
    }

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
          folderId: assignmentFolderId ? Number(assignmentFolderId) : null,
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
      setMaterialFolder(materialType);
      setFolderListFilter(created.folderId == null ? 'all' : String(created.folderId));
      setTitle('');
      setDescription('');
      setMaterialEnglish('');
      setMaterialKorean('');
      setMaterialType('sentence');
      setAssignmentFolderId('');
      setMaterialImportMessage('');
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

  const importMaterialFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;

    try {
      const files = Array.from(fileList);
      const importedItems = (
        await Promise.all(
          files.map(async (file) => {
            if (!/\.(txt|md|csv)$/i.test(file.name)) {
              throw new Error('TXT, Markdown 또는 CSV 파일을 선택해 주세요.');
            }
            const contents = await file.text();
            return materialType === 'word'
              ? parseWordFile(contents)
              : parseSentenceFile(contents, /\.csv$/i.test(file.name));
          }),
        )
      ).flat();

      if (importedItems.length === 0) {
        throw new Error('파일에서 영어 단어 또는 문장을 찾지 못했습니다.');
      }

      const currentItems = materialContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const nextContent = [...currentItems, ...importedItems].join('\n');
      if (parseDirectMaterial(nextContent, materialType).length > 200) {
        throw new Error('한 번에 최대 200개까지 등록할 수 있어요. 자료를 나눠 등록해 주세요.');
      }
      if (nextContent.length > 20000) {
        throw new Error('가져온 자료가 너무 많아요. 20,000자 이내로 나눠 등록해 주세요.');
      }

      const columns = splitMaterialColumns(nextContent);
      setMaterialEnglish(columns.english);
      setMaterialKorean(columns.korean);
      const itemLabel = materialType === 'word' ? '단어' : '문장';
      setMaterialImportMessage(`${files.length}개 파일에서 ${importedItems.length}개 ${itemLabel}를 불러왔어요.`);
      setError('');
    } catch (importError) {
      setMaterialImportMessage('');
      setError(importError instanceof Error ? importError.message : '자료 파일을 불러오지 못했습니다.');
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
                onChange={() => {
                  setMaterialType('sentence');
                  setAssignmentFolderId('');
                  setMaterialImportMessage('');
                  setError('');
                }}
                className="sr-only"
              />
              <span className="block text-sm font-bold">문장</span>
              <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">여러 문장을 한 번에 입력하거나 파일로 등록</span>
            </label>
            <label className={`cursor-pointer rounded-xl border p-3 transition-colors ${materialType === 'word' ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)]' : 'border-[hsl(var(--border))]'}`}>
              <input
                type="radio"
                name="material-type"
                value="word"
                checked={materialType === 'word'}
                onChange={() => {
                  setMaterialType('word');
                  setAssignmentFolderId('');
                  setMaterialImportMessage('');
                  setError('');
                }}
                className="sr-only"
              />
              <span className="block text-sm font-bold">단어</span>
              <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">여러 단어를 한 번에 입력하거나 파일로 등록</span>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-2">
              <span className="text-xs font-bold">저장할 하위 폴더</span>
              <select
                value={assignmentFolderId}
                onChange={(event) => setAssignmentFolderId(event.target.value)}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-3 text-sm outline-none focus:border-[hsl(var(--accent))]"
              >
                <option value="">폴더 없이 저장</option>
                {foldersForMaterialType.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">새 하위 폴더</span>
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                maxLength={80}
                placeholder={materialType === 'word' ? '예: 여행 단어' : '예: 일상 회화'}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-3 text-sm outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <button
              type="button"
              onClick={() => void createAssignmentFolder()}
              disabled={!newFolderName.trim() || creatingFolder}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3 text-sm font-bold transition-colors hover:border-[hsl(var(--accent)/.6)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingFolder ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
              하위 폴더 만들기
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-bold">
                {materialType === 'word' ? '영어 단어' : '영어 원문'}
              </span>
              <textarea
                value={materialEnglish}
                onChange={(event) => setMaterialEnglish(event.target.value)}
                maxLength={20000}
                rows={6}
                data-testid="textarea-assignment-material-english"
                placeholder={materialType === 'sentence'
                  ? 'I take a short walk every morning.\nSmall habits make a big difference.'
                  : 'apple\ncurious'}
                className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-bold">
                {materialType === 'word' ? '한글 뜻' : '한글 해석'}
              </span>
              <textarea
                value={materialKorean}
                onChange={(event) => setMaterialKorean(event.target.value)}
                maxLength={20000}
                rows={6}
                data-testid="textarea-assignment-material-korean"
                placeholder={materialType === 'sentence'
                  ? '나는 매일 아침 짧게 산책해요.\n작은 습관이 큰 차이를 만들어요.'
                  : '사과\n호기심 많은'}
                className="resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.5)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold">{materialType === 'word' ? '단어 파일 여러 개 불러오기' : '문장 파일 여러 개 불러오기'}</p>
                  <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    TXT·Markdown·CSV 파일을 여러 개 선택할 수 있어요. {materialType === 'word' ? '한 줄에 단어 하나, CSV는 단어와 뜻 순서예요.' : '문장은 줄마다 하나씩 적거나 CSV에 문장과 뜻을 넣어주세요.'} 한 번에 최대 200개까지 등록할 수 있어요.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold transition-colors hover:border-[hsl(var(--accent)/.6)]">
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                      void importMaterialFiles(event.target.files);
                      event.target.value = '';
                    }}
                    data-testid="input-assignment-material-files"
                  />
                  <Upload size={15} /> 파일 선택
                </label>
            </div>
            {materialImportMessage && (
              <p className="text-[11px] font-semibold text-[hsl(var(--accent))]" data-testid="status-material-import">{materialImportMessage}</p>
            )}
            <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
              영어와 한글은 같은 줄끼리 연결돼요. 여러 항목을 입력할 때 각 입력칸의 줄 순서를 맞춰 주세요. 한글 뜻·해석은 비워둘 수 있어요.
            </span>
          </div>
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
                  {member.displayName}{member.course ? ` · ${levelLabels[member.course]}` : ''}{member.email ? ` · ${member.email}` : ''}
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
             <span className="text-[11px] text-[hsl(var(--muted-foreground))]">
               {level === 'All'
                 ? `모든 회원에게 표시 · 과정 배정 회원 ${members.filter((member) => member.course !== null).length}명`
                 : `${members.filter((member) => member.course === level).length}명의 배정 회원에게 표시`}
             </span>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold">과정 회원 배정</h3>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              회원을 과정에 배정하면 이후 해당 과정에 등록한 과제가 그 회원들에게 함께 표시돼요.
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs text-[hsl(var(--muted-foreground))]">{members.length}명</span>
        </div>
        {members.length === 0 ? (
          <p className="mt-5 rounded-xl bg-[hsl(var(--muted)/.55)] px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            배정할 회원이 없습니다.
          </p>
        ) : (
          <div className="mt-5 divide-y divide-[hsl(var(--border))] rounded-2xl border border-[hsl(var(--border))]">
            {members.map((member) => (
              <div key={member.id} className="flex min-h-[124px] flex-col justify-center gap-3 p-4 sm:min-h-[72px] sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{member.displayName}</p>
                  {member.email && <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{member.email}</p>}
                </div>
                <label className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">학습 과정</span>
                  <select
                    aria-label={`${member.displayName} 학습 과정`}
                    value={member.course ?? ''}
                    disabled={updatingMemberIds.includes(member.id)}
                    onChange={(event) => {
                      const selectedCourse = event.target.value as AssignmentMember['course'] | '';
                      void updateMemberCourse(member.id, selectedCourse || null);
                    }}
                    className="min-w-32 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-semibold outline-none focus:border-[hsl(var(--accent))] disabled:opacity-50"
                  >
                    <option value="">과정 미배정</option>
                    {courseOptions.filter(({ value }) => value !== 'All').map(({ value, label }) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {updatingMemberIds.includes(member.id) && <LoaderCircle className="animate-spin text-[hsl(var(--accent))]" size={16} />}
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

       <div className="mt-9 border-t border-[hsl(var(--border))] pt-7">
        <div className="flex items-center justify-between">
           <div>
             <h3 className="font-bold">자료 폴더</h3>
             <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
               입력한 단어와 문장을 서로 다른 폴더에서 다시 이용할 수 있어요.
             </p>
           </div>
           <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{visibleAssignments.length}개</span>
        </div>
         <div className="mt-5 grid gap-3 sm:grid-cols-2" role="tablist" aria-label="학습자료 폴더 선택">
           {materialFolders.map(({ value, label, description, icon: Icon }) => (
             <button
               key={value}
               type="button"
               role="tab"
               aria-selected={materialFolder === value}
               data-testid={`button-material-folder-${value}`}
                onClick={() => {
                  setMaterialFolder(value);
                  setFolderListFilter('all');
                }}
               className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                 materialFolder === value
                   ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)]'
                   : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] hover:border-[hsl(var(--accent)/.55)]'
               }`}
             >
               <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                 materialFolder === value
                   ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                   : 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
               }`}>
                 <Icon size={18} />
               </span>
               <span>
                 <span className="block text-sm font-bold">{label}</span>
                 <span className="mt-1 block text-[11px] text-[hsl(var(--muted-foreground))]">{description}</span>
               </span>
               <FolderOpen className="ml-auto text-[hsl(var(--muted-foreground))]" size={17} />
             </button>
           ))}
         </div>
         <div className="mt-7 flex items-center justify-between gap-4">
           <div>
             <h3 className="font-bold">
               {materialFolders.find((folder) => folder.value === materialFolder)?.label} · 과정별 목록
             </h3>
             <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
               {courseOptions.find((course) => course.value === listLevel)?.label}에 저장된 자료
             </p>
           </div>
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
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="자료 하위 폴더 선택">
            {[
              { value: 'all', label: '전체 자료' },
              { value: 'unfiled', label: '폴더 없음' },
              ...folders
                .filter((folder) => folder.materialType === materialFolder)
                .map((folder) => ({ value: String(folder.id), label: folder.name })),
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={folderListFilter === value}
                onClick={() => setFolderListFilter(value)}
                className={`rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                  folderListFilter === value
                    ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--foreground))]'
                    : 'border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent)/.6)]'
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
                      {assignment.folderId != null && (
                        <span className="flex items-center gap-1">
                          <FolderOpen size={12} />
                          {folders.find((folder) => folder.id === assignment.folderId)?.name || '하위 폴더'}
                        </span>
                      )}
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