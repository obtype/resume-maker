import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_DESCRIPTION_CHARS,
  EXTRACTOR_FILENAME,
  fetchJob,
  type ExtractorFileSystem,
  type ExtractorRunInput,
  type ExtractorRunResult,
  type ExtractorRunner,
} from "../server/job-fetch";

const DIRECTORY = "/tmp/career-ops";
const EXTRACTOR = join(DIRECTORY, EXTRACTOR_FILENAME);
const POSTING = "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e";

const stdout = JSON.stringify({
  url: POSTING,
  title: "Computer Vision Engineer",
  text: "Own perception for the warehouse fleet.",
  ats: "ashby",
});

/** Only the two questions `fetchJob` asks about the filesystem. */
function fakeFileSystem(options: { directories?: string[]; extractor?: boolean } = {}): ExtractorFileSystem {
  const directories = options.directories ?? [DIRECTORY];
  const hasExtractor = options.extractor ?? true;
  return {
    exists: (path) => hasExtractor && path === EXTRACTOR,
    isDirectory: (path) => directories.includes(path),
  };
}

/** A runner that answers immediately and records how it was invoked. */
function recordingRunner(result: ExtractorRunResult): {
  runner: ExtractorRunner;
  calls: ExtractorRunInput[];
} {
  const calls: ExtractorRunInput[] = [];
  return {
    calls,
    runner: async (input) => {
      calls.push(input);
      return result;
    },
  };
}

const ok = (patch: Partial<ExtractorRunResult> = {}): ExtractorRunResult => ({
  code: 0,
  stdout,
  stderr: "",
  ...patch,
});

describe("fetchJob", () => {
  it("maps a successful run onto a target plus warnings", async () => {
    const { runner, calls } = recordingRunner(ok());
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toEqual({
      ok: true,
      target: {
        url: POSTING,
        title: "Computer Vision Engineer",
        company: "Acme Robotics",
        description: "Own perception for the warehouse fleet.",
        ats: "ashby",
        // The fixture has no company field, so the name came from the URL.
        companySource: "url",
      },
      warnings: [expect.stringContaining("company")],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].extractorPath).toBe(EXTRACTOR);
    expect(calls[0].url).toBe(POSTING);
  });

  it("keeps a page-supplied company and does not warn about it", async () => {
    const { runner } = recordingRunner(
      ok({
        stdout: JSON.stringify({
          url: POSTING,
          title: "Computer Vision Engineer",
          company: "Acme Robotics GmbH",
          text: "Own perception for the warehouse fleet.",
          ats: "ashby",
        }),
      }),
    );
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({
      ok: true,
      target: { company: "Acme Robotics GmbH", companySource: "page" },
      warnings: [],
    });
  });

  it("passes the four-minute budget, the description cap, and a grace period to the runner", async () => {
    const { runner, calls } = recordingRunner(ok());
    await fetchJob({ url: POSTING, careerOpsDir: DIRECTORY }, { runner, fileSystem: fakeFileSystem(), env: {} });

    expect(DEFAULT_FETCH_TIMEOUT_MS).toBe(240_000);
    expect(calls[0].budgetMs).toBe(240_000);
    expect(calls[0].maxChars).toBe(DEFAULT_MAX_DESCRIPTION_CHARS);
    expect(calls[0].graceMs).toBeGreaterThan(0);
    expect(calls[0].maxStdoutBytes).toBeGreaterThan(0);
  });

  it("honours JOB_FETCH_TIMEOUT_MS", async () => {
    const { runner, calls } = recordingRunner(ok());
    await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: { JOB_FETCH_TIMEOUT_MS: "1234" } },
    );
    expect(calls[0].budgetMs).toBe(1234);
  });

  it("ignores an unusable JOB_FETCH_TIMEOUT_MS", async () => {
    const { runner, calls } = recordingRunner(ok());
    await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: { JOB_FETCH_TIMEOUT_MS: "soon" } },
    );
    expect(calls[0].budgetMs).toBe(DEFAULT_FETCH_TIMEOUT_MS);
  });

  it("repeats the extractor's own error and code when it exits non-zero", async () => {
    const { runner } = recordingRunner(
      ok({
        code: 1,
        stdout: "",
        stderr: JSON.stringify({ error: "Navigation timed out.", code: "navigation_timeout" }),
      }),
    );
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({
      ok: false,
      status: 502,
      code: "extractor_failed",
      error: "Navigation timed out.",
      extractorCode: "navigation_timeout",
    });
  });

  it("keeps the first line of a prose stderr", async () => {
    const { runner } = recordingRunner(ok({ code: 1, stdout: "", stderr: "boom: playwright crashed\nstack…" }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ code: "extractor_failed", error: "boom: playwright crashed" });
    if (!result.ok) expect(result.extractorCode).toBeUndefined();
  });

  it("falls back to its own message when the extractor says nothing", async () => {
    const { runner } = recordingRunner(ok({ code: 1, stdout: "", stderr: "" }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "extractor_failed" });
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("rejects stdout that is not JSON", async () => {
    const { runner } = recordingRunner(ok({ stdout: "<html>nope</html>" }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 502, code: "bad_extraction" });
  });

  it("rejects a well-formed result with an empty description", async () => {
    const { runner } = recordingRunner(
      ok({ stdout: JSON.stringify({ url: POSTING, title: "Engineer", text: "  " }) }),
    );
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "bad_extraction" });
    if (!result.ok) expect(result.error).toContain("description");
  });

  it("names the offending field of a malformed result", async () => {
    const { runner } = recordingRunner(
      ok({ stdout: JSON.stringify({ url: POSTING, title: 42, text: "Body" }) }),
    );
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "bad_extraction" });
    if (!result.ok) expect(result.error).toContain("title");
  });

  it("treats over-cap stdout as a failure, not a truncated success", async () => {
    const huge = JSON.stringify({ url: POSTING, title: "Engineer", text: "x".repeat(5_100_000) });
    const { runner } = recordingRunner(ok({ stdout: huge }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    // The real runner stops reading at the cap; the module checks the size too.
    expect(result).toMatchObject({ ok: false, status: 502, code: "extractor_failed" });
    if (!result.ok) expect(result.error).toContain("more text");
  });

  it("reports an overflow flag from the runner as a failure", async () => {
    const { runner } = recordingRunner(ok({ code: null, stdout: "", overflow: true }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "extractor_failed" });
  });

  it("reports a timeout when the runner outlives the budget", async () => {
    const runner: ExtractorRunner = (input) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(ok()), input.budgetMs + 200);
      });
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {}, timeoutMs: 20, graceMs: 0 },
    );

    expect(result).toMatchObject({ ok: false, status: 504, code: "timeout" });
    if (!result.ok) expect(result.error).toContain("0 seconds");
  });

  it("reports a timeout when the runner says the child was killed", async () => {
    const { runner } = recordingRunner(ok({ code: null, stdout: "", timedOut: true }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 504, code: "timeout" });
  });

  it("turns a runner rejection into an extractor failure", async () => {
    const runner: ExtractorRunner = async () => {
      throw new Error("spawn ENOENT");
    };
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "extractor_failed" });
  });
});

