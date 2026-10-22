import type { CvContent } from "../cv/types";
import type { CvSchemaDef } from "../cv/schema";
import type { Profile, Project } from "../project";
import {
  MESSAGE_DELIVERABLES,
  buildEnvelopeSchema,
  deliverableHasContent,
  deliverableLabel,
  deliverableTemplateFile,
} from "../deliverables/schema";
import { DELIVERABLE_IDS } from "../deliverables/types";
import type {
  DeliverableId,
  MessageDeliverableId,
  Recipient,
} from "../deliverables/types";

export const PROMPT_VERSION = "2026-10-22.2";

/** Static templates that make up one prompt, in composition order. */
export const PROMPT_TEMPLATE_IDS = [
  "context",
  "cv",
  "coverLetter",
  "coldEmail",
  "linkedinMessage",
] as const;

export type PromptTemplateId = (typeof PROMPT_TEMPLATE_IDS)[number];

export type PromptTemplates = Record<PromptTemplateId, string>;

/** Where a template's active text came from. */
export type PromptTemplateSource = "bundled" | "override" | "fallback";

export type PromptTemplateSources = Record<PromptTemplateId, PromptTemplateSource>;

/** Bundled file name for each template, reusing the deliverable registry. */
export const PROMPT_TEMPLATE_FILES: Record<PromptTemplateId, string> = {
  context: "context.md",
  cv: deliverableTemplateFile("cv"),
  coverLetter: deliverableTemplateFile("coverLetter"),
  coldEmail: deliverableTemplateFile("coldEmail"),
  linkedinMessage: deliverableTemplateFile("linkedinMessage"),
};

export const BUNDLED_PROMPT_BASE_URL = `${import.meta.env.BASE_URL}config/prompts/`;

export function bundledPromptUrl(id: PromptTemplateId): string {
  return `${BUNDLED_PROMPT_BASE_URL}${PROMPT_TEMPLATE_FILES[id]}`;
}

/**
 * Minimal templates used only when a bundled file cannot be fetched. They are
 * not a second editable prompt; the bundled files are the source of truth.
 */
export const FALLBACK_TEMPLATES: PromptTemplates = {
  context: `# ROLE
You are an expert application writer.

# REQUIRED DELIVERABLES
Write only the deliverables named in the output contract. Return JSON only, with no markdown fences and no commentary.
Use only facts from the candidate basics and personal data record. Never invent employers, dates, metrics, or skills.

# CANDIDATE BASICS
{{BASICS}}

# PERSONAL DATA RECORD
{{PDR}}

# TARGET JOB
Title: {{JOB_TITLE}}
Company: {{COMPANY}}

{{JOB_DESCRIPTION}}

# SHARED INSTRUCTIONS
{{SHARED_INSTRUCTIONS}}

# EXISTING CV
{{EXISTING_CV}}`,
  cv: `# TASK — CV
Create a tailored CV that matches the required schema exactly. Keep it to one A4 page and use only facts from the source material.

# REFERENCE CV
{{REFERENCE_CV}}

# CV INSTRUCTIONS
{{CV_INSTRUCTIONS}}

# REQUIRED OUTPUT SCHEMA — {{SCHEMA_NAME}}
{{SCHEMA_JSON}}

# SCHEMA-SPECIFIC RULES
{{SCHEMA_NOTES}}`,
  coverLetter: `# TASK — COVER LETTER
Write a first-person cover letter in 3-5 prose paragraphs. Do not use bullet lists or Markdown headings. Use only facts from the source material.

# COVER LETTER INSTRUCTIONS
{{COVER_LETTER_INSTRUCTIONS}}

# COVER LETTER OUTPUT SHAPE
{{COVER_LETTER_SCHEMA}}`,
  coldEmail: `# TASK — COLD EMAIL
Write a short cold email. A missing job description is valid; do not invent a role. Plain text, no Markdown.

# RECIPIENT
{{RECIPIENT}}

# COLD EMAIL INSTRUCTIONS
{{COLD_EMAIL_INSTRUCTIONS}}

# COLD EMAIL OUTPUT SHAPE
{{COLD_EMAIL_SCHEMA}}`,
  linkedinMessage: `# TASK — LINKEDIN MESSAGE
Write a follow-up message after the recipient accepted the connection request. Do not write a 300-character connection note. Plain text, no Markdown.

# RECIPIENT
{{RECIPIENT}}

# LINKEDIN INSTRUCTIONS
{{LINKEDIN_INSTRUCTIONS}}

# LINKEDIN MESSAGE OUTPUT SHAPE
{{LINKEDIN_SCHEMA}}`,
};

