import { useEffect, useState } from "react";
import type { Profile, Project } from "../core/project";
import type {
  PromptTemplateSources,
  PromptTemplates,
} from "../core/prompt/builder";
import { getRenderer } from "../renderers/registry";
import { getSchema } from "../core/cv/schema";
import { deliverableHasContent, MESSAGE_DELIVERABLE_IDS } from "../core/deliverables/schema";
import { ApplyStage } from "./stages/ApplyStage";
import { PromptStage } from "./stages/PromptStage";
import { ImportStage } from "./stages/ImportStage";
import { PreviewStage } from "./stages/PreviewStage";

type Stage = "apply" | "prompt" | "import" | "preview";

interface Props {
  project: Project;
  profile: Profile;
  templates: PromptTemplates;
  templateSources: PromptTemplateSources;
  onChange: (updater: (project: Project) => Project) => void;
  onOpenSettings: () => void;
  onSavePdf: (blob: Blob, filename: string) => Promise<boolean>;
}

const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: "apply", label: "1 · Target", hint: "Deliverables, job context, instructions" },
  { id: "prompt", label: "2 · Prompt", hint: "Build, copy, save" },
  { id: "import", label: "3 · Response", hint: "Split, validate, apply" },
  { id: "preview", label: "4 · Preview", hint: "Edit, tune, save PDF" },
];

export function ProjectView({ project, profile, templates, templateSources, onChange, onOpenSettings, onSavePdf }: Props) {
  const [stage, setStage] = useState<Stage>("apply");
  const renderer = getRenderer(project.rendererId);
  const schema = getSchema(project.schemaId);
  const cvSelected = project.deliverables.selected.includes("cv");
  // Preview is CV-only: keep it out of the tab strip for outreach projects
  // that never produced a CV. Existing CV content keeps Preview available.
  const showPreview = deliverableHasContent(project, "cv") || cvSelected;
  const hasCvContent = deliverableHasContent(project, "cv");
  const hasMessages = MESSAGE_DELIVERABLE_IDS.some((id) =>
    deliverableHasContent(project, id),
  );
  const initialStage: Stage = hasCvContent
    ? "preview"
    : hasMessages
      ? "import"
      : "apply";
  const stages = STAGES.filter((item) => item.id !== "preview" || showPreview);

  useEffect(() => {
    // Resume where the project left off: a rendered CV opens Preview, saved
    // messages open Response, and everything else starts on Target.
    setStage(initialStage);
    // Only the project identity matters; later edits stay on the current stage.
  }, [project.id]);

  useEffect(() => {
    if (!showPreview && stage === "preview") setStage("import");
  }, [showPreview, stage]);

  return (
    <div className="view project-view">
      <div className="project-head">
        <div>
          <span className="eyebrow">
            {project.job.company || "Application"} · {project.id}
          </span>
          <h1>{project.job.title || project.name}</h1>
        </div>
        <div className="project-badges">
          <span className="badge">{renderer.meta.name}</span>
          <span className="badge">{schema.name} schema</span>
        </div>
      </div>

      <nav className="stage-tabs">
        {stages.map((item) => (
          <button
            key={item.id}
            className={stage === item.id ? "active" : ""}
            onClick={() => setStage(item.id)}
          >
            <strong>{item.label}</strong>
            <span>{item.hint}</span>
          </button>
        ))}
      </nav>

      {stage === "apply" && (
        <ApplyStage
          project={project}
          profile={profile}
          onChange={onChange}
          onNext={() => setStage("prompt")}
        />
      )}
      {stage === "prompt" && (
        <PromptStage
          project={project}
          profile={profile}
          templates={templates}
          templateSources={templateSources}
          onChange={onChange}
          onNext={() => setStage("import")}
          onOpenSettings={onOpenSettings}
        />
      )}
      {stage === "import" && (
        <ImportStage
          project={project}
          profile={profile}
          selection={project.deliverables.selected}
          onChange={onChange}
          onApplied={() => setStage("preview")}
        />
      )}
      {stage === "preview" && showPreview && (
        <PreviewStage
          project={project}
          profile={profile}
          onChange={onChange}
          onOpenPrompt={() => setStage("prompt")}
          onOpenImport={() => setStage("import")}
          onSavePdf={onSavePdf}
        />
      )}
    </div>
  );
}
