import { createEmptyCv, getSchema } from "../cv/schema";
import { normalizeStoredCv } from "../cv/normalize";
import {
  createDefaultDeliverableSelection,
  createEmptyRecipient,
} from "../deliverables/schema";
import {
  normalizeColdEmail,
  normalizeSelection,
} from "../deliverables/normalize";
import type {
  DeliverableArtifacts,
  DeliverableId,
  MessageDeliverableId,
} from "../deliverables/types";
import {
  PROMPT_TEMPLATE_FILES,
  PROMPT_TEMPLATE_IDS,
  PROMPT_VERSION,
  type PromptTemplateId,
} from "../prompt/builder";
import {
  createDefaultProfile,
  createDefaultSettings,
  normalizeProjectRecord,
  type Profile,
  type Project,
  type ProjectSummary,
  type Settings,
} from "../project";
import { defaultStyle, normalizeStyle } from "../style";
import { getRenderer } from "../../renderers/registry";
import {
  exists,
  getDirectory,
  listDirectories,
  readJson,
  readText,
  removeFile,
  writeJson,
  writeText,
} from "./fs";

export const WORKSPACE_VERSION = 1;

const LEGACY_PROMPT_PATH = ["config", "cv-prompt.md"];
const LEGACY_ARCHIVE_PATH = ["config", "cv-prompt.legacy.md"];

/** App-managed artifact paths, relative to one project directory. */
const DELIVERABLE_ARTIFACT_PATHS: Record<MessageDeliverableId, string[]> = {
  coverLetter: ["deliverables", "cover-letter.md"],
  coldEmail: ["deliverables", "cold-email.json"],
  linkedinMessage: ["deliverables", "linkedin-message.txt"],
};

