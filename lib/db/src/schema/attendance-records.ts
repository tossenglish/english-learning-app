import {
  date,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const ATTENDANCE_STATUSES = [
  "present",
  "late",
  "absent",
  "early_leave",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * 관리자가 직접 입력하는 출결 기록. 학생 한 명당 하루 한 건입니다.
 * attendanceDate 는 한국 날짜 기준 "YYYY-MM-DD" 문자열입니다.
 */
export const attendanceRecordsTable = pgTable(
  "attendance_records",
  {
    id: serial("id").primaryKey(),
    memberId: text("member_id").notNull(),
    attendanceDate: date("attendance_date", { mode: "string" }).notNull(),
    status: text("status").notNull(),
    note: text("note").notNull().default(""),
    recordedBy: text("recorded_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("attendance_member_date_unique").on(
      table.memberId,
      table.attendanceDate,
    ),
  ],
);

export type AttendanceRecord = typeof attendanceRecordsTable.$inferSelect;
