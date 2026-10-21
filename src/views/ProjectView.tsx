import { useEffect, useState } from "react";
import type { Profile, Project } from "../core/project";
import { getRenderer } from "../renderers/registry";
import { getSchema } from "../core/cv/schema";
import { ApplyStage } from "./stages/ApplyStage";
import { PromptStage } from "./stages/PromptStage";
import { ImportStage } from "./stages/ImportStage";
import { PreviewStage } from "./stages/PreviewStage";

type Stage = "apply" | "prompt" | "import" | "preview";

interface Props {
  project: Project;
  profile: Profile;
  template: string;
  templateSource: "bundled" | "override" | "fallback";
  onChange: (updater: (project: Project) => Project) => void;
  onOpenSettings: () => void;
  onSavePdf: (blob: Blob, filename: string) => Promise<boolean>;
}

const STAGES: Array<{ id: Stage; label: string; hint: string }> = [
  { id: "apply", label: "1 · Job", hint: "Role, listing, instructions" },
  { id: "prompt", label: "2 · Prompt", hint: "Generate, copy, save" },
  { id: "import", label: "3 · Import", hint: "Validate the LLM response" },
  { id: "preview", label: "4 · Preview", hint: "Edit, tune, save PDF" },
];

export function ProjectView({ project, profile, template, templateSource, onChange, onOpenSettings, onSavePdf }: Props) {
  const [stage, setStage] = useState<Stage>("apply");
  const renderer = getRenderer(project.rendererId);
  const schema = getSchema(project.schemaId);

  useEffect(() => {
    setStage(project.promptText && project.cv.experience.length ? "preview" : "apply");
  }, [project.id]);

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
        {STAGES.map((item) => (
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
          template={template}
          templateSource={templateSource}
          onChange={onChange}
          onNext={() => setStage("import")}
          onOpenSettings={onOpenSettings}
        />
      )}
      {stage === "import" && (
        <ImportStage project={project} onChange={onChange} onApplied={() => setStage("preview")} />
      )}
      {stage === "preview" && (
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
