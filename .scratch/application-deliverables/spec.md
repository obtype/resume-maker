# Application deliverables: cover letter, cold email, and LinkedIn message

**Status:** ready-for-agent
**Tracker:** local markdown

## Problem Statement

CV Studio currently produces exactly one thing: a tailored CV. Every project is one `cv.json`, one prompt, one raw response, and one Preview stage. The prompt builder always injects the job and the CV schema, and the Import stage only understands a bare CV object. A user who wants a cover letter, a cold email, or a LinkedIn follow-up has to write a separate prompt by hand, outside the app, and has nowhere to keep the result alongside the application.

The product needs to support four deliverables:

- CV
- Cover letter
- Cold email
- LinkedIn message

The user must be able to request any combination in one prompt, to avoid sending the PDR and job description multiple times, or request one on its own. A cover-letter-only request must work without a CV, a cold email must work without a job description, and a LinkedIn message must work with a recipient's profile context and no job at all.

## Solution

A project becomes one application or outreach effort that holds a **deliverable selection**. The user picks any combination of CV, cover letter, cold email, and LinkedIn message. The app builds one prompt for the current selection: a shared context block emitted once, then only the selected deliverable task blocks. The model returns either today's bare CV object (CV-only) or one JSON envelope with a key per requested deliverable. The Response stage validates each deliverable independently and lets the user apply them independently. CV content still lives in `cv.json`; messages live in `deliverables/`. Preview stays CV-only and is hidden for projects that never requested a CV.

## User Stories

1. As an applicant, I want to request a CV and a cover letter in one prompt, so I do not pay twice for the same PDR and job description.
2. As an applicant, I want to request only a cover letter, so I can apply to a role whose CV I already have.
3. As an applicant, I want to add cover-letter-specific instructions, so the letter can strike a different tone or emphasise a different part of my background than the CV.
4. As an applicant, I want to request a cold email without a job description, so I can reach out to a company that has not posted a role.
5. As an applicant, I want to add recipient details and intent to a cold email, so the model does not write a generic message.
6. As an applicant, I want to request a LinkedIn follow-up message after a connection request was accepted, with the person's about text and recent posts as context, so the message is specific.
7. As an applicant, I want to ask for a CV, a cover letter, a cold email, and a LinkedIn message in one prompt when they target the same opportunity, so the facts stay consistent.
8. As an applicant, I want each deliverable to be validated and applied separately, so one bad letter does not block a good CV.
9. As an applicant, I want to regenerate only the missing deliverables, so I do not overwrite content I already approved.
10. As an applicant, I want messages saved in the project folder, so the application record is complete.
11. As an applicant, I want to copy a message as plain text, and a cover letter as Markdown or plain text, so it fits the place I am pasting it.
12. As an applicant, I want a formatted cover-letter preview and a Markdown download, so I can proofread and keep a copy without needing a PDF.
13. As an applicant, I want a project with no job title or company, so I can use the app for pure outreach.
14. As an applicant, I want the app to warn me when a deliverable lacks the context it needs, without blocking a request that can still work.
15. As a maintainer, I want one template per deliverable, plus a shared context template, so editing the cover-letter rules does not risk the CV prompt.
16. As a maintainer, I want the envelope schema and per-deliverable schemas to be the same contracts used for validation, so the prompt and the validator cannot drift.
17. As a maintainer, I want old projects and old prompt overrides to keep working or be archived safely, so upgrading does not destroy user work.
18. As a privacy-conscious user, I want a warning that recipient profile and post text is third-party personal data sent to the LLM.

## Implementation Decisions

### Domain and data model

- Keep `Project` as the workspace container. Add `Deliverable` (`cv`, `coverLetter`, `coldEmail`, `linkedinMessage`) and `Recipient`.
- `Project.deliverables` holds:
  - `selected: DeliverableId[]` — persisted; at least one.
  - `settings: Record<DeliverableId, DeliverableSettings>` — per-deliverable `instructions`; `recipient` for `coldEmail` and `linkedinMessage`.
