# CV Studio

A local-first workbench for turning a personal data record and a job or outreach target into a tailored one-page CV and related application deliverables: a cover letter, a cold email, and a LinkedIn message. Content, renderer style, the generated prompt, the raw LLM response, messages, and the final PDF all live in a folder you choose.

## Features

- **Combined deliverables** — one project can request any combination of CV, cover letter, cold email, and LinkedIn message in one prompt, sharing the PDR and target context once. CV-only keeps the original bare-CV response; other selections use one JSON envelope.
- **Prompt pipeline** — describe a job (or pure outreach), generate one complete prompt from a shared context template plus one task template per selected deliverable, copy it to any LLM, then paste the JSON back.
- **Per-deliverable validation and apply** — the Response stage validates each card independently. A bad letter never blocks a good CV, and each message can be saved or cleared on its own.
- **Message cards** — cover-letter preview/edit with a conservative Markdown subset, plain-text/Markdown copy, and `.md`/`.txt` downloads for letters, cold emails, and LinkedIn messages.
- **Schema-aware renderers** — each renderer declares the CV schema it supports. Pick a renderer, then pick one of its compatible output schemas for the prompt. The prompt and validation both use that schema.
- **Multiple renderers** — Classic sidebar (no summary), Classic + Summary, and Impact (per-role skills, Problem / Solution / Outcome projects).
- **Inline CV editing** — edit CV text directly in the preview, plus bold/italic/underline, selection font size, global text scale, spacing, margins, and sidebar width.
- **Real PDF export** — a local Node endpoint renders the final CV with headless Chrome and writes a genuine A4 PDF into the project folder. A print-dialog fallback is always available. Messages are text, not PDFs.
- **One place for prompt instructions** — five Markdown templates ship with the app; edit the bundled versions or save per-template workspace overrides from Settings.
- **Local workspace** — each application or outreach effort gets a folder with `project.json`, `cv.json`, `deliverables/`, `inputs/`, `prompts/`, `responses/`, and the exported CV PDF.
- **PDR import** — `.docx`, `.md`, `.txt`, or pasted text, with the extracted text editable before it reaches a prompt.
- **Legacy import** — old `cv-studio.html` CV JSON (schema version 1) can be loaded and migrated.

## Requirements

- Node.js 20 or newer.
- Desktop Chrome or Edge for the File System Access API (folder access).
- Google Chrome or Chromium installed for automatic PDF export. Set `CHROME_PATH` if it is not in a standard location.

Firefox and Safari can render the app, but cannot persist project folders.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The port is intentionally fixed: the browser stores the workspace folder handle in IndexedDB, which is scoped to the origin including the port. Changing ports silently loses the remembered workspace. Use the same hostname too; `http://127.0.0.1:5173` is a different origin from `http://localhost:5173` and will not see the saved handle.

1. Choose an empty folder as your workspace.
2. Go to **Profile**, import your PDR, and fill in your name and contact details.
3. Create an application or outreach project. Pick the deliverables and, for cold email/LinkedIn, a recipient. Choose a renderer only when the CV is selected.
4. In **1 · Target**, add job context (or leave it empty for outreach), instructions, recipient details, and an optional reference CV.
5. Generate and copy the prompt, run it through an LLM, and bring the JSON back to **3 · Response**.
6. Validate and apply each deliverable. Applying the CV opens **4 · Preview**, where you tune it and click **Save PDF**. Messages stay on Response to copy, download, save, or clear.

## PDF export

**Save PDF** posts the standalone CV HTML to the local Node server at `/api/export-pdf`. The server renders it with headless Chrome, returns the PDF bytes, and the browser writes them to:

```
<workspace>/projects/<project-id>/<name>-<company>-cv.pdf
```

This requires `npm run dev` or `npm run preview` (the Node server). If the endpoint is unavailable, or Chrome cannot be launched, CV Studio opens the browser print dialog instead. The **Print** button always uses the print dialog.

The generated PDF is one A4 page. If content is clipped, the Preview stage shows a warning before you export.

Cover letters, cold emails, and LinkedIn messages are not PDFs in this feature. Use the Response card actions to copy them or download `.md`/`.txt` files.

## Prompt customization

The prompt is composed from five bundled templates:

| Template | Purpose |
| --- | --- |
| [`context.md`](public/config/prompts/context.md) | Shared role, universal rules, candidate basics, PDR, target job, shared instructions, existing-CV context. Emitted once. |
| [`cv.md`](public/config/prompts/cv.md) | CV task, reference CV, CV instructions, selected schema, schema notes. |
| [`cover-letter.md`](public/config/prompts/cover-letter.md) | Cover-letter task and rules. |
| [`cold-email.md`](public/config/prompts/cold-email.md) | Cold-email task, recipient block, and rules. |
| [`linkedin-message.md`](public/config/prompts/linkedin-message.md) | LinkedIn post-acceptance task, recipient block, and rules. |

In **Settings → Prompt templates** you can edit any tab. Saving writes an override to:

```
<workspace>/config/prompts/<file>
```

Overrides are read at startup. **Use bundled default** removes only that template's override. The app also appends a generated output contract and a metadata footer (schema, selected deliverables, prompt version, date); those are not editable template text.

