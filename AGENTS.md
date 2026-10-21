# AGENTS.md

CV Studio is a local-first, static + local-Node application for generating tailored CVs. A human picks a workspace folder, imports a personal data record (PDR), pastes a job description, generates one LLM prompt, pastes the JSON response back, validates it, tunes the rendered CV, and exports a real A4 PDF into the project folder.

Read `README.md` for the user workflow and `docs/` for the detailed contracts. This file is the entrypoint for future agents.

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
  views/stages/              Apply, Prompt, Import, Preview stages
  components/                Layout, CvPreview, NewProjectModal
  core/cv/                   types, schemas, normalize, validate, migrate, sample, paths
  core/render/               render context, preview doc, renderer checks, sanitize
  core/prompt/               prompt template loading + prompt builder
  core/llm/                  LLM response extraction/repair/parse
  core/workspace/            File System Access helpers, IndexedDB handles, project IO
  core/profile/              DOCX/MD/TXT -> Markdown
  core/export/               client for /api/export-pdf
  renderers/                 renderer modules + registry
  runtime/preview-runtime.js editing, formatting, overflow, print runtime
public/config/prompts/cv.md  canonical prompt template
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
  config/cv-prompt.md        optional override
  projects/<id>/
    project.json
    cv.json
    inputs/{job,instructions,reference-cv}.md
    prompts/latest.md
    responses/latest.raw.txt
    <name>-<company>-cv.pdf
```

## Invariants (do not break)

1. **Content and presentation are separate.** `cv.json` contains only `CvContent`. Renderer choice, schema choice, and `CvStyle` live in `project.json`. Never put CSS classes, renderer markup, or layout data into `cv.json`.
2. **Renderers are pure.** A renderer exports `meta`, `css`, and `render(cv, ctx) -> HTML string`. It must not use `document`, `window`, `fetch`, storage, or timers. Editing, formatting, printing, and overflow detection belong to `src/runtime/preview-runtime.js`.
3. **The schema is a contract.** Schemas live in `src/core/cv/schema.ts`. A renderer declares `meta.schemas`. The prompt uses the selected schema's JSON Schema; validation uses the same schema. If you add or change a schema, update `normalizeCv`, tests, the prompt notes, and renderer compatibility.
4. **All static prompt text lives in the prompt template.** `public/config/prompts/cv.md` is the canonical template. The workspace override `config/cv-prompt.md` is read at startup and edited from Settings. Do not scatter prompt instructions across TypeScript. Dynamic data goes in through `{{PLACEHOLDER}}` tokens.
5. **LLM output is untrusted.** Flow: `extractJson` -> `JSON.parse` -> `jsonrepair` fallback -> `normalizeCv` (drops unknown fields) -> Ajv validation. Renderers only receive escaped text through `ctx.esc` / `ctx.nl2br` / `ctx.field`. Never inject raw model HTML.
6. **Rich text is sanitized twice.** The editing runtime sanitizes `innerHTML` before posting, and `sanitizeSavedHtml` sanitizes saved `fieldHtml` at render time. Keep the allowlist conservative (`B`, `STRONG`, `I`, `EM`, `U`, `BR`, `SPAN`, `DIV`, `P`; only `font-size` on spans in the render-time sanitizer).
7. **Never commit personal data.** `local-data/` is gitignored and contains real PII. `examples/` must stay fictional. Do not print PII in test output or logs.
8. **The origin is fixed.** Vite uses port `5173` with `strictPort: true` because File System Access handles are stored in IndexedDB keyed by origin. Changing the port loses remembered workspaces. Do not change it without a migration plan.
9. **PDF is a first-class output.** Keep `@page { size: A4; margin: 0 }` in renderer CSS, `data-cv-page` on the page element, and print resets in `preview-base.css`. Automatic export uses `buildPrintDoc` -> `POST /api/export-pdf` -> headless Chrome -> write `cv.pdf` through the browser's directory handle. The print dialog is the fallback. Test with `npm run smoke` and inspect `PDF_OUT`.
10. **Inline editing is host-level.** Renderers mark editable values with `ctx.field("path.to.value", value)` and should not add `contenteditable`. Field paths are JSON paths into `CvContent` and must match the schema. The runtime posts edits; `pathSet` updates `cv`; `fieldHtml`/`fieldText` preserve formatting with a plain-text drift guard.
11. **One A4 page is the default.** Renderers use fixed A4 page dimensions and `overflow: hidden`. Mark scroll containers with `data-cv-overflow-watch`. Keep `data-cv-page` on the page.
12. **Renderer code is trusted local code.** Like a plugin, a renderer can run arbitrary JS in the page. `checkRenderer` rejects `<script>` output and missing fields, but it is not a sandbox. Document this trust boundary; never load remote renderer code.

## Common changes

### Add a schema variant

1. Add a `CvSchemaDef` to `CV_SCHEMAS` in `src/core/cv/schema.ts` using `buildSchema(...)` or a custom schema object.
2. Update `normalizeCv` in `src/core/cv/normalize.ts` for any new fields.
3. Add a sample in `src/core/cv/sample.ts` if renderers should support it.
4. Add/extend tests in `tests/schema.test.ts` and `tests/examples.test.ts`.
5. Set `meta.schemas` on compatible renderers.
6. Add schema-specific writing rules in `promptNotes`; keep generic rules in `public/config/prompts/cv.md`.

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

1. Edit `public/config/prompts/cv.md` for the default.
2. Or use **Settings → Prompt template**; saving writes `<workspace>/config/cv-prompt.md`.
3. Keep every placeholder in the documented set. `buildCvPrompt` replaces `{{UPPER_SNAKE}}` tokens; unknown tokens remain literally in the prompt.
4. Update `tests/prompt.test.ts` if you add/rename a placeholder.
5. Keep the "JSON only / no fences / no invented facts" rules unless the product explicitly changes.

### Add a document preset (cover letter, outreach, LinkedIn)

The CV is the only implemented document type. The intended extension is one Markdown template per document type under `public/config/prompts/` plus a preset definition that supplies required inputs and an output schema. Do not overload `cv.md` with unrelated document instructions. See `docs/roadmap.md`.

## Testing notes

- Unit tests run in Node and must not depend on a browser DOM. `sanitizeSavedHtml` has a regex fallback for Node.
- `npm run smoke` starts its own Vite server, injects an OPFS-backed `showDirectoryPicker`, and exercises Profile -> project -> prompt -> schema/renderer switch -> response import -> inline edit -> PDF export. It verifies the PDF starts with `%PDF-` and is written into the project folder.
- If the smoke test hangs, check for a stale Vite process on 5173; the script kills its own detached process group.
- `npm run build` type-checks the Node server as well as the app.

## Known limitations / next steps

- Only single-page A4 CVs are implemented. Multi-page support needs pagination and page-aware editing.
- Prompt/response history is stored as `latest` files; timestamped archives and project deletion are not implemented.
- The default renderer/schema is selected per project; there is no global default-renderer UI yet.
- There is no LLM API-key integration. The prompt is copy/paste by design.
- PDF export needs the local Node server; a purely static deployment falls back to the print dialog.
- Real PII remains in `local-data/`; do not add it to git, examples, tests, screenshots, or issue reports.
