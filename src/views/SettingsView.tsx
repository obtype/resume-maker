import { useEffect, useMemo, useState } from "react";
import { checkRenderer } from "../core/render/validateRenderer";
import { RENDERERS } from "../renderers/registry";
import type { RendererModule } from "../core/cv/types";

interface Props {
  workspaceName: string;
  promptTemplate: string;
  templateSource: "bundled" | "override" | "fallback";
  onSaveTemplate: (text: string) => Promise<void>;
  onResetTemplate: () => void;
  onReloadTemplate: () => void;
  onChangeWorkspace: () => void;
}

export function SettingsView({
  workspaceName,
  promptTemplate,
  templateSource,
  onSaveTemplate,
  onResetTemplate,
  onReloadTemplate,
  onChangeWorkspace,
}: Props) {
  const [draft, setDraft] = useState(promptTemplate);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setDraft(promptTemplate);
  }, [promptTemplate]);

  const checks = useMemo(
    () =>
      RENDERERS.map((renderer: RendererModule) => ({
        renderer,
        results: checkRenderer(renderer),
      })),
    [],
  );

  const save = async () => {
    setSaveError("");
    try {
      await onSaveTemplate(draft);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Workspace, prompt template, and renderer checks.</p>
        </div>
      </div>

      <section className="panel">
        <h2>Workspace</h2>
        <p className="panel-note">
          The browser exposes only the folder name, not its absolute path. The handle is remembered,
          but Chrome may ask for permission again after a restart.
        </p>
        <div className="row spread">
          <code>{workspaceName || "(none)"}</code>
          <button className="secondary" onClick={onChangeWorkspace}>Change workspace folder</button>
        </div>
      </section>

      <section className="panel">
        <div className="row spread">
          <div>
            <h2>Prompt template</h2>
            <p className="panel-note">
              This is the single source of the static prompt instructions. Placeholders in
              <code> double braces </code> are filled by the app. Saving writes an override to
              <code> config/cv-prompt.md </code> in your workspace; the bundled default stays untouched.
            </p>
          </div>
          <span className={`badge ${templateSource}`}>{templateSource}</span>
        </div>
        <textarea
          className="mono tall"
          rows={24}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <button className="primary" onClick={() => void save()}>Save override</button>
          <button className="secondary" onClick={onReloadTemplate}>Reload</button>
          <button className="ghost" onClick={onResetTemplate}>Use bundled default</button>
          {savedFlash && <span className="muted">Saved.</span>}
          {saveError && <span className="error-text">Save failed: {saveError}</span>}
        </div>
        <details className="details">
          <summary>Available placeholders</summary>
          <div className="placeholder-grid">
            {[
              "BASICS",
              "PDR",
              "REFERENCE_CV",
              "JOB_TITLE",
              "COMPANY",
              "JOB_DESCRIPTION",
              "EXTRA_INSTRUCTIONS",
              "SCHEMA_NAME",
              "SCHEMA_ID",
              "SCHEMA_JSON",
              "SCHEMA_NOTES",
              "PROMPT_VERSION",
              "DATE",
            ].map((name) => (
              <code key={name}>{`{{${name}}}`}</code>
            ))}
          </div>
        </details>
      </section>

      <section className="panel">
        <h2>Renderer checks</h2>
        <p className="panel-note">
          Every renderer is exercised with a sample CV. This is the same check to run after asking an
          LLM to generate or modify a renderer.
        </p>
        <div className="renderer-checks">
          {checks.map(({ renderer, results }) => (
            <div key={renderer.meta.id} className="renderer-check">
              <div className="renderer-check-head">
                <strong>{renderer.meta.name}</strong>
                <span className="muted">{renderer.meta.id}</span>
                <span className="badge">{renderer.meta.schemas.join(", ")}</span>
              </div>
              <ul>
                {results.map((result, index) => (
                  <li key={index} className={result.level}>
                    {result.level === "ok" ? "✓" : result.level === "warn" ? "!" : "✕"} {result.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Browser support</h2>
        <p className="panel-note">
          Folder persistence uses the File System Access API. Use desktop Chrome or Edge. Firefox and
          Safari can render and print, but cannot write project folders.
        </p>
      </section>
    </div>
  );
}
