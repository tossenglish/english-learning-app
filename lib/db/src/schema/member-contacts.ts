import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 학생별 학부모 연락처. 관리자만 입력/조회합니다.
 * parentPhone 은 숫자만 저장합니다 (예: 01012345678).
 */
export const memberContactsTable = pgTable("member_contacts", {
  memberId: text("member_id").primaryKey(),
  parentPhone: text("parent_phone").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type MemberContact = typeof memberContactsTable.$inferSelect;
