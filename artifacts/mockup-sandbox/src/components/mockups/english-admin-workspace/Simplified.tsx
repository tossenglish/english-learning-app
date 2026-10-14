import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Archive,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  FileUp,
  Folder,
  Layers3,
  ListFilter,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import './_group.css';
import './Simplified.css';

type Course = '초급' | '중급' | '고급';
type Kind = '단어' | '문장';
type Assignment = {
  id: number;
  title: string;
  course: Course;
  kind: Kind;
  folder: string;
  count: number;
  due: string;
  published: boolean;
  assignee: string;
};
type Member = { id: number; name: string; course: Course };

const seedAssignments: Assignment[] = [
  { id: 1, title: '카페에서 쓰는 표현', course: '중급', kind: '문장', folder: '일상 회화', count: 8, due: '6월 20일', published: true, assignee: '전체 과정' },
  { id: 2, title: '여행 필수 단어', course: '초급', kind: '단어', folder: '여행 준비', count: 12, due: '6월 18일', published: true, assignee: '전체 과정' },
  { id: 3, title: '회의에서 의견 말하기', course: '고급', kind: '문장', folder: '비즈니스 표현', count: 6, due: '기한 없음', published: false, assignee: '전체 과정' },
];
const seedMembers: Member[] = [
  { id: 1, name: '김민지', course: '중급' },
  { id: 2, name: '이준호', course: '초급' },
  { id: 3, name: '박서연', course: '중급' },
  { id: 4, name: '최도윤', course: '고급' },
];
const starterEnglish = 'Could I get this to go?\nI stumbled upon a little café.';
const starterKorean = '이거 포장해 주실 수 있나요?\n작은 카페를 우연히 발견했어요.';
const courseNames: Course[] = ['초급', '중급', '고급'];

function parseFile(text: string) {
  return text.replace(/\r/g, '').split('\n').map((line) => {
    const parts = line.split(/\s*(?:\|\||,|\t|;)\s*/);
    return { en: parts[0]?.trim() ?? '', ko: parts.slice(1).join(' ').trim() };
  }).filter((row) => row.en);
}

export default function Simplified() {
  const [assignments, setAssignments] = useState(seedAssignments);
  const [members, setMembers] = useState(seedMembers);
  const [kind, setKind] = useState<Kind>('문장');
  const [course, setCourse] = useState<Course>('중급');
  const [folder, setFolder] = useState('일상 회화');
  const [folders, setFolders] = useState<Record<Course, string[]>>({
    초급: ['여행 준비'], 중급: ['일상 회화', '카페에서'], 고급: ['비즈니스 표현'],
  });
  const [english, setEnglish] = useState(starterEnglish);
  const [korean, setKorean] = useState(starterKorean);
  const [due, setDue] = useState('');
  const [target, setTarget] = useState('전체 과정');
  const [selectedMember, setSelectedMember] = useState('김민지');
  const [published, setPublished] = useState(true);
  const [newFolder, setNewFolder] = useState('');
  const [showFolderForm, setShowFolderForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [filterCourse, setFilterCourse] = useState<'전체' | Course>('전체');
  const [filterKind, setFilterKind] = useState<'전체' | Kind>('전체');
  const [search, setSearch] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const enRows = english.replace(/\r/g, '').split('\n');
    const koRows = korean.replace(/\r/g, '').split('\n');
    return enRows.map((en, i) => ({ en, ko: koRows[i] ?? '' })).filter((row) => row.en.trim() || row.ko.trim());
  }, [english, korean]);

  const filteredAssignments = assignments.filter((item) =>
    (filterCourse === '전체' || item.course === filterCourse)
    && (filterKind === '전체' || item.kind === filterKind)
    && item.title.toLowerCase().includes(search.toLowerCase()),
  );

  const changeCourse = (next: Course) => {
    setCourse(next);
    setFolder(folders[next][0] ?? '');
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name)) {
      setNotice('TXT, Markdown 또는 CSV 파일을 선택해 주세요.');
      return;
    }
    const imported = parseFile(await file.text());
    if (!imported.length) {
      setNotice('파일에서 자료를 찾지 못했어요. 내용을 확인해 주세요.');
      return;
    }
    setEnglish(imported.map((row) => row.en).join('\n'));
    setKorean(imported.map((row) => row.ko).join('\n'));
    setFileName(file.name);
    setNotice(`${imported.length}개 자료를 불러왔어요.`);
    event.target.value = '';
  };

  const createFolder = () => {
    const name = newFolder.trim();
    if (!name) return;
    if (folders[course].some((item) => item.toLowerCase() === name.toLowerCase())) {
      setNotice('같은 이름의 폴더가 이미 있어요.');
      return;
    }
    setFolders((prev) => ({ ...prev, [course]: [...prev[course], name] }));
    setFolder(name);
    setNewFolder('');
    setShowFolderForm(false);
    setNotice('과정 폴더를 만들고 선택했어요.');
  };

  const saveAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const englishLines = english.replace(/\r/g, '').trimEnd().split('\n');
    const koreanLines = korean.replace(/\r/g, '').trimEnd().split('\n');
    const aligned = rows.length > 0
      && englishLines.length === koreanLines.length
      && rows.every((row) => row.en.trim() && row.ko.trim());
    if (!aligned) {
      setNotice('영어와 한글을 같은 줄에 입력해 주세요.');
      return;
    }
    const title = rows[0].en.trim().slice(0, 30);
    const dueLabel = due ? `${Number(due.slice(5, 7))}월 ${Number(due.slice(8, 10))}일` : '기한 없음';
    const created: Assignment = {
      id: Date.now(),
      title,
      course,
      kind,
      folder: folder || '미분류',
      count: rows.length,
      due: dueLabel,
      published,
      assignee: target === '개별 회원' ? selectedMember : '전체 과정',
    };
    setAssignments((current) => [created, ...current]);
    setNotice(published ? '과제를 공개했어요.' : '임시 저장했어요.');
    setEnglish('');
    setKorean('');
    setDue('');
    setFileName('');
  };

  const updateMemberCourse = (memberId: number, next: Course) => {
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, course: next } : member));
    setNotice('회원의 과정 배정을 변경했어요.');
  };

  return (
    <main className="ew-shell">
      <aside className="ew-rail">
        <div className="ew-brand-mark">L</div>
        <div className="ew-rail-line" />
        <button className="ew-rail-icon is-current" aria-label="과제 관리"><Layers3 size={19} /></button>
        <button className="ew-rail-icon" aria-label="회원 관리" onClick={() => setShowMembers((v) => !v)}><Users size={19} /></button>
        <button className="ew-rail-icon" aria-label="도움말" onClick={() => setNotice('영어와 한글을 한 줄씩 짝지어 입력하면 됩니다.')}><CircleHelp size={19} /></button>
        <div className="ew-rail-bottom"><div className="ew-avatar">관</div></div>
      </aside>

      <section className="ew-content">
        <header className="ew-topbar">
          <div className="ew-breadcrumb"><span>관리자</span><span className="ew-slash">/</span><b>과제 관리</b></div>
          <div className="ew-top-right"><span className="ew-online"><i /> 모든 변경사항이 이 기기에 저장돼요</span><div className="ew-avatar">관</div></div>
        </header>

        <div className="ew-page">
          <div className="ew-heading">
            <div>
              <div className="ew-eyebrow">LEARNING WORKSPACE <span>·</span> 과정 운영</div>
              <h1>과제 관리</h1>
              <p>자료를 만들고, 과정에 바로 배정하세요.</p>
            </div>
            <button className="ew-outline-btn" onClick={() => setShowMembers((v) => !v)}><Users size={16} /> 회원 과정 배정</button>
          </div>

          <div className="ew-quick-stats" aria-label="과제 요약">
            <div><span className="ew-stat-icon teal"><BookOpen size={17} /></span><strong>{assignments.length}</strong><small>전체 과제</small></div>
            <div><span className="ew-stat-icon coral"><Send size={16} /></span><strong>{assignments.filter((item) => item.published).length}</strong><small>공개 중</small></div>
            <div><span className="ew-stat-icon gold"><Archive size={16} /></span><strong>{assignments.filter((item) => !item.published).length}</strong><small>임시 저장</small></div>
            <div className="ew-stats-note">오늘도 한 걸음씩<br /><b>수업 준비가 쉬워집니다.</b></div>
          </div>

          {showMembers && (
            <section className="ew-members-panel">
              <div className="ew-panel-heading"><div><span className="ew-kicker">MEMBER COURSE</span><h2>회원 과정 배정</h2></div><button className="ew-icon-btn" onClick={() => setShowMembers(false)} aria-label="닫기"><X size={18} /></button></div>
              <p className="ew-panel-copy">회원별 학습 과정을 간단히 변경할 수 있어요.</p>
              <div className="ew-member-grid">{members.map((member) => (
                <div className="ew-member-row" key={member.id}>
                  <div className="ew-avatar small">{member.name.slice(0, 1)}</div><div className="ew-member-name">{member.name}<small>수강 회원</small></div>
                  <select value={member.course} onChange={(event) => updateMemberCourse(member.id, event.target.value as Course)} aria-label={`${member.name} 과정`}>
                    {courseNames.map((name) => <option key={name}>{name}</option>)}
                  </select>
                </div>
              ))}</div>
            </section>
          )}

          <div className="ew-workspace-grid">
            <form className="ew-compose" onSubmit={saveAssignment}>
              <div className="ew-compose-head">
                <div><span className="ew-step">새 과제</span><h2>자료 입력</h2></div>
                <span className="ew-form-hint"><span className="ew-required">*</span> 필수 항목</span>
              </div>

              <div className="ew-field">
                <label>자료 유형 <span className="ew-required">*</span></label>
                <div className="ew-segmented">
                  {(['문장', '단어'] as Kind[]).map((item) => <button type="button" key={item} className={kind === item ? 'selected' : ''} onClick={() => setKind(item)}>{item === '문장' ? <BookOpen size={16} /> : <Layers3 size={16} />}{item}</button>)}
                </div>
              </div>

              <div className="ew-course-folder">
                <div className="ew-field">
                  <label htmlFor="course">과정 <span className="ew-required">*</span></label>
                  <div className="ew-select-wrap"><select id="course" value={course} onChange={(e) => changeCourse(e.target.value as Course)}>{courseNames.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></div>
                </div>
                <div className="ew-field">
                  <label htmlFor="folder">자료 폴더 <span className="ew-optional">선택</span></label>
                  <div className="ew-folder-row"><div className="ew-select-wrap"><Folder size={15} className="ew-select-icon" /><select id="folder" value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">폴더 선택 안 함</option>{folders[course].map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></div><button type="button" className="ew-add-folder" onClick={() => setShowFolderForm((v) => !v)} aria-label="폴더 추가"><Plus size={17} /></button></div>
                </div>
              </div>

              {showFolderForm && <div className="ew-new-folder"><input autoFocus value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder={`${course} 새 폴더 이름`} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder(); } }} /><button type="button" onClick={createFolder}>폴더 만들기</button><button type="button" className="ew-cancel-folder" onClick={() => setShowFolderForm(false)} aria-label="취소"><X size={15} /></button></div>}

              <div className="ew-material-heading">
                <label>학습 자료 <span className="ew-required">*</span></label>
                <div><input ref={fileInput} type="file" accept=".txt,.md,.csv" hidden onChange={importFile} /><button type="button" className="ew-upload-btn" onClick={() => fileInput.current?.click()}><FileUp size={15} /> 파일 불러오기</button></div>
              </div>
              <div className="ew-editor">
                <div className="ew-editor-columns"><div className="ew-editor-col"><div className="ew-editor-label"><span>EN</span> 영어</div><textarea value={english} onChange={(e) => setEnglish(e.target.value)} placeholder={kind === '문장' ? '예: Could I get this to go?' : '예: curious'} aria-label="영어 자료" /></div><div className="ew-editor-col"><div className="ew-editor-label"><span>한</span> 한글 뜻·해석</div><textarea value={korean} onChange={(e) => setKorean(e.target.value)} placeholder="영어와 같은 순서로 입력해 주세요" aria-label="한글 뜻 또는 해석" /></div></div>
                <div className="ew-editor-footer"><span>{fileName ? <><Check size={13} /> {fileName}</> : '영어와 한글을 같은 순서로, 한 줄씩 입력해 주세요.'}</span><b>{rows.length}개 자료</b></div>
              </div>

              <div className="ew-assignment-options">
                <div className="ew-field ew-target-field">
                  <label>배정 대상</label>
                  <div className="ew-target-toggle"><button type="button" className={target === '전체 과정' ? 'active' : ''} onClick={() => setTarget('전체 과정')}>과정 전체</button><button type="button" className={target === '개별 회원' ? 'active' : ''} onClick={() => setTarget('개별 회원')}>개별 회원</button></div>
                  {target === '개별 회원' && <div className="ew-select-wrap ew-member-select"><select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}>{members.map((member) => <option key={member.id}>{member.name}</option>)}</select><ChevronDown size={15} /></div>}
                </div>
                <div className="ew-field ew-due-field"><label htmlFor="due">마감일 <span className="ew-optional">선택</span></label><div className="ew-date-wrap"><CalendarDays size={15} /><input id="due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div></div>
              </div>

              <div className="ew-publish-row">
                <button type="button" className={`ew-publish-switch ${published ? 'on' : ''}`} role="switch" aria-checked={published} onClick={() => setPublished((v) => !v)}><span /></button>
                <div><strong>{published ? '바로 공개' : '임시 저장'}</strong><small>{published ? '저장 후 학습자에게 바로 보여요.' : '공개 전까지 학습자에게 보이지 않아요.'}</small></div>
                <button type="submit" className="ew-submit"><span>{published ? '과제 공개하기' : '임시 저장하기'}</span><ArrowUpRight size={16} /></button>
              </div>
              {notice && <div className="ew-notice" role="status"><Check size={15} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="알림 닫기"><X size={14} /></button></div>}
            </form>

            <aside className="ew-side">
              <div className="ew-side-card ew-steps-card">
                <div className="ew-side-title"><div><span className="ew-kicker">QUICK GUIDE</span><h3>세 단계면 충분해요</h3></div><Settings2 size={17} /></div>
                <div className="ew-guide-step"><span>01</span><div><b>과정 선택</b><small>초급 · 중급 · 고급</small></div></div>
                <div className="ew-guide-step"><span>02</span><div><b>자료 입력</b><small>직접 입력하거나 파일로</small></div></div>
                <div className="ew-guide-step"><span>03</span><div><b>공개 또는 저장</b><small>필요할 때 바로 배정</small></div></div>
                <div className="ew-guide-note">영어와 한글은 줄 순서대로<br />자동 연결됩니다.</div>
              </div>
              <div className="ew-side-card ew-folder-card">
                <div className="ew-side-title"><div><span className="ew-kicker">COURSE FOLDER</span><h3>{course} 자료 폴더</h3></div><Folder size={18} /></div>
                {folders[course].map((name, index) => <button type="button" key={name} className={`ew-folder-chip ${folder === name ? 'chosen' : ''}`} onClick={() => setFolder(name)}><Folder size={14} />{name}<span>{index === 0 ? '대표' : '폴더'}</span></button>)}
                {!folders[course].length && <p className="ew-empty-folder">아직 폴더가 없어요.</p>}
                <button type="button" className="ew-folder-add-link" onClick={() => setShowFolderForm(true)}><Plus size={14} /> 새 과정 폴더 만들기</button>
              </div>
            </aside>
          </div>

          <section className="ew-list-section">
            <div className="ew-list-head">
              <div><span className="ew-kicker">ASSIGNMENT LIBRARY</span><h2>등록한 과제 <span>{assignments.length}</span></h2></div>
              <div className="ew-list-controls">
                <div className="ew-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="과제 검색" /></div>
                <div className="ew-filter"><ListFilter size={14} /><select aria-label="과정 필터" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value as '전체' | Course)}><option>전체</option>{courseNames.map((name) => <option key={name}>{name}</option>)}</select><ChevronDown size={13} /></div>
                <div className="ew-filter ew-kind-filter"><select aria-label="자료 유형 필터" value={filterKind} onChange={(e) => setFilterKind(e.target.value as '전체' | Kind)}><option>전체</option><option>문장</option><option>단어</option></select><ChevronDown size={13} /></div>
              </div>
            </div>
            <div className="ew-table">
              <div className="ew-table-header"><span>과제</span><span>과정 · 폴더</span><span>자료 수</span><span>마감일</span><span>상태</span><span /></div>
              {filteredAssignments.length ? filteredAssignments.map((item) => <div className="ew-table-row" key={item.id}>
                <div className="ew-assignment-name"><span className={`ew-type-icon ${item.kind === '단어' ? 'word' : ''}`}>{item.kind === '문장' ? <BookOpen size={15} /> : <Layers3 size={15} />}</span><div><strong>{item.title}</strong><small>{item.kind} 자료 · {item.assignee}</small></div></div>
                <div className="ew-course-folder-cell"><span className={`ew-course-dot ${item.course}`}>{item.course}</span><small><Folder size={12} />{item.folder}</small></div>
                <div className="ew-count-cell">{item.count}<small>개</small></div>
                <div className="ew-date-cell">{item.due}</div>
                <div><span className={`ew-status ${item.published ? 'live' : 'draft'}`}><i />{item.published ? '공개 중' : '임시 저장'}</span></div>
                <div className="ew-row-action"><button className="ew-icon-btn" aria-label={`${item.title} 삭제`} onClick={() => { setAssignments((list) => list.filter((entry) => entry.id !== item.id)); setNotice('과제를 목록에서 삭제했어요.'); }}><MoreHorizontal size={18} /></button><div className="ew-action-pop"><button onClick={() => { setAssignments((list) => list.map((entry) => entry.id === item.id ? { ...entry, published: !entry.published } : entry)); setNotice(item.published ? '과제를 임시 저장으로 변경했어요.' : '과제를 공개했어요.'); }}>{item.published ? '임시 저장으로 변경' : '과제 공개하기'}</button><button className="delete" onClick={() => { setAssignments((list) => list.filter((entry) => entry.id !== item.id)); setNotice('과제를 목록에서 삭제했어요.'); }}>과제 삭제</button></div></div>
              </div>) : <div className="ew-empty-list"><div><Search size={18} /></div><b>조건에 맞는 과제가 없어요.</b><span>검색어나 필터를 바꿔 다시 확인해 보세요.</span></div>}
            </div>
            <div className="ew-list-footer"><span>최근 과제부터 보여드려요.</span><button type="button" onClick={() => { setSearch(''); setFilterCourse('전체'); setFilterKind('전체'); }}>필터 초기화 <X size={13} /></button></div>
          </section>
          <footer className="ew-footer"><span>LANGUAGE CLASSROOM</span><span>간단한 과제 관리, 더 나은 학습 경험</span></footer>
        </div>
      </section>
    </main>
  );
}
