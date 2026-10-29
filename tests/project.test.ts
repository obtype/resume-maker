import { describe, expect, it } from "vitest";
import {
  createDefaultProfile,
  normalizeProjectRecord,
  type Profile,
} from "../src/core/project";
import { normalizeDeliverableSelection } from "../src/core/deliverables/normalize";
import {
  archiveLegacyPromptOverride,
  createProject,
  initializeWorkspace,
  loadProject,
  loadPromptTemplates,
  projectCvFilename,
  projectDeliverableFilename,
  projectDisplayName,
  projectNameFor,
  projectSlugFor,
  resetPromptTemplateOverride,
  saveProject,
  savePromptTemplateOverride,
} from "../src/core/workspace/projects";
import {
  PROMPT_TEMPLATE_FILES,
  PROMPT_TEMPLATE_IDS,
} from "../src/core/prompt/builder";
import {
  exists,
  getDirectory,
  readJson,
  readText,
  writeJson,
  writeText,
} from "../src/core/workspace/fs";

type MemoryEntry = MemoryDirectoryHandle | MemoryFileHandle;

/**
 * Small in-memory stand-in for the File System Access API. It implements only
 * the surface used by `fs.ts`, so save/load/archive can be unit-tested in Node.
 */
class MemoryFileHandle {
  readonly kind = "file";
  content = "";

  constructor(
    readonly name: string,
    private readonly root: MemoryDirectoryHandle,
  ) {}

  async getFile(): Promise<File> {
    return { text: async () => this.content } as unknown as File;
  }

  async createWritable(): Promise<{ write: (chunk: string) => Promise<void>; close: () => Promise<void> }> {
    const root = this.root;
    const handle = this;
    return {
      async write(chunk: string) {
        if (root.failWrites) throw new Error("Simulated write failure");
        handle.content = String(chunk);
      },
      async close() {
        // Nothing to flush in memory.
      },
    };
  }
}

class MemoryDirectoryHandle {
  readonly kind = "directory";
  readonly entries = new Map<string, MemoryEntry>();
  failWrites = false;

  constructor(
    readonly name: string,
    private readonly root?: MemoryDirectoryHandle,
  ) {}

  private get rootDirectory(): MemoryDirectoryHandle {
    return this.root ?? this;
  }

  async getDirectoryHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<MemoryDirectoryHandle> {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== "directory") {
        throw new DOMException(`${name} is not a directory`, "TypeMismatchError");
      }
      return existing;
    }
    if (!options.create) {
      throw new DOMException(`${name} was not found`, "NotFoundError");
    }
    const directory = new MemoryDirectoryHandle(name, this.rootDirectory);
    this.entries.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<MemoryFileHandle> {
    const existing = this.entries.get(name);
    if (existing) {
      if (existing.kind !== "file") {
        throw new DOMException(`${name} is not a file`, "TypeMismatchError");
      }
      return existing;
    }
    if (!options.create) {
      throw new DOMException(`${name} was not found`, "NotFoundError");
    }
    const file = new MemoryFileHandle(name, this.rootDirectory);
    this.entries.set(name, file);
    return file;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.has(name)) {
      throw new DOMException(`${name} was not found`, "NotFoundError");
    }
    this.entries.delete(name);
  }

  async *values(): AsyncIterableIterator<MemoryEntry> {
    yield* this.entries.values();
  }
}

function memoryWorkspace(): {
  memory: MemoryDirectoryHandle;
  handle: FileSystemDirectoryHandle;
} {
  const memory = new MemoryDirectoryHandle("workspace");
  return { memory, handle: memory as unknown as FileSystemDirectoryHandle };
}

function testProfile(): Profile {
  return {
    ...createDefaultProfile(),
    basics: {
      name: "Alex Example",
      headline: "Machine Learning Engineer",
      contact: ["alex@example.com"],
    },
  };
}

const fallbacks = {
  id: "fallback",
  rendererId: "classic",
  schemaId: "classic",
  promptVersion: "test",
  now: "2026-10-22T00:00:00.000Z",
};

