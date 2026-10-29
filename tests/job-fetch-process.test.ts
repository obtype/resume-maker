import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  runExtractorProcess,
  type ExtractorRunInput,
} from "../server/job-fetch";

/**
 * The real process runner, exercised against tiny stand-in scripts. This is the
 * only place the spawn wiring is proven: argv passing, stdout capture, the
 * stdout cap, and the hard kill after the budget. No Chromium, no network.
 */
const FIXTURES = fileURLToPath(new URL("../scripts/fixtures/job-fetch/", import.meta.url));

function input(script: string, patch: Partial<ExtractorRunInput> = {}): ExtractorRunInput {
  return {
    directory: FIXTURES,
    extractorPath: `${FIXTURES}${script}`,
    url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
    budgetMs: 5_000,
    graceMs: 0,
    maxChars: 40_000,
    maxStdoutBytes: 5_000_000,
    ...patch,
  };
}

describe("runExtractorProcess", () => {
  it("runs the extractor and returns its stdout and exit code", async () => {
    const result = await runExtractorProcess(input("browser-extract.mjs"));

    expect(result.code).toBe(0);
    expect(result.timedOut).toBeUndefined();
    expect(result.overflow).toBeUndefined();
    const parsed = JSON.parse(result.stdout) as { title: string; text: string };
    expect(parsed.title).toBe("Computer Vision Engineer");
    expect(parsed.text.length).toBeGreaterThan(0);
  });

  it("kills a child that outlives the budget and reports a timeout", async () => {
    const started = Date.now();
    const result = await runExtractorProcess(input("hang.mjs", { budgetMs: 100, graceMs: 100 }));
    const elapsed = Date.now() - started;

    expect(result).toMatchObject({ code: null, stdout: "", timedOut: true });
    // Budget plus grace, plus process start-up — not the child's 60 s.
    expect(elapsed).toBeLessThan(10_000);
  });

  it("abandons a run that exceeds the stdout cap", async () => {
    const result = await runExtractorProcess(input("flood.mjs", { maxStdoutBytes: 1_024 }));

    expect(result).toMatchObject({ code: null, stdout: "", overflow: true });
  });

  it("reports a child that cannot run instead of throwing", async () => {
    const result = await runExtractorProcess(
      input("does-not-exist.mjs", { extractorPath: `${FIXTURES}does-not-exist.mjs` }),
    );

    // `fetchJob` rejects a missing extractor before spawning; this is the race.
    expect(result.code).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });
});
