# 01: Fetch a posting into the Target stage

**What to build:** A user with the career-ops extractor configured in Settings opens an existing project, pastes a supported posting URL on the Target stage, and watches the job title, company, description and a clickable source link fill in — without retyping anything and without any model call. Only empty fields are written. The result is indistinguishable from having pasted the text by hand, except that the project now remembers which posting it came from.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] A career-ops directory can be set in Settings, survives a reload, and leaving it empty disables fetching while leaving manual pasting available.
- [x] The directory resolution order is per-request value, then workspace setting, then environment variable, then not configured.
- [x] Pasting a supported posting URL on an existing project's Target stage and fetching fills the title, company and description where those fields are empty or whitespace-only.
- [x] The company is derived from the URL when the page does not supply one, and is left empty rather than guessed when the host is not a recognised board.
- [x] The posting URL is stored on the project, survives a reload, and renders as a clickable link.
- [x] A fetch never modifies shared instructions, per-deliverable instructions, CV content, applied messages, renderer choice, or styles.
- [x] A result with an empty or whitespace-only description is rejected as a failed fetch and never stored as an empty job.
- [x] The success response reports the recognised applicant tracking system and the description's character count.
- [x] The route is same-origin like PDF export, rejects anything that is not an `http(s)` URL server-side, and passes the URL to the extractor as an argv element without a shell.
- [x] Extractor stdout is capped, and exceeding the cap fails the request rather than returning a truncated success.
- [x] The fetch budget defaults to four minutes, is overridable through an environment variable, is passed to the extractor, and is enforced as a hard kill after a short grace period.
- [x] Unit tests cover the pure module (normalise and validate a result, derive a company, merge into an empty job) and the server module (success, timeout, missing directory) through the injected runner, with no Chromium and no network.
- [x] The smoke test uses a fixture extractor to prove the Target-stage happy path offline.
- [x] PDF export still works through the shared middleware guard.
- [x] No new runtime dependencies; `npm test` and `npm run build` pass.

## Comments

> *Implementation report, appended after verification.*

### What landed

- A pure `src/core/job/target.ts` (no I/O): normalise and validate an extractor result, derive a company from a posting URL, detect deny-listed sources, merge a target into a `ProjectJob` under a replace flag, and build non-blocking warnings.
- A server `server/job-fetch.ts` with an injectable `ExtractorRunner` and injectable filesystem: directory resolution, validation, spawn with `shell: false`, stdout cap, budget plus grace hard kill, and the full error-code set.
- A shared `server/request-guard.ts` (same origin, POST, JSON, bounded body) used by both `/api/export-pdf` and the new `/api/fetch-job`, registered by one Vite plugin.
- `src/core/job/client.ts`, mirroring the PDF client: one POST, no retry, no caching.
- `Settings.careerOpsDir` (additive, no schema bump, written through on change) and the Settings "Job intake" panel.
- `ProjectJob.sourceUrl`, normalised on load so it survives a reload, rendered as a clickable line under the job fields.
- The Target-stage fetch bar: URL input, fetch button, status line, description character count, warnings, and the unconfigured note with a link to Settings.

### Verification

| Check | Result |
| --- | --- |
| `npm test` | 236 passed, 13 files (89 new job tests across 3 files) |
| `npm run build` | passed (`tsc -b` + `vite build`) |
| `npm run smoke` | passed, including the new offline job-autofill section |

Route behaviour verified end to end against the dev server with the fixture extractor:

| Request | Response |
| --- | --- |
| cross-origin `Origin: https://evil.example` | `403 forbidden_origin` |
| `GET` | `405 bad_method` |
| `Content-Type: text/plain` | `415 bad_content_type` |
| `{"url":"ftp://x/1"}` | `400 invalid_url` |
| LinkedIn URL | `400 unsupported_source` |
| no folder configured | `501 not_configured` |
| fixture folder | `200` with target + warnings |

The smoke section proves, in one offline run: the unconfigured state disables the button and leaves the textarea editable; a fetch fills an empty title and description while leaving a typed company alone; the ATS and character count are reported; the source URL renders as a link; and both the setting and `sourceUrl` survive a page reload. Existing PDF export (two saves) and every prior assertion still pass.

### Deviations and seams

- **Guard codes beyond the spec table.** The shared guard also returns `forbidden_origin`, `bad_method`, `body_too_large`, and `bad_content_type`. They are structural (they can only happen on a malformed caller) and ticket 02 decides whether any of them need their own copy. The spec's eight codes are all implemented.
- **`normalizeExtraction` accepts an optional `company`.** Not in the documented extractor output, but a page-derived company is the only thing that can beat URL derivation; absent, the URL wins.
- **iCIMS-style tenant prefixes are stripped** (`careers-acme.icims.com` → `Acme`), because the raw label would otherwise reach a project name.
- **Warnings and the "filled" summary are already rendered** even though their copy belongs to ticket 02. Removing them would have meant shipping a fetch bar that silently does nothing visible; 02 can change the wording without touching the merge.
- **The replace checkbox is not here.** `mergeTargetIntoJob` already takes `{ replace }` and is unit-tested both ways, so 02 adds the control, not the semantics.
- **Smoke-test change outside the feature:** the workspace-picker stub's counter moved into `sessionStorage`. A plain variable reset on the mid-run reload this ticket's reload assertion needs, which handed back the first workspace and broke the existing "Change workspace folder" check.
- **New test fixtures:** `scripts/fixtures/job-fetch/` holds the canned extractor used by the smoke test, plus `hang.mjs` and `flood.mjs` for the process runner's kill and stdout-cap tests. They are inert stand-ins, not part of the shipped app.