describe("project record migration", () => {
  it("migrates a version-1 job and fills version-2 defaults", () => {
    const record = normalizeProjectRecord(
      {
        schemaVersion: 1,
        id: "acme-ml",
        name: "Acme — ML",
        createdAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-21T00:00:00.000Z",
        profileId: "default",
        job: {
          title: "ML Engineer",
          company: "Acme",
          description: "Build models.",
          instructions: "Emphasise computer vision.",
          referenceCv: "Old CV.",
        },
        rendererId: "classic",
        schemaId: "classic",
      },
      fallbacks,
    );

    expect(record.schemaVersion).toBe(2);
    expect(record.job.sharedInstructions).toBe("Emphasise computer vision.");
    expect(record.job).not.toHaveProperty("instructions");
    expect(record.job.referenceCv).toBe("Old CV.");
    expect(record.deliverables.selected).toEqual(["cv"]);
    expect(record.deliverables.settings.coldEmail.recipient?.name).toBe("");
    expect(record.files.cv).toBe("cv.json");
  });

  it("prefers an explicit sharedInstructions value, even when empty", () => {
    const record = normalizeProjectRecord(
      {
        job: {
          instructions: "Legacy text.",
          sharedInstructions: "",
        },
      },
      fallbacks,
    );

    expect(record.job.sharedInstructions).toBe("");
  });

  it("normalizes the deliverable selection and drops unknown ids", () => {
    const record = normalizeProjectRecord(
      {
        deliverables: {
          selected: ["linkedinMessage", "bogus", "linkedinMessage", "cv"],
          settings: {},
        },
      },
      fallbacks,
    );

    expect(record.deliverables.selected).toEqual(["cv", "linkedinMessage"]);
    expect(record.deliverables.settings.linkedinMessage.instructions).toBe("");
  });

  it("defaults an empty selection to CV", () => {
    expect(normalizeDeliverableSelection({ selected: [] }).selected).toEqual(["cv"]);
    expect(
      normalizeProjectRecord(
        { deliverables: { selected: [] } },
        fallbacks,
      ).deliverables.selected,
    ).toEqual(["cv"]);
  });

  it("falls back to supplied defaults for missing record fields", () => {
    const record = normalizeProjectRecord({}, fallbacks);

    expect(record.id).toBe("fallback");
    expect(record.name).toBe("fallback");
    expect(record.createdAt).toBe("2026-10-22T00:00:00.000Z");
    expect(record.updatedAt).toBe("2026-10-22T00:00:00.000Z");
    expect(record.profileId).toBe("default");
    expect(record.rendererId).toBe("classic");
    expect(record.schemaId).toBe("classic");
    expect(record.promptVersion).toBe("test");
  });
});

describe("project loading", () => {
  it("loads a version-1 project as version 2 with shared instructions", async () => {
    const { handle } = memoryWorkspace();
    await writeJson(handle, ["projects", "legacy", "project.json"], {
      schemaVersion: 1,
      id: "legacy",
      name: "Legacy outreach",
      job: {
        title: "",
        company: "",
        description: "",
        instructions: "Keep it warm.",
        referenceCv: "",
      },
    });

    const loaded = await loadProject(handle, "legacy", testProfile());

    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.job.sharedInstructions).toBe("Keep it warm.");
    expect(loaded.deliverables.selected).toEqual(["cv"]);
    expect(loaded.artifacts).toEqual({});
    expect(loaded.files.coverLetter).toBeUndefined();
    expect(loaded.files.coldEmail).toBeUndefined();
    expect(loaded.files.linkedinMessage).toBeUndefined();
    // A project written before job autofill has no posting URL to load.
    expect(loaded.job.sourceUrl).toBeUndefined();
  });

  it("ignores a stale artifact index entry with no file", async () => {
    const { handle } = memoryWorkspace();
    await writeJson(handle, ["projects", "stale", "project.json"], {
      schemaVersion: 2,
      id: "stale",
      files: {
        cv: "cv.json",
        coverLetter: "deliverables/cover-letter.md",
      },
    });

    const loaded = await loadProject(handle, "stale", testProfile());

    expect(loaded.artifacts.coverLetter).toBeUndefined();
    expect(loaded.files.coverLetter).toBeUndefined();
  });
});

