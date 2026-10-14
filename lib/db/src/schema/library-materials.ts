import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { assignmentFoldersTable } from "./assignment-folders";

export const libraryMaterialsTable = pgTable("library_materials", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  materialType: text("material_type").notNull(),
  folderId: integer("folder_id").references(() => assignmentFoldersTable.id, {
    onDelete: "set null",
  }),
  materialContent: text("material_content").notNull(),
  level: text("level").notNull(),
  resourcePath: text("resource_path"),
  resourceName: text("resource_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLibraryMaterialSchema = createInsertSchema(libraryMaterialsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLibraryMaterial = z.infer<typeof insertLibraryMaterialSchema>;
export type LibraryMaterial = typeof libraryMaterialsTable.$inferSelect;
