# 02: Failures are specific, and retry costs one click

**What to build:** Every way a fetch can fail is distinguishable and recoverable in the place it happened. A user sees why the page could not be read, keeps the URL they typed and the description box they can still paste into, and retries with one click if the failure was transient. Sources that cannot be read automatically are refused before any request is made, with copy that points at the description box. The user can also choose to replace existing text deliberately, and is warned when the fetched posting gave so little that the project would be named generically.

**Blocked by:** 01.

**Status:** done

- [x] Each failure is surfaced with its own actionable message: malformed request body, invalid URL, unsupported source, extractor not configured, extractor missing, extractor crashed, malformed extraction result, and timeout.
- [x] For a crashed extractor, the extractor's own error code reaches the user rather than a generic message.
- [x] Deny-listed hosts — LinkedIn, Indeed and Glassdoor, matched case-insensitively on the hostname and its subdomains — produce no request at all and point the user at the description box.
- [x] A failed fetch keeps the typed URL and leaves the description box usable.
- [x] A retry action reuses the URL without retyping and is the same control as the initial fetch, not a second code path.
- [x] No automatic retry or backoff loop occurs.
- [x] Elapsed time is shown once a request has been in flight for roughly fifteen seconds, the rest of the app stays usable, and the control is disabled per surface rather than globally.
- [x] With replace off, non-empty fields are untouched; with replace on, non-empty fetched values overwrite; whitespace-only values count as empty.
- [x] The user is warned when both title and company come back empty, before the project is named.
- [x] A malformed extraction result names the offending field and is distinguishable from an extractor crash.
- [x] Unit tests cover the failure taxonomy and the replace-versus-fill-empty merge semantics; the timeout case uses an injected short budget rather than the four-minute default.
- [x] The smoke test covers denial, retry and replace offline against the fixture extractor.

## Comments

> *Implementation report, appended after verification.*

### What landed

- `src/core/job/failure.ts` — pure per-code copy: the server's message stays the message (it already names the malformed field or repeats the extractor's own words), plus one next step and one optional action (`settings` / `paste`) per code. Retry is deliberately not a code here: the fetch button becomes "Try again", so there is no second path.
- `requestJobFetch` now refuses a deny-listed host before `fetch`, so every surface gets the refusal without reimplementing it, and maps a rejected `fetch` to a `network` code instead of surfacing `Failed to fetch`.
- Target stage: per-code message with an inline action, `data-code` on the status element, the denied-source note appearing as the URL is typed (with the fetch control disabled), the "Try again" label, a 15-second elapsed readout, and the "Replace existing text" checkbox wired to the existing `mergeTargetIntoJob(..., { replace })`.
- `FetchedTarget.companySource` (`"page" | "url"`) records whether the company came from the page or from the URL, so the guessed-company warning is honest instead of re-deriving.
- The extractor's own failure code now travels beside the route's code: `extractorCode` in the 502 body, on `JobFetchRequestError`, and as a muted "Extractor reported: …" line under the message. The route's documented code set is unchanged.

### Verification

| Check | Result |
| --- | --- |
| `npm test` | 262 passed, 14 files (+26 for this ticket) |
| `npm run build` | passed |
| `npm run smoke` | passed |

The smoke section proves, offline: a deny-listed URL produces zero `/api/fetch-job` requests and shows the paste copy with the control disabled; a failing extractor shows `extractor_failed` with its own message and code while keeping the URL and the description; "Try again" is the same control and succeeds on the same URL; replace-off preserves an edit made after the failure while replace-on overwrites it.

### Deviations and seams

- **The failing fixture fails a URL once, then succeeds.** The Target stage cannot change the configured folder without unmounting (which would clear the typed URL), so proving retry-success on the *same* URL needs a fixture that changes its answer. The marker lives in the OS temp directory keyed by a run-unique URL, and the smoke deletes it in `finally`.
- **The smoke ignores one console line.** A deliberate 502 is logged by Chrome as a console error; the collector ignores only a 502 line while the expected-failure window is open.
- **Elapsed time has no automated assertion** — a real 15-second wait would dominate the smoke run. It is UI-only and verified by reading.
- **The guessed-company warning fires on almost every real fetch**, because the extractor contract has no `company` field. That is the ticket's requirement, and it is the most visible behaviour change.
- **Seams for 03:** the modal gets the deny short-circuit, the failure copy and the merge policy for free by reusing `requestJobFetch`, `describeJobFetchFailure` and `mergeTargetIntoJob`. No modal or `createProject` change was made here.
