import { clerkClient } from "@clerk/express";
import {
  ATTENDANCE_STATUSES,
  assignmentNotificationsTable,
  attendanceRecordsTable,
  db,
  memberClassesTable,
  memberContactsTable,
  memberCoursesTable,
  type AttendanceStatus,
} from "@workspace/db";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin, isAdminUser } from "../lib/auth";
import { deliverNotification, loadNotifyConfig } from "../lib/kakao-notify";
import { formatPhoneForDisplay, normalizeKoreanMobile } from "../lib/phone";

/**
 * 관리자 전용: 출결 직접 입력 / 학부모 연락처 / 알림톡 발송 기록.
 * 모든 경로는 /api/admin/... 아래에 있어 기존 adminIdentityMiddleware 를 함께 탑니다.
 */
const router: IRouter = Router();

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "출석",
  late: "지각",
  absent: "결석",
  early_leave: "조퇴",
};

const MAX_EXPORT_DAYS = 400;

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

function parseDateString(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

function displayNameOf(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): string {
  return (
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    "이름 없는 회원"
  );
}

async function listStudents() {
  const users = await clerkClient.users.getUserList({
    limit: 100,
    orderBy: "-created_at",
  });
  return users.data.filter((user) => !isAdminUser(user));
}

async function getMember(memberId: string) {
  try {
    return await clerkClient.users.getUser(memberId);
  } catch {
    return null;
  }
}

async function memberExists(memberId: string): Promise<boolean> {
  return (await getMember(memberId)) !== null;
}

/** 로그인 아이디(이메일 또는 사용자명). 관리자 화면에만 작게 보여 줍니다. */
function loginIdOf(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>): string {
  return user.primaryEmailAddress?.emailAddress || user.username || "";
}

/** CSV 셀 이스케이프 + 엑셀 수식 주입 방지 */
function csvCell(value: string): string {
  let text = value.replace(/\r?\n/g, " ");
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// 알림톡 설정이 끝났는지 (화면 안내용)
router.get("/admin/notify-status", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ configured: loadNotifyConfig() !== null });
});

// 날짜별 출결 + 학부모 연락처
router.get("/admin/attendance", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const date = parseDateString(req.query.date);
  if (!date) {
    res.status(400).json({ error: "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)" });
    return;
  }

  res.setHeader("Cache-Control", "private, no-store");
  const students = await listStudents();
  const ids = students.map((student) => student.id);
  if (ids.length === 0) {
    res.json({ date, members: [] });
    return;
  }

  const [records, contacts, courses, classes] = await Promise.all([
    db
      .select()
      .from(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.attendanceDate, date),
          inArray(attendanceRecordsTable.memberId, ids),
        ),
      ),
    db.select().from(memberContactsTable).where(inArray(memberContactsTable.memberId, ids)),
    db.select().from(memberCoursesTable).where(inArray(memberCoursesTable.memberId, ids)),
    db.select().from(memberClassesTable),
  ]);

  const recordByMember = new Map(records.map((record) => [record.memberId, record]));
  const contactByMember = new Map(contacts.map((contact) => [contact.memberId, contact]));
  const courseByMember = new Map(courses.map((course) => [course.memberId, course]));
  const classNameById = new Map(classes.map((row) => [row.id, row.name]));

  const members = students
    .map((student) => {
      const record = recordByMember.get(student.id);
      const course = courseByMember.get(student.id);
      const contact = contactByMember.get(student.id);
      const studentName = contact?.studentName ?? "";
      return {
        id: student.id,
        displayName: studentName || displayNameOf(student),
        studentName,
        nameSet: Boolean(studentName || student.fullName?.trim()),
        loginId: loginIdOf(student),
        course: course?.courseLevel ?? null,
        className: course?.classId ? (classNameById.get(course.classId) ?? null) : null,
        parentPhone: contact?.parentPhone ?? "",
        status: record?.status ?? null,
        note: record?.note ?? "",
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));

  res.json({ date, members });
});

// 출결 입력 / 수정
router.put("/admin/attendance", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const date = parseDateString(body.date);
  const memberId = typeof body.memberId === "string" ? body.memberId.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const status = body.status;
  if (!date || !memberId || !isAttendanceStatus(status) || note.length > 200) {
    res.status(400).json({ error: "출결 입력값이 올바르지 않습니다." });
    return;
  }
  if (!(await memberExists(memberId))) {
    res.status(404).json({ error: "회원을 찾을 수 없습니다." });
    return;
  }

  const [saved] = await db
    .insert(attendanceRecordsTable)
    .values({
      memberId,
      attendanceDate: date,
      status,
      note,
      recordedBy: getUserId(req),
    })
    .onConflictDoUpdate({
      target: [attendanceRecordsTable.memberId, attendanceRecordsTable.attendanceDate],
      set: { status, note, recordedBy: getUserId(req), updatedAt: new Date() },
    })
    .returning();

  res.json({
    memberId: saved.memberId,
    date: saved.attendanceDate,
    status: saved.status,
    note: saved.note,
  });
});

