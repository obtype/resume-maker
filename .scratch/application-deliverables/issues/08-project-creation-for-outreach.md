# 08 — Project creation and navigation for jobless outreach

**Status:** ready-for-agent
**Category:** enhancement
**Blocked by:** 02, 05

## Context

The New Project modal currently requires a job title or company and always asks for a renderer. A user must be able to create a cover-letter-only project without a CV, and a cold-email-only or LinkedIn-only project with no job. See `../spec.md` section “Projects / New Project”.

## Scope

- `src/components/NewProjectModal.tsx`:
  - Job title and company become optional.
  - Add deliverable checkboxes; CV is checked by default.
  - Add an optional recipient name, shown when cold email or LinkedIn is selected.
  - Show the renderer selector only when CV is selected; otherwise use the settings default renderer and do not ask.
  - Require at least one of job title, company, or recipient name. Disable Create otherwise.
  - Pass the full creation payload to `onCreate`.
- `src/App.tsx`:
  - Update `newProject` and the `createProject` call for the new payload.
- `src/core/workspace/projects.ts`:
  - Use the deliverable fallback selection when initializing.
  - Set the recipient name on the selected cold-email and LinkedIn settings.
  - Slug fallback: company → title → recipient → `outreach`, then the date.
  - Display name fallback: `company — title`, then title, then company, then `Outreach — <recipient>`, then `Outreach`.
- `src/views/ProjectsView.tsx`:
  - Change the page copy to “One project per application or outreach effort.”
  - Use a neutral company fallback for outreach-only projects, and avoid rendering the same string twice when the title is empty.
- `src/views/ProjectView.tsx`:
  - Initial stage: Preview when the project has CV content; Response when it has messages but no CV; Target otherwise.
  - Keep the stage tab visibility rules from ticket 07.

## Acceptance Criteria

- Creating a CV project works as before.
- Creating a cover-letter-only project with no job title, company, or recipient is blocked with a clear reason.
- Creating a cover-letter-only project with only a company succeeds and opens on Target.
- Creating a LinkedIn-only project with only a recipient name succeeds, and the recipient name is pre-filled in the LinkedIn settings.
- Creating a CV + cold-email project with a company and recipient succeeds and pre-fills the recipient.
- The project folder slug and display name use the documented fallbacks.
- The renderer selector is not shown when CV is unchecked, and the project still has a valid renderer/schema for later.
- `npm run build` and `npm test` pass.

## Tests

Extend the smoke test to create a cover-letter-only project with a company but no CV and a LinkedIn-only project with a recipient name, then assert the project name, selection, and recipient pre-fill. Keep the existing CV creation flow covered.

## Comments

- Implemented the New Project modal as a payload-driven form. Job title and company are optional, the four deliverable checkboxes start with CV selected (the last selection cannot be unchecked), and a recipient name appears only for cold email/LinkedIn. The renderer selector is shown only while the CV is selected; otherwise the payload carries the workspace default renderer. Create is disabled with an explicit reason until a job title, company, or visible recipient name is present. The form remounts on open, so every new project starts from the CV default.
- `NewProjectPayload` now carries `jobTitle`, `company`, `rendererId`, `deliverables`, and `recipientName`; `App` maps it to `createProject` and still derives the schema from the chosen/default renderer.
- `createProject` normalizes the deliverable selection (empty/omitted falls back to CV), creates a valid CV renderer/schema even for message-only projects, and pre-fills both cold-email and LinkedIn recipient settings from the optional recipient name.
- Name/slug fallbacks are now `company — title`, title, company, `Outreach — recipient`, `Outreach`; the folder slug stays company -> title -> recipient -> `outreach` plus the date. `ProjectsView` uses the "One project per application or outreach effort." copy, a neutral `Outreach` company label for outreach-only cards, and does not repeat the project name when there is no title.
- `ProjectView` opens on Preview when CV content exists, Response when messages exist without CV content, and Target otherwise; ticket 07's Preview tab visibility is unchanged.
- Tests: `tests/project.test.ts` now covers the new display-name fallback, cover-letter-only company creation, LinkedIn-only recipient pre-fill, CV + cold-email recipient pre-fill, the empty-selection CV fallback, and persisted renderer/schema. `scripts/smoke.mjs` creates a cover-letter-only project from the modal (checks the blocked reason and hidden renderer, asserts Target, slug/name/selection, and hidden Preview) and a LinkedIn-only project (asserts Target, `Outreach — Sam Rivera`, selection, and recipient pre-fill), while keeping the existing CV flow. Fictional data only.
- Checks: `npm test` (10 files, 142 passed), `npm run build`, `npm run check:renderers` (10 passed), `npm run smoke` (passed).
- Follow-ups for ticket 09: the documentation sweep still needs the new modal payload, fallback names, and initial-stage rules; the smoke suite does not yet exercise a combined CV + cold-email creation through the modal or a full cold-email/LinkedIn prompt-to-response flow.
