# AGENTS.md

CV Studio is a local-first, static + local-Node application for generating tailored application deliverables: a CV, a cover letter, a cold email, and a LinkedIn message. A human picks a workspace folder, imports a personal data record (PDR), describes a job or outreach target, selects one or more deliverables, generates one LLM prompt, pastes the JSON response back, validates and applies each deliverable independently, tunes the rendered CV, and exports a real A4 PDF into the project folder. Messages are stored and copied or downloaded as text/Markdown.

Read `README.md` for the user workflow and `docs/` for the detailed contracts. This file is the entrypoint for future agents.

## Agent skills

### Issue tracker

Issues and specs are local markdown under `.scratch/<feature>/` — `spec.md` plus numbered tickets in `issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles are used verbatim (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`. See `docs/agents/domain.md`.

## Commands

```bash
npm install
npm run dev          # Vite + PDF endpoint, fixed port 5173
npm run build        # tsc -b && vite build
npm test             # Vitest unit tests
npm run check:renderers
npm run smoke        # Playwright-core end-to-end smoke test
```

Optional smoke test environment variables:

- `PDF_OUT=/tmp/cv.pdf` writes the exported PDF for inspection (`pdfinfo`, `pdftoppm`).
- `PDR_DOCX=/path/file.docx` exercises real DOCX import.
- `CHROME_PATH=/path/to/chrome` selects the browser for both smoke and PDF export.

## Architecture map

```
src/
  App.tsx                    app shell, workspace boot, autosave, navigation
  views/                     Projects, Profile, Settings, ProjectView
  views/stages/              Target, Prompt, Response, Preview stages
  components/                Layout, CvPreview, NewProjectModal, RecipientFields
  core/cv/                   types, schemas, normalize, validate, migrate, sample, paths
  core/deliverables/         deliverable ids, message schemas, normalization, validation, preview, selection
  core/render/               render context, preview doc, renderer checks, sanitize
  core/prompt/               prompt template loading + prompt builder
  core/llm/                  LLM response extraction/repair/parse
  core/workspace/            File System Access helpers, IndexedDB handles, project IO
  core/profile/              DOCX/MD/TXT -> Markdown
  core/export/               client for /api/export-pdf
  renderers/                 renderer modules + registry
  runtime/preview-runtime.js editing, formatting, overflow, print runtime
public/config/prompts/       shared context + one task template per deliverable
server/pdf.ts                headless Chrome PDF renderer (Node only)
vite.config.ts               fixed port, PDF middleware
tests/                       unit tests
scripts/smoke.mjs            end-to-end browser smoke test
```

Workspace shape:

```
<workspace>/
  settings.json
  profiles/default.json
  config/prompts/            per-template overrides (created on workspace init)
  config/cv-prompt.legacy.md archived single-file override, if one existed
  projects/<id>/
    project.json
    cv.json
    deliverables/
      cover-letter.md
      cold-email.json
      linkedin-message.txt
    inputs/{job,instructions,reference-cv}.md
    prompts/latest.md
    responses/latest.raw.txt
    <name>-<company>-cv.pdf
```

## Invariants (do not break)