describe("workspace settings", () => {
  it("loads a settings.json written before job autofill and leaves it alone", async () => {
    const { handle } = memoryWorkspace();
    // Exactly what an older workspace holds: no `careerOpsDir` key at all.
    const legacy = {
      schemaVersion: 1,
      defaultRendererId: "impact",
      lastProjectId: "acme-ml-2026-10-20",
    };
    await writeJson(handle, ["settings.json"], legacy);

    const { settings } = await initializeWorkspace(handle);

    expect(settings.schemaVersion).toBe(1);
    expect(settings.defaultRendererId).toBe("impact");
    expect(settings.lastProjectId).toBe("acme-ml-2026-10-20");
    expect(settings.careerOpsDir).toBe("");
    // The file is not rewritten on hydrate, so an older version still reads it.
    await expect(readJson(handle, ["settings.json"])).resolves.toEqual(legacy);
  });

  it("normalises a non-string careerOpsDir to an empty folder", async () => {
    const { handle } = memoryWorkspace();
    await writeJson(handle, ["settings.json"], { schemaVersion: 1, careerOpsDir: 42 });

    const { settings } = await initializeWorkspace(handle);

    expect(settings.careerOpsDir).toBe("");
  });
});

describe("project creation", () => {
  it("creates the workspace prompt directory and project deliverables folder", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);
    await expect(getDirectory(handle, ["config", "prompts"], false)).resolves.toBeTruthy();

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });

    await expect(
      getDirectory(handle, ["projects", project.id, "deliverables"], false),
    ).resolves.toBeTruthy();
    expect(project.deliverables.selected).toEqual(["cv"]);
    expect(project.name).toBe("Acme — ML Engineer");
    expect(project.id).toMatch(/^acme-\d{4}-\d{2}-\d{2}$/);
  });

  it("names and slugs outreach projects from the recipient", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "",
      recipientName: "Sam Rivera",
      deliverables: ["coldEmail"],
      rendererId: "classic",
      schemaId: "classic",
    });

    expect(project.name).toBe("Outreach — Sam Rivera");
    expect(project.id).toMatch(/^sam-rivera-\d{4}-\d{2}-\d{2}$/);
    expect(project.deliverables.selected).toEqual(["coldEmail"]);
    expect(project.deliverables.settings.coldEmail.recipient?.name).toBe("Sam Rivera");
    expect(project.deliverables.settings.linkedinMessage.recipient?.name).toBe(
      "Sam Rivera",
    );
    expect(projectDisplayName(project)).toBe("Outreach — Sam Rivera");
  });

  it("falls back to Outreach when there is no job or recipient", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "",
      rendererId: "classic",
      schemaId: "classic",
    });

    expect(project.name).toBe("Outreach");
    expect(project.id).toMatch(/^outreach-\d{4}-\d{2}-\d{2}$/);
    expect(projectDisplayName(project)).toBe("Outreach");
  });

  it("creates a cover-letter-only project from a company and keeps a CV schema for later", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "Initech",
      rendererId: "classic",
      schemaId: "classic",
      deliverables: ["coverLetter"],
    });

    expect(project.name).toBe("Initech");
    expect(project.id).toMatch(/^initech-\d{4}-\d{2}-\d{2}$/);
    expect(project.deliverables.selected).toEqual(["coverLetter"]);
    // A message-only project still needs a valid CV renderer/schema later.
    expect(project.rendererId).toBe("classic");
    expect(project.schemaId).toBe("classic");
    expect(project.cv.basics.name).toBe("Alex Example");

    const loaded = await loadProject(handle, project.id, testProfile());
    expect(loaded.deliverables.selected).toEqual(["coverLetter"]);
    expect(loaded.rendererId).toBe("classic");
    expect(loaded.schemaId).toBe("classic");
  });

  it("pre-fills the LinkedIn recipient for a recipient-only project", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "",
      rendererId: "classic",
      schemaId: "classic",
      deliverables: ["linkedinMessage"],
      recipientName: "Sam Rivera",
    });

    expect(project.name).toBe("Outreach — Sam Rivera");
    expect(project.id).toMatch(/^sam-rivera-\d{4}-\d{2}-\d{2}$/);
    expect(project.deliverables.selected).toEqual(["linkedinMessage"]);
    expect(project.deliverables.settings.linkedinMessage.recipient?.name).toBe(
      "Sam Rivera",
    );
    expect(project.deliverables.settings.coldEmail.recipient?.name).toBe("Sam Rivera");

    const loaded = await loadProject(handle, project.id, testProfile());
    expect(loaded.deliverables.settings.linkedinMessage.recipient?.name).toBe(
      "Sam Rivera",
    );
  });

  it("pre-fills the recipient for a CV + cold-email project", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "Initech",
      rendererId: "classic",
      schemaId: "classic",
      deliverables: ["cv", "coldEmail"],
      recipientName: "Sam Rivera",
    });

    expect(project.name).toBe("Initech");
    expect(project.deliverables.selected).toEqual(["cv", "coldEmail"]);
    expect(project.deliverables.settings.coldEmail.recipient?.name).toBe("Sam Rivera");
  });

  it("uses the CV fallback when the requested selection is empty", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "",
      company: "Initech",
      rendererId: "classic",
      schemaId: "classic",
      deliverables: [],
    });

    expect(project.deliverables.selected).toEqual(["cv"]);
  });

  it("stores a fetched description and source URL and mirrors the description", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);
    const description = [
      "Acme Robotics is hiring a computer vision engineer to own perception for our warehouse fleet.",
      "",
      "Requirements: strong Python and C++, hands-on PyTorch, and edge inference experience.",
    ].join("\n");
    const sourceUrl = "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e";

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "Computer Vision Engineer",
      company: "Acme Robotics",
      description,
      sourceUrl,
      rendererId: "classic",
      schemaId: "classic",
    });

    // The fetched title and company are the form's values, so they also name
    // the project and its folder.
    expect(project.name).toBe("Acme Robotics — Computer Vision Engineer");
    expect(project.id).toMatch(/^acme-robotics-\d{4}-\d{2}-\d{2}$/);
    expect(project.job.description).toBe(description);
    expect(project.job.sourceUrl).toBe(sourceUrl);

    await expect(
      readText(handle, ["projects", project.id, "inputs", "job.md"]),
    ).resolves.toBe(`${description}\n`);

    const loaded = await loadProject(handle, project.id, testProfile());
    expect(loaded.job.description).toBe(description);
    expect(loaded.job.sourceUrl).toBe(sourceUrl);
  });

  it("keeps a hand-typed target's empty description and absent source URL", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });

    expect(project.name).toBe("Acme — ML Engineer");
    expect(project.id).toMatch(/^acme-\d{4}-\d{2}-\d{2}$/);
    expect(project.job.description).toBe("");
    expect(project.job.sourceUrl).toBeUndefined();

    // The description mirror is still written, exactly as before autofill.
    await expect(
      readText(handle, ["projects", project.id, "inputs", "job.md"]),
    ).resolves.toBe("\n");

    const persisted = await readJson<Record<string, unknown>>(handle, [
      "projects",
      project.id,
      "project.json",
    ]);
    expect(persisted?.job).toMatchObject({ description: "" });
    expect(persisted?.job).not.toHaveProperty("sourceUrl");
  });

  it("keeps the pure name and slug fallbacks in order", () => {
    expect(projectNameFor("ML Engineer", "Acme")).toBe("Acme — ML Engineer");
    expect(projectNameFor("", "Acme")).toBe("Acme");
    expect(projectNameFor("ML Engineer", "")).toBe("ML Engineer");
    expect(projectNameFor("", "", "Sam Rivera")).toBe("Outreach — Sam Rivera");
    expect(projectNameFor("", "")).toBe("Outreach");

    expect(projectSlugFor("ML Engineer", "Acme", "", "2026-10-22")).toBe(
      "acme-2026-10-22",
    );
    expect(projectSlugFor("ML Engineer", "", "", "2026-10-22")).toBe(
      "ml-engineer-2026-10-22",
    );
    expect(projectSlugFor("", "", "Sam Rivera", "2026-10-22")).toBe(
      "sam-rivera-2026-10-22",
    );
    expect(projectSlugFor("", "", "", "2026-10-22")).toBe(
      "outreach-2026-10-22",
    );
  });
});

