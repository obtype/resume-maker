import type { CvSchemaDef } from "../cv/schema";
import type { Profile, Project } from "../project";

export const PROMPT_VERSION = "2026-10-22.1";
export const BUNDLED_PROMPT_URL = `${import.meta.env.BASE_URL}config/prompts/cv.md`;

export const FALLBACK_PROMPT_TEMPLATE = `# ROLE
You are an expert CV writer.

# TASK
Create a tailored CV for the candidate for the target job and return JSON only.

# RULES
Use only facts from the source material. Do not invent employers, dates, metrics, or skills.
Respect the schema limits and keep the CV to one page. Output no markdown fences.

# CANDIDATE BASICS
{{BASICS}}

# PERSONAL DATA RECORD
{{PDR}}

# REFERENCE CV
{{REFERENCE_CV}}

# TARGET JOB
Title: {{JOB_TITLE}}
Company: {{COMPANY}}
{{JOB_DESCRIPTION}}

# EXTRA INSTRUCTIONS
{{EXTRA_INSTRUCTIONS}}

# OUTPUT SCHEMA
{{SCHEMA_JSON}}

# SCHEMA NOTES
{{SCHEMA_NOTES}}

Schema: {{SCHEMA_ID}} · Prompt version: {{PROMPT_VERSION}} · {{DATE}}`;

export async function loadBundledPromptTemplate(): Promise<string> {
  const response = await fetch(BUNDLED_PROMPT_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load prompt template (${response.status}).`);
  return response.text();
}

export interface PromptInput {
  profile: Profile;
  project: Project;
  schema: CvSchemaDef;
  template: string;
}

function basicsText(profile: Profile): string {
  const { name, headline, contact } = profile.basics;
  const lines = [`Name: ${name || "(not provided)"}`];
  if (headline) lines.push(`Headline: ${headline}`);
  lines.push(`Contact: ${contact.length ? contact.join(" · ") : "(not provided)"}`);
  return lines.join("\n");
}

function instructionsText(profile: Profile, project: Project): string {
  const parts = [project.job.instructions?.trim(), profile.defaultInstructions?.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n") : "(No extra instructions.)";
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

export function buildCvPrompt({ profile, project, schema, template }: PromptInput): string {
  return fill(template, {
    BASICS: basicsText(profile),
    PDR: profile.pdr.markdown?.trim() || "(No personal data record has been imported yet.)",
    REFERENCE_CV: project.job.referenceCv?.trim() || "(No reference CV provided.)",
    JOB_TITLE: project.job.title?.trim() || "(not provided)",
    COMPANY: project.job.company?.trim() || "(not provided)",
    JOB_DESCRIPTION:
      project.job.description?.trim() ||
      "(No job description provided. Tailor only to the job title and company.)",
    EXTRA_INSTRUCTIONS: instructionsText(profile, project),
    SCHEMA_NAME: schema.name,
    SCHEMA_ID: schema.id,
    SCHEMA_JSON: JSON.stringify(schema.jsonSchema, null, 2),
    SCHEMA_NOTES: schema.promptNotes,
    PROMPT_VERSION,
    DATE: new Date().toISOString().slice(0, 10),
  });
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function promptWarnings(profile: Profile, project: Project): string[] {
  const warnings: string[] = [];
  if (!profile.basics.name.trim()) warnings.push("Profile name is empty.");
  if (!profile.basics.contact.length) warnings.push("Profile has no contact details.");
  if (!profile.pdr.markdown.trim()) warnings.push("No PDR has been imported.");
  if (!project.job.title.trim()) warnings.push("Job title is empty.");
  if (!project.job.company.trim()) warnings.push("Company is empty.");
  if (!project.job.description.trim()) warnings.push("Job description is empty.");
  return warnings;
}
