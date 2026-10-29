# 04: Integration verification and docs

**What to build:** The feature is finished as a product, not just as code: the optional dependency and its limits are documented where a user will look for them, both surfaces are proven end to end in one offline run, and the spec's non-functional promises are audited rather than assumed.

**Blocked by:** 01, 02, 03.

**Status:** done

- [x] The README explains that autofill needs a local career-ops checkout, where to point the app at it, and that some sites must be pasted by hand.
- [x] One offline smoke run proves: fetch into an existing project, fetch while creating a project, a denied source, a retry after failure, replace versus fill-empty, and the unconfigured state.
- [x] An audit confirms the shipped path contains no model SDK, no API-key environment variable, and no new runtime dependency.
- [x] Projects and settings created before this feature load unchanged, and a project without a source URL renders exactly as it did before.
- [x] PDF export is unaffected and still covered by its existing check.
- [x] `npm test`, `npm run build` and `npm run smoke` pass.
- [x] Final pass against the specification's acceptance list; any deliberate deviation is recorded under this ticket's Comments and reflected in the spec.

## Comments

> *Implementation report, appended after verification.*

### What landed

- **README.** A `## Job autofill` section directly after `## PDF export`, linked from a new `## Features` bullet: optional local career-ops checkout, the `Settings → Job intake` field, `browser-extract.mjs` as a local subprocess with no model or API key, the three sources that must be pasted by hand, fill-empty versus **Replace existing text**, and the saved posting URL. Two adjacent lines were corrected rather than duplicated: the `## Privacy and trust` claim that only LLM input leaves the machine now names the posting URL, and the `## Scripts` smoke-coverage sentence now names job autofill.
- **Smoke.** No existing assertion was changed or removed. One assertion was added to the hand-typed project that already proves the unconfigured state: it must render **no** `job-source-url` node, which is the "no empty source line, no layout shift" half of the backward-compatibility criterion. It is the only rendering claim that had no offline check.
- **Unit tests.** Two cases in a new `workspace settings` block in `tests/project.test.ts`, plus one assertion on the existing version-1 load test. The settings hydration line (`settings.careerOpsDir = typeof … === "string" ? … : ""`) had no test at all, so this is the real gap the ticket asked me to look for, not an extension for its own sake.
- **Spec.** Every acceptance box ticked and a `### Deviations recorded at the final pass (ticket 04)` section appended under `## Comments`.

### Verification

| Check | Result |
| --- | --- |
| `npm test` | 266 passed, 14 files (+2 settings cases; one assertion added to an existing case) |
| `npm run build` | passed (`tsc -b` + `vite build`) |
| `npm run smoke` | passed, including the new absence assertion |

### The six required smoke behaviours, mapped

One offline run, fixture extractor, no career-ops checkout and no network:

| Behaviour | Where it is proven |
| --- | --- |
| Fetch into an existing project | `Job autofill: fetch a posting into an existing project` — title filled, typed company left alone, description filled, character count matches, ATS reported, source link points at the posting, and both the setting and `sourceUrl` survive a reload |
| Fetch while creating a project | `Job autofill: create a project from a posting URL` — modal pre-fills title and company, reports the ATS and character count; Create writes exactly one folder slugged `acme-robotics-<date>` whose `project.json` carries the fetched name, description and `sourceUrl`, and whose `inputs/job.md` holds the text |
| Denied source | `Job autofill failures` — LinkedIn URL shows the paste copy, disables the control, and produces **zero** `/api/fetch-job` requests |
| Retry after failure | same section — `extractor_failed` with the extractor's own message and code, URL and description kept, then **Try again** (the same control) succeeds on the same URL |
| Replace versus fill-empty | same section — replace-off keeps an edit made after the failure; replace-on overwrites it |
| Unconfigured state | the pre-existing early check — `job-fetch-unconfigured` present, fetch button disabled, description box editable and usable |

### Audit

**1. No model SDK in the shipped path.**

```console
$ grep -rniE "openai|anthropic|@google|generativelanguage|langchain|ollama|mistral|cohere|bedrock|huggingface|@ai-sdk" server src vite.config.ts
(no matches)
```

The whole shipped source, not just the new files. The fetch path imports only `node:child_process`, `node:fs`, `node:path`, `node:http` (type-only) and its own modules:

```console
$ grep -nE "^import|from \"" server/job-fetch.ts server/request-guard.ts src/core/job/*.ts | grep from
server/job-fetch.ts:1:import { spawn } from "node:child_process";
server/job-fetch.ts:2:import { existsSync, statSync } from "node:fs";
server/job-fetch.ts:3:import { isAbsolute, join } from "node:path";
server/job-fetch.ts:10:} from "../src/core/job/target";
server/request-guard.ts:1:import type { IncomingMessage } from "node:http";
src/core/job/client.ts:1:import { DENIED_SOURCE_MESSAGE } from "./failure";
src/core/job/client.ts:2:import { isUnsupportedSource, type FetchedTarget } from "./target";
src/core/job/target.ts:1:import type { ProjectJob } from "../project";
```

**2. No API-key environment variable.**

