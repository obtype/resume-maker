# Architecture

CV Studio is a local-first React application with a small local Node sidecar for PDF rendering. Documents, prompts, responses, deliverables, and settings are stored in a folder the user chooses through the File System Access API. There is no account system, database, or application server holding user data.

## Process boundaries

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                  │
│  React shell (src/App.tsx)                                       │
│    ├─ views + forms                                              │
│    ├─ workspace state + autosave                                 │
│    └─ IndexedDB: remembered directory handle                     │
│                                                                  │
│  File System Access API ──────────────► user-selected folder     │
│                                                                  │
│  Preview iframe (srcdoc)                                         │
│    ├─ renderer output (plain HTML + CSS)                         │
│    └─ shared runtime: editing, formatting, overflow, print       │
│                                                                  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ POST /api/export-pdf (local only)
┌──────────────────────────────▼───────────────────────────────────┐
│  Vite dev / preview server (Node)                                │
│    └─ server/pdf.ts -> playwright-core -> system Chrome          │
│         returns PDF bytes, no persistence                        │
└──────────────────────────────────────────────────────────────────┘
```

The browser is the source of truth for workspace data. The Node process only receives standalone CV HTML and returns PDF bytes. It does not know the workspace path and does not store the document.

## Main modules

| Area | Responsibility |
| --- | --- |
| `src/App.tsx` | Boot, reconnect workspace, load profile/settings/templates, archive the legacy prompt override, autosave, view routing, project actions. |
| `src/views/` | Projects dashboard, profile editor, settings, project stage tabs. |
| `src/views/stages/` | Target (job/outreach inputs + deliverable selection), Prompt (composition), Response (parse/validate/apply per deliverable), Preview (CV editing/style/export). |
| `src/components/CvPreview.tsx` | Hosts the iframe, sends runtime messages, receives edits. |
| `src/components/RecipientFields.tsx` | Shared recipient inputs for cold email and LinkedIn, with the third-party data note. |
| `src/core/cv/` | Types, schema registry, normalization, validation, migration, samples, field paths. |
| `src/core/deliverables/` | Deliverable ids/settings, message schemas and limits, response splitting/normalization, per-message validation, cover-letter preview, selection helpers. |
| `src/core/render/` | Render context, document builder, renderer contract checks, saved-HTML sanitizer. |
| `src/core/prompt/` | Template loading, placeholder substitution, prompt composition, selection-aware warnings, token estimate. |
| `src/core/llm/` | Extract JSON from prose/fences, repair, parse. |
| `src/core/workspace/` | File System Access wrappers, IndexedDB handle storage, project/profile/template/artifact IO, legacy archive. |
| `src/core/profile/` | DOCX/Markdown/TXT import to Markdown. |
| `src/core/export/` | Client for the PDF endpoint. |
| `src/renderers/` | Pure renderer modules and registry. |
| `src/runtime/preview-runtime.js` | Runtime injected into the preview iframe. |
| `public/config/prompts/` | Shared context + one task template per deliverable. |
| `server/pdf.ts` | Headless-Chrome PDF rendering for the local server. |

## End-to-end flow

1. **Workspace boot.** The user picks a folder. The handle is stored in IndexedDB. `initializeWorkspace` creates `projects/`, `profiles/`, and `config/prompts/`, plus `settings.json` and `profiles/default.json` if missing. Hydrate archives a legacy `config/cv-prompt.md` once, then loads each active template as workspace override -> bundled file -> minimal fallback.
2. **Profile.** The user imports a PDR (`.docx` to Markdown via Mammoth + Turndown, or direct `.md`/`.txt`) and edits the extracted text. Name, headline, contact, and default instructions are stored separately.
3. **Project creation.** A project folder is created with a unique slug. The modal records an optional job title/company, a deliverable selection, and an optional recipient name. Name/slug fallbacks are company -> title -> recipient -> `Outreach`/`outreach`. Even a message-only project keeps a valid default renderer and CV schema for later.
4. **Target.** The user adds or edits the job title, company, description, shared instructions, per-deliverable instructions, recipient details for cold email/LinkedIn, and an optional reference CV. The target can be pure outreach with no job at all.
5. **Prompt.** `buildProjectPrompt` emits the shared context once, the selected task templates in canonical order, the generated output contract (bare CV for CV-only, envelope otherwise), and the metadata footer. The prompt is persisted to `prompts/latest.md`.
6. **LLM round trip.** The user copies the prompt, runs it externally, and pastes the raw response. The raw response is persisted. The parser extracts a JSON object from fences/prose and repairs common issues.
7. **Response split.** `splitResponseForSelection` interprets a bare CV or an envelope against the current selection. Requested keys become cards; missing requested keys become card errors; unrequested keys become a warning with no card.
8. **Validation and apply.** The CV is normalized and validated against the selected CV schema. Each message is normalized and validated against its own schema. The user applies the CV and each message independently. The CV writes `cv.json` and opens Preview; messages write artifacts under `deliverables/` and stay on Response.
9. **Preview.** The renderer turns `cv.json` into HTML. `buildPreviewDoc` adds base CSS, renderer CSS, CSS variables, and the shared runtime in a same-origin iframe. Preview is CV-only and hidden when the project has no CV content and did not select the CV.
10. **Editing and style.** The runtime makes `[data-field]` elements editable, sanitizes rich text, and posts edits to the host. Style controls post CSS variables. Edits update `project.cv`; formatting is stored in `CvStyle.fieldHtml` with a plain-text drift guard. Messages stay as plain textareas in Response.
11. **PDF.** The host builds a standalone document without the runtime and posts it to `/api/export-pdf`. The Node process prints A4 PDF with headless Chrome. The browser writes the bytes into the project folder. If the endpoint fails, the host opens the print dialog. Cover letters, cold emails, and LinkedIn messages are not PDF outputs in this feature.

## Deliverable pipeline

```
Parsed response
      │
      ├─ splitResponseForSelection(value, selected)
      │     ├─ bare CV or envelope
      │     ├─ parts / missing / unrequested
      │     └─ bareCv flag
      │
      ├─ CV: normalizeCv -> validateCv(project.schemaId) -> project.cv -> cv.json
      └─ message: normalize -> validateMessageDeliverable -> project.artifacts -> deliverables/<file>
