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

/** First non-empty string among the given aliases, in priority order. */
function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = asString(raw[key]);
    if (value) return value;
  }
  return "";
}

/** First non-empty string array among the given aliases, in priority order. */
function pickStringArray(
  raw: Record<string, unknown>,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    const value = asStringArray(raw[key]);
    if (value.length) return value;
  }
  return [];
}

/**
 * Skill lists are often returned as one comma-separated string instead of an
 * array. Split those without touching the comma inside ordinary bullets.
 */
function asSkillItems(value: unknown): string[] {
  const direct = asStringArray(value);
  const source = direct.length
    ? direct
    : typeof value === "string"
      ? [value]
      : [];
  return source
    .flatMap((item) => item.split(/,\s*|;\s*|\u00b7|\|/))
    .map((item) => item.trim())
    .filter(Boolean);
}

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
      degree: pickString(raw, "degree", "qualification"),
      school: pickString(raw, "school", "institution", "university"),
      meta: pickString(raw, "meta", "dates", "period", "details"),
    };
  });
}

function normalizeSkills(value: unknown): SkillGroup[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    return {
      label: pickString(raw, "label", "category", "group", "name"),
      items: asSkillItems(raw.items),
    };
  });
}

function normalizeExperience(
  value: unknown,
  withSkills: boolean,
  includeEmpty = true,
  custom = false,
): ExperienceEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const entry: ExperienceEntry = {
      role: pickString(
        raw,
        "role",
        "title",
        "position",
        ...(custom ? ["name"] : []),
      ),
      dates: pickString(raw, "dates", "meta", "period", "date"),
      org: pickString(raw, "org", "company", "employer", "organization"),
      bullets: pickStringArray(
        raw,
        "bullets",
        "achievements",
        "highlights",
        ...(custom ? ["description"] : []),
      ),
    };
    const blurb = custom
      ? pickString(raw, "blurb")
      : pickString(raw, "blurb", "description", "summary");
    if (blurb) entry.blurb = blurb;
    if (withSkills && (includeEmpty || raw.skills !== undefined)) {
      entry.skills = asStringArray(raw.skills);
    }
    return entry;
  });
}

type ProjectMode = "bullets" | "pso" | "all";

function normalizeProjects(
  value: unknown,
  mode: ProjectMode,
  includeEmpty: boolean,
): ProjectEntry[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const entry: ProjectEntry = {
      role: pickString(raw, "role", "title", "name"),
      dates: pickString(raw, "dates", "meta", "period", "date"),
      org: pickString(raw, "org", "company", "employer", "organization"),
    };
    const blurb = pickString(raw, "blurb", "description", "summary");
    if (blurb) entry.blurb = blurb;
    if (mode !== "pso" && (includeEmpty || raw.bullets !== undefined)) {
      entry.bullets = pickStringArray(raw, "bullets", "achievements", "highlights");
    }
    if (mode !== "bullets") {
      for (const key of ["problem", "solution", "outcome"] as const) {
        if (includeEmpty || raw[key] !== undefined) entry[key] = asString(raw[key]);
      }
    }
    return entry;
  });
}

interface NormalizeOptions {
  summary: boolean;
  experienceSkills: boolean;
  projectMode: ProjectMode;
  /** Validation normalization supplies required empty fields; storage preserves only what exists. */
  includeEmpty: boolean;
}

function normalizeCore(value: unknown, options: NormalizeOptions): CvContent {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const experience = normalizeExperience(
    raw.experience,
    options.experienceSkills,
    options.includeEmpty,
  );
  const cv: CvContent = {
    schemaVersion: 2,
    basics: normalizeBasics(raw.basics),
    sectionTitles: normalizeSectionTitles(raw.sectionTitles),
    education: normalizeEducation(raw.education),
    skills: normalizeSkills(raw.skills),
    experience,
    projects: normalizeProjects(raw.projects, options.projectMode, options.includeEmpty),
    custom: normalizeExperience(raw.custom, false, options.includeEmpty, true),
  };
  if (options.summary && (options.includeEmpty || raw.summary !== undefined)) {
    cv.summary = asString(raw.summary);
  }
  return cv;
}

/**
 * Build a clean object with only the fields allowed by the selected schema.
 * This intentionally drops unknown model output, then validation checks the
 * values that actually matter.
 */
export function normalizeCv(value: unknown, schemaId: string): CvContent {
  const schema = getSchema(schemaId);
  return normalizeCore(value, {
    summary: schemaAllowsSummary(schema.id),
    experienceSkills: schemaUsesExperienceSkills(schema.id),
    projectMode: schemaUsesProjectPso(schema.id) ? "pso" : "bullets",
    includeEmpty: true,
  });
}

/**
 * Normalization for cv.json loaded from disk. It preserves fields from every
 * supported schema so switching renderers/schemas does not silently discard
 * impact summaries, per-role skills, or Problem / Solution / Outcome data.
 */
export function normalizeStoredCv(value: unknown): CvContent {
  return normalizeCore(value, {
    summary: true,
    experienceSkills: true,
    projectMode: "all",
    includeEmpty: false,
  });
}
