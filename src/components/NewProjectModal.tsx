import { useEffect, useState } from "react";
import { RENDERERS } from "../renderers/registry";

interface Props {
  open: boolean;
  busy: boolean;
  defaultRendererId: string;
  onClose: () => void;
  onCreate: (title: string, company: string, rendererId: string) => void;
}

export function NewProjectModal({ open, busy, defaultRendererId, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [rendererId, setRendererId] = useState(defaultRendererId);

  useEffect(() => {
    if (!open) return;
    setRendererId(defaultRendererId);
    setTitle("");
    setCompany("");
  }, [open, defaultRendererId]);

  if (!open) return null;

  const submit = () => {
    if (busy) return;
    if (!title.trim() && !company.trim()) return;
    onCreate(title.trim(), company.trim(), rendererId);
  };

  return (
    <div className="modal-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2>New application</h2>
        <p className="muted">
          A new project folder will be created with its own prompt, response, CV, and renderer style.
        </p>
        <label className="field">
          <span>Job title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Machine Learning Engineer"
          />
        </label>
        <label className="field">
          <span>Company</span>
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="Acme"
          />
        </label>
        <label className="field">
          <span>Starting renderer</span>
          <select value={rendererId} onChange={(event) => setRendererId(event.target.value)}>
            {RENDERERS.map((renderer) => (
              <option key={renderer.meta.id} value={renderer.meta.id}>
                {renderer.meta.name} — {renderer.meta.description}
              </option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || (!title.trim() && !company.trim())}>
            {busy ? "Creating…" : "Create application"}
          </button>
        </div>
      </div>
    </div>
  );
}
