# Prompt pipeline

The product deliberately uses **one prompt per CV** rather than a chain of hidden model calls. The prompt contains the role, task, absolute rules, profile basics, PDR, reference CV, target job, extra instructions, the selected JSON Schema, schema-specific notes, a quality checklist, and metadata. The user copies it to any LLM and pastes the JSON back.

## Files

| File | Role |
| --- | --- |
| `public/config/prompts/cv.md` | Canonical bundled template. All static instructions live here. |
| `<workspace>/config/cv-prompt.md` | Optional workspace override. Read at startup, edited in Settings. |
| `src/core/prompt/builder.ts` | Loads the template, substitutes placeholders, estimates tokens, warns about missing inputs. |
| `src/core/cv/schema.ts` | Supplies `SCHEMA_JSON`, `SCHEMA_NAME`, `SCHEMA_ID`, and `SCHEMA_NOTES`. |
| `src/core/llm/parseResponse.ts` | Extracts the first balanced JSON object from fences/prose and repairs malformed JSON. |

The override is read in `App.tsx` when a workspace is hydrated. If it exists, it wins over the bundled file. **Use bundled default** removes it. The bundled file is fetched with `cache: "no-cache"` so development edits are picked up.

## Placeholders

`buildCvPrompt` replaces `{{UPPER_SNAKE}}` tokens. Unknown tokens remain literally in the prompt, which makes template typos visible.

| Placeholder | Value |
| --- | --- |
| `{{BASICS}}` | Name, optional headline, and contact joined with `·`, or “(not provided)”. |
| `{{PDR}}` | Profile PDR Markdown, or a “no PDR imported” note. |
| `{{REFERENCE_CV}}` | Per-project reference CV, or a “no reference CV” note. |
| `{{JOB_TITLE}}` | Target title, or “(not provided)”. |
| `{{COMPANY}}` | Target company, or “(not provided)”. |
| `{{JOB_DESCRIPTION}}` | Full job posting, or a “tailor only to title/company” note. |
| `{{EXTRA_INSTRUCTIONS}}` | Project instructions followed by profile default instructions, or “(No extra instructions.)”. |
| `{{SCHEMA_NAME}}` | Human-readable schema name. |
| `{{SCHEMA_ID}}` | Schema id (`classic`, `classic-summary`, `impact`). |
| `{{SCHEMA_JSON}}` | Pretty-printed JSON Schema for the selected schema. |
| `{{SCHEMA_NOTES}}` | Schema-specific writing rules from `promptNotes`. |
| `{{PROMPT_VERSION}}` | `PROMPT_VERSION` from `builder.ts`, currently a date-based string. |
| `{{DATE}}` | UTC date (`YYYY-MM-DD`) at generation time. |

There is no `{{SUMMARY}}`; the summary requirement is part of the schema and notes.

## Stages

The UI exposes four stages per project:

1. **Apply** — job title, company, job description, extra instructions, reference CV. These are saved as `inputs/*.md` and used by the prompt.
2. **Prompt** — renderer/schema selection, generated prompt, warnings, token estimate, copy/regenerate/save. The prompt is saved to `prompts/latest.md`.
3. **Import** — paste or load the raw LLM response. Parse, validate, apply. The raw response is saved to `responses/latest.raw.txt`.
4. **Preview** — render, inline-edit, tune style, print, export PDF.

Only the Prompt stage builds a prompt. The Import stage's parser and validator never call an LLM.

## Schema selection

The Prompt stage has:

- **Renderer** — all registered renderers.
- **Output schema for this prompt** — only `renderer.meta.schemas`.

Changing the renderer keeps the schema if it is still compatible; otherwise it selects the renderer's first schema. The schema is stored on `project.schemaId`, so the prompt, validation, and preview all agree.

Examples:

- Classic Sidebar → only `classic` (no summary).
- Classic + Summary → `classic-summary` or `classic`.
- Impact → only `impact` (summary, per-role skills, PSO projects).

This is why the schema selector is not a global list: a renderer that does not understand summary or PSO fields should not be offered a schema that requires them.

## Generation flow

```ts
const schema = getSchema(project.schemaId);
const prompt = buildCvPrompt({ profile, project, schema, template });
```

`buildCvPrompt` is a pure function. `PromptStage` memoizes it from `profile`, `project`, `schema`, and `template` and stores a draft. The draft is initialized from the saved prompt if one exists; otherwise from the generated prompt. The stage shows a stale badge when the current generated prompt differs from the baseline, which happens after the user edits job inputs, changes schema/renderer, or changes the template.

## Parsing and validation

`parseLlmResponse`:

1. trims and removes a BOM;
2. unwraps a single leading/trailing Markdown fence (with or without `json`);
3. finds the first `{` and scans for the matching close brace, respecting strings and escapes;
4. `JSON.parse`;
5. if that fails, `jsonrepair` and parse again;
6. reports `repaired` so the UI can warn the user.

Then `validateCv(value, project.schemaId)` normalizes and validates against the same JSON Schema shown to the model. A parse success is not enough; the user sees:

- **Schema valid** or a list of JSON-pointer errors;
- warnings;
- a content summary (experience/project/skill counts, bullets, summary length).

**Apply to CV** is disabled until validation passes. It writes the normalized content to `project.cv` and advances to Preview.

## Prompt quality rules

The bundled template enforces:

- JSON only, no fences or commentary;
- facts only from basics + PDR; reference CV is tone/structure only;
- exact names, contact details, employers, dates, qualifications;
- no invented metrics, technologies, responsibilities, or achievements;
- relevance-based selection and ordering;
- action/result bullets, no first-person, no “Responsible for”;
- job-description terminology only when genuinely supported;
- one A4 page and schema limits;
- no extra fields, no array wrapper;
- date format and empty-string fallback.

Schema-specific rules add summary requirements and impact-specific skills/PSO requirements.

## Editing the template safely

- Keep all placeholders listed above if you want the pipeline to remain generic. Removing one is fine if you intentionally hard-code that input elsewhere, but update this document and `tests/prompt.test.ts`.
- Keep the “JSON only” and “facts only” rules; the parser can recover from fences, but the validator cannot recover from invented facts.
- Do not put dynamic data directly in TypeScript string literals; use placeholders.
- Keep `SCHEMA_JSON` in the prompt. It is the model's contract and the validator's contract, generated from one definition.
- Use Settings or the workspace file for changes that should apply to one user; edit the bundled file for changes that should ship as defaults.

## Token estimate

`estimateTokens` is a rough `length / 4`. It is shown for cost/context awareness, not as a hard limit. The PDR and job description dominate the prompt size.

## Persistence

- Prompt text is saved on Copy, Regenerate, or **Save prompt to project**.
- The generated prompt is not automatically saved when inputs change; the stale badge tells the user to regenerate.
- The latest prompt and response file paths are recorded in `project.json` (`files.prompt`, `files.response`).
- `PROMPT_VERSION` is stored in `project.json` for traceability. It is not used to invalidate saved prompts automatically.

## Adding another document type

The CV is currently the only prompt/preset. The intended pattern for cover letters, outreach emails, and LinkedIn messages is:

1. Add `public/config/prompts/<type>.md` with a self-contained instruction set.
2. Add a preset definition describing required inputs and the output schema.
3. Add a parser/validator for that output type (or reuse JSON Schema + Ajv).
4. Add a project tab or output selector; keep the template lookup in one place.

Do not overload `cv.md` with unrelated document instructions. One template per output type keeps each prompt auditable and lets users edit one file per task.