```console
$ grep -rnE "process\.env|\benv\.[A-Z_]{3,}" server/job-fetch.ts server/request-guard.ts src/core/job/ src/views/stages/ApplyStage.tsx src/components/NewProjectModal.tsx src/views/SettingsView.tsx
server/job-fetch.ts:227:  const raw = env.JOB_FETCH_TIMEOUT_MS?.trim();
server/job-fetch.ts:276:  const env = deps.env ?? process.env;
server/job-fetch.ts:277:  const directory = firstNonEmpty(input.careerOpsDir, deps.careerOpsDir, env.CAREER_OPS_DIR);
```

Two names, both read through the injectable `deps.env`: `JOB_FETCH_TIMEOUT_MS` (a millisecond budget) and `CAREER_OPS_DIR` (a folder path). Neither is a credential, and the browser side reads none. `server/pdf.ts` also reads `CHROME_PATH`, which is pre-existing and not on this path.

**3. No new runtime dependency.**

```console
$ git diff HEAD --numstat -- package.json package-lock.json
0	0	package-lock.json
0	0	package.json
```

Content is byte-identical to `HEAD`; the only `git status` entry on both files is a mode change (`100644` → `100755`), which is the same mode change on all 114 tracked files in this checkout and predates this work (27 of them also carry content changes from this feature). Declared dependencies are unchanged: `ajv`, `jsonrepair`, `mammoth`, `react`, `react-dom`, `turndown`; dev dependencies unchanged, `playwright-core` still dev-only and excluded from the browser bundle in `vite.config.ts`. The feature itself uses only Node built-ins and `fetch`.

### Backward compatibility

- **Settings.** `initializeWorkspace` spreads the stored file over `createDefaultSettings()` and coerces `careerOpsDir` to `""` when absent or non-string; the schema version stays `1` and the file is not rewritten on hydrate. New test: a legacy `{ schemaVersion: 1, defaultRendererId: "impact", lastProjectId }` loads with both values intact, `careerOpsDir === ""`, and the stored JSON still deep-equals the original. Second test: `careerOpsDir: 42` normalises to `""`.
- **Projects.** `normalizeProjectRecord` reads `sourceUrl` through `asText(...).trim() || undefined`, so a pre-feature record has no value and `JSON.stringify` omits the key. Asserted on the existing version-1 load test; the existing hand-typed creation test still asserts `project.json` has no `sourceUrl` key and `inputs/job.md` is exactly `"\n"`.
- **Rendering.** `ApplyStage` renders the source line only when `httpUrl(project.job.sourceUrl ?? "")` is non-empty, so an old project has no element there — not an empty row. Proven in the smoke run, where the hand-typed project asserts zero `job-source-url` nodes before any fetch.

### PDF export

- `server/pdf.ts` is unchanged against `HEAD` (`git diff HEAD --numstat -- server/pdf.ts` → `0 0`).
- The PDF middleware keeps the same four checks and the same 9 MB cap through the shared `readJsonRequest`, then the same `exportPdf`, 200 status, headers and body. `src/core/export/pdf.ts` is unchanged.
- One honest nuance: a *malformed* PDF request now gets a specific guard status (413 over the cap, 400 for an empty or invalid body) instead of a 500 from the middleware's catch. The client throws on any non-`ok` and Preview falls back to the print dialog, so nothing user-visible changed; a valid export takes the identical path.
- The existing smoke check still runs and passes: two exports, `hasPdf` in the project folder, `/URI` link annotation present, the saved link target rather than the edited label, and `pdfBytes.length > 1000`.

### Spec acceptance list

All thirteen boxes ticked in `.scratch/job-autofill/spec.md`. Deviations recorded in both that file and here:

1. **The guessed-company warning fires on almost every real fetch** — the extractor contract has no `company` field, so a URL-derived name is announced rather than passed off as page data.
2. **The shared guard returns four codes beyond the documented eight** — `forbidden_origin`, `bad_method`, `body_too_large`, `bad_content_type`; structural only, shared with PDF export.
3. **The extractor's own failure code travels beside the route's code** as `extractorCode` on a 502; the documented code set is unchanged.
4. **The modal renders no `settings` / `paste` action buttons** — same copy module, no second control; its next step is the adjacent text.
5. **`FetchState`, `SLOW_FETCH_MS` and the status/warning markup are duplicated** between `ApplyStage.tsx` and `NewProjectModal.tsx`. Not extracted: a shared presentational component risks changing one surface's behaviour or test ids, and this ticket was told to prefer the safe option. Recorded as a known seam for a future ticket.
6. **`normalizeExtraction` accepts an optional `company`** the documented extractor output does not contain; it is the only thing that can beat URL derivation.
7. **iCIMS-style tenant prefixes are stripped** (`careers-acme.icims.com` → `Acme`) so a raw label never reaches a project name.

### Reviewer notes

- The only assertion added to the smoke run is the zero-`job-source-url` check on the hand-typed project; if you want the backward-compatibility rendering claim to stay enforced, that is the line to keep.
- `tests/project.test.ts` → `workspace settings` is new coverage for a hydration branch that existed without a test.
- Everything else in this ticket is documentation and verification; no product code, route, guard, extractor invocation, budget, cap, deny-list, merge function or copy was touched.

