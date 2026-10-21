import type { ReactNode } from "react";
import type { ProjectSummary } from "../core/project";

export interface SaveStatus {
  state: "idle" | "saving" | "saved" | "error";
  message?: string;
}

interface Props {
  workspaceName: string;
  projects: ProjectSummary[];
  activeProjectId?: string;
  view: "projects" | "project" | "profile" | "settings";
  saveStatus: SaveStatus;
  onOpenProject: (id: string) => void;
  onNewProject: () => void;
  onNavigate: (view: "projects" | "profile" | "settings") => void;
  children: ReactNode;
}

export function Layout({
  workspaceName,
  projects,
  activeProjectId,
  view,
  saveStatus,
  onOpenProject,
  onNewProject,
  onNavigate,
  children,
}: Props) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">CV</span>
          <div>
            <strong>CV Studio</strong>
            <span className="brand-sub">Tailored CV workbench</span>
          </div>
        </div>
        <nav className="topnav">
          <button className={view === "projects" ? "active" : ""} onClick={() => onNavigate("projects")}>
            Projects
          </button>
          <button className={view === "profile" ? "active" : ""} onClick={() => onNavigate("profile")}>
            Profile
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => onNavigate("settings")}>
            Settings
          </button>
        </nav>
        <div className="topbar-right">
          <span className="workspace-chip" title="Active workspace folder">
            {workspaceName || "No workspace"}
          </span>
          <SaveIndicator status={saveStatus} />
        </div>
      </header>

      <div className="app-body">
        <aside className="project-rail">
          <div className="rail-head">
            <span>Applications</span>
            <button className="icon-button" onClick={onNewProject} title="New application">
              +
            </button>
          </div>
          <div className="rail-list">
            {projects.length === 0 ? (
              <p className="rail-empty">No projects yet.</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  className={`rail-item ${activeProjectId === project.id && view === "project" ? "active" : ""}`}
                  onClick={() => onOpenProject(project.id)}
                  title={project.id}
                >
                  <span className="rail-item-title">{project.title || project.name}</span>
                  <span className="rail-item-sub">{project.company || project.id}</span>
                </button>
              ))
            )}
          </div>
          <button className="new-project-button" onClick={onNewProject}>
            + New application
          </button>
        </aside>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  const label =
    status.state === "saving"
      ? "Saving…"
      : status.state === "saved"
        ? "Saved"
        : status.state === "error"
          ? "Save failed"
          : "Ready";
  return (
    <span className={`save-indicator ${status.state}`} title={status.message}>
      <span className="dot" />
      {label}
    </span>
  );
}
