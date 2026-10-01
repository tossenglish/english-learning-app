import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assignmentFoldersTable = pgTable(
  "assignment_folders",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    materialType: text("material_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    assignmentFolderTypeNameUnique: unique("assignment_folder_type_name_unique").on(
      table.materialType,
      table.name,
    ),
  }),
);

export const insertAssignmentFolderSchema = createInsertSchema(assignmentFoldersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAssignmentFolder = z.infer<typeof insertAssignmentFolderSchema>;
export type AssignmentFolder = typeof assignmentFoldersTable.$inferSelect;