import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 학생별 관리자 입력 정보.
 * - parentPhone: 학부모 연락처. 숫자만 저장 (예: 01012345678). 없으면 빈 문자열.
 * - studentName: 알림톡/출결 화면에 쓰는 표시 이름. 없으면 빈 문자열.
 */
export const memberContactsTable = pgTable("member_contacts", {
  memberId: text("member_id").primaryKey(),
  parentPhone: text("parent_phone").notNull().default(""),
  studentName: text("student_name").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MemberContact = typeof memberContactsTable.$inferSelect;
