import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_TEMPLATES,
  PROMPT_TEMPLATE_FILES,
  PROMPT_TEMPLATE_IDS,
  PROMPT_VERSION,
  buildProjectPrompt,
  estimateTokens,
  existingCvText,
  instructionsText,
  promptWarnings,
  recipientText,
  resolveDeliverableSelection,
  type PromptTemplateId,
  type PromptTemplates,
} from "../src/core/prompt/builder";
import { createEmptyCv, getSchema } from "../src/core/cv/schema";
import {
  createDefaultProfile,
  type Profile,
  type Project,
} from "../src/core/project";
import {
  createDefaultDeliverableSelection,
  createEmptyRecipient,
} from "../src/core/deliverables/schema";
import type { DeliverableId, Recipient } from "../src/core/deliverables/types";

const DATE = "2026-10-22";

const templateFiles: Record<PromptTemplateId, string> = {
  context: "context.md",
  cv: "cv.md",
  coverLetter: "cover-letter.md",
  coldEmail: "cold-email.md",
  linkedinMessage: "linkedin-message.md",
};

function loadTemplates(): PromptTemplates {
  const read = (file: string) =>
    readFileSync(
      new URL(`../public/config/prompts/${file}`, import.meta.url),
      "utf8",
    );
  return {
    context: read(templateFiles.context),
    cv: read(templateFiles.cv),
    coverLetter: read(templateFiles.coverLetter),
    coldEmail: read(templateFiles.coldEmail),
    linkedinMessage: read(templateFiles.linkedinMessage),
  };
}

const TEMPLATES = loadTemplates();

function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return { ...createEmptyRecipient(), ...overrides };
}

function fictionalProfile(): Profile {
  return {
    ...createDefaultProfile(),
    basics: {
      name: "Alex Example",
      headline: "Computer Vision Engineer",
      contact: ["alex@example.com", "Berlin, Germany"],
    },
    pdr: {
      sourceName: "pdr.md",
      sourceKind: "md",
      importedAt: "2026-10-21T00:00:00.000Z",
      markdown: "PDR-ONLY-FACT: reduced false positives by 40%.",
    },
    defaultInstructions: "Default tone: direct.",
  };
}

function fictionalCv(): Project["cv"] {
  const profile = fictionalProfile();
  const cv = createEmptyCv("classic", profile.basics);
  cv.basics = { ...profile.basics };
  cv.education = [
    {
      degree: "MSc Computer Science",
      school: "Example University",
      meta: "2018 – 2020",
    },
  ];
  cv.skills = [{ label: "Languages", items: ["Python", "C++"] }];
  cv.experience = [
    {
      role: "EXISTING-CV-ONLY Senior Engineer",
      dates: "Jan 2020 – Present",
      org: "Legacy Labs",
      bullets: ["EXISTING-CV-ONLY bullet about detection."],
    },
  ];
  return cv;
}

interface FixtureOptions {
  selected?: DeliverableId[];
  job?: Partial<Project["job"]>;
  cv?: Project["cv"];
}

function fixture({
  selected = ["cv"],
  job = {},
  cv = fictionalCv(),
}: FixtureOptions = {}): { profile: Profile; project: Project } {
  const profile = fictionalProfile();
  const deliverables = createDefaultDeliverableSelection();
  deliverables.selected = [...selected];
  deliverables.settings.cv.instructions = "Lead with perception work.";
  deliverables.settings.coverLetter.instructions =
    "Mention the robotics startup.";
  deliverables.settings.coldEmail.instructions =
    "Ask about the perception team.";
  deliverables.settings.coldEmail.recipient = recipient({
    name: "Priya Example",
    role: "Engineering Manager",
    company: "Example Robotics",
    profileUrl: "https://example.com/priya",
    about: "Runs the perception team.\nHires pragmatic engineers.",
    posts: "Wrote about lidar calibration.",
    relationship: "Met at a meetup.",
    intent: "Explore a role on the perception team.",
  });
  deliverables.settings.linkedinMessage.instructions =
    "Keep it warm and brief.";
  deliverables.settings.linkedinMessage.recipient = recipient({
    name: "Priya Example",
    role: "Engineering Manager",
    company: "Example Robotics",
    about: "Perception lead and conference speaker.",
    posts: "Posted about sensor fusion.",
  });

  const project: Project = {
    schemaVersion: 2,
    id: "acme-ml",
    name: "Acme — Machine Learning Engineer",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    profileId: "default",
    job: {
      title: "Machine Learning Engineer",
      company: "Acme",
      description: "Own perception models for edge devices.",
      sharedInstructions: "Emphasise computer vision.",
      referenceCv: "REFERENCE-CV-ONLY text.",
      ...job,
    },
    rendererId: "classic",
    schemaId: "classic",
    styles: {},
    promptVersion: "test",
    deliverables,
    files: {},
    artifacts: {},
    cv,
  };
  return { profile, project };
}