describe("artifact persistence", () => {
  it("round-trips message artifacts without putting content in project.json", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });
    const coverLetter = "Dear hiring manager,\n\nI build reliable systems.\n";
    const coldEmail = { subject: "Quick hello", body: "A short note about the team." };
    const linkedinMessage = "Thanks for connecting. I would like to compare notes.";
    project.job.sharedInstructions = "Emphasise edge deployment.";
    project.artifacts = { coverLetter, coldEmail, linkedinMessage };
    project.promptText = "The latest prompt.";
    project.rawResponse = "The latest raw response.";

    await saveProject(handle, project);

    const projectDirectory = ["projects", project.id];
    const persisted = await readJson<Record<string, unknown>>(
      handle,
      [...projectDirectory, "project.json"],
    );
    expect(persisted).not.toBeNull();
    const persistedText = JSON.stringify(persisted);
    expect(persistedText).not.toContain("Dear hiring manager");
    expect(persistedText).not.toContain("A short note about the team");
    expect(persistedText).not.toContain("Thanks for connecting");
    expect(persisted).not.toHaveProperty("artifacts");
    expect(persisted).not.toHaveProperty("cv");
    expect(persisted).not.toHaveProperty("promptText");
    expect(persisted).not.toHaveProperty("rawResponse");
    expect(persisted?.files).toMatchObject({
      coverLetter: "deliverables/cover-letter.md",
      coldEmail: "deliverables/cold-email.json",
      linkedinMessage: "deliverables/linkedin-message.txt",
    });

    await expect(
      readText(handle, [...projectDirectory, "deliverables", "cover-letter.md"]),
    ).resolves.toBe(coverLetter);
    await expect(
      readJson(handle, [...projectDirectory, "deliverables", "cold-email.json"]),
    ).resolves.toEqual(coldEmail);
    await expect(
      readText(handle, [...projectDirectory, "deliverables", "linkedin-message.txt"]),
    ).resolves.toBe(linkedinMessage);
    await expect(
      readText(handle, [...projectDirectory, "inputs", "instructions.md"]),
    ).resolves.toBe("Emphasise edge deployment.\n");

    const loaded = await loadProject(handle, project.id, testProfile());
    expect(loaded.job.sharedInstructions).toBe("Emphasise edge deployment.");
    expect(loaded.artifacts).toEqual({ coverLetter, coldEmail, linkedinMessage });
    expect(loaded.files.coverLetter).toBe("deliverables/cover-letter.md");
    expect(loaded.files.coldEmail).toBe("deliverables/cold-email.json");
    expect(loaded.files.linkedinMessage).toBe("deliverables/linkedin-message.txt");
    expect(loaded.promptText).toBe("The latest prompt.");
    expect(loaded.rawResponse).toBe("The latest raw response.");
  });

  it("removes only the cleared artifact file and index entry on save", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });
    project.artifacts = {
      coverLetter: "A letter.",
      coldEmail: { subject: "Hello", body: "There." },
      linkedinMessage: "Thanks.",
    };
    await saveProject(handle, project);

    const projectDirectory = ["projects", project.id];
    const loaded = await loadProject(handle, project.id, testProfile());
    loaded.artifacts.coverLetter = undefined;
    await saveProject(handle, loaded);

    await expect(
      exists(handle, [...projectDirectory, "deliverables", "cover-letter.md"]),
    ).resolves.toBe(false);
    await expect(
      exists(handle, [...projectDirectory, "deliverables", "cold-email.json"]),
    ).resolves.toBe(true);
    await expect(
      exists(handle, [...projectDirectory, "deliverables", "linkedin-message.txt"]),
    ).resolves.toBe(true);

    const persisted = await readJson<Record<string, unknown>>(
      handle,
      [...projectDirectory, "project.json"],
    );
    expect(persisted?.files).toMatchObject({
      coldEmail: "deliverables/cold-email.json",
      linkedinMessage: "deliverables/linkedin-message.txt",
    });
    expect(persisted?.files).not.toHaveProperty("coverLetter");

    const reloaded = await loadProject(handle, project.id, testProfile());
    expect(reloaded.artifacts.coverLetter).toBeUndefined();
    expect(reloaded.artifacts.coldEmail).toEqual({
      subject: "Hello",
      body: "There.",
    });
    expect(reloaded.artifacts.linkedinMessage).toBe("Thanks.");
    expect(reloaded.files.coverLetter).toBeUndefined();
  });

  it("clears a cold email whose subject and body are blank", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);

    const project = await createProject(handle, {
      profile: testProfile(),
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });
    project.artifacts = { coldEmail: { subject: "Hello", body: "There." } };
    await saveProject(handle, project);

    project.artifacts.coldEmail = { subject: "  ", body: "\n" };
    await saveProject(handle, project);

    await expect(
      exists(handle, [
        "projects",
        project.id,
        "deliverables",
        "cold-email.json",
      ]),
    ).resolves.toBe(false);
    expect(project.files.coldEmail).toBeUndefined();
  });
});

