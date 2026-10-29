import { describe, expect, it } from "vitest";
import type { ProjectJob } from "../src/core/project";
import {
  buildFetchWarnings,
  deriveCompanyFromUrl,
  isUnsupportedSource,
  mergeTargetIntoJob,
  normalizeExtraction,
  type FetchedTarget,
} from "../src/core/job/target";

const extraction = {
  url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
  title: "Computer Vision Engineer",
  text: "Own perception for the warehouse fleet.\n\nRequirements: PyTorch, C++.",
  ats: "ashby",
};

const target: FetchedTarget = {
  url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
  title: "Computer Vision Engineer",
  company: "Acme Robotics",
  description: "Own perception for the warehouse fleet.",
  ats: "ashby",
  companySource: "page",
};

function job(patch: Partial<ProjectJob> = {}): ProjectJob {
  return {
    title: "",
    company: "",
    description: "",
    sharedInstructions: "",
    referenceCv: "",
    ...patch,
  };
}

describe("normalizeExtraction", () => {
  it("keeps a complete result and normalises the URL", () => {
    const result = normalizeExtraction({
      ...extraction,
      url: "  https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e  ",
    });
    expect(result).toEqual({
      ok: true,
      target: {
        url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
        title: "Computer Vision Engineer",
        company: "Acme Robotics",
        description: extraction.text,
        ats: "ashby",
        companySource: "url",
      },
    });
  });

  it("accepts a result with no title", () => {
    const result = normalizeExtraction({ ...extraction, title: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.target.title).toBe("");
  });

  it("derives the company from the URL when the page gives none", () => {
    const result = normalizeExtraction({ ...extraction, company: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.company).toBe("Acme Robotics");
      expect(result.target.companySource).toBe("url");
    }
  });

  it("prefers a page-supplied company over the URL derivation", () => {
    const result = normalizeExtraction({ ...extraction, company: "  Acme Robotics GmbH " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.company).toBe("Acme Robotics GmbH");
      expect(result.target.companySource).toBe("page");
    }
  });

  it("leaves the company empty when nothing is derivable", () => {
    const result = normalizeExtraction({ ...extraction, url: "https://localhost/1", company: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.company).toBe("");
      expect(result.target.companySource).toBeUndefined();
    }
  });

  it("accepts a result with no ats", () => {
    const result = normalizeExtraction({ ...extraction, ats: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.target.ats).toBeUndefined();
  });

  it("rejects an empty description", () => {
    const result = normalizeExtraction({ ...extraction, text: "" });
    expect(result).toEqual({
      ok: false,
      field: "text",
      message: expect.stringContaining("empty job description"),
    });
  });

  it("rejects a whitespace-only description", () => {
    const result = normalizeExtraction({ ...extraction, text: "   \n\t  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("text");
  });

  it("rejects a missing description", () => {
    const result = normalizeExtraction({ ...extraction, text: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("text");
  });

  it.each(["title", "text", "ats", "company"] as const)(
    "rejects a non-string %s instead of coercing it",
    (field) => {
      const result = normalizeExtraction({ ...extraction, [field]: 42 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.field).toBe(field);
        expect(result.message).toContain(field);
      }
    },
  );

  it.each(["not a url", "ftp://example.com/job", "/relative/path", ""])(
    "rejects the URL %j",
    (url) => {
      const result = normalizeExtraction({ ...extraction, url });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.field).toBe("url");
    },
  );

  it.each([null, "a string", 7, ["array"]])("rejects a non-object result (%j)", (value) => {
    const result = normalizeExtraction(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("result");
  });
});

describe("deriveCompanyFromUrl", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/1234", "Acme"],
    ["https://job-boards.greenhouse.io/acme/jobs/1234", "Acme"],
    ["https://jobs.lever.co/acme-robotics/0f3e", "Acme Robotics"],
    ["https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e", "Acme Robotics"],
    ["https://acme.wd1.myworkdayjobs.com/en-US/External/job/123", "Acme"],
    ["https://careers-acme.icims.com/jobs/123/job", "Acme"],
    ["https://acme.bamboohr.com/careers/123", "Acme"],
    ["https://m365consult.careers-page.com/jobs/14d60035-0462", "M365consult"],
    ["https://acme.recruitee.com/o/engineer", "Acme"],
    ["https://acme.teamtailor.com/jobs/123", "Acme"],
    ["https://acme.breezy.hr/p/abc123", "Acme"],
    ["https://acme.zohorecruit.com/jobs/Careers/123", "Acme"],
    ["https://acme.freshteam.com/jobs/abc", "Acme"],
    ["https://careers.acme.com/jobs/123", "Acme"],
    ["https://acme.com/careers/123", "Acme"],
    ["https://acme.co.uk/careers/123", "Acme"],
  ])("%s -> %s", (url, expected) => {
    expect(deriveCompanyFromUrl(url)).toBe(expected);
  });

  it.each([
    "https://localhost/jobs/1",
    "https://127.0.0.1/jobs/1",
    "not a url",
    "",
  ])("derives nothing from %j", (url) => {
    expect(deriveCompanyFromUrl(url)).toBe("");
  });

  it("ignores a numeric board token", () => {
    expect(deriveCompanyFromUrl("https://jobs.lever.co/1234/0f3e")).toBe("");
  });

  it("names the tenant of a vendor board, never the vendor itself", () => {
    // Reported URL: `careers-page.com` is a tenant domain, so the employer is
    // the subdomain. Reading the label before the TLD returned "Careers Page"
    // and named the project after the vendor.
    expect(
      deriveCompanyFromUrl(
        "https://m365consult.careers-page.com/jobs/14d60035-0462-4610-aeb2-2a6a9a9605c5" +
          "?utm_medium=free_job_board&utm_source=linkedin",
      ),
    ).toBe("M365consult");
  });
});

describe("mergeTargetIntoJob", () => {
  it("fills only empty fields by default", () => {
    const merged = mergeTargetIntoJob(job({ title: "Kept title" }), target);
    expect(merged.title).toBe("Kept title");
    expect(merged.company).toBe("Acme Robotics");
    expect(merged.description).toBe("Own perception for the warehouse fleet.");
    expect(merged.sourceUrl).toBe(target.url);
  });

  it("treats whitespace-only values as empty", () => {
    const merged = mergeTargetIntoJob(job({ title: "  \n ", company: "\t" }), target);
    expect(merged.title).toBe("Computer Vision Engineer");
    expect(merged.company).toBe("Acme Robotics");
  });

  it("overwrites non-empty fields when replace is on", () => {
    const merged = mergeTargetIntoJob(
      job({ title: "Old title", company: "Old company", description: "Old text" }),
      target,
      { replace: true },
    );
    expect(merged.title).toBe("Computer Vision Engineer");
    expect(merged.company).toBe("Acme Robotics");
    expect(merged.description).toBe("Own perception for the warehouse fleet.");
  });

  it("leaves fields untouched when the target leaves them empty, even with replace on", () => {
    const merged = mergeTargetIntoJob(
      job({ title: "Old title", company: "Old company" }),
      { ...target, title: "", company: "" },
      { replace: true },
    );
    expect(merged.title).toBe("Old title");
    expect(merged.company).toBe("Old company");
  });

  it("always refreshes the source URL", () => {
    const merged = mergeTargetIntoJob(job({ sourceUrl: "https://old.example/job" }), target);
    expect(merged.sourceUrl).toBe(target.url);
    expect(mergeTargetIntoJob(merged, { ...target, url: "https://new.example/job" }).sourceUrl).toBe(
      "https://new.example/job",
    );
  });

  it("leaves instructions and the reference CV untouched", () => {
    const before = job({
      title: "Old title",
      sharedInstructions: "Keep it to one page.",
      referenceCv: "# Reference CV",
    });
    const merged = mergeTargetIntoJob(before, target, { replace: true });
    expect(merged.sharedInstructions).toBe("Keep it to one page.");
    expect(merged.referenceCv).toBe("# Reference CV");
  });

  it("does not mutate the job it was given", () => {
    const before = job();
    mergeTargetIntoJob(before, target);
    expect(before).toEqual(job());
  });
});

describe("replace policy matrix", () => {
  // The Target stage applies one merge for both settings; these are the six
  // states a field can be in when the user clicks fetch.
  it.each([
    ["empty", "", false, "Computer Vision Engineer"],
    ["whitespace-only", " \n\t ", false, "Computer Vision Engineer"],
    ["non-empty", "Kept title", false, "Kept title"],
    ["empty", "", true, "Computer Vision Engineer"],
    ["whitespace-only", " \n\t ", true, "Computer Vision Engineer"],
    ["non-empty", "Kept title", true, "Computer Vision Engineer"],
  ] as const)("a %s title with replace=%s becomes %j", (_label, current, replace, expected) => {
    expect(mergeTargetIntoJob(job({ title: current }), target, { replace }).title).toBe(expected);
  });

  it("applies the same policy to company and description", () => {
    const filled = job({ company: "Kept company", description: "Kept text" });
    const kept = mergeTargetIntoJob(filled, target);
    expect(kept.company).toBe("Kept company");
    expect(kept.description).toBe("Kept text");

    const replaced = mergeTargetIntoJob(filled, target, { replace: true });
    expect(replaced.company).toBe("Acme Robotics");
    expect(replaced.description).toBe("Own perception for the warehouse fleet.");
  });
});

describe("isUnsupportedSource", () => {
  it.each([
    "https://www.linkedin.com/jobs/view/123",
    "https://linkedin.com/jobs/view/123",
    "https://LINKEDIN.COM/jobs/view/123",
    "https://de.indeed.com/viewjob?jk=abc",
    "https://glassdoor.com/partner/jobListing.htm?pos=1",
  ])("refuses %s", (url) => {
    expect(isUnsupportedSource(url)).toBe(true);
  });

  it.each([
    "https://notlinkedin.com/jobs/view/123",
    "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
    "https://mycareers.com/jobs/1",
    "not a url",
  ])("allows %s", (url) => {
    expect(isUnsupportedSource(url)).toBe(false);
  });
});

describe("buildFetchWarnings", () => {
  it("warns when both title and company are empty", () => {
    const warnings = buildFetchWarnings({ ...target, title: "", company: "", companySource: undefined });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("generic name");
  });

  it("warns when the company was guessed from the URL", () => {
    const warnings = buildFetchWarnings({ ...target, companySource: "url" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("company");
    expect(warnings[0]).toContain("URL");
  });

  it("stays quiet when either one is present", () => {
    expect(buildFetchWarnings({ ...target, title: "", company: "Acme" })).toEqual([]);
    expect(buildFetchWarnings({ ...target, title: "Engineer", company: "" })).toEqual([]);
  });

  it("stays quiet when the page supplied the company", () => {
    expect(buildFetchWarnings(target)).toEqual([]);
  });
});
