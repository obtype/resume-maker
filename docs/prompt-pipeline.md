# Prompt pipeline

The product deliberately uses **one prompt per deliverable selection** rather than a chain of hidden model calls or one prompt per output. The prompt is composed from a shared context template, one task template per selected deliverable, a generated output contract, and a metadata footer. The user copies it to any LLM and pastes the JSON back. A CV-only request keeps the existing bare-CV contract; every other selection returns one JSON envelope.

## Files

| File | Role |
| --- | --- |
| `public/config/prompts/context.md` | Shared bundled template: role, universal rules, candidate basics, PDR, target job, shared instructions, existing-CV context. Emitted once per prompt. |
| `public/config/prompts/cv.md` | CV task, reference CV, CV instructions, selected CV schema, schema-specific notes, CV quality checklist. |
| `public/config/prompts/cover-letter.md` | Cover-letter task, letter rules, per-deliverable instructions, output shape. |
| `public/config/prompts/cold-email.md` | Cold-email task, recipient block, instructions, output shape. A missing job description is valid. |
| `public/config/prompts/linkedin-message.md` | LinkedIn post-acceptance task, recipient block, instructions, output shape. |
| `<workspace>/config/prompts/<file>` | Optional per-template overrides. Read at startup and edited in Settings. |
| `src/core/prompt/builder.ts` | Loads templates, substitutes placeholders, composes the prompt, estimates tokens, and computes selection-aware warnings. |
| `src/core/cv/schema.ts` | Supplies `SCHEMA_JSON`, `SCHEMA_NAME`, `SCHEMA_ID`, and `SCHEMA_NOTES` for the CV task. |
| `src/core/deliverables/schema.ts` | Supplies message JSON Schemas, limits, prompt notes, template-file mapping, and the composed envelope. |
| `src/core/llm/parseResponse.ts` | Extracts the first balanced JSON object from fences/prose and repairs malformed JSON. |
| `src/core/deliverables/normalize.ts` | Splits a parsed object into requested deliverables and normalizes message values. |
| `src/core/deliverables/validate.ts` | Validates each message independently against the same schema used in the prompt. |

Template resolution happens per template: workspace override -> bundled file -> minimal per-template fallback in `builder.ts`. The Prompt stage shows a source badge for the shared context and every selected task, and a `mixed` summary when they differ. **Use bundled default** removes only the active override.

The old single-file override `config/cv-prompt.md` is not an active template. On workspace hydrate it is copied to `config/cv-prompt.legacy.md` (or a timestamped `cv-prompt.legacy-<stamp>.md` if that archive already exists), and the original is removed only after the archive write succeeds. A failed write leaves the original in place and shows an error. The Settings notice for that boot names the archive path.

## Composition order

`buildProjectPrompt({ profile, project, schema, templates, date? })` emits, in order:

1. **Shared context** — `templates.context`, once, including the generated `{{RESPONSE_CHECKLIST}}` so the required keys appear before the task sections.
2. **Selected tasks** — the task templates for the current selection, in canonical order: CV, cover letter, cold email, LinkedIn message.
3. **Output contract** — generated. A CV-only request gets the bare-CV contract; any other selection gets the envelope JSON Schema with only the requested keys.
4. **Metadata footer** — generated: CV schema line (or `Schema: none (CV not requested)`), requested deliverables, prompt version, and UTC date.

No prompt is built for an empty selection. The builder throws and the UI blocks Copy/Regenerate/Save; the Target stage also prevents unchecking the last deliverable.

Unknown `{{PLACEHOLDER}}` tokens remain literally in the prompt so template typos are visible. The output contract and metadata footer are never written into a template.

## Placeholders

`buildProjectPrompt` replaces `{{UPPER_SNAKE}}` tokens with values supplied per template. The documented set is:

