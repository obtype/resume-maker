# Data model and workspace

CV Studio separates **what the CV says** (`cv.json`) from **how it is shown** (`project.json` styles) and from **what the prompt asked for** (`prompts/latest.md` + schema id). This is deliberate: re-rendering, restyling, or switching renderers must never mutate the candidate's content.

## Workspace layout

```
<chosen folder>/
  settings.json
  profiles/
    default.json
  config/
    cv-prompt.md              # optional; created when the user saves an override
  projects/
    <project-id>/
      project.json            # configuration + file index, no CV content
      cv.json                 # CvContent, the only content source
      inputs/
        job.md
        instructions.md
        reference-cv.md
      prompts/
        latest.md
      responses/
        latest.raw.txt
      <name>-<company>-cv.pdf
```

The project id is a slug of `<company-or-title>-<YYYY-MM-DD>` with a numeric suffix on collision. It is stable for the life of the folder.

## Core types

Defined in `src/core/cv/types.ts`:

```ts
interface CvContent {
  schemaVersion: number;       // 2
  basics: Basics;
  summary?: string;            // only classic-summary / impact
  sectionTitles: SectionTitles;
  education: EducationEntry[];
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  custom: ExperienceEntry[];
}
```

`ProjectEntry` intentionally holds both classic bullets and impact Problem / Solution / Outcome fields. The selected schema determines which shape is normalized and validated. `ExperienceEntry.skills` is only kept for the `impact` schema.

`CvStyle` is renderer-facing and lives in `project.json`:

```ts
interface CvStyle {
  typeScale: number;       // 0.7 - 1.5
  verticalScale: number;   // 0.4 - 1.1
  marginMm: number;        // 3 - 11
  sidebarMm: number;       // 42 - 65
  accent: string;
  fieldHtml: Record<string, string>; // JSON path -> sanitized HTML
  fieldText: Record<string, string>; // JSON path -> plain text drift guard
}
```

`project.json` contains `styles: Record<rendererId, CvStyle>` so switching renderers does not discard another renderer's tuning.

## Schema registry

`src/core/cv/schema.ts` is the single source of truth for the JSON Schema shown to the LLM, runtime validation, and renderer compatibility.

| Schema id | Summary | Per-role skills | Projects | Renderers |
| --- | --- | --- | --- | --- |
| `classic` | no | no | bullets | Classic Sidebar |
| `classic-summary` | yes | no | bullets | Classic + Summary |
| `impact` | yes | yes | Problem / Solution / Outcome | Impact |

`classic-summary` supports both `classic-summary` and `classic` schemas, so the schema selector is meaningful for that renderer. A schema can be supported by any number of renderers.

### Limits

| Field | Limit |
| --- | --- |
| `basics.name` | 1–80 chars |
| `basics.headline` | ≤ 120 |
| `basics.contact` | 1–7 items, each 1–120 |
| `summary` | 1–600 (schemas with summary) |
| `sectionTitles.*` | ≤ 40 |
| `education` | 1–3 entries; degree/school 1–140; meta ≤ 220 |
| `skills` | 1–6 groups; label 1–50; 1–12 items each 1–50 |
| `experience` | 1–4 entries; role 1–100; dates ≤ 60; org ≤ 140; blurb ≤ 240; 1–5 bullets ≤ 320 |
| `experience[].skills` | impact only; 1–10 items each 1–40 |
| `projects` | 0–3; role 1–120; dates ≤ 60; org ≤ 140; blurb ≤ 240; classic 1–4 bullets ≤ 320 |
| `projects[].problem/solution/outcome` | impact only; 1–500 each |
| `custom` | 0–4; same shape as experience without `skills` |

`sectionTitles` always has `education`, `skills`, `experience`, `projects`, and `custom`; `summary` is present but only used by summary renderers. `projects` and `custom` are required arrays and may be empty. `education`, `skills`, and `experience` must contain at least one entry.

## Normalization and validation

`normalizeCv(value, schemaId)` in `src/core/cv/normalize.ts`:

