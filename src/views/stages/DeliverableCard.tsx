import { useMemo, useState } from "react";
import { downloadFile } from "../../core/download";
import {
  normalizeColdEmail,
  normalizeCoverLetter,
  normalizeLinkedinMessage,
} from "../../core/deliverables/normalize";
import {
  markdownToPlainText,
  renderCoverLetterPreview,
} from "../../core/deliverables/preview";
import { MESSAGE_DELIVERABLES } from "../../core/deliverables/schema";
import type {
  ColdEmailContent,
  MessageDeliverableId,
} from "../../core/deliverables/types";
import { validateMessageDeliverable } from "../../core/deliverables/validate";

export interface DeliverableCardProps {
  id: MessageDeliverableId;
  /** Parsed candidate, normalized; null when the requested key was missing. */
  candidate: string | ColdEmailContent | null;
  /** Artifact currently applied to the project, if any. */
  saved?: string | ColdEmailContent;
  /** Download filename without extension. */
  filename: string;
  onSave: (value: string | ColdEmailContent) => void;
  onClear: () => void;
}

type DraftValue = string | ColdEmailContent;

function normalizeValue(id: MessageDeliverableId, value: unknown): DraftValue {
  switch (id) {
    case "coverLetter":
      return normalizeCoverLetter(value);
    case "coldEmail":
      return normalizeColdEmail(value);
    case "linkedinMessage":
      return normalizeLinkedinMessage(value);
  }
}

function hasContent(value: DraftValue): boolean {
  if (typeof value === "string") return Boolean(value.trim());
  return Boolean(value.subject.trim() || value.body.trim());
}

