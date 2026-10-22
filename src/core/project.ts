import type { Basics, CvContent, CvStyle, SectionTitles } from "./cv/types";
import { DEFAULT_SECTION_TITLES } from "./cv/schema";
import { normalizeDeliverableSelection } from "./deliverables/normalize";
import type {
  DeliverableArtifacts,
  DeliverableSelection,
} from "./deliverables/types";

export interface PdrSource {
  sourceName: string;
  sourceKind: "docx" | "md" | "txt" | "pasted" | "none";
  importedAt: string;
  markdown: string;
}

export interface Profile {
  schemaVersion: 1;
  id: string;
  basics: Basics;
  pdr: PdrSource;
  sectionTitles: SectionTitles;
  defaultInstructions: string;
}

export interface ProjectJob {
  title: string;
  company: string;
  description: string;
  /** Instructions that apply to every selected deliverable. */
  sharedInstructions: string;
  referenceCv: string;
}

export interface Project {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  job: ProjectJob;
  rendererId: string;
  schemaId: string;
  styles: Record<string, CvStyle>;
  promptVersion: string;
  /** Which deliverables the next prompt should request, plus their settings. */
  deliverables: DeliverableSelection;
  files: {
    prompt?: string;
    response?: string;
    cv?: string;
    coverLetter?: string;
    coldEmail?: string;
    linkedinMessage?: string;
  };
  /** In-memory latest prompt text; persisted to prompts/latest.md. */
  promptText?: string;
  /** In-memory latest raw LLM response; persisted to responses/latest.raw.txt. */
  rawResponse?: string;
  /** In-memory applied message artifacts; persisted under deliverables/. */
  artifacts: DeliverableArtifacts;
  cv: CvContent;
}

export interface ProjectSummary {
  id: string;
  name: string;
  company: string;
  title: string;
  updatedAt: string;
  rendererId: string;
}

export interface Settings {
  schemaVersion: 1;
  defaultRendererId: string;
  lastProjectId?: string;
}

export function createDefaultProfile(): Profile {
  return {
    schemaVersion: 1,
    id: "default",
    basics: {
      name: "",
      headline: "",
      contact: [],
    },
    pdr: {
      sourceName: "",
      sourceKind: "none",
      importedAt: "",
      markdown: "",
    },
    sectionTitles: { ...DEFAULT_SECTION_TITLES },
    defaultInstructions: "",
  };
}

export function createDefaultSettings(): Settings {
  return {
    schemaVersion: 1,
    defaultRendererId: "classic",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Defaults that cannot be derived from the stored record itself. */
export interface ProjectRecordFallbacks {
  id: string;
  rendererId: string;
  schemaId: string;
  promptVersion: string;
  now?: string;
}

/** Persisted project fields after migration and normalization. */
export interface NormalizedProjectRecord {
  schemaVersion: 2;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  job: ProjectJob;
  rendererId: string;
  schemaId: string;
  promptVersion: string;
  deliverables: DeliverableSelection;
  files: Project["files"];
}

/**
 * Pure migration/normalization for a stored `project.json` record.
 *
 * Version-1 records held shared instructions under `job.instructions`; version
 * 2 moved them to `job.sharedInstructions`. An explicit empty
 * `sharedInstructions` wins over the legacy field, so a migrated project that
 * the user cleared does not resurrect the old text.
 */
export function normalizeProjectRecord(
  value: unknown,
  fallbacks: ProjectRecordFallbacks,
): NormalizedProjectRecord {
  const record = isRecord(value) ? value : {};
  const jobRecord = isRecord(record.job) ? record.job : {};
  const filesRecord = isRecord(record.files) ? record.files : {};
  const now = fallbacks.now ?? new Date().toISOString();
  const createdAt = asText(record.createdAt) || now;
  const job: ProjectJob = {
    title: asText(jobRecord.title),
    company: asText(jobRecord.company),
    description: asText(jobRecord.description),
    sharedInstructions: Object.prototype.hasOwnProperty.call(
      jobRecord,
      "sharedInstructions",
    )
      ? asText(jobRecord.sharedInstructions)
      : asText(jobRecord.instructions),
    referenceCv: asText(jobRecord.referenceCv),
  };

  const filePath = (key: keyof Project["files"]): string | undefined =>
    asText(filesRecord[key]).trim() || undefined;

  return {
    schemaVersion: 2,
    id: asText(record.id) || fallbacks.id,
    name: asText(record.name).trim() || fallbacks.id,
    createdAt,
    updatedAt: asText(record.updatedAt) || createdAt,
    profileId: asText(record.profileId) || "default",
    job,
    rendererId: asText(record.rendererId) || fallbacks.rendererId,
    schemaId: asText(record.schemaId) || fallbacks.schemaId,
    promptVersion: asText(record.promptVersion) || fallbacks.promptVersion,
    deliverables: normalizeDeliverableSelection(record.deliverables),
    files: {
      prompt: filePath("prompt"),
      response: filePath("response"),
      cv: filePath("cv") ?? "cv.json",
      coverLetter: filePath("coverLetter"),
      coldEmail: filePath("coldEmail"),
      linkedinMessage: filePath("linkedinMessage"),
    },
  };
}
