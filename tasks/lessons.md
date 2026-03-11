# Lessons

## 2026-03-11

- When a user adds editing guardrails, treat that as an immediate correction and write the rule into `tasks/lessons.md` before continuing.
- For source and project file edits, use `apply_patch` only and avoid whole-file rewrite commands.
- Before closing a task, run `git diff -- <touched-file>` for every edited file and run the most relevant validation command available, even for bootstrap work.
