# 03: Create a project from a posting URL

**What to build:** The moment a user decides to apply is the moment they create a project, so the same fetch is available in the New Project modal. Fetching there pre-fills the title and company, and creating the project carries the description and source URL in with it, so the new project opens already targeted — named and foldered from the fetched job rather than from a placeholder. Creating a project without fetching behaves exactly as it does today.

**Blocked by:** 01.

**Status:** done

- [x] The New Project modal offers a URL field and a fetch action, and fills the title and company from a successful fetch.
- [x] Creating a project after a fetch stores the description and the source URL on the new project, and the job description mirror in the project folder is written as it is today.
- [x] The project's display name and folder use the fetched title and company.
- [x] A project created without a fetch keeps its current name, folder and empty description, unchanged.
- [x] The user is warned when a fetched posting supplies neither a title nor a company, before the project is created with a generic name.
- [x] Failures in the modal use the same messages and retry behaviour as the Target stage, with no duplicated copy.
- [x] The fetch cannot be started twice concurrently from the modal, and the create action is not blocked while a fetch is in flight.
- [x] The smoke test covers creating a project from a URL offline against the fixture extractor.

## Comments

> *Implementation report, appended after verification.*

### What landed

- `createProject` takes optional `description` and `sourceUrl`. Omitted, the project record is byte-for-byte what it was before autofill: `description: ""`, no `sourceUrl` key at all, and `inputs/job.md` still written as `"\n"`.
- `NewProjectPayload` carries `description` and `sourceUrl`, and `App.newProject` passes them to `createProject`.
- The modal gained a "Posting URL" row above the job fields: input, fetch button, and inline status. A successful fetch runs the same `mergeTargetIntoJob(..., { replace: false })` the Target stage uses, so a field the user already typed into is left alone; description and source URL stay in form state and are created with the project.
- The fetched title and company *are* the form's title and company, so `projectNameFor` / `projectSlugFor` name the project and its folder from the fetched job with no extra plumbing.
- Warnings come from the server's `buildFetchWarnings` and are rendered in `new-project-fetch-warnings`; failures come from `describeJobFetchFailure`. No modal-specific copy exists.
- Concurrency: the fetch button is disabled while a request is in flight (and while the URL is empty, unconfigured, or deny-listed), while Create stays governed only by its own `busy` and `hasTarget`. A `mountedRef` guard drops a late result from a closed modal instead of writing into the next form.
- A `new-project-` prefixed test-id set mirrors the Target stage's (`-fetch`, `-fetch-status` with `data-code`, `-fetch-warnings`, `-fetch-denied`, `-fetch-unconfigured`, `-fetch-extractor-code`, `-fetch-elapsed`, `-description-count`), documented above the component.

### Verification

| Check | Result |
| --- | --- |
| `npm test` | 264 passed, 14 files (+2 in `tests/project.test.ts`) |
| `npm run build` | passed (`tsc -b` + `vite build`) |
| `npm run smoke` | passed |

The new smoke section proves, offline: the modal fetches the fixture posting, pre-fills title and company, reports the ATS and the description character count; Create then produces exactly one new project folder whose slug is `acme-robotics-<date>`, whose `project.json` `name` is `Acme Robotics — Computer Vision Engineer` with the fetched `description` and `sourceUrl` (character count matching the modal's readout), and whose `inputs/job.md` contains the fetched text. The pre-existing hand-typed creation assertions still pass unchanged.

### Deviations and seams

- **The fetch button is `secondary`, not `primary`.** Create is the modal's primary action; a second primary button beside it would make the modal's hierarchy ambiguous.
- **The modal renders no `settings` / `paste` action buttons.** `JobFetchFailureCopy.action` is surfaced by the Target stage; in the modal the next step is already the adjacent text, and the paste path is the description box the project will get. The copy itself is shared, so the messages are identical.
- **An elapsed readout was added to the modal** (`new-project-fetch-elapsed`, same 15 s threshold) even though the ticket only demanded concurrency control, because a modal that looks frozen reads as a crash.
- **The `.modal` container now scrolls** (`max-height: calc(100vh - 40px)`), because the URL row and its status can push Create below a laptop viewport.
- **The modal's URL placeholder is `https://jobs.example.com/example-company/1234`**, distinct from the Target stage's, so the two inputs are not ambiguous to a selector.
- **Modal failure and denial paths are not smoke-asserted.** They are the same modules as the Target stage's, which are asserted there, and the smoke already spends its denial and retry budget on the Target stage. Covered by `tests/job-failure.test.ts` instead.
- **Duplication left for 04:** `FetchState`, `SLOW_FETCH_MS`, and the status/warning markup now exist in both `ApplyStage.tsx` and `NewProjectModal.tsx`. Extracting a shared presentational component was deliberately not attempted here — it would have changed the Target stage, which this ticket was told not to touch. The state machines are identical; only the test-id prefix and the surrounding form differ.
