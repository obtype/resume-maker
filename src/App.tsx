import { useEffect, useRef, useState } from "react";
import type { Profile, Project, ProjectSummary, Settings } from "./core/project";
import { Layout, type SaveStatus } from "./components/Layout";
import { NewProjectModal, type NewProjectPayload } from "./components/NewProjectModal";
import { Onboarding } from "./views/Onboarding";
import { ProjectsView } from "./views/ProjectsView";
import { ProfileView } from "./views/ProfileView";
import { SettingsView } from "./views/SettingsView";
import { ProjectView } from "./views/ProjectView";
import {
  archiveLegacyPromptOverride,
  createProject,
  initializeWorkspace,
  loadProject,
  loadProjectSummaries,
  loadPromptTemplates,
  resetPromptTemplateOverride,
  saveProfile,
  saveProject,
  savePromptTemplateOverride,
  saveSettings,
  type LegacyPromptArchiveResult,
  type PromptTemplateOverrides,
} from "./core/workspace/projects";
import { loadHandle, saveHandle } from "./core/workspace/idb";
import {
  pickWorkspaceDirectory,
  supportsFileSystemAccess,
  verifyPermission,
  getDirectory,
  writeBinary,
} from "./core/workspace/fs";
import {
  FALLBACK_TEMPLATES,
  PROMPT_TEMPLATE_IDS,
  loadBundledPromptTemplate,
  type PromptTemplateId,
  type PromptTemplateSource,
  type PromptTemplateSources,
  type PromptTemplates,
} from "./core/prompt/builder";
import { getRenderer } from "./renderers/registry";

type View = "projects" | "project" | "profile" | "settings";

const EMPTY_OVERRIDES = Object.fromEntries(
  PROMPT_TEMPLATE_IDS.map((id) => [id, null]),
) as PromptTemplateOverrides;

const FALLBACK_SOURCES = Object.fromEntries(
  PROMPT_TEMPLATE_IDS.map((id) => [id, "fallback"]),
) as PromptTemplateSources;

