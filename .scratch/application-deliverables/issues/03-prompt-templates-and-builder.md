# 03 — Shared context and per-deliverable prompt templates

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 01, 02

## Context

The current prompt is one `cv.md` template that always includes the job, the PDR, and the CV schema. It must become a shared context template plus one task template per deliverable, composed into one prompt for the current selection. The output contract must be bare CV for a CV-only request and an envelope for everything else. See `../spec.md` sections “Prompt templates” and “Output contract”, and `docs/adr/0002-one-prompt-for-multiple-deliverables.md`.

## Scope

### Bundled templates

Create:

- `public/config/prompts/context.md`
- `public/config/prompts/cv.md`
- `public/config/prompts/cover-letter.md`
- `public/config/prompts/cold-email.md`
- `public/config/prompts/linkedin-message.md`

Move the universal rules from the current `cv.md` into `context.md`: JSON only, no fences, facts only, exact names/contact/dates, no invention, no extra fields, bare URLs, and the requested-deliverable rules. Keep CV-specific rules in `cv.md`: relevance selection, bullet style, one-page limit, section titles, date format, reference CV, CV schema, and schema notes.

The cover-letter, cold-email, and LinkedIn templates must each contain their own task, tone, length, factuality, and output rules. The cover letter must allow first-person prose and must not use CV bullet style. The LinkedIn template must say the connection request was already accepted and must not write a 300-character connection note. The cold-email template must say a missing job description is valid and must not invent a role.

### Builder

Refactor `src/core/prompt/builder.ts`:

- `PromptTemplateId = "context" | "cv" | "coverLetter" | "coldEmail" | "linkedinMessage"`.
- `PROMPT_TEMPLATE_FILES` and `loadBundledPromptTemplate(id)`.
- `FALLBACK_TEMPLATES` with a minimal prompt per template, used only when the bundled file cannot be fetched.
- `buildProjectPrompt({ profile, project, schema, templates })`.
  - Emit `context.md` once.
  - Emit only the selected task templates, in fixed order: CV, cover letter, cold email, LinkedIn.
  - Append a generated output-contract section:
    - CV-only: return the CV object directly.
    - Multi/other: one envelope object with only the requested keys, plus the composed envelope JSON Schema from `buildEnvelopeSchema`.
  - Append a generated metadata footer with schema id, selected deliverables, prompt version, and date.
- Fill these placeholders:
  - `{{BASICS}}`, `{{PDR}}`, `{{JOB_TITLE}}`, `{{COMPANY}}`, `{{JOB_DESCRIPTION}}`, `{{SHARED_INSTRUCTIONS}}`, `{{EXISTING_CV}}`.
  - `{{REFERENCE_CV}}`, `{{CV_INSTRUCTIONS}}`, `{{SCHEMA_NAME}}`, `{{SCHEMA_ID}}`, `{{SCHEMA_JSON}}`, `{{SCHEMA_NOTES}}`.
  - `{{COVER_LETTER_INSTRUCTIONS}}`, `{{COVER_LETTER_SCHEMA}}`.
  - `{{COLD_EMAIL_INSTRUCTIONS}}`, `{{COLD_EMAIL_SCHEMA}}`, `{{RECIPIENT}}`.
  - `{{LINKEDIN_INSTRUCTIONS}}`, `{{LINKEDIN_SCHEMA}}`, `{{RECIPIENT}}`.
- Input scoping:
  - Basics, PDR, job, and shared instructions go to every request.
  - Reference CV only to the CV task.
  - Recipient block only to cold email and LinkedIn.
  - Existing CV context only when `cv` is not selected and `project.cv` has content.
  - When `cv` is selected, instruct the other tasks to use the CV in the same response as the source of truth.
