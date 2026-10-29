import type { Basics, CvContent, SectionTitles } from "./types";

/**
 * Single source of truth for:
 *  - the JSON Schema shown to the LLM in the prompt
 *  - runtime validation of LLM output
 *  - renderer compatibility (renderers declare schema ids)
 *
 * Adding a schema variant means adding a definition here. A renderer can share
 * a schema with other renderers, or require its own variant.
 */

export interface CvSchemaDef {
  id: string;
  name: string;
  description: string;
  /** Extra instructions that do not fit in JSON Schema. Included in the prompt. */
  promptNotes: string;
  jsonSchema: Record<string, unknown>;
}

const str = (maxLength?: number, minLength = 0) => ({
  type: "string",
  ...(minLength ? { minLength } : {}),
  ...(maxLength ? { maxLength } : {}),
});

const basicsSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["name", "contact"],
  properties: {
    name: str(80, 1),
    headline: str(120),
    contact: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: str(120, 1),
    },
  },
};

const sectionTitlesSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["education", "skills", "experience", "projects", "custom"],
  properties: {
    summary: str(40),
    education: str(40),
    skills: str(40),
    experience: str(40),
    projects: str(40),
    custom: str(40),
  },
};

const educationEntry = {
  type: "object",
  additionalProperties: false,
  required: ["degree", "school", "meta"],
  properties: {
    degree: str(140, 1),
    school: str(140, 1),
    meta: str(220),
  },
};

const skillGroup = {
  type: "object",
  additionalProperties: false,
  required: ["label", "items"],
  properties: {
    label: str(50, 1),
    items: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: str(50, 1),
    },
  },
};

const experienceEntry = (withSkills: boolean) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "role",
    "dates",
    "org",
    "bullets",
    ...(withSkills ? ["skills"] : []),
  ],
  properties: {
    role: str(100, 1),
    dates: str(60),
    org: str(140),
    blurb: str(240),
    bullets: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: str(320, 1),
    },
    ...(withSkills
      ? {
          skills: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: str(40, 1),
          },
        }
      : {}),
  },
});

const projectEntry = (pso: boolean) => ({
  type: "object",
  additionalProperties: false,
  required: pso
    ? ["role", "dates", "org", "problem", "solution", "outcome"]
    : ["role", "dates", "org", "bullets"],
  properties: {
    role: str(120, 1),
    dates: str(60),
    org: str(140),
    blurb: str(240),
    ...(pso
      ? {
          problem: str(500, 1),
          solution: str(500, 1),
          outcome: str(500, 1),
        }
      : {
          bullets: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: str(320, 1),
          },
        }),
  },
});

function buildSchema(options: {
  title: string;
  summary: boolean;
  experienceSkills: boolean;
  projectPso: boolean;
}): Record<string, unknown> {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: options.title,
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "basics",
      ...(options.summary ? ["summary"] : []),
      "sectionTitles",
      "education",
      "skills",
      "experience",
      "projects",
      "custom",
    ],
    properties: {
      schemaVersion: { const: 2 },
      basics: basicsSchema,
      ...(options.summary ? { summary: str(600, 1) } : {}),
      sectionTitles: sectionTitlesSchema,
      education: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: educationEntry,
      },
      skills: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: skillGroup,
      },
      experience: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: experienceEntry(options.experienceSkills),
      },
      projects: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: projectEntry(options.projectPso),
      },
      custom: {
        type: "array",
        minItems: 0,
        maxItems: 4,
        items: experienceEntry(false),
      },
    },
  };
}

const ONE_PAGE_NOTE =
  "Keep the finished CV to one A4 page. Prefer 3-4 bullets for the most relevant roles and 2-3 for older or less relevant roles. Use the schema's exact field names and value types: do not rename fields or replace an array with an object. In particular, skills use `label` and an array of short `items` strings; experience, project, and custom entries use `role`, `dates`, and `org`, never `name`, `company`, or `meta` in place of them.";

export const CV_SCHEMAS: Record<string, CvSchemaDef> = {
  classic: {
    id: "classic",
    name: "Classic",
    description: "Fixed sidebar layout. No summary paragraph.",
    promptNotes: `${ONE_PAGE_NOTE} Do not include a summary; this schema has no summary field.`,
    jsonSchema: buildSchema({
      title: "CV Content (Classic)",
      summary: false,
      experienceSkills: false,
      projectPso: false,
    }),
  },
  "classic-summary": {
    id: "classic-summary",
    name: "Classic + Summary",
    description: "Classic layout with a short tailored profile summary.",
    promptNotes: `${ONE_PAGE_NOTE} The summary must be 2-3 sentences (max 600 characters) describing the candidate's professional identity and fit for this specific role.`,
    jsonSchema: buildSchema({
      title: "CV Content (Classic + Summary)",
      summary: true,
      experienceSkills: false,
      projectPso: false,
    }),
  },
  impact: {
    id: "impact",
    name: "Impact",
    description:
      "Single-column layout. Each role lists applied skills; projects use Problem / Solution / Outcome.",
    promptNotes: `${ONE_PAGE_NOTE} Every experience entry must include a short list of the concrete skills used in that role. Every project must use problem, solution, and outcome fields instead of bullets. The summary is required (2-3 sentences).`,
    jsonSchema: buildSchema({
      title: "CV Content (Impact)",
      summary: true,
      experienceSkills: true,
      projectPso: true,
    }),
  },
};

export const DEFAULT_SCHEMA_ID = "classic";

export function getSchema(id: string): CvSchemaDef {
  return CV_SCHEMAS[id] ?? CV_SCHEMAS[DEFAULT_SCHEMA_ID];
}

export const DEFAULT_SECTION_TITLES: SectionTitles = {
  summary: "Profile",
  education: "Education",
  skills: "Skills",
  experience: "Experience",
  projects: "Projects",
  custom: "Additional",
};

export function createEmptyCv(
  schemaId: string,
  basics: Basics = { name: "", contact: [] },
): CvContent {
  const schema = getSchema(schemaId);
  const cv: CvContent = {
    schemaVersion: 2,
    basics: { name: basics.name || "Your Name", headline: basics.headline, contact: basics.contact?.length ? [...basics.contact] : ["email@example.com", "City, Country"] },
    sectionTitles: { ...DEFAULT_SECTION_TITLES },
    education: [],
    skills: [],
    experience: [],
    projects: [],
    custom: [],
  };
  if (schema.id !== "classic") cv.summary = "";
  return cv;
}

export function schemaAllowsSummary(schemaId: string): boolean {
  return getSchema(schemaId).id !== "classic";
}

export function schemaUsesExperienceSkills(schemaId: string): boolean {
  return getSchema(schemaId).id === "impact";
}

export function schemaUsesProjectPso(schemaId: string): boolean {
  return getSchema(schemaId).id === "impact";
}
