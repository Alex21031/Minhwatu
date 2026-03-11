# Local Editing Guardrails

- Existing source files must be edited with `apply_patch` only (line-level changes).
- Do not use whole-file rewrite commands for source files (for example `Set-Content`, `Out-File`, or shell redirection), unless the user explicitly asks for it.
- Preserve file encoding and line endings as-is; avoid any conversion during edits.
- Do not infer file encoding corruption from terminal mojibake alone; verify by decoding file bytes as UTF-8 first.
- After edits, always verify with:
  - `git diff -- <touched-file>`
  - a relevant build or test command

# Workflow Orchestration

## Plan Node Default

- Enter plan mode for any non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, stop and re-plan immediately.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

## Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, increase compute via subagents.
- Keep one clear tack per subagent.

# Self-Improvement Loop

- After any correction from the user, update `tasks/lessons.md` with the pattern.
- Add concrete self-rules to prevent repeating the same mistake.
- Iterate on lessons until mistake rate drops.
- Review relevant lessons at session start.

# Verification Before Done

- Never mark a task complete without proof.
- Diff behavior between `main` and your changes when relevant.
- Ask: `Would a staff engineer approve this?`
- Run tests, check logs, and demonstrate correctness.

# Demand Elegance (Balanced)

- For non-trivial changes, ask if there is a more elegant approach.
- If a fix feels hacky, implement the elegant solution once constraints are clear.
- Skip over-engineering for obvious or simple fixes.
- Challenge your own work before presenting.

# Autonomous Bug Fixing

- When given a bug report, fix it end-to-end without hand-holding.
- Start from logs, errors, or failing tests and resolve root causes.
- Minimize context-switching burden on the user.
- Resolve failing CI tests proactively.

# Task Management

- Plan first: write checkable items to `tasks/todo.md`.
- Verify plan: check in before implementation.
- Track progress: mark items complete while working.
- Explain changes: provide a high-level summary at each step.
- Document results: add a review section to `tasks/todo.md`.
- Capture lessons: update `tasks/lessons.md` after corrections.

# Core Principles

- Simplicity first: keep changes as small as possible.
- No laziness: find root causes, avoid temporary fixes.
- Minimal impact: touch only necessary code to reduce regressions.
