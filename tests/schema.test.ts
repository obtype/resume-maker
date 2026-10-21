import { describe, expect, it } from "vitest";
import { CV_SCHEMAS, createEmptyCv } from "../src/core/cv/schema";
import { sampleCv } from "../src/core/cv/sample";
import { validateCv } from "../src/core/cv/validate";
import { migrateLegacyCv } from "../src/core/cv/migrate";
import { normalizeCv, normalizeStoredCv } from "../src/core/cv/normalize";
import { normalizeStyle } from "../src/core/style";

describe("CV schemas", () => {
  for (const schemaId of Object.keys(CV_SCHEMAS)) {
    it(`accepts the sample CV for ${schemaId}`, () => {
      const result = validateCv(sampleCv(schemaId), schemaId);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }

  it("rejects a CV with an empty name", () => {
    const cv = sampleCv("classic");
    cv.basics.name = "";
    const result = validateCv(cv, "classic");
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.path.includes("name"))).toBe(true);
  });

  it("drops unknown model fields before validating", () => {
    const cv = sampleCv("classic") as unknown as Record<string, unknown>;
    cv.summary = "A summary that the classic schema does not allow.";
    cv.extra = "ignored";
    const result = validateCv(cv, "classic");
    expect(result.valid).toBe(true);
    expect("summary" in result.data).toBe(false);
    expect("extra" in result.data).toBe(false);
  });

  it("requires summary and experience skills in the impact schema", () => {
    const cv = sampleCv("impact");
    delete cv.summary;
    delete cv.experience[0].skills;
    const result = validateCv(cv, "impact");
    expect(result.valid).toBe(false);
  });

  it("normalizes an LLM object with string values where arrays are expected", () => {
    const normalized = normalizeCv(
      {
        basics: { name: "Alex", contact: "alex@example.com" },
        education: [],
        skills: [],
        experience: [],
        projects: [],
        custom: [],
      },
      "classic",
    );
    expect(normalized.basics.contact).toEqual(["alex@example.com"]);
  });

  it("creates an empty CV with the schema's summary field only when allowed", () => {
    expect(createEmptyCv("classic").summary).toBeUndefined();
    expect(createEmptyCv("classic-summary").summary).toBe("");
    expect(createEmptyCv("impact").summary).toBe("");
  });

  it("preserves fields from every schema when loading stored content", () => {
    const impact = normalizeStoredCv(sampleCv("impact"));
    expect(impact.summary).toBeTruthy();
    expect(impact.experience[0].skills?.length).toBeGreaterThan(0);
    expect(impact.projects[0].problem).toBeTruthy();
    expect(impact.projects[0].outcome).toBeTruthy();

    const classic = normalizeStoredCv(sampleCv("classic"));
    expect(classic.summary).toBeUndefined();
    expect(classic.experience[0].skills).toBeUndefined();
    expect(classic.projects[0].problem).toBeUndefined();
  });

  it("rejects CSS injection in the style accent", () => {
    expect(normalizeStyle({ accent: "red;} body { display: none }" }).accent).toBe("#1f6fbf");
    expect(normalizeStyle({ accent: "#12abef" }).accent).toBe("#12abef");
  });

  it("migrates the legacy cv-studio format and its style", () => {
    const legacy = {
      schemaVersion: 1,
      basics: { name: "Legacy Name", contact: ["legacy@example.com", "Berlin"] },
      sectionTitles: { education: "Education", skills: "Skills", experience: "Experience", projects: "Projects", custom: "Additional" },
      education: [{ degree: "BSc", school: "Uni", meta: "2026" }],
      skills: [{ label: "Code", items: ["Python"] }],
      experience: [{ role: "Engineer", dates: "2024 – 2025", org: "Acme", bullets: ["Built things."] }],
      projects: [],
      custom: [],
      style: {
        verticalScale: 0.8,
        margins: "wide",
        sidebarWidth: "56mm",
        globalScale: 1.1,
        fieldHtml: { "basics.name": "<b>Legacy Name</b>" },
      },
    };
    const result = migrateLegacyCv(legacy);
    expect(result.wasLegacy).toBe(true);
    expect(result.cv.basics.name).toBe("Legacy Name");
    expect(result.style.verticalScale).toBe(0.8);
    expect(result.style.marginMm).toBe(9);
    expect(result.style.sidebarMm).toBe(56);
    expect(result.style.typeScale).toBeCloseTo(1.1);
    expect(result.style.fieldText["basics.name"]).toBe("Legacy Name");
  });
});
