import { type AnyPgColumn, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const memberClassesTable = pgTable("member_classes", {
  id: serial("id").primaryKey(),
  courseLevel: text("course_level").notNull(),
  name: text("name").notNull(),
  parentClassId: integer("parent_class_id").references(
    (): AnyPgColumn => memberClassesTable.id,
    { onDelete: "cascade" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