- `Project` gains `artifacts: { coverLetter?: string; coldEmail?: ColdEmailContent; linkedinMessage?: string }`. The CV artifact remains `Project.cv`.
- Rename `ProjectJob.instructions` to `sharedInstructions`, applying to every deliverable. `Profile.defaultInstructions` is appended to the shared instructions. Per-deliverable instructions are additive.
- Bump `Project.schemaVersion` to 2. `loadProject` accepts version 1, maps `job.instructions` to `sharedInstructions`, and fills default deliverable settings with `selected: ["cv"]` and no artifacts.
- New projects default to `["cv"]`; the New Project modal lets the user choose otherwise.

### Storage

```
projects/<id>/
  project.json          # selection, settings, recipient metadata, file index
  cv.json
  deliverables/
    cover-letter.md
    cold-email.json
    linkedin-message.txt
  inputs/
    job.md
    instructions.md     # shared instructions mirror
    reference-cv.md
  prompts/latest.md
  responses/latest.raw.txt
```

- Artifact content is written to `deliverables/`; `project.json` never duplicates it.
- `files` indexes `coverLetter`, `coldEmail`, and `linkedinMessage` alongside `prompt`, `response`, and `cv`.
- `saveProject` removes a stale artifact file when its artifact is cleared, so the folder matches the index.
- No new input mirrors for per-deliverable instructions or recipient context; `project.json` and `prompts/latest.md` are the record.
- `config/prompts/` holds workspace overrides. `initializeWorkspace` creates it.

### Output contract

- **CV-only request:** the model returns today's bare CV object. Response accepts a bare CV or an envelope with a `cv` key.
- **Any other request:** the model returns one JSON envelope with only the requested keys, in this order: `cv`, `coverLetter`, `coldEmail`, `linkedinMessage`.
- `coverLetter` and `linkedinMessage` are strings. `coldEmail` is `{ subject, body }`. `cv` is the selected CV schema object.
- The prompt includes a generated envelope JSON Schema composed from the per-deliverable schemas. Runtime validation is per deliverable so one invalid part does not mask the others.
- Normalization drops unrequested keys and unknown message fields, trims strings, and reports unrequested deliverables as a warning. Missing requested keys are errors on that deliverable only.
- If a multi-deliverable request returns a bare CV object and the CV was requested, treat it as the CV and report the other requested deliverables as missing.

### Deliverable schemas and limits

| Deliverable | Shape | Required | Hard limits | Advisory |
| --- | --- | --- | --- | --- |
| Cover letter | string | non-empty | ≤ 6000 chars | warn < 800 or > 5000; target 250–400 words |
| Cold email | `{subject, body}` | both | subject ≤ 160, body ≤ 4000 | warn subject > 100; body < 300 or > 2500 |
| LinkedIn message | string | non-empty | ≤ 2000 chars | warn < 200 or > 1200; warn if < 300 (looks like a connection note) |

- The CV keeps its existing schemas and warnings.
- The CV's selected schema is only used when `cv` is selected.

### Prompt templates

- `public/config/prompts/context.md` — shared role, universal rules, basics, PDR, job, shared instructions, existing-CV context.
- `public/config/prompts/cv.md` — CV task, reference CV, CV instructions, schema, schema notes.
- `public/config/prompts/cover-letter.md` — cover-letter task, instructions, output rules.
- `public/config/prompts/cold-email.md` — cold-email task, recipient block, instructions, output rules.
- `public/config/prompts/linkedin-message.md` — LinkedIn task, recipient block, instructions, output rules.
- Workspace overrides: `config/prompts/<id>.md`.
- The builder emits `context.md` once, then the selected task templates in fixed order, then a generated output-contract section and metadata footer.
- Placeholders:
  - Shared: `{{BASICS}}`, `{{PDR}}`, `{{JOB_TITLE}}`, `{{COMPANY}}`, `{{JOB_DESCRIPTION}}`, `{{SHARED_INSTRUCTIONS}}`, `{{EXISTING_CV}}`.
  - CV: `{{REFERENCE_CV}}`, `{{CV_INSTRUCTIONS}}`, `{{SCHEMA_NAME}}`, `{{SCHEMA_ID}}`, `{{SCHEMA_JSON}}`, `{{SCHEMA_NOTES}}`.
  - Cover letter: `{{COVER_LETTER_INSTRUCTIONS}}`, `{{COVER_LETTER_SCHEMA}}`.
  - Cold email: `{{COLD_EMAIL_INSTRUCTIONS}}`, `{{COLD_EMAIL_SCHEMA}}`, `{{RECIPIENT}}`.
  - LinkedIn: `{{LINKEDIN_INSTRUCTIONS}}`, `{{LINKEDIN_SCHEMA}}`, `{{RECIPIENT}}`.
  - `{{PROMPT_VERSION}}` and `{{DATE}}` move to the generated metadata footer.
