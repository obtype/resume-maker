import { useEffect, useState } from "react";
import type { Profile, Project, ProjectSummary, Settings } from "./core/project";
import { Layout, type SaveStatus } from "./components/Layout";
import { NewProjectModal } from "./components/NewProjectModal";
import { Onboarding } from "./views/Onboarding";
import { ProjectsView } from "./views/ProjectsView";
import { ProfileView } from "./views/ProfileView";
import { SettingsView } from "./views/SettingsView";
import { ProjectView } from "./views/ProjectView";
import {
  createProject,
  initializeWorkspace,
  loadProject,
  loadProjectSummaries,
  loadPromptTemplateOverride,
  resetPromptTemplateOverride,
  saveProfile,
  saveProject,
  savePromptTemplateOverride,
  saveSettings,
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
  FALLBACK_PROMPT_TEMPLATE,
  loadBundledPromptTemplate,
} from "./core/prompt/builder";
import { getRenderer } from "./renderers/registry";

type View = "projects" | "project" | "profile" | "settings";
type TemplateSource = "bundled" | "override" | "fallback";

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
  const [promptTemplate, setPromptTemplate] = useState(FALLBACK_PROMPT_TEMPLATE);
  const [templateSource, setTemplateSource] = useState<TemplateSource>("fallback");
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadTemplate = async (workspace: FileSystemDirectoryHandle) => {
    try {
      const override = await loadPromptTemplateOverride(workspace);
      if (override?.trim()) {
        setPromptTemplate(override);
        setTemplateSource("override");
        return;
      }
    } catch {
      // Fall through to the bundled template.
    }
    try {
      const bundled = await loadBundledPromptTemplate();
      setPromptTemplate(bundled);
      setTemplateSource("bundled");
    } catch {
      setPromptTemplate(FALLBACK_PROMPT_TEMPLATE);
      setTemplateSource("fallback");
    }
  };

  const hydrate = async (workspace: FileSystemDirectoryHandle) => {
    const initialized = await initializeWorkspace(workspace);
    setSettings(initialized.settings);
    setProfile(initialized.profile);
    const summaries = await loadProjectSummaries(workspace);
    setProjects(summaries);
    await loadTemplate(workspace);
    const lastId = initialized.settings.lastProjectId;
    if (lastId && summaries.some((summary) => summary.id === lastId)) {
      try {
        const loaded = await loadProject(workspace, lastId, initialized.profile);
        setProject(loaded);
        setView("project");
      } catch {
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

  const updateProject = (updater: (current: Project) => Project) => {
    setProject((current) => {
      if (!current) return current;
      return { ...updater(current), updatedAt: new Date().toISOString() };
    });
  };

  const openProject = async (id: string) => {
    if (!root || !profile) return;
    try {
      if (project && project.id !== id) {
        await saveProject(root, project);
      }
      const loaded = await loadProject(root, id, profile);
      setProject(loaded);
      setView("project");
      if (settings) {
        const next = { ...settings, lastProjectId: id };
        setSettings(next);
        void saveSettings(root, next);
      }
    } catch (error) {
      setSaveStatus({ state: "error", message: (error as Error).message });
    }
  };

  const newProject = async (title: string, company: string, rendererId: string) => {
    if (!root || !profile) return;
    setCreating(true);
    try {
      if (project) await saveProject(root, project);
      const renderer = getRenderer(rendererId);
      const created = await createProject(root, {
        profile,
        jobTitle: title,
        company,
        rendererId,
        schemaId: renderer.meta.schemas[0],
      });
      setProject(created);
      setView("project");
      setShowNew(false);
      setProjects(await loadProjectSummaries(root));
      if (settings) {
        const next = { ...settings, lastProjectId: created.id };
        setSettings(next);
        void saveSettings(root, next);
      }
    } catch (error) {
      setSaveStatus({ state: "error", message: (error as Error).message });
    } finally {
      setCreating(false);
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

  const saveTemplate = async (text: string) => {
    if (!root) return;
    await savePromptTemplateOverride(root, text);
    setPromptTemplate(text);
    setTemplateSource("override");
  };

  const savePdfToProject = async (blob: Blob, filename: string): Promise<boolean> => {
    if (!root || !project) return false;
    const directory = await getDirectory(root, ["projects", project.id], false);
    await writeBinary(directory, [filename], new Uint8Array(await blob.arrayBuffer()));
    return true;
  };
  const resetTemplate = async () => {
    if (!root) return;
    await resetPromptTemplateOverride(root);
    await loadTemplate(root);
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
        onNewProject={() => setShowNew(true)}
        onNavigate={navigate}
      >
        {view === "projects" && (
          <ProjectsView
            projects={projects}
            onOpen={(id) => void openProject(id)}
            onNew={() => setShowNew(true)}
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
            promptTemplate={promptTemplate}
            templateSource={templateSource}
            onSaveTemplate={saveTemplate}
            onResetTemplate={resetTemplate}
            onReloadTemplate={() => void loadTemplate(root)}
            onChangeWorkspace={() => void chooseWorkspace()}
          />
        )}
        {view === "project" && project && (
          <ProjectView
            project={project}
            profile={profile}
            template={promptTemplate}
            templateSource={templateSource}
            onChange={updateProject}
            onOpenSettings={() => setView("settings")}
            onSavePdf={savePdfToProject}
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
        onClose={() => setShowNew(false)}
        onCreate={(title, company, rendererId) => void newProject(title, company, rendererId)}
      />
    </>
  );
}
