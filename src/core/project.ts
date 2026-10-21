import type { Basics, CvContent, CvStyle, SectionTitles } from "./cv/types";
import { DEFAULT_SECTION_TITLES } from "./cv/schema";

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
  instructions: string;
  referenceCv: string;
}

export interface Project {
  schemaVersion: 1;
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
  files: {
    prompt?: string;
    response?: string;
    cv?: string;
  };
  /** In-memory latest prompt text; persisted to prompts/latest.md. */
  promptText?: string;
  /** In-memory latest raw LLM response; persisted to responses/latest.raw.txt. */
  rawResponse?: string;
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
