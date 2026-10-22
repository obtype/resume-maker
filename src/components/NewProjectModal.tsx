import { useState } from "react";
import { RENDERERS } from "../renderers/registry";
import {
  createDefaultDeliverableSelection,
  deliverableLabel,
} from "../core/deliverables/schema";
import { toggleDeliverableSelection } from "../core/deliverables/selection";
import { DELIVERABLE_IDS, type DeliverableId } from "../core/deliverables/types";

/** Everything the modal collects before the project folder is created. */
export interface NewProjectPayload {
  jobTitle: string;
  company: string;
  rendererId: string;
  deliverables: DeliverableId[];
  recipientName: string;
}

interface Props {
  open: boolean;
  busy: boolean;
  defaultRendererId: string;
  onClose: () => void;
  onCreate: (payload: NewProjectPayload) => void;
}

type FormProps = Omit<Props, "open">;

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

function NewProjectForm({ busy, defaultRendererId, onClose, onCreate }: FormProps) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rendererId, setRendererId] = useState(defaultRendererId);
  const [selected, setSelected] = useState<DeliverableId[]>(() => [
    ...createDefaultDeliverableSelection().selected,
  ]);
  const [recipientName, setRecipientName] = useState("");

  const cvSelected = selected.includes("cv");
  const wantsRecipient =
    selected.includes("coldEmail") || selected.includes("linkedinMessage");
  // A hidden recipient field must not satisfy the target requirement.
  const recipient = wantsRecipient ? recipientName.trim() : "";
  const hasTarget = Boolean(title.trim() || company.trim() || recipient);
  const defaultRendererName =
    RENDERERS.find((renderer) => renderer.meta.id === defaultRendererId)?.meta.name ??
    defaultRendererId;

  const toggle = (id: DeliverableId, checked: boolean) =>
    setSelected((current) => toggleDeliverableSelection(current, id, checked));

  const submit = () => {
    if (busy || !hasTarget) return;
    onCreate({
      jobTitle: title.trim(),
      company: company.trim(),
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
