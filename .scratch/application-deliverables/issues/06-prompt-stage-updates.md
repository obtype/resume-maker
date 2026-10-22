# 06 — Prompt stage: selection-aware prompt and warnings

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 03, 05

## Context

The Prompt stage still calls `buildCvPrompt` with one template and always shows renderer/schema controls. It must build the prompt for the current deliverable selection, show which templates were used, and hide CV-only controls when the CV is not requested. See `../spec.md` section “Stage 2 — Prompt”.

## Scope

- `src/views/stages/PromptStage.tsx`:
  - Receive the template map and per-template sources from ticket 04.
  - Call `buildProjectPrompt({ profile, project, schema, templates })`.
  - Show a compact selection summary for the four deliverables.
  - Show renderer/schema controls only when `cv` is selected; otherwise show a “CV not requested” note and do not use the schema.
  - Show the source badge(s) for the templates used by the current request; use “mixed” or a small list when they differ.
  - Show selection-aware `promptWarnings`.
  - Keep the token estimate, stale badge, Regenerate, Save, Copy, and editable prompt box.
  - Disable Copy and show an error if the selection is empty (defensive; the Target stage prevents it).
  - Update the copy that says the prompt comes from “the single template in Settings”.
- `src/views/ProjectView.tsx`:
  - Update the stage 2 hint if needed.
  - Pass the template map/sources through.
- `src/app.css`:
  - Styles for the selection summary and per-template source list.

## Acceptance Criteria

- A CV-only project generates the existing bare-CV prompt.
- A CV + cover-letter project generates the combined envelope prompt.
- A cover-letter-only project generates a prompt with no CV schema and no reference CV, and the renderer/schema controls are hidden.
- Changing the selection in stage 1 and returning to stage 2 shows the stale badge; Regenerate refreshes the prompt.
- The source badge reflects the templates actually used; an override on the cover-letter template is visible.
- Warnings match the selection: a cold email with no job description does not warn about the missing description.
- Copy still saves the prompt to `prompts/latest.md`.
- `npm run build` and `npm test` pass.

## Tests

Covered mostly by `tests/prompt.test.ts` in ticket 03. Extend the smoke test to:
- build a CV + cover-letter prompt and assert both task headings and the envelope key are present;
- build a cover-letter-only prompt and assert the CV schema is absent;
- change the selection and assert the stale badge appears.

## Comments

- Rewrote `src/views/stages/PromptStage.tsx` around the selection-aware builder. It resolves the selection once (defensively, without throwing), calls `buildProjectPrompt({ profile, project, schema, templates })`, and never builds a prompt when the selection is empty. Copy, Regenerate, and Save are disabled in that case and an explicit "No deliverables selected" error names stage 1 · Target.
- Added a compact selection summary showing all four deliverables as selected/unselected (`data-testid="selection-summary"`, `data-deliverable` + `data-selected`), plus an "N of 4 selected" count.
- Renderer and schema controls now render only when `cv` is selected. Otherwise the stage shows a "CV not requested" note, the token line says "no CV schema", and the prompt contains no CV task, schema, instructions, or reference CV (the builder already ignores the CV schema for message-only requests).
- Template sources are shown for the templates actually used by the request (shared context plus each selected task), with an aggregate badge that is `bundled`/`override`/`fallback` when uniform and `mixed` when they differ. A short note explains workspace overrides. The old "single template in Settings" framing is gone; the copy names the shared context plus one task template per deliverable.
- `promptWarnings(profile, project)` now drives the stage directly, so warnings follow the selection (for example, no missing-description warning for a cold email or LinkedIn message, and CV-only gaps only when the CV is requested). Error-level warnings render as error text. The stale badge compares the current generated prompt with the loaded baseline and is suppressed for an empty selection.
- Kept the character/token estimate, stale badge, Regenerate, Save, Copy, editable prompt box, fallback warning, and PDR/privacy fineprint (now also mentioning recipient text as third-party personal data).
- `src/views/ProjectView.tsx`: stage 2 hint is now "Build, copy, save"; `templates` and `templateSources` continue to flow through to the Prompt stage.
- `src/app.css`: added selection-summary/chip styles, a `.badge.mixed` variant, and prompt-meta spacing; the source list keeps its existing narrow-width wrapping.
- Extended `scripts/smoke.mjs`: asserts a combined request contains both task headings and the envelope `coverLetter` key; narrows to CV + cover letter and checks the envelope; builds a cover-letter-only prompt and asserts the CV task, `REQUIRED OUTPUT SCHEMA`, and `"schemaVersion"` are absent while the metadata says "Schema: none (CV not requested)", and that the renderer/schema controls are hidden; changes the selection and asserts the stale badge appears, then Regenerate clears it and refreshes the prompt; verifies the selection summary flags; verifies the cover-letter override source badge and the `mixed` summary after saving an override in Settings; and adds a copy-marker edit that proves Copy still writes `prompts/latest.md`.
- Checks: `npm test` (128 passed, 9 files), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-ups: ticket 07 still needs the per-deliverable response cards and "load CV JSON" gating; ticket 09 still needs the documentation sweep (AGENTS invariants, prompt pipeline, data model, workspace shape) and the extended end-to-end cover-letter-only/cold-email/LinkedIn flows.
