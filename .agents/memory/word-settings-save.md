---
name: Word settings save behavior
description: Keep initial-screen word saving usable even when the admin has not preselected or created a word folder.
---

The initial-screen word settings need clear in-place instructions because the flow combines course-specific inputs, optional CSV import, optional folders, and a save whose result is split between the home card and a folder draft. Preserve and restore the entire word/meaning list and its folder after reload; the home card itself displays only the first word. When saving, select an existing folder for the course automatically; if none exists, create a course-specific word folder rather than failing solely because the folder selector is empty.

**Why:** The user reported that after saving many words only one remained visible after refresh and the chosen folder appeared empty; they also said the settings were unclear to use.

**How to apply:** Keep the usage steps visible next to the controls. Preserve the selected folder when present; otherwise choose a matching course folder, then a shared folder, and create a matching root word folder only when no suitable folder exists.
