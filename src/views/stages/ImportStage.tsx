import { useEffect, useRef, useState } from "react";
import type { Project } from "../../core/project";
import { parseLlmResponse } from "../../core/llm/parseResponse";
import { validateCv, type CvValidation } from "../../core/cv/validate";
import { migrateCv } from "../../core/cv/migrate";
import { defaultStyle } from "../../core/style";

interface Props {
  project: Project;
  onChange: (updater: (project: Project) => Project) => void;
  onApplied: () => void;
}

export function ImportStage({ project, onChange, onApplied }: Props) {
  const [raw, setRaw] = useState(project.rawResponse || "");
  const [parsed, setParsed] = useState<ReturnType<typeof parseLlmResponse> | null>(null);
  const [validation, setValidation] = useState<CvValidation | null>(null);
  const [status, setStatus] = useState("");
  const responseFileRef = useRef<HTMLInputElement>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRaw(project.rawResponse || "");
    setParsed(null);
    setValidation(null);
    setStatus("");
  }, [project.id]);

  const rememberRaw = (text: string) => {
    onChange((current) => ({
      ...current,
      rawResponse: text,
      files: { ...current.files, response: "responses/latest.raw.txt" },
    }));
  };

  const parse = () => {
    const result = parseLlmResponse(raw);
    setParsed(result);
    rememberRaw(raw);
    if (!result.ok) {
      setValidation(null);
      setStatus("Parsing failed. Check the response and try again.");
      return;
    }
    const check = validateCv(result.data, project.schemaId);
    setValidation(check);
    setStatus(
      check.valid
        ? check.warnings.length
          ? `Parsed with ${check.warnings.length} warning(s). You can apply it.`
          : "Parsed and validated successfully."
        : `JSON parsed, but ${check.errors.length} schema error(s) need attention.`,
    );
  };

  const apply = () => {
    if (!validation?.valid) return;
    onChange((current) => ({
      ...current,
      cv: validation.data,
      rawResponse: raw,
      files: { ...current.files, response: "responses/latest.raw.txt" },
    }));
    setStatus("Applied. The Preview stage now uses this content.");
    onApplied();
  };

  const loadCvFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsedFile = JSON.parse(await file.text());
      const migrated = migrateCv(parsedFile, project.schemaId);
      const check = validateCv(migrated.cv, project.schemaId);
      setValidation(check);
      setParsed({ ok: true, data: migrated.cv, extracted: "" });
      if (!check.valid) {
        setStatus("CV file loaded, but it does not validate against the current schema.");
        return;
      }
      onChange((current) => {
        const currentStyle = current.styles[current.rendererId] ?? defaultStyle();
        return {
          ...current,
          cv: check.data,
          styles: {
            ...current.styles,
            [current.rendererId]: migrated.wasLegacy
              ? { ...currentStyle, ...migrated.style }
              : currentStyle,
          },
        };
      });
      setStatus(migrated.wasLegacy ? "Loaded legacy CV JSON and migrated it." : "Loaded CV JSON.");
      onApplied();
    } catch (error) {
      setStatus(`Could not load CV JSON: ${(error as Error).message}`);
    } finally {
      if (cvFileRef.current) cvFileRef.current.value = "";
    }
  };

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <h2>Import LLM response</h2>
          <p className="muted">
            Paste the JSON returned by the model. The schema is <code>{project.schemaId}</code>.
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => responseFileRef.current?.click()}>
            Load response file
          </button>
          <button className="secondary" onClick={() => cvFileRef.current?.click()}>
            Load CV JSON
          </button>
          <input
            ref={responseFileRef}
            hidden
            type="file"
            accept=".txt,.json,.md,text/plain,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) setRaw(await file.text());
              if (responseFileRef.current) responseFileRef.current.value = "";
            }}
          />
          <input
            ref={cvFileRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => void loadCvFile(event.target.files?.[0])}
          />
        </div>
      </div>

      <label className="field">
        <span>Raw response</span>
        <textarea
          className="mono tall"
          rows={16}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          placeholder='Paste the full LLM response here, even if it includes ```json fences or a sentence before the object.'
        />
      </label>

      <div className="row">
        <button className="primary" onClick={parse}>Parse & validate</button>
        <button className="primary" onClick={apply} disabled={!validation?.valid}>
          Apply to CV
        </button>
        <span className="muted">{status}</span>
      </div>

      {parsed?.repaired && (
        <p className="callout warn">
          The JSON was repaired before parsing. Check the content carefully before applying.
        </p>
      )}
      {parsed && !parsed.ok && parsed.error && (
        <p className="callout error">{parsed.error}</p>
      )}

      {validation && (
        <div className="validation-grid">
          <section className={`panel ${validation.valid ? "ok" : "error"}`}>
            <h3>{validation.valid ? "Schema valid" : "Schema errors"}</h3>
            {validation.errors.length ? (
              <ul className="issue-list">
                {validation.errors.map((issue, index) => (
                  <li key={index}>
                    <code>{issue.path}</code> — {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">All required fields are present.</p>
            )}
          </section>
          <section className={`panel ${validation.warnings.length ? "warn" : ""}`}>
            <h3>Warnings</h3>
            {validation.warnings.length ? (
              <ul className="issue-list">
                {validation.warnings.map((issue, index) => (
                  <li key={index}>
                    <code>{issue.path}</code> — {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No warnings.</p>
            )}
          </section>
          <section className="panel">
            <h3>Content summary</h3>
            <ul className="summary-list">
              <li>{validation.data.experience.length} experience entries</li>
              <li>{validation.data.projects.length} projects</li>
              <li>{validation.data.skills.length} skill groups</li>
              <li>
                {validation.data.experience.reduce((sum, entry) => sum + entry.bullets.length, 0)} experience bullets
              </li>
              {validation.data.summary != null && (
                <li>{validation.data.summary.length} characters in summary</li>
              )}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
