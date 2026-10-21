# Roadmap and extension notes

This is a working list, not a promise. The core loop (profile → prompt → JSON → validate → edit → PDF) is complete. These are the highest-value next steps.

## 1. Project management

- Delete a project with confirmation, including its folder.
- Rename an application without changing its folder id.
- Duplicate a project as a starting point for a related role.
- Sort/filter by updated date, company, or renderer.
- Restore the last view (project vs. dashboard) instead of always reopening the last project.

## 2. Prompt and response history

Currently `prompts/latest.md` and `responses/latest.raw.txt` are overwritten. Add:

```
prompts/2026-10-21T16-00-00.md
responses/2026-10-21T16-00-00.raw.txt
```

with a manifest in `project.json`. Benefits: compare model outputs, roll back a bad response, audit which prompt produced which CV. Add a small history list in the Prompt/Import stages. Do not store API keys in project files.

## 3. Presets and additional document types

The current stage is CV-only. Introduce a `presets/` or `documents/` registry with one entry per output:

| Preset | Inputs | Output |
| --- | --- | --- |
| Tailored CV | PDR, job, reference CV, schema | `cv.json` |
| Cover letter | PDR, job, CV, tone | short Markdown or JSON |
| Recruiter email | PDR, job, CV, tone | subject + body |
| LinkedIn message | PDR, job, CV, tone | short message |
| Follow-up | prior message, job | short message |

Design constraints:

- One Markdown template per preset under `public/config/prompts/`.
- A single editor in Settings that lists templates and edits the active one.
- Presets declare which inputs are required; the UI can hide irrelevant ones.
- Each preset has its own validator. Reuse the same parse/repair pipeline.
- Keep a project able to hold CV + letter outputs without mixing schemas.

Do not put cover-letter instructions into `cv.md`; a user editing their CV prompt should not accidentally change their email prompt.

## 4. Automatic LLM integration (optional)

The copy/paste flow is intentional: it works with any model, keeps keys out of the app, and makes the prompt auditable. If adding direct calls:

- Implement provider adapters behind a local server endpoint (`/api/llm`), not in renderer code.
- Keep secrets out of `localStorage` if possible. Prefer an OS keychain or an environment variable read by the local server; if the app must store a key, make that explicit and never write it into the workspace or git.
- Never log prompts, responses, or keys by default. Prompts contain PII.
- Preserve the manual path: the generated prompt should still be copyable, and pasted responses should still be importable.
- Stream or return raw text, then run the same `parseLlmResponse` and `validateCv`.
- Add a per-provider model picker and a clear “send data to this provider” confirmation.
- Do not auto-apply model output; keep the validation/apply step.

A server-side proxy is strongly preferred over browser `fetch` to providers, both for key handling and to avoid CORS/provider restrictions.

## 5. More renderers

Ideas:

- A compact one-column ATS renderer.
- A two-column academic CV (multi-page).
- A portfolio/impact renderer with a project grid.
- A conservative regional variant (US/DE/EU conventions).
- A renderer that supports both classic and impact schemas with different section treatments.

Every renderer must pass `checkRenderer`, declare schemas honestly, and preserve inline editing. Use `docs/renderer-contract.md` as the generation contract. Do not load remote renderer code.

## 6. Multi-page support

The current page is fixed A4 with `overflow: hidden`; clipping is detected but not paginated. Multi-page needs:

- a pagination model in the renderer contract (page containers, repeated headers, break rules);
- runtime overflow handling across pages;
- PDF page-break CSS (`break-inside: avoid` for entries);
- preview pagination UI and page count;
- style controls that still make sense across pages;
- schema limits or guidance that adapt to page count.

This is a larger architectural change; do not fake it by letting `.cv-page` grow beyond 297 mm because the PDF path assumes fixed pages.

## 7. PDF and export improvements

- A direct “Download PDF” as well as “write to project folder”.
- Show the actual path/name after export (already shown by filename).
- Keep a small export history (`exports/<timestamp>.pdf`) if users iterate.
- Optional DOCX export through a local converter, clearly marked as lower fidelity.
- PDF metadata (title/author) from the profile.
- Font embedding/selection for consistent output across machines.
- A preflight report: page count, clipped containers, missing contact fields, schema warnings.

The current implementation requires the local Node server for automatic export. A static deployment falls back to the print dialog; document this clearly if hosting changes.

## 8. Reliability and tests

- Add a Playwright test for the legacy CV JSON migration path in the browser.
- Test the `classic-summary` renderer with the `classic` schema in the smoke flow.
- Test impact response import and PSO rendering end-to-end.
- Add visual regression snapshots of rendered pages (careful: do not commit real PII).
- Test a clipped CV and assert the overflow warning.
- Test reset-to-bundled prompt and workspace override precedence.
- Add a test for schema switching: impact fields survive a classic round trip.
- Add a test that `project.json` never contains `cv` content in a future refactor (the smoke test already asserts it).

## 9. Privacy and trust

- Keep `local-data/` gitignored and never include it in examples, screenshots, tests, or issues.
- Consider a “clear local cache” action for the IndexedDB handle.
- Add a warning before copying a prompt that contains PII (already noted in the UI).
- If telemetry is ever added, make it opt-in and never send CV content.
- Keep the PDF endpoint same-origin and local.

## 10. UX polish

- A global default renderer/schema setting.
- Better empty states that link directly to Profile/import.
- Keyboard shortcuts for copy/regenerate/apply.
- A “duplicate last CV” action for a new application.
- A side-by-side prompt diff when inputs change.
- A field-path inspector for renderer authors.
- A renderer preview gallery using fictional example data.