| Template | Placeholder | Value |
| --- | --- | --- |
| Shared context | `{{BASICS}}` | Name, optional headline, and contact joined with `·`, or “(not provided)”. |
| Shared context | `{{PDR}}` | Profile PDR Markdown, or a “no PDR imported” note. |
| Shared context | `{{JOB_TITLE}}` | Target title, or “(not provided)”. |
| Shared context | `{{COMPANY}}` | Target company, or “(not provided)”. |
| Shared context | `{{JOB_DESCRIPTION}}` | Full job posting, or a “no job description” note. |
| Shared context | `{{SHARED_INSTRUCTIONS}}` | Project shared instructions followed by profile default instructions, or “(No shared instructions.)”. |
| Shared context | `{{EXISTING_CV}}` | When the CV is requested: a note to use the `cv` value in this response as the source of truth. When it is not requested but the project has CV content: a compact Markdown rendering of that CV. Otherwise: a no-existing-CV note. |
| Shared context | `{{RESPONSE_CHECKLIST}}` | Generated from the selection: the exact mandatory top-level keys in order, their value shapes, and a response skeleton. CV-only gets the bare-CV instruction instead. |
| CV | `{{REFERENCE_CV}}` | Per-project reference CV, or a “no reference CV” note. Only the CV task receives it. |
| CV | `{{CV_INSTRUCTIONS}}` | Per-deliverable CV instructions, or “(No deliverable-specific instructions.)”. |
| CV | `{{SCHEMA_NAME}}` | Human-readable schema name. |
| CV | `{{SCHEMA_ID}}` | Schema id (`classic`, `classic-summary`, `impact`). |
| CV | `{{SCHEMA_JSON}}` | Pretty-printed JSON Schema for the selected CV schema. |
| CV | `{{SCHEMA_NOTES}}` | Schema-specific writing rules from `promptNotes`. |
| Cover letter | `{{COVER_LETTER_INSTRUCTIONS}}` | Per-deliverable instructions, or the default note. |
| Cover letter | `{{COVER_LETTER_SCHEMA}}` | Pretty-printed cover-letter JSON Schema. |
| Cold email | `{{COLD_EMAIL_INSTRUCTIONS}}` | Per-deliverable instructions, or the default note. |
| Cold email | `{{COLD_EMAIL_SCHEMA}}` | Pretty-printed cold-email JSON Schema. |
| Cold email | `{{RECIPIENT}}` | Recipient block. Empty fields are omitted; entirely empty becomes “(No recipient details provided.)”. |
| LinkedIn message | `{{LINKEDIN_INSTRUCTIONS}}` | Per-deliverable instructions, or the default note. |
| LinkedIn message | `{{LINKEDIN_SCHEMA}}` | Pretty-printed LinkedIn-message JSON Schema. |
| LinkedIn message | `{{RECIPIENT}}` | Recipient block for the LinkedIn settings. |

`{{PROMPT_VERSION}}` and `{{DATE}}` are not template placeholders in the split pipeline; the generated metadata footer carries the prompt version and date. There is no `{{SUMMARY}}`; the summary requirement is part of the schema and notes.

The recipient block is only included in cold-email and LinkedIn prompts. The reference CV is only included in the CV task. The existing CV is not duplicated when the CV is part of the same response; the other tasks are told to use that CV as the shared source of truth.

## Stages

The UI exposes four stages per project:

1. **Target** — optional job title, company, and description; shared instructions; deliverable checkboxes; a collapsible panel per deliverable with its instructions; recipient fields for cold email and LinkedIn; optional reference CV (CV task only). At least one deliverable stays selected. “Select missing only” selects the deliverables without content.
2. **Prompt** — selection summary, generated prompt, template source badges, selection-aware warnings, token estimate, stale badge, Copy/Regenerate/Save. Renderer and CV schema controls appear only when the CV is selected; otherwise the stage says “CV not requested”. The prompt is saved to `prompts/latest.md`.
3. **Response** — paste or load the raw response. Parse, split by selection, and show one card per requested deliverable. The CV card validates against the CV schema and has **Apply to CV**, which opens Preview. Message cards have editable textareas, statuses, copy/download, **Save**, and confirmed **Clear**; saving stays on Response. A missing requested key is a card error, an unrequested key is a warning with no card, and “Load CV JSON” appears only when the CV is requested. The raw response is saved to `responses/latest.raw.txt` on Parse.
4. **Preview** — render, inline-edit, tune style, print, export PDF. CV only. Hidden when the project has no CV content and did not select the CV.

Only the Prompt stage builds a prompt. The Response parser and validators never call an LLM.

## Output modes

### CV-only

The model returns today's bare CV object:

```json
{
  "schemaVersion": 2,
  "basics": { "...": "..." },
  "sectionTitles": { "...": "..." },
  "education": [],
  "skills": [],
  "experience": [],
  "projects": [],
  "custom": []
}
```

The Response stage also accepts an envelope with a `cv` key for a CV-only request. The output contract explicitly says: return the CV object directly, with no wrapper, extra keys, fences, or commentary.

### Any other selection

