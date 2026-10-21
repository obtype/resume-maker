import {
  DEFAULT_SECTION_TITLES,
  getSchema,
  schemaAllowsSummary,
  schemaUsesExperienceSkills,
  schemaUsesProjectPso,
} from "./schema";
import type {
  Basics,
  CvContent,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  SectionTitles,
  SkillGroup,
} from "./types";

const asString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n|;(?=\s)/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
};

function normalizeBasics(value: unknown): Basics {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const contact = asStringArray(raw.contact);
  const basics: Basics = {
    name: asString(raw.name),
    contact: contact.length ? contact : [],
  };
  const headline = asString(raw.headline);
  if (headline) basics.headline = headline;
  return basics;
}

function normalizeSectionTitles(value: unknown): SectionTitles {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    summary: asString(raw.summary) || DEFAULT_SECTION_TITLES.summary,
    education: asString(raw.education) || DEFAULT_SECTION_TITLES.education,
    skills: asString(raw.skills) || DEFAULT_SECTION_TITLES.skills,
    experience: asString(raw.experience) || DEFAULT_SECTION_TITLES.experience,
    projects: asString(raw.projects) || DEFAULT_SECTION_TITLES.projects,
    custom: asString(raw.custom) || DEFAULT_SECTION_TITLES.custom,
  };
}

function normalizeEducation(value: unknown): EducationEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      degree: asString(raw.degree),
      school: asString(raw.school),
      meta: asString(raw.meta),
    };
  });
}

function normalizeSkills(value: unknown): SkillGroup[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      label: asString(raw.label),
      items: asStringArray(raw.items),
    };
  });
}

function normalizeExperience(value: unknown, withSkills: boolean): ExperienceEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const entry: ExperienceEntry = {
      role: asString(raw.role),
      dates: asString(raw.dates),
      org: asString(raw.org),
      bullets: asStringArray(raw.bullets),
    };
    const blurb = asString(raw.blurb);
    if (blurb) entry.blurb = blurb;
    if (withSkills) entry.skills = asStringArray(raw.skills);
    return entry;
  });
}

function normalizeProjects(value: unknown, pso: boolean): ProjectEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const entry: ProjectEntry = {
      role: asString(raw.role),
      dates: asString(raw.dates),
      org: asString(raw.org),
    };
    const blurb = asString(raw.blurb);
    if (blurb) entry.blurb = blurb;
    if (pso) {
      entry.problem = asString(raw.problem);
      entry.solution = asString(raw.solution);
      entry.outcome = asString(raw.outcome);
    } else {
      entry.bullets = asStringArray(raw.bullets);
    }
    return entry;
  });
}

/**
 * Build a clean object with only the fields allowed by the selected schema.
 * This intentionally drops unknown model output, then validation checks the
 * values that actually matter.
 */
export function normalizeCv(value: unknown, schemaId: string): CvContent {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const schema = getSchema(schemaId);
  const cv: CvContent = {
    schemaVersion: 2,
    basics: normalizeBasics(raw.basics),
    sectionTitles: normalizeSectionTitles(raw.sectionTitles),
    education: normalizeEducation(raw.education),
    skills: normalizeSkills(raw.skills),
    experience: normalizeExperience(raw.experience, schemaUsesExperienceSkills(schema.id)),
    projects: normalizeProjects(raw.projects, schemaUsesProjectPso(schema.id)),
    custom: normalizeExperience(raw.custom, false),
  };
  if (schemaAllowsSummary(schema.id)) cv.summary = asString(raw.summary);
  return cv;
}
