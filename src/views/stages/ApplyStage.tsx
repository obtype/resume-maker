import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Profile, Project } from "../../core/project";
import { createEmptyRecipient, deliverableHasContent, deliverableLabel } from "../../core/deliverables/schema";
import {
  missingDeliverableIds,
  selectMissingDeliverables,
  toggleDeliverableSelection,
} from "../../core/deliverables/selection";
import {
  DELIVERABLE_IDS,
  type DeliverableId,
  type MessageDeliverableId,
  type Recipient,
} from "../../core/deliverables/types";
import { JobFetchRequestError, requestJobFetch } from "../../core/job/client";
import {
  DENIED_SOURCE_MESSAGE,
  describeJobFetchFailure,
  type JobFetchFailureCopy,
} from "../../core/job/failure";
import {
  httpUrl,
  isUnsupportedSource,
  mergeTargetIntoJob,
  type FetchedTarget,
} from "../../core/job/target";
import { RecipientFields } from "../../components/RecipientFields";

interface Props {
  project: Project;
  profile: Profile;
  onChange: (updater: (project: Project) => Project) => void;
  onNext: () => void;
  /** career-ops checkout from Settings; empty disables fetching. */
  careerOpsDir: string;
  onOpenSettings: () => void;
}

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; target: FetchedTarget; warnings: string[]; filled: string[] }
  | { status: "error"; code: string; extractorCode: string; failure: JobFetchFailureCopy };

/**
 * A fetch that is still running after this long reads as broken unless the
 * surface says otherwise; boards normally answer in a few seconds.
 */
const SLOW_FETCH_MS = 15_000;

const DELIVERABLE_HINTS: Record<DeliverableId, string> = {
  cv: "Tailored one-page CV",
  coverLetter: "Letter in prose",
  coldEmail: "Subject and body",
  linkedinMessage: "Post-acceptance message",
};

