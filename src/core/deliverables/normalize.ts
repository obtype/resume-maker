import {
  DEFAULT_DELIVERABLE_SELECTION,
  createDefaultDeliverableSettings,
  createEmptyRecipient,
} from "./schema";
import {
  DELIVERABLE_IDS,
  type ColdEmailContent,
  type DeliverableId,
  type DeliverableSelection,
  type DeliverableSettings,
  type Recipient,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

/**
 * Keeps only known ids, removes duplicates, and uses the canonical order.
 * Missing, empty, or entirely unknown selections fall back to CV.
 */
export function normalizeSelection(value: unknown): DeliverableId[] {
  if (!Array.isArray(value)) return [...DEFAULT_DELIVERABLE_SELECTION];
  const selected = DELIVERABLE_IDS.filter((id) => value.includes(id));
  return selected.length > 0 ? selected : [...DEFAULT_DELIVERABLE_SELECTION];
}

export function normalizeRecipient(value: unknown): Recipient {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    name: asString(record.name).trim(),
    role: asString(record.role).trim(),
    company: asString(record.company).trim(),
    profileUrl: asString(record.profileUrl).trim(),
    about: asString(record.about).trim(),
    posts: asString(record.posts).trim(),
    relationship: asString(record.relationship).trim(),
    intent: asString(record.intent).trim(),
  };
}

export function normalizeDeliverableSettings(
  value: unknown,
): Record<DeliverableId, DeliverableSettings> {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  const result = {} as Record<DeliverableId, DeliverableSettings>;
  for (const id of DELIVERABLE_IDS) {
    const raw = record[id];
    const entry: Record<string, unknown> = isRecord(raw) ? raw : {};
    result[id] = {
      instructions: asString(entry.instructions),
      ...(id === "coldEmail" || id === "linkedinMessage"
        ? { recipient: normalizeRecipient(entry.recipient) }
        : {}),
    };
  }
  return result;
}

export function normalizeDeliverableSelection(
  value: unknown,
): DeliverableSelection {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    selected: normalizeSelection(record.selected),
    settings: normalizeDeliverableSettings(record.settings),
  };
}

export function normalizeCoverLetter(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeColdEmail(value: unknown): ColdEmailContent {
  if (typeof value === "string") return { subject: "", body: value.trim() };
  if (!isRecord(value)) return { subject: "", body: "" };
  return {
    subject: typeof value.subject === "string" ? value.subject.trim() : "",
    body: typeof value.body === "string" ? value.body.trim() : "",
  };
}

export function normalizeLinkedinMessage(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface SplitResponse {
  /** Raw values keyed by requested deliverable. Validation happens later. */
  parts: Partial<Record<DeliverableId, unknown>>;
  /** Requested deliverables that had no key (or a null value). */
  missing: DeliverableId[];
  /** Deliverable keys present in the response but not requested. */
  unrequested: DeliverableId[];
  /** True when the response itself was a bare CV object. */
  bareCv: boolean;
}

/**
 * Interprets a parsed LLM response. A CV-only request may return either the
 * existing bare CV object or an envelope with a `cv` key. Any other request
 * expects an envelope; a bare CV is accepted as the CV when one was requested.
 */
export function splitResponseForSelection(
  value: unknown,
  selection: readonly DeliverableId[],
): SplitResponse {
  const selected = normalizeSelection(selection);
  const record: Record<string, unknown> | undefined = isRecord(value)
    ? value
    : undefined;
  const hasEnvelopeKey = record
    ? DELIVERABLE_IDS.some((id) => id in record)
    : false;
  const bareCv = Boolean(
    record &&
      !hasEnvelopeKey &&
      ("basics" in record ||
        "schemaVersion" in record ||
        "experience" in record),
  );

  const parts: Partial<Record<DeliverableId, unknown>> = {};
  const missing: DeliverableId[] = [];
  const unrequested: DeliverableId[] = [];

  if (bareCv && record) {
    if (selected.includes("cv")) parts.cv = value;
    else unrequested.push("cv");
    for (const id of selected) {
      if (id !== "cv" && !(id in parts)) missing.push(id);
    }
  } else if (record) {
    for (const id of DELIVERABLE_IDS) {
      const present = id in record && record[id] != null;
      if (selected.includes(id)) {
        if (present) parts[id] = record[id];
        else missing.push(id);
      } else if (present) {
        unrequested.push(id);
      }
    }
  } else {
    missing.push(...selected);
  }

  return { parts, missing, unrequested, bareCv };
}
