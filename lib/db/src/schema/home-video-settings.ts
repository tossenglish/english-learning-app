import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const homeVideoSettingsTable = pgTable("home_video_settings", {
  id: integer("id").primaryKey().default(1),
  videoId: varchar("video_id", { length: 11 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertHomeVideoSettingsSchema = createInsertSchema(
  homeVideoSettingsTable,
).omit({
  id: true,
  updatedAt: true,
});

export type InsertHomeVideoSettings = z.infer<
  typeof insertHomeVideoSettingsSchema
>;
export type HomeVideoSettings = typeof homeVideoSettingsTable.$inferSelect;
