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
import { RecipientFields } from "../../components/RecipientFields";

interface Props {
  project: Project;
  profile: Profile;
  onChange: (updater: (project: Project) => Project) => void;
  onNext: () => void;
}

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

export function ApplyStage({ project, profile, onChange, onNext }: Props) {
  const referenceRef = useRef<HTMLInputElement>(null);
  const projectIdRef = useRef(project.id);
  projectIdRef.current = project.id;

  const selected = project.deliverables.selected;
  const settings = project.deliverables.settings;
  const missingCount = missingDeliverableIds(project).length;

  const setJob = (patch: Partial<Project["job"]>) =>
    onChange((current) => ({ ...current, job: { ...current.job, ...patch } }));

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
          className="tall"
          rows={16}
          value={project.job.description}
          onChange={(event) => setJob({ description: event.target.value })}
          placeholder="Paste the full job posting here. Responsibilities, requirements, nice-to-haves, team context — all of it. Leave it empty for pure outreach."
        />
      </label>

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