function sameValue(a: DraftValue, b: DraftValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const STATUS_LABEL: Record<string, string> = {
  valid: "Valid",
  warnings: "Warnings",
  errors: "Errors",
  missing: "Missing",
};

function emptyDraft(id: MessageDeliverableId): DraftValue {
  return id === "coldEmail" ? { subject: "", body: "" } : "";
}

/**
 * One response card for a message deliverable. The parsed candidate seeds an
 * editable draft; validation, copy, download, and the saved artifact are
 * handled here so every message behaves the same way.
 */
export function DeliverableCard({
  id,
  candidate,
  saved,
  filename,
  onSave,
  onClear,
}: DeliverableCardProps) {
  const deliverable = MESSAGE_DELIVERABLES[id];
  const missing = candidate == null;
  const [draft, setDraft] = useState<DraftValue>(() =>
    missing ? emptyDraft(id) : normalizeValue(id, candidate),
  );
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [message, setMessage] = useState("");

  const validation = useMemo(
    () => validateMessageDeliverable(id, draft).validation,
    [id, draft],
  );
  const candidateValue = missing ? emptyDraft(id) : normalizeValue(id, candidate);
  const savedValue = saved == null ? null : normalizeValue(id, saved);
  const hasSaved = savedValue != null && hasContent(savedValue);
  const differsFromSaved =
    hasSaved && savedValue != null && !sameValue(candidateValue, savedValue);
  const status = missing
    ? "missing"
    : validation.errors.length
      ? "errors"
      : validation.warnings.length
        ? "warnings"
        : "valid";
  const canSave = validation.valid && (!hasSaved || !sameValue(validation.data, savedValue));

  const updateText = (value: string) => {
    setDraft(value);
    setMessage("");
  };

  const updateEmail = (patch: Partial<ColdEmailContent>) => {
    const current = typeof draft === "string" ? { subject: "", body: draft } : draft;
    setDraft({ ...current, ...patch });
    setMessage("");
  };

  const email = typeof draft === "string" ? { subject: "", body: draft } : draft;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied.`);
    } catch {
      setMessage("Clipboard access failed. Select the text and copy it manually.");
    }
  };

  const download = () => {
    if (id === "coverLetter") {
      downloadFile(`${filename}.md`, typeof draft === "string" ? draft : "", "text/markdown");
      setMessage("Downloaded the cover letter Markdown.");
      return;
    }
    if (id === "coldEmail") {
      downloadFile(`${filename}.txt`, `Subject: ${email.subject}\n\n${email.body}\n`, "text/plain");
      setMessage("Downloaded the cold email.");
      return;
    }
    downloadFile(`${filename}.txt`, typeof draft === "string" ? draft : "", "text/plain");
    setMessage("Downloaded the LinkedIn message.");
  };

  const copyActions = () => {
    if (id === "coverLetter") {
      const text = typeof draft === "string" ? draft : "";
      return (
        <>
          <button className="secondary" onClick={() => void copy(markdownToPlainText(text), "Plain text")}>
            Copy plain text
          </button>
          <button className="secondary" onClick={() => void copy(text, "Markdown")}>
            Copy Markdown
          </button>
        </>
      );
    }
    if (id === "coldEmail") {
      return (
        <>
          <button className="secondary" onClick={() => void copy(email.subject, "Subject")}>
            Copy subject
          </button>
          <button className="secondary" onClick={() => void copy(email.body, "Body")}>
            Copy body
          </button>
          <button
            className="secondary"
            onClick={() => void copy(`Subject: ${email.subject}\n\n${email.body}`, "Subject and body")}
          >
            Copy both
          </button>
        </>
      );
    }
    const text = typeof draft === "string" ? draft : "";
    return (
      <button className="secondary" onClick={() => void copy(text, "Message")}>
        Copy message
      </button>
    );
  };

  return (
    <section
      className={`deliverable-card panel ${status === "valid" ? "ok" : status === "errors" || status === "missing" ? "error" : "warn"}`}
      data-deliverable-card={id}
      data-testid={`response-card-${id}`}
    >
      <div className="card-head">
        <h3>{deliverable.name}</h3>
        <span className={`badge status ${status}`} data-status={status}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      {missing && (
        <div className="callout error">
          The response did not include a <code>{id}</code> key. Paste or write the message
          below, or regenerate this deliverable.
        </div>
      )}

      {!missing && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <ul className="issue-list card-issues">
          {validation.errors.map((issue, index) => (
            <li key={`error-${index}`}>
              <code>{issue.path}</code> — {issue.message}
            </li>
          ))}
          {validation.warnings.map((issue, index) => (
            <li key={`warning-${index}`} className="warn-text">
              <code>{issue.path}</code> — {issue.message}
            </li>
          ))}
        </ul>
      )}

      {differsFromSaved && (
        <p className="fineprint" data-testid={`diff-${id}`}>
          The saved {deliverable.name.toLowerCase()} differs from the version in this response.
          Saving overwrites the saved copy.
        </p>
      )}

      {id === "coverLetter" && (
        <div className="card-view-toggle" role="group" aria-label="Cover letter view">
          <button
            className={view === "edit" ? "toggle on" : "toggle"}
            onClick={() => setView("edit")}
          >
            Edit
          </button>
          <button
            className={view === "preview" ? "toggle on" : "toggle"}
            onClick={() => setView("preview")}
          >
            Preview
          </button>
        </div>
      )}

      {id === "coverLetter" && view === "preview" ? (
        <div
          className="message-preview"
          data-testid="cover-letter-preview"
          // The helper escapes every input character before adding markup.
          dangerouslySetInnerHTML={{ __html: renderCoverLetterPreview(draft) }}
        />
      ) : (
        <div className="card-fields">
          {id === "coldEmail" ? (
            <>
              <label className="field">
                <span>Subject</span>
                <input
                  value={email.subject}
                  onChange={(event) => updateEmail({ subject: event.target.value })}
                  placeholder="Subject line"
                />
              </label>
              <label className="field">
                <span>Body</span>
                <textarea
                  rows={10}
                  value={email.body}
                  onChange={(event) => updateEmail({ body: event.target.value })}
                  placeholder="Plain-text email body"
                />
              </label>
            </>
          ) : id === "coverLetter" ? (
            <label className="field">
              <span>Cover letter Markdown</span>
              <textarea
                rows={12}
                value={typeof draft === "string" ? draft : ""}
                onChange={(event) => updateText(event.target.value)}
                placeholder="Paste or edit the cover letter. Markdown paragraphs, **bold**, *italic*, and [links](https://example.com) are supported."
              />
            </label>
          ) : (
            <label className="field">
              <span>Message</span>
              <textarea
                rows={8}
                value={typeof draft === "string" ? draft : ""}
                onChange={(event) => updateText(event.target.value)}
                placeholder="Paste or edit the LinkedIn message."
              />
            </label>
          )}
        </div>
      )}

      <div className="card-actions">
        {copyActions()}
        <button className="secondary" onClick={download}>
          Download {id === "coverLetter" ? ".md" : ".txt"}
        </button>
      </div>

      <div className="card-actions card-apply">
        <button
          className="primary"
          onClick={() => onSave(validation.data)}
          disabled={!canSave}
        >
          Save {id === "coverLetter" ? "cover letter" : id === "coldEmail" ? "cold email" : "LinkedIn message"}
        </button>
        <button
          className="ghost"
          onClick={() => {
            if (window.confirm(`Clear the saved ${deliverable.name.toLowerCase()}?`)) onClear();
          }}
          disabled={!hasSaved}
        >
          Clear {id === "coverLetter" ? "cover letter" : id === "coldEmail" ? "cold email" : "LinkedIn message"}
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </section>
  );
}
