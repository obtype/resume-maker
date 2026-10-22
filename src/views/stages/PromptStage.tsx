import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile, Project } from "../../core/project";
import {
  buildProjectPrompt,
  estimateTokens,
  promptWarnings,
  resolveDeliverableSelection,
} from "../../core/prompt/builder";
import type {
  PromptTemplateId,
  PromptTemplateSource,
  PromptTemplateSources,
  PromptTemplates,
} from "../../core/prompt/builder";
import { getSchema } from "../../core/cv/schema";
import { deliverableLabel } from "../../core/deliverables/schema";
import { DELIVERABLE_IDS, type DeliverableId } from "../../core/deliverables/types";
import { getRenderer, RENDERERS } from "../../renderers/registry";
import { defaultStyle } from "../../core/style";

const TEMPLATE_LABELS: Record<PromptTemplateId, string> = {
  context: "Shared context",
  cv: "CV",
  coverLetter: "Cover letter",
  coldEmail: "Cold email",
  linkedinMessage: "LinkedIn message",
};

/** `mixed` when the templates used by one request come from different sources. */
type SourceSummary = PromptTemplateSource | "mixed";

interface Props {
  project: Project;
  profile: Profile;
  templates: PromptTemplates;
  templateSources: PromptTemplateSources;
  onChange: (updater: (project: Project) => Project) => void;
  onNext: () => void;
  onOpenSettings: () => void;
}

