# 09 — Documentation and end-to-end smoke coverage

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 08

## Context

The feature changes the project data model, the prompt pipeline, the response stage, the workspace layout, and the UI vocabulary. The docs and the end-to-end smoke test must describe and prove the new behaviour. `GLOSSARY.md` and `docs/adr/0002-one-prompt-for-multiple-deliverables.md` are already written.

## Scope

### Documentation

- `AGENTS.md`:
  - Invariant 3: the deliverable schemas and envelope are part of the shared contract; update them with the schema.
  - Invariant 4: prompt text now lives in a shared context template plus one task template per deliverable; the output contract and metadata footer are generated; update the fallback rule.
  - Invariant 5: add envelope splitting, per-deliverable normalization, and escaping of message previews.
  - Invariant 10: CV inline editing stays host-level; messages are plain textareas, not renderer fields.
  - Workspace shape: add `deliverables/` and `config/prompts/`; mention `config/cv-prompt.legacy.md`.
  - Architecture map: add `src/core/deliverables/`.
  - “Change the prompt”: replace the single-file instructions with the five templates and their override paths.
  - “Add a document preset”: mark the CV/cover-letter/email/LinkedIn presets as implemented and describe how to add another.
  - Testing notes: add the deliverable tests and smoke scenarios.
  - Known limitations: no cover-letter PDF, one artifact per type, no request history.
- `docs/data-model.md`:
  - Workspace layout and project schema version 2.
  - Deliverable selection, settings, recipient, artifacts, file index.
  - Deliverable schemas and limits.
  - Envelope shape and CV-only special case.
  - Version-1 migration.
- `docs/prompt-pipeline.md`:
  - Files table, placeholder table per template, composition order.
  - Stage descriptions (Target, Prompt, Response, Preview).
  - Output modes and parsing/validation per deliverable.
  - Per-deliverable prompt quality rules.
  - Template override paths and legacy archive.
- `docs/architecture.md`:
  - Main modules, end-to-end flow, persistence, limitations.
- `README.md`:
  - Feature list, quick start, prompt customization, workspace layout, privacy.
- `docs/roadmap.md`:
  - Mark the “Presets and additional document types” item as implemented and adjust the remaining ideas (for example, cover-letter PDF).

### Smoke test

Extend `scripts/smoke.mjs` with fictional data:

1. The existing CV-only flow still exports a PDF and writes `cv.json`.
2. CV + cover letter:
   - select both deliverables;
   - assert the prompt contains both task headings and an envelope key;
   - import a fake envelope with a valid CV and cover letter;
   - apply both independently;
   - assert the cover-letter card shows a preview;
   - assert `deliverables/cover-letter.md` exists and `project.json` contains no cover-letter text.
3. Cover-letter-only with a company and no CV:
   - create the project with a company and no CV;
   - assert the prompt contains the cover-letter task and job context, and no CV schema or reference CV;
   - import `{ "coverLetter": "…" }`;
   - assert the card, copy, and download work.
4. Cold email with a recipient and no job:
   - assert the prompt contains the recipient block and the neutral no-job text;
   - assert no missing-description warning.
5. LinkedIn message with a recipient:
   - assert the prompt contains the recipient block and the post-acceptance rule.

Keep the existing assertions that the workspace switch does not leak profile/project data. Do not print PII.

## Acceptance Criteria

- The docs match the implemented behaviour; no stale single-template instructions remain.
- The smoke test covers CV-only, CV + cover letter, cover-letter-only, cold email, and LinkedIn.
- The smoke test asserts message files exist and `project.json` has no message content.
- `npm run build` passes.
- `npm test` passes.
- `npm run check:renderers` passes.
- `npm run smoke` passes.
- No real PII appears in tests, fixtures, screenshots, or logs.

## Comments

- Docs updated to match the implemented five-template, multi-deliverable behaviour:
  - `AGENTS.md`: overview, architecture map, workspace shape, invariants 1/3/4/5/7/9/10, common changes (prompt, preset), testing notes, limitations.
  - `docs/data-model.md`: project schema v2, selection/settings/recipient/artifacts/file index, deliverable schemas and limits, envelope + CV-only case, v1 migration.
  - `docs/prompt-pipeline.md`: template files, placeholders, composition order, stages, output modes, parsing/validation, quality rules, overrides and legacy archive.
  - `docs/architecture.md`, `README.md`, `docs/roadmap.md`: modules/flow/persistence, user workflow and privacy, preset status and remaining ideas.
- `scripts/smoke.mjs` extended with dedicated CV-only (prompt, `cv.json`, PDF), CV + cover letter (both headings, envelope response, independent apply, preview, `deliverables/cover-letter.md`, no message text in `project.json`), cover-letter-only (task + job context, no CV schema/reference CV, apply/copy/download/save), cold email with recipient and no job (recipient block, neutral no-job text, no missing-description warning), and LinkedIn with recipient (recipient block, post-acceptance rule). Workspace-switch leak assertions retained. All data fictional.
- Checks: `npm test` (10 files, 142 tests), `npm run check:renderers` (10 tests), `npm run build` (existing chunk-size warning only), `npm run smoke` (`Smoke test passed.`).