```

The envelope schema is generated by `buildEnvelopeSchema` from the same message schemas used by the validators, so prompt and runtime cannot drift. A CV-only request keeps the original bare-CV shape; a multi-deliverable request uses the envelope. Applying is always per card, so an invalid cover letter never blocks a valid CV or cold email.

Cover-letter preview and copy/download are host-rendered from the saved/edited string:

- preview: escape first, then paragraphs, line breaks, bold, italic, and validated `http(s)`/`mailto` links;
- copy: plain text or Markdown;
- download: `.md`.
- cold email and LinkedIn: plain text copy, `.txt` download.

## Rendering pipeline

```
CvContent + CvStyle + RendererModule
        │
        ├─ styleToCssVars -> :root variables
        ├─ renderer.render(cv, ctx) -> HTML string
        └─ composeDoc -> <!doctype html> ... base CSS ... renderer CSS
```

The preview and PDF builders share `composeDoc` in `src/core/render/previewDoc.ts`. The preview version includes the runtime and editing class; the print version does not.

Renderers are intentionally pure string builders. They have no DOM, storage, network, or timers. This keeps them portable, testable in Node, and safe to generate from a contract.

## Inline editing model (CV only)

The renderer wraps editable values with:

```js
ctx.field("experience.0.role", entry.role)
```

which emits `<span data-field="experience.0.role">…</span>`. The runtime finds those spans and:

- toggles `contenteditable`;
- posts `{type:"cv:edit", path, text, html}` on input/blur;
- posts a full sync after formatting commands;
- runs overflow checks against `[data-cv-page]` and `[data-cv-overflow-watch]`.

The host applies `pathSet(cv, path, text)` and stores `fieldHtml[path]` plus `fieldText[path]`. At render time, saved HTML is used only if its plain text still equals the current content, preventing stale formatting from surviving a content change.

Messages are not renderer fields. The Response stage edits a cover letter, LinkedIn message, or cold-email subject/body in plain textareas, validates the draft on every change, and saves the whole value as an artifact. There is no `contenteditable`, field path, or rich-text model for messages.

## Persistence

- **IndexedDB** stores only the `FileSystemDirectoryHandle` for the workspace. It is origin-scoped.
- **Workspace files** are the durable source of truth for projects, profiles, settings, prompts, responses, messages, and PDFs.
- `cv.json` is loaded with a superset normalization so schema-specific fields are preserved when the user switches renderers or schema; applying a new LLM response is the explicit replacement point.
- `project.json` holds project configuration (job context, shared instructions, renderer/schema, styles, deliverable selection/settings, recipient data, prompt version) and a file index. It never holds `cv`, `artifacts`, `promptText`, or `rawResponse`.
- Applied messages are written to `deliverables/`: `cover-letter.md`, `cold-email.json`, and `linkedin-message.txt`. Clearing an artifact removes its file and index entry on the next save.
- `prompts/latest.md` and `responses/latest.raw.txt` are overwritten; there is no history.
- **React state** holds the active project. Autosave debounces writes (roughly 800 ms) and flushes when navigating/switching projects.
- The workspace path itself is never known to the app; only the folder name is exposed by the browser.

## PDF rendering

`server/pdf.ts`:

1. Receives `{ html }` as JSON.
2. Rejects non-JSON and cross-origin requests.
3. Launches system Chrome through `playwright-core` (`CHROME_PATH` or standard locations).
4. Calls `page.setContent`, waits for fonts, and `page.pdf` with A4, `printBackground`, and `preferCSSPageSize`.
5. Returns bytes; the browser writes `<name>-<company>-cv.pdf` into the project folder.

This is a development/preview feature. A static deployment has no endpoint and falls back to the browser print dialog.

## Origin constraint

The Vite server is fixed to `http://localhost:5173` with `strictPort: true`. File System Access handles stored in IndexedDB are keyed by origin including the port. Changing the port would make previously remembered workspaces invisible. A future port change needs an explicit migration/reconnect flow.