const DELIVERABLE_FILENAME_SUFFIX: Record<MessageDeliverableId, string> = {
  coverLetter: "cover-letter",
  coldEmail: "cold-email",
  linkedinMessage: "linkedin-message",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export async function initializeWorkspace(
  root: FileSystemDirectoryHandle,
): Promise<{ settings: Settings; profile: Profile }> {
  await getDirectory(root, ["projects"]);
  await getDirectory(root, ["profiles"]);
  await getDirectory(root, ["config", "prompts"]);

  const storedSettings = await readJson<Settings>(root, ["settings.json"]);
  const settings = { ...createDefaultSettings(), ...(storedSettings ?? {}) };
  if (!storedSettings) await writeJson(root, ["settings.json"], settings);

  const storedProfile = await readJson<Profile>(root, ["profiles", "default.json"]);
  const profile = { ...createDefaultProfile(), ...(storedProfile ?? {}) };
  if (!storedProfile) await writeJson(root, ["profiles", "default.json"], profile);

  return { settings, profile };
}

export async function saveSettings(
  root: FileSystemDirectoryHandle,
  settings: Settings,
): Promise<void> {
  await writeJson(root, ["settings.json"], settings);
}

export async function saveProfile(
  root: FileSystemDirectoryHandle,
  profile: Profile,
): Promise<void> {
  await writeJson(root, ["profiles", "default.json"], profile);
}

export async function loadProjectSummaries(
  root: FileSystemDirectoryHandle,
): Promise<ProjectSummary[]> {
  const directories = await listDirectories(root, ["projects"]);
  const summaries: ProjectSummary[] = [];
  for (const directory of directories) {
    try {
      const project = await readJson<Project>(directory, ["project.json"]);
      if (!project) continue;
      summaries.push({
        id: project.id ?? directory.name,
        name: project.name ?? directory.name,
        company: project.job?.company ?? "",
        title: project.job?.title ?? "",
        updatedAt: project.updatedAt ?? project.createdAt ?? "",
        rendererId: project.rendererId ?? "classic",
      });
    } catch {
      // A malformed project should not hide the rest of the workspace.
    }
  }
  return summaries.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function loadProject(
  root: FileSystemDirectoryHandle,
  id: string,
  profile: Profile,
): Promise<Project> {
  const directory = await getDirectory(root, ["projects", id], false);
  const stored = await readJson<unknown>(directory, ["project.json"]);
  if (!isRecord(stored)) throw new Error(`Project "${id}" has no project.json.`);

  const renderer = getRenderer(
    typeof stored.rendererId === "string" ? stored.rendererId : "classic",
  );
  const storedSchemaId =
    typeof stored.schemaId === "string" ? stored.schemaId : "";
  const schemaId = renderer.meta.schemas.includes(storedSchemaId)
    ? storedSchemaId
    : renderer.meta.schemas[0];

  const record = normalizeProjectRecord(stored, {
    id,
    rendererId: renderer.meta.id,
    schemaId,
    promptVersion: PROMPT_VERSION,
  });

  const storedCv =
    (await readJson<unknown>(directory, ["cv.json"])) ??
    // Older projects may have stored the CV inline in project.json.
    stored.cv;
  const cv =
    storedCv != null
      ? normalizeStoredCv(storedCv)
      : createEmptyCv(record.schemaId, profile.basics);
  const storedStyles = isRecord(stored.styles) ? stored.styles : {};
  const styles = Object.fromEntries(
    Object.entries(storedStyles).map(([key, value]) => [key, normalizeStyle(value)]),
  );
  if (!styles[record.rendererId]) styles[record.rendererId] = defaultStyle();

  const readIndexed = async (
    path: string | undefined,
  ): Promise<string | undefined> =>
    path ? ((await readText(directory, pathSegments(path))) ?? undefined) : undefined;

  const files = { ...record.files };
  const promptText = await readIndexed(files.prompt);
  if (!promptText) delete files.prompt;
  const rawResponse = await readIndexed(files.response);
  if (!rawResponse) delete files.response;

  const artifacts: DeliverableArtifacts = {};

  const coverLetter = await readIndexed(files.coverLetter);
  if (coverLetter?.trim()) artifacts.coverLetter = coverLetter;
  else delete files.coverLetter;

  if (files.coldEmail) {
    try {
      const storedEmail = await readJson<unknown>(
        directory,
        pathSegments(files.coldEmail),
      );
      const email = normalizeColdEmail(storedEmail);
      if (email.subject || email.body) artifacts.coldEmail = email;
      else delete files.coldEmail;
    } catch {
      // A malformed message file should not hide the rest of the project.
      delete files.coldEmail;
    }
  }

  const linkedinMessage = await readIndexed(files.linkedinMessage);
  if (linkedinMessage?.trim()) artifacts.linkedinMessage = linkedinMessage;
  else delete files.linkedinMessage;

  return {
    ...record,
    styles,
    files,
    promptText,
    rawResponse,
    artifacts,
    cv,
  };
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "application"
  );
}

/**
 * Human-readable project name: `company — title`, then title, then company,
 * then `Outreach — recipient`, then "Outreach".
 */
export function projectNameFor(
  jobTitle: string,
  company: string,
  recipientName = "",
): string {
  const title = jobTitle.trim();
  const org = company.trim();
  const recipient = recipientName.trim();
  if (org && title) return `${org} — ${title}`;
  if (title) return title;
  if (org) return org;
  if (recipient) return `Outreach — ${recipient}`;
  return "Outreach";
}

/** Folder slug: company -> title -> recipient -> outreach, plus the date. */
export function projectSlugFor(
  jobTitle: string,
  company: string,
  recipientName: string,
  date: string,
): string {
  const context =
    company.trim() || jobTitle.trim() || recipientName.trim() || "outreach";
  return slugify(`${context}-${date}`);
}

/** First recipient name on the project, used only for names and filenames. */
export function projectRecipientName(project: Project): string {
  return (
    project.deliverables.settings.coldEmail.recipient?.name ||
    project.deliverables.settings.linkedinMessage.recipient?.name ||
    ""
  ).trim();
}

async function uniqueProjectId(
  root: FileSystemDirectoryHandle,
  base: string,
): Promise<string> {
  const directories = await listDirectories(root, ["projects"]);
  const taken = new Set(directories.map((entry) => entry.name));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

export async function createProject(
  root: FileSystemDirectoryHandle,
  options: {
    profile: Profile;
    jobTitle: string;
    company: string;
    rendererId: string;
    schemaId: string;
    /** Defaults to `["cv"]` when omitted. */
    deliverables?: readonly DeliverableId[];
    recipientName?: string;
  },
): Promise<Project> {
  const { profile, jobTitle, company } = options;
  const recipientName = options.recipientName?.trim() ?? "";
  const renderer = getRenderer(options.rendererId);
  const schemaId = renderer.meta.schemas.includes(options.schemaId)
    ? options.schemaId
    : renderer.meta.schemas[0];
  const date = new Date().toISOString().slice(0, 10);
  const base = projectSlugFor(jobTitle, company, recipientName, date);
  const id = await uniqueProjectId(root, base);
  const directory = await getDirectory(root, ["projects", id]);
  await getDirectory(directory, ["inputs"]);
  await getDirectory(directory, ["prompts"]);
  await getDirectory(directory, ["responses"]);
  await getDirectory(directory, ["deliverables"]);

  const cv = createEmptyCv(schemaId, profile.basics);
  cv.sectionTitles = { ...profile.sectionTitles };
  const deliverables = createDefaultDeliverableSelection();
  // Normalization supplies the CV fallback when the caller omits or empties
  // the selection, so a project always has at least one deliverable.
  deliverables.selected = normalizeSelection(options.deliverables);
  if (recipientName) {
    // Pre-fill both message settings so a recipient entered at creation is
    // available even if the user adds the other message deliverable later.
    deliverables.settings.coldEmail.recipient = {
      ...createEmptyRecipient(),
      name: recipientName,
    };
    deliverables.settings.linkedinMessage.recipient = {
      ...createEmptyRecipient(),
      name: recipientName,
    };
  }

  const now = new Date().toISOString();
  const project: Project = {
    schemaVersion: 2,
    id,
    name: projectNameFor(jobTitle, company, recipientName),
    createdAt: now,
    updatedAt: now,
    profileId: profile.id,
    job: {
      title: jobTitle,
      company,
      description: "",
      sharedInstructions: "",
      referenceCv: "",
    },
    rendererId: renderer.meta.id,
    schemaId,
    styles: { [renderer.meta.id]: defaultStyle() },
    promptVersion: PROMPT_VERSION,
    deliverables,
    files: { cv: "cv.json" },
    artifacts: {},
    cv,
  };
  await saveProject(root, project);
  return project;
}

async function clearArtifactFile(
  directory: FileSystemDirectoryHandle,
  indexedPath: string | undefined,
  fallbackPath: string[],
): Promise<void> {
  const targets = new Set<string>();
  if (indexedPath) targets.add(indexedPath);
  targets.add(fallbackPath.join("/"));
  for (const target of targets) {
    await removeFile(directory, pathSegments(target));
  }
}

async function saveTextArtifact(
  directory: FileSystemDirectoryHandle,
  project: Project,
  id: "coverLetter" | "linkedinMessage",
  value: string | undefined,
): Promise<void> {
  const target = DELIVERABLE_ARTIFACT_PATHS[id];
  if (typeof value === "string" && value.trim()) {
    await writeText(directory, target, value);
    project.files[id] = target.join("/");
    return;
  }
  // A cleared artifact must not leave its old file or index entry behind.
  await clearArtifactFile(directory, project.files[id], target);
  delete project.files[id];
}

async function saveColdEmailArtifact(
  directory: FileSystemDirectoryHandle,
  project: Project,
): Promise<void> {
  const target = DELIVERABLE_ARTIFACT_PATHS.coldEmail;
  const email = project.artifacts.coldEmail;
  if (email && (email.subject.trim() || email.body.trim())) {
    await writeJson(directory, target, {
      subject: email.subject,
      body: email.body,
    });
    project.files.coldEmail = target.join("/");
    return;
  }
  await clearArtifactFile(directory, project.files.coldEmail, target);
  delete project.files.coldEmail;
}

export async function saveProject(
  root: FileSystemDirectoryHandle,
  project: Project,
): Promise<void> {
  const directory = await getDirectory(root, ["projects", project.id]);
  await getDirectory(directory, ["inputs"]);
  await getDirectory(directory, ["prompts"]);
  await getDirectory(directory, ["responses"]);
  await getDirectory(directory, ["deliverables"]);

  await writeText(directory, ["inputs", "job.md"], `${project.job.description ?? ""}\n`);
  await writeText(
    directory,
    ["inputs", "instructions.md"],
    `${project.job.sharedInstructions ?? ""}\n`,
  );
  await writeText(
    directory,
    ["inputs", "reference-cv.md"],
    `${project.job.referenceCv ?? ""}\n`,
  );
  await writeJson(directory, ["cv.json"], project.cv);

  await saveTextArtifact(
    directory,
    project,
    "coverLetter",
    project.artifacts.coverLetter,
  );
  await saveColdEmailArtifact(directory, project);
  await saveTextArtifact(
    directory,
    project,
    "linkedinMessage",
    project.artifacts.linkedinMessage,
  );

  if (project.promptText != null) {
    await writeText(directory, ["prompts", "latest.md"], project.promptText);
    project.files.prompt = "prompts/latest.md";
  }
  if (project.rawResponse != null) {
    await writeText(directory, ["responses", "latest.raw.txt"], project.rawResponse);
    project.files.response = "responses/latest.raw.txt";
  }

  // cv.json is the sole source of CV content; project.json only stores the
  // project configuration and file index.
  const {
    promptText: _promptText,
    rawResponse: _rawResponse,
    cv: _cv,
    artifacts: _artifacts,
    ...persisted
  } = project;
  await writeJson(directory, ["project.json"], persisted);
}

export async function savePrompt(
  root: FileSystemDirectoryHandle,
  project: Project,
  text: string,
): Promise<void> {
  project.promptText = text;
  project.promptVersion = PROMPT_VERSION;
  project.files.prompt = "prompts/latest.md";
  await saveProject(root, project);
}

export async function saveResponse(
  root: FileSystemDirectoryHandle,
  project: Project,
  text: string,
): Promise<void> {
  project.rawResponse = text;
  project.files.response = "responses/latest.raw.txt";
  await saveProject(root, project);
}

/** Workspace override text for each template, or null when not overridden. */
export type PromptTemplateOverrides = Record<PromptTemplateId, string | null>;

function promptTemplatePath(id: PromptTemplateId): string[] {
  return ["config", "prompts", PROMPT_TEMPLATE_FILES[id]];
}

/** Reads every per-template override under `config/prompts/`. */
export async function loadPromptTemplates(
  root: FileSystemDirectoryHandle,
): Promise<PromptTemplateOverrides> {
  const overrides = {} as PromptTemplateOverrides;
  for (const id of PROMPT_TEMPLATE_IDS) {
    overrides[id] = await readText(root, promptTemplatePath(id));
  }
  return overrides;
}

export async function savePromptTemplateOverride(
  root: FileSystemDirectoryHandle,
  id: PromptTemplateId,
  text: string,
): Promise<void> {
  await writeText(root, promptTemplatePath(id), text);
}

/** Removes only `config/prompts/<id>.md`; other overrides stay untouched. */
export async function resetPromptTemplateOverride(
  root: FileSystemDirectoryHandle,
  id: PromptTemplateId,
): Promise<void> {
  await removeFile(root, promptTemplatePath(id));
}

export interface LegacyPromptArchiveResult {
  archived: boolean;
  /** Workspace-relative path of the archive, when one was written. */
  archivePath?: string;
}

async function nextLegacyArchivePath(
  root: FileSystemDirectoryHandle,
): Promise<string[]> {
  if (!(await exists(root, LEGACY_ARCHIVE_PATH))) {
    return [...LEGACY_ARCHIVE_PATH];
  }
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  let index = 1;
  for (;;) {
    const suffix = index === 1 ? stamp : `${stamp}-${index}`;
    const candidate = ["config", `cv-prompt.legacy-${suffix}.md`];
    if (!(await exists(root, candidate))) return candidate;
    index += 1;
  }
}

/**
 * Moves the pre-deliverables prompt override out of the active slot.
 *
 * The archive is written before the original is removed, so a failed write
 * leaves the legacy override in place. An existing archive is never
 * overwritten; collisions use a timestamped suffix.
 */
export async function archiveLegacyPromptOverride(
  root: FileSystemDirectoryHandle,
): Promise<LegacyPromptArchiveResult> {
  const legacy = await readText(root, LEGACY_PROMPT_PATH);
  if (legacy == null) return { archived: false };

  const archivePath = await nextLegacyArchivePath(root);
  try {
    await writeText(root, archivePath, legacy);
  } catch (error) {
    // Do not leave a partial archive behind, and keep the original untouched.
    await removeFile(root, archivePath).catch(() => {});
    throw error;
  }
  await removeFile(root, LEGACY_PROMPT_PATH);
  return { archived: true, archivePath: archivePath.join("/") };
}

export function projectDisplayName(project: Project): string {
  const derived = projectNameFor(
    project.job.title,
    project.job.company,
    projectRecipientName(project),
  );
  // Keep an explicitly stored name for legacy projects with no job or recipient
  // context, but never let it override the documented fallback order.
  return derived === "Outreach" ? project.name || "Outreach" : derived;
}

function projectFileContext(project: Project): string {
  return slugify(
    project.job.company ||
      project.job.title ||
      projectRecipientName(project) ||
      "application",
  );
}

export function projectCvFilename(project: Project, profile: Profile): string {
  const name = slugify(profile.basics.name || "cv");
  return `${name}-${projectFileContext(project)}-cv`;
}

export function projectDeliverableFilename(
  project: Project,
  profile: Profile,
  deliverable: MessageDeliverableId,
): string {
  const name = slugify(profile.basics.name || "cv");
  return `${name}-${projectFileContext(project)}-${DELIVERABLE_FILENAME_SUFFIX[deliverable]}`;
}

export function schemaForProject(project: Project): string {
  return getSchema(project.schemaId).id;
}
