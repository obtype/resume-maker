import { useEffect, useMemo, useState } from "react";
import type { Profile, Project } from "../../core/project";
import { buildCvPrompt, estimateTokens, promptWarnings } from "../../core/prompt/builder";
import { getSchema } from "../../core/cv/schema";
import { getRenderer, RENDERERS } from "../../renderers/registry";
import { defaultStyle } from "../../core/style";

interface Props {
  project: Project;
  profile: Profile;
  template: string;
  templateSource: "bundled" | "override" | "fallback";
  onChange: (updater: (project: Project) => Project) => void;
  onNext: () => void;
  onOpenSettings: () => void;
}

export function PromptStage({
  project,
  profile,
  template,
  templateSource,
  onChange,
  onNext,
  onOpenSettings,
}: Props) {
  const renderer = getRenderer(project.rendererId);
  const schema = getSchema(project.schemaId);
  const generated = useMemo(
    () => buildCvPrompt({ profile, project, schema, template }),
    [profile, project, schema, template],
  );
  const [draft, setDraft] = useState(project.promptText || generated);
  const [baseline, setBaseline] = useState(project.promptText || generated);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

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
  const stale = baseline !== generated;

  const savePrompt = (text: string) => {
    onChange((current) => ({
      ...current,
      promptText: text,
      files: { ...current.files, prompt: "prompts/latest.md" },
    }));
  };

  const generate = () => {
    setDraft(generated);
    setBaseline(generated);
    savePrompt(generated);
    setStatus("Prompt regenerated and saved to the project.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      savePrompt(draft);
      setCopied(true);
      setStatus("Copied. Paste it into your LLM, then bring the JSON back to the Import stage.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setStatus("Clipboard access failed. Select the prompt and copy it manually.");
    }
  };

  const save = () => {
    savePrompt(draft);
    setStatus("Prompt saved to prompts/latest.md.");
  };

  const changeRenderer = (id: string) => {
    const next = getRenderer(id);
    const nextSchema = next.meta.schemas.includes(project.schemaId)
      ? project.schemaId
      : next.meta.schemas[0];
    const styles = { ...project.styles };
    if (!styles[id]) styles[id] = defaultStyle();
    onChange((current) => ({ ...current, rendererId: id, schemaId: nextSchema, styles }));
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h2>Prompt</h2>
          <p className="muted">
            The prompt is generated from the single template in{" "}
            <button className="link" onClick={onOpenSettings}>Settings → Prompt template</button>.
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={generate}>Regenerate</button>
          <button className="primary" onClick={copy}>{copied ? "Copied ✓" : "Copy prompt"}</button>
          <button className="secondary" onClick={onNext}>Next: import</button>
        </div>
      </div>

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

      <div className="row spread">
        <span className="muted">
          {draft.length.toLocaleString()} characters · ~{estimateTokens(draft).toLocaleString()} tokens ·
          schema <code>{schema.id}</code> · template{" "}
          <span className={`badge ${templateSource}`}>{templateSource}</span>
        </span>
        {stale && (
          <span className="badge warn">Inputs changed since this prompt was generated — regenerate to refresh.</span>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="callout warn">
          <strong>Before sending:</strong>
          <ul>
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      {templateSource === "fallback" && (
        <div className="callout error">
          The bundled prompt template could not be loaded. The fallback template is in use.
        </div>
      )}

      <textarea
        className="mono prompt-box"
        rows={26}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
      />

      <div className="row">
        <button className="secondary" onClick={save}>Save prompt to project</button>
        <span className="muted">{status}</span>
      </div>
      <p className="fineprint">
        The prompt includes your PDR, contact details, job description, schema, and every rule from the
        template. Treat it as sensitive text.
      </p>
    </div>
  );
}