- Existing CV context: when `cv` is not in the request and `project.cv` has content, include a compact Markdown rendering of it. When `cv` is in the request, instruct the other tasks to use the CV in the same response as the source of truth.
- Reference CV only goes to the CV task.
- Recipient block only goes to cold email and LinkedIn.
- At least one deliverable must be selected; the UI prevents an empty selection.
- Warnings are deliverable-specific:
  - CV: no contact details, no job title/company/description.
  - Cover letter: no job title/company/description.
  - Cold email: no recipient name/company and no company/job context; no job description is not a warning.
  - LinkedIn: no recipient name; no job description is not a warning.
  - Any request: no PDR, no name, and a non-blocking warning when 3+ deliverables are selected.

### Workspace override migration

- On hydrate, if `config/cv-prompt.md` exists, copy it to `config/cv-prompt.legacy.md` (never overwrite an existing archive; use a timestamped suffix if needed), then remove the original.
- The bundled split templates become active.
- Settings shows a one-time notice naming the archive path.
- If the archive write fails, leave the legacy file in place and show an error; do not delete it.

### UI

**Stage 1 — Target (currently Job).**

- Job title, company, description (all optional).
- Shared instructions (renamed from “Extra instructions for this application”).
- Reference CV (only relevant when CV is selected; keep visible but note it is CV-only).
- Deliverable checkboxes with generated badges.
- Per-deliverable collapsible panels:
  - CV instructions.
  - Cover-letter instructions.
  - Cold-email instructions + recipient fields.
  - LinkedIn instructions + recipient fields.
- Recipient fields: name, role, company, profile URL, about, posts, relationship/context, intent.
- “Select missing only” shortcut.
- Prevent unchecking the last selected deliverable.
- Privacy note for recipient text.

**Stage 2 — Prompt.**

- Use the shared + per-deliverable templates.
- Show selection summary.
- Show renderer/schema only when CV is selected; otherwise show “CV not requested”.
- Show per-template source badges.
- Warnings, token estimate, stale badge, copy/regenerate/save unchanged.
- No prompt is built for an empty selection.

**Stage 3 — Response (renamed from Import).**

- Parse the raw response into per-deliverable parts.
- CV card when CV requested: existing validation grid + “Apply to CV”.
- Message cards when requested:
  - Status (valid / warnings / errors / missing).
  - Editable textarea(s).
  - Cover letter: preview/edit toggle; preview renders a conservative Markdown subset (paragraphs, bold, italic, validated links), no raw HTML.
  - Copy actions: cover letter plain text / Markdown; email subject / body / both; LinkedIn whole message.
  - Download: cover letter `.md`; email `.txt` with subject + body; LinkedIn `.txt`.
  - Apply/Save and Clear with confirmation.
- Per-deliverable apply; raw response saved on Parse.
- Unrequested keys ignored with a warning.
- Missing requested key is a card error.
- “Load CV JSON” only when CV is selected.
- CV apply advances to Preview; message apply stays on the stage.

**Stage 4 — Preview.**

- Unchanged for CV.
- Hidden when the project has no CV content and did not select CV.

**Projects / New Project.**

