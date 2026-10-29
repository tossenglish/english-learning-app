import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { assignmentsTable } from "./assignments";

/**
 * 과제 시작/완료 알림톡 발송 기록.
 * (memberId, assignmentId, kind) 가 유일하므로 같은 과제에서
 * 새로고침 등으로 알림이 중복 발송되지 않습니다.
 *
 * kind:   "started" | "completed"
 * status: "pending" | "sent" | "failed"
 */
export const assignmentNotificationsTable = pgTable(
  "assignment_notifications",
  {
    id: serial("id").primaryKey(),
    memberId: text("member_id").notNull(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    studentName: text("student_name").notNull().default(""),
    assignmentTitle: text("assignment_title").notNull().default(""),
    phone: text("phone").notNull().default(""),
    providerGroupId: text("provider_group_id"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("assignment_notifications_unique").on(
      table.memberId,
      table.assignmentId,
      table.kind,
    ),
  ],
);

export type AssignmentNotification =
  typeof assignmentNotificationsTable.$inferSelect;
