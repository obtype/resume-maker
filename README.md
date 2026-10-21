# CV Studio

A local-first workbench for turning a personal data record and a job description into a tailored, one-page CV. CV content, renderer style, the generated prompt, the raw LLM response, and the final PDF all live in a folder you choose.

## Features

- **Prompt pipeline** — paste a job description, generate one complete prompt (PDR + profile + reference CV + job + schema + rules), copy it to any LLM, then paste the JSON back.
- **Schema-aware renderers** — each renderer declares the CV schema it supports. Pick a renderer, then pick one of its compatible output schemas for the prompt. The prompt and validation both use that schema.
- **Multiple renderers** — Classic sidebar (no summary), Classic + Summary, and Impact (per-role skills, Problem / Solution / Outcome projects).
- **Inline editing** — edit text directly in the preview, plus bold/italic/underline, selection font size, global text scale, spacing, margins, and sidebar width.
- **Real PDF export** — a local Node endpoint renders the final CV with headless Chrome and writes a genuine A4 PDF into the project folder. A print-dialog fallback is always available.
- **One place for prompt instructions** — the full prompt template lives in a Markdown config file. Edit the bundled version or save a workspace override from Settings.
- **Local workspace** — each application gets a folder with `project.json`, `cv.json`, `inputs/`, `prompts/`, `responses/`, and the exported PDF.
- **PDR import** — `.docx`, `.md`, `.txt`, or pasted text, with the extracted text editable before it reaches a prompt.
- **Legacy import** — old `cv-studio.html` JSON (schema version 1) can be loaded and migrated.

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
3. Create an application and paste the job description.
4. Generate and copy the prompt, run it through an LLM, and bring the JSON back to **Import**.
5. Validate, apply, tune the CV in **Preview**, and click **Save PDF**.

## PDF export

**Save PDF** posts the standalone CV HTML to the local Node server at `/api/export-pdf`. The server renders it with headless Chrome, returns the PDF bytes, and the browser writes them to:

```
<workspace>/projects/<project-id>/<name>-<company>-cv.pdf
```

This requires `npm run dev` or `npm run preview` (the Node server). If the endpoint is unavailable, or Chrome cannot be launched, CV Studio opens the browser print dialog instead. The **Print** button always uses the print dialog.

The generated PDF is one A4 page. If content is clipped, the Preview stage shows a warning before you export.

## Prompt customization

The canonical template is [`public/config/prompts/cv.md`](public/config/prompts/cv.md). It contains all static instructions, the role, hard rules, quality checklist, and placeholders for the dynamic data.

In **Settings → Prompt template** you can edit the active template. Saving writes an override to:

```
<workspace>/config/cv-prompt.md
```

That override is read at startup. **Use bundled default** removes it. Placeholders use `{{NAME}}` syntax; the full list is shown in Settings.

## Renderers and schemas

Schemas are defined in `src/core/cv/schema.ts`. Renderers declare compatibility in `renderer.js`:

```js
export const meta = {
  apiVersion: 1,
  id: "classic",
  name: "Classic Sidebar",
  schemas: ["classic"],
  // ...
};
```

A renderer may support several schemas, and several renderers may share one schema. The **Prompt** stage only offers schemas supported by the selected renderer. Changing the renderer keeps the current schema if compatible, otherwise it selects the renderer's first schema.

See [docs/renderer-contract.md](docs/renderer-contract.md) for the full renderer API and instructions for generating a new renderer with an LLM.

## Workspace layout

```
<workspace>/
  settings.json
  profiles/default.json
  config/cv-prompt.md            # optional prompt override
  projects/<project-id>/
    project.json                 # job, renderer id, schema id, styles, file index
    cv.json                      # content only
    inputs/job.md
    inputs/instructions.md
    inputs/reference-cv.md
    prompts/latest.md
    responses/latest.raw.txt
    <name>-<company>-cv.pdf
```

The browser only exposes the folder name, not the absolute path.

## Privacy and trust

- There is no backend service and no analytics. Data stays in the selected folder and in browser storage for the folder handle.
- The only data that leaves your machine is what you copy into an LLM.
- Real personal data belongs in the gitignored `local-data/` folder. `examples/` contains only fictional data.
- LLM output is treated as untrusted: it is parsed, repaired if necessary, normalized, and validated against a JSON Schema before it is applied.
- Text fields are HTML-escaped by renderers. Rich text captured from inline editing is sanitized both in the iframe and at render time.
- Renderer modules run as trusted local code, like a plugin. Only run renderers you trust. They must not use the network, storage, or DOM APIs.
- The PDF endpoint only accepts same-origin JSON requests and uses a local headless Chrome instance.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local app and PDF endpoint on port 5173. |
| `npm run build` | Type-check and build the static app into `dist/`. |
| `npm run preview` | Serve the production build on port 5173 with the PDF endpoint. |
| `npm test` | Unit tests for schemas, prompt building, parsing, renderers, and examples. |
| `npm run check:renderers` | Run only the renderer contract checks. |
| `npm run smoke` | End-to-end browser smoke test. Uses system Chrome and an Origin Private File System workspace. |
| `PDF_OUT=/tmp/cv.pdf npm run smoke` | Also write the exported PDF to a file for inspection. |
| `PDR_DOCX=path/to/file.docx npm run smoke` | Also exercise DOCX import. |

## Troubleshooting

**"This browser does not expose the File System Access API"** — use desktop Chrome or Edge.

**Chrome asks for permission again after a restart** — click **Reconnect** on the workspace screen. The handle is remembered, but write permission is not permanent.

**Automatic PDF export falls back to print** — the Node server is not running, or Chrome could not be launched. Run `npm run dev` (or `npm run preview`), install Chrome, or set `CHROME_PATH`.

**PDF has different fonts from the preview** — headless Chrome uses fonts installed on the machine. A font that only exists in your normal browser profile may not be available to headless Chrome.

**Old CV JSON** — use **Preview → Load CV JSON**. Schema version 1 files are migrated, including supported rich-text style data.

## Documentation

- [Architecture](docs/architecture.md)
- [Data model and workspace](docs/data-model.md)
- [Renderer contract](docs/renderer-contract.md)
- [Prompt pipeline](docs/prompt-pipeline.md)
- [Roadmap](docs/roadmap.md)
- [Agent entrypoint](AGENTS.md)

## License

MIT
