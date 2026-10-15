---
name: Course folder organization
description: The user's requirements for organizing learning content by course and folder.
---

The learning product has three courses (beginner, intermediate, advanced). Assignments must remain distinct by course, and each course should support nested folders that can contain both word and sentence materials.

Folder browsing should show a folder's direct children after the folder is opened. Only empty folders may be deleted; folders containing assignments or child folders must be protected from deletion.

**Why:** the user specified this as the intended course structure and chose the empty-only deletion rule to avoid losing stored materials.

**How to apply:** Keep course scope on newly created folders and assignments, avoid splitting a shared folder solely because its content types differ, and enforce the empty-folder rule in both UI and server-side deletion.
