# Job autofill: fill a project's target from a posting URL

**Status:** done
**Category:** enhancement
**Tracker:** local markdown

## Problem Statement

Every project starts with retyping a job into the Target stage: the title, the company, and several thousand characters of description. That text already exists on the posting page, and the machine already has a tool that can read it — the career-ops checkout next to this repo exposes a headless extractor that turns a posting URL into compact JSON. But CV Studio is a closed local app: it accepts only text the user pastes, and it has no place to record which posting the text came from.

The cost is mechanical transcription at the worst moment — right after the user has decided to apply. It also loses provenance: once the description is pasted, the project has no link back to the posting, so re-checking the role or re-fetching it means finding the job again.

## Solution

Job autofill. The user pastes a posting URL in the New Project modal or on the Target stage. The local Node server runs the career-ops extractor and returns a filled-in target: title, company, verbatim description, and the posting URL itself.

The pipeline is deterministic end to end. Nothing is generated and no model is involved: the extractor reads a known applicant-tracking API or the rendered DOM, and the app validates and merges the result with pure functions. The fetched description becomes the `{{JOB_DESCRIPTION}}` the prompt builder already emits, so no prompt template changes.

The extractor is optional. With no career-ops checkout configured, fetching is disabled with an actionable message and the description box behaves exactly as it does today.

## User Stories

1. As an applicant, I want to paste a posting URL into the New Project modal and have the title, company and description filled in, so I never retype a job.
2. As an applicant, I want the same fetch available on the Target stage of an existing project, so I can fill a project I created before finding the posting.
3. As an applicant, I want the posting URL saved with the project, so I can return to the job after the description is in place.
4. As an applicant, I want the fetched description to stay editable, so I can trim navigation junk or add a detail the extractor missed.
5. As an applicant, I want a fetch to leave text I already wrote alone, so a mis-click cannot destroy my edits.
6. As an applicant, I want an explicit "replace existing text" choice, so I can deliberately re-fetch after pasting the wrong job.
7. As an applicant, I want to see which site a description came from and whether the extractor recognised the applicant tracking system, so I can judge whether the text is complete.
8. As an applicant, I want the company name derived from the URL when the page does not expose it, so a pre-filled project is not nameless.
9. As an applicant, I want the derived company name to be editable, and left blank rather than guessed wrong, so a bad guess never reaches a prompt.
10. As an applicant, I want a specific error when a page cannot be read, with the description box still available, so I can paste instead.
11. As an applicant, I want LinkedIn, Indeed and Glassdoor URLs to say up front that they cannot be read and that I should paste the text, so I do not wait for a fetch that will fail.
12. As an applicant, I want a slow fetch to show progress without freezing the rest of the app, so I can keep working while it runs.
13. As an applicant, I want a slow fetch to give up after a generous ceiling and say it failed, with a one-click retry that reuses the URL, so a transient failure or a slow board costs me nothing and one dead link cannot hold the control open indefinitely.
14. As an applicant, I want the fetch control to explain that the extractor is not configured, and where to set it, instead of failing silently.
15. As a privacy-conscious user, I want to know that fetching sends the URL to the job site and nothing else leaves the machine, so I can decide when to use it.
16. As an applicant, I want the fetched title and company to become the project's name and folder, so the workspace list stays readable.
17. As an applicant, I want the saved posting URL clickable from the Target stage, so I can re-check the role before sending anything.
18. As an applicant, I want to see the fetched description's character count, so I can tell truncation from a genuinely short posting.
19. As an applicant, I want a fetch to warn me when both title and company came back empty, so I know the project will get a generic name before I create it.
20. As a maintainer, I want the career-ops dependency optional and configurable in Settings, so the app works without a checkout on this machine.
21. As a maintainer, I want the extractor call behind one injectable runner, so timeout and failure handling are testable without Chromium.
22. As a maintainer, I want no new runtime dependencies, so the app stays local-first and installable from a clean clone.
23. As a maintainer, I want existing projects and settings to keep loading unchanged, so upgrading is invisible.
24. As a maintainer, I want the route locked to same-origin like PDF export, so another web page cannot drive the extractor.
25. As a maintainer, I want fetched text treated as untrusted data, so a posting containing instructions cannot change app behaviour.
26. As a maintainer, I want no model call anywhere in this path, so behaviour is reproducible and costs nothing per fetch.

