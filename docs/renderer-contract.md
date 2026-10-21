# Renderer contract (API v1)

A renderer turns `CvContent` into a single HTML string. The host owns everything else: page shell, editing, formatting, printing, PDF export, overflow detection, and persistence.

Renderers are **pure**: no `document`, `window`, `fetch`, storage, timers, or imports of application state. That makes them testable in Node and safe to generate from a specification.

## Module shape

```text
src/renderers/<id>/
  renderer.js     # meta + css + render
  renderer.css    # imported as a string with ?inline
```

```js
import css from "./renderer.css?inline";

export const meta = {
  apiVersion: 1,
  id: "my-renderer",
  name: "My Renderer",
  description: "One line shown in the UI.",
  schemas: ["classic"],              // at least one known schema id
  page: { width: "210mm", height: "297mm", multiPage: false },
  controls: {
    typeScale: true,                 // show the global text-size control
    spacing: true,                   // show the vertical spacing control
    margins: true,                   // show the page margin control
    sidebar: false,                  // show the sidebar-width control
  },
  sections: ["summary", "education", "skills", "experience", "projects", "custom"],
};

export { css };

export function render(cv, ctx) {
  return `<div class="cv-page" data-cv-page>…</div>`;
}
```

### `meta`

| Field | Meaning |
| --- | --- |
| `apiVersion` | Must be `1`. |
| `id` | Stable kebab-case id. Used in `project.json`, style keys, and the registry. |
| `name` | Human-readable name in the renderer picker. |
| `description` | Short description in the renderer picker. |
| `schemas` | Schema ids this renderer can render. Drives prompt/schema selection. |
| `page` | `width`, `height`, and `multiPage`. Use A4 `210mm` × `297mm` for now. |
| `controls` | Which style controls are meaningful for this renderer. |
| `sections` | Sections the renderer displays. Used for documentation and UI hints. |

A renderer may support several schemas. The host selects the first as the default when the renderer changes and preserves the current schema if it is still compatible.

### `render(cv, ctx)`

- Receives a normalized `CvContent` and a `RenderContext`.
- Must return one HTML string with exactly one page container marked `data-cv-page`.
- Must not include `<script>` tags.
- Must escape all content that is not passed through `ctx.field`.
- Must not add `contenteditable`; the runtime does that.

### `ctx`

| Helper | Use |
| --- | --- |
| `ctx.field(path, value)` | Wrap an editable value. Returns `<span data-field="path">…</span>`, applies saved rich HTML if its plain text still matches, and escapes otherwise. |
| `ctx.esc(value)` | Escape non-editable text (labels, computed strings). |
| `ctx.nl2br(value)` | Escape text and turn newlines into `<br>` for non-editable multi-line values. |

Use `ctx.field` for every value that exists in `cv.json`, including section titles, contact items, skill labels/items, and bullets. Paths must be valid JSON paths into the CV:

```js
ctx.field(`experience.${i}.role`, entry.role)
ctx.field(`experience.${i}.bullets.${j}`, bullet)
ctx.field(`skills.${i}.items.${j}`, item)
ctx.field("sectionTitles.skills", cv.sectionTitles.skills)
ctx.field("basics.contact." + i, item)
ctx.field("summary", cv.summary)
```

When a value is conditionally absent, do not render the wrapper. Example:

```js
${entry.dates ? `<div class="dates">${ctx.field(`experience.${i}.dates`, entry.dates)}</div>` : ""}
```

## Required DOM contract

| Contract | Why |
| --- | --- |
| `<div class="cv-page" data-cv-page>` | The host measures page overflow and prints the document. |
| `data-cv-overflow-watch` on scrollable/clipped columns | The runtime checks `scrollHeight > clientHeight` and raises a warning. |
| `data-field="<json.path>"` via `ctx.field` | Enables inline editing and formatting. |
| No `<script>` | The document is injected into an iframe; scripts are forbidden by the contract. |
| Escaped text | Prevents model output from becoming markup. |

The page element must have fixed A4 dimensions and `overflow: hidden` (or equivalent). The current renderers use:

```css
.cv-page {
  width: 210mm;
  height: 297mm;
  overflow: hidden;
  position: relative;
  background: #fff;
}
```

## CSS variables

The host sets these on `:root` from `CvStyle`:

| Variable | Source | Default |
| --- | --- | --- |
| `--cv-type-scale` | `typeScale` | `1` |
| `--cv-space-scale` | `verticalScale` | `0.65` |
| `--cv-margin` | `marginMm` | `7mm` |
| `--cv-sidebar` | `sidebarMm` | `51mm` |
| `--cv-accent` | `accent` | `#1f6fbf` |

Use them in CSS so the controls work:

```css
.role { font-size: calc(9.8pt * var(--cv-type-scale, 1)); }
.entry { margin-bottom: calc(4mm * var(--cv-space-scale, 0.65)); }
```

If `meta.controls.typeScale` or `spacing` is true, the corresponding variable must appear in the CSS; the contract checker warns otherwise.

## Print rules

Include A4 page rules in the renderer CSS:

```css
@page {
  size: A4;
  margin: 0;
}

@media print {
  .cv-page {
    margin: 0;
    box-shadow: none;
  }
}
```

The base preview CSS resets body padding and page chrome in print media. The PDF path uses `preferCSSPageSize`, so the renderer's `@page` is authoritative.

## Registration

Add the renderer to `src/renderers/registry.ts`:

```ts
import * as myRenderer from "./my-renderer/renderer.js";

export const RENDERERS: RendererModule[] = [
  classic as unknown as RendererModule,
  classicSummary as unknown as RendererModule,
  impact as unknown as RendererModule,
  myRenderer as unknown as RendererModule,
];
```

The first renderer is the fallback for unknown ids. Keep it as a known, working renderer.

## Contract checks

`checkRenderer` in `src/core/render/validateRenderer.ts` is used by tests and the Settings screen. It checks:

- `apiVersion === 1`;
- non-empty `id`, `name`, `schemas`;
- `render` is a function and returns non-empty HTML for every declared schema;
- no `<script>` tags;
- `basics.name` is exposed as an editable field;
- `data-cv-page` exists;
- the sample's `<script>` probe is escaped (`&lt;script&gt;`);
- experience entries are exposed (warning if not);
- controls' CSS variables are present (warnings).

Run:

```bash
npm run check:renderers
npm test
```

## Minimal example

```js
import css from "./renderer.css?inline";

export const meta = {
  apiVersion: 1,
  id: "plain",
  name: "Plain",
  description: "Minimal single-column CV.",
  schemas: ["classic"],
  page: { width: "210mm", height: "297mm", multiPage: false },
  controls: { typeScale: true, spacing: true, margins: true, sidebar: false },
  sections: ["education", "skills", "experience", "projects", "custom"],
};

export { css };

export function render(cv, ctx) {
  const { field } = ctx;
  return `<div class="cv-page" data-cv-page>
    <header>
      <h1>${field("basics.name", cv.basics.name)}</h1>
      ${cv.basics.headline ? `<p>${field("basics.headline", cv.basics.headline)}</p>` : ""}
      <p>${cv.basics.contact
        .map((item, i) => field(`basics.contact.${i}`, item))
        .join(" · ")}</p>
    </header>
    <main data-cv-overflow-watch>
      <h2>${field("sectionTitles.experience", cv.sectionTitles.experience)}</h2>
      ${cv.experience
        .map(
          (entry, i) => `<article>
            <h3>${field(`experience.${i}.role`, entry.role)}</h3>
            <div>${entry.org ? field(`experience.${i}.org`, entry.org) : ""}</div>
            <div>${entry.dates ? field(`experience.${i}.dates`, entry.dates) : ""}</div>
            <ul>${entry.bullets
              .map((bullet, j) => `<li>${field(`experience.${i}.bullets.${j}`, bullet)}</li>`)
              .join("")}</ul>
          </article>`,
        )
        .join("")}
    </main>
  </div>`;
}
```

## Generating a renderer with an LLM

Use a prompt like:

```text
You are writing a CV renderer for CV Studio API v1.
Read the contract below. Do not use document, window, fetch, storage, timers, or <script>.
Return exactly two files: renderer.js and renderer.css.

Target schema: <classic | classic-summary | impact>.
Include every field the schema provides; omit nothing silently.
Use ctx.field(path, value) for every editable value and ctx.esc for fixed text.
Use the CSS variables --cv-type-scale, --cv-space-scale, --cv-margin,
--cv-sidebar, and --cv-accent. Keep one A4 page.
[include this entire document]
[include the chosen JSON Schema and one existing renderer as a reference]
```

Then:

1. Save the files under `src/renderers/<id>/`.
2. Set `meta.id` and `meta.schemas`.
3. Register it.
4. Run `npm run check:renderers`, `npm test`, `npm run build`.
5. Load the provided example CV JSON in Preview and inspect the PDF.
6. Check overflow and inline editing manually; contract checks are necessary but not sufficient.

Do not paste real PII into an external LLM when generating a renderer. Use the fictional examples in `examples/`.

## Common pitfalls

- **Using raw values in the template:** model output could contain `<script>`. Always use `ctx.field` for CV values or `ctx.esc` for fixed strings.
- **Putting `contenteditable` in the renderer:** editing is a host concern; duplicates and state will break.
- **Adding a summary to `classic`:** the classic schema forbids it. Use `classic-summary` or `impact`.
- **Reading `entry.bullets` in `impact`:** impact projects use `problem` / `solution` / `outcome`; classic projects use bullets. Branch on the schema or write a renderer for one schema.
- **Hard-coding font sizes without `--cv-type-scale`:** the text-size control will not work.
- **Hard-coding spacing without `--cv-space-scale`:** the spacing control will not work.
- **Using viewport units or `100vh`:** the page must be a fixed A4 document, not a responsive web page.
- **Hiding overflow without `data-cv-overflow-watch`:** the user loses the warning that content is clipped.
- **Remote assets:** no network at render/print time. Use system fonts and inline CSS.