- Add helpers:
  - `existingCvText(cv)` — compact Markdown, not raw JSON.
  - `recipientText(recipient)` — omit empty fields; fall back to “(No recipient details provided.)”.
  - `instructionsText(profile, project, deliverable)` — shared project instructions + profile defaults for the shared block; per-deliverable instructions for the task block.
  - Neutral job fallbacks: no job description must read “(No job description provided.)” and must never tell a cold email to tailor to a title/company.
- `promptWarnings(profile, project)` becomes selection-aware:
  - Always: no PDR, no name.
  - CV: no contact details, no job title/company/description.
  - Cover letter: no job title/company/description.
  - Cold email: no recipient name/company and no company/job context; missing job description is not a warning.
  - LinkedIn: no recipient name; missing job description is not a warning.
  - 3+ selected deliverables: non-blocking “combined responses can be long” warning.
  - Empty selection: error.
- Bump `PROMPT_VERSION`.

## Acceptance Criteria

- A CV-only prompt contains the CV task, the CV schema, and the bare-CV output contract; it contains no envelope.
- A CV + cover-letter prompt contains the shared context once, both task blocks, per-deliverable instructions, and the envelope contract.
- A cover-letter-only prompt contains no CV schema, no reference CV, and no CV instructions.
- A standalone cover letter includes a compact rendering of the existing CV; a combined CV + cover-letter request does not duplicate it and instructs consistency.
- A cold email with no job contains no “tailor only to the title and company” text and produces no missing-description warning.
- A cold email with recipient context contains the recipient block; a CV request does not.
- All documented placeholders are replaced; unknown placeholders remain visible.
- A 3-deliverable selection warns; a 4-deliverable selection still builds.
- An empty selection throws or returns an explicit error and never produces a prompt.

## Tests

Rewrite/extend `tests/prompt.test.ts` for every acceptance criterion. Use fictional data. Assert prompt content, not exact whitespace. Assert that the PDR appears once in a combined prompt. Run `npm test`.

## Comments

- Implemented the split templates: `context.md`, `cv.md`, `cover-letter.md`, `cold-email.md`, and `linkedin-message.md` under `public/config/prompts/`. Universal JSON/facts/URL rules, candidate basics, PDR, job, shared instructions, and the existing-CV block moved to `context.md`; CV-only rules stayed in `cv.md`.
- Refactored `src/core/prompt/builder.ts`: `PromptTemplateId`, `PROMPT_TEMPLATE_FILES`, `bundledPromptUrl`, `loadBundledPromptTemplate(id)`, `FALLBACK_TEMPLATES`, `PromptTemplates`, and `buildProjectPrompt({ profile, project, schema, templates, date? })`. The prompt is context once, then selected tasks in CV -> cover letter -> cold email -> LinkedIn order, then the generated output contract (bare CV for CV-only, composed envelope schema otherwise) and metadata footer. `PROMPT_VERSION` is now `2026-10-22.2`.
- Added `existingCvText`, `recipientText`, `instructionsText(profile, project, deliverable?)`, `resolveDeliverableSelection`, and selection-aware `promptWarnings` (`PromptWarning[]` with `warn`/`error`). Empty selections throw in the builder and produce an error warning.
- Minimal call-site wiring only: `App` loads one bundled template per id (legacy `config/cv-prompt.md` still applies to the CV slot), `ProjectView`/`PromptStage` pass the template record, and `PromptStage` renders warning messages. Settings tabs, per-template overrides, legacy archive, and the full Prompt stage UI remain for tickets 04 and 06.
- Rewrote `tests/prompt.test.ts` (25 tests) for every acceptance criterion: CV-only bare contract, combined context/PDR-once/envelope, cover-letter-only omitting CV schema/reference/instructions, existing-CV reuse, cold email no-job neutral text and no missing-description warning, recipient scoping, placeholder fill/unknown preservation, 3+ warning and 4-deliverable build, empty-selection error, and helper behavior.
- Checks: `npm test` (114 passed, 8 files), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed). The first smoke run hit a stale Vite dev server on 5173 with an outdated module graph (`promptTemplate is not defined`); after stopping it, the clean smoke run passed.

