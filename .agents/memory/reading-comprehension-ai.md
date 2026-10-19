---
name: Reading comprehension AI boundaries
description: Teacher-authored reading questions and privacy-safe Claude feedback rules.
---

Teachers author and save all reading questions as O/X. The server checks O/X answers against the saved key; Claude only explains objective answers. Do not generate questions with AI or send member identity.

**Why:** The teacher must control the correct answer, and student-facing feedback must remain grounded in the passage without sharing personal information.

**How to apply:** Keep new saves and student-visible questions O/X-only, preserve historical non-O/X records without exposing those questions to students, and keep Claude inputs limited to passage/question/answer context with the daily limit and explanation cache.