/** @deprecated CV-only fallback alias; prefer `FALLBACK_TEMPLATES.cv`. */
export const FALLBACK_PROMPT_TEMPLATE = FALLBACK_TEMPLATES.cv;

export async function loadBundledPromptTemplate(
  id: PromptTemplateId,
): Promise<string> {
  const response = await fetch(bundledPromptUrl(id), { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(
      `Could not load the ${id} prompt template (${response.status}).`,
    );
  }
  return response.text();
}

export interface BuildProjectPromptInput {
  profile: Profile;
  project: Project;
  schema: CvSchemaDef;
  templates: PromptTemplates;
  /** Metadata date in `YYYY-MM-DD`; defaults to today. */
  date?: string;
}

function basicsText(profile: Profile): string {
  const { name, headline, contact } = profile.basics;
  const lines = [`Name: ${name || "(not provided)"}`];
  if (headline) lines.push(`Headline: ${headline}`);
  lines.push(
    `Contact: ${contact.length ? contact.join(" · ") : "(not provided)"}`,
  );
  return lines.join("\n");
}

function jobDescriptionText(project: Project): string {
  return project.job.description?.trim() || "(No job description provided.)";
}

/**
 * Shared project instructions plus profile defaults for the shared context
 * block, or one deliverable's additive instructions for a task block.
 */
export function instructionsText(
  profile: Profile,
  project: Project,
  deliverable?: DeliverableId,
): string {
  if (deliverable) {
    const own = project.deliverables?.settings?.[deliverable]?.instructions;
    return own?.trim() || "(No deliverable-specific instructions.)";
  }
  const parts = [
    project.job.sharedInstructions?.trim(),
    profile.defaultInstructions?.trim(),
  ].filter(Boolean);
  return parts.length ? parts.join("\n\n") : "(No shared instructions.)";
}

/** Compact Markdown rendering of an approved CV, never raw JSON. */
export function existingCvText(cv: CvContent): string {
  const lines: string[] = [];

  const name = cv.basics?.name?.trim();
  const headline = cv.basics?.headline?.trim();
  const contact = (cv.basics?.contact ?? []).filter((item) => item.trim());
  if (name) lines.push(`Name: ${name}`);
  if (headline) lines.push(`Headline: ${headline}`);
  if (contact.length) lines.push(`Contact: ${contact.join(" · ")}`);

  if (cv.summary?.trim()) {
    lines.push("", `## ${cv.sectionTitles?.summary || "Summary"}`, cv.summary.trim());
  }

  const section = (title: string | undefined, fallback: string) =>
    `## ${title?.trim() || fallback}`;

  if (cv.education?.length) {
    lines.push("", section(cv.sectionTitles?.education, "Education"));
    for (const entry of cv.education) {
      const meta = entry.meta?.trim() ? ` — ${entry.meta.trim()}` : "";
      lines.push(`- ${entry.degree} — ${entry.school}${meta}`);
    }
  }

  if (cv.skills?.length) {
    lines.push("", section(cv.sectionTitles?.skills, "Skills"));
    for (const group of cv.skills) {
      lines.push(`- ${group.label}: ${group.items.join(", ")}`);
    }
  }

  if (cv.experience?.length) {
    lines.push("", section(cv.sectionTitles?.experience, "Experience"));
    for (const entry of cv.experience) {
      const header = [entry.role, entry.org].filter(Boolean).join(" — ");
      const dates = entry.dates?.trim() ? ` (${entry.dates.trim()})` : "";
      lines.push(`- ${header}${dates}`);
      if (entry.blurb?.trim()) lines.push(`  ${entry.blurb.trim()}`);
      for (const bullet of entry.bullets ?? []) {
        if (bullet.trim()) lines.push(`  - ${bullet.trim()}`);
      }
    }
  }

  if (cv.projects?.length) {
    lines.push("", section(cv.sectionTitles?.projects, "Projects"));
    for (const entry of cv.projects) {
      const header = [entry.role, entry.org].filter(Boolean).join(" — ");
      const dates = entry.dates?.trim() ? ` (${entry.dates.trim()})` : "";
      lines.push(`- ${header}${dates}`);
      if (entry.blurb?.trim()) lines.push(`  ${entry.blurb.trim()}`);
      for (const bullet of entry.bullets ?? []) {
        if (bullet.trim()) lines.push(`  - ${bullet.trim()}`);
      }
      for (const [label, value] of [
        ["Problem", entry.problem],
        ["Solution", entry.solution],
        ["Outcome", entry.outcome],
      ] as const) {
        if (value?.trim()) lines.push(`  - ${label}: ${value.trim()}`);
      }
    }
  }

  if (cv.custom?.length) {
    lines.push("", section(cv.sectionTitles?.custom, "Additional"));
    for (const entry of cv.custom) {
      const header = [entry.role, entry.org].filter(Boolean).join(" — ");
      const dates = entry.dates?.trim() ? ` (${entry.dates.trim()})` : "";
      lines.push(`- ${header}${dates}`);
      for (const bullet of entry.bullets ?? []) {
        if (bullet.trim()) lines.push(`  - ${bullet.trim()}`);
      }
    }
  }

  return lines.join("\n").trim();
}

/** Recipient block. Empty fields are omitted. */
export function recipientText(recipient?: Recipient): string {
  if (!recipient) return "(No recipient details provided.)";
  const fields: Array<[string, string]> = [
    ["Name", recipient.name],
    ["Role", recipient.role],
    ["Company", recipient.company],
    ["Profile URL", recipient.profileUrl],
    ["Relationship", recipient.relationship],
    ["Intent", recipient.intent],
    ["About", recipient.about],
    ["Recent posts", recipient.posts],
  ];
  const lines = fields
    .map(([label, value]) => [label, value?.trim() || ""] as const)
    .filter(([, value]) => value)
    .map(([label, value]) =>
      value.includes("\n") && (label === "About" || label === "Recent posts")
        ? `${label}:\n${value}`
        : `${label}: ${value}`,
    );
  return lines.length ? lines.join("\n") : "(No recipient details provided.)";
}

/**
 * Canonical order, unknown ids dropped, duplicates removed. Throws when the
 * selection is empty so no prompt is ever built for it.
 */
export function resolveDeliverableSelection(
  project: Project,
): DeliverableId[] {
  const requested = project.deliverables?.selected ?? [];
  const selected = DELIVERABLE_IDS.filter((id) => requested.includes(id));
  if (!selected.length) {
    throw new Error("At least one deliverable must be selected before building a prompt.");
  }
  return selected;
}

function existingCvContext(project: Project, selected: DeliverableId[]): string {
  if (selected.includes("cv")) {
    return [
      "The CV is part of this same response.",
      "Use the `cv` value as the source of truth for the candidate's facts, role, company, and dates.",
      "Keep every other deliverable consistent with it. Do not repeat the CV text verbatim.",
    ].join("\n");
  }
  if (deliverableHasContent(project, "cv")) {
    return existingCvText(project.cv);
  }
  return "(No existing CV is available in this project.)";
}

function messageSchemaText(id: MessageDeliverableId): string {
  return JSON.stringify(MESSAGE_DELIVERABLES[id].jsonSchema, null, 2);
}

function outputContractText(
  selected: DeliverableId[],
  schema: CvSchemaDef,
): string {
  if (selected.length === 1 && selected[0] === "cv") {
    return [
      "# OUTPUT CONTRACT",
      "",
      "Return exactly one JSON object: the CV described by the schema above.",
      "Return the CV object directly, with no wrapper object, no extra keys, no markdown fences, and no commentary.",
      `The object must validate against the ${schema.name} schema (${schema.id}).`,
    ].join("\n");
  }

  const keys = selected.map((id) => `\`${id}\``).join(", ");
  const cvNote = selected.includes("cv")
    ? "The `cv` value is the source of truth for the candidate's facts. Use it for the other deliverables and keep role, company, and dates consistent."
    : "The CV is not part of this response; do not add a `cv` key.";
  const envelope = JSON.stringify(
    buildEnvelopeSchema(selected, schema.jsonSchema),
    null,
    2,
  );

  return [
    "# OUTPUT CONTRACT",
    "",
    `Return exactly one JSON object with only these keys, in this order: ${keys}.`,
    cvNote,
    "Do not return a bare CV object, an array, markdown fences, or commentary.",
    "",
    "The object must validate against this JSON Schema:",
    "",
    envelope,
  ].join("\n");
}

function metadataText(
  selected: DeliverableId[],
  schema: CvSchemaDef,
  date: string,
): string {
  const schemaLine = selected.includes("cv")
    ? `Schema: ${schema.id} (${schema.name})`
    : "Schema: none (CV not requested)";
  return [
    "# PROMPT METADATA",
    "",
    schemaLine,
    `Deliverables: ${selected.map((id) => deliverableLabel(id)).join(", ")}`,
    `Prompt version: ${PROMPT_VERSION}`,
    `Generated: ${date}`,
  ].join("\n");
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

/**
 * Composes one prompt for the current deliverable selection: shared context
 * once, then the selected task templates in fixed order, then the generated
 * output contract and metadata footer.
 */
export function buildProjectPrompt({
  profile,
  project,
  schema,
  templates,
  date,
}: BuildProjectPromptInput): string {
  const selected = resolveDeliverableSelection(project);

  const contextValues: Record<string, string> = {
    BASICS: basicsText(profile),
    PDR:
      profile.pdr.markdown?.trim() ||
      "(No personal data record has been imported yet.)",
    JOB_TITLE: project.job.title?.trim() || "(not provided)",
    COMPANY: project.job.company?.trim() || "(not provided)",
    JOB_DESCRIPTION: jobDescriptionText(project),
    SHARED_INSTRUCTIONS: instructionsText(profile, project),
    EXISTING_CV: existingCvContext(project, selected),
  };

  const taskValues: Record<DeliverableId, Record<string, string>> = {
    cv: {
      REFERENCE_CV:
        project.job.referenceCv?.trim() || "(No reference CV provided.)",
      CV_INSTRUCTIONS: instructionsText(profile, project, "cv"),
      SCHEMA_NAME: schema.name,
      SCHEMA_ID: schema.id,
      SCHEMA_JSON: JSON.stringify(schema.jsonSchema, null, 2),
      SCHEMA_NOTES: schema.promptNotes,
    },
    coverLetter: {
      COVER_LETTER_INSTRUCTIONS: instructionsText(
        profile,
        project,
        "coverLetter",
      ),
      COVER_LETTER_SCHEMA: messageSchemaText("coverLetter"),
    },
    coldEmail: {
      COLD_EMAIL_INSTRUCTIONS: instructionsText(profile, project, "coldEmail"),
      COLD_EMAIL_SCHEMA: messageSchemaText("coldEmail"),
      RECIPIENT: recipientText(
        project.deliverables?.settings?.coldEmail?.recipient,
      ),
    },
    linkedinMessage: {
      LINKEDIN_INSTRUCTIONS: instructionsText(
        profile,
        project,
        "linkedinMessage",
      ),
      LINKEDIN_SCHEMA: messageSchemaText("linkedinMessage"),
      RECIPIENT: recipientText(
        project.deliverables?.settings?.linkedinMessage?.recipient,
      ),
    },
  };

  const sections: string[] = [fill(templates.context, contextValues)];
  for (const id of selected) {
    sections.push(fill(templates[id], taskValues[id]));
  }
  sections.push(outputContractText(selected, schema));
  sections.push(
    metadataText(selected, schema, date ?? new Date().toISOString().slice(0, 10)),
  );

  return `${sections.map((section) => section.trim()).filter(Boolean).join("\n\n")}\n`;
}

export interface PromptWarning {
  id: string;
  level: "warn" | "error";
  message: string;
}

function warning(id: string, message: string): PromptWarning {
  return { id, level: "warn", message };
}

/** Selection-aware, non-blocking warnings shown before the prompt is sent. */
export function promptWarnings(
  profile: Profile,
  project: Project,
): PromptWarning[] {
  const warnings: PromptWarning[] = [];
  if (!profile.basics.name.trim()) {
    warnings.push(warning("profile.name", "Profile name is empty."));
  }
  if (!profile.pdr.markdown.trim()) {
    warnings.push(warning("profile.pdr", "No PDR has been imported."));
  }

  let selected: DeliverableId[];
  try {
    selected = resolveDeliverableSelection(project);
  } catch {
    warnings.push({
      id: "selection.empty",
      level: "error",
      message: "Select at least one deliverable before building a prompt.",
    });
    return warnings;
  }

  const job = project.job;
  const hasTitle = Boolean(job.title.trim());
  const hasCompany = Boolean(job.company.trim());
  const hasDescription = Boolean(job.description.trim());

  if (selected.includes("cv")) {
    if (!profile.basics.contact.length) {
      warnings.push(warning("cv.contact", "CV: the profile has no contact details."));
    }
    if (!hasTitle) warnings.push(warning("cv.title", "CV: the job title is empty."));
    if (!hasCompany) warnings.push(warning("cv.company", "CV: the company is empty."));
    if (!hasDescription) {
      warnings.push(
        warning("cv.description", "CV: the job description is empty."),
      );
    }
  }

  if (selected.includes("coverLetter")) {
    if (!hasTitle) {
      warnings.push(
        warning("coverLetter.title", "Cover letter: the job title is empty."),
      );
    }
    if (!hasCompany) {
      warnings.push(
        warning("coverLetter.company", "Cover letter: the company is empty."),
      );
    }
    if (!hasDescription) {
      warnings.push(
        warning(
          "coverLetter.description",
          "Cover letter: the job description is empty.",
        ),
      );
    }
  }

  if (selected.includes("coldEmail")) {
    const recipient = project.deliverables.settings.coldEmail.recipient;
    if (!recipient?.name.trim() && !recipient?.company.trim()) {
      warnings.push(
        warning(
          "coldEmail.recipient",
          "Cold email: add the recipient's name or company.",
        ),
      );
    }
    const hasContext =
      hasTitle ||
      hasCompany ||
      hasDescription ||
      Boolean(recipient?.company.trim()) ||
      Boolean(recipient?.role.trim());
    if (!hasContext) {
      warnings.push(
        warning(
          "coldEmail.context",
          "Cold email: add a company, role, or recipient context so the message is specific.",
        ),
      );
    }
  }

  if (selected.includes("linkedinMessage")) {
    const recipient = project.deliverables.settings.linkedinMessage.recipient;
    if (!recipient?.name.trim()) {
      warnings.push(
        warning("linkedinMessage.recipient", "LinkedIn message: add the recipient's name."),
      );
    }
  }

  if (selected.length >= 3) {
    warnings.push(
      warning(
        "selection.long",
        "3 or more deliverables are selected: combined responses can be long. The CV is requested first, so truncation is most likely to affect later deliverables.",
      ),
    );
  }

  return warnings;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
