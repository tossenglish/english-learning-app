import {
  type AnyPgColumn,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assignmentFoldersTable = pgTable(
  "assignment_folders",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    materialType: text("material_type").notNull(),
    level: text("level"),
    parentFolderId: integer("parent_folder_id").references(
      (): AnyPgColumn => assignmentFoldersTable.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const insertAssignmentFolderSchema = createInsertSchema(assignmentFoldersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAssignmentFolder = z.infer<typeof insertAssignmentFolderSchema>;
export type AssignmentFolder = typeof assignmentFoldersTable.$inferSelect;