## Implementation Decisions

### What "fetched target" means

The normalized result of one extraction. It is an internal shape, not a file format and not an import contract:

```json
{
  "url": "https://jobs.ashbyhq.com/acme/1234",
  "title": "Computer Vision Engineer",
  "company": "Acme Robotics",
  "description": "<verbatim job description>",
  "ats": "ashby"
}
```

Validation rules applied by the pure core module:

- `url` must be an absolute `http(s)` URL; it is the only field that is always non-empty.
- `description` must be non-empty after trimming. An empty description is a failure, not a successful fetch of nothing — the extractor already reports that case as an error, and the app must not accept it as a target.
- `title` and `company` may be empty. A page can render a description without either, and the app degrades to the user filling them in.
- `ats` is informational, may be absent, and is never used for decision-making beyond a display badge.
- Any non-string value in a string field is a malformed result and fails the fetch with a distinguishable code rather than being coerced.

### Modules

**A new `core` job module (pure, browser-safe, no I/O).** It owns every decision that can be made without touching the network or the filesystem:

- Normalize and validate an extractor result into a fetched target, or reject it.
- Derive a company name from a URL, returning an empty string when the host is not a recognised board.
- Detect an unsupported source host.
- Merge a fetched target into a `ProjectJob` under the replace policy below.

**A server job-fetch module (impure, injectable).** It resolves the career-ops directory, validates it, builds the extractor invocation, runs it, parses stdout, and maps stderr failures onto error codes. The runner is a parameter, so tests inject a fake and never spawn Node or Chromium. It never writes to disk; the browser writes results into the workspace.

**A browser client for the route**, mirroring the existing PDF-export client: one function that POSTs and either returns the parsed result or throws an `Error` carrying the server's message. No retry logic, no caching.

**The route** is registered by the same Vite plugin that registers PDF export, as a second middleware. It gets the same same-origin check, method check, content-type check, and request-body cap.

### HTTP contract

`POST /api/fetch-job`, JSON body `{ "url": string, "careerOpsDir"?: string }`.

| Status | Code | Meaning |
| --- | --- | --- |
| 200 | — | `{ target: { url, title, company, description, ats }, warnings: string[] }` |
| 400 | `bad_json` | body is not valid JSON |
| 400 | `invalid_url` | not `http(s)`, or not parseable |
| 400 | `unsupported_source` | host on the deny-list; the client normally prevents this |
| 501 | `not_configured` | no career-ops directory resolved |
| 501 | `extractor_missing` | directory is not absolute, does not exist, or has no extractor |
| 502 | `extractor_failed` | extractor exited non-zero; body repeats its `error` and `code` |
| 502 | `bad_extraction` | extractor succeeded but its JSON failed validation |
| 504 | `timeout` | extractor exceeded the timeout and was killed |

Error bodies are JSON `{ error, code }`, matching the shape the extractor itself emits on stderr, so a caller never has to parse prose. The route never leaks the resolved absolute path in an error body.

### Configuration

`Settings` gains an optional `careerOpsDir` string. It is additive, defaults to empty, and does not bump the settings schema version; an existing `settings.json` keeps loading unchanged.

Resolution order for the extractor directory, first non-empty wins:

1. the per-request `careerOpsDir` body field (used by the Node smoke test),
2. the workspace `careerOpsDir` setting,
3. the `CAREER_OPS_DIR` environment variable,

then `not_configured`. The Settings view gains a "Job intake" panel: a text field, a note that it must point at a career-ops checkout containing the extractor, and a note that fetching sends only the URL to the job site. An empty value disables fetching and leaves manual pasting available.

### Project shape

`ProjectJob` gains an optional `sourceUrl` string. It is written by a fetch and is the only field that is always refreshed rather than protected by the replace policy, because it identifies which posting produced the current text. It must be normalised in the project record like every other job field, or it would vanish on reload.

`createProject` gains optional `description` and `sourceUrl`. Without them its behaviour is unchanged, and the existing `inputs/job.md` mirror keeps being written from `job.description`.

