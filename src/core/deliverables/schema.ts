import {
  DELIVERABLE_IDS,
  type DeliverableContentSource,
  type DeliverableId,
  type DeliverableSelection,
  type DeliverableSettings,
  type MessageDeliverableId,
  type Recipient,
} from "./types";

/**
 * Single source of truth for message deliverable ids, labels, output shapes,
 * and the JSON Schemas used both in the prompt and in runtime validation.
 */
export interface DeliverableAdvisory {
  minChars?: number;
  maxChars?: number;
  subjectMaxChars?: number;
  bodyMinChars?: number;
  bodyMaxChars?: number;
}

export interface MessageDeliverableDef {
  id: MessageDeliverableId;
  name: string;
  templateFile: string;
  jsonSchema: Record<string, unknown>;
  /** Short writing guidance that does not fit in JSON Schema. */
  promptNotes: string;
  advisory: DeliverableAdvisory;
}

const str = (maxLength?: number, minLength = 0) => ({
  type: "string",
  ...(minLength ? { minLength } : {}),
  ...(maxLength ? { maxLength } : {}),
});

const COVER_LETTER_SCHEMA: Record<string, unknown> = str(6000, 1);

const COLD_EMAIL_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: {
    subject: str(160, 1),
    body: str(4000, 1),
  },
};

const LINKEDIN_MESSAGE_SCHEMA: Record<string, unknown> = str(2000, 1);

export const MESSAGE_DELIVERABLE_IDS: readonly MessageDeliverableId[] = [
  "coverLetter",
  "coldEmail",
  "linkedinMessage",
];

export const MESSAGE_DELIVERABLES: Record<
  MessageDeliverableId,
  MessageDeliverableDef
> = {
  coverLetter: {
    id: "coverLetter",
    name: "Cover letter",
    templateFile: "cover-letter.md",
    jsonSchema: COVER_LETTER_SCHEMA,
    promptNotes:
      "Target 250-400 words (roughly 1,500-2,500 characters). Write 3-5 paragraphs of first-person prose. Do not use bullet lists or Markdown headings.",
    advisory: { minChars: 800, maxChars: 5000 },
  },
  coldEmail: {
    id: "coldEmail",
    name: "Cold email",
    templateFile: "cold-email.md",
    jsonSchema: COLD_EMAIL_SCHEMA,
    promptNotes:
      "Keep the subject under 100 characters and the body around 80-150 words. Make one clear ask. Plain text, no Markdown.",
    advisory: { subjectMaxChars: 100, bodyMinChars: 300, bodyMaxChars: 2500 },
  },
  linkedinMessage: {
    id: "linkedinMessage",
    name: "LinkedIn message",
    templateFile: "linkedin-message.md",
    jsonSchema: LINKEDIN_MESSAGE_SCHEMA,
    promptNotes:
      "Write a post-acceptance message of about 80-150 words. Do not write a 300-character connection note. Plain text, no Markdown.",
    advisory: { minChars: 200, maxChars: 1200 },
  },
};

export const DEFAULT_DELIVERABLE_SELECTION: readonly DeliverableId[] = ["cv"];

const DELIVERABLE_LABELS: Record<DeliverableId, string> = {
  cv: "CV",
  coverLetter: "Cover letter",
  coldEmail: "Cold email",
  linkedinMessage: "LinkedIn message",
};

export function isDeliverableId(value: unknown): value is DeliverableId {
  return (
    typeof value === "string" &&
    (DELIVERABLE_IDS as readonly string[]).includes(value)
  );
}

export function isMessageDeliverable(
  value: unknown,
): value is MessageDeliverableId {
  return (
    value === "coverLetter" ||
    value === "coldEmail" ||
    value === "linkedinMessage"
  );
}

export function deliverableLabel(id: DeliverableId): string {
  return DELIVERABLE_LABELS[id];
}

export function deliverableTemplateFile(id: DeliverableId): string {
  return id === "cv" ? "cv.md" : MESSAGE_DELIVERABLES[id].templateFile;
}

export function createEmptyRecipient(): Recipient {
  return {
    name: "",
    role: "",
    company: "",
    profileUrl: "",
    about: "",
    posts: "",
    relationship: "",
    intent: "",
  };
}

export function createDefaultDeliverableSettings(): Record<
  DeliverableId,
  DeliverableSettings
> {
  return {
    cv: { instructions: "" },
    coverLetter: { instructions: "" },
    coldEmail: { instructions: "", recipient: createEmptyRecipient() },
    linkedinMessage: { instructions: "", recipient: createEmptyRecipient() },
  };
}

export function createDefaultDeliverableSelection(): DeliverableSelection {
  return {
    selected: [...DEFAULT_DELIVERABLE_SELECTION],
    settings: createDefaultDeliverableSettings(),
  };
}

/**
 * A freshly created CV contains placeholder basics. Only real sections count
 * as content, so a new project does not look like it already has a CV.
 */
export function deliverableHasContent(
  source: DeliverableContentSource,
  id: DeliverableId,
): boolean {
  switch (id) {
    case "cv": {
      const cv = source.cv;
      if (!cv) return false;
      if (cv.summary?.trim()) return true;
      return [cv.education, cv.skills, cv.experience, cv.projects, cv.custom].some(
        (section) => Array.isArray(section) && section.length > 0,
      );
    }
    case "coverLetter":
      return Boolean(source.artifacts?.coverLetter?.trim());
    case "coldEmail": {
      const email = source.artifacts?.coldEmail;
      return Boolean(email && (email.subject.trim() || email.body.trim()));
    }
    case "linkedinMessage":
      return Boolean(source.artifacts?.linkedinMessage?.trim());
  }
}

/**
 * Composes the envelope schema from the same per-deliverable schemas used for
 * validation. `cvSchema` is the selected CV schema.
 */
export function buildEnvelopeSchema(
  selection: readonly DeliverableId[],
  cvSchema: Record<string, unknown>,
): Record<string, unknown> {
  const selected = DELIVERABLE_IDS.filter((id) => selection.includes(id));
  if (selected.length === 0) {
    throw new Error("At least one deliverable must be selected.");
  }

  const properties: Record<string, unknown> = {};
  if (selected.includes("cv")) properties.cv = cvSchema;
  for (const id of MESSAGE_DELIVERABLE_IDS) {
    if (selected.includes(id)) properties[id] = MESSAGE_DELIVERABLES[id].jsonSchema;
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Application deliverables response",
    type: "object",
    additionalProperties: false,
    required: selected,
    properties,
  };
}