describe("deliverable filenames", () => {
  it("uses the candidate, company, and deliverable suffix", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);
    const profile = testProfile();
    const project = await createProject(handle, {
      profile,
      jobTitle: "ML Engineer",
      company: "Acme",
      rendererId: "classic",
      schemaId: "classic",
    });

    expect(projectCvFilename(project, profile)).toBe("alex-example-acme-cv");
    expect(projectDeliverableFilename(project, profile, "coverLetter")).toBe(
      "alex-example-acme-cover-letter",
    );
    expect(projectDeliverableFilename(project, profile, "coldEmail")).toBe(
      "alex-example-acme-cold-email",
    );
    expect(projectDeliverableFilename(project, profile, "linkedinMessage")).toBe(
      "alex-example-acme-linkedin-message",
    );
  });

  it("falls back from company to title to recipient to application", async () => {
    const { handle } = memoryWorkspace();
    await initializeWorkspace(handle);
    const profile = testProfile();

    const titleOnly = await createProject(handle, {
      profile,
      jobTitle: "ML Engineer",
      company: "",
      rendererId: "classic",
      schemaId: "classic",
    });
    expect(projectDeliverableFilename(titleOnly, profile, "coverLetter")).toBe(
      "alex-example-ml-engineer-cover-letter",
    );

    const recipientOnly = await createProject(handle, {
      profile,
      jobTitle: "",
      company: "",
      recipientName: "Sam Rivera",
      rendererId: "classic",
      schemaId: "classic",
    });
    expect(projectCvFilename(recipientOnly, profile)).toBe(
      "alex-example-sam-rivera-cv",
    );
    expect(
      projectDeliverableFilename(recipientOnly, profile, "linkedinMessage"),
    ).toBe("alex-example-sam-rivera-linkedin-message");

    const bare = await createProject(handle, {
      profile,
      jobTitle: "",
      company: "",
      rendererId: "classic",
      schemaId: "classic",
    });
    expect(projectDeliverableFilename(bare, profile, "coldEmail")).toBe(
      "alex-example-application-cold-email",
    );
  });
});

