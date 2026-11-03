import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const sharedWordsTable = pgTable("shared_words", {
  id: serial("id").primaryKey(),
  en: text("en").notNull(),
  ko: text("ko").notNull(),
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
