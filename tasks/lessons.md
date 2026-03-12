# Lessons

## 2026-03-11

- When a user adds editing guardrails, treat that as an immediate correction and write the rule into `tasks/lessons.md` before continuing.
- For source and project file edits, use `apply_patch` only and avoid whole-file rewrite commands.
- Before closing a task, run `git diff -- <touched-file>` for every edited file and run the most relevant validation command available, even for bootstrap work.
- When the user answers previously open product questions, immediately convert those answers into explicit spec rules and remove or reduce the corresponding open questions.
- If a gameplay rule was filled in by inference and the user later gives an exact tie-break or resolution rule, replace the inferred rule immediately and preserve the user-defined precedence exactly.
- When the user adds a new gameplay reset condition, update the spec and the executable game flow together so the UI and domain engine cannot drift apart.
- When the user changes turn-resolution ownership from automatic logic to direct player choice, update the spec, domain state machine, tests, and UI interaction together in the same pass.
- When the user tightens a turn rule after a first implementation, remove the now-invalid UI path and enforce the same restriction in the domain layer so the client cannot bypass it.
- When the user adds a rule that depends on the initial deal layout, persist that initial deal metadata in the round state instead of trying to infer it later from mutated floor cards.
- When a user reports that a player-count-specific flow cannot progress, check the original rule order first; missing phase order is often the real bug, not the visible button.
- When a user says a flow still cannot be tested after a rule fix, remove unnecessary manual prototype steps from that path before assuming the core rule is wrong.
- When the browser UI is excluded from the TypeScript domain build, manually audit union-state rendering branches for runtime-only property access bugs before treating the flow as fixed.
- When a user clarifies what happens to surrendered pre-dealt cards, preserve the full 48-card flow explicitly by reinserting those cards into the locked draw pile instead of dropping them from the round state.
- When moving synchronized gameplay UI onto a new board surface, migrate the clickable zone attributes and delegated click handlers with it; visual parity alone is not enough.
- When the browser reports an unhandled multiplayer message type that the source already supports, treat the running dev server as potentially stale and add explicit protocol capability checks instead of assuming only the source code is wrong.
- When the user explicitly deprioritizes social features like chat, do not spend the next slice there; move to core room or game integrity work instead.
- When a user reports that scoring is wrong, reproduce the issue with a concrete captured-card example before changing formulas or card metadata.
- For Hanafuda-style assets, verify the local month ordering against the user's Korean month names before assigning card categories; Japanese month ordering for 11 and 12 can invert scoring.
- When the user provides an explicit per-card point table, use that table directly in the scoring engine instead of inferring points from broader categories.
- When the user corrects a single card's point value, update the card metadata and the exact deck-layout tests together; do not leave derived category totals stale.
- When the user rejects the overall UI structure, do not keep polishing the same layout; replace the information hierarchy and panel composition directly while preserving only the parts they explicitly liked.
- When the user says debug or history panels are no longer useful, remove them instead of trying to visually soften them; then regroup the remaining controls by task so the main actions read like a menu.
- When the user says a debug-only surface like `Local Sandbox` is no longer needed, delete it completely instead of preserving it as a collapsed fallback.
- When the user asks to move a control surface into the center, treat that as an information-hierarchy change and reorganize the main workspace around that priority instead of only nudging alignment.
- When the user points to a dedicated main-menu reference, separate the pre-game home screen from the in-game table instead of trying to reuse one shared layout for both.
- When the user says a menu option like `연습` should be removed, delete the branch entirely and do not leave it as a lightly hidden placeholder.
- When the user wants menu navigation to feel page-based, show only the chosen section and add an explicit back path instead of keeping the root menu visible underneath.
- When the user says scrolling feels bad, treat it as a viewport-layout problem and restructure the screen so the primary workflow fits in one screen before polishing details.
- When the user points to polished game-client references, match their information hierarchy and visual weight directly instead of delivering a thin placeholder skin over the old layout.
