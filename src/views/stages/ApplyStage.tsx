import { useRef } from "react";
import type { Profile, Project } from "../../core/project";

interface Props {
  project: Project;
  profile: Profile;
  onChange: (updater: (project: Project) => Project) => void;
  onNext: () => void;
}

export function ApplyStage({ project, profile, onChange, onNext }: Props) {
  const referenceRef = useRef<HTMLInputElement>(null);

  const setJob = (patch: Partial<Project["job"]>) =>
    onChange((current) => ({ ...current, job: { ...current.job, ...patch } }));

  const importReference = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setJob({ referenceCv: text });
    if (referenceRef.current) referenceRef.current.value = "";
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h2>Job target</h2>
          <p className="muted">
            Paste the listing once. The prompt builder labels it clearly for the LLM.
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
          placeholder="Paste the full job posting here. Responsibilities, requirements, nice-to-haves, team context — all of it."
        />
      </label>

      <label className="field">
        <span>Extra instructions for this application</span>
        <textarea
          rows={4}
          value={project.job.instructions}
          onChange={(event) => setJob({ instructions: event.target.value })}
          placeholder="e.g. Emphasise computer vision and edge deployment. Omit the solar project. Keep the summary to two sentences."
        />
      </label>

      <div className="panel inset">
        <div className="row spread">
          <div>
            <h3>Reference CV (optional)</h3>
            <p className="panel-note">
              Used for voice and structure only. The prompt explicitly tells the model not to treat it
              as a source of new facts.
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
