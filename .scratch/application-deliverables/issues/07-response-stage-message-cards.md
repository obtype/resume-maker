# 07 — Response stage: per-deliverable validation, apply, and message cards

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 01, 02, 03, 05

## Context

Stage 3 is currently “Import” and only validates and applies a CV. It must become the response inbox for every deliverable: split the response, validate each part independently, and let the user preview, edit, copy, download, apply, and clear messages. See `../spec.md` section “Stage 3 — Response”.

## Scope

### Stage and parsing

- `src/views/ProjectView.tsx`:
  - Rename stage 3 to “3 · Response” and update its hint.
  - Pass the selection and the `onApplied` callback needed by the CV card.
- `src/views/stages/ImportStage.tsx`:
  - Keep `parseLlmResponse(raw)`, then call `splitResponseForSelection` from ticket 01.
  - Save the raw response on Parse as today.
  - Show a CV card only when `cv` is selected.
  - Show a message card for every selected message deliverable, including a missing-key error card.
  - Ignore unrequested envelope keys with a warning.
  - Keep “Load response file”. Show “Load CV JSON” only when CV is selected.
  - Per-deliverable Apply: CV applies to `project.cv` and advances to Preview; messages save to `project.artifacts` and stay on the stage.
  - Clear removes a saved artifact only after confirmation.
  - Missing requested key = card error, not a parse failure.
  - The cover-letter card gets a Preview/Edit toggle; the preview is read-only and updates as the textarea changes.

### Message cards

Create a reusable card component (for example `src/views/stages/DeliverableCard.tsx`) with:

- deliverable name and status (valid / warnings / errors / missing);
- validation issues with paths;
- editable textarea(s):
  - cover letter: one Markdown textarea;
  - cold email: subject input and body textarea;
  - LinkedIn: one textarea;
- cover-letter preview: paragraphs, bold, italic, and validated links; all other text escaped; no raw HTML;
- copy actions:
  - cover letter: Copy as plain text, Copy Markdown;
  - cold email: Copy subject, Copy body, Copy both;
  - LinkedIn: Copy message;
- download actions:
  - cover letter: `.md`;
  - cold email: `.txt` with `Subject: …` and the body;
  - LinkedIn: `.txt`;
- Apply/Save and Clear;
- a note when the parsed candidate differs from the saved artifact.

Use `downloadFile` from `src/core/download.ts` and `projectDeliverableFilename` from ticket 02.

### Cover-letter preview helper

- New `src/core/deliverables/preview.ts`:
  - Escape all text first.
  - Split paragraphs on blank lines and single newlines within a paragraph.
  - Support `**bold**`, `*italic*`, and `[label](target)`.
  - Resolve link targets with `resolveAnchorTarget` from `src/core/render/link.ts`; unsafe targets render as plain text.
  - Never pass raw model HTML through.
  - Expose `markdownToPlainText(text)` for “Copy as plain text”: strip emphasis markers and render markdown links as their label.
- Unit-test both helpers.
- Update the Preview stage’s “Import response” link label to “Response”.

### Styling and navigation

- `src/app.css`: card, status, preview, and action styles.
- `PreviewStage.tsx` needs no content changes.
- `ProjectView.tsx`: hide the Preview tab when the project has no CV content and did not select the CV.

## Acceptance Criteria

- A CV-only response still parses, validates, and applies exactly as before.
- A CV + cover-letter envelope shows two cards; applying the CV does not apply the letter, and applying the letter does not change the CV.
- A missing cover-letter key shows an error card while a valid CV can still be applied.
- An envelope with an unrequested key shows a warning and does not create a card for it.
- A bare CV returned for a multi-deliverable request fills the CV card and reports the other deliverables missing.
- Empty/over-limit/wrong-type messages show the right errors or warnings.
- Applying a message writes it to `project.artifacts` and, after autosave, to `deliverables/`.
- Clearing a message removes it from the project and its file from disk on the next save.
- Copy buttons write the expected plain text or Markdown.
- The cover-letter preview renders paragraphs and bold/italic, rejects raw HTML and unsafe links, and matches the textarea.
- A cover-letter-only project uses the Response stage without a Preview tab.
- `npm run build` and `npm test` pass.

## Tests

- Add `tests/preview.test.ts` for the Markdown subset: paragraphs, bold/italic, safe links, unsafe schemes, raw HTML, and empty input.
- Extend the smoke test for CV + cover letter apply, missing key, clear, copy, and download.
- Assert `project.json` contains no message content and `deliverables/` contains the applied files.

## Comments

## Comments

- Implemented the Response stage in `src/views/stages/ImportStage.tsx`: it still calls `parseLlmResponse`, saves the raw response on Parse, then calls `splitResponseForSelection` with the project selection. The CV card appears only when `cv` is selected; every selected message gets a card, including a missing-key error card. Unrequested envelope keys produce a warning and no card. `Load CV JSON` is hidden when the CV is not requested. Applying the CV writes `project.cv` and opens Preview; message saves write `project.artifacts` and stay on the stage. Clear asks for confirmation and removes the artifact, letting `saveProject` delete its file on the next autosave.
- Added `src/views/stages/DeliverableCard.tsx` with status badges (valid / warnings / errors / missing), issue paths, cover-letter/cold-email/LinkedIn editors, a read-only cover-letter Preview/Edit toggle (live from the textarea), copy actions (plain text/Markdown; subject/body/both; message), downloads through `downloadFile` + `projectDeliverableFilename` (`.md`, `.txt`, `.txt`), Save and confirmed Clear, and a note when the parsed candidate differs from the saved artifact.
- Added `src/core/deliverables/preview.ts`: escapes first, then renders paragraphs, single-newline breaks, `**bold**`, `*italic*`, and `[label](target)` only when `resolveAnchorTarget` accepts the target; unsafe schemes stay inert text and raw HTML is escaped. `markdownToPlainText` strips emphasis and keeps link labels. `tests/preview.test.ts` covers paragraphs, formatting, safe/unsafe links, raw HTML, empty input, and plain-text conversion (10 tests).
- `src/views/ProjectView.tsx` now shows **3 · Response** ("Split, validate, apply"), passes the selection and profile to the stage, updates the Preview link to "Response", and hides the Preview tab when the project has no CV content and did not select the CV. `PromptStage` now links onward with "Next: response". Added card, status, preview, and action styles to `src/app.css`.
- Extended `scripts/smoke.mjs`: CV + cover-letter + cold-email envelope shows three cards; cover-letter preview renders bold/italic/safe links and escapes raw HTML and unsafe links; copy plain text/Markdown and copy subject/both use the expected clipboard text; `.md`/`.txt` downloads are checked; applying the CV writes no message files; saving messages stays on Response and writes `deliverables/cover-letter.md` and `deliverables/cold-email.json`; `project.json` keeps no message content or `artifacts`; Clear deletes only the cover-letter file; a bare CV reports the messages missing while the CV can still be applied; an unrequested LinkedIn key warns without a card; and a cover-letter-only project without CV content hides Preview.
- Checks: `npm test` (10 files, 138 passed), `npm run build` (passed), `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-ups for ticket 08/09: the New Project modal still defaults to CV and has no deliverable checkboxes or recipient field, so the smoke cover-letter-only project is created with the CV selected and narrowed manually. Ticket 09 still owns the documentation sweep and the remaining end-to-end cover-letter-only/cold-email/LinkedIn flows; LinkedIn copy/download is implemented but not exercised by smoke.