function build(
  project: Project,
  profile: Profile,
  schemaId = project.schemaId,
  templates: PromptTemplates = TEMPLATES,
): string {
  return buildProjectPrompt({
    profile,
    project,
    schema: getSchema(schemaId),
    templates,
    date: DATE,
  });
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("bundled prompt templates", () => {
  it("ships one file per template id", () => {
    expect([...PROMPT_TEMPLATE_IDS]).toEqual([
      "context",
      "cv",
      "coverLetter",
      "coldEmail",
      "linkedinMessage",
    ]);
    for (const id of PROMPT_TEMPLATE_IDS) {
      expect(PROMPT_TEMPLATE_FILES[id]).toBe(templateFiles[id]);
      expect(TEMPLATES[id].trim().length).toBeGreaterThan(50);
    }
  });

  it("uses every documented placeholder in its own template", () => {
    const expected: Record<PromptTemplateId, string[]> = {
      context: [
        "BASICS",
        "PDR",
        "JOB_TITLE",
        "COMPANY",
        "JOB_DESCRIPTION",
        "SHARED_INSTRUCTIONS",
        "EXISTING_CV",
      ],
      cv: [
        "REFERENCE_CV",
        "CV_INSTRUCTIONS",
        "SCHEMA_NAME",
        "SCHEMA_ID",
        "SCHEMA_JSON",
        "SCHEMA_NOTES",
      ],
      coverLetter: ["COVER_LETTER_INSTRUCTIONS", "COVER_LETTER_SCHEMA"],
      coldEmail: [
        "COLD_EMAIL_INSTRUCTIONS",
        "COLD_EMAIL_SCHEMA",
        "RECIPIENT",
      ],
      linkedinMessage: [
        "LINKEDIN_INSTRUCTIONS",
        "LINKEDIN_SCHEMA",
        "RECIPIENT",
      ],
    };
    for (const id of PROMPT_TEMPLATE_IDS) {
      for (const name of expected[id]) {
        expect(TEMPLATES[id]).toContain(`{{${name}}}`);
      }
    }
  });

  it("keeps shared rules in context and CV-only rules out of the message templates", () => {
    const context = TEMPLATES.context.toLowerCase();
    expect(context).toContain("no markdown fences");
    expect(context).toContain("bare url");
    expect(context).toContain("never invent");
    expect(context).not.toContain("{{reference_cv}}");

    for (const id of ["coverLetter", "coldEmail", "linkedinMessage"] as const) {
      expect(TEMPLATES[id]).not.toContain("{{REFERENCE_CV}}");
      expect(TEMPLATES[id]).not.toContain("{{PDR}}");
      expect(TEMPLATES[id]).not.toContain("{{SCHEMA_JSON}}");
    }

    expect(TEMPLATES.cv).toContain("first-person pronouns");
    expect(TEMPLATES.coverLetter).toContain("first person");
    expect(TEMPLATES.coverLetter).not.toContain("first-person pronouns");
    expect(TEMPLATES.linkedinMessage.toLowerCase()).toContain(
      "connection request has already been accepted",
    );
    expect(TEMPLATES.linkedinMessage).toContain("300-character");
    expect(TEMPLATES.coldEmail.toLowerCase()).toContain(
      "missing job description is valid",
    );
  });
});

describe("CV-only prompt", () => {
  it("contains the CV task, schema, and bare-CV contract with no envelope", () => {
    const { profile, project } = fixture();
    const prompt = build(project, profile);

    expect(prompt).toContain("TASK — CV");
    expect(prompt).toContain("REQUIRED OUTPUT SCHEMA — Classic");
    expect(prompt).toContain("Lead with perception work.");
    expect(prompt).toContain("REFERENCE-CV-ONLY text.");
    expect(prompt).toContain("PDR-ONLY-FACT");
    expect(prompt).toContain("Emphasise computer vision.");
    expect(prompt).toContain("Default tone: direct.");

    expect(prompt).toContain("# OUTPUT CONTRACT");
    expect(prompt).toContain("Return the CV object directly");
    expect(prompt).not.toContain("envelope");
    expect(prompt).not.toContain("coverLetter");
    expect(prompt).not.toContain("coldEmail");
    expect(prompt).not.toContain("TASK — COVER LETTER");

    expect(prompt).toContain(`Prompt version: ${PROMPT_VERSION}`);
    expect(prompt).toContain(`Generated: ${DATE}`);
    expect(prompt).toContain("Deliverables: CV");
    expect(prompt).toContain("Schema: classic (Classic)");
    expect(prompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it("uses the selected CV schema", () => {
    const { profile, project } = fixture();
    const prompt = build({ ...project, schemaId: "impact" }, profile, "impact");
    expect(prompt).toContain('"problem"');
    expect(prompt).toContain("concrete skills");
    expect(prompt).toContain("Schema id: impact");
  });
});

describe("combined prompt", () => {
  it("contains shared context once, both tasks, instructions, and the envelope", () => {
    const { profile, project } = fixture({
      selected: ["cv", "coverLetter"],
    });
    const prompt = build(project, profile);

    expect(occurrences(prompt, "# ROLE")).toBe(1);
    expect(occurrences(prompt, "PDR-ONLY-FACT")).toBe(1);
    expect(occurrences(prompt, "Alex Example")).toBe(1);

    expect(prompt).toContain("TASK — CV");
    expect(prompt).toContain("TASK — COVER LETTER");
    expect(prompt).toContain("Lead with perception work.");
    expect(prompt).toContain("Mention the robotics startup.");
    expect(prompt).toContain("REFERENCE-CV-ONLY text.");

    expect(prompt).toContain("# OUTPUT CONTRACT");
    expect(prompt).toContain('"required"');
    expect(prompt).toContain('"coverLetter"');
    expect(prompt).toContain("source of truth");
    expect(prompt).not.toContain("ENVELOPE-CONTRACT-MISSING");
  });

  it("does not duplicate the existing CV and instructs consistency", () => {
    const { profile, project } = fixture({
      selected: ["cv", "coverLetter"],
    });
    const prompt = build(project, profile);
    expect(prompt).not.toContain("EXISTING-CV-ONLY");
    expect(prompt).toMatch(/CV is part of this same response/i);
    expect(prompt).toMatch(/source of truth/i);
  });

  it("orders the selected tasks CV, cover letter, cold email, LinkedIn", () => {
    const { profile, project } = fixture({
      selected: ["linkedinMessage", "coldEmail", "coverLetter", "cv"],
    });
    const prompt = build(project, profile);
    const positions = [
      "TASK — CV",
      "TASK — COVER LETTER",
      "TASK — COLD EMAIL",
      "TASK — LINKEDIN MESSAGE",
    ].map((marker) => prompt.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});

describe("cover-letter-only prompt", () => {
  it("omits the CV schema, reference CV, and CV instructions", () => {
    const { profile, project } = fixture({ selected: ["coverLetter"] });
    const prompt = build(project, profile);

    expect(prompt).toContain("TASK — COVER LETTER");
    expect(prompt).not.toContain("TASK — CV");
    expect(prompt).not.toContain("REQUIRED OUTPUT SCHEMA");
    expect(prompt).not.toContain("REFERENCE-CV-ONLY");
    expect(prompt).not.toContain('"schemaVersion"');
    expect(prompt).not.toContain("Lead with perception work.");
    expect(prompt).not.toContain("classic (Classic)");
    expect(prompt).toContain("Schema: none (CV not requested)");
    expect(prompt).toContain("Mention the robotics startup.");
    expect(prompt).toContain('"coverLetter"');
  });

  it("includes a compact Markdown rendering of the existing CV", () => {
    const { profile, project } = fixture({ selected: ["coverLetter"] });
    const prompt = build(project, profile);
    expect(prompt).toContain("# EXISTING CV");
    expect(prompt).toContain("EXISTING-CV-ONLY Senior Engineer");
    expect(prompt).toContain("Legacy Labs");
    expect(prompt).toContain("Python, C++");
    expect(prompt).not.toContain('"schemaVersion"');
  });

  it("does not render an existing CV when the project has no CV content", () => {
    const emptyCv = createEmptyCv("classic", {
      name: "Alex Example",
      contact: [],
    });
    const { profile, project } = fixture({
      selected: ["coverLetter"],
      cv: emptyCv,
    });
    const prompt = build(project, profile);
    expect(prompt).toContain("(No existing CV is available in this project.)");
  });
});

describe("cold email and LinkedIn", () => {
  it("uses the neutral no-job text and does not warn about a missing description", () => {
    const { profile, project } = fixture({
      selected: ["coldEmail"],
      job: {
        title: "",
        company: "",
        description: "",
        sharedInstructions: "",
        referenceCv: "",
      },
    });
    const prompt = build(project, profile);
    const warnings = promptWarnings(profile, project);

    expect(prompt).toContain("TASK — COLD EMAIL");
    expect(prompt).toContain("(No job description provided.)");
    expect(prompt).not.toMatch(/tailor only to the title and company/i);
    expect(prompt).not.toMatch(/job description is empty/i);
    expect(warnings.some((entry) => /job description/i.test(entry.message))).toBe(
      false,
    );
    expect(warnings.some((entry) => entry.id === "coldEmail.context")).toBe(
      false,
    );
  });

  it("includes the recipient block only in cold email and LinkedIn", () => {
    const cold = fixture({ selected: ["coldEmail"] });
    const coldPrompt = build(cold.project, cold.profile);
    expect(coldPrompt).toContain("TASK — COLD EMAIL");
    expect(coldPrompt).toContain("Name: Priya Example");
    expect(coldPrompt).toContain("Engineering Manager");
    expect(coldPrompt).toContain("Wrote about lidar calibration.");

    const linkedin = fixture({ selected: ["linkedinMessage"] });
    const linkedinPrompt = build(linkedin.project, linkedin.profile);
    expect(linkedinPrompt).toContain("TASK — LINKEDIN MESSAGE");
    expect(linkedinPrompt).toContain("Name: Priya Example");
    expect(linkedinPrompt).toContain("Keep it warm and brief.");
    expect(linkedinPrompt).toContain("300-character");
    expect(linkedinPrompt).toContain("already been accepted");

    const cv = fixture({ selected: ["cv"] });
    const cvPrompt = build(cv.project, cv.profile);
    expect(cvPrompt).not.toContain("Priya Example");
    expect(cvPrompt).not.toContain("{{RECIPIENT}}");

    const cover = fixture({ selected: ["coverLetter"] });
    const coverPrompt = build(cover.project, cover.profile);
    expect(coverPrompt).not.toContain("Priya Example");
  });

  it("warns about a missing recipient only for the messages that use one", () => {
    const { profile, project } = fixture({ selected: ["cv", "coverLetter"] });
    project.deliverables.settings.coldEmail.recipient = createEmptyRecipient();
    project.deliverables.settings.linkedinMessage.recipient =
      createEmptyRecipient();
    const cvWarnings = promptWarnings(profile, project);
    expect(cvWarnings.some((entry) => entry.id === "coldEmail.recipient")).toBe(
      false,
    );
    expect(
      cvWarnings.some((entry) => entry.id === "linkedinMessage.recipient"),
    ).toBe(false);

    const linkedin = fixture({ selected: ["linkedinMessage"] });
    linkedin.project.deliverables.settings.linkedinMessage.recipient =
      createEmptyRecipient();
    const linkedinWarnings = promptWarnings(
      linkedin.profile,
      linkedin.project,
    );
    expect(
      linkedinWarnings.some((entry) => entry.id === "linkedinMessage.recipient"),
    ).toBe(true);
  });
});

describe("selection handling", () => {
  it("warns when three deliverables are selected", () => {
    const { profile, project } = fixture({
      selected: ["cv", "coverLetter", "coldEmail"],
    });
    const warnings = promptWarnings(profile, project);
    expect(
      warnings.some(
        (entry) => entry.level === "warn" && /3 or more deliverables/.test(entry.message),
      ),
    ).toBe(true);
    expect(() => build(project, profile)).not.toThrow();
  });

  it("builds all four deliverables", () => {
    const { profile, project } = fixture({
      selected: ["cv", "coverLetter", "coldEmail", "linkedinMessage"],
    });
    const prompt = build(project, profile);
    for (const marker of [
      "TASK — CV",
      "TASK — COVER LETTER",
      "TASK — COLD EMAIL",
      "TASK — LINKEDIN MESSAGE",
    ]) {
      expect(prompt).toContain(marker);
    }
    for (const key of ["cv", "coverLetter", "coldEmail", "linkedinMessage"]) {
      expect(prompt).toContain(`"${key}"`);
    }
  });

  it("throws on an empty selection and reports an error warning", () => {
    const { profile, project } = fixture({ selected: [] });
    expect(() => resolveDeliverableSelection(project)).toThrow(
      /at least one deliverable/i,
    );
    expect(() => build(project, profile)).toThrow(/at least one deliverable/i);
    const warnings = promptWarnings(profile, project);
    expect(warnings.some((entry) => entry.level === "error")).toBe(true);
  });
});

describe("placeholders", () => {
  it("fills every documented placeholder in a combined prompt", () => {
    const { profile, project } = fixture({
      selected: ["cv", "coverLetter", "coldEmail", "linkedinMessage"],
    });
    const prompt = build(project, profile);
    expect(prompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    expect(prompt).toContain("Alex Example");
    expect(prompt).toContain("alex@example.com");
    expect(prompt).toContain("Machine Learning Engineer");
    expect(prompt).toContain("Acme");
    expect(prompt).toContain("Emphasise computer vision.");
    expect(prompt).toContain("Default tone: direct.");
    expect(prompt).toContain("REFERENCE-CV-ONLY text.");
    expect(prompt).toContain("Lead with perception work.");
    expect(prompt).toContain("Mention the robotics startup.");
    expect(prompt).toContain("Ask about the perception team.");
    expect(prompt).toContain("Keep it warm and brief.");
    expect(prompt).toContain("Schema id: classic");
    expect(prompt).toContain('"maxLength": 6000');
    expect(prompt).toContain('"subject"');
    expect(prompt).toContain("Name: Priya Example");
  });

  it("leaves unknown placeholders visible", () => {
    const { profile, project } = fixture();
    const prompt = build(project, profile, "classic", {
      ...TEMPLATES,
      context: `${TEMPLATES.context}\n\n{{UNKNOWN_SHARED_TOKEN}}`,
      cv: `${TEMPLATES.cv}\n\n{{UNKNOWN_CV_TOKEN}}`,
    });
    expect(prompt).toContain("{{UNKNOWN_SHARED_TOKEN}}");
    expect(prompt).toContain("{{UNKNOWN_CV_TOKEN}}");
  });
});

describe("promptWarnings", () => {
  it("always warns about a missing name and PDR", () => {
    const { project } = fixture();
    const profile: Profile = {
      ...fictionalProfile(),
      basics: { name: "", headline: "", contact: [] },
      pdr: { ...fictionalProfile().pdr, markdown: "" },
    };
    const warnings = promptWarnings(profile, project);
    expect(warnings.some((entry) => entry.message === "Profile name is empty.")).toBe(true);
    expect(warnings.some((entry) => entry.message === "No PDR has been imported.")).toBe(true);
  });

  it("warns about CV-only gaps only when the CV is selected", () => {
    const { profile, project } = fixture({
      selected: ["cv"],
      job: { title: "", company: "", description: "" },
    });
    const cvWarnings = promptWarnings(
      { ...profile, basics: { ...profile.basics, contact: [] } },
      project,
    );
    expect(cvWarnings.some((entry) => entry.id === "cv.contact")).toBe(true);
    expect(cvWarnings.some((entry) => entry.id === "cv.description")).toBe(true);

    const letterOnly = fixture({
      selected: ["coverLetter"],
      job: { title: "", company: "", description: "" },
    });
    const letterWarnings = promptWarnings(
      { ...letterOnly.profile, basics: { ...letterOnly.profile.basics, contact: [] } },
      letterOnly.project,
    );
    expect(letterWarnings.some((entry) => entry.id === "cv.contact")).toBe(false);
    expect(letterWarnings.some((entry) => entry.id === "coverLetter.description")).toBe(
      true,
    );
  });
});

describe("helpers", () => {
  it("renders an existing CV as compact Markdown, not JSON", () => {
    const text = existingCvText(fictionalCv());
    expect(text).toContain("Alex Example");
    expect(text).toContain("Computer Vision Engineer");
    expect(text).toContain("EXISTING-CV-ONLY");
    expect(text).toContain("## Education");
    expect(text).toContain("## Skills");
    expect(text).toContain("## Experience");
    expect(text).not.toContain('"schemaVersion"');
    expect(text).not.toContain("{");
  });

  it("omits empty recipient fields and falls back when there is no recipient", () => {
    expect(recipientText(undefined)).toBe("(No recipient details provided.)");
    expect(recipientText(createEmptyRecipient())).toBe(
      "(No recipient details provided.)",
    );
    const text = recipientText(recipient({ name: "Priya Example" }));
    expect(text).toBe("Name: Priya Example");
    expect(text).not.toContain("Intent");
  });

  it("separates shared instructions from per-deliverable instructions", () => {
    const { profile, project } = fixture();
    const shared = instructionsText(profile, project);
    expect(shared).toContain("Emphasise computer vision.");
    expect(shared).toContain("Default tone: direct.");
    expect(instructionsText(profile, project, "coverLetter")).toBe(
      "Mention the robotics startup.",
    );
    expect(instructionsText(profile, project, "coldEmail")).toBe(
      "Ask about the perception team.",
    );
  });

  it("keeps a minimal fallback for every template", () => {
    for (const id of PROMPT_TEMPLATE_IDS) {
      expect(FALLBACK_TEMPLATES[id].trim().length).toBeGreaterThan(20);
    }
    expect(estimateTokens("1234")).toBe(1);
  });
});