### Merge policy

One pure function serves the modal and the Target stage:

- With `replace: false` (the default), a field is written only when the current value is empty or whitespace-only.
- With `replace: true`, every non-empty value the target provides overwrites; fields the target leaves empty are untouched.
- `sourceUrl` is always written.
- `sharedInstructions`, per-deliverable instructions, CV content, saved artifacts, renderer choice, and styles are never touched.

### UI

**New Project modal.** A URL row above the target fields: URL input, "Fetch" button, and inline status line. On success the modal pre-fills title and company, keeps description and source URL in form state, and reports the description's character count plus any warnings. Project creation passes all of it through.

**Target stage.** A job autofill bar above the existing job fields, with the same URL input, fetch button, and a "Replace existing text" checkbox that defaults to off. Applying refreshes the project through the existing `onChange` path so autosave persists it. The source URL renders as a small clickable line under the job fields when present.

**Behaviour shared by both surfaces.** Only empty fields are filled unless replace is ticked. Nothing is blocked on warnings; they are listed. Fetching is available for a project that already has content. Buttons disable while a request is in flight, the rest of the app stays usable, and the in-flight state is per-surface so two tabs cannot deadlock each other.

**Retry.** Any failed fetch leaves the URL in place, keeps the error visible, and offers a single "Try again" action that repeats the same request with that URL. The action is the same control as the initial fetch, so retrying requires no retyping and no second code path. Elapsed time is shown once a request has been in flight for more than about fifteen seconds, so a slow board reads as working rather than broken. Cancelling an in-flight request is not offered; the run ends on its own or hits the ceiling.

**Copy for unreadable sources.** When the host is on the deny-list, no request is made; the status line says the page cannot be read automatically and points at the description box. The deny-list ships as `linkedin.com`, `indeed.com`, and `glassdoor.com`, matched case-insensitively on the hostname and its subdomains.

### Trust and safety

- The URL reaches the extractor as an argv element with `shell: false`; it is never interpolated into a command string.
- The server rejects anything that is not `http(s)`, independent of the client.
- Fetched text is untrusted external content. It is stored as data, edited in a textarea, and escaped by the existing renderers; no fetched text is ever interpreted as instructions, markup, or configuration.
- The extractor's own private-host guard remains the SSRF boundary; this feature does not add its own allow-list of job sites.
- Stdout is capped; exceeding the cap is a failure, not a truncated success.
- The fetch budget defaults to **240,000 ms (four minutes)**, overridable through `JOB_FETCH_TIMEOUT_MS`. This is a page-load ceiling, not a model budget: the extractor is a headless browser, and typical boards answer in 5–20 seconds, so the ceiling exists for JS-heavy and Workday-style boards rather than for normal use.
- The same budget is passed to the extractor as `--timeout`, and the server separately enforces a hard kill at the budget plus a short grace period so a wedged browser process cannot outlive the request. A killed run reports `timeout`; it never returns a partial result.
- Retries are user-initiated only. There is no automatic retry and no backoff loop, because a repeated failure against the same board is a signal to paste the text, not to keep hammering a third-party site.
- The default description cap is 40,000 characters, raised from the extractor's 12,000 default because long postings truncate silently at the tail.

### Compatibility and dependencies

- No new runtime dependencies: `child_process`, `fs`, and `path` are built in. Playwright stays a dependency of career-ops, not of this app.
- No prompt template changes. The fetched description flows through the existing `{{JOB_DESCRIPTION}}` placeholder.
- Existing projects load unchanged; `sourceUrl` defaults to empty and every surface degrades to today's behaviour.
- The extractor contract this feature relies on is `node browser-extract.mjs <url> --mode jd [--max-chars N] [--timeout N]`, stdout `{ url, title, text, ats }`, stderr `{ error, code }` with exit 1 on failure.

### Documentation

`README.md` gains a short "Job autofill" section covering the optional career-ops dependency, the Settings field, and the sources that cannot be read automatically. The Settings panel itself explains the dependency, so no separate document is required.

## Testing Decisions