function DeliverablePanel({
  id,
  title,
  selected,
  generated,
  children,
}: {
  id: DeliverableId;
  title: string;
  selected: boolean;
  generated: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(selected);

  // Panels for selected deliverables open by default. The user can still
  // collapse one; changing the selection resets the default again.
  useEffect(() => {
    setOpen(selected);
  }, [selected]);

  return (
    <details
      className={`deliverable-panel ${selected ? "selected" : "unselected"}`}
      data-deliverable={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="deliverable-panel-title">
          <strong>{title}</strong>
          {generated && <span className="badge generated">generated</span>}
          {!selected && <span className="badge">not requested</span>}
        </span>
        <span className="muted deliverable-panel-hint">
          {selected ? "Included in the prompt" : "Select above to request it"}
        </span>
      </summary>
      <div className="deliverable-panel-body">{children}</div>
    </details>
  );
}

export function ApplyStage({
  project,
  profile,
  onChange,
  onNext,
  careerOpsDir,
  onOpenSettings,
}: Props) {
  const referenceRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const projectIdRef = useRef(project.id);
  projectIdRef.current = project.id;

  const [postingUrl, setPostingUrl] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  // Only set while a request is in flight; the elapsed readout below is derived
  // from it so a slow board can be told apart from a hung one.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // A fetch belongs to the project that started it, so switching projects
  // clears the URL and the status instead of carrying them over.
  useEffect(() => {
    setPostingUrl("");
    setReplaceExisting(false);
    setFetchState({ status: "idle" });
    setStartedAt(null);
    setElapsedMs(0);
  }, [project.id]);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const selected = project.deliverables.selected;
  const settings = project.deliverables.settings;
  const missingCount = missingDeliverableIds(project).length;
  const fetchConfigured = careerOpsDir.trim() !== "";
  const fetchBusy = fetchState.status === "loading";
  const deniedSource = isUnsupportedSource(postingUrl);
  const sourceUrl = httpUrl(project.job.sourceUrl ?? "")?.href ?? "";

  const setJob = (patch: Partial<Project["job"]>) =>
    onChange((current) => ({ ...current, job: { ...current.job, ...patch } }));

  const fetchPosting = async () => {
    const targetId = project.id;
    const url = postingUrl.trim();
    if (!url || fetchBusy) return;
    // The status line already says this page cannot be read, so there is
    // nothing to send: no request, no retry, just the paste fallback.
    if (isUnsupportedSource(url)) return;
    // Capture the choice at click time so toggling it mid-flight cannot change
    // what this run writes.
    const replace = replaceExisting;
    setStartedAt(Date.now());
    setElapsedMs(0);
    setFetchState({ status: "loading" });
    try {
      const result = await requestJobFetch(url, careerOpsDir);
      if (projectIdRef.current !== targetId) return;
      const merged = mergeTargetIntoJob(project.job, result.target, { replace });
      const filled = [
        merged.title !== project.job.title ? "title" : "",
        merged.company !== project.job.company ? "company" : "",
        merged.description !== project.job.description ? "description" : "",
      ].filter(Boolean);
      // Merge through the updater so autosave persists the result and any
      // edit made while the request was in flight is still respected.
      onChange((current) => ({
        ...current,
        job: mergeTargetIntoJob(current.job, result.target, { replace }),
      }));
      setFetchState({ status: "ok", target: result.target, warnings: result.warnings, filled });
    } catch (error) {
      if (projectIdRef.current !== targetId) return;
      const code = error instanceof JobFetchRequestError ? error.code : "unknown";
      setFetchState({
        status: "error",
        code,
        extractorCode: error instanceof JobFetchRequestError ? error.extractorCode : "",
        failure: describeJobFetchFailure(code, (error as Error).message),
      });
    } finally {
      if (projectIdRef.current === targetId) {
        setStartedAt(null);
        setElapsedMs(0);
      }
    }
  };

  const focusDescription = () => descriptionRef.current?.focus();

  const setSelected = (id: DeliverableId, checked: boolean) =>
    onChange((current) => ({
      ...current,
      deliverables: {
        ...current.deliverables,
        selected: toggleDeliverableSelection(
          current.deliverables.selected,
          id,
          checked,
        ),
      },
    }));

  const selectMissing = () =>
    onChange((current) => ({
      ...current,
      deliverables: {
        ...current.deliverables,
        selected: selectMissingDeliverables(
          current,
          current.deliverables.selected,
        ),
      },
    }));

  const setInstructions = (id: DeliverableId, instructions: string) =>
    onChange((current) => ({
      ...current,
      deliverables: {
        ...current.deliverables,
        settings: {
          ...current.deliverables.settings,
          [id]: { ...current.deliverables.settings[id], instructions },
        },
      },
    }));

  const setRecipient = (id: MessageDeliverableId, patch: Partial<Recipient>) =>
    onChange((current) => {
      const currentSettings = current.deliverables.settings[id];
      return {
        ...current,
        deliverables: {
          ...current.deliverables,
          settings: {
            ...current.deliverables.settings,
            [id]: {
              ...currentSettings,
              recipient: {
                ...createEmptyRecipient(),
                ...currentSettings.recipient,
                ...patch,
              },
            },
          },
        },
      };
    });

  const importReference = async (file: File | undefined) => {
    if (!file) return;
    const targetId = project.id;
    const text = await file.text();
    if (projectIdRef.current !== targetId) return;
    setJob({ referenceCv: text });
    if (referenceRef.current) referenceRef.current.value = "";
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h2>Target</h2>
          <p className="muted">
            Describe the role or outreach target, then choose which deliverables this prompt
            should request. Job title, company, and description are optional.
          </p>
        </div>
        <button className="primary" onClick={onNext}>Next: prompt</button>
      </div>

      <section className="panel job-fetch" data-testid="job-fetch">
        <div className="row spread">
          <div>
            <h3>Fetch from a posting URL</h3>
            <p className="panel-note">
              Reads the posting through the local career-ops extractor. Only empty fields are
              filled unless you tick Replace existing text; nothing else in the project is touched.
            </p>
          </div>
          <span className="badge">optional</span>
        </div>

        <div className="row job-fetch-bar">
          <input
            className="grow"
            aria-label="Posting URL"
            value={postingUrl}
            onChange={(event) => setPostingUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void fetchPosting();
            }}
            placeholder="https://jobs.example.com/acme/1234"
            disabled={fetchBusy}
          />
          <button
            className="primary"
            onClick={() => void fetchPosting()}
            disabled={!fetchConfigured || !postingUrl.trim() || fetchBusy || deniedSource}
          >
            {fetchBusy ? "Fetching…" : fetchState.status === "error" ? "Try again" : "Fetch job"}
          </button>
        </div>

        <div className="row job-fetch-options">
          <label>
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(event) => setReplaceExisting(event.target.checked)}
            />
            Replace existing text
          </label>
          <span className="muted">
            {replaceExisting
              ? "Fetched values overwrite what is already there."
              : "Only empty fields are filled; text you already wrote is left alone."}
          </span>
        </div>

        {deniedSource && (
          <p className="callout warn" data-testid="job-fetch-denied">
            {DENIED_SOURCE_MESSAGE}
          </p>
        )}

        {!fetchConfigured && (
          <p className="panel-note" data-testid="job-fetch-unconfigured">
            Set the career-ops folder in Settings to fetch a posting. Pasting the description
            below still works.{" "}
            <button className="ghost" onClick={onOpenSettings}>Open Settings</button>
          </p>
        )}

        {fetchBusy && elapsedMs >= SLOW_FETCH_MS && (
          <p className="panel-note" data-testid="job-fetch-elapsed">
            Still waiting on the posting — {Math.floor(elapsedMs / 1000)}s elapsed. The rest of the
            app keeps working.
          </p>
        )}

        {fetchState.status === "error" && (
          <div
            className="callout error job-fetch-status"
            data-testid="job-fetch-status"
            data-code={fetchState.code}
          >
            <p>{fetchState.failure.message}</p>
            {fetchState.failure.nextStep && <p>{fetchState.failure.nextStep}</p>}
            {fetchState.extractorCode && (
              <p className="muted" data-testid="job-fetch-extractor-code">
                Extractor reported: {fetchState.extractorCode}
              </p>
            )}
            {fetchState.failure.action === "settings" && (
              <button className="ghost" onClick={onOpenSettings}>Open Settings</button>
            )}
            {fetchState.failure.action === "paste" && (
              <button className="ghost" onClick={focusDescription}>Go to description</button>
            )}
          </div>
        )}
        {fetchState.status === "ok" && (
          <p className="callout" data-testid="job-fetch-status">
            Fetched {fetchState.target.description.length.toLocaleString()} characters
            {fetchState.target.ats ? ` · ${fetchState.target.ats} recognised` : ""}.{" "}
            {fetchState.filled.length
              ? `Filled: ${fetchState.filled.join(", ")}.`
              : "Every target field already had text, so nothing was replaced."}
          </p>
        )}
        {fetchState.status === "ok" && fetchState.warnings.length > 0 && (
          <div className="callout warn" data-testid="job-fetch-warnings">
            <ul>
              {fetchState.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid two">
        <label className="field">
          <span>Job title</span>
          <input
            value={project.job.title}
            onChange={(event) => setJob({ title: event.target.value })}
            placeholder="Machine Learning Engineer"
          />
        </label>
        <label className="field">
          <span>Company</span>
          <input
            value={project.job.company}
            onChange={(event) => setJob({ company: event.target.value })}
            placeholder="Acme"
          />
        </label>
      </div>

      <label className="field">
        <span>Job description and requirements</span>
        <textarea
          ref={descriptionRef}
          className="tall"
          rows={16}
          value={project.job.description}
          onChange={(event) => setJob({ description: event.target.value })}
          placeholder="Paste the full job posting here. Responsibilities, requirements, nice-to-haves, team context — all of it. Leave it empty for pure outreach."
        />
        <p className="panel-note" data-testid="job-description-count">
          {project.job.description.length.toLocaleString()} characters
        </p>
      </label>

      {sourceUrl && (
        <p className="panel-note job-source" data-testid="job-source-url">
          Source:{" "}
          <a href={sourceUrl} target="_blank" rel="noreferrer noopener">
            {sourceUrl}
          </a>
        </p>
      )}

      <label className="field">
        <span>Shared instructions for this application</span>
        <textarea
          rows={4}
          value={project.job.sharedInstructions}
          onChange={(event) => setJob({ sharedInstructions: event.target.value })}
          placeholder="e.g. Emphasise computer vision and edge deployment. Omit the solar project. Keep the summary to two sentences."
        />
      </label>

      <section className="panel deliverable-shell">
        <div className="row spread">
          <div>
            <h3>Deliverables</h3>
            <p className="panel-note">
              Choose what this prompt should request. At least one deliverable is always selected.
              Unchecking a generated deliverable keeps its content in the project.
            </p>
          </div>
          <div className="row">
            <span className="badge">{selected.length} selected</span>
            <button
              className="secondary"
              onClick={selectMissing}
              disabled={missingCount === 0}
              title={
                missingCount === 0
                  ? "Every deliverable already has content."
                  : "Select only the deliverables without generated content."
              }
            >
              Select missing only
            </button>
          </div>
        </div>

        <div className="deliverable-grid">
          {DELIVERABLE_IDS.map((id) => {
            const checked = selected.includes(id);
            const generated = deliverableHasContent(project, id);
            const lastSelected = checked && selected.length === 1;
            return (
              <label
                key={id}
                className={`deliverable-option ${checked ? "selected" : ""}`}
                data-deliverable-option={id}
              >
                <input
                  type="checkbox"
                  aria-label={deliverableLabel(id)}
                  checked={checked}
                  disabled={lastSelected}
                  onChange={(event) => setSelected(id, event.target.checked)}
                  title={
                    lastSelected
                      ? "At least one deliverable must stay selected."
                      : undefined
                  }
                />
                <span className="deliverable-option-copy">
                  <strong>{deliverableLabel(id)}</strong>
                  <span className="muted">{DELIVERABLE_HINTS[id]}</span>
                </span>
                {generated && <span className="badge generated">generated</span>}
              </label>
            );
          })}
        </div>

        <div className="deliverable-panels">
          <DeliverablePanel
            id="cv"
            title="CV"
            selected={selected.includes("cv")}
            generated={deliverableHasContent(project, "cv")}
          >
            <label className="field">
              <span>CV instructions</span>
              <textarea
                rows={3}
                value={settings.cv.instructions}
                onChange={(event) => setInstructions("cv", event.target.value)}
                placeholder="e.g. Emphasise computer vision and edge deployment. Omit the solar project."
              />
            </label>
            <p className="panel-note">
              Added only to the CV task. The reference CV below is optional and used only for the
              CV deliverable.
            </p>
          </DeliverablePanel>

          <DeliverablePanel
            id="coverLetter"
            title="Cover letter"
            selected={selected.includes("coverLetter")}
            generated={deliverableHasContent(project, "coverLetter")}
          >
            <label className="field">
              <span>Cover-letter instructions</span>
              <textarea
                rows={3}
                value={settings.coverLetter.instructions}
                onChange={(event) =>
                  setInstructions("coverLetter", event.target.value)
                }
                placeholder="e.g. Keep it to three paragraphs and focus on the perception project."
              />
            </label>
            <p className="panel-note">
              Added only to the cover-letter task, on top of the shared instructions.
            </p>
          </DeliverablePanel>

          <DeliverablePanel
            id="coldEmail"
            title="Cold email"
            selected={selected.includes("coldEmail")}
            generated={deliverableHasContent(project, "coldEmail")}
          >
            <label className="field">
              <span>Cold-email instructions</span>
              <textarea
                rows={3}
                value={settings.coldEmail.instructions}
                onChange={(event) =>
                  setInstructions("coldEmail", event.target.value)
                }
                placeholder="e.g. Keep it under 120 words and ask for a short call."
              />
            </label>
            <RecipientFields
              recipient={settings.coldEmail.recipient ?? createEmptyRecipient()}
              onChange={(patch) => setRecipient("coldEmail", patch)}
            />
          </DeliverablePanel>

          <DeliverablePanel
            id="linkedinMessage"
            title="LinkedIn message"
            selected={selected.includes("linkedinMessage")}
            generated={deliverableHasContent(project, "linkedinMessage")}
          >
            <label className="field">
              <span>LinkedIn instructions</span>
              <textarea
                rows={3}
                value={settings.linkedinMessage.instructions}
                onChange={(event) =>
                  setInstructions("linkedinMessage", event.target.value)
                }
                placeholder="e.g. Reference their recent post and keep it under 100 words."
              />
            </label>
            <RecipientFields
              recipient={
                settings.linkedinMessage.recipient ?? createEmptyRecipient()
              }
              onChange={(patch) => setRecipient("linkedinMessage", patch)}
            />
          </DeliverablePanel>
        </div>
      </section>

      <div className="panel inset">
        <div className="row spread">
          <div>
            <h3>Reference CV (optional)</h3>
            <p className="panel-note">
              Used only for the CV deliverable, for voice and structure. The prompt explicitly
              tells the model not to treat it as a source of new facts. It is never sent to the
              cover letter, cold email, or LinkedIn task.
            </p>
          </div>
          <div className="row">
            <button className="secondary" onClick={() => referenceRef.current?.click()}>
              Import file
            </button>
            {project.job.referenceCv && (
              <button className="ghost" onClick={() => setJob({ referenceCv: "" })}>Clear</button>
            )}
            <input
              ref={referenceRef}
              hidden
              type="file"
              accept=".json,.md,.markdown,.txt,application/json,text/plain,text/markdown"
              onChange={(event) => void importReference(event.target.files?.[0])}
            />
          </div>
        </div>
        <textarea
          className="mono"
          rows={7}
          value={project.job.referenceCv}
          onChange={(event) => setJob({ referenceCv: event.target.value })}
          placeholder="Paste an existing CV, or import a .json/.md/.txt file."
        />
      </div>

      <div className="callout">
        <strong>Profile in use:</strong> {profile.basics.name || "No name set"} ·{" "}
        {profile.basics.contact.length} contact detail(s) ·{" "}
        {profile.pdr.markdown.length.toLocaleString()} PDR characters.{" "}
        <span className="muted">Edit these in Profile.</span>
      </div>
    </div>
  );
}