describe("legacy prompt override archive", () => {
  it("archives the override and removes the original", async () => {
    const { handle } = memoryWorkspace();
    await writeText(handle, ["config", "cv-prompt.md"], "Old template.");

    const result = await archiveLegacyPromptOverride(handle);

    expect(result).toEqual({
      archived: true,
      archivePath: "config/cv-prompt.legacy.md",
    });
    await expect(
      readText(handle, ["config", "cv-prompt.legacy.md"]),
    ).resolves.toBe("Old template.");
    await expect(readText(handle, ["config", "cv-prompt.md"])).resolves.toBeNull();
  });

  it("does nothing when there is no legacy override", async () => {
    const { handle } = memoryWorkspace();

    const result = await archiveLegacyPromptOverride(handle);

    expect(result).toEqual({ archived: false });
    await expect(
      exists(handle, ["config", "cv-prompt.legacy.md"]),
    ).resolves.toBe(false);
  });

  it("never overwrites an existing archive", async () => {
    const { handle } = memoryWorkspace();
    await writeText(handle, ["config", "cv-prompt.legacy.md"], "First archive.");
    await writeText(handle, ["config", "cv-prompt.md"], "Second template.");

    const result = await archiveLegacyPromptOverride(handle);

    expect(result.archived).toBe(true);
    expect(result.archivePath).toMatch(
      /^config\/cv-prompt\.legacy-\d{8}T\d{6}Z\.md$/,
    );
    expect(result.archivePath).not.toBe("config/cv-prompt.legacy.md");
    await expect(
      readText(handle, ["config", "cv-prompt.legacy.md"]),
    ).resolves.toBe("First archive.");
    await expect(
      readText(handle, (result.archivePath as string).split("/")),
    ).resolves.toBe("Second template.");
    await expect(readText(handle, ["config", "cv-prompt.md"])).resolves.toBeNull();
  });

  it("leaves the legacy override in place when the archive write fails", async () => {
    const { memory, handle } = memoryWorkspace();
    await writeText(handle, ["config", "cv-prompt.md"], "Keep me.");
    memory.failWrites = true;

    await expect(archiveLegacyPromptOverride(handle)).rejects.toThrow(
      "Simulated write failure",
    );

    memory.failWrites = false;
    await expect(readText(handle, ["config", "cv-prompt.md"])).resolves.toBe(
      "Keep me.",
    );
    await expect(
      exists(handle, ["config", "cv-prompt.legacy.md"]),
    ).resolves.toBe(false);
  });
});

