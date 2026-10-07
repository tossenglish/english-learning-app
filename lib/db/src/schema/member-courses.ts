import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const memberCoursesTable = pgTable("member_courses", {
  memberId: text("member_id").primaryKey(),
  courseLevel: text("course_level").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertMemberCourseSchema = createInsertSchema(memberCoursesTable).omit({
  updatedAt: true,
});

export type InsertMemberCourse = z.infer<typeof insertMemberCourseSchema>;
export type MemberCourse = typeof memberCoursesTable.$inferSelect;