Good tests exercise a public boundary with inputs a caller could really produce, and assert on observable output. They do not assert on call order, internal helpers, DOM structure, or rendered CSS, and they do not snapshot HTML. A test that would still pass after the feature is deleted is a bad test.

**`core` job module — before anything else, and the primary seam.** Table-driven tests for:

- normalising an extraction: full result, absent `title`, absent `company`, absent `ats`, empty description rejected, whitespace-only description rejected, a non-string field rejected with the offending field named, and a non-`http(s)` URL rejected;
- company derivation: Greenhouse, Lever, Ashby, Workday, iCIMS, BambooHR board tokens, a custom careers host, a bare host, and a malformed URL, asserting the empty-string outcome where nothing is derivable;
- merge: fill-empty-only versus replace, whitespace-only counting as empty, `sourceUrl` always refreshed, and `sharedInstructions` plus CV content left untouched on a project that already has them;
- unsupported-source detection: exact host, subdomain, uppercase host, and a non-matching host that merely contains a deny-list name.

Prior art: `project.test.ts` and `deliverables.test.ts`, which test normalise/validate behaviour with plain objects and an in-memory filesystem.

**Server job-fetch module — with an injected runner.** Cases: success mapping; exit 1 with JSON stderr; exit 1 with prose stderr; malformed stdout; stdout over the cap; timeout (runner resolves after the deadline, using an injected short budget rather than the four-minute default); directory not absolute, missing, or without the extractor; URL validation; settings-versus-environment precedence. No Chromium, no network, no temp files.

**Smoke test — route and UI, offline.** A fixture directory holds a stub extractor that ignores its arguments and prints a canned result, so the route can be exercised without any real board. Coverage: the modal fills title, company and description from a fetch; only-empty merge behaviour versus the replace checkbox; the unconfigured state showing the manual fallback; a failed fetch showing a retry action that reuses the URL; and the source URL surviving into the created project. The existing smoke test's structure and its `PDF_OUT`-style opt-out pattern are the prior art.

**Not tested automatically:** exact user-facing wording (assert a substring, never a full sentence), styling, and real extractor behaviour against live boards, which belongs to career-ops.

## Out of Scope

- **Any model or LLM call.** No generation, no summarisation, no "smart" cleanup of the fetched text, and no API keys. The path is deterministic by design.
- **Application-specific guidance.** Per-deliverable instructions stay exactly as they are today: typed by the user into the existing boxes. There is no import, no authoring step, and no file format for them. See Further Notes.
- **Importing a job file.** No file input, no JSON contract, no pack format.
- Reading LinkedIn, Indeed, or Glassdoor postings, and any login, cookie, or anti-bot handling. Those URLs are refused with an instruction to paste.
- Running career-ops modes (CV tailoring, cover letters, application answers) from this app.
- Archiving the posting as a file, PDF, or screenshot.
- Auto-creating a project straight from a pasted URL without the modal.
- Batch or multi-URL intake.
- Changing the prompt templates, the CV schemas, or the response pipeline.
- Any change inside the career-ops repository; it only needs to keep its current extractor contract.
- Cancelling an in-flight fetch.

## Further Notes

- **Deferred deliberately: application-specific guidance.** The idea of seeding a project with per-application instructions for the CV and cover letter is a separate feature, and it is the only part of the earlier design that would have needed an authoring step outside the app. Nothing in this spec depends on it, and adding it later means introducing one new contract (a file or a request payload carrying instruction strings) without touching the fetch path. Keep it out of this work; it is not a follow-on ticket here.
- **Why the shared seam matters.** The merge policy is one pure function used by both surfaces, which is what keeps the modal and the Target stage from drifting and makes the feature testable without a browser.
- **Published tickets.** The work is sliced vertically under this feature's `issues/` directory: (01) fetch into the Target stage, (02) specific failures and retry, (03) create a project from a URL, (04) integration verification and docs. 02 and 03 are blocked by 01; 04 is blocked by all three. Each slice is demoable on its own and carries its own tests. There is no separate prefactor ticket: the new route is additive, and the shared middleware guard can be factored inside 01 without changing PDF behaviour.
- **ADR check.** ADR 0001 (derive link targets at render time) and ADR 0002 (one prompt for multiple deliverables) are unaffected: this feature adds no rendering and no prompt changes. The source URL is displayed as plain text plus a link target, consistent with ADR 0001.
- **The external dependency is one line of another repo's CLI.** If career-ops changes its extractor output, the failure is contained to the server module's parse step, and the `502` body will carry the extractor's own code rather than a generic message.
- **The four-minute ceiling is not a model budget.** Nobody waits on an LLM here: the extractor launches a headless browser, whose own navigation timeout is fifteen seconds by default. The four-minute wrapper budget exists so an unusually heavy board is not cut off, and the retry action exists so a dead link costs one click. Do not reduce it to a "reasonable API timeout" during implementation — that would reintroduce the failure this ceiling was raised to avoid.
- **Failure is a normal outcome, not an error state to hide.** Every failure path leaves the description box usable and the URL intact, because pasting text is the documented fallback and must always remain one click away.
- **Determinism is the point.** Same page, same output. A bad extraction is a parser bug or a page change and can be reproduced, which is not true of a model reading the page, and it costs nothing per run.

