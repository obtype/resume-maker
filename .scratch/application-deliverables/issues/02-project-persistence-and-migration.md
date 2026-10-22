# 02 — Project persistence and workspace migration

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 01

## Context

A project must remember which deliverables are selected, their instructions and recipients, and any message content that has been applied. It must also load existing version-1 projects and archive the old single prompt override safely. See `../spec.md` sections “Storage” and “Workspace override migration”.

## Scope

- `src/core/project.ts`:
  - Bump `Project.schemaVersion` to `2`.
  - Add `deliverables: DeliverableSelection` and `artifacts: DeliverableArtifacts` from ticket 01.
  - Rename `ProjectJob.instructions` to `sharedInstructions`.
  - Extend `Project.files` with `coverLetter`, `coldEmail`, and `linkedinMessage`.
  - Keep `promptText`, `rawResponse`, and `cv` as in-memory fields that are not persisted into `project.json`.
- `src/core/workspace/projects.ts`:
  - `initializeWorkspace` creates `config/prompts/`.
  - `createProject` accepts the deliverable selection and optional recipient name, creates `deliverables/`, initializes default settings, and derives the project name and slug from company → title → recipient → `outreach`.
  - `loadProject` accepts a missing or version-1 record, maps `job.instructions` to `sharedInstructions`, fills default deliverable selection/settings, and reads applied artifacts from their indexed files.
  - `saveProject` writes `deliverables/cover-letter.md`, `deliverables/cold-email.json`, and `deliverables/linkedin-message.txt` when present; records their paths in `files`; removes a stale file and index entry when an artifact is cleared.
  - `saveProject` writes `inputs/instructions.md` from `sharedInstructions`.
  - `projectDeliverableFilename(project, profile, deliverable)` returns `<name>-<company>-cover-letter`, `-cold-email`, or `-linkedin-message`, using the same company → title → recipient → `application` fallback as the CV filename.
  - `archiveLegacyPromptOverride(root)` copies `config/cv-prompt.md` to `config/cv-prompt.legacy.md` without overwriting an existing archive, removes the original only after the archive write succeeds, and returns `{ archived, archivePath? }`.
  - Extract a pure project-normalization helper so the version-1 migration can be tested without a browser filesystem.
- Do not add input mirrors for per-deliverable instructions or recipients; `project.json` and the saved prompt are the record.

## Acceptance Criteria

- An existing version-1 project loads with `selected: ["cv"]`, empty message artifacts, and the old `job.instructions` preserved as `sharedInstructions`.
- `project.json` never contains CV content, prompt text, raw response text, or message artifact content.
- Round-tripping a project with all three messages restores the same content and file index.
- Clearing a message removes its file on the next save and leaves the other artifacts intact.
- `archiveLegacyPromptOverride` never overwrites an existing archive and never deletes the legacy file if the archive write fails.
- A project with no job title/company gets a readable name and slug.
- `npm run build` and `npm test` pass.

## Tests

Add `tests/project.test.ts` for:
- version-1 → 2 migration and defaults;
- selection normalization and unknown deliverable ids;
- project name/slug fallbacks;
- deliverable filename helpers;
- `archiveLegacyPromptOverride` using a small in-memory directory handle or a fake of the `fs.ts` functions.

If a filesystem fake is too heavy, keep the pure migration/name helpers tested and cover the file round-trip in the smoke test.

## Comments

- Ticket 01 already added the `Project.deliverables`/`artifacts` fields, bumped `Project.schemaVersion` to 2, and initialized/normalized the selection in `createProject`/`loadProject`. This ticket still owns the version-1 `sharedInstructions` migration, artifact file round-tripping, stale-file cleanup, the `deliverables/` directory, `config/prompts/`, and the legacy prompt archive.
- Implemented:
  - `ProjectJob.instructions` is now `sharedInstructions`; references in `builder.ts`, `ApplyStage.tsx`, and `tests/prompt.test.ts` were updated minimally. Prompt behavior is otherwise unchanged.
  - Added pure `normalizeProjectRecord` in `src/core/project.ts` for version-1 -> 2 migration, defaults, files, and selection normalization.
  - `loadProject` reads `config/prompts/` workspace init, migrates v1 instructions, drops stale file index entries, and reads artifacts from `deliverables/`.
  - `createProject` accepts an optional deliverable selection and recipient name, creates `deliverables/`, and derives names/slugs from company -> title -> recipient -> `outreach`.
  - `saveProject` mirrors `sharedInstructions` to `inputs/instructions.md`, writes `deliverables/cover-letter.md`, `cold-email.json`, and `linkedin-message.txt`, indexes only their paths, and removes cleared artifact files/index entries.
  - `projectDeliverableFilename` plus recipient fallbacks in `projectCvFilename`/`projectDisplayName`.
  - `archiveLegacyPromptOverride` writes `config/cv-prompt.legacy.md` (timestamped suffix on collision), removes the original only after a successful write, and cleans up a partial archive on failure.
  - `tests/project.test.ts` (20 tests) with an in-memory File System Access fake covers migration/defaults, selection normalization, name/slug fallbacks, filename helpers, artifact round-trip/cleanup, and the archive helper.
- Checks: `npm test` (93 passed), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-up for tickets 03/04: `archiveLegacyPromptOverride` is implemented but not yet called from `App` hydrate, because the split prompt templates and active override path land in ticket 03. Call it when `config/cv-prompt.md` is replaced by `config/prompts/<id>.md`, and show the returned archive path in Settings.
