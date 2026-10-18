---
name: Render production database
description: Production API is reported to run on Render, separate from Replit-managed database publishing.
---

The user identified the production API as a Render service. The app reads PostgreSQL from `DATABASE_URL`, and the repository has no checked-in SQL migration history or Render deployment configuration.

**Why:** Replit development schema checks do not establish that Render's database has the same schema, and Replit Publish does not update an external Render database.

**How to apply:** Check Render's own `DATABASE_URL`, Clerk production keys, logs, and schema before recommending a migration. Never run `push-force` against Render without inspecting the production schema and confirming the impact.