## Comments

> *This was generated by AI during triage.*

### Triage

**Category:** enhancement
**State:** ready-for-agent

**Redundancy check.** Searched the app by domain concept, not wording: the only outbound calls are the bundled prompt templates and the PDF-export route, and no project record stores a posting URL. There is no existing job-description intake of any kind.

**Prior rejection check.** `.out-of-scope/` does not exist in this repo, so there is nothing to match against.

**Claim verification.** The external half of the contract was confirmed against the local career-ops checkout: the extractor script exists and is executable, it answers with `{ "error", "code" }` on stderr for a missing argument, it accepts `--timeout MS` (navigation default 15 s), and Playwright is installed there. No model SDK or API-key environment variable is read anywhere in that path. The app-side half is unbuilt, so it cannot be verified by execution.

**Maintainer decisions recorded during triage:**

- A fetch that fails must offer a one-click retry reusing the URL. No automatic retry.
- The fetch budget is four minutes, not the sixty seconds originally specified.
- Refusing LinkedIn, Indeed, and Glassdoor rather than attempting them is accepted for now.
- Scope reduced to deterministic autofill only. Application-specific guidance and any import format were removed from this spec and deferred; nothing here may depend on a model call or an authoring step.

### Agent Brief

**Category:** enhancement
**Summary:** Fill a project's target from a posting URL using the local career-ops extractor, deterministically, with no model calls.

**Current behavior:**
Every project begins with the user typing the job title, the company, and the full description into the Target stage. The app talks only to its own origin (bundled prompt templates, and a local PDF-export route). A project has no record of which posting its description came from.

**Desired behavior:**
A "Fetch from URL" control in the New Project modal and on the Target stage sends the URL to a new same-origin route, which runs the local extractor and returns title, company, verbatim description, source URL, and the recognised ATS. Filling only touches empty fields unless the user ticks "Replace existing text". The posting URL is stored on the project and shown as a link. Every failure is distinguishable and recoverable in place: the URL stays, the description box stays usable, and a retry needs one click. Hosts that cannot be read automatically are refused before any request is made. No generation of any kind happens anywhere in the path.

**Key interfaces:**

- A pure job module in the core layer, with no I/O: normalise and validate an extractor result into a fetched target or reject it; derive a company name from a URL, returning an empty string when nothing is derivable; detect unsupported source hosts; and merge a fetched target into a `ProjectJob` under a replace flag.
- A server-side job-fetch module whose extractor runner is injectable as `(input) => { stdout, stderr, code }`. It resolves the extractor directory (per-request value, then workspace setting, then `CAREER_OPS_DIR`, else not configured), validates it, spawns without a shell, caps stdout, and enforces the budget with a hard kill after a short grace period.
- `Settings` gains an optional `careerOpsDir` string; additive, no schema bump, empty by default.
- `ProjectJob` gains an optional `sourceUrl`, normalised on load like every other job field.
- `createProject` accepts optional description and source URL; omitting them preserves today's behaviour exactly.
- Route `POST /api/fetch-job` with codes `bad_json`, `invalid_url`, `unsupported_source`, `not_configured`, `extractor_missing`, `extractor_failed`, `bad_extraction`, and `timeout`; a success returns the fetched target plus warnings.

