# Architecture

CV Studio is a local-first React application with a small local Node sidecar for PDF rendering. Documents, prompts, responses, and settings are stored in a folder the user chooses through the File System Access API. There is no account system, database, or application server holding user data.

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
| `src/App.tsx` | Boot, reconnect workspace, load profile/settings, autosave, view routing, project actions. |
| `src/views/` | Projects dashboard, profile editor, settings, project stage tabs. |
| `src/views/stages/` | Apply (job inputs), Prompt, Import (LLM response), Preview (editing/style/export). |
| `src/components/CvPreview.tsx` | Hosts the iframe, sends runtime messages, receives edits. |
| `src/core/cv/` | Types, schema registry, normalization, validation, migration, samples, field paths. |
| `src/core/render/` | Render context, document builder, renderer contract checks, saved-HTML sanitizer. |
| `src/core/prompt/` | Template loading, placeholder substitution, token estimate, warnings. |
| `src/core/llm/` | Extract JSON from prose/fences, repair, parse. |
| `src/core/workspace/` | File System Access wrappers, IndexedDB handle storage, project/profile IO. |
| `src/core/profile/` | DOCX/Markdown/TXT import to Markdown. |
| `src/core/export/` | Client for the PDF endpoint. |
| `src/renderers/` | Pure renderer modules and registry. |
| `src/runtime/preview-runtime.js` | Runtime injected into the preview iframe. |
| `public/config/prompts/cv.md` | Canonical prompt template. |
| `server/pdf.ts` | Headless-Chrome PDF rendering for the local server. |

## End-to-end flow

1. **Workspace boot.** The user picks a folder. The handle is stored in IndexedDB. `initializeWorkspace` creates `projects/`, `profiles/`, and `config/`, plus `settings.json` and `profiles/default.json` if missing.
2. **Profile.** The user imports a PDR (`.docx` to Markdown via Mammoth + Turndown, or direct `.md`/`.txt`) and edits the extracted text. Name, headline, and contact are stored separately for prompt basics.
3. **Project creation.** A project folder is created with a unique slug. The chosen renderer determines the compatible schema. The CV starts empty (with profile basics and section titles).
4. **Prompt.** `buildCvPrompt` loads the workspace override or bundled template, injects profile, PDR, reference CV, job, instructions, selected JSON Schema, schema notes, prompt version, and date. The prompt is persisted to `prompts/latest.md`.
5. **LLM round trip.** The user copies the prompt, runs it externally, and pastes the raw response. The raw response is persisted. The parser extracts a JSON object from fences/prose and repairs common issues.
6. **Validation.** `normalizeCv` keeps only fields allowed by the selected schema and coerces missing/loose values. Ajv validates the normalized object. Only valid content can be applied.
7. **Preview.** The renderer turns `cv.json` into HTML. `buildPreviewDoc` adds base CSS, renderer CSS, CSS variables, and the shared runtime in a same-origin iframe.
8. **Editing and style.** The runtime makes `[data-field]` elements editable, sanitizes rich text, and posts edits to the host. Style controls post CSS variables. Edits update `project.cv`; formatting is stored in `CvStyle.fieldHtml` with a plain-text drift guard.
9. **PDF.** The host builds a standalone document without the runtime and posts it to `/api/export-pdf`. The Node process prints A4 PDF with headless Chrome. The browser writes the bytes into the project folder. If the endpoint fails, the host opens the print dialog.

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

## Inline editing model

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

## Persistence

- **IndexedDB** stores only the `FileSystemDirectoryHandle` for the workspace. It is origin-scoped.
- **Workspace files** are the durable source of truth for projects, profiles, settings, prompts, responses, and PDFs. `cv.json` is loaded with a superset normalization so schema-specific fields are preserved when the user switches renderers or schema; applying a new LLM response is the explicit replacement point.
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

- **LLM output:** untrusted. Parsed, normalized, schema-validated. Rendered text is escaped.
- **Saved rich text:** treated as untrusted. Sanitized in the runtime before posting and again at render time.
- **Prompt template:** user-controlled text. It is never interpreted as HTML.
- **Renderer modules:** trusted local code, equivalent to a plugin. They can run arbitrary JS in the page. Only install renderers you trust; there is no remote renderer loading.
- **PDF endpoint:** local only, same-origin, JSON-only. It renders supplied HTML in headless Chrome; it does not access workspace files.

## Limitations

- One A4 page only; overflow is detected and clipped, not paginated.
- No project deletion or timestamped prompt/response history yet.
- No LLM API integration; the prompt is copy/paste.
- No server-side persistence or sync.
- PDF export needs the local Node server for automatic file writing.
