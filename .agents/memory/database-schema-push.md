---
name: Database schema push safety
description: Drizzle development schema pushes can surface unrelated data cleanup prompts.
---

If Drizzle prompts to truncate existing rows for an unrelated constraint change, do not bypass the prompt with a force push. Limit the development database change to the requested additive or non-destructive schema operation instead.

**Why:** The shared database can contain real development records, and broad schema pushes may ask for data loss unrelated to the feature being implemented.

**How to apply:** Review the schema diff and prompt first. For Replit-managed production, leave production changes to Publish; never use the development connection against production.