The model returns one JSON object with only the requested keys, in canonical order:

```json
{
  "cv": { "...selected CV schema..." },
  "coverLetter": "Full letter text.",
  "coldEmail": { "subject": "Subject line", "body": "Email body." },
  "linkedinMessage": "Post-acceptance message."
}
```

`coverLetter` and `linkedinMessage` are strings. `coldEmail` has non-empty `subject` and `body`. `cv` uses the selected CV schema. The generated envelope schema has `additionalProperties: false` and lists exactly the requested keys as `required`.

A bare CV returned for a multi-deliverable request is treated as the CV when the CV was requested; the other requested deliverables show as missing. An unrequested envelope key is ignored with a warning.

## Parsing and validation

`parseLlmResponse`:

1. trims and removes a BOM;
2. unwraps a single leading/trailing Markdown fence (with or without `json`);
3. finds the first `{` and scans for the matching close brace, respecting strings and escapes;
4. removes stray backslashes before structural brackets and braces (`\[`, `\]`, `\{`, `\}`), which ChatGPT sometimes adds to protect Markdown; escaped backslashes (`\\[`) are left alone;
5. `JSON.parse`;
6. if that fails, `jsonrepair` and parse again;
7. reports `repaired` so the UI can warn the user.

Then `splitResponseForSelection(value, selection)` returns the raw parts, missing requested ids, unrequested ids, and whether the response was a bare CV. Each part is validated independently:

- **CV:** `validateCv(value, project.schemaId)` normalizes and validates against the same CV JSON Schema shown to the model. Apply is disabled until it is valid. Normalization also maps common LLM synonyms (`category` → `label`, `company` → `org`, `meta` → `dates`, `name` → `role`, `description` → a custom bullet) and splits comma-separated skill items, so a semantically correct CV is not rejected over field naming.
- **Cover letter:** `validateCoverLetter` trims, validates the 1–6,000 character string, and warns outside 800–5,000.
- **Cold email:** `validateColdEmail` trims subject/body, validates both as non-empty and within 160/4,000 characters, and warns when the subject is over 100 or the body is outside 300–2,500.
- **LinkedIn message:** `validateLinkedinMessage` trims, validates the 1–2,000 character string, and warns when the message is under 300 characters (likely a connection note) or over 1,200.

Message normalization also converts double-escaped newline sequences (`\\n`) to real newlines, since some chat models escape prose a second time.

A parse success is not enough. The user sees per-card status (valid / warnings / errors / missing), issue paths, copy/download actions, and a Save button that is disabled until that card validates. One invalid part does not block another. The cover-letter preview is read-only, escapes all input before adding a conservative Markdown subset (paragraphs, line breaks, bold, italic, and validated links), and never injects raw model HTML.

## Prompt quality rules

The bundled templates enforce:

**Shared context**

- the generated response checklist puts every required top-level key before the task sections;
- one JSON object containing every requested deliverable; no bare CV when other deliverables are requested;
- a single fenced code block is allowed, with no commentary around it;
- literal JSON: no backslash-escaped brackets or braces, and one `\n` per newline inside strings;
- missing supporting detail is not a reason to drop a deliverable; write around the gap without inventing facts;
- facts only from basics + PDR; a reference CV, existing CV, and recipient text are for tone and targeting, not new candidate facts;
- exact names, contact details, employers, institutions, dates, and qualifications;
- no invented metrics, technologies, responsibilities, employers, achievements, or recipient details;
- no extra fields, no array wrapper, and a response parseable by `JSON.parse`;
- bare URLs, never Markdown links;
- the same role, company, and dates across every deliverable in one response.

**CV**

- relevance-based selection and ordering; fewer, stronger bullets;
- action/result bullets, no first-person, no “Responsible for”;
- mirror job-description terminology only when genuinely supported;
- one A4 page and every schema limit;
- provided section titles unless the CV instructions say otherwise;
- date format guidance and empty-string fallback;
- reference CV is voice/structure only, with every fact verified;
- no summary unless the schema has one;
- a silent quality checklist before responding.

**Cover letter**

- first-person prose, 3–5 paragraphs, target 250–400 words;
- no bullet lists, Markdown headings, bold, links, or lists;
- open with the role and a genuine reason, not “I am writing to apply for”;
- select two or three relevant achievements instead of repeating the CV;
- match the requested tone; no keyword stuffing;
- if there is no job description, write from the available title, company, and background without inventing a posting;
- no invented referral, mutual connection, or product enthusiasm;
- no postal address/date/signature block unless requested.