The pre-deliverables single-file override `config/cv-prompt.md` is archived once to `config/cv-prompt.legacy.md` (a timestamped suffix is used if that file already exists) and is no longer active. A failed archive leaves the original in place and shows an error.

Placeholders use `{{NAME}}` syntax; the available placeholders are listed in Settings for each tab. Unknown placeholders remain visible.

## Renderers and schemas

CV schemas are defined in `src/core/cv/schema.ts`. Renderers declare compatibility in `renderer.js`:

```js
export const meta = {
  apiVersion: 1,
  id: "classic",
  name: "Classic Sidebar",
  schemas: ["classic"],
  // ...
};
```

A renderer may support several schemas, and several renderers may share one schema. The **Prompt** stage only offers schemas supported by the selected renderer. Changing the renderer keeps the current schema if compatible, otherwise it selects the renderer's first schema. The renderer/schema controls are hidden when the CV is not requested.

See [docs/renderer-contract.md](docs/renderer-contract.md) for the full renderer API and instructions for generating a new renderer with an LLM.

## Workspace layout

```
<workspace>/
  settings.json
  profiles/default.json
  config/prompts/                # per-template overrides
    context.md
    cv.md
    cover-letter.md
    cold-email.md
    linkedin-message.md
  config/cv-prompt.legacy.md     # archived old single-file override
  projects/<project-id>/
    project.json                 # job, selection, settings, renderer/schema, styles, file index
    cv.json                      # CV content only
    deliverables/
      cover-letter.md
      cold-email.json
      linkedin-message.txt
    inputs/job.md
    inputs/instructions.md
    inputs/reference-cv.md
    prompts/latest.md
    responses/latest.raw.txt
    <name>-<company>-cv.pdf
```

The browser only exposes the folder name, not the absolute path. `project.json` never duplicates CV or message content; messages live under `deliverables/` and the index records their paths.

## Privacy and trust

- There is no backend service and no analytics. Data stays in the selected folder and in browser storage for the folder handle.
- The only data that leaves your machine is what you copy into an LLM.
- Recipient about text, posts, and other profile details are third-party personal data. They are included only in cold-email/LinkedIn prompts when those deliverables are selected; the UI warns about this. Prompts contain personal data; do not log them.
- Real personal data belongs in the gitignored `local-data/` folder. `examples/` contains only fictional data.
- LLM output is treated as untrusted: it is parsed, repaired if necessary, split by deliverable, normalized, and validated against the same JSON Schemas shown to the model before anything is applied.
- CV text fields are HTML-escaped by renderers. Rich text captured from inline editing is sanitized both in the iframe and at render time. The cover-letter preview escapes input before adding Markdown formatting and only emits validated `http(s)`/`mailto` links.
- Renderer modules run as trusted local code, like a plugin. Only run renderers you trust. They must not use the network, storage, or DOM APIs.
- The PDF endpoint only accepts same-origin JSON requests and uses a local headless Chrome instance.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local app and PDF endpoint on port 5173. |
| `npm run build` | Type-check and build the static app into `dist/`. |
| `npm run preview` | Serve the production build on port 5173 with the PDF endpoint. |
| `npm test` | Unit tests for schemas, deliverables, prompt building, parsing, renderers, and examples. |
| `npm run check:renderers` | Run only the renderer contract checks. |
| `npm run smoke` | End-to-end browser smoke test. Uses system Chrome and an Origin Private File System workspace. |
| `PDF_OUT=/tmp/cv.pdf npm run smoke` | Also write the exported PDF to a file for inspection. |
| `PDR_DOCX=path/to/file.docx npm run smoke` | Also exercise DOCX import. |

The smoke test covers the CV-only flow, CV + cover letter, cover-letter-only, cold email without a job, LinkedIn with a recipient, message copy/download, artifact files, and workspace switching. All fixtures are fictional.

## Troubleshooting

**"This browser does not expose the File System Access API"** — use desktop Chrome or Edge.

**Chrome asks for permission again after a restart** — click **Reconnect** on the workspace screen. The handle is remembered, but write permission is not permanent.

**Automatic PDF export falls back to print** — the Node server is not running, or Chrome could not be launched. Run `npm run dev` (or `npm run preview`), install Chrome, or set `CHROME_PATH`.

**PDF has different fonts from the preview** — headless Chrome uses fonts installed on the machine. A font that only exists in your normal browser profile may not be available to headless Chrome.

**Old CV JSON** — use **Response → Load CV JSON** (only visible when the CV is requested). Schema version 1 files are migrated, including supported rich-text style data.

**My old prompt override disappeared** — the single `config/cv-prompt.md` is archived to `config/cv-prompt.legacy.md` when the workspace is opened. Settings shows a one-time notice; copy anything you still need into the matching template tab under `config/prompts/`.

## Documentation

- [Architecture](docs/architecture.md)
- [Data model and workspace](docs/data-model.md)
- [Renderer contract](docs/renderer-contract.md)
- [Prompt pipeline](docs/prompt-pipeline.md)
- [Roadmap](docs/roadmap.md)
- [Agent entrypoint](AGENTS.md)

## License

MIT
