/** Canonical CV content types. Style and renderer data live outside this model. */

export interface Basics {
  name: string;
  headline?: string;
  contact: string[];
}

export interface EducationEntry {
  degree: string;
  school: string;
  meta: string;
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface ExperienceEntry {
  role: string;
  dates: string;
  org: string;
  blurb?: string;
  bullets: string[];
  /** Used by the "impact" schema. Skills demonstrated in this role. */
  skills?: string[];
}

export interface ProjectEntry {
  role: string;
  dates: string;
  org: string;
  blurb?: string;
  /** Classic-style project bullets. Impact projects use problem/solution/outcome. */
  bullets?: string[];
  /** Used by the "impact" schema. */
  problem?: string;
  solution?: string;
  outcome?: string;
}

export interface SectionTitles {
  summary: string;
  education: string;
  skills: string;
  experience: string;
  projects: string;
  custom: string;
}

export interface CvContent {
  schemaVersion: number;
  basics: Basics;
  summary?: string;
  sectionTitles: SectionTitles;
  education: EducationEntry[];
  skills: SkillGroup[];
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  custom: ExperienceEntry[];
}

/** Renderer-facing style. Keyed by renderer id in the project. */
export interface CvStyle {
  typeScale: number;
  verticalScale: number;
  marginMm: number;
  sidebarMm: number;
  accent: string;
  /** Sanitized rich HTML for an edited field, keyed by JSON path. */
  fieldHtml: Record<string, string>;
  /** Plain text captured alongside fieldHtml, used for the drift guard. */
  fieldText: Record<string, string>;
}

export interface RendererMeta {
  apiVersion: number;
  id: string;
  name: string;
  description: string;
  schemas: string[];
  page: { width: string; height: string; multiPage: boolean };
  controls: {
    typeScale?: boolean;
    spacing?: boolean;
    margins?: boolean;
    sidebar?: boolean;
  };
  sections: string[];
}

export interface RenderContext {
  esc: (value: unknown) => string;
  field: (path: string, value: unknown) => string;
  nl2br: (value: unknown) => string;
}

export interface RendererModule {
  meta: RendererMeta;
  css: string;
  render: (cv: CvContent, ctx: RenderContext) => string;
}
