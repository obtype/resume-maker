import { useState } from "react";
import type { ProjectSummary } from "../core/project";

interface Props {
  projects: ProjectSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function ProjectsView({ projects, onOpen, onNew }: Props) {
  const [query, setQuery] = useState("");
  const filtered = projects.filter((project) =>
    `${project.name} ${project.company} ${project.title}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>Applications</h1>
          <p className="muted">One project per job application. Everything stays in your workspace folder.</p>
        </div>
        <button className="primary" onClick={onNew}>
          New application
        </button>
      </div>
      {projects.length > 0 && (
        <input
          className="search-input"
          placeholder="Search applications…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>{projects.length ? "No matches" : "No applications yet"}</h2>
          <p>
            {projects.length
              ? "Try a different search."
              : "Create your first project, paste a job description, and generate a tailored CV prompt."}
          </p>
          {!projects.length && <button className="primary" onClick={onNew}>Create application</button>}
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((project) => (
            <button key={project.id} className="project-card" onClick={() => onOpen(project.id)}>
              <span className="project-card-company">{project.company || "No company"}</span>
              <strong>{project.title || project.name}</strong>
              <span className="project-card-meta">
                {project.updatedAt ? new Date(project.updatedAt).toLocaleString() : "Not saved"}
              </span>
              <span className="project-card-renderer">{project.rendererId}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
