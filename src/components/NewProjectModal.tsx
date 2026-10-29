import { useEffect, useRef, useState } from "react";
import { RENDERERS } from "../renderers/registry";
import {
  createDefaultDeliverableSelection,
  deliverableLabel,
} from "../core/deliverables/schema";
import { toggleDeliverableSelection } from "../core/deliverables/selection";
import { DELIVERABLE_IDS, type DeliverableId } from "../core/deliverables/types";
import { JobFetchRequestError, requestJobFetch } from "../core/job/client";
import {
  DENIED_SOURCE_MESSAGE,
  describeJobFetchFailure,
  type JobFetchFailureCopy,
} from "../core/job/failure";
import {
  isUnsupportedSource,
  mergeTargetIntoJob,
  type FetchedTarget,
} from "../core/job/target";

/** Everything the modal collects before the project folder is created. */
export interface NewProjectPayload {
  jobTitle: string;
  company: string;
  /** Fetched description, or empty when the target is typed by hand. */
  description: string;
  /** Posting the description came from, or empty when typed by hand. */
  sourceUrl: string;
  rendererId: string;
  deliverables: DeliverableId[];
  recipientName: string;
}

interface Props {
  open: boolean;
  busy: boolean;
  defaultRendererId: string;
  /** career-ops checkout from Settings; empty disables fetching. */
  careerOpsDir: string;
  onClose: () => void;
  onCreate: (payload: NewProjectPayload) => void;
}

type FormProps = Omit<Props, "open">;

/** Mirrors the Target stage's fetch states so the two surfaces behave alike. */
type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; target: FetchedTarget; warnings: string[]; filled: string[] }
  | { status: "error"; code: string; extractorCode: string; failure: JobFetchFailureCopy };

/**
 * Modal fetch test ids, mirroring the Target stage's with a `new-project-`
 * prefix so the smoke test can tell the two surfaces apart:
 * `new-project-fetch`, `-fetch-status` (`data-code` on failure),
 * `-fetch-warnings`, `-fetch-denied`, `-fetch-unconfigured`,
 * `-fetch-extractor-code`, `-fetch-elapsed`, `-description-count`.
 */

/** Same threshold as the Target stage: a slow board must not read as broken. */
const SLOW_FETCH_MS = 15_000;

const DELIVERABLE_HINTS: Record<DeliverableId, string> = {
  cv: "Tailored one-page CV",
  coverLetter: "Letter in prose",
  coldEmail: "Subject and body",
  linkedinMessage: "Post-acceptance message",
};

export function NewProjectModal({ open, ...props }: Props) {
  if (!open) return null;
  // Mounting the form only while the modal is open resets every field,
  // including the CV default, each time the user starts a new project.
  return <NewProjectForm {...props} />;
}