describe("fetchJob configuration", () => {
  it("resolves the directory from the request first", async () => {
    const other = "/tmp/other-career-ops";
    const { runner, calls } = recordingRunner(ok());
    const fileSystem: ExtractorFileSystem = {
      exists: (path) => path === join(other, EXTRACTOR_FILENAME),
      isDirectory: (path) => path === other,
    };

    await fetchJob(
      { url: POSTING, careerOpsDir: other },
      { careerOpsDir: DIRECTORY, env: { CAREER_OPS_DIR: "/tmp/env-career-ops" }, runner, fileSystem },
    );

    expect(calls[0].directory).toBe(other);
  });

  it("falls back to the workspace setting, then the environment", async () => {
    const settingsRun = recordingRunner(ok());
    await fetchJob(
      { url: POSTING },
      {
        careerOpsDir: DIRECTORY,
        env: { CAREER_OPS_DIR: "/tmp/env-career-ops" },
        runner: settingsRun.runner,
        fileSystem: fakeFileSystem(),
      },
    );
    expect(settingsRun.calls[0].directory).toBe(DIRECTORY);

    const envRun = recordingRunner(ok());
    await fetchJob(
      { url: POSTING },
      { env: { CAREER_OPS_DIR: DIRECTORY }, runner: envRun.runner, fileSystem: fakeFileSystem() },
    );
    expect(envRun.calls[0].directory).toBe(DIRECTORY);
  });

  it("reports not_configured when nothing resolves", async () => {
    const { runner, calls } = recordingRunner(ok());
    const result = await fetchJob(
      { url: POSTING },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 501, code: "not_configured" });
    if (!result.ok) expect(result.error).toContain("Settings");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a relative path", "career-ops"],
    ["a missing directory", "/tmp/does-not-exist"],
  ])("reports extractor_missing for %s", async (_label, directory) => {
    const { runner } = recordingRunner(ok());
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: directory },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 501, code: "extractor_missing" });
  });

  it("reports extractor_missing when the checkout has no extractor", async () => {
    const { runner } = recordingRunner(ok());
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem({ extractor: false }), env: {} },
    );

    expect(result).toMatchObject({ ok: false, code: "extractor_missing" });
    if (!result.ok) expect(result.error).toContain(EXTRACTOR_FILENAME);
  });

  it("never leaks the resolved absolute path in an error body", async () => {
    const { runner } = recordingRunner(ok({ code: 1, stdout: "", stderr: "" }));
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain(DIRECTORY);
  });
});

