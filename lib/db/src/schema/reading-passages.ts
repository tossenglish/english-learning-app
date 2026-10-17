import { date, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export type ReadingQuestion = {
  type: "true_false" | "multiple_choice" | "short_answer";
  prompt: string;
  options: string[];
  answer: string;
  explanationNote?: string;
};

export const readingPassagesTable = pgTable("reading_passages", {
  id: serial("id").primaryKey(),
  grade: integer("grade").notNull(),
  title: text("title").notNull(),
  passage: text("passage").notNull(),
  questions: jsonb("questions").$type<ReadingQuestion[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const readingAiUsageTable = pgTable("reading_ai_usage", {
  userId: text("user_id").notNull(),
  usageDate: date("usage_date", { mode: "string" }).notNull(),
  calls: integer("calls").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.userId, table.usageDate] })]);

export const readingAiExplanationsTable = pgTable("reading_ai_explanations", {
  cacheKey: varchar("cache_key", { length: 64 }).primaryKey(),
  feedback: text("feedback").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
