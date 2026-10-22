# 05 — Target stage: deliverable selection and per-deliverable inputs

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 01, 02

## Context

Stage 1 is currently “Job” and only collects the listing, reference CV, and one instructions box. It must become the place where the user chooses which deliverables to request and enters the context each one needs. See `../spec.md` section “Stage 1 — Target”.

## Scope

- `src/views/ProjectView.tsx`:
  - Rename stage 1 to “1 · Target” and update its hint.
- `src/views/stages/ApplyStage.tsx`:
  - Keep job title, company, and description; all optional.
  - Rename the instructions label to “Shared instructions for this application”; bind it to `job.sharedInstructions`.
  - Keep the reference CV panel, but note that it is used only for the CV deliverable.
  - Add a “Deliverables” panel with a checkbox per deliverable and a “generated” badge when the project already has content for it.
  - Prevent unchecking the last selected deliverable.
  - Add a “Select missing only” action that checks exactly the deliverables without content.
  - Add collapsible per-deliverable panels:
    - CV: instructions.
    - Cover letter: instructions.
    - Cold email: instructions + recipient fields.
    - LinkedIn: instructions + recipient fields.
  - Selected panels open by default; unselected panels stay collapsed or disabled.
  - Recipient fields: name, role, company, profile URL, about, posts, relationship/context, intent. Inputs for the short fields, textareas for the long ones.
  - Add a privacy note: recipient profile and post text is third-party personal data that will be sent to the LLM.
  - Persist every change through `onChange`.
- Add a reusable `RecipientFields` component if it keeps the stage readable.
- `src/views/ProfileView.tsx`:
  - Note that `defaultInstructions` now apply to every deliverable.
- `src/app.css`:
  - Styles for the deliverable grid, panels, recipient grid, and generated badges.

## Acceptance Criteria

- The selection persists in `project.deliverables.selected` and survives a reload.
- At least one deliverable is always selected; the last checkbox cannot be unchecked.
- Per-deliverable instructions persist in `project.deliverables.settings[id].instructions`.
- Recipient fields persist only for cold email and LinkedIn.
- “Select missing only” selects the deliverables without content and never produces an empty selection.
- A generated CV shows a generated badge; generated messages do too.
- Unchecking a generated deliverable does not delete its content.
- The shared instructions field is labelled and stored as `sharedInstructions`.
- The reference CV note makes clear it is CV-only.
- `npm run build` passes and the stage remains usable at narrow widths.

## Tests

No component test infrastructure exists. Extend the smoke test to select a cover letter, enter cover-letter instructions and a cold-email recipient, and assert the values survive navigation and appear in the generated prompt (ticket 06). Add small unit tests for the “select missing only” and “at least one” helpers if they are extracted as pure functions.

## Comments

- Implemented stage 1 as **1 · Target** with the hint "Deliverables, job context, instructions". Job title, company, and description remain optional; the instructions field is now "Shared instructions for this application" and binds `job.sharedInstructions`.
- `ApplyStage` now has a Deliverables panel with a checkbox per deliverable and a green `generated` badge driven by `deliverableHasContent`. The last remaining checkbox is disabled, and the pure toggle helper also refuses an empty selection. "Select missing only" checks exactly the content-less deliverables and keeps the current selection when everything already has content.
- Added collapsible per-deliverable panels: CV instructions, cover-letter instructions, cold-email instructions + recipient fields, and LinkedIn instructions + recipient fields. Selected panels open by default; unselected panels start collapsed and are marked "not requested". Every change is persisted through `onChange`.
- Added reusable `src/components/RecipientFields.tsx` with short inputs for name/role/company/profile URL, textareas for about/posts/relationship/intent, and the third-party personal-data privacy note.
- Reference CV panel now states it is used only for the CV deliverable and is never sent to the message tasks.
- `ProfileView` now labels `defaultInstructions` as applying to every deliverable.
- Added `src/core/deliverables/selection.ts` with `toggleDeliverableSelection`, `missingDeliverableIds`, and `selectMissingDeliverables`; `tests/selection.test.ts` covers the last-selected guard, canonical ordering, and "select missing only" (including the all-content fallback).
- Added `src/app.css` styles for the deliverable grid, generated badges, collapsible panels, recipient grid, and privacy note, with narrow-width stacking at 760px.
- Extended `scripts/smoke.mjs`: it verifies the default CV selection and disabled last checkbox, selects a cover letter and cold email, enters shared/cover-letter instructions and a cold-email recipient, asserts the values survive navigation, asserts `project.json` persisted `selected`, `settings`, `sharedInstructions`, and recipient scoping, and verifies the generated CV badge plus "Select missing only".
- Checks: `npm test` (123 passed, 9 files), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-ups: the Prompt stage still needs the selection summary, CV-only schema/renderer gating, per-template source badges, and the 3+ deliverable warning UI (ticket 06). Full response cards, message apply/preview/download, and the extended end-to-end coverage belong to tickets 07 and 09.