describe("fetchJob request validation", () => {
  it("rejects a body that is not an object", async () => {
    const result = await fetchJob("https://example.com" as unknown as { url: string }, { env: {} });
    expect(result).toMatchObject({ ok: false, status: 400, code: "bad_json" });
  });

  it.each([
    "",
    "   ",
    "jobs.ashbyhq.com/acme/1",
    "ftp://jobs.ashbyhq.com/acme/1",
    "javascript:alert(1)",
    "not a url",
  ])("rejects the URL %j before touching the extractor", async (url) => {
    const { runner, calls } = recordingRunner(ok());
    const result = await fetchJob(
      { url, careerOpsDir: DIRECTORY },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 400, code: "invalid_url" });
    expect(calls).toHaveLength(0);
  });

  it("refuses a deny-listed source before checking configuration", async () => {
    const { runner, calls } = recordingRunner(ok());
    const result = await fetchJob(
      { url: "https://www.linkedin.com/jobs/view/123" },
      { runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result).toMatchObject({ ok: false, status: 400, code: "unsupported_source" });
    if (!result.ok) expect(result.error).toContain("Paste");
    expect(calls).toHaveLength(0);
  });

  it("ignores a non-string careerOpsDir instead of failing the request", async () => {
    const { runner, calls } = recordingRunner(ok());
    const result = await fetchJob(
      { url: POSTING, careerOpsDir: 42 },
      { careerOpsDir: DIRECTORY, runner, fileSystem: fakeFileSystem(), env: {} },
    );

    expect(result.ok).toBe(true);
    expect(calls[0].directory).toBe(DIRECTORY);
  });
});

describe("fetchJob failure taxonomy", () => {
  it("reports every documented failure with its own code and message", async () => {
    const crashed = recordingRunner(
      ok({
        code: 1,
        stdout: "",
        stderr: JSON.stringify({ error: "Navigation timed out.", code: "navigation_timeout" }),
      }),
    );
    const malformed = recordingRunner(
      ok({ stdout: JSON.stringify({ url: POSTING, title: 42, text: "Body" }) }),
    );
    const killed = recordingRunner(ok({ code: null, stdout: "", timedOut: true }));
    const unused = recordingRunner(ok());
    const deps = { env: {}, fileSystem: fakeFileSystem() };

    const results = [
      await fetchJob("not an object" as unknown as { url: string }, deps),
      await fetchJob({ url: "ftp://jobs.ashbyhq.com/acme/1" }, deps),
      await fetchJob({ url: "https://www.linkedin.com/jobs/view/1" }, deps),
      await fetchJob({ url: POSTING }, { ...deps, runner: unused.runner }),
      await fetchJob({ url: POSTING, careerOpsDir: "career-ops" }, { ...deps, runner: unused.runner }),
      await fetchJob({ url: POSTING, careerOpsDir: DIRECTORY }, { ...deps, runner: crashed.runner }),
      await fetchJob({ url: POSTING, careerOpsDir: DIRECTORY }, { ...deps, runner: malformed.runner }),
      await fetchJob({ url: POSTING, careerOpsDir: DIRECTORY }, { ...deps, runner: killed.runner }),
    ];

    const expected = [
      "bad_json",
      "invalid_url",
      "unsupported_source",
      "not_configured",
      "extractor_missing",
      "extractor_failed",
      "bad_extraction",
      "timeout",
    ];
    expect(new Set(expected).size).toBe(expected.length);

    results.forEach((result, index) => {
      expect(result.ok, expected[index]).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe(expected[index]);
      expect(result.error.trim().length).toBeGreaterThan(0);
    });

    // A crash keeps the extractor's own message; a malformed result names the
    // field, so the two never read as the same failure.
    const crash = results[5];
    const malformedResult = results[6];
    if (!crash.ok) expect(crash.error).toBe("Navigation timed out.");
    if (!malformedResult.ok) expect(malformedResult.error).toContain("title");
  });
});