## Trust boundaries

- **LLM output:** untrusted. Parsed, split per deliverable, normalized, schema-validated. Rendered text is escaped.
- **Saved rich text:** treated as untrusted. Sanitized in the runtime before posting and again at render time.
- **Message text:** treated as untrusted. The cover-letter preview escapes input before adding its Markdown subset and only emits validated link targets; messages are otherwise plain textareas and copy/download strings.
- **Recipient context:** about text and posts are third-party personal data. They are included only in the cold-email/LinkedIn prompts when those deliverables are selected, and the UI warns about sending them to an LLM.
- **Prompt templates:** user-controlled text. They are never interpreted as HTML.
- **Renderer modules:** trusted local code, equivalent to a plugin. They can run arbitrary JS in the page. Only install renderers you trust; there is no remote renderer loading.
- **PDF endpoint:** local only, same-origin, JSON-only. It renders supplied CV HTML in headless Chrome; it does not access workspace files.

## Limitations

- One A4 page only; overflow is detected and clipped, not paginated.
- Cover letters, cold emails, and LinkedIn messages have no PDF or A4 preview; they are validated text artifacts with copy and Markdown/text download.
- One artifact of each message type per project, with no version history. Unchecking a deliverable does not delete its artifact.
- No project deletion or timestamped prompt/response history yet.
- No LLM API integration; the prompt is copy/paste.
- No server-side persistence or sync.
- PDF export needs the local Node server for automatic file writing.
- Recipient text and prompts contain personal data; do not log them.
