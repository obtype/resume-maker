# 01 — Deliverable domain model and output schemas

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** none

## Context

The feature needs one vocabulary and one contract for the four deliverables before persistence, prompts, or UI can use them. This ticket adds the pure domain layer only: ids, types, JSON Schemas, normalization, response splitting, and validation. No filesystem, React, or prompt-template changes.

See `../spec.md` sections “Domain and data model”, “Output contract”, and “Deliverable schemas and limits”.

## Scope

- New `src/core/deliverables/types.ts`:
  - `DeliverableId = "cv" | "coverLetter" | "coldEmail" | "linkedinMessage"`.
  - `Recipient` with `name`, `role`, `company`, `profileUrl`, `about`, `posts`, `relationship`, `intent`.
  - `DeliverableSettings` with `instructions` and optional `recipient`.
  - `DeliverableSelection` with `selected` and `settings`.
  - `ColdEmailContent` with `subject` and `body`.
  - `DeliverableArtifacts` with optional `coverLetter`, `coldEmail`, and `linkedinMessage`.
- New `src/core/deliverables/schema.ts`:
  - `MESSAGE_DELIVERABLES` registry for `coverLetter`, `coldEmail`, `linkedinMessage`: label, output key, template filename, JSON Schema, prompt notes, advisory length.
  - `DEFAULT_DELIVERABLE_SELECTION = ["cv"]`.
  - `isDeliverableId`, `deliverableLabel`, `deliverableHasContent`.
    - CV content means a non-empty summary, education, skills, experience, projects, or custom array; the placeholder basics from `createEmptyCv` do not count.
    - Message content means non-empty trimmed text, or a non-empty subject or body for the cold email.
  - `buildEnvelopeSchema(selection, cvSchema)` returns one object schema with `additionalProperties: false`, only the selected keys, and the selected CV schema under `cv`.
- New `src/core/deliverables/normalize.ts`:
  - `normalizeSelection(value)` returns a deduplicated valid selection and defaults to `["cv"]` when the value is missing, empty, or contains no valid id.
  - `normalizeDeliverableSettings(value)` fills missing settings and recipients.
  - `normalizeCoverLetter(value)`, `normalizeColdEmail(value)`, `normalizeLinkedinMessage(value)` trim strings and drop unknown message fields.
  - `splitResponseForSelection(value, selection)` returns a part per requested deliverable plus a list of missing and unrequested keys. Handle:
    - CV-only: a bare CV object, or an envelope with `cv`.
    - Multi/other: an envelope.
    - Multi with a bare CV object and `cv` requested: use it as the CV and report the rest missing.
- New `src/core/deliverables/validate.ts`:
  - Per-deliverable validation results with `valid`, `errors`, `warnings`, and normalized data.
  - Hard errors: missing key, wrong type, empty string, missing email subject/body, over hard limits.
  - Advisory warnings: length targets, and a LinkedIn message under 300 characters looking like a connection note.
  - Reuse Ajv the same way `src/core/cv/validate.ts` does; do not create a second validator style.
- Export the new module from a small barrel if that matches the repo's style; otherwise direct imports are fine.

## Acceptance Criteria

- The types compile and are imported by `src/core/project.ts` without circular runtime imports.
- The envelope schema contains only the requested keys and validates a representative envelope.
- A CV-only bare object and a CV-only envelope both split to a CV part.
- A multi-deliverable bare CV splits to the CV and reports the other selected deliverables missing.
- Unrequested envelope keys are dropped and reported.
- Per-deliverable validation never throws on malformed model output.
- The CV validation path is unchanged.
- A freshly created empty CV does not report as having content.

## Tests

Add `tests/deliverables.test.ts` covering every case in the acceptance criteria plus:
- valid cover letter, cold email, and LinkedIn message;
- empty strings, wrong types, missing subject;
- over-limit hard failures and advisory warnings;
- unknown fields dropped;
- selection normalization with duplicates, unknown ids, and an empty array.

Run `npm test`.

## Comments

- Implemented in this branch:
  - `src/core/deliverables/types.ts`
  - `src/core/deliverables/schema.ts`
  - `src/core/deliverables/normalize.ts`
  - `src/core/deliverables/validate.ts`
  - `tests/deliverables.test.ts` (34 tests)
- `Project` now carries `deliverables` and `artifacts` and reports `schemaVersion: 2`; `createProject`/`loadProject` initialize/normalize the selection, and `saveProject` keeps artifact content out of `project.json`.
- Checks: `npm test` (73 passed), `npm run build`, `npm run check:renderers`, `npm run smoke`.
- Persistence, migration, artifact file IO, and the legacy prompt archive remain ticket 02.