- New Project modal: optional job title/company, optional recipient name, deliverable checkboxes, renderer only when CV is selected. Require at least one of job title, company, or recipient name.
- Slug falls back to company → title → recipient → `outreach`, plus date.
- Display name uses company/title, else recipient, else “Outreach”.
- Dashboard copy: “One project per application or outreach effort.”

**Settings.**

- Prompt template tabs: Shared context, CV, Cover letter, Cold email, LinkedIn message.
- Per-tab source badge, textarea, Save override, Reload, Use bundled default.
- Placeholder list per tab.
- Legacy archive notice.
- Renderer checks and browser support unchanged.

### Cover letter preview and export

- No PDF in this feature.
- Formatted read-only preview in the response card.
- Copy as plain text, Copy Markdown, Download `.md`.
- The raw Markdown is stored in `deliverables/cover-letter.md`.

### Documentation

- Update `AGENTS.md` invariants 3, 4, 5, and 10; workspace shape; “Change the prompt”; “Add a document preset”; testing notes; known limitations.
- Update `docs/data-model.md`, `docs/prompt-pipeline.md`, `docs/architecture.md`, `README.md`, and `docs/roadmap.md`.
- Add `docs/adr/0002-one-prompt-for-multiple-deliverables.md`.

## Testing Decisions

- Unit tests assert behaviour at the prompt builder, envelope normalizer, and validator seams.
- `tests/prompt.test.ts`:
  - CV-only prompt contains the bare-CV contract and not an envelope.
  - Combined prompt contains the shared context once, only selected tasks, and the envelope.
  - CV not selected → no schema/reference CV/CV instructions.
  - Standalone cover letter includes the existing CV; combined CV + letter does not duplicate it and instructs consistency.
  - Cold email with no job uses the neutral no-job text and does not warn about the missing description.
  - Per-deliverable instructions and recipient blocks appear in the right tasks.
  - Unknown placeholders remain visible; all documented placeholders are filled.
- `tests/deliverables.test.ts`:
  - Bare CV, envelope, missing keys, extra keys, wrong types.
  - Valid messages; empty; over-length warnings; missing subject.
  - Per-deliverable results do not mask each other.
- `tests/project.test.ts`:
  - Version 1 → 2 migration: `instructions` → `sharedInstructions`, default selection, no artifacts.
  - Deliverable selection normalization defaults an empty selection to `["cv"]` and drops unknown ids.
- Smoke tests:
  - CV-only flow still works.
  - CV + cover letter: prompt has both tasks and the envelope; a fake envelope applies the CV and saves the cover letter; `deliverables/cover-letter.md` exists; `project.json` has no message content.
  - Cover-letter-only project with a company and no CV: prompt builds, includes the job context, and omits the CV schema and reference CV; a fake envelope creates the letter card; preview and download work.
  - Cold email with recipient and no job: prompt includes the recipient block and neutral no-job text, and produces no missing-description warning.
  - LinkedIn message with a recipient: prompt includes the recipient block and the post-acceptance rule.
- `npm run build`, `npm test`, `npm run check:renderers`, and `npm run smoke` must pass.
- No real PII in tests; use fictional names.

## Out of Scope

- Cover-letter PDF or A4 preview.
- Multiple artifacts of the same type per project.
- Prompt/response history beyond the existing `latest` files.
- LinkedIn connection-request notes (300-character cap) or InMail.
- Fetching or scraping LinkedIn profiles/posts.
- Sending email or LinkedIn messages from the app.
- A workspace-level contact book.
- Auto-applying LLM output without validation.
- Multi-page CVs.
- Global default deliverable selection.
- Rich text editing for messages.
- Automatic deletion of artifacts when unchecking a deliverable.

## Further Notes

- The bare-CV special case is deliberate: it preserves the existing CV contract and every saved prompt. See `docs/adr/0002-one-prompt-for-multiple-deliverables.md`.
- Combined prompts are long. The CV is requested first in the envelope so truncation hits the least critical output last; the UI warns at 3+ deliverables.
- The existing `extractJson` parser already handles fences and prose, so no parser change is needed. The new work is interpreting the object.
- Recipient about text and posts are third-party PII; keep the warning visible and never log prompts.
