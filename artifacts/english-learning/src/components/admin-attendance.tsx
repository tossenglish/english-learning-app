import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Download, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'early_leave';

interface AttendanceMember {
  id: string;
  displayName: string;
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
  const [phoneDrafts, setPhoneDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [exportFrom, setExportFrom] = useState(() => firstDayOfMonth(todayInSeoul()));
  const [exportTo, setExportTo] = useState(todayInSeoul);

  const showMessage = (text: string, isError = false) => {
    setMessage(text);
    setMessageIsError(isError);
  };

  const loadMembers = useCallback(async (targetDate: string) => {
    setIsLoading(true);
    try {
      const response = await apiFetch(`/api/admin/attendance?date=${targetDate}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response, '출결 목록을 불러오지 못했습니다.'));
      const body = (await response.json()) as { members: AttendanceMember[] };
      setMembers(body.members);
      setPhoneDrafts({});
      setNoteDrafts({});
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

  const savePhone = async (member: AttendanceMember) => {
    const value = (phoneDrafts[member.id] ?? member.parentPhone).trim();
    setBusyKey(`phone-${member.id}`);
    try {
      const response = await apiFetch(`/api/admin/members/${encodeURIComponent(member.id)}/contact`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPhone: value }),
      });
      if (!response.ok) throw new Error(await readError(response, '연락처를 저장하지 못했습니다.'));
      const saved = (await response.json()) as { parentPhone: string };
      setMembers((current) =>
        current.map((row) => (row.id === member.id ? { ...row, parentPhone: saved.parentPhone } : row)),
      );
      setPhoneDrafts((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      showMessage(
        saved.parentPhone
          ? `${member.displayName} 학생 학부모 연락처를 저장했어요.`
          : `${member.displayName} 학생 학부모 연락처를 삭제했어요.`,
      );
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '연락처를 저장하지 못했습니다.', true);
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

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <CalendarCheck size={17} />
        </span>
        <div>
          <h2 className="text-lg font-bold">출결 관리</h2>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            날짜를 고르고 학생별 출결을 직접 입력하세요. 학부모 연락처를 등록하면 아이가 과제를 시작하거나 마쳤을 때 카카오톡 알림이 전송돼요.
          </p>
        </div>
      </div>

      {notifyConfigured === false && (
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
          카카오 알림톡 설정이 아직 완료되지 않아 알림은 발송되지 않아요. 서버 환경변수(SOLAPI_*, KAKAO_*)를 등록해 주세요.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-xs font-bold">
          날짜
          <input
            type="date"
            value={date}
            onChange={(event) => event.currentTarget.value && setDate(event.currentTarget.value)}
            className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setDate(todayInSeoul())}
          className="rounded-xl border border-[hsl(var(--border))] px-3 py-2.5 text-sm font-bold"
        >
          오늘
        </button>
        <button
          type="button"
          onClick={() => void loadMembers(date)}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] px-3 py-2.5 text-sm font-bold"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>

      <p className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
        출석 {summary.present} · 지각 {summary.late} · 결석 {summary.absent} · 조퇴 {summary.early_leave} · 미입력 {summary.none}
      </p>

      {message && (
        <p
          role="status"
          className={`mt-3 text-xs font-bold ${messageIsError ? 'text-rose-600' : 'text-emerald-700'}`}
        >
          {message}
        </p>
      )}

      <div className="mt-4 grid gap-3">
        {isLoading && members.length === 0 ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="animate-spin text-[hsl(var(--accent))]" size={24} />
          </div>
        ) : members.length === 0 ? (
          <p className="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">등록된 학생이 없어요.</p>
        ) : (
          members.map((member) => {
            const attendanceBusy = busyKey === `att-${member.id}`;
            const phoneBusy = busyKey === `phone-${member.id}`;
            const phoneValue = phoneDrafts[member.id] ?? member.parentPhone;
            const phoneChanged = phoneValue.trim() !== member.parentPhone;
            return (
              <article
                key={member.id}
                className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">
                    {member.displayName}
                    {member.className && (
                      <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                        {member.className}
                      </span>
                    )}
                  </p>
                  {member.status && (
                    <button
                      type="button"
                      onClick={() => void clearAttendance(member)}
                      disabled={attendanceBusy}
                      className="text-xs text-[hsl(var(--muted-foreground))] underline"
                    >
                      입력 취소
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label={`${member.displayName} 출결`}>
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => void saveAttendance(member, option.value)}
                      disabled={attendanceBusy}
                      aria-pressed={member.status === option.value}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-bold ${
                        member.status === option.value
                          ? option.active
                          : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                    placeholder="메모 (예: 병원 진료로 결석)"
                    className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phoneValue}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setPhoneDrafts((current) => ({ ...current, [member.id]: value }));
                      }}
                      placeholder="학부모 연락처 010-0000-0000"
                      className="min-w-0 flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void savePhone(member)}
                      disabled={!phoneChanged || phoneBusy}
                      className="rounded-xl bg-[hsl(var(--primary))] px-3 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-40"
                    >
                      저장
                    </button>
                  </div>
                </div>
                {!member.status && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                    출결 버튼을 먼저 누르면 메모가 함께 저장돼요.
                  </p>
                )}
              </article>
            );
          })
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-[hsl(var(--border))] p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Download size={15} /> 엑셀(CSV) 내보내기
        </h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-xs font-bold">
            시작일
            <input
              type="date"
              value={exportFrom}
              onChange={(event) => setExportFrom(event.currentTarget.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-bold">
            종료일
            <input
              type="date"
              value={exportTo}
              onChange={(event) => setExportTo(event.currentTarget.value)}
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void exportCsv()}
            disabled={busyKey === 'export' || !exportFrom || !exportTo}
            className="rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-40"
          >
            내려받기
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[hsl(var(--border))] p-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Send size={15} /> 최근 알림 발송 기록
          </h3>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            className="text-xs text-[hsl(var(--muted-foreground))] underline"
          >
            새로고침
          </button>
        </div>
        {notifications.length === 0 ? (
          <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">아직 발송 기록이 없어요.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {notifications.map((row) => (
              <li
                key={row.id}
                className="rounded-xl bg-[hsl(var(--background))] p-3 text-xs leading-relaxed"
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
    </section>
  );
}