**Cold email**

- plain text, no Markdown, headings, bullets, or invented links;
- subject specific and under 100 characters; avoid “Quick question”, “Opportunity”, all caps, and exclamation marks;
- body roughly 80–150 words in 3–5 short paragraphs;
- open with the reason for writing; connect one relevant proof point; make one low-pressure ask;
- do not invent a role, team, product, referral, shared history, or previous contact;
- a missing job description is valid: do not refer to a posting or role that is not named in the target or recipient context;
- simple sign-off with the candidate's name, no postal address.

**LinkedIn message**

- the connection request has already been accepted; do not write a connection note, ask to connect, or mention a pending invitation;
- plain text, about 80–150 words in 3–5 short paragraphs;
- open by acknowledging the accepted connection and one specific detail from the profile or posts, or fall back to the shared role/company context;
- state why the candidate is reaching out and connect one proof point; make one low-pressure ask;
- avoid “pick your brain”, “quick call”, generic flattery, and a hard sell;
- do not invent a role, employer, shared history, or previous conversation;
- a missing job description is valid: focus on the recipient and the genuine reason for contact.

Schema-specific CV rules add summary requirements and impact-specific per-role skills / PSO requirements. Message limits and advisory warnings come from `src/core/deliverables/schema.ts`.

## Selection-aware warnings

Warnings are non-blocking unless marked as an error:

- CV: no contact details, no job title, no company, no job description.
- Cover letter: no job title, no company, no job description.
- Cold email: no recipient name/company; no company, role, or recipient context. **No job description is not a warning.**
- LinkedIn message: no recipient name. **No job description is not a warning.**
- Any request: no PDR, no profile name, and a warning when 3+ deliverables are selected (combined responses can be long; the CV is requested first so truncation is least likely to hit it).
- Empty selection: an error; no prompt is built.

## Editing templates safely

- Keep the placeholders listed above if you want the pipeline to remain generic. Removing one is fine if you intentionally hard-code that input elsewhere, but update this document and `tests/prompt.test.ts`.
- Keep the “JSON only” and “facts only” rules; the parser can recover from fences, but the validator cannot recover from invented facts.
- Do not put dynamic data directly in TypeScript string literals; use placeholders.
- Keep `SCHEMA_JSON` in the CV prompt. It is the model's contract and the validator's contract, generated from one definition.
- Do not duplicate the output contract or metadata footer in a template; `builder.ts` generates both.
- Use Settings or the workspace override for changes that should apply to one user; edit the bundled file for changes that should ship as defaults.
- Keep one task template per deliverable. Do not add cover-letter or email instructions to `cv.md`.

## Token estimate

`estimateTokens` is a rough `length / 4`. It is shown for cost/context awareness, not as a hard limit. The PDR, job description, and combined schema dominate prompt size. The UI warns at 3+ deliverables.

## Persistence

- Prompt text is saved on Copy, Regenerate, or **Save prompt to project**.
- The generated prompt is not automatically saved when inputs change; the stale badge tells the user to regenerate.
- The latest prompt and response file paths are recorded in `project.json` (`files.prompt`, `files.response`).
- `PROMPT_VERSION` is stored in `project.json` for traceability. It is not used to invalidate saved prompts automatically.
- Per-deliverable instructions and recipient settings live in `project.json`, not in separate input files.
- Prompt/response history remains `latest` only; there are no timestamped archives.

## Adding another deliverable

The implemented deliverables are CV, cover letter, cold email, and LinkedIn message. The intended pattern for a fifth deliverable is:

1. Add its id and content type to `src/core/deliverables/types.ts` and the canonical order.
2. Add a JSON Schema, advisory limits, prompt notes, and template-file mapping in `src/core/deliverables/schema.ts`; the envelope builder includes it automatically.
3. Add `public/config/prompts/<id>.md` with only that task's instructions and placeholders.
4. Add normalization, validation, preview/copy/download, and an artifact path in `src/core/deliverables/` and `src/core/workspace/projects.ts`.
5. Map the template and placeholders in `builder.ts`, and add a Settings tab, Target panel, Response card, selection summary, and New Project option.
6. Extend the unit tests and smoke scenarios, and update this document, `AGENTS.md`, and `docs/data-model.md`.

Do not overload an existing template with unrelated document instructions. One task template per output keeps each prompt auditable and lets users edit one task without changing another.