- builds a fresh object with `schemaVersion: 2`;
- trims strings and coerces numbers/booleans to strings;
- accepts arrays and newline/semicolon-separated strings for list fields;
- keeps only fields allowed by the selected schema (drops unknown model output);
- supplies default section titles;
- adds `summary` only for summary schemas;
- adds `skills` to experience and PSO fields to projects only for `impact`.

Loading `cv.json` from disk uses `normalizeStoredCv`, a superset normalization that preserves every schema-supported field (`summary`, per-role `skills`, and project `problem`/`solution`/`outcome`) even when the project's current renderer/schema does not use them. This means switching renderers or schemas is non-destructive: a classic-shaped CV opened with the impact schema keeps its content and simply shows empty impact-only fields until a new response is imported. Applying a validated LLM response is the explicit point where content is replaced with the selected schema's normalized shape.

`validateCv(cv, schemaId)` then runs Ajv against the same schema and returns `{valid, data, errors, warnings}`. Warnings are advisory (for example, missing optional contact details); errors block applying the response.

The Import stage applies normalization before validation, so an LLM response with harmless extra fields can still pass. A response that violates required fields, array limits, or lengths is rejected with JSON-pointer paths.

## Migration

`migrateCv(value, schemaId)` accepts:

- current `cv.json` content (`schemaVersion: 2`);
- the old cv-studio JSON format (`schemaVersion: 1`) with embedded `style`, `fieldHtml`, `fieldText`, `globalScale`, `bodyFontSize`, `verticalScale`, `marginMm`, and `sidebarWidth`.

Legacy files are normalized as `classic` content, and supported style values are mapped into `CvStyle`. The old field HTML is retained for paths whose plain text still matches. On import, legacy style is merged into the current renderer's style; importing a current CV JSON does **not** reset the user's existing style.

## Editing and field paths

Editable values use JSON paths rooted at `CvContent`:

```
basics.name
basics.headline
basics.contact.0
sectionTitles.experience
summary
education.0.degree
skills.1.items.2
experience.0.role
experience.0.bullets.3
projects.0.outcome
custom.0.bullets.1
```

`src/core/cv/paths.ts` reads and writes those paths. The runtime posts plain text plus sanitized HTML; the host updates the content and stores formatting under the same path. On render, formatting is used only when `fieldText[path]` still equals the current plain text. This prevents stale bold/italic ranges from surviving a content change.

## Legacy style mapping

| Old value | New `CvStyle` |
| --- | --- |
| `globalScale` | `typeScale` |
| `bodyFontSize` (default `8.5pt`) | multiplied into `typeScale` |
| `verticalScale` | `verticalScale` |
| `marginMm` / `margins` (`compact`, `default`, `wide`) | `marginMm` (5 / 7 / 9) |
| `sidebarWidth` (`51mm`) | `sidebarMm` |
| `fieldHtml` / `fieldText` | sanitized `fieldHtml` / drift-guard `fieldText` |

## Profile file

`profiles/default.json`:

```json
{
  "schemaVersion": 1,
  "id": "default",
  "basics": { "name": "…", "headline": "…", "contact": ["…"] },
  "pdr": {
    "sourceName": "…",
    "sourceKind": "docx | md | txt | pasted | none",
    "importedAt": "ISO date",
    "markdown": "…"
  },
  "sectionTitles": { "summary": "Profile", "education": "Education", "…": "…" },
  "defaultInstructions": "…"
}
```

The PDR is stored as Markdown after import. `.docx` goes through Mammoth (to HTML) and Turndown (to Markdown); the text area remains editable. Editing imported text keeps its source metadata (`sourceName`, `sourceKind`, `importedAt`) so provenance is not lost; typing into an empty PDR records `sourceName: "Pasted text"` and `sourceKind: "pasted"` on the first non-empty edit.

## Settings file

```json
{
  "schemaVersion": 1,
  "defaultRendererId": "classic",
  "lastProjectId": "acme-2026-10-21"
}
```

`lastProjectId` is used to reopen the last project on boot. It is not a content backup.

## File index

`project.json` records relative paths for the latest prompt/response and `cv.json`, but `saveProject` always writes those known files. `loadProject` treats missing files as empty state and ignores stale index entries. `project.json` intentionally excludes `cv` now; older project files that still contain a `cv` field are read from `cv.json` and the extra field is ignored.