describe("per-template prompt overrides", () => {
  it("returns null for every template when there are no overrides", async () => {
    const { handle } = memoryWorkspace();

    const overrides = await loadPromptTemplates(handle);

    expect(Object.keys(overrides).sort()).toEqual([...PROMPT_TEMPLATE_IDS].sort());
    for (const id of PROMPT_TEMPLATE_IDS) {
      expect(overrides[id]).toBeNull();
    }
  });

  it("writes only config/prompts/<file> for the requested template", async () => {
    const { handle } = memoryWorkspace();

    await savePromptTemplateOverride(handle, "coverLetter", "Custom letter rules.");

    await expect(
      readText(handle, ["config", "prompts", PROMPT_TEMPLATE_FILES.coverLetter]),
    ).resolves.toBe("Custom letter rules.");
    await expect(readText(handle, ["config", "cv-prompt.md"])).resolves.toBeNull();

    const overrides = await loadPromptTemplates(handle);
    expect(overrides.coverLetter).toBe("Custom letter rules.");
    expect(overrides.context).toBeNull();
    expect(overrides.cv).toBeNull();
    expect(overrides.coldEmail).toBeNull();
    expect(overrides.linkedinMessage).toBeNull();
  });

  it("maps every template id to its documented override file", async () => {
    const { handle } = memoryWorkspace();

    for (const id of PROMPT_TEMPLATE_IDS) {
      await savePromptTemplateOverride(handle, id, `${id} override`);
    }

    for (const id of PROMPT_TEMPLATE_IDS) {
      await expect(
        readText(handle, ["config", "prompts", PROMPT_TEMPLATE_FILES[id]]),
      ).resolves.toBe(`${id} override`);
    }
    const overrides = await loadPromptTemplates(handle);
    expect(overrides).toEqual(
      Object.fromEntries(
        PROMPT_TEMPLATE_IDS.map((id) => [id, `${id} override`]),
      ),
    );
  });

  it("resets only the requested override and keeps the rest", async () => {
    const { handle } = memoryWorkspace();
    await savePromptTemplateOverride(handle, "context", "Context override.");
    await savePromptTemplateOverride(handle, "cv", "CV override.");

    await resetPromptTemplateOverride(handle, "context");

    await expect(
      exists(handle, ["config", "prompts", PROMPT_TEMPLATE_FILES.context]),
    ).resolves.toBe(false);
    await expect(
      readText(handle, ["config", "prompts", PROMPT_TEMPLATE_FILES.cv]),
    ).resolves.toBe("CV override.");

    const overrides = await loadPromptTemplates(handle);
    expect(overrides.context).toBeNull();
    expect(overrides.cv).toBe("CV override.");
  });

  it("treats resetting a missing override as a no-op", async () => {
    const { handle } = memoryWorkspace();

    await expect(
      resetPromptTemplateOverride(handle, "linkedinMessage"),
    ).resolves.toBeUndefined();
    await expect(
      exists(handle, ["config", "prompts", PROMPT_TEMPLATE_FILES.linkedinMessage]),
    ).resolves.toBe(false);
  });
});
