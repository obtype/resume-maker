import { useEffect, useRef, useState } from "react";
import type { Profile, Project } from "../../core/project";
import { parseLlmResponse, type ParsedResponse } from "../../core/llm/parseResponse";
import { validateCv, type CvValidation } from "../../core/cv/validate";
import { migrateCv } from "../../core/cv/migrate";
import { defaultStyle } from "../../core/style";
import {
  normalizeColdEmail,
  normalizeCoverLetter,
  normalizeLinkedinMessage,
  splitResponseForSelection,
} from "../../core/deliverables/normalize";
import {
  MESSAGE_DELIVERABLE_IDS,
  deliverableLabel,
} from "../../core/deliverables/schema";
import type {
  ColdEmailContent,
  DeliverableId,
  MessageDeliverableId,
} from "../../core/deliverables/types";
import { projectDeliverableFilename } from "../../core/workspace/projects";
import { DeliverableCard } from "./DeliverableCard";

interface Props {
  project: Project;
  profile: Profile;
  /** Deliverables requested by the last prompt. */
  selection: readonly DeliverableId[];
  onChange: (updater: (project: Project) => Project) => void;
  onApplied: () => void;
}

interface ParsedCards {
  cv: CvValidation | null;
  cvMissing: boolean;
  messages: Partial<Record<MessageDeliverableId, string | ColdEmailContent | null>>;
  unrequested: DeliverableId[];
  seq: number;
}

function normalizeMessagePart(
  id: MessageDeliverableId,
  value: unknown,
): string | ColdEmailContent {
  switch (id) {
    case "coverLetter":
      return normalizeCoverLetter(value);
    case "coldEmail":
      return normalizeColdEmail(value);
    case "linkedinMessage":
      return normalizeLinkedinMessage(value);
  }
}

function cvStatus(cards: ParsedCards): string {
  if (cards.cvMissing) return "missing";
  if (!cards.cv) return "missing";
  if (!cards.cv.valid) return "errors";
  if (cards.cv.warnings.length) return "warnings";
  return "valid";
}

function cvStatusLabel(status: string): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "warnings":
      return "Warnings";
    case "errors":
      return "Errors";
    default:
      return "Missing";
  }
}

