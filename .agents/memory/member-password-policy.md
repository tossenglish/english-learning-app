---
name: Member password policy
description: The chosen minimum password length for administrator-created member accounts.
---

Keep administrator-created member passwords at 8 or more characters while the app uses Clerk's standard password sign-in. Do not lower only the form or API validation to four digits.

**Why:** The user chose to keep Clerk's 8-character password flow instead of redesigning authentication around a 4-digit PIN.

**How to apply:** Keep the admin form and server validation aligned at 8 characters. Revisit PIN login only if the user explicitly asks to redesign authentication and its security controls.