function NewProjectForm({
  busy,
  defaultRendererId,
  careerOpsDir,
  onClose,
  onCreate,
}: FormProps) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rendererId, setRendererId] = useState(defaultRendererId);
  const [selected, setSelected] = useState<DeliverableId[]>(() => [
    ...createDefaultDeliverableSelection().selected,
  ]);
  const [recipientName, setRecipientName] = useState("");
  const [postingUrl, setPostingUrl] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  // Only set while a request is in flight, so a slow fetch can be told apart
  // from a hung one.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Closing the modal unmounts this form while a fetch may still be running.
  // The guard keeps that late result out of the next form the user opens, and
  // out of the project it would otherwise have created in the meantime.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const cvSelected = selected.includes("cv");
  const wantsRecipient =
    selected.includes("coldEmail") || selected.includes("linkedinMessage");
  // A hidden recipient field must not satisfy the target requirement.
  const recipient = wantsRecipient ? recipientName.trim() : "";
  const hasTarget = Boolean(title.trim() || company.trim() || recipient);
  const defaultRendererName =
    RENDERERS.find((renderer) => renderer.meta.id === defaultRendererId)?.meta.name ??
    defaultRendererId;
  const fetchConfigured = careerOpsDir.trim() !== "";
  const fetchBusy = fetchState.status === "loading";
  const deniedSource = isUnsupportedSource(postingUrl);

  const toggle = (id: DeliverableId, checked: boolean) =>
    setSelected((current) => toggleDeliverableSelection(current, id, checked));

  const fetchPosting = async () => {
    const url = postingUrl.trim();
    if (!url || fetchBusy || !fetchConfigured) return;
    // The status line already says this page cannot be read, so there is
    // nothing to send: no request, no retry, just the paste fallback.
    if (isUnsupportedSource(url)) return;
    setStartedAt(Date.now());
    setElapsedMs(0);
    setFetchState({ status: "loading" });
    try {
      const result = await requestJobFetch(url, careerOpsDir);
      if (!mountedRef.current) return;
      // The same merge the Target stage uses: a field the user already typed
      // into is left alone, so a mis-click cannot replace their text.
      const merged = mergeTargetIntoJob(
        { title, company, description, sharedInstructions: "", referenceCv: "" },
        result.target,
      );
      const filled = [
        merged.title !== title ? "title" : "",
        merged.company !== company ? "company" : "",
        merged.description !== description ? "description" : "",
      ].filter(Boolean);
      setTitle(merged.title);
      setCompany(merged.company);
      setDescription(merged.description);
      setSourceUrl(merged.sourceUrl ?? "");
      // Warnings come from `buildFetchWarnings` on the server, so the modal and
      // the Target stage say the same thing about the same result.
      setFetchState({ status: "ok", target: result.target, warnings: result.warnings, filled });
    } catch (error) {
      if (!mountedRef.current) return;
      const code = error instanceof JobFetchRequestError ? error.code : "unknown";
      setFetchState({
        status: "error",
        code,
        extractorCode: error instanceof JobFetchRequestError ? error.extractorCode : "",
        failure: describeJobFetchFailure(code, (error as Error).message),
      });
    } finally {
      if (mountedRef.current) {
        setStartedAt(null);
        setElapsedMs(0);
      }
    }
  };

  const submit = () => {
    if (busy || !hasTarget) return;
    // A fetch in flight does not block creation; its late result is dropped by
    // the mount guard above.
    onCreate({
      jobTitle: title.trim(),
      company: company.trim(),
      description,
      sourceUrl,
      // Without a CV the renderer is not a meaningful choice, so the project
      // keeps the workspace default for later instead of asking the user.
      rendererId: cvSelected ? rendererId : defaultRendererId,
      deliverables: selected,
      recipientName: recipient,
    });
  };

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>New application</h2>
        <p className="muted">
          A new project folder will be created for this application or outreach effort,
          with its own prompt, response, and deliverables.
        </p>
        {/* The description has no field here on purpose: the modal stays a
            create form, and the fetched text is edited on the Target stage. */}
        <div className="field" data-testid="new-project-fetch">
          <span>Posting URL</span>
          <div className="row job-fetch-bar">
            <input
              aria-label="Posting URL"
              value={postingUrl}
              onChange={(event) => setPostingUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void fetchPosting();
              }}
              placeholder="https://jobs.example.com/example-company/1234"
              disabled={fetchBusy}
            />
            <button
              className="secondary"
              onClick={() => void fetchPosting()}
              disabled={!fetchConfigured || !postingUrl.trim() || fetchBusy || deniedSource}
            >
              {fetchBusy ? "Fetching…" : fetchState.status === "error" ? "Try again" : "Fetch job"}
            </button>
          </div>
          <p className="panel-note">
            Optional. The posting URL and description are saved with the project, and the
            description can be edited on the Target stage.
          </p>
        </div>

        {deniedSource && (
          <p className="callout warn" data-testid="new-project-fetch-denied">
            {DENIED_SOURCE_MESSAGE}
          </p>
        )}

        {!fetchConfigured && (
          <p className="panel-note" data-testid="new-project-fetch-unconfigured">
            Set the career-ops folder in Settings to fetch a posting. Filling the details in
            by hand still works.
          </p>
        )}

        {fetchBusy && elapsedMs >= SLOW_FETCH_MS && (
          <p className="panel-note" data-testid="new-project-fetch-elapsed">
            Still waiting on the posting — {Math.floor(elapsedMs / 1000)}s elapsed.
          </p>
        )}

        {fetchState.status === "error" && (
          <div
            className="callout error job-fetch-status"
            data-testid="new-project-fetch-status"
            data-code={fetchState.code}
          >
            <p>{fetchState.failure.message}</p>
            {fetchState.failure.nextStep && <p>{fetchState.failure.nextStep}</p>}
            {fetchState.extractorCode && (
              <p className="muted" data-testid="new-project-fetch-extractor-code">
                Extractor reported: {fetchState.extractorCode}
              </p>
            )}
          </div>
        )}
        {fetchState.status === "ok" && (
          <p className="callout" data-testid="new-project-fetch-status">
            Fetched the posting
            {fetchState.target.ats ? ` (${fetchState.target.ats} recognised)` : ""}.{" "}
            {fetchState.filled.length
              ? `Filled: ${fetchState.filled.join(", ")}.`
              : "Every field already had text, so nothing was replaced."}
          </p>
        )}
        {fetchState.status === "ok" && description.trim() !== "" && (
          <p className="panel-note" data-testid="new-project-description-count">
            Job description: {description.length.toLocaleString()} characters, saved with the
            project and editable on the Target stage.
          </p>
        )}
        {fetchState.status === "ok" && fetchState.warnings.length > 0 && (
          <div className="callout warn" data-testid="new-project-fetch-warnings">
            <ul>
              {fetchState.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <label className="field">
          <span>Job title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Machine Learning Engineer"
          />
        </label>
        <label className="field">
          <span>Company</span>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Acme"
          />
        </label>

        <div className="field">
          <span>Deliverables</span>
          <div className="deliverable-grid modal-deliverables">
            {DELIVERABLE_IDS.map((id) => {
              const checked = selected.includes(id);
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
                    onChange={(event) => toggle(id, event.target.checked)}
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
                </label>
              );
            })}
          </div>
        </div>

        {wantsRecipient && (
          <label className="field">
            <span>Recipient name</span>
            <input
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="Jordan Example"
            />
          </label>
        )}

        {cvSelected ? (
          <label className="field">
            <span>Starting renderer</span>
            <select value={rendererId} onChange={(event) => setRendererId(event.target.value)}>
              {RENDERERS.map((renderer) => (
                <option key={renderer.meta.id} value={renderer.meta.id}>
                  {renderer.meta.name} — {renderer.meta.description}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="fineprint" data-testid="new-project-renderer-note">
            CV not requested. The project keeps the workspace default renderer
            ({defaultRendererName}) for later.
          </p>
        )}

        {!hasTarget && (
          <p className="fineprint" data-testid="new-project-blocked">
            Add a job title, company, or recipient name to create a project.
          </p>
        )}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || !hasTarget}>
            {busy ? "Creating…" : "Create application"}
          </button>
        </div>
      </div>
    </div>
  );
}