export function ImportStage({ project, profile, selection, onChange, onApplied }: Props) {
  const [raw, setRaw] = useState(project.rawResponse || "");
  const [parsed, setParsed] = useState<ParsedResponse | null>(null);
  const [cards, setCards] = useState<ParsedCards | null>(null);
  const [status, setStatus] = useState("");
  const responseFileRef = useRef<HTMLInputElement>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const projectIdRef = useRef(project.id);
  const schemaIdRef = useRef(project.schemaId);
  const parseSeq = useRef(0);
  projectIdRef.current = project.id;
  schemaIdRef.current = project.schemaId;

  useEffect(() => {
    setRaw(project.rawResponse || "");
    setParsed(null);
    setCards(null);
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
      setCards(null);
      setStatus("Parsing failed. Check the response and try again.");
      return;
    }

    const split = splitResponseForSelection(result.data, selection);
    const messages: ParsedCards["messages"] = {};
    for (const id of MESSAGE_DELIVERABLE_IDS) {
      if (!selection.includes(id)) continue;
      messages[id] = split.missing.includes(id)
        ? null
        : normalizeMessagePart(id, split.parts[id]);
    }

    let cv: CvValidation | null = null;
    let cvMissing = false;
    if (selection.includes("cv")) {
      if (split.missing.includes("cv") || split.parts.cv === undefined) {
        cvMissing = true;
      } else {
        cv = validateCv(split.parts.cv, project.schemaId);
      }
    }

    parseSeq.current += 1;
    setCards({
      cv,
      cvMissing,
      messages,
      unrequested: split.unrequested,
      seq: parseSeq.current,
    });

    const missingMessages = Object.values(messages).filter((value) => value == null).length;
    const cvProblem = cvMissing || (cv != null && !cv.valid);
    const missingCount = missingMessages + (cvMissing ? 1 : 0);
    setStatus(
      missingCount > 0
        ? `Parsed. ${missingCount} requested deliverable(s) are missing from the response; the other cards are still usable.`
        : cvProblem
          ? "Parsed, but the CV has schema errors. Fix it before applying the CV."
          : "Parsed and validated. Apply each deliverable independently.",
    );
  };

  const applyCv = () => {
    if (!cards?.cv?.valid) return;
    const data = cards.cv.data;
    onChange((current) => ({
      ...current,
      cv: data,
      rawResponse: raw,
      files: { ...current.files, response: "responses/latest.raw.txt" },
    }));
    setStatus("Applied. The Preview stage now uses this content.");
    onApplied();
  };

  const saveMessage = (id: MessageDeliverableId, value: string | ColdEmailContent) => {
    onChange((current) => ({
      ...current,
      artifacts: { ...current.artifacts, [id]: value },
    }));
    setStatus(
      `${deliverableLabel(id)} saved. It will be written to deliverables/ with the next autosave.`,
    );
  };

  const clearMessage = (id: MessageDeliverableId) => {
    onChange((current) => {
      const artifacts = { ...current.artifacts };
      delete artifacts[id];
      return { ...current, artifacts };
    });
    setStatus(
      `${deliverableLabel(id)} cleared. Its file is removed from deliverables/ with the next autosave.`,
    );
  };

  const loadCvFile = async (file: File | undefined) => {
    if (!file || !selection.includes("cv")) return;
    const targetId = project.id;
    const targetSchema = project.schemaId;
    try {
      const parsedFile = JSON.parse(await file.text());
      if (projectIdRef.current !== targetId || schemaIdRef.current !== targetSchema) return;
      const migrated = migrateCv(parsedFile, targetSchema);
      const check = validateCv(migrated.cv, targetSchema);
      parseSeq.current += 1;
      setParsed({ ok: true, data: migrated.cv, extracted: "" });
      setCards({
        cv: check,
        cvMissing: false,
        messages: {},
        unrequested: [],
        seq: parseSeq.current,
      });
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

  const cvRequested = selection.includes("cv");
  const cvState = cards ? cvStatus(cards) : "missing";
  const selectedMessages = MESSAGE_DELIVERABLE_IDS.filter((id) => selection.includes(id));

  return (
    <div className="stage response-stage">
      <div className="stage-head">
        <div>
          <h2>Response</h2>
          <p className="muted">
            Paste the JSON returned by the model. Each requested deliverable is validated
            independently, so one bad part does not block the rest.
            {cvRequested && (
              <>
                {" "}The CV schema is <code>{project.schemaId}</code>.
              </>
            )}
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => responseFileRef.current?.click()}>
            Load response file
          </button>
          {cvRequested && (
            <button className="secondary" onClick={() => cvFileRef.current?.click()}>
              Load CV JSON
            </button>
          )}
          <input
            ref={responseFileRef}
            hidden
            type="file"
            accept=".txt,.json,.md,text/plain,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              const targetId = project.id;
              if (file) {
                const text = await file.text();
                if (projectIdRef.current === targetId) setRaw(text);
              }
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
          placeholder={
            cvRequested && selection.length === 1
              ? "Paste the CV JSON here. Fences and prose before the object are fine."
              : "Paste the full LLM response here, even if it includes ```json fences or a sentence before the object."
          }
        />
      </label>

      <div className="row">
        <button className="primary" onClick={parse}>Parse & validate</button>
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

      {cards && cards.unrequested.length > 0 && (
        <p className="callout warn" data-testid="response-unrequested">
          Ignored unrequested key(s): {cards.unrequested.map((id) => deliverableLabel(id)).join(", ")}.
          Only the deliverables selected in stage 1 · Target are read.
        </p>
      )}

      {cards && cvRequested && (
        <section
          className={`deliverable-card panel ${cvState === "valid" ? "ok" : cvState === "warnings" ? "warn" : "error"}`}
          data-deliverable-card="cv"
          data-testid="response-card-cv"
        >
          <div className="card-head">
            <h3>CV</h3>
            <span className={`badge status ${cvState}`} data-status={cvState}>
              {cvStatusLabel(cvState)}
            </span>
          </div>

          {cards.cvMissing ? (
            <div className="callout error">
              The response did not include a <code>cv</code> key. The other requested
              deliverables can still be applied.
            </div>
          ) : (
            cards.cv && (
              <div className="validation-grid">
                <section className={`panel ${cards.cv.valid ? "ok" : "error"}`}>
                  <h3>{cards.cv.valid ? "Schema valid" : "Schema errors"}</h3>
                  {cards.cv.errors.length ? (
                    <ul className="issue-list">
                      {cards.cv.errors.map((issue, index) => (
                        <li key={index}>
                          <code>{issue.path}</code> — {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">All required fields are present.</p>
                  )}
                </section>
                <section className={`panel ${cards.cv.warnings.length ? "warn" : ""}`}>
                  <h3>Warnings</h3>
                  {cards.cv.warnings.length ? (
                    <ul className="issue-list">
                      {cards.cv.warnings.map((issue, index) => (
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
                    <li>{cards.cv.data.experience.length} experience entries</li>
                    <li>{cards.cv.data.projects.length} projects</li>
                    <li>{cards.cv.data.skills.length} skill groups</li>
                    <li>
                      {cards.cv.data.experience.reduce((sum, entry) => sum + entry.bullets.length, 0)} experience bullets
                    </li>
                    {cards.cv.data.summary != null && (
                      <li>{cards.cv.data.summary.length} characters in summary</li>
                    )}
                  </ul>
                </section>
              </div>
            )
          )}

          <div className="card-actions card-apply">
            <button className="primary" onClick={applyCv} disabled={!cards.cv?.valid}>
              Apply to CV
            </button>
            <span className="muted">Applying the CV opens Preview. Message cards stay here.</span>
          </div>
        </section>
      )}

      {cards &&
        selectedMessages.map((id) => (
          <DeliverableCard
            key={`${cards.seq}-${id}`}
            id={id}
            candidate={cards.messages[id] ?? null}
            saved={project.artifacts[id]}
            filename={projectDeliverableFilename(project, profile, id)}
            onSave={(value) => saveMessage(id, value)}
            onClear={() => clearMessage(id)}
          />
        ))}

      <p className="fineprint">
        Only the selected deliverables are read. Unrequested keys are ignored, and a missing
        requested key is reported on its own card rather than failing the whole response.
        Message content is saved under <code>deliverables/</code>; the CV remains in{" "}
        <code>cv.json</code>.
      </p>
    </div>
  );
}
