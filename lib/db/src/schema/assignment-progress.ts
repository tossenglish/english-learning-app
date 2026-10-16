import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assignmentsTable } from "./assignments";

export const assignmentProgressTable = pgTable(
  "assignment_progress",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    assignmentId: integer("assignment_id")
      .notNull()
      .references(() => assignmentsTable.id, { onDelete: "cascade" }),
    completedSteps: integer("completed_steps").notNull().default(0),
    totalSteps: integer("total_steps").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("assignment_progress_user_assignment_unique").on(
      table.userId,
      table.assignmentId,
    ),
  ],
);

export const insertAssignmentProgressSchema = createInsertSchema(
  assignmentProgressTable,
).omit({
  id: true,
  updatedAt: true,
});

export type InsertAssignmentProgress = z.infer<
  typeof insertAssignmentProgressSchema
>;
export type AssignmentProgress = typeof assignmentProgressTable.$inferSelect;
