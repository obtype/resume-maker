import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCvPrompt, promptWarnings } from "../src/core/prompt/builder";
import { getSchema } from "../src/core/cv/schema";
import { createEmptyCv } from "../src/core/cv/schema";
import { createDefaultProfile, type Profile, type Project } from "../src/core/project";

const template = readFileSync(new URL("../public/config/prompts/cv.md", import.meta.url), "utf8");

function fixtures(): { profile: Profile; project: Project } {
  const profile: Profile = {
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
      markdown: "Built a real-time detector at 25 FPS.",
    },
  };
  const project: Project = {
    schemaVersion: 1,
    id: "acme-ml",
    name: "Acme — ML Engineer",
    createdAt: "2026-10-21T00:00:00.000Z",
    updatedAt: "2026-10-21T00:00:00.000Z",
    profileId: "default",
    job: {
      title: "Machine Learning Engineer",
      company: "Acme",
      description: "Own perception models for edge devices.",
      instructions: "Emphasise computer vision.",
      referenceCv: "Old CV text.",
    },
    rendererId: "classic",
    schemaId: "classic",
    styles: {},
    promptVersion: "test",
    files: {},
    cv: createEmptyCv("classic", profile.basics),
  };
  return { profile, project };
}

describe("prompt builder", () => {
  it("fills every placeholder with the project data", () => {
    const { profile, project } = fixtures();
    const prompt = buildCvPrompt({
      profile,
      project,
      schema: getSchema("classic"),
      template,
    });
    expect(prompt).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    expect(prompt).toContain("Alex Example");
    expect(prompt).toContain("alex@example.com");
    expect(prompt).toContain("Own perception models for edge devices.");
    expect(prompt).toContain("Emphasise computer vision.");
    expect(prompt).toContain("Old CV text.");
    expect(prompt).toContain("Built a real-time detector at 25 FPS.");
    expect(prompt).toContain('"schemaVersion"');
    expect(prompt).toContain("Classic");
    expect(prompt).toContain("Prompt version:");
  });

  it("uses the selected schema in the prompt", () => {
    const { profile, project } = fixtures();
    const impact = buildCvPrompt({
      profile,
      project: { ...project, schemaId: "impact" },
      schema: getSchema("impact"),
      template,
    });
    expect(impact).toContain('"problem"');
    expect(impact).toContain("Every project must use problem, solution, and outcome fields");
    expect(impact).toContain("skills");
  });

  it("asks for bare URLs and one contact detail per entry", () => {
    const lower = template.toLowerCase();
    expect(lower).toContain("bare url");
    expect(lower).toContain("markdown link");
    expect(lower).toContain("each contact detail");
  });

  it("warns about missing inputs", () => {
    const { profile, project } = fixtures();
    const warnings = promptWarnings(
      { ...profile, basics: { name: "", contact: [] }, pdr: { ...profile.pdr, markdown: "" } },
      { ...project, job: { title: "", company: "", description: "", instructions: "", referenceCv: "" } },
    );
    expect(warnings.length).toBeGreaterThanOrEqual(5);
  });
});