**Acceptance criteria:**

- [x] A supported posting URL fills title, company, description, and source URL, and reports the description's character count.
- [x] With replace off, non-empty fields are untouched; with replace on, non-empty target values overwrite; whitespace-only values count as empty.
- [x] A target with an empty description is rejected as a failed fetch, never stored as an empty job.
- [x] A target with no title, no company, or no ATS still succeeds, and the user is warned when both title and company are empty.
- [x] A malformed extractor result names the offending field and is distinguishable from an extractor crash.
- [x] Existing `sharedInstructions`, per-deliverable instructions, CV content, applied messages, renderer choice, and styles survive a fetch untouched.
- [x] An unconfigured extractor disables fetching with a message naming the setting, while manual pasting keeps working.
- [x] Extractor exit 1, malformed stdout, and over-cap stdout each surface a distinguishable failure rather than a partial success.
- [x] A run exceeding the budget reports a timeout, and the surface offers a retry that reuses the URL with no retyping.
- [x] Deny-listed hosts produce no request and point the user at the description box.
- [x] The source URL survives a reload and renders as a clickable link.
- [x] Unit tests cover the pure module and the server module with an injected runner, and run with no Chromium and no network; the smoke test covers the route and both UI surfaces offline using a fixture extractor.
- [x] No new runtime dependencies and no model or API-key usage anywhere in the path; `npm test` and `npm run build` both pass.

**Out of scope:**
- Any model or LLM call, including using one to clean up or summarise fetched text.
- Application-specific guidance, instruction authoring, and any import format for it.
- Importing a job from a file.
- Reading LinkedIn, Indeed, or Glassdoor postings; any login, cookie, or anti-bot handling.
- Running career-ops modes (CV tailoring, cover letters, application answers).
- Archiving postings as files, screenshots, or PDFs; batch or multi-URL intake; creating a project straight from a URL without the modal.
- Changes to prompt templates, CV schemas, the response pipeline, or rendering.
- Any change inside the career-ops repository. It only needs to keep its current extractor contract.
- Cancelling an in-flight fetch.

**Reference:** the full specification is the body of this file above the triage notes. The brief is the contract; the spec is the detail.

### Deviations recorded at the final pass (ticket 04)

All acceptance criteria above were verified against the landed code and the offline smoke run. These are the deliberate deviations, accepted as-is:

1. **The guessed-company warning fires on almost every real fetch.** The extractor contract has no `company` field, so the name is derived from the URL and `buildFetchWarnings` says so whenever it came from there. The warning is honest rather than noisy: the alternative is a silent guess reaching a project name.
2. **The shared request guard returns four codes beyond the eight in the HTTP contract** — `forbidden_origin`, `bad_method`, `body_too_large`, `bad_content_type`. They are structural (only a malformed caller produces them) and `/api/export-pdf` uses the same guard. The eight documented codes are all implemented with their documented statuses.
3. **The extractor's own failure code travels beside the route's code.** A 502 body carries `extractorCode` (`navigation_timeout`, …) alongside `code: "extractor_failed"`. The documented code set is unchanged; the extra field is what lets the UI say what actually broke.
4. **The New Project modal renders no `settings` / `paste` action buttons.** It shares `describeJobFetchFailure`, so the copy is identical, but its next step is the adjacent text and its paste path is the description box the project will get.
5. **`FetchState`, `SLOW_FETCH_MS`, and the status/warning markup are duplicated between `ApplyStage.tsx` and `NewProjectModal.tsx`.** The state machines are identical; only the test-id prefix and the surrounding form differ. Extracting a shared presentational component risks changing one of the two surfaces' behaviour or test ids, and this ticket's job was to finish and document rather than refactor. Recorded as a known seam for a future ticket.
6. **`normalizeExtraction` accepts an optional `company` field the documented extractor output does not contain.** A page-derived company is the only thing that can beat the URL derivation; absent, the URL wins.
7. **iCIMS-style tenant prefixes are stripped** (`careers-acme.icims.com` → `Acme`), because the raw label would otherwise reach a project name.