// 출결 기록 삭제 (미입력 상태로 되돌리기)
router.delete(
  "/admin/attendance/:memberId/:date",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const date = parseDateString(req.params.date);
    const memberId = String(req.params.memberId ?? "");
    if (!date || !memberId) {
      res.status(400).json({ error: "요청 값이 올바르지 않습니다." });
      return;
    }
    await db
      .delete(attendanceRecordsTable)
      .where(
        and(
          eq(attendanceRecordsTable.memberId, memberId),
          eq(attendanceRecordsTable.attendanceDate, date),
        ),
      );
    res.sendStatus(204);
  },
);

// 기간별 출결 CSV 내보내기 (엑셀에서 한글이 깨지지 않도록 BOM 포함)
router.get("/admin/attendance/export", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;

  const from = parseDateString(req.query.from);
  const to = parseDateString(req.query.to);
  if (!from || !to || from > to) {
    res.status(400).json({ error: "기간이 올바르지 않습니다." });
    return;
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_EXPORT_DAYS) {
    res.status(400).json({ error: `최대 ${MAX_EXPORT_DAYS}일까지 내보낼 수 있습니다.` });
    return;
  }

  const records = await db
    .select()
    .from(attendanceRecordsTable)
    .where(
      and(
        gte(attendanceRecordsTable.attendanceDate, from),
        lte(attendanceRecordsTable.attendanceDate, to),
      ),
    )
    .orderBy(asc(attendanceRecordsTable.attendanceDate), asc(attendanceRecordsTable.memberId));

  const students = await listStudents();
  const contactRows = await db.select().from(memberContactsTable);
  const customNameById = new Map(
    contactRows.filter((row) => row.studentName).map((row) => [row.memberId, row.studentName]),
  );
  const nameById = new Map(
    students.map((student) => [
      student.id,
      customNameById.get(student.id) ?? displayNameOf(student),
    ]),
  );

  const lines = ["날짜,학생,출결,메모"];
  for (const record of records) {
    const label = isAttendanceStatus(record.status) ? STATUS_LABELS[record.status] : record.status;
    lines.push(
      [
        record.attendanceDate,
        csvCell(nameById.get(record.memberId) ?? record.memberId),
        label,
        csvCell(record.note),
      ].join(","),
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="attendance_${from}_${to}.csv"`);
  res.send(`﻿${lines.join("\r\n")}\r\n`);
});

// 학생 표시 이름 / 학부모 연락처 저장 (보낸 항목만 바꾸고, 둘 다 비면 행을 삭제)
router.put(
  "/admin/members/:memberId/contact",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const memberId = String(req.params.memberId ?? "");
    const body = (req.body ?? {}) as { parentPhone?: unknown; studentName?: unknown };
    const phoneInput = body.parentPhone;
    const nameInput = body.studentName;
    if (
      !memberId ||
      (phoneInput !== undefined && typeof phoneInput !== "string") ||
      (nameInput !== undefined && typeof nameInput !== "string") ||
      (phoneInput === undefined && nameInput === undefined)
    ) {
      res.status(400).json({ error: "요청 값이 올바르지 않습니다." });
      return;
    }
    const user = await getMember(memberId);
    if (!user) {
      res.status(404).json({ error: "회원을 찾을 수 없습니다." });
      return;
    }

    const [existing] = await db
      .select()
      .from(memberContactsTable)
      .where(eq(memberContactsTable.memberId, memberId));

    let parentPhone = existing?.parentPhone ?? "";
    if (typeof phoneInput === "string") {
      if (phoneInput.trim() === "") {
        parentPhone = "";
      } else {
        const normalized = normalizeKoreanMobile(phoneInput);
        if (!normalized) {
          res.status(400).json({ error: "휴대전화 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)" });
          return;
        }
        parentPhone = normalized;
      }
    }

    let studentName = existing?.studentName ?? "";
    if (typeof nameInput === "string") {
      studentName = nameInput.trim();
      if (studentName.length > 20) {
        res.status(400).json({ error: "이름은 20자 이내로 입력해 주세요." });
        return;
      }
    }

    if (!parentPhone && !studentName) {
      await db.delete(memberContactsTable).where(eq(memberContactsTable.memberId, memberId));
    } else {
      await db
        .insert(memberContactsTable)
        .values({ memberId, parentPhone, studentName })
        .onConflictDoUpdate({
          target: memberContactsTable.memberId,
          set: { parentPhone, studentName, updatedAt: new Date() },
        });
    }

    res.json({
      memberId,
      parentPhone,
      studentName,
      displayName: studentName || displayNameOf(user),
      nameSet: Boolean(studentName || user.fullName?.trim()),
    });
  },
);

// 최근 알림톡 발송 기록
router.get("/admin/notifications", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  res.setHeader("Cache-Control", "private, no-store");

  const rows = await db
    .select()
    .from(assignmentNotificationsTable)
    .orderBy(desc(assignmentNotificationsTable.createdAt))
    .limit(50);

  res.json(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      studentName: row.studentName,
      assignmentTitle: row.assignmentTitle,
      phone: row.phone ? formatPhoneForDisplay(row.phone) : "",
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    })),
  );
});

// 실패한 알림 다시 보내기
router.post(
  "/admin/notifications/:id/retry",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "요청 값이 올바르지 않습니다." });
      return;
    }
    const result = await deliverNotification(id);
    res.json({ id, result });
  },
);

export default router;
