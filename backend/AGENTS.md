# Backend handoff

Before backend changes, read `IMPLEMENTATION_PLAN.md` and `PROGRESS.md` in this directory, plus the current root `info.md` and relevant `task.md` requirements.

- Latest user instruction (02/10/2026): code related modules in batches (current batch B01–B03), then test the batch together. Database connection checks are explicitly deferred until the user sets up a database. Track code complete, offline checks passed, and database verification pending separately; do not claim full production verification.
- Update `PROGRESS.md` with changed behavior, commands/results, remaining issues, and the exact next step at each checkpoint and before ending a session.
- A written test or CI workflow is not evidence that it ran. Distinguish verified locally, verified in CI, and unverified external dependencies.
- Preserve the Express/Prisma/Azure setup and existing work. Never reset a database to make migrations pass. Use isolated disposable databases for integration checks.
- Only USER and ADMIN. Reject user-supplied financial benchmark overrides; keep production formulas awaiting business validation until verified.
- Never put credentials, access tokens, or financial records into progress notes or logs.
