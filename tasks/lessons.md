# Lessons

## 2026-03-11

- When a user adds editing guardrails, treat that as an immediate correction and write the rule into `tasks/lessons.md` before continuing.
- For source and project file edits, use `apply_patch` only and avoid whole-file rewrite commands.
- Before closing a task, run `git diff -- <touched-file>` for every edited file and run the most relevant validation command available, even for bootstrap work.
- When the user answers previously open product questions, immediately convert those answers into explicit spec rules and remove or reduce the corresponding open questions.
- If a gameplay rule was filled in by inference and the user later gives an exact tie-break or resolution rule, replace the inferred rule immediately and preserve the user-defined precedence exactly.
- When the user adds a new gameplay reset condition, update the spec and the executable game flow together so the UI and domain engine cannot drift apart.
