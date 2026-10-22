import { useEffect, useRef, useState } from "react";
import type { Profile } from "../core/project";

interface Props {
  profile: Profile;
  onChange: (updater: (profile: Profile) => Profile) => void;
  onSave: () => void;
}

function ContactEditor({
  contact,
  onChange,
}: {
  contact: string[];
  onChange: (contact: string[]) => void;
}) {
  const [text, setText] = useState(contact.join("\n"));
  return (
    <textarea
      rows={4}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() =>
        onChange(
          text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        )
      }
      placeholder={"email@example.com\n+1 555 0100\ngithub.com/you\nCity, Country"}
    />
  );
}

export function ProfileView({ profile, onChange, onSave }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setError("");
    try {
      const { importPdrFile } = await import("../core/profile/docx");
      const imported = await importPdrFile(file);
      if (!mountedRef.current) return;
      onChange((current) => ({
        ...current,
        pdr: {
          sourceName: imported.sourceName,
          sourceKind: imported.sourceKind,
          importedAt: new Date().toISOString(),
          markdown: imported.markdown,
        },
      }));
    } catch (importError) {
      if (mountedRef.current) setError((importError as Error).message);
    } finally {
      if (mountedRef.current) setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="view">
      <div className="view-head">
        <div>
          <h1>Profile</h1>
          <p className="muted">
            Shared across all applications. Update the PDR when your source document changes.
          </p>
        </div>
        <button className="secondary" onClick={onSave}>Save now</button>
      </div>

      <div className="grid two">
        <section className="panel">
          <h2>Basics</h2>
          <p className="panel-note">
            The PDR usually does not contain contact details, so these are kept separately and copied
            verbatim into every CV prompt.
          </p>
          <label className="field">
            <span>Name</span>
            <input
              value={profile.basics.name}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  basics: { ...current.basics, name: event.target.value },
                }))
              }
              placeholder="Your full name"
            />
          </label>
          <label className="field">
            <span>Headline (optional)</span>
            <input
              value={profile.basics.headline ?? ""}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  basics: { ...current.basics, headline: event.target.value },
                }))
              }
              placeholder="Computer Vision Engineer"
            />
          </label>
          <label className="field">
            <span>Contact details — one per line</span>
            <ContactEditor
              contact={profile.basics.contact}
              onChange={(contact) =>
                onChange((current) => ({
                  ...current,
                  basics: { ...current.basics, contact },
                }))
              }
            />
          </label>
          <label className="field">
            <span>Default instructions (applied to every deliverable)</span>
            <textarea
              rows={3}
              value={profile.defaultInstructions}
              onChange={(event) =>
                onChange((current) => ({ ...current, defaultInstructions: event.target.value }))
              }
              placeholder="e.g. Keep the tone understated. Do not include a photo. Prefer British spelling."
            />
            <p className="fineprint">
              Appended to the shared instructions for every requested deliverable — the CV, cover
              letter, cold email, and LinkedIn message — not just the CV.
            </p>
          </label>
        </section>

        <section className="panel">
          <h2>Personal Data Record</h2>
          <p className="panel-note">
            Import a .docx, .md, or .txt file. The extracted Markdown is editable, so you can delete
            rough work before it reaches the prompt.
          </p>
          <div className="row">
            <button className="secondary" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? "Importing…" : "Import PDR file"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,.md,.markdown,.txt,text/plain,text/markdown"
              hidden
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
            {profile.pdr.markdown && (
              <button
                className="ghost danger"
                onClick={() =>
                  onChange((current) => ({
                    ...current,
                    pdr: { sourceName: "", sourceKind: "none", importedAt: "", markdown: "" },
                  }))
                }
              >
                Clear PDR
              </button>
            )}
          </div>
          {error && <p className="callout error">{error}</p>}
          <div className="pdr-meta">
            <span>Source: {profile.pdr.sourceName || "none"}</span>
            <span>{profile.pdr.markdown.length.toLocaleString()} characters</span>
            {profile.pdr.importedAt && (
              <span>Imported {new Date(profile.pdr.importedAt).toLocaleDateString()}</span>
            )}
          </div>
          <label className="field">
            <span>Extracted source text</span>
            <textarea
              className="mono tall"
              rows={20}
              value={profile.pdr.markdown}
              onChange={(event) =>
                onChange((current) => {
                  const markdown = event.target.value;
                  const pdr = { ...current.pdr, markdown };
                  if (!pdr.sourceName && markdown.trim()) {
                    pdr.sourceName = "Pasted text";
                    pdr.sourceKind = "pasted";
                    pdr.importedAt = new Date().toISOString();
                  }
                  return { ...current, pdr };
                })
              }
              placeholder="Import a file, or paste your PDR text here."
            />
          </label>
        </section>
      </div>
    </div>
  );
}
