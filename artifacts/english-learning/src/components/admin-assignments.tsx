import { useEffect, useState } from 'react';
import type {
  Assignment,
  AssignmentFolder,
  AssignmentMember,
  LibraryMaterial,
  LearningContent,
  LearningLevel,
  MaterialType,
} from '@workspace/api-client-react';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  FolderOpen,
  Layers3,
  Library,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  getListAdminLibraryMaterialsQueryKey,
  useCreateAdminLibraryMaterial,
  useDeleteAdminLibraryMaterial,
  useListAdminLibraryMaterials,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { parseDirectMaterial } from '@/lib/practice-material';
import { apiFetch } from '@/lib/api-fetch';
import { LEARNING_CONTENT_UPDATED_EVENT } from '@/lib/learning-content';

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

function getFolderPath(folderId: number, folders: AssignmentFolder[]): string {
  const segments: string[] = [];
  const visited = new Set<number>();
  let folder = folders.find((item) => item.id === folderId);
  while (folder && !visited.has(folder.id)) {
    visited.add(folder.id);
    segments.unshift(folder.name);
    const parentId = folder.parentFolderId;
    folder = parentId == null ? undefined : folders.find((item) => item.id === parentId);
  }
  return segments.join(' / ');
}

function getFolderAndDescendantIds(folderId: number, folders: AssignmentFolder[]): number[] {
  const ids = new Set<number>([folderId]);
  let foundNew = true;
  while (foundNew) {
    foundNew = false;
    folders.forEach((folder) => {
      if (folder.parentFolderId != null && ids.has(folder.parentFolderId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        foundNew = true;
      }
    });
  }
  return [...ids];
}

function getMaterialEntryCount(assignment: Assignment): number {
  return assignment.materialContent?.trim()
    ? parseDirectMaterial(assignment.materialContent, assignment.materialType).length
    : 0;
}

function getWordCount(assignments: Assignment[]): number {
  return assignments
    .filter((assignment) => assignment.materialType === 'word')
    .reduce((total, assignment) => total + getMaterialEntryCount(assignment), 0);
}

export default function AdminAssignments() {
  const queryClient = useQueryClient();
  const libraryQuery = useListAdminLibraryMaterials();
  const createLibraryMaterial = useCreateAdminLibraryMaterial();
  const deleteLibraryMaterial = useDeleteAdminLibraryMaterial();
  const libraryMaterials = libraryQuery.data ?? [];
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [folders, setFolders] = useState<AssignmentFolder[]>([]);
  const [members, setMembers] = useState<AssignmentMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberPasswordConfirm, setNewMemberPasswordConfirm] = useState('');
  const [creatingMember, setCreatingMember] = useState(false);
  const [memberCreateError, setMemberCreateError] = useState('');
  const [memberCreateNotice, setMemberCreateNotice] = useState('');
  const [learningContents, setLearningContents] = useState<LearningContent[]>([]);
  const [libraryHomeContentSelected, setLibraryHomeContentSelected] = useState(false);
  const [level, setLevel] = useState<LearningLevel>('Intermediate');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignmentNotice, setAssignmentNotice] = useState('');
  const [listLevel, setListLevel] = useState<LearningLevel>('Intermediate');
  const [materialFolder, setMaterialFolder] = useState<MaterialType>('sentence');
  const [folderListFilter, setFolderListFilter] = useState('all');
  const [courseFolderOpen, setCourseFolderOpen] = useState(false);
  const [courseFolderName, setCourseFolderName] = useState('');
  const [courseFolderMessage, setCourseFolderMessage] = useState('');
  const [courseFolderError, setCourseFolderError] = useState('');
  const [subfolderName, setSubfolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<number | null>(null);
  const [updatingMemberIds, setUpdatingMemberIds] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<'library' | 'assignments'>('library');
  const [libraryTitle, setLibraryTitle] = useState('');
  const [libraryMaterialType, setLibraryMaterialType] = useState<MaterialType>('sentence');
  const [libraryLevel, setLibraryLevel] = useState<LearningLevel>('Intermediate');
  const [libraryFolderId, setLibraryFolderId] = useState('');
  const [libraryEnglish, setLibraryEnglish] = useState('');
  const [libraryKorean, setLibraryKorean] = useState('');
  const [libraryNotice, setLibraryNotice] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [libraryImportMessage, setLibraryImportMessage] = useState('');
  const [selectedLibraryId, setSelectedLibraryId] = useState<number | null>(null);
  const libraryContent = combineMaterialColumns(libraryEnglish, libraryKorean);
  const selectedLibraryLearningContent = libraryLevel === 'All'
    ? undefined
    : learningContents.find((content) => content.level === libraryLevel);
  const selectedLibraryMaterial = libraryMaterials.find((material) => material.id === selectedLibraryId);

  const loadLearningContents = () => {
    apiFetch('/api/admin/learning-content', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('저장된 과정별 콘텐츠를 불러오지 못했습니다.');
        return response.json() as Promise<LearningContent[]>;
      })
      .then(setLearningContents)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '저장된 콘텐츠 오류');
      });
  };

  const selectedFolderId = /^\d+$/.test(folderListFilter) ? Number(folderListFilter) : null;
  const selectedFolderDescendants = selectedFolderId == null
    ? []
    : getFolderAndDescendantIds(selectedFolderId, folders);
  const visibleAssignments = assignments.filter((assignment) => {
    const matchesCourse = listLevel === 'All'
      ? assignment.level === 'All'
      : assignment.level === listLevel;
    const matchesSubfolder = folderListFilter === 'all'
      || (folderListFilter === 'unfiled'
        ? assignment.folderId == null
        : selectedFolderId != null && assignment.folderId === selectedFolderId);
    return matchesCourse && assignment.materialType === materialFolder && matchesSubfolder;
  });
  const courseAssignments = assignments.filter((assignment) =>
    assignment.level === listLevel && assignment.materialType === materialFolder,
  );
  const courseSubfolders = folders.filter((folder) =>
    (folder.level === listLevel || folder.level == null)
    && (folder.materialType === 'mixed' || folder.materialType === materialFolder),
  );
  const visibleSubfolders = courseSubfolders.filter((folder) =>
    selectedFolderId == null
      ? folder.parentFolderId == null
      : folder.parentFolderId === selectedFolderId,
  );
  const assignmentsForFolderCounter = courseFolderOpen
    ? folderListFilter === '' ? courseAssignments : visibleAssignments
    : assignments.filter((assignment) => assignment.materialType === materialFolder);

  const loadAssignments = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/admin/assignments', {
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
    apiFetch('/api/admin/assignment-folders', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('자료 폴더를 불러오지 못했습니다.');
        return response.json() as Promise<AssignmentFolder[]>;
      })
      .then(setFolders)
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : '자료 폴더 오류');
      });
    apiFetch('/api/admin/members', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return [];
        return response.json() as Promise<AssignmentMember[]>;
      })
      .then(setMembers)
      .catch(() => setMembers([]));
    loadLearningContents();
    const refreshSavedContent = () => {
      loadLearningContents();
      void loadAssignments();
    };
    window.addEventListener(LEARNING_CONTENT_UPDATED_EVENT, refreshSavedContent);
    return () => window.removeEventListener(LEARNING_CONTENT_UPDATED_EVENT, refreshSavedContent);
  }, []);

  const toggleLearningContentSource = () => {
    const shouldLoad = !libraryHomeContentSelected;
    setLibraryHomeContentSelected(shouldLoad);
    if (!shouldLoad || !selectedLibraryLearningContent) {
      setLibraryEnglish('');
      setLibraryKorean('');
      setLibraryImportMessage('');
      return;
    }
    const english = libraryMaterialType === 'word' ? selectedLibraryLearningContent.word : selectedLibraryLearningContent.exampleSentence;
    const korean = libraryMaterialType === 'word' ? selectedLibraryLearningContent.shortMeaning : selectedLibraryLearningContent.exampleKorean;
    setLibraryEnglish(english);
    setLibraryKorean(korean);
    setLibraryImportMessage('초기화면 콘텐츠를 보관함 작성기로 가져왔어요. 필요하면 수정한 뒤 별도 저장하세요.');
    setLibraryError('');
  };

  const loadSelectedFolderMaterials = () => {
    if (selectedFolderId == null || listLevel === 'All') return;
    const folderIds = getFolderAndDescendantIds(selectedFolderId, folders);
    const contentLines = assignments
      .filter((assignment) =>
        assignment.folderId != null
        && folderIds.includes(assignment.folderId)
        && assignment.level === listLevel
        && assignment.materialType === materialFolder,
      )
      .flatMap((assignment) => assignment.materialContent.split(/\r?\n/).filter(Boolean));
    const columns = splitMaterialColumns(contentLines.join('\n'));
    setLibraryLevel(listLevel);
    setLibraryMaterialType(materialFolder);
    setLibraryFolderId(String(selectedFolderId));
    setLibraryTitle(`${getFolderPath(selectedFolderId, folders)} 자료 모음`.slice(0, 160));
    setLibraryEnglish(columns.english);
    setLibraryKorean(columns.korean);
    setLibraryImportMessage(contentLines.length
      ? `${contentLines.length}개 기존 과제 항목을 보관함 작성기로 가져왔습니다. 저장하면 독립된 라이브러리 자료가 됩니다.`
      : '선택한 위치에 가져올 과제가 없습니다. 보관함에서 새로 작성할 수 있습니다.');
    setActiveView('library');
    setLibraryError('');
    window.setTimeout(() => document.getElementById('input-library-title')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };

  const createCourseFolder = async () => {
    const name = courseFolderName.trim();
    if (!name || creatingFolder) return;
    if (listLevel === 'All') {
      setError('초급·중급·고급 과정 중 하나를 선택해 폴더를 만들어 주세요.');
      return;
    }

    setCreatingFolder(true);
    setError('');
    setCourseFolderMessage('');
    setCourseFolderError('');
    try {
      const response = await apiFetch('/api/admin/assignment-folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          materialType: 'mixed',
          level: listLevel,
          parentFolderId: null,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          const foldersResponse = await apiFetch('/api/admin/assignment-folders', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (foldersResponse.ok) {
            const latestFolders = await foldersResponse.json() as AssignmentFolder[];
            const existing = latestFolders.find((folder) =>
              folder.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
              && folder.level === listLevel
              && folder.parentFolderId == null,
            );
            if (existing) {
              setFolders(latestFolders);
              setCourseFolderName('');
              setLevel(listLevel);
              setFolderListFilter(String(existing.id));
              setCourseFolderMessage('같은 이름의 과정 폴더가 이미 있어 기존 폴더를 선택했어요.');
              return;
            }
          }
        }
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '과정 폴더를 만들지 못했습니다.');
      }

      const created = await response.json() as AssignmentFolder;
      setFolders((current) => [created, ...current.filter((folder) => folder.id !== created.id)]);
      setCourseFolderName('');
      setLevel(listLevel);
      setFolderListFilter(String(created.id));
      setCourseFolderMessage('과정 폴더를 만들고 선택했어요.');
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : '과정 폴더 생성 오류';
      setError(message);
      setCourseFolderError(message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const createSubfolder = async () => {
    const name = subfolderName.trim();
    const parentFolder = folders.find((folder) => folder.id === selectedFolderId);
    if (!name || creatingFolder || !parentFolder || parentFolder.level !== listLevel) return;

    setCreatingFolder(true);
    setError('');
    try {
      const response = await apiFetch('/api/admin/assignment-folders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          materialType: 'mixed',
          level: listLevel,
          parentFolderId: selectedFolderId,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '하위 자료 위치를 만들지 못했습니다.');
      }

      const created = await response.json() as AssignmentFolder;
      setFolders((current) => [created, ...current.filter((folder) => folder.id !== created.id)]);
      setSubfolderName('');
      setLevel(listLevel);
      setFolderListFilter(String(created.id));
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '하위 자료 위치 생성 오류');
    } finally {
      setCreatingFolder(false);
    }
  };

  const deleteFolder = async (folder: AssignmentFolder) => {
    if (deletingFolderId != null) return;
    if (!window.confirm(`비어 있는 "${folder.name}" 폴더를 삭제할까요?`)) return;

    setDeletingFolderId(folder.id);
    setError('');
    setCourseFolderMessage('');
    setCourseFolderError('');
    try {
      const response = await apiFetch(`/api/admin/assignment-folders/${folder.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (response.status === 409) {
          throw new Error('하위 폴더나 과제가 있는 폴더는 삭제할 수 없습니다.');
        }
        throw new Error(body?.error || '폴더를 삭제하지 못했습니다.');
      }

      setFolders((current) => current.filter((item) => item.id !== folder.id));
      setCourseFolderMessage(`"${folder.name}" 폴더를 삭제했습니다.`);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : '폴더 삭제 오류';
      setError(message);
      setCourseFolderError(message);
    } finally {
      setDeletingFolderId(null);
    }
  };

  const updateMemberCourse = async (
    memberId: string,
    course: AssignmentMember['course'],
  ) => {
    setUpdatingMemberIds((current) => [...current, memberId]);
    setError('');
    try {
      const response = await apiFetch(`/api/admin/members/${encodeURIComponent(memberId)}/course`, {
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

  const createMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creatingMember) return;
    if (newMemberPassword !== newMemberPasswordConfirm) {
      setMemberCreateError('비밀번호 확인이 일치하지 않습니다.');
      setMemberCreateNotice('');
      return;
    }

    setCreatingMember(true);
    setMemberCreateError('');
    setMemberCreateNotice('');
    try {
      const response = await apiFetch('/api/admin/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newMemberEmail,
          password: newMemberPassword,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '회원 계정을 만들지 못했습니다.');
      }

      const created = await response.json() as AssignmentMember;
      setMembers((current) => [created, ...current.filter((member) => member.id !== created.id)]);
      setNewMemberEmail('');
      setNewMemberPassword('');
      setNewMemberPasswordConfirm('');
      setMemberCreateNotice(`${created.email ?? '회원'} 계정을 만들었습니다. 아래에서 학습 과정을 배정할 수 있어요.`);
    } catch (createError) {
      setMemberCreateError(createError instanceof Error ? createError.message : '회원 계정 생성 오류');
    } finally {
      setCreatingMember(false);
    }
  };

  const saveAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!selectedLibraryMaterial) {
      setError('과제로 배정할 보관함 자료를 먼저 선택해 주세요.');
      return;
    }

    setSaving(true);
    setError('');
    setAssignmentNotice('');
    try {
      const sourceFolder = selectedLibraryMaterial.folderId == null
        ? undefined
        : folders.find((folder) => folder.id === selectedLibraryMaterial.folderId);
      const assignmentFolderId = sourceFolder?.level != null && sourceFolder.level !== level
        ? null
        : selectedLibraryMaterial.folderId;
      const response = await apiFetch('/api/admin/assignments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: selectedLibraryMaterial.title,
          description: '',
          materialType: selectedLibraryMaterial.materialType,
          folderId: assignmentFolderId,
          materialContent: selectedLibraryMaterial.materialContent,
          level,
          assigneeUserId: assigneeUserId || null,
          dueDate: dueDate || null,
          resourcePath: selectedLibraryMaterial.resourcePath,
          resourceName: selectedLibraryMaterial.resourceName,
          isPublished,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '과제를 저장하지 못했습니다.');
      }

      const created = await response.json() as Assignment;
      setAssignments((current) => [created, ...current]);
      setAssignmentNotice(`“${created.title}” 과제를 저장했습니다${isPublished ? ' · 공개 상태' : ' · 비공개 상태'}. 보관함 자료는 별도로 유지됩니다.`);
      setListLevel(level);
      setMaterialFolder(selectedLibraryMaterial.materialType);
      setCourseFolderOpen(true);
      setFolderListFilter(created.folderId == null ? 'all' : String(created.folderId));
      setDueDate('');
      setAssigneeUserId('');
      setIsPublished(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '과제 저장 오류');
    } finally {
      setSaving(false);
    }
  };

  const saveLibraryMaterial = async (event: React.FormEvent) => {
    event.preventDefault();
    const title = libraryTitle.trim();
    const content = libraryContent.trim();
    if (!title) {
      setLibraryError('보관함 자료의 이름을 입력해 주세요.');
      return;
    }
    if (!content) {
      setLibraryError('저장할 영어 단어 또는 문장을 입력해 주세요.');
      return;
    }
    const entries = parseDirectMaterial(content, libraryMaterialType);
    if (entries.length === 0 || entries.length > 200 || content.length > 45000) {
      setLibraryError('자료는 1~200개, 총 45,000자 이내로 입력해 주세요.');
      return;
    }
    if (libraryKorean.trim()) {
      const englishRows = libraryEnglish.replace(/\r/g, '').trimEnd().split('\n');
      const koreanRows = libraryKorean.replace(/\r/g, '').split('\n');
      if (englishRows.length !== koreanRows.length) {
        setLibraryError('영어와 한국어 목록의 줄 수를 맞춰 주세요.');
        return;
      }
    }
    setLibraryError('');
    setLibraryNotice('');
    try {
      await createLibraryMaterial.mutateAsync({
        data: {
          title: title.slice(0, 160),
          materialType: libraryMaterialType,
          folderId: libraryFolderId ? Number(libraryFolderId) : null,
          materialContent: content,
          level: libraryLevel,
          resourcePath: null,
          resourceName: null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListAdminLibraryMaterialsQueryKey() });
      setLibraryNotice('보관함에 저장했습니다. 아직 회원 과제로 배정되지는 않았어요.');
      setLibraryTitle('');
      setLibraryEnglish('');
      setLibraryKorean('');
    } catch (saveError) {
      setLibraryError(saveError instanceof Error ? saveError.message : '보관함에 저장하지 못했습니다.');
    }
  };

  const removeLibraryMaterial = async (material: LibraryMaterial) => {
    if (!window.confirm(`“${material.title}” 보관 자료를 삭제할까요?`)) return;
    setLibraryError('');
    setLibraryNotice('');
    try {
      await deleteLibraryMaterial.mutateAsync({ materialId: material.id });
      await queryClient.invalidateQueries({ queryKey: getListAdminLibraryMaterialsQueryKey() });
      if (selectedLibraryId === material.id) setSelectedLibraryId(null);
      setLibraryNotice('보관 자료를 삭제했습니다.');
    } catch (deleteError) {
      setLibraryError(deleteError instanceof Error ? deleteError.message : '보관 자료를 삭제하지 못했습니다.');
    }
  };

  const prepareAssignmentFromLibrary = (material: LibraryMaterial) => {
    setLevel(material.level);
    setListLevel(material.level);
    setMaterialFolder(material.materialType);
    setSelectedLibraryId(material.id);
    setActiveView('assignments');
    setError('');
    window.setTimeout(() => document.getElementById('course-assignment-registration')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
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
            return libraryMaterialType === 'word'
              ? parseWordFile(contents)
              : parseSentenceFile(contents, /\.csv$/i.test(file.name));
          }),
        )
      ).flat();

      if (importedItems.length === 0) {
        throw new Error('파일에서 영어 단어 또는 문장을 찾지 못했습니다.');
      }

      const currentItems = libraryContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const nextContent = [...currentItems, ...importedItems].join('\n');
      if (parseDirectMaterial(nextContent, libraryMaterialType).length > 200) {
        throw new Error('한 번에 최대 200개까지 등록할 수 있어요. 자료를 나눠 등록해 주세요.');
      }
      if (nextContent.length > 45000) {
        throw new Error('가져온 자료가 너무 많아요. 45,000자 이내로 나눠 등록해 주세요.');
      }

      const columns = splitMaterialColumns(nextContent);
      setLibraryEnglish(columns.english);
      setLibraryKorean(columns.korean);
      const itemLabel = libraryMaterialType === 'word' ? '단어' : '문장';
      setLibraryImportMessage(`${files.length}개 파일에서 ${importedItems.length}개 ${itemLabel}를 보관함 작성기로 가져왔어요.`);
      setLibraryError('');
    } catch (importError) {
      setLibraryImportMessage('');
      setLibraryError(importError instanceof Error ? importError.message : '자료 파일을 불러오지 못했습니다.');
    }
  };

  const removeAssignment = async (assignment: Assignment) => {
    if (!window.confirm(`“${assignment.title}” 과제를 삭제할까요?`)) return;

    const response = await apiFetch(`/api/admin/assignments/${assignment.id}`, {
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
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[hsl(var(--border))] pb-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
            <ClipboardList size={19} />
          </span>
          <div>
            <h2 className="text-xl font-bold">과제 관리</h2>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              자료를 입력하고 과정·폴더를 선택한 뒤 바로 배정하세요.
            </p>
          </div>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          과제 {assignments.length}개 · 단어 {getWordCount(assignments)}개
        </p>
      </div>

      <nav className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[hsl(var(--muted))] p-1.5" aria-label="관리자 자료 작업 단계">
        <button
          type="button"
          onClick={() => setActiveView('library')}
          aria-pressed={activeView === 'library'}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${activeView === 'library' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}
          data-testid="button-admin-library-tab"
        >
          <Library size={16} /> 1. 콘텐츠 보관함
          <span className="font-mono text-[10px]">{libraryMaterials.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveView('assignments')}
          aria-pressed={activeView === 'assignments'}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-colors ${activeView === 'assignments' ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))]'}`}
          data-testid="button-admin-assignment-tab"
        >
          <ClipboardList size={16} /> 2. 과제 배정
          <span className="font-mono text-[10px]">{assignments.length}</span>
        </button>
      </nav>

      {activeView === 'library' && (
        <div className="mt-5 grid gap-5">
          <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.42)] p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><BookOpen size={18} /></span>
              <div>
                <h3 className="font-bold">새 자료를 보관함에 저장</h3>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  직접 작성한 단어·문장을 언제든 다시 꺼내 쓸 수 있습니다. 저장만으로는 과제가 생성되거나 회원에게 공개되지 않습니다.
                </p>
              </div>
            </div>
            <form onSubmit={saveLibraryMaterial} className="mt-5 grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-xs font-bold">
                  보관함 이름
                  <input id="input-library-title" value={libraryTitle} onChange={(event) => setLibraryTitle(event.target.value)} maxLength={160} required placeholder="예: 여행에서 길 묻기" className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm font-normal outline-none focus:border-[hsl(var(--accent))]" data-testid="input-library-title" />
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  콘텐츠 유형
                  <select value={libraryMaterialType} onChange={(event) => setLibraryMaterialType(event.target.value as MaterialType)} className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="select-library-material-type">
                    <option value="sentence">문장</option><option value="word">단어</option>
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  대상 과정
                  <select value={libraryLevel} onChange={(event) => setLibraryLevel(event.target.value as LearningLevel)} className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="select-library-level">
                    {courseOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  자료 폴더 <span className="font-normal text-[hsl(var(--muted-foreground))]">선택 사항</span>
                  <select value={libraryFolderId} onChange={(event) => setLibraryFolderId(event.target.value)} className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--accent))]" data-testid="select-library-folder">
                    <option value="">폴더 없이 보관</option>
                    {folders.filter((folder) => (folder.level === libraryLevel || folder.level == null) && (folder.materialType === 'mixed' || folder.materialType === libraryMaterialType)).map((folder) => <option key={folder.id} value={folder.id}>{getFolderPath(folder.id, folders)}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-xs font-bold">
                  영어 {libraryMaterialType === 'word' ? '단어' : '문장'} <span className="font-normal text-[hsl(var(--muted-foreground))]">한 줄에 하나씩</span>
                  <textarea value={libraryEnglish} onChange={(event) => setLibraryEnglish(event.target.value)} rows={7} maxLength={45000} required placeholder={libraryMaterialType === 'word' ? 'curious\\npatient' : 'Would you mind opening the window?\\nI have been looking for this café.'} className="min-h-36 resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]" data-testid="textarea-library-english" />
                </label>
                <label className="grid gap-2 text-xs font-bold">
                  한국어 뜻·해석 <span className="font-normal text-[hsl(var(--muted-foreground))]">영어와 줄 순서를 맞춰 주세요</span>
                  <textarea value={libraryKorean} onChange={(event) => setLibraryKorean(event.target.value)} rows={7} maxLength={45000} placeholder="호기심 많은\\n참을성 있는" className="min-h-36 resize-y rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-sm leading-relaxed outline-none focus:border-[hsl(var(--accent))]" data-testid="textarea-library-korean" />
                </label>
              </div>
              {libraryLevel !== 'All'
                && selectedLibraryLearningContent
                && !(libraryLevel === 'Intermediate' && libraryMaterialType === 'sentence') && (
                <label className="flex items-start gap-2 rounded-xl border border-[hsl(var(--border))] p-3 text-xs hover:bg-[hsl(var(--muted)/.5)]">
                  <input
                    type="checkbox"
                    checked={libraryHomeContentSelected}
                    onChange={toggleLearningContentSource}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--accent))]"
                    data-testid="checkbox-library-home-content"
                  />
                  <span>
                    <strong>{levelLabels[libraryLevel]} 초기화면 {libraryMaterialType === 'word' ? '단어 콘텐츠' : '문장 콘텐츠'} 가져오기</strong>
                    <span className="mt-1 block text-[hsl(var(--muted-foreground))]">
                      {libraryMaterialType === 'word'
                        ? `${selectedLibraryLearningContent.word} · ${selectedLibraryLearningContent.shortMeaning}`
                        : `${selectedLibraryLearningContent.exampleSentence} · ${selectedLibraryLearningContent.exampleKorean}`}
                    </span>
                  </span>
                </label>
              )}
              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.65)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold">{libraryMaterialType === 'word' ? '단어 파일 여러 개 불러오기' : '문장 파일 여러 개 불러오기'}</p>
                  <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                    TXT·Markdown·CSV를 선택해 보관함 작성기로 가져옵니다. CSV는 영어와 한국어를 같은 행에 둘 수 있습니다.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold transition-colors hover:border-[hsl(var(--accent)/.6)]">
                  <input
                    type="file"
                    multiple
                    accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                      void importMaterialFiles(event.currentTarget.files);
                      event.currentTarget.value = '';
                    }}
                    data-testid="input-library-material-files"
                  />
                  <Upload size={15} /> 파일 선택
                </label>
              </div>
              {libraryImportMessage && <p role="status" className="text-[11px] font-semibold text-[hsl(var(--accent))]" data-testid="status-library-import">{libraryImportMessage}</p>}
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                자료를 직접 작성하거나 가져온 뒤 저장해야 보관함에 추가됩니다. 파일·홈 콘텐츠 가져오기는 과제를 생성하지 않습니다.
              </p>
              {libraryError && <p role="alert" className="rounded-xl bg-[hsl(var(--destructive)/.1)] px-4 py-3 text-sm font-semibold text-[hsl(var(--destructive))]" data-testid="status-library-error">{libraryError}</p>}
              {libraryNotice && <p role="status" className="rounded-xl bg-[hsl(var(--secondary)/.55)] px-4 py-3 text-sm font-semibold text-[hsl(var(--secondary-foreground))]" data-testid="status-library-success">{libraryNotice}</p>}
              <div className="flex justify-end">
                <button type="submit" disabled={createLibraryMaterial.isPending} className="button-pop inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-library-material">
                  {createLibraryMaterial.isPending ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}
                  {createLibraryMaterial.isPending ? '보관 중...' : '보관함에 저장'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-[hsl(var(--border))] p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-bold">저장한 콘텐츠</h3>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">라이브러리에서 항목을 골라 다음 단계에서 과제로 배정하세요.</p>
              </div>
              <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{libraryMaterials.length} items</span>
            </div>
            {libraryQuery.isLoading ? (
              <div className="mt-4 grid gap-2" aria-label="보관함 불러오는 중">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-[hsl(var(--muted))]" />)}</div>
            ) : libraryQuery.isError ? (
              <div className="mt-4 rounded-xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm">
                <p className="font-semibold text-[hsl(var(--destructive))]">보관함을 불러오지 못했습니다.</p>
                <button type="button" onClick={() => void libraryQuery.refetch()} className="mt-2 text-xs font-bold underline underline-offset-4" data-testid="button-retry-library">다시 시도</button>
              </div>
            ) : libraryMaterials.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-8 text-center">
                <Library className="mx-auto text-[hsl(var(--muted-foreground))]" size={24} />
                <p className="mt-3 text-sm font-semibold">아직 저장된 자료가 없습니다.</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">위에서 첫 자료를 보관하면 과제 없이도 언제든 불러올 수 있어요.</p>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {libraryMaterials.map((material) => {
                  const preview = material.materialContent.split(/\r?\n/).filter(Boolean).slice(0, 2);
                  return (
                    <article key={material.id} className={`rounded-xl border p-4 transition-colors ${selectedLibraryId === material.id ? 'border-[hsl(var(--accent)/.65)] bg-[hsl(var(--accent)/.05)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--background)/.4)]'}`} data-testid={`card-library-material-${material.id}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-bold">{material.title}</h4>
                            <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]">{material.materialType === 'word' ? '단어' : '문장'}</span>
                            <span className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{levelLabels[material.level]}</span>
                          </div>
                          <p className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">{preview.join(' · ') || '내용 없음'}</p>
                          <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{material.folderId == null ? '폴더 없음' : getFolderPath(material.folderId, folders)} · {parseDirectMaterial(material.materialContent, material.materialType).length}개 항목</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => prepareAssignmentFromLibrary(material)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]" data-testid={`button-assign-library-${material.id}`}>
                            <ClipboardList size={14} /> 과제로 배정
                          </button>
                          <button type="button" onClick={() => void removeLibraryMaterial(material)} disabled={deleteLibraryMaterial.isPending} aria-label={`${material.title} 보관 자료 삭제`} className="rounded-lg border border-[hsl(var(--border))] px-3 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] disabled:opacity-50" data-testid={`button-delete-library-${material.id}`}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeView === 'assignments' && (
      <>
      <div className="mt-4 flex items-start justify-between gap-4 rounded-xl bg-[hsl(var(--secondary)/.42)] p-4">
        <div>
          <p className="text-sm font-bold">2단계 · 과제 배정</p>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">저장된 보관함 자료를 선택한 뒤 과정·대상·마감일을 지정해 별도의 과제 사본을 발행합니다.</p>
        </div>
        <button type="button" onClick={() => setActiveView('library')} className="shrink-0 text-xs font-bold text-[hsl(var(--accent))] underline underline-offset-4" data-testid="button-back-to-library">보관함으로</button>
      </div>
      <form id="course-assignment-registration" onSubmit={saveAssignment} className="mt-5 grid gap-4">
        <section className="grid gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 sm:p-5">
          <div>
            <p className="text-xs font-bold">배정할 보관함 자료</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">과제 발행은 저장된 콘텐츠를 기준으로 별도 사본을 만듭니다. 이 단계에서 자료 본문은 편집할 수 없습니다.</p>
          </div>
          <label className="grid gap-2 text-xs font-bold">
            저장된 자료 선택
            <select
              value={selectedLibraryId == null ? '' : String(selectedLibraryId)}
              onChange={(event) => {
                const chosen = libraryMaterials.find((material) => String(material.id) === event.target.value);
                if (chosen) prepareAssignmentFromLibrary(chosen);
                else setSelectedLibraryId(null);
              }}
              className="h-12 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 text-sm outline-none focus:border-[hsl(var(--accent))]"
              data-testid="select-assignment-library-material"
            >
              <option value="">보관함 자료 선택</option>
              {libraryMaterials.map((material) => <option key={material.id} value={material.id}>{material.title} · {material.materialType === 'word' ? '단어' : '문장'} · {levelLabels[material.level]}</option>)}
            </select>
          </label>
          {libraryMaterials.length === 0 && (
            <div className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-sm">
              <p className="font-semibold">배정할 보관 자료가 없습니다.</p>
              <button type="button" onClick={() => setActiveView('library')} className="mt-2 text-xs font-bold text-[hsl(var(--accent))] underline underline-offset-4">콘텐츠 보관함에서 자료 만들기</button>
            </div>
          )}
          {selectedLibraryMaterial && (
            <div className="rounded-xl bg-[hsl(var(--card))] p-4" data-testid="preview-assignment-library-material">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold">{selectedLibraryMaterial.title}</h3>
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-bold">{selectedLibraryMaterial.materialType === 'word' ? '단어' : '문장'}</span>
                <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{levelLabels[selectedLibraryMaterial.level]}</span>
              </div>
              <p className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">보관 폴더: {selectedLibraryMaterial.folderId == null ? '폴더 없음' : getFolderPath(selectedLibraryMaterial.folderId, folders)}</p>
              <div className="mt-3 grid gap-2">
                {selectedLibraryMaterial.materialContent.split(/\r?\n/).filter(Boolean).slice(0, 5).map((line, index) => {
                  const [english, korean = ''] = line.split(/\s*\|\|\s*/, 2);
                  return <div key={`${selectedLibraryMaterial.id}-${index}`} className="grid gap-1 border-t border-[hsl(var(--border))] pt-2 text-xs sm:grid-cols-2"><span className="font-semibold">{english}</span><span className="text-[hsl(var(--muted-foreground))]">{korean || '한국어 뜻 없음'}</span></div>;
                })}
                {selectedLibraryMaterial.materialContent.split(/\r?\n/).filter(Boolean).length > 5 && <p className="text-[10px] text-[hsl(var(--muted-foreground))]">외 {selectedLibraryMaterial.materialContent.split(/\r?\n/).filter(Boolean).length - 5}개 항목</p>}
              </div>
              <p className="mt-3 text-[10px] font-semibold text-[hsl(var(--accent))]">발행하면 이 시점의 자료 내용이 과제에 복사됩니다. 이후 보관함 편집과는 독립적입니다.</p>
            </div>
          )}
          <label className="grid gap-2 text-xs font-bold">
            배정 과정
            <select
              value={level}
              onChange={(event) => {
                const nextLevel = event.target.value as LearningLevel;
                setLevel(nextLevel);
                setListLevel(nextLevel);
              }}
              disabled={Boolean(assigneeUserId)}
              className="h-11 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm outline-none focus:border-[hsl(var(--accent))] disabled:opacity-50"
              data-testid="select-assignment-course"
            >
              {courseOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {selectedLibraryMaterial?.folderId != null
            && folders.some((folder) => folder.id === selectedLibraryMaterial.folderId
              && folder.level != null
              && folder.level !== level) && (
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              선택한 자료의 폴더는 다른 과정 전용이라, 다른 과정에 배정하면 과제 사본은 폴더 없이 저장됩니다.
            </p>
          )}
        </section>

        <details className="rounded-2xl border border-[hsl(var(--border))] px-4 py-3">
          <summary className="cursor-pointer text-xs font-bold">
            개별 회원 배정 또는 마감일 설정
            <span className="ml-2 font-normal text-[hsl(var(--muted-foreground))]">선택 사항</span>
          </summary>
          <div className="mt-4 grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <label className="grid min-w-0 content-start gap-2">
            <span className="text-xs font-bold">배정 대상</span>
            <select
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
              className="h-12 w-full min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm font-semibold outline-none focus:border-[hsl(var(--accent))]"
            >
              <option value="">레벨 전체에 배정</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}{member.course ? ` · ${levelLabels[member.course]}` : ''}{member.email ? ` · ${member.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 content-start gap-2">
            <span className="text-xs font-bold">마감일</span>
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className="h-12 w-full min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent))]"
            />
          </label>
          </div>
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          {level === 'All'
            ? `모든 회원에게 표시 · 과정 배정 회원 ${members.filter((member) => member.course !== null).length}명`
            : `${members.filter((member) => member.course === level).length}명의 배정 회원에게 표시`}
        </p>
        </details>

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
            disabled={saving || !selectedLibraryMaterial}
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
      {assignmentNotice && (
        <p role="status" className="mt-4 rounded-xl bg-[hsl(var(--secondary)/.55)] px-4 py-3 text-sm font-semibold text-[hsl(var(--secondary-foreground))]" data-testid="status-assignment-success">
          {assignmentNotice}
        </p>
      )}

      <details id="assignment-management-details" className="mt-7 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.35)]">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-bold marker:hidden">
          회원·폴더·기존 과제 관리
          <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
            회원 {members.length}명 · 자료 폴더 {folders.length}개 · 과제 {assignments.length}개
          </span>
        </summary>
        <div className="border-t border-[hsl(var(--border))] px-5 pb-5">
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
        <form onSubmit={(event) => void createMember(event)} className="mt-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.5)] p-4">
          <div className="mb-3">
            <h4 className="text-sm font-bold">회원 계정 만들기</h4>
            <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
              이메일 주소가 로그인 아이디가 됩니다. 비밀번호는 8자 이상으로 입력하세요.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
            <label className="block text-xs font-semibold">
              로그인 아이디 (이메일)
              <input
                type="email"
                required
                autoComplete="off"
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                placeholder="learner@example.com"
                data-testid="input-new-member-email"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-normal outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <label className="block text-xs font-semibold">
              초기 비밀번호
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newMemberPassword}
                onChange={(event) => setNewMemberPassword(event.target.value)}
                placeholder="8자 이상"
                data-testid="input-new-member-password"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-normal outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <label className="block text-xs font-semibold">
              비밀번호 확인
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newMemberPasswordConfirm}
                onChange={(event) => setNewMemberPasswordConfirm(event.target.value)}
                placeholder="비밀번호 다시 입력"
                data-testid="input-new-member-password-confirm"
                className="mt-1.5 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm font-normal outline-none focus:border-[hsl(var(--accent))]"
              />
            </label>
            <button
              type="submit"
              disabled={creatingMember || !newMemberEmail.trim() || newMemberPassword.length < 8 || !newMemberPasswordConfirm}
              data-testid="button-create-member"
              className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creatingMember ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
              계정 만들기
            </button>
          </div>
          {memberCreateError && (
            <p className="mt-3 text-sm font-semibold text-[hsl(var(--destructive))]" role="alert" data-testid="error-create-member">
              {memberCreateError}
            </p>
          )}
          {memberCreateNotice && (
            <p className="mt-3 text-sm font-semibold text-[hsl(var(--accent))]" role="status" data-testid="status-create-member">
              {memberCreateNotice}
            </p>
          )}
        </form>
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

        <div id="assignment-folder-management" className="mt-9 border-t border-[hsl(var(--border))] pt-7">
        <div className="flex items-center justify-between">
           <div>
             <h3 className="font-bold">자료 폴더</h3>
             <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
               입력한 단어와 문장을 서로 다른 폴더에서 다시 이용할 수 있어요.
             </p>
           </div>
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
              {courseFolderOpen ? visibleAssignments.length : assignments.filter((assignment) => assignment.materialType === materialFolder).length}개
            </span>
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
                   setFolderListFilter('');
                   setCourseFolderOpen(false);
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
          {!courseFolderOpen ? (
            <div className="mt-7">
              <h3 className="font-bold">과정 폴더 선택</h3>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                과정을 선택하면 해당 과정의 과제 하위 폴더로 이동합니다.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ...courseOptions.filter(({ value }) => value !== 'All'),
                  ...(assignments.some((assignment) => assignment.level === 'All' && assignment.materialType === materialFolder)
                    ? courseOptions.filter(({ value }) => value === 'All')
                    : []),
                ].map(({ value, label }) => {
                  const count = assignments.filter((assignment) =>
                    assignment.level === value && assignment.materialType === materialFolder,
                  ).length;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-testid={`button-assignment-course-${value.toLowerCase()}`}
                      onClick={() => {
                        setListLevel(value);
                        setLevel(value);
                        setFolderListFilter('');
                        setCourseFolderOpen(true);
                      }}
                      className="flex min-h-24 items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 text-left transition-colors hover:border-[hsl(var(--accent)/.6)] hover:bg-[hsl(var(--accent)/.06)]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                        <FolderOpen size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{label}</span>
                        <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{count}개 과제</span>
                      </span>
                      <ChevronRight className="text-[hsl(var(--muted-foreground))]" size={18} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-7">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <button
                  type="button"
                  onClick={() => {
                    const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);
                    if (selectedFolderId == null) {
                      setCourseFolderOpen(false);
                      setFolderListFilter('');
                    } else {
                      setFolderListFilter(
                        selectedFolder?.parentFolderId == null
                          ? ''
                          : String(selectedFolder.parentFolderId),
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                >
                  <ArrowLeft size={14} /> {selectedFolderId == null ? '과정 선택' : '상위 폴더'}
                </button>
                <ChevronRight className="text-[hsl(var(--muted-foreground))]" size={14} />
                <span>
                  {selectedFolderId == null
                    ? materialFolder === 'word' ? '단어 폴더' : '문장 폴더'
                    : getFolderPath(selectedFolderId, folders)}
                </span>
              </div>
              <div className="mt-3 rounded-2xl border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.04)] p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]">
                    <FolderOpen size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">상위 폴더 · 과정</span>
                    <span className="mt-0.5 block text-sm font-bold">
                      {courseOptions.find((course) => course.value === listLevel)?.label}
                    </span>
                    <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                      아래 하위 폴더에서 과제를 골라보세요.
                    </span>
                  </span>
                  <ChevronDown className="text-[hsl(var(--accent))]" size={18} />
                </div>
                <div className="ml-5 mt-3 border-l-2 border-[hsl(var(--accent)/.3)] pl-4">
                   <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                     <div>
                       <h3 className="text-xs font-bold text-[hsl(var(--muted-foreground))]">하위 폴더</h3>
                       <p className="mt-1 text-[11px] text-[hsl(var(--muted-foreground))]">
                         새 폴더는 {courseOptions.find((course) => course.value === listLevel)?.label} 바로 아래에 만들어집니다.
                       </p>
                     </div>
                     {listLevel !== 'All' && (
                       <div className="flex w-full gap-2 sm:w-auto">
                         <input
                           value={courseFolderName}
                            onChange={(event) => {
                              setCourseFolderName(event.target.value);
                              setCourseFolderMessage('');
                              setCourseFolderError('');
                            }}
                           onKeyDown={(event) => {
                             if (event.key === 'Enter') {
                               event.preventDefault();
                               void createCourseFolder();
                             }
                           }}
                           maxLength={80}
                           placeholder="새 과정 폴더 이름"
                           aria-label="새 과정 폴더 이름"
                           className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs outline-none focus:border-[hsl(var(--accent))] sm:w-56"
                           data-testid="input-course-folder-name"
                         />
                         <button
                           type="button"
                           onClick={() => void createCourseFolder()}
                           disabled={!courseFolderName.trim() || creatingFolder}
                           className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-50"
                           data-testid="button-create-course-folder"
                         >
                           {creatingFolder ? <LoaderCircle className="animate-spin" size={14} /> : <Plus size={14} />}
                           과정 폴더 만들기
                         </button>
                       </div>
                     )}
                      {courseFolderMessage && (
                        <p role="status" aria-live="polite" className="mt-2 text-xs font-semibold text-[hsl(var(--accent))]">
                          {courseFolderMessage}
                        </p>
                      )}
                      {courseFolderError && (
                        <p role="alert" className="mt-2 text-xs font-semibold text-[hsl(var(--destructive))]">
                          {courseFolderError}
                        </p>
                      )}
                   </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedFolderId == null && (
                      <button
                        type="button"
                        data-testid="button-assignment-subfolder-all"
                        onClick={() => setFolderListFilter('all')}
                        className="flex min-h-20 items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 text-left transition-colors hover:border-[hsl(var(--accent)/.55)]"
                      >
                        <FolderOpen className="shrink-0 text-[hsl(var(--accent))]" size={18} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">전체 자료</span>
                          <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{courseAssignments.length}개 과제</span>
                        </span>
                      </button>
                    )}
                    {visibleSubfolders.map((folder) => {
                      const folderIds = getFolderAndDescendantIds(folder.id, folders);
                      const count = courseAssignments.filter((assignment) =>
                        assignment.folderId != null && folderIds.includes(assignment.folderId),
                      ).length;
                      const hasSubfolders = folders.some((item) => item.parentFolderId === folder.id);
                      const hasAssignments = assignments.some((assignment) => assignment.folderId === folder.id);
                      const canDelete = !hasSubfolders && !hasAssignments;

                      return (
                        <div
                          key={folder.id}
                          className="flex min-h-20 items-stretch overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] transition-colors hover:border-[hsl(var(--accent)/.55)]"
                        >
                          <button
                            type="button"
                            data-testid={`button-assignment-subfolder-${folder.id}`}
                            onClick={() => setFolderListFilter(String(folder.id))}
                            className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left"
                          >
                            <FolderOpen className="shrink-0 text-[hsl(var(--accent))]" size={18} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">{folder.name}</span>
                              <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{count}개 과제 · 하위 폴더 포함</span>
                            </span>
                            <ChevronRight className="shrink-0 text-[hsl(var(--muted-foreground))]" size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteFolder(folder)}
                            disabled={!canDelete || deletingFolderId != null}
                            title={canDelete ? '빈 폴더 삭제' : '과제나 하위 폴더가 있어 삭제할 수 없습니다.'}
                            aria-label={`${folder.name} 폴더 삭제`}
                            data-testid={`button-delete-folder-${folder.id}`}
                            className="m-2 inline-flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-xl text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            {deletingFolderId === folder.id
                              ? <LoaderCircle className="animate-spin" size={16} />
                              : <Trash2 size={16} />}
                          </button>
                        </div>
                      );
                    })}
                    {selectedFolderId == null && courseAssignments.some((assignment) => assignment.folderId == null) && (
                      <button
                        type="button"
                        data-testid="button-assignment-subfolder-unfiled"
                        onClick={() => setFolderListFilter('unfiled')}
                        className="flex min-h-20 items-center gap-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.45)] p-4 text-left transition-colors hover:border-[hsl(var(--accent)/.55)]"
                      >
                        <FolderOpen className="shrink-0 text-[hsl(var(--muted-foreground))]" size={18} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">폴더 없음</span>
                          <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                            {courseAssignments.filter((assignment) => assignment.folderId == null).length}개 과제
                          </span>
                        </span>
                      </button>
                    )}
                    {selectedFolderId != null && visibleSubfolders.length === 0 && (
                      <p className="rounded-xl bg-[hsl(var(--muted)/.45)] px-4 py-5 text-sm text-[hsl(var(--muted-foreground))]">
                        하위 폴더가 없습니다. 이 위치에 과제를 추가하거나 새 하위 폴더를 만들 수 있어요.
                      </p>
                    )}
                  </div>
                  {selectedFolderId != null && listLevel !== 'All' && (
                    <>
                      {folders.find((folder) => folder.id === selectedFolderId)?.level === listLevel && (
                        <div className="mt-4 flex flex-wrap gap-2">
                        <input
                          value={subfolderName}
                          onChange={(event) => setSubfolderName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              void createSubfolder();
                            }
                          }}
                          maxLength={80}
                          placeholder="선택한 위치 아래에 새 폴더 이름"
                          aria-label="하위 자료 폴더 이름"
                          className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs outline-none focus:border-[hsl(var(--accent))] sm:max-w-80"
                          data-testid="input-subfolder-name"
                        />
                        <button
                          type="button"
                          onClick={() => void createSubfolder()}
                          disabled={!subfolderName.trim() || creatingFolder}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid="button-create-subfolder"
                        >
                          {creatingFolder ? <LoaderCircle className="animate-spin" size={14} /> : <Plus size={14} />}
                          하위 폴더 만들기
                        </button>
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[hsl(var(--secondary)/.55)] px-3 py-3">
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          선택한 위치의 과제 자료를 보관함 작성기로 가져와 독립 자료로 저장할 수 있어요.
                        </p>
                        <button
                          type="button"
                          onClick={loadSelectedFolderMaterials}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-xs font-bold text-[hsl(var(--primary-foreground))]"
                          data-testid="button-import-selected-folder"
                        >
                          보관함 작성기로 가져오기
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              {courseAssignments.length === 0 && (
                <p className="mt-4 rounded-xl bg-[hsl(var(--muted)/.55)] px-4 py-5 text-center text-sm text-[hsl(var(--muted-foreground))]">
                  이 과정에 등록된 과제가 없어요.
                </p>
              )}
            </div>
          )}
        {loading ? (
          <LoaderCircle className="mx-auto mt-8 animate-spin text-[hsl(var(--accent))]" size={24} />
         ) : !courseFolderOpen || folderListFilter === '' ? null : visibleAssignments.length === 0 ? (
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
                      {assignment.materialType === 'word' && (
                        <span>{getMaterialEntryCount(assignment)}개 단어</span>
                      )}
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
        </div>
      </details>
      </>
      )}
    </section>
  );
}