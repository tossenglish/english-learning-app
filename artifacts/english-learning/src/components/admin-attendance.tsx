import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Phone,
  RefreshCw,
  Send,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early_leave';

interface AttendanceMember {
  id: string;
  displayName: string;
  studentName: string;
  nameSet: boolean;
  loginId: string;
  course: string | null;
  className: string | null;
  parentPhone: string;
  status: AttendanceStatus | null;
  note: string;
}

interface NotificationRow {
  id: number;
  kind: 'started' | 'completed';
  status: 'pending' | 'sent' | 'failed';
  studentName: string;
  assignmentTitle: string;
  phone: string;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string; active: string }> = [
  { value: 'present', label: '출석', active: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'late', label: '지각', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'absent', label: '결석', active: 'bg-rose-600 text-white border-rose-600' },
  { value: 'early_leave', label: '조퇴', active: 'bg-sky-600 text-white border-sky-600' },
];

const NOTIFICATION_STATUS_LABEL: Record<NotificationRow['status'], string> = {
  pending: '발송 중',
  sent: '접수 완료',
  failed: '실패',
};

function todayInSeoul(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function formatDateLabel(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][value.getUTCDay()];
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekday})`;
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export default function AdminAttendance() {
  const [date, setDate] = useState(todayInSeoul);
  const [members, setMembers] = useState<AttendanceMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [notifyConfigured, setNotifyConfigured] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [exportFrom, setExportFrom] = useState(() => firstDayOfMonth(todayInSeoul()));
  const [exportTo, setExportTo] = useState(todayInSeoul);

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  // 성공 안내는 몇 초 뒤 저절로 사라지게 해서 화면이 어수선해지지 않도록 합니다.
  useEffect(() => {
    if (!message || messageIsError) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message, messageIsError]);

  const loadMembers = useCallback(async (targetDate: string) => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/admin/attendance?date=${targetDate}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response, '출결 목록을 불러오지 못했습니다.'));
      const body = (await response.json()) as { members: AttendanceMember[] };
      setMembers(body.members);
      setPhoneDrafts({});
      setNameDrafts({});
      setNoteDrafts({});
      setOpenId(null);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '출결 목록을 불러오지 못했습니다.', true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const [listResponse, statusResponse] = await Promise.all([
        apiFetch('/api/admin/notifications', { cache: 'no-store' }),
        apiFetch('/api/admin/notify-status', { cache: 'no-store' }),
      ]);
      if (listResponse.ok) setNotifications((await listResponse.json()) as NotificationRow[]);
      if (statusResponse.ok) {
        setNotifyConfigured(((await statusResponse.json()) as { configured: boolean }).configured);
      }
    } catch {
      // 발송 기록을 불러오지 못해도 출결 입력에는 영향이 없습니다.
    }
  }, []);

  useEffect(() => {
    void loadMembers(date);
  }, [date, loadMembers]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus | 'none', number> = {
      present: 0,
      late: 0,
      absent: 0,
      early_leave: 0,
      none: 0,
    };
    for (const member of members) counts[member.status ?? 'none'] += 1;
    return counts;
  }, [members]);

  const visibleMembers = useMemo(
    () => (onlyPending ? members.filter((member) => member.status === null) : members),
    [members, onlyPending],
  );

  const failedCount = useMemo(
    () => notifications.filter((row) => row.status === 'failed').length,
    [notifications],
  );

  const saveAttendance = async (member: AttendanceMember, status: AttendanceStatus) => {
    const note = noteDrafts[member.id] ?? member.note;
    setBusyKey(`att-${member.id}`);
    try {
      const response = await apiFetch('/api/admin/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id, date, status, note }),
      });
      if (!response.ok) throw new Error(await readError(response, '출결을 저장하지 못했습니다.'));
      setMembers((current) =>
        current.map((row) => (row.id === member.id ? { ...row, status, note } : row)),
      );
      showMessage(`${member.displayName} 학생 출결을 저장했어요.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '출결을 저장하지 못했습니다.', true);
    } finally {
      setBusyKey(null);
    }
  };

  const clearAttendance = async (member: AttendanceMember) => {
    setBusyKey(`att-${member.id}`);
    try {
      const response = await apiFetch(
        `/api/admin/attendance/${encodeURIComponent(member.id)}/${date}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error(await readError(response, '출결을 지우지 못했습니다.'));
      setMembers((current) =>
        current.map((row) => (row.id === member.id ? { ...row, status: null, note: '' } : row)),
      );
      setNoteDrafts((current) => ({ ...current, [member.id]: '' }));
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '출결을 지우지 못했습니다.', true);
    } finally {
      setBusyKey(null);
    }
  };

  const saveContact = async (member: AttendanceMember) => {
    const phone = (phoneDrafts[member.id] ?? member.parentPhone).trim();
    const name = (nameDrafts[member.id] ?? member.studentName).trim();
    setBusyKey(`contact-${member.id}`);
    try {
      const response = await apiFetch(`/api/admin/members/${encodeURIComponent(member.id)}/contact`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPhone: phone, studentName: name }),
      });
      if (!response.ok) throw new Error(await readError(response, '저장하지 못했습니다.'));
      const saved = (await response.json()) as {
        parentPhone: string;
        studentName: string;
        displayName: string;
        nameSet: boolean;
      };
      setMembers((current) =>
        current.map((row) =>
          row.id === member.id
            ? {
                ...row,
                parentPhone: saved.parentPhone,
                studentName: saved.studentName,
                displayName: saved.displayName,
                nameSet: saved.nameSet,
              }
            : row,
        ),
      );
      setPhoneDrafts((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      setNameDrafts((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      showMessage(`${saved.displayName} 학생 정보를 저장했어요.`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '저장하지 못했습니다.', true);
    } finally {
      setBusyKey(null);
    }
  };

  const retryNotification = async (id: number) => {
    setBusyKey(`retry-${id}`);
    try {
      const response = await apiFetch(`/api/admin/notifications/${id}/retry`, { method: 'POST' });
      if (!response.ok) throw new Error(await readError(response, '다시 보내지 못했습니다.'));
      await loadNotifications();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '다시 보내지 못했습니다.', true);
    } finally {
      setBusyKey(null);
    }
  };

  const exportCsv = async () => {
    setBusyKey('export');
    try {
      const response = await apiFetch(`/api/admin/attendance/export?from=${exportFrom}&to=${exportTo}`);
      if (!response.ok) throw new Error(await readError(response, '내보내기에 실패했습니다.'));
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `attendance_${exportFrom}_${exportTo}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '내보내기에 실패했습니다.', true);
    } finally {
      setBusyKey(null);
    }
  };

  const iconButton =
    'flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] disabled:opacity-40';

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <CalendarCheck size={17} />
        </span>
        <div>
          <h2 className="text-lg font-bold">출결 관리</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            학생 이름을 누르면 메모와 학부모 연락처를 입력할 수 있어요.
          </p>
        </div>
      </div>

      {notifyConfigured === false && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          카카오 알림톡 설정이 아직 완료되지 않아 알림은 발송되지 않아요.
        </p>
      )}

      {/* 날짜 이동 */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDate((current) => shiftDate(current, -1))}
          className={iconButton}
          aria-label="전날"
        >
          <ChevronLeft size={16} />
        </button>
        <label className="relative">
          <span className="sr-only">날짜 선택</span>
          <input
            type="date"
            value={date}
            onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)}
            className="h-9 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm font-bold"
          />
        </label>
        <button
          type="button"
          onClick={() => setDate((current) => shiftDate(current, 1))}
          className={iconButton}
          aria-label="다음날"
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => setDate(todayInSeoul())}
          className="h-9 rounded-xl border border-[hsl(var(--border))] px-3 text-xs font-bold"
        >
          오늘
        </button>
        <button
          type="button"
          onClick={() => void loadMembers(date)}
          disabled={isLoading}
          className={`${iconButton} ml-auto`}
          aria-label="새로고침"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 요약 + 필터 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm font-bold">{formatDateLabel(date)}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          출석 {summary.present} · 지각 {summary.late} · 결석 {summary.absent} · 조퇴 {summary.early_leave} · 미입력 {summary.none}
        </p>
        <label className="ml-auto flex items-center gap-1.5 text-xs font-bold">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(event) => setOnlyPending(event.currentTarget.checked)}
          />
          미입력만 보기
        </label>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-2 text-xs font-bold ${messageIsError ? 'text-rose-600' : 'text-emerald-700'}`}
        >
          {message}
        </p>
      )}

      {/* 학생 목록: 한 줄에 한 명 */}
      <ul className="mt-3 grid gap-1.5">
        {isLoading && members.length === 0 ? (
          <li className="flex justify-center py-8">
            <LoaderCircle className="animate-spin text-[hsl(var(--accent))]" size={24} />
          </li>
        ) : visibleMembers.length === 0 ? (
          <li className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
            {members.length === 0 ? '등록된 학생이 없어요.' : '모든 학생의 출결이 입력됐어요.'}
          </li>
        ) : (
          visibleMembers.map((member) => {
            const attendanceBusy = busyKey === `att-${member.id}`;
            const contactBusy = busyKey === `contact-${member.id}`;
            const isOpen = openId === member.id;
            const phoneValue = phoneDrafts[member.id] ?? member.parentPhone;
            const nameValue = nameDrafts[member.id] ?? member.studentName;
            const contactChanged =
              phoneValue.trim() !== member.parentPhone || nameValue.trim() !== member.studentName;
            return (
              <li
                key={member.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : member.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-[110px] flex-1 items-center gap-1.5 text-left"
                  >
                    <ChevronRight
                      size={14}
                      className={`shrink-0 text-[hsl(var(--muted-foreground))] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    <span className="truncate text-sm font-bold">{member.displayName}</span>
                    {!member.nameSet && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                        이름 설정 필요
                      </span>
                    )}
                    {member.className && (
                      <span className="hidden truncate text-[11px] text-[hsl(var(--muted-foreground))] sm:inline">
                        {member.className}
                      </span>
                    )}
                    <Phone
                      size={12}
                      className={member.parentPhone ? 'shrink-0 text-emerald-600' : 'shrink-0 text-rose-400'}
                      aria-label={member.parentPhone ? '학부모 연락처 등록됨' : '학부모 연락처 없음'}
                    />
                    {member.note && <span className="shrink-0 text-[10px] text-[hsl(var(--muted-foreground))]">메모</span>}
                  </button>

                  <div className="flex gap-1" role="group" aria-label={`${member.displayName} 출결`}>
                    {STATUS_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void saveAttendance(member, option.value)}
                        disabled={attendanceBusy}
                        aria-pressed={member.status === option.value}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                          member.status === option.value
                            ? option.active
                            : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isOpen && (
                  <div className="grid gap-2 border-t border-[hsl(var(--border))] px-3 py-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-[11px] font-bold sm:col-span-2">
                      메모
                      <input
                        type="text"
                        value={noteDrafts[member.id] ?? member.note}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setNoteDrafts((current) => ({ ...current, [member.id]: value }));
                        }}
                        onBlur={() => {
                          const draft = noteDrafts[member.id];
                          if (member.status && draft !== undefined && draft !== member.note) {
                            void saveAttendance(member, member.status);
                          }
                        }}
                        maxLength={200}
                        disabled={!member.status}
                        placeholder={member.status ? '예: 병원 진료로 결석' : '출결을 먼저 선택해 주세요'}
                        className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-normal disabled:opacity-50"
                      />
                    </label>
                    <label className="grid gap-1 text-[11px] font-bold">
                      학생 이름 <span className="font-normal text-[hsl(var(--muted-foreground))]">(알림톡에 표시돼요)</span>
                      <input
                        type="text"
                        value={nameValue}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setNameDrafts((current) => ({ ...current, [member.id]: value }));
                        }}
                        maxLength={20}
                        placeholder="예: 김민준"
                        className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-normal"
                      />
                    </label>
                    <div className="grid gap-1 text-[11px] font-bold">
                      학부모 연락처
                      <input
                        type="tel"
                        inputMode="tel"
                        value={phoneValue}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          setPhoneDrafts((current) => ({ ...current, [member.id]: value }));
                        }}
                        placeholder="010-0000-0000"
                        aria-label="학부모 연락처"
                        className="min-w-0 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-sm font-normal"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:col-span-2">
                      <p className="truncate text-[11px] text-[hsl(var(--muted-foreground))]">
                        로그인 아이디: {member.loginId || '-'}
                      </p>
                      <button
                        type="button"
                        onClick={() => void saveContact(member)}
                        disabled={!contactChanged || contactBusy}
                        className="shrink-0 rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-40"
                      >
                        이름·연락처 저장
                      </button>
                    </div>
                    {member.status && (
                      <button
                        type="button"
                        onClick={() => void clearAttendance(member)}
                        disabled={attendanceBusy}
                        className="justify-self-start text-xs text-[hsl(var(--muted-foreground))] underline sm:col-span-2"
                      >
                        이 날짜 출결 입력 취소
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>

      {/* 접어 두는 부가 기능 */}
      <details className="mt-5 rounded-xl border border-[hsl(var(--border))]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold">
          <Download size={15} /> 엑셀(CSV) 내보내기
        </summary>
        <div className="flex flex-wrap items-end gap-3 border-t border-[hsl(var(--border))] px-4 py-3">
          <label className="grid gap-1 text-xs font-bold">
            시작일
            <input
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.currentTarget.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold">
            종료일
            <input
              type="date"
              value={exportTo}
              onChange={(event) => setExportTo(event.currentTarget.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={busyKey === 'export' || !exportFrom || !exportTo}
            className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-40"
          >
            내려받기
          </button>
        </div>
      </details>

      <details className="mt-2 rounded-xl border border-[hsl(var(--border))]">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold">
          <Send size={15} /> 알림 발송 기록
          {failedCount > 0 && (
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] text-white">
              실패 {failedCount}
            </span>
          )}
        </summary>
        <div className="border-t border-[hsl(var(--border))] px-4 py-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="text-xs text-[hsl(var(--muted-foreground))] underline"
            >
              새로고침
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">아직 발송 기록이 없어요.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5">
              {notifications.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg bg-[hsl(var(--background))] px-3 py-2 text-xs leading-relaxed"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">
                      {row.studentName || '학생'} · {row.kind === 'started' ? '과제 시작' : '과제 완료'}
                    </span>
                    <span
                      className={`font-bold ${
                        row.status === 'failed'
                          ? 'text-rose-600'
                          : row.status === 'sent'
                            ? 'text-emerald-700'
                            : 'text-[hsl(var(--muted-foreground))]'
                      }`}
                    >
                      {NOTIFICATION_STATUS_LABEL[row.status]}
                    </span>
                  </div>
                  <p className="text-[hsl(var(--muted-foreground))]">
                    {row.assignmentTitle} · {row.phone || '번호 없음'} ·{' '}
                    {new Date(row.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                  </p>
                  {row.status === 'failed' && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {row.errorMessage && <span className="text-rose-600">{row.errorMessage}</span>}
                      <button
                        type="button"
                        onClick={() => void retryNotification(row.id)}
                        disabled={busyKey === `retry-${row.id}`}
                        className="font-bold underline"
                      >
                        다시 보내기
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  );
}
