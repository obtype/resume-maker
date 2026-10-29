import { useEffect, useMemo, useState } from "react";
import { checkRenderer } from "../core/render/validateRenderer";
import { RENDERERS } from "../renderers/registry";
import type { RendererModule } from "../core/cv/types";
import type {
  PromptTemplateId,
  PromptTemplateSources,
  PromptTemplates,
} from "../core/prompt/builder";
import type { LegacyPromptArchiveResult } from "../core/workspace/projects";

interface TemplateTab {
  id: PromptTemplateId;
  label: string;
  hint: string;
  placeholders: string[];
}

const TEMPLATE_TABS: TemplateTab[] = [
  {
    id: "context",
    label: "Shared context",
    hint: "Emitted once for every request: role, universal rules, candidate basics, PDR, job, shared instructions, and the existing CV.",
    placeholders: [
      "BASICS",
      "PDR",
      "JOB_TITLE",
      "COMPANY",
      "JOB_DESCRIPTION",
      "SHARED_INSTRUCTIONS",
      "EXISTING_CV",
    ],
  },
  {
    id: "cv",
    label: "CV",
    hint: "CV task, reference CV, CV instructions, the selected schema, and schema-specific notes.",
    placeholders: [
      "REFERENCE_CV",
      "CV_INSTRUCTIONS",
      "SCHEMA_NAME",
      "SCHEMA_ID",
      "SCHEMA_JSON",
      "SCHEMA_NOTES",
    ],
  },
  {
    id: "coverLetter",
    label: "Cover letter",
    hint: "Cover-letter task, tone and length rules, per-deliverable instructions, and the output shape.",
    placeholders: ["COVER_LETTER_INSTRUCTIONS", "COVER_LETTER_SCHEMA"],
  },
  {
    id: "coldEmail",
    label: "Cold email",
    hint: "Cold-email task, recipient block, instructions, and the output shape. A missing job description is valid.",
    placeholders: [
      "COLD_EMAIL_INSTRUCTIONS",
      "COLD_EMAIL_SCHEMA",
      "RECIPIENT",
    ],
  },
  {
    id: "linkedinMessage",
    label: "LinkedIn message",
    hint: "LinkedIn follow-up task, recipient block, instructions, and the output shape after a connection request was accepted.",
    placeholders: [
      "LINKEDIN_INSTRUCTIONS",
      "LINKEDIN_SCHEMA",
      "RECIPIENT",
    ],
  },
];

interface Props {
  workspaceName: string;
  templates: PromptTemplates;
  templateSources: PromptTemplateSources;
  legacyArchive: LegacyPromptArchiveResult | null;
  legacyArchiveError: string;
  /** Absolute path to a career-ops checkout; empty disables job fetching. */
  careerOpsDir: string;
  onSaveTemplate: (id: PromptTemplateId, text: string) => Promise<void>;
  onResetTemplate: (id: PromptTemplateId) => Promise<void>;
  onReloadTemplate: (id: PromptTemplateId) => void;
  onChangeCareerOpsDir: (value: string) => void;
  onChangeWorkspace: () => void;
}

export function SettingsView({
  workspaceName,
  templates,
  templateSources,
  legacyArchive,
  legacyArchiveError,
  careerOpsDir,
  onSaveTemplate,
  onResetTemplate,
  onReloadTemplate,
  onChangeCareerOpsDir,
  onChangeWorkspace,
}: Props) {
  const [activeTab, setActiveTab] = useState<PromptTemplateId>("context");
  const [draft, setDraft] = useState(templates.context);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState("");

  const active = TEMPLATE_TABS.find((tab) => tab.id === activeTab) ?? TEMPLATE_TABS[0];

  useEffect(() => {
    setDraft(templates[activeTab]);
    setSavedFlash(false);
    setSaveError("");
  }, [activeTab, templates]);

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
      await onSaveTemplate(activeTab, draft);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  const reset = async () => {
    setSaveError("");
    try {
      await onResetTemplate(activeTab);
    } catch (error) {
      setSaveError((error as Error).message);
    }
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Workspace, prompt templates, and renderer checks.</p>
        </div>
      </div>

      {legacyArchive?.archived && (
        <div
          className="callout notice legacy-archive-notice"
          data-testid="legacy-archive-notice"
        >
          <strong>Legacy prompt override archived.</strong> The old single-file override{" "}
          <code>config/cv-prompt.md</code> was moved to{" "}
          <code>{legacyArchive.archivePath}</code>. The five split templates are now active, so
          the archived file is no longer used.
        </div>
      )}
      {legacyArchiveError && (
        <div
          className="callout error legacy-archive-notice"
          data-testid="legacy-archive-error"
        >
          <strong>Could not archive <code>config/cv-prompt.md</code>.</strong> The original file was
          left in place and nothing was deleted. Fix the workspace write error and reconnect to try
          again. <span className="error-text">{legacyArchiveError}</span>
        </div>
      )}

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

      <section className="panel" data-testid="career-ops-settings">
        <h2>Job intake</h2>
        <p className="panel-note">
          Fetching a posting URL uses the local career-ops checkout on this machine. It is an
          optional dependency: point this at a career-ops folder that contains{" "}
          <code>browser-extract.mjs</code>. Leave it empty to disable fetching — pasting the job
          description by hand keeps working.
        </p>
        <label className="field">
          <span>career-ops folder</span>
          <input
            value={careerOpsDir}
            onChange={(event) => onChangeCareerOpsDir(event.target.value)}
            placeholder="/path/to/career-ops"
            spellCheck={false}
          />
        </label>
        <p className="panel-note">
          Fetching sends only the posting URL to the job site. The description comes back from the
          extractor as plain text, with no model involved, and is stored in this workspace.
        </p>
      </section>

      <section className="panel template-editor">
        <div>
          <h2>Prompt templates</h2>
          <p className="panel-note">
            Each deliverable has its own static template, plus one shared context template. The app
            fills placeholders in <code>double braces</code>, then appends the output contract and a
            metadata footer. Saving writes an override to <code>config/prompts/&lt;id&gt;.md</code> in
            your workspace; the bundled default stays untouched.
          </p>
        </div>

        <div className="template-tabs" role="tablist" aria-label="Prompt templates">
          {TEMPLATE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => {
                setActiveTab(tab.id);
                setDraft(templates[tab.id]);
                setSavedFlash(false);
                setSaveError("");
              }}
            >
              <span>{tab.label}</span>
              <span className={`badge ${templateSources[tab.id]}`}>
                {templateSources[tab.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="template-tab-head">
          <p className="panel-note">{active.hint}</p>
          <span className={`badge ${templateSources[active.id]}`}>
            {templateSources[active.id]}
          </span>
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
          <button className="secondary" onClick={() => onReloadTemplate(active.id)}>Reload</button>
          <button className="ghost" onClick={() => void reset()}>Use bundled default</button>
          {savedFlash && <span className="muted">Saved.</span>}
          {saveError && <span className="error-text">Save failed: {saveError}</span>}
        </div>
        <details className="details">
          <summary>Available placeholders for {active.label}</summary>
          <div className="placeholder-grid">
            {active.placeholders.map((name) => (
              <code key={name}>{`{{${name}}}`}</code>
            ))}
          </div>
          <p className="panel-note">
            Unknown placeholders stay visible. The app also appends the generated output contract
            and a metadata footer with the prompt version and date.
          </p>
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