1. **Content and presentation are separate.** `cv.json` contains only `CvContent`. Renderer choice, schema choice, deliverable selection, recipient settings, and `CvStyle` live in `project.json`. Applied messages live in `deliverables/`; `project.json` holds only configuration and a file index, never message or CV content. Never put CSS classes, renderer markup, or layout data into `cv.json`.
2. **Renderers are pure.** A renderer exports `meta`, `css`, and `render(cv, ctx) -> HTML string`. It must not use `document`, `window`, `fetch`, storage, or timers. Editing, formatting, printing, and overflow detection belong to `src/runtime/preview-runtime.js`.
3. **The schemas are one contract.** CV schemas live in `src/core/cv/schema.ts`; message schemas, limits, and the envelope builder live in `src/core/deliverables/schema.ts`. A renderer declares `meta.schemas`. The prompt uses the selected CV schema and the same per-deliverable message schemas; runtime validation uses those definitions. If you add or change a CV schema, message schema, or the envelope, update the normalizers, validators, limits/warnings, prompt notes, tests, and renderer compatibility together.
4. **All static prompt text lives in templates.** The bundled text is a shared context template plus one task template per deliverable: `public/config/prompts/context.md`, `cv.md`, `cover-letter.md`, `cold-email.md`, and `linkedin-message.md`. Workspace overrides live at `config/prompts/<file>` and are read at startup and edited from Settings. Do not scatter prompt instructions across TypeScript. Dynamic data goes in through `{{PLACEHOLDER}}` tokens. The output contract and metadata footer are generated by `buildProjectPrompt`, not written in a template. The only exception is the minimal per-template `FALLBACK_TEMPLATES` in `builder.ts`, used only when a bundled template cannot be fetched; keep it minimal and do not treat it as a second editable prompt. The old single `config/cv-prompt.md` is archived to `config/cv-prompt.legacy.md` on hydrate and is not active.
5. **LLM output is untrusted.** Flow: `parseLlmResponse` -> `splitResponseForSelection` -> per-deliverable normalization -> validation (`validateCv` for the CV, `validateMessageDeliverable` for messages). Unrequested envelope keys are ignored with a warning; a missing requested key is an error on that card only. Renderers only receive escaped text through `ctx.esc` / `ctx.nl2br` / `ctx.field`. `ctx.field` may emit anchors for recognised links, but only with validated `http(s)` or `mailto` targets. Never inject raw model HTML. The cover-letter preview escapes first and only then adds its conservative Markdown subset; unsafe links stay inert text.
6. **Rich text is sanitized twice.** The editing runtime sanitizes `innerHTML` before posting, and `sanitizeSavedHtml` sanitizes saved `fieldHtml` at render time. Keep the allowlist conservative in both (`B`, `STRONG`, `I`, `EM`, `U`, `BR`, `SPAN`, `DIV`, `P`, `A`; only `font-size` on spans, and only validated `http(s)`/`mailto` targets on anchors).
7. **Never commit personal data.** `local-data/` is gitignored and contains real PII. `examples/` must stay fictional. Do not print PII in test output or logs. Recipient about text and posts are third-party personal data: keep the UI warning visible and never log prompts.
8. **The origin is fixed.** Vite uses port `5173` with `strictPort: true` because File System Access handles are stored in IndexedDB keyed by origin. Changing the port or hostname (`localhost` vs `127.0.0.1`) loses remembered workspaces. Do not change it without a migration plan.
9. **PDF is a first-class output for the CV.** Keep `@page { size: A4; margin: 0 }` in renderer CSS, `data-cv-page` on the page element, and print resets in `preview-base.css`. Automatic export uses `buildPrintDoc` -> `POST /api/export-pdf` -> headless Chrome -> write `cv.pdf` through the browser's directory handle. The print dialog is the fallback. Test with `npm run smoke` and inspect `PDF_OUT`. Cover letters, cold emails, and LinkedIn messages are not PDFs in this feature; they are copied or downloaded as Markdown/text.
10. **CV inline editing is host-level; messages are plain textareas.** Renderers mark editable values with `ctx.field("path.to.value", value)` and should not add `contenteditable`. Field paths are JSON paths into `CvContent` and must match the schema. The runtime posts edits; `pathSet` updates `cv`; `fieldHtml`/`fieldText` preserve formatting with a plain-text drift guard. Message deliverables are edited in the Response stage's textareas (subject/body for cold email), validated on every draft change, and saved as artifacts. They are never renderer fields and have no inline rich-text editing.
11. **One A4 page is the default.** Renderers use fixed A4 page dimensions and `overflow: hidden`. Mark scroll containers with `data-cv-overflow-watch`. Keep `data-cv-page` on the page.
12. **Renderer code is trusted local code.** Like a plugin, a renderer can run arbitrary JS in the page. `checkRenderer` rejects `<script>` output and missing fields, but it is not a sandbox. Document this trust boundary; never load remote renderer code.

