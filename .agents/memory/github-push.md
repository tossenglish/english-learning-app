---
name: GitHub push fallback
description: A safe fallback when GitHub CLI authentication fails despite an active Replit connection.
---

When GitHub's source-control connection reports active but `git push` over HTTPS rejects authentication, the GitHub App connection may still provide authenticated API access. Resolve the exact connector from its integration details; do not ask the user for a token.

If pushing local commits through the Git Data API, preserve the existing history by creating each commit with its original parent and exact tree, compare the resulting tree and commit hashes to the local objects, then update the branch reference with `force: false` only after confirming the remote tip has not moved. Verify the remote ref afterward.

**Why:** Text transport through command output can alter a file's final newline and produce a different blob/tree hash; updating a ref before checking would risk publishing altered content or overwriting new remote work.

**How to apply:** Use this only after a Git CLI push fails. Read the provider's current API documentation, pass committed blob bytes as base64 when transferring file contents, verify every hash, and use a non-forced fast-forward update.
