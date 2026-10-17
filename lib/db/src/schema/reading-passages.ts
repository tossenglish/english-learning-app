import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export type ReadingQuestion = {
  type: "true_false" | "multiple_choice" | "short_answer";
  prompt: string;
  options: string[];
  answer: string;
};

export const readingPassagesTable = pgTable("reading_passages", {
  id: serial("id").primaryKey(),
  grade: integer("grade").notNull(),
  title: text("title").notNull(),
  passage: text("passage").notNull(),
  questions: jsonb("questions").$type<ReadingQuestion[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
