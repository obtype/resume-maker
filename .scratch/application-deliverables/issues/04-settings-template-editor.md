# 04 — Settings template editor and app-level template state

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 02, 03

## Context

There is currently one prompt template and one Settings textarea. The feature needs five templates, each with its own workspace override and source indicator, plus a one-time notice when the old `config/cv-prompt.md` is archived. See `../spec.md` sections “Prompt templates”, “Workspace override migration”, and “Settings”.

## Scope

- `src/core/workspace/projects.ts`:
  - `loadPromptTemplates(root)` returns a `Record<PromptTemplateId, string | null>` for the five override files under `config/prompts/`.
  - `savePromptTemplateOverride(root, id, text)` writes `config/prompts/<file>`.
  - `resetPromptTemplateOverride(root, id)` removes that file.
  - Remove the old single-template functions or keep them only as internal helpers; no caller should still use `config/cv-prompt.md`.
- `src/App.tsx`:
  - Replace `promptTemplate` / `templateSource` with per-template state.
  - On hydrate, run `archiveLegacyPromptOverride`, then load each override; fall back to the bundled template, then to the per-template fallback.
  - Keep the archive result in state for the Settings notice.
  - Pass the template map and sources to `ProjectView` and `SettingsView`.
- `src/views/SettingsView.tsx`:
  - Tabs: Shared context, CV, Cover letter, Cold email, LinkedIn message.
  - Per-tab source badge, textarea, Save override, Reload, Use bundled default.
  - Per-tab placeholder list.
  - One-time legacy archive notice naming the archived path.
  - Keep workspace, renderer checks, and browser support sections.
- `src/views/ProjectView.tsx` and `src/views/stages/PromptStage.tsx`:
  - Change the single `template` / `templateSource` props to the map and per-template sources.
  - Ticket 06 owns the final Prompt-stage UI; this ticket only makes the data available and keeps the build compiling.
- `src/app.css`:
  - Styles for the template tabs and the archive notice.

## Acceptance Criteria

- All five templates load from bundled files when no overrides exist.
- Saving an override writes only `config/prompts/<id>.md` and the Settings badge changes to `override` for that tab.
- Reloading picks up an external edit to that file.
- “Use bundled default” removes only that override.
- The legacy `config/cv-prompt.md` is archived once, and Settings shows the archive path on that boot.
- A missing bundled file falls back to the minimal per-template fallback and the badge shows `fallback`.
- The app still builds and the renderer checks are unaffected.
- `npm run build` and `npm test` pass.

## Tests

No React component test infrastructure exists. Cover the loader/override functions with unit tests where practical, and extend the smoke test to:
- open Settings, switch template tabs, save an override, assert the override badge, reset it, assert the bundled badge;
- assert the legacy archive notice appears when the smoke workspace is seeded with `config/cv-prompt.md`.

## Comments

- Implemented per-template workspace overrides in `src/core/workspace/projects.ts`: `loadPromptTemplates(root)` returns all five `config/prompts/<file>` texts (or `null`), `savePromptTemplateOverride(root, id, text)` writes only that file, and `resetPromptTemplateOverride(root, id)` removes only that file. The old single `config/cv-prompt.md` override helpers were replaced; no caller writes or reads that slot for templates anymore.
- `App` now holds `promptTemplates` plus `templateSources` keyed by `PromptTemplateId`, resolving each template as override -> bundled -> per-template fallback. Hydrate calls `archiveLegacyPromptOverride` once per workspace before loading overrides, keeps the archive result in state for the Settings notice, and records archive failures separately so the UI never implies success. Save/reload/reset update only the affected template and its source badge; a failed archive leaves the legacy file in place.
- `SettingsView` has the five tabs (Shared context, CV, Cover letter, Cold email, LinkedIn message), per-tab source badge, textarea, Save override, Reload, Use bundled default, per-tab placeholder lists, and the legacy archive notice/error. Workspace, renderer checks, and browser support sections remain.
- `ProjectView`/`PromptStage` now receive `templates` and `templateSources`; `PromptStage` builds with the template map and shows per-template source badges plus a fallback warning. The full selection-aware Prompt UI remains ticket 06.
- Added `template-tabs`, tab badge, source-list, and archive-notice styles in `src/app.css`.
- `tests/project.test.ts` adds 5 tests for null loader results, per-id writes, id -> file mapping, reset isolation, and resetting a missing override (25 tests in the file). `scripts/smoke.mjs` now seeds `config/cv-prompt.md`, asserts the archive notice names `config/cv-prompt.legacy.md` and the original is gone, checks all five tabs load bundled text, saves a cover-letter override, asserts the `override` badge and only `config/prompts/cover-letter.md` was written, edits the file externally and reloads, then resets and asserts the `bundled` badge and file removal.
- Checks: `npm test` (128 passed, 9 files), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-up for ticket 06: use the map/sources for the final Prompt-stage selection summary and schema gating; the current source list is a minimal bridge. The archive notice is shown for the boot in which archiving happened and is not persisted beyond it.