## Common changes

### Add a schema variant

1. Add a `CvSchemaDef` to `CV_SCHEMAS` in `src/core/cv/schema.ts` using `buildSchema(...)` or a custom schema object.
2. Update `normalizeCv` in `src/core/cv/normalize.ts` for any new fields.
3. Add a sample in `src/core/cv/sample.ts` if renderers should support it.
4. Add/extend tests in `tests/schema.test.ts` and `tests/examples.test.ts`.
5. Set `meta.schemas` on compatible renderers.
6. Add schema-specific writing rules in `promptNotes`; keep generic rules in `public/config/prompts/context.md` and `cv.md`.
7. If you change a message schema or the envelope, update `src/core/deliverables/schema.ts`, `normalize.ts`, `validate.ts`, the limits/warnings, and `tests/deliverables.test.ts` in the same change. The envelope is generated from the same per-deliverable schemas, so the prompt and validator cannot drift.

### Add a renderer

1. Copy `src/renderers/classic/` to `src/renderers/<id>/`.
2. Change `meta.id`, `meta.name`, `meta.schemas`, and CSS.
3. Use `ctx.field(path, value)` for every editable value; use `ctx.esc` for non-editable values.
4. Keep the page element: `<div class="cv-page" data-cv-page>`.
5. Import the module in `src/renderers/registry.ts`.
6. Add a sample/adjust `src/core/cv/sample.ts` if needed.
7. Run `npm run check:renderers` and `npm test`; then `npm run smoke`.
8. For an LLM-generated renderer, give the model `docs/renderer-contract.md`, the target schema, and an existing renderer as a reference. Never paste real PII into the generation prompt.

### Change the prompt

1. Edit the relevant bundled template under `public/config/prompts/`:
   - `context.md` — shared role, universal rules, basics, PDR, job, shared instructions, existing-CV context.
   - `cv.md` — CV task, reference CV, CV instructions, selected schema, schema notes.
   - `cover-letter.md` — cover-letter task, instructions, output shape.
   - `cold-email.md` — cold-email task, recipient block, instructions, output shape.
   - `linkedin-message.md` — LinkedIn task, recipient block, instructions, output shape.
2. Or use **Settings → Prompt templates** and pick a tab. Saving writes only `<workspace>/config/prompts/<file>`; **Use bundled default** removes that one override. A workspace override wins over the bundled file, and a bundled fetch failure falls back per template.
3. Keep every placeholder in the documented set. `buildProjectPrompt` replaces `{{UPPER_SNAKE}}` tokens; unknown tokens remain literally in the prompt.
4. Update `tests/prompt.test.ts` if you add or rename a placeholder, change the composition order, or change the output contract.
5. Keep the "JSON only / no fences / no invented facts" rules unless the product explicitly changes. The output contract and metadata footer are generated in `src/core/prompt/builder.ts`; do not duplicate them in a template.
6. The old single `config/cv-prompt.md` is archived to `config/cv-prompt.legacy.md` on hydrate (timestamped suffix on collision) and is never read as an active template.

### Add a document preset

The four deliverable presets are implemented: CV, cover letter, cold email, and LinkedIn message. Each has an id in `src/core/deliverables/types.ts`, a message schema/limits entry (messages only) in `src/core/deliverables/schema.ts`, and a bundled task template under `public/config/prompts/`. New projects default to `["cv"]`; the New Project modal and Target stage let the user choose. CV output is `cv.json`; messages are applied artifacts under `deliverables/`.

To add another deliverable:

1. Add the id and any content type to `DELIVERABLE_IDS` and `types.ts`, then update the label, template-file mapping, default settings/selection, and `deliverableHasContent`.
2. Add its JSON Schema, advisory limits, and prompt notes in `src/core/deliverables/schema.ts`; the envelope builder will include it automatically.
3. Add `public/config/prompts/<id>.md` with only that task's static text and placeholders.
4. Add normalization and validation in `normalize.ts` / `validate.ts`, and a preview/copy/download path if it is a message.
5. Map the template id and placeholders in `src/core/prompt/builder.ts` and the Settings tabs.
6. Add the Target panel, Response card, selection summary, and New Project option.
7. Add an artifact path and file index entry in `src/core/workspace/projects.ts`, including stale-file cleanup on clear.
8. Extend `tests/prompt.test.ts`, `tests/deliverables.test.ts`, `tests/project.test.ts`, and the smoke scenarios; update the docs.

Do not overload one template with unrelated document instructions. One task template per deliverable keeps each prompt auditable and lets a user edit one task without risking another.

## Testing notes

- Unit tests run in Node and must not depend on a browser DOM. `sanitizeSavedHtml` has a regex fallback for Node.
- Deliverable tests: `tests/deliverables.test.ts` (bare CV/envelope splitting, missing and extra keys, wrong types, message limits and warnings, independent results), `tests/preview.test.ts` (cover-letter Markdown subset and escaping), `tests/selection.test.ts` (last-selected guard, canonical order, "select missing only"), `tests/project.test.ts` (version-1 migration, selection normalization, artifact round-trip/cleanup, legacy archive, per-template overrides), and `tests/prompt.test.ts` (selection-aware composition, placeholders, warnings, CV-only vs envelope contract).
- `npm run smoke` starts its own Vite server, injects an OPFS-backed `showDirectoryPicker`, and exercises Profile -> project -> combined prompt -> response import -> inline edit -> PDF export -> Settings/templates -> workspace switch. It also covers the deliverable scenarios:
  - CV-only: bare-CV prompt, valid response, `cv.json`, and an exported PDF.
  - CV + cover letter: both task headings and the envelope key; a fake envelope applies the CV and saves the cover letter independently; the cover-letter card previews; `deliverables/cover-letter.md` exists and `project.json` has no message text.
  - Cover-letter-only with a company and no CV: the prompt has the cover-letter task and job context but no CV schema or reference CV; `{ "coverLetter": "…" }` creates a card with copy and `.md` download; the file is saved.
  - Cold email with a recipient and no job: recipient block, neutral no-job text, and no missing-description warning.
  - LinkedIn message with a recipient: recipient block and post-acceptance rule.
  - Workspace switch does not leak the old profile or project.
- If the smoke test hangs, check for a stale Vite process on 5173; the script kills its own detached process group.
- `npm run build` type-checks the Node server as well as the app.
- Never put real PII into fixtures, screenshots, tests, logs, or issue reports. Use fictional names, companies, emails, and URLs.

## Known limitations / next steps

- Only single-page A4 CVs are implemented. Multi-page support needs pagination and page-aware editing.
- Cover letters, cold emails, and LinkedIn messages have no PDF or A4 preview. They are validated text artifacts with copy and Markdown/text download only.
- One artifact of each message type per project. There is no version history or multiple cover letters/emails per project, and unchecking a deliverable does not delete its saved artifact.
- Prompt/response history is stored as `latest` files; timestamped archives and project deletion are not implemented.
- The default renderer/schema and default deliverable selection are per project; there is no global default-renderer or default-deliverable UI yet.
- There is no LLM API-key integration. The prompt is copy/paste by design.
- PDF export needs the local Node server; a purely static deployment falls back to the print dialog.
- Recipient about text and posts are third-party personal data. They are sent in the prompt when cold email or LinkedIn is selected; do not log prompts.
- Real PII remains in `local-data/`; do not add it to git, examples, tests, screenshots, or issue reports.