export function PromptStage({
  project,
  profile,
  templates,
  templateSources,
  onChange,
  onNext,
  onOpenSettings,
}: Props) {
  const renderer = getRenderer(project.rendererId);
  const schema = getSchema(project.schemaId);

  // Defensive: the Target stage prevents an empty selection, but the builder
  // throws on one, so the Prompt stage must never call it with no deliverables.
  let selected: DeliverableId[] = [];
  let selectionError = "";
  try {
    selected = resolveDeliverableSelection(project);
  } catch (error) {
    selectionError = (error as Error).message;
  }
  const hasSelection = selected.length > 0;
  const cvRequested = selected.includes("cv");

  // The builder ignores the CV schema when `cv` is not selected, so a
  // cover-letter-only prompt never emits it. The UI hides the controls below.
  const generated = useMemo(() => {
    if (!hasSelection) return "";
    try {
      return buildProjectPrompt({ profile, project, schema, templates });
    } catch {
      return "";
    }
  }, [profile, project, schema, templates, hasSelection]);

  const usedTemplateIds: PromptTemplateId[] = ["context", ...selected];
  const usedSources = usedTemplateIds.map((id) => templateSources[id]);
  const uniformSource = usedSources.every((source) => source === usedSources[0])
    ? usedSources[0]
    : "mixed";
  const sourceSummary: SourceSummary = uniformSource ?? "mixed";
  const usesFallback = usedSources.includes("fallback");
  const usesOverride = usedSources.includes("override");

  const [draft, setDraft] = useState(project.promptText || generated);
  const [baseline, setBaseline] = useState(project.promptText || generated);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");
  const projectIdRef = useRef(project.id);
  projectIdRef.current = project.id;

  useEffect(() => {
    const initial = project.promptText || generated;
    setDraft(initial);
    setBaseline(initial);
    setCopied(false);
    setStatus("");
    // Only reset when switching projects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const warnings = promptWarnings(profile, project);
  const stale = Boolean(generated) && baseline !== generated;

  const savePrompt = (text: string) => {
    onChange((current) => ({
      ...current,
      promptText: text,
      files: { ...current.files, prompt: "prompts/latest.md" },
    }));
  };

  const generate = () => {
    if (!generated) {
      setStatus("Select at least one deliverable in the Target stage first.");
      return;
    }
    setDraft(generated);
    setBaseline(generated);
    savePrompt(generated);
    setStatus("Prompt regenerated and saved to the project.");
  };

  const copy = async () => {
    if (!generated) {
      setStatus("Select at least one deliverable in the Target stage first.");
      return;
    }
    const targetId = project.id;
    try {
      await navigator.clipboard.writeText(draft);
      if (projectIdRef.current !== targetId) return;
      savePrompt(draft);
      setCopied(true);
      setStatus("Copied. Paste it into your LLM, then bring the JSON back to the Response stage.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      if (projectIdRef.current === targetId) {
        setStatus("Clipboard access failed. Select the prompt and copy it manually.");
      }
    }
  };

  const save = () => {
    savePrompt(draft);
    setStatus("Prompt saved to prompts/latest.md.");
  };

  const changeRenderer = (id: string) => {
    const next = getRenderer(id);
    onChange((current) => {
      const nextSchema = next.meta.schemas.includes(current.schemaId)
        ? current.schemaId
        : next.meta.schemas[0];
      const styles = { ...current.styles };
      if (!styles[id]) styles[id] = defaultStyle();
      return { ...current, rendererId: id, schemaId: nextSchema, styles };
    });
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h2>Prompt</h2>
          <p className="muted">
            The prompt is composed from the shared context template plus one task template per
            selected deliverable. Every template is editable in{" "}
            <button className="link" onClick={onOpenSettings}>Settings → Prompt templates</button>.
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={generate} disabled={!hasSelection}>
            Regenerate
          </button>
          <button className="primary" onClick={copy} disabled={!hasSelection}>
            {copied ? "Copied ✓" : "Copy prompt"}
          </button>
          <button className="secondary" onClick={onNext}>Next: response</button>
        </div>
      </div>

      <div className="prompt-selection" data-testid="selection-summary">
        <span className="muted">Requesting:</span>
        {DELIVERABLE_IDS.map((id) => {
          const isSelected = selected.includes(id);
          return (
            <span
              key={id}
              className={`selection-chip ${isSelected ? "selected" : "unselected"}`}
              data-deliverable={id}
              data-selected={isSelected ? "true" : "false"}
              title={
                isSelected
                  ? `${deliverableLabel(id)} is included in this prompt.`
                  : `${deliverableLabel(id)} is not requested.`
              }
            >
              <span className="selection-mark" aria-hidden>
                {isSelected ? "✓" : "–"}
              </span>
              {deliverableLabel(id)}
            </span>
          );
        })}
        <span className="muted">
          {selected.length} of {DELIVERABLE_IDS.length} selected
        </span>
      </div>

      {cvRequested ? (
        <div className="grid two">
          <label className="field">
            <span>Renderer</span>
            <select value={project.rendererId} onChange={(event) => changeRenderer(event.target.value)}>
              {RENDERERS.map((item) => (
                <option key={item.meta.id} value={item.meta.id}>
                  {item.meta.name} — {item.meta.description}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Output schema for this prompt</span>
            <select
              value={project.schemaId}
              onChange={(event) =>
                onChange((current) => ({ ...current, schemaId: event.target.value }))
              }
            >
              {renderer.meta.schemas.map((id) => {
                const option = getSchema(id);
                return (
                  <option key={id} value={id}>
                    {option.name} — {option.description}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      ) : (
        <div className="callout" data-testid="cv-not-requested">
          <strong>CV not requested.</strong> This prompt contains no CV schema, no CV
          instructions, and no reference CV. The renderer and schema controls apply only to the
          CV deliverable, so they are hidden. Select the CV in stage 1 · Target to include it.
        </div>
      )}

      {selectionError && (
        <div className="callout error" data-testid="prompt-selection-error">
          <strong>No deliverables selected.</strong> {selectionError} Choose at least one
          deliverable in stage 1 · Target, then regenerate the prompt.
        </div>
      )}

      <div className="row spread prompt-meta">
        <span className="muted">
          {draft.length.toLocaleString()} characters · ~{estimateTokens(draft).toLocaleString()} tokens ·{" "}
          {cvRequested ? (
            <>schema <code>{schema.id}</code></>
          ) : (
            "no CV schema"
          )}
        </span>
        <span className="row template-source-list" data-testid="template-sources">
          <span className="muted">Templates:</span>
          <span
            className={`badge ${sourceSummary}`}
            data-testid="template-source-summary"
            title="Source of the templates used by the current request"
          >
            {sourceSummary}
          </span>
          {usedTemplateIds.map((id) => (
            <span
              key={id}
              className={`badge ${templateSources[id]}`}
              data-template={id}
            >
              {TEMPLATE_LABELS[id]}: {templateSources[id]}
            </span>
          ))}
        </span>
      </div>

      {usesOverride && (
        <p className="fineprint">
          Templates marked <strong>override</strong> come from your workspace{" "}
          <code>config/prompts/</code> folder. Edit or reset them in Settings → Prompt templates.
        </p>
      )}

      {stale && (
        <div className="callout warn" data-testid="prompt-stale">
          Inputs changed since this prompt was generated — regenerate to refresh.
        </div>
      )}

      {!selectionError && warnings.length > 0 && (
        <div className="callout warn" data-testid="prompt-warnings">
          <strong>Before sending:</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.id} className={warning.level === "error" ? "error-text" : ""}>
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {usesFallback && (
        <div className="callout error">
          One or more bundled prompt templates could not be loaded. Their fallback text is in use.
        </div>
      )}

      <textarea
        className="mono prompt-box"
        rows={26}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== (project.promptText ?? "")) savePrompt(draft);
        }}
        spellCheck={false}
      />

      <div className="row">
        <button className="secondary" onClick={save} disabled={!hasSelection}>
          Save prompt to project
        </button>
        <span className="muted">{status}</span>
      </div>
      <p className="fineprint">
        The prompt includes your PDR, contact details, job context, shared instructions, and the
        rules from the templates used for this request. Recipient profile and post text is
        third-party personal data. Treat the prompt as sensitive text.
      </p>
    </div>
  );
}