export default function App() {
  const [root, setRoot] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState("");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<View>("projects");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplates>({
    ...FALLBACK_TEMPLATES,
  });
  const [templateSources, setTemplateSources] =
    useState<PromptTemplateSources>(FALLBACK_SOURCES);
  const [legacyArchive, setLegacyArchive] =
    useState<LegacyPromptArchiveResult | null>(null);
  const [legacyArchiveError, setLegacyArchiveError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const opToken = useRef(0);
  const rootRef = useRef<FileSystemDirectoryHandle | null>(null);
  rootRef.current = root;

  /** Bundled text for one template, or the minimal per-template fallback. */
  const resolveTemplate = async (
    id: PromptTemplateId,
    override: string | null,
  ): Promise<{ text: string; source: PromptTemplateSource }> => {
    let text = FALLBACK_TEMPLATES[id];
    let source: PromptTemplateSource = "fallback";
    try {
      text = await loadBundledPromptTemplate(id);
      source = "bundled";
    } catch {
      // Keep the minimal fallback for this template only.
    }
    if (override?.trim()) return { text: override, source: "override" };
    return { text, source };
  };

  const loadTemplates = async (workspace: FileSystemDirectoryHandle) => {
    let overrides = EMPTY_OVERRIDES;
    try {
      overrides = await loadPromptTemplates(workspace);
    } catch {
      // Unreadable overrides fall back to the bundled files.
    }
    const templates: PromptTemplates = { ...FALLBACK_TEMPLATES };
    const sources = { ...FALLBACK_SOURCES };
    for (const id of PROMPT_TEMPLATE_IDS) {
      const resolved = await resolveTemplate(id, overrides[id]);
      templates[id] = resolved.text;
      sources[id] = resolved.source;
    }
    setPromptTemplates(templates);
    setTemplateSources(sources);
  };

  /** Reloads one template so an external edit is picked up without tabs reset. */
  const reloadTemplate = async (id: PromptTemplateId) => {
    if (!root) return;
    let overrides = EMPTY_OVERRIDES;
    try {
      overrides = await loadPromptTemplates(root);
    } catch {
      // Fall through to the bundled file.
    }
    const resolved = await resolveTemplate(id, overrides[id]);
    setPromptTemplates((current) => ({ ...current, [id]: resolved.text }));
    setTemplateSources((current) => ({ ...current, [id]: resolved.source }));
  };

  const hydrate = async (workspace: FileSystemDirectoryHandle) => {
    const token = ++opToken.current;
    const initialized = await initializeWorkspace(workspace);
    if (token !== opToken.current) return;
    setSettings(initialized.settings);
    setProfile(initialized.profile);
    const summaries = await loadProjectSummaries(workspace);
    if (token !== opToken.current) return;
    setProjects(summaries);

    // Move the pre-deliverables `config/cv-prompt.md` out of the way exactly
    // once; the per-template overrides are the only active override slot.
    try {
      const archived = await archiveLegacyPromptOverride(workspace);
      if (token !== opToken.current) return;
      if (archived.archived) {
        setLegacyArchive(archived);
        setLegacyArchiveError("");
      }
    } catch (error) {
      if (token !== opToken.current) return;
      setLegacyArchive(null);
      setLegacyArchiveError((error as Error).message);
    }

    await loadTemplates(workspace);
    if (token !== opToken.current) return;
    const lastId = initialized.settings.lastProjectId;
    if (lastId && summaries.some((summary) => summary.id === lastId)) {
      try {
        const loaded = await loadProject(workspace, lastId, initialized.profile);
        if (token !== opToken.current) return;
        setProject(loaded);
        setView("project");
      } catch {
        if (token !== opToken.current) return;
        setView("projects");
      }
    } else {
      setView("projects");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        if (!supportsFileSystemAccess()) {
          setLoading(false);
          return;
        }
        const handle = await loadHandle<FileSystemDirectoryHandle>("workspace");
        if (!handle || cancelled) {
          setLoading(false);
          return;
        }
        setRoot(handle);
        setWorkspaceName(handle.name);
        const granted = await verifyPermission(handle, "readwrite", false);
        if (!granted) {
          setNeedsPermission(true);
          setLoading(false);
          return;
        }
        await hydrate(handle);
      } catch (error) {
        if (!cancelled) setBootError((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!root || !project) return;
    setSaveStatus({ state: "saving" });
    const timer = window.setTimeout(async () => {
      try {
        await saveProject(root, project);
        setSaveStatus({ state: "saved" });
        setProjects((current) =>
          current
            .map((summary) =>
              summary.id === project.id
                ? {
                    ...summary,
                    name: project.name,
                    company: project.job.company,
                    title: project.job.title,
                    updatedAt: project.updatedAt,
                    rendererId: project.rendererId,
                  }
                : summary,
            )
            .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
        );
      } catch (error) {
        setSaveStatus({ state: "error", message: (error as Error).message });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [project, root]);

  useEffect(() => {
    if (!root || !profile) return;
    const timer = window.setTimeout(async () => {
      try {
        await saveProfile(root, profile);
      } catch (error) {
        setSaveStatus({ state: "error", message: (error as Error).message });
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [profile, root]);

  const chooseWorkspace = async () => {
    opToken.current += 1;
    setBusy(true);
    setBootError("");
    try {
      const handle = await pickWorkspaceDirectory();
      const granted = await verifyPermission(handle, "readwrite", true);
      if (!granted) throw new Error("Workspace permission was not granted.");
      if (root && project) {
        try {
          await saveProject(root, project);
        } catch {
          // Switching folders should still work if the old folder is read-only.
        }
      }
      await saveHandle("workspace", handle);
      // Clear the old workspace state before changing root so the profile
      // autosave effect cannot write the previous profile into the new folder.
      setLoading(true);
      setProject(null);
      setProfile(null);
      setSettings(null);
      setProjects([]);
      setLegacyArchive(null);
      setLegacyArchiveError("");
      setShowNew(false);
      setCreating(false);
      setRoot(handle);
      setWorkspaceName(handle.name);
      setNeedsPermission(false);
      await hydrate(handle);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        const message = (error as Error).message;
        setBootError(message);
        setSaveStatus({ state: "error", message });
      }
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  const reconnect = async () => {
    if (!root) return;
    opToken.current += 1;
    setBusy(true);
    setBootError("");
    try {
      const granted = await verifyPermission(root, "readwrite", true);
      if (!granted) throw new Error("Permission was not granted.");
      setLoading(true);
      setNeedsPermission(false);
      await hydrate(root);
    } catch (error) {
      setBootError((error as Error).message);
      setNeedsPermission(true);
    } finally {
      setLoading(false);
      setBusy(false);
    }
  };

  const openNewProject = () => {
    setCreating(false);
    setShowNew(true);
  };

  const updateProject = (updater: (current: Project) => Project) => {
    setProject((current) => {
      if (!current) return current;
      return { ...updater(current), updatedAt: new Date().toISOString() };
    });
  };

  const openProject = async (id: string) => {
    if (!root || !profile) return;
    const workspace = root;
    const token = ++opToken.current;
    setCreating(false);
    setShowNew(false);
    try {
      if (project && project.id !== id) {
        await saveProject(workspace, project);
      }
      if (token !== opToken.current || rootRef.current !== workspace) return;
      const loaded = await loadProject(workspace, id, profile);
      if (token !== opToken.current || rootRef.current !== workspace) return;
      setProject(loaded);
      setView("project");
      if (settings) {
        const next = { ...settings, lastProjectId: id };
        setSettings(next);
        void saveSettings(workspace, next);
      }
    } catch (error) {
      if (token === opToken.current) {
        setSaveStatus({ state: "error", message: (error as Error).message });
      }
    }
  };

  const newProject = async (payload: NewProjectPayload) => {
    if (!root || !profile) return;
    const workspace = root;
    const token = ++opToken.current;
    setCreating(true);
    try {
      if (project) await saveProject(workspace, project);
      if (token !== opToken.current || rootRef.current !== workspace) return;
      const renderer = getRenderer(payload.rendererId);
      const created = await createProject(workspace, {
        profile,
        jobTitle: payload.jobTitle,
        company: payload.company,
        description: payload.description,
        sourceUrl: payload.sourceUrl,
        rendererId: renderer.meta.id,
        schemaId: renderer.meta.schemas[0],
        deliverables: payload.deliverables,
        recipientName: payload.recipientName,
      });
      if (token !== opToken.current || rootRef.current !== workspace) return;
      setProject(created);
      setView("project");
      setShowNew(false);
      const summaries = await loadProjectSummaries(workspace);
      if (token !== opToken.current || rootRef.current !== workspace) return;
      setProjects(summaries);
      if (settings) {
        const next = { ...settings, lastProjectId: created.id };
        setSettings(next);
        void saveSettings(workspace, next);
      }
    } catch (error) {
      if (token === opToken.current) {
        setSaveStatus({ state: "error", message: (error as Error).message });
      }
    } finally {
      if (token === opToken.current) setCreating(false);
    }
  };

  const navigate = (nextView: "projects" | "profile" | "settings") => {
    void saveProjectNow();
    setView(nextView);
    if (nextView === "projects") {
      setProject(null);
    }
  };

  const saveProjectNow = async () => {
    if (!root || !project) return;
    try {
      await saveProject(root, project);
      setSaveStatus({ state: "saved" });
    } catch (error) {
      setSaveStatus({ state: "error", message: (error as Error).message });
    }
  };

  const saveTemplate = async (id: PromptTemplateId, text: string) => {
    if (!root) return;
    await savePromptTemplateOverride(root, id, text);
    setPromptTemplates((current) => ({ ...current, [id]: text }));
    setTemplateSources((current) => ({ ...current, [id]: "override" }));
  };

  /** Settings are small and typed once, so write through on every change. */
  const changeCareerOpsDir = (value: string) => {
    if (!root || !settings) return;
    const next = { ...settings, careerOpsDir: value };
    setSettings(next);
    void saveSettings(root, next);
  };

  const savePdfToProject = async (blob: Blob, filename: string): Promise<boolean> => {
    if (!root || !project) return false;
    const directory = await getDirectory(root, ["projects", project.id], false);
    await writeBinary(directory, [filename], new Uint8Array(await blob.arrayBuffer()));
    return true;
  };
  const resetTemplate = async (id: PromptTemplateId) => {
    if (!root) return;
    await resetPromptTemplateOverride(root, id);
    await reloadTemplate(id);
  };

  if (loading) {
    return <div className="boot-screen"><div className="spinner" />Loading CV Studio…</div>;
  }

  if (!root) {
    return (
      <Onboarding
        busy={busy}
        error={bootError}
        supported={supportsFileSystemAccess()}
        onChoose={() => void chooseWorkspace()}
      />
    );
  }

  if (needsPermission) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <h1>Reconnect workspace</h1>
          <p className="lead">
            Chrome needs permission to read and write <code>{workspaceName}</code> again.
          </p>
          {bootError && <p className="callout error">{bootError}</p>}
          <div className="row">
            <button className="primary" onClick={() => void reconnect()} disabled={busy}>
              {busy ? "Connecting…" : "Reconnect"}
            </button>
            <button className="ghost" onClick={() => void chooseWorkspace()} disabled={busy}>
              Choose a different folder
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!profile || !settings) {
    return (
      <div className="onboarding">
        <div className="onboarding-card">
          <h1>Could not open workspace</h1>
          <p className="lead">{workspaceName ? `CV Studio could not read “${workspaceName}”.` : "The workspace could not be loaded."}</p>
          {bootError && <p className="callout error">{bootError}</p>}
          <div className="row">
            <button className="primary" onClick={() => void chooseWorkspace()} disabled={busy}>
              Choose a different folder
            </button>
            {root && (
              <button
                className="ghost"
                onClick={() =>
                  void hydrate(root).catch((error: Error) => setBootError(error.message))
                }
                disabled={busy}
              >
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        workspaceName={workspaceName}
        projects={projects}
        activeProjectId={project?.id}
        view={view}
        saveStatus={saveStatus}
        onOpenProject={(id) => void openProject(id)}
        onNewProject={openNewProject}
        onNavigate={navigate}
      >
        {view === "projects" && (
          <ProjectsView
            projects={projects}
            onOpen={(id) => void openProject(id)}
            onNew={openNewProject}
          />
        )}
        {view === "profile" && (
          <ProfileView
            profile={profile}
            onChange={(updater) => setProfile((current) => (current ? updater(current) : current))}
            onSave={() => void saveProfile(root, profile)}
          />
        )}
        {view === "settings" && (
          <SettingsView
            workspaceName={workspaceName}
            templates={promptTemplates}
            templateSources={templateSources}
            legacyArchive={legacyArchive}
            legacyArchiveError={legacyArchiveError}
            careerOpsDir={settings.careerOpsDir}
            onSaveTemplate={saveTemplate}
            onResetTemplate={resetTemplate}
            onReloadTemplate={(id) => void reloadTemplate(id)}
            onChangeCareerOpsDir={changeCareerOpsDir}
            onChangeWorkspace={() => void chooseWorkspace()}
          />
        )}
        {view === "project" && project && (
          <ProjectView
            project={project}
            profile={profile}
            templates={promptTemplates}
            templateSources={templateSources}
            onChange={updateProject}
            onOpenSettings={() => setView("settings")}
            onSavePdf={savePdfToProject}
            careerOpsDir={settings.careerOpsDir}
          />
        )}
        {view === "project" && !project && (
          <div className="empty-state">
            <h2>No application selected</h2>
            <p>Choose a project from the sidebar or create a new one.</p>
          </div>
        )}
      </Layout>

      <NewProjectModal
        open={showNew}
        busy={creating}
        defaultRendererId={settings.defaultRendererId}
        careerOpsDir={settings.careerOpsDir}
        onClose={() => setShowNew(false)}
        onCreate={(payload) => void newProject(payload)}
      />
    </>
  );
}
