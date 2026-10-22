# Data model and workspace

CV Studio separates **what the CV says** (`cv.json`) from **what the applied messages say** (`deliverables/`), from **how the CV is shown** (`project.json` styles), and from **what the prompt asked for** (`prompts/latest.md` + deliverable selection + schema id). This is deliberate: re-rendering, restyling, or switching renderers must never mutate the candidate's content, and saving a message must never duplicate its text into project configuration.

## Workspace layout

```
<chosen folder>/
  settings.json
  profiles/
    default.json
  config/
    prompts/                   # per-template overrides, created by initializeWorkspace
      context.md               # optional
      cv.md                    # optional
      cover-letter.md          # optional
      cold-email.md            # optional
      linkedin-message.md      # optional
    cv-prompt.legacy.md        # archived single-file override, if one existed
  projects/
    <project-id>/
      project.json             # configuration, deliverables, file index
      cv.json                  # CvContent, the only CV content source
      deliverables/
        cover-letter.md        # raw Markdown
        cold-email.json        # { subject, body }
        linkedin-message.txt   # plain text
      inputs/
        job.md
        instructions.md        # shared instructions mirror
        reference-cv.md
      prompts/
        latest.md
      responses/
        latest.raw.txt
      <name>-<company>-cv.pdf
```

The project id is a slug of `<company-or-title-or-recipient>-<YYYY-MM-DD>` with a numeric suffix on collision. It is stable for the life of the folder. `initializeWorkspace` creates `projects/`, `profiles/`, and `config/prompts/`, plus `settings.json` and `profiles/default.json` if missing.

Deliverable content is written to `deliverables/`; `project.json` records only the relative file paths. A cleared artifact is removed from the folder (and from the file index) on the next save.

## Project schema version 2

`project.json` is a persisted `Project` record without in-memory content. The version-2 shape is:

```ts
interface Project {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  job: {
    title: string;
    company: string;
    description: string;
    sharedInstructions: string;
    referenceCv: string;
  };
  rendererId: string;
  schemaId: string;
  styles: Record<string, CvStyle>;
  promptVersion: string;
  deliverables: {
    selected: DeliverableId[];
    settings: Record<DeliverableId, DeliverableSettings>;
  };
  files: {
    prompt?: string;
    response?: string;
    cv?: string;
    coverLetter?: string;
    coldEmail?: string;
    linkedinMessage?: string;
  };
}
```

`DeliverableId` is `cv | coverLetter | coldEmail | linkedinMessage`. `DeliverableSettings` holds `instructions` for every deliverable and an optional `recipient` for `coldEmail` and `linkedinMessage` only. A recipient has `name`, `role`, `company`, `profileUrl`, `about`, `posts`, `relationship`, and `intent`.

The in-memory `Project` type also carries `cv`, `promptText`, `rawResponse`, and `artifacts`. `saveProject` deliberately excludes those fields from `project.json`:

- `cv` is written to `cv.json`.
- `promptText` is written to `prompts/latest.md`.
- `rawResponse` is written to `responses/latest.raw.txt`.
- `artifacts` are written to `deliverables/`.

### Deliverable selection and settings

- `selected` is persisted in canonical order: `cv`, `coverLetter`, `coldEmail`, `linkedinMessage`.
- Missing, empty, or entirely unknown selections normalize to `["cv"]`; unknown ids and duplicates are dropped.
- New projects default to `["cv"]`. The New Project modal and Target stage let the user choose any combination, but the UI never allows the last selected deliverable to be unchecked. The builder also rejects an empty selection.
- `job.sharedInstructions` applies to every selected deliverable. `profile.defaultInstructions` is appended to it. Per-deliverable `settings[id].instructions` are additive and appear only in that task's template.
- Recipient records are initialized for both cold email and LinkedIn even when only one is selected. A recipient entered at project creation pre-fills both.
- A message-only project still keeps a valid default renderer and CV schema so the CV can be added later. The renderer/schema controls are hidden while the CV is not selected.

### Artifacts

The CV artifact remains `Project.cv` and `cv.json`. Message artifacts are:

| Deliverable | In-memory shape | File |
| --- | --- | --- |
| Cover letter | `string` | `deliverables/cover-letter.md` |
| Cold email | `{ subject: string; body: string }` | `deliverables/cold-email.json` |
| LinkedIn message | `string` | `deliverables/linkedin-message.txt` |

Applying a message writes `project.artifacts[id]` and stays on the Response stage; the next autosave writes its file. Clearing asks for confirmation, deletes the artifact, and removes its file and index entry on the next save. Other artifacts are untouched. The CV and messages are applied independently, so one bad part does not block the rest.

`inputs/instructions.md` mirrors `job.sharedInstructions`. There are no input-file mirrors for per-deliverable instructions or recipient context: `project.json` and `prompts/latest.md` are the record.

## Deliverable schemas and limits

Message schemas live in `src/core/deliverables/schema.ts` and are used both in the prompt and at runtime.

| Deliverable | Shape | Required | Hard limits | Advisory warnings |
| --- | --- | --- | --- | --- |
| Cover letter | string | non-empty | ≤ 6,000 chars | warn below 800 or above 5,000; target 250–400 words |
| Cold email | `{ subject, body }` | both non-empty | subject ≤ 160, body ≤ 4,000 | warn subject above 100; body below 300 or above 2,500 |
| LinkedIn message | string | non-empty | ≤ 2,000 chars | warn below 300 (looks like a connection note) or above 1,200 |

