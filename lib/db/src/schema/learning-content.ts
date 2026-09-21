import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const learningContentTable = pgTable(
  "learning_content",
  {
    id: serial("id").primaryKey(),
    level: text("level").notNull(),
    word: text("word").notNull(),
    pronunciation: text("pronunciation").notNull(),
    partOfSpeech: text("part_of_speech").notNull(),
    shortMeaning: text("short_meaning").notNull(),
    meaningDetail: text("meaning_detail").notNull(),
    englishDefinition: text("english_definition").notNull(),
    exampleSentence: text("example_sentence").notNull(),
    exampleKorean: text("example_korean").notNull(),
    quizOptions: text("quiz_options").array().notNull(),
    correctMeaning: text("correct_meaning").notNull(),
    tip: text("tip").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => ({
    learningContentLevelUnique: unique("learning_content_level_unique").on(table.level),
  }),
);

export const insertLearningContentSchema = createInsertSchema(learningContentTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLearningContent = z.infer<typeof insertLearningContentSchema>;
export type LearningContent = typeof learningContentTable.$inferSelect;