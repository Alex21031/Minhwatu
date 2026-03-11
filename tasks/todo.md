# Todo

- [x] Inspect repository state and confirm existing instruction and task files.
- [x] Add `AGENTS.md` with the provided local editing, orchestration, verification, and quality rules.
- [x] Create initial project bootstrap files that reference `AGENTS.md`.
- [x] Verify each touched file with `git diff -- <file>`.
- [x] Run a repository validation command to confirm the scaffold is present.

# Review

- Added project workflow documents: `AGENTS.md`, `README.md`, `docs/project-spec.md`, `tasks/todo.md`, and `tasks/lessons.md`.
- Added a basic `.gitignore` for common editor and build artifacts.
- Verified touched files with `git diff -- <file>`. Because the files are new and untracked, `git diff -- <file>` returned no patch output.
- Ran a scaffold validation command and confirmed all required bootstrap files exist.