The CV keeps its existing schemas, limits, and warnings below. The selected CV schema is only used when `cv` is selected; message-only prompts contain no CV schema.

## Envelope and the CV-only special case

`buildEnvelopeSchema(selection, cvSchema)` composes one JSON Schema from the same per-deliverable definitions:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Application deliverables response",
  "type": "object",
  "additionalProperties": false,
  "required": ["cv", "coverLetter"],
  "properties": {
    "cv": { "...selected CV schema..." },
    "coverLetter": { "type": "string", "minLength": 1, "maxLength": 6000 }
  }
}
```

Rules:

- **CV-only request:** the model returns today's bare CV object. The Response stage accepts a bare CV or an envelope with a `cv` key.
- **Any other selection:** the model returns one envelope with only the requested keys, in canonical order. `coverLetter` and `linkedinMessage` are strings; `coldEmail` is `{ subject, body }`; `cv` is the selected CV schema object.
- **Bare CV for a multi-deliverable request:** if the CV was requested, the bare object is treated as the CV and the other requested deliverables are reported missing on their own cards.
- **Unrequested keys:** present but unrequested keys are ignored with a warning and get no card.
- **Missing requested keys:** each missing key is an error on that deliverable's card only.

`splitResponseForSelection` interprets the parsed object; `normalizeCoverLetter`, `normalizeColdEmail`, and `normalizeLinkedinMessage` trim and coerce message values; each deliverable is then validated independently.

## Core CV types

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

`src/core/cv/schema.ts` is the single source of truth for the CV JSON Schema shown to the LLM, runtime validation, and renderer compatibility.

| Schema id | Summary | Per-role skills | Projects | Renderers |
| --- | --- | --- | --- | --- |
| `classic` | no | no | bullets | Classic Sidebar |
| `classic-summary` | yes | no | bullets | Classic + Summary |
| `impact` | yes | yes | Problem / Solution / Outcome | Impact |

`classic-summary` supports both `classic-summary` and `classic` schemas, so the schema selector is meaningful for that renderer. A schema can be supported by any number of renderers.

### CV limits

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

`validateCv(cv, schemaId)` runs Ajv against the same schema and returns `{valid, data, errors, warnings}`. Warnings are advisory (for example, missing optional contact details); errors block applying the response.

For messages, `validateCoverLetter`, `validateColdEmail`, and `validateLinkedinMessage` trim/normalize first, validate against the message schema, and add advisory warnings from the limits table. `validateMessageDeliverable(id, value)` dispatches to the right validator. Results are per deliverable, so one invalid letter does not mask a valid CV or email.

The Response stage applies normalization before validation, so an LLM response with harmless extra fields can still pass. A response that violates required fields, array limits, or lengths is rejected with JSON-pointer paths on the affected card.

## Version-1 migration

`normalizeProjectRecord(value, fallbacks)` upgrades an older `project.json`:

- `job.instructions` becomes `job.sharedInstructions`. An explicit `sharedInstructions` wins even when empty, so a migrated project that the user cleared does not resurrect the old text.
- The record is written back as `schemaVersion: 2`.
- Missing deliverable data becomes `selected: ["cv"]` with default empty settings; no artifacts are created.
- Missing `files` entries are filled only for `cv` (`cv.json`); prompt, response, and message paths stay absent until the corresponding file exists.
- Unknown selection ids and duplicate entries are dropped; an entirely empty or unknown selection falls back to `["cv"]`.
- `loadProject` accepts version 1, reads the CV from `cv.json` (or the old inline `cv` field in `project.json`), and treats missing prompt/response/artifact files as empty state.
- `inputs/instructions.md` is a mirror of `job.sharedInstructions`, not a separate source of truth.

The old single-file prompt override is handled separately by `archiveLegacyPromptOverride`: `config/cv-prompt.md` is copied to `config/cv-prompt.legacy.md` (timestamped suffix on collision), the original is removed only after a successful write, and a failed write leaves the original in place. The archive is not an active template. See `docs/prompt-pipeline.md`.

## Editing and field paths

Editable CV values use JSON paths rooted at `CvContent`:

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

Messages are not CV fields. The Response stage edits plain textareas, validates the draft, and saves the artifact; there is no renderer inline editing or rich-text model for messages.

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

The PDR is stored as Markdown after import. `.docx` goes through Mammoth (to HTML) and Turndown (to Markdown); the text area remains editable. Editing imported text keeps its source metadata (`sourceName`, `sourceKind`, `importedAt`) so provenance is not lost; typing into an empty PDR records `sourceName: "Pasted text"` and `sourceKind: "pasted"` on the first non-empty edit. `defaultInstructions` are appended to the shared instructions and therefore apply to every deliverable.

## Settings file

```json
{
  "schemaVersion": 1,
  "defaultRendererId": "classic",
  "lastProjectId": "acme-2026-10-21"
}
```

`lastProjectId` is used to reopen the last project on boot. It is not a content backup. The renderer/schema and deliverable selection remain per project.

## File index

`project.json` records relative paths for the latest prompt/response, `cv.json`, and any applied message artifacts. `saveProject` always writes the known artifact files and updates the index. `loadProject` treats missing files as empty state and ignores stale index entries. `project.json` intentionally excludes `cv`, `artifacts`, `promptText`, and `rawResponse`; older project files that still contain a `cv` field are read from `cv.json` and the extra field is ignored.
