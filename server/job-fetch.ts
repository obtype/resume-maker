import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  buildFetchWarnings,
  httpUrl,
  isUnsupportedSource,
  normalizeExtraction,
  type FetchedTarget,
} from "../src/core/job/target";

/**
 * Server-side half of job autofill: resolve the career-ops checkout, run its
 * headless extractor, and turn the result into a validated target. Node-only
 * and free of workspace knowledge — the browser owns the project record.
 *
 * No model is involved anywhere in this path: the extractor reads a known ATS
 * API or the rendered DOM, and everything here is deterministic.
 */

/** Script the extractor is expected to be, inside a career-ops checkout. */
export const EXTRACTOR_FILENAME = "browser-extract.mjs";

/**
 * Page-load ceiling, not a model budget. Boards answer in seconds; the four
 * minutes exist for JS-heavy and Workday-style boards that legitimately stall.
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 240_000;

/** Extra time a wedged browser gets before the child process is killed. */
export const FETCH_KILL_GRACE_MS = 10_000;

/** Long postings truncate silently at the tail below the extractor's default. */
export const DEFAULT_MAX_DESCRIPTION_CHARS = 40_000;

/** Exceeding this is a failure, never a truncated success. */
export const MAX_EXTRACTOR_STDOUT_BYTES = 5_000_000;

export type JobFetchCode =
  | "bad_json"
  | "invalid_url"
  | "unsupported_source"
  | "not_configured"
  | "extractor_missing"
  | "extractor_failed"
  | "bad_extraction"
  | "timeout";

/** The HTTP contract's status for each code. */
export const JOB_FETCH_STATUS: Record<JobFetchCode, number> = {
  bad_json: 400,
  invalid_url: 400,
  unsupported_source: 400,
  not_configured: 501,
  extractor_missing: 501,
  extractor_failed: 502,
  bad_extraction: 502,
  timeout: 504,
};

export interface ExtractorRunInput {
  directory: string;
  extractorPath: string;
  url: string;
  budgetMs: number;
  graceMs: number;
  maxChars: number;
  maxStdoutBytes: number;
}

export interface ExtractorRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  /** The child outlived the budget plus grace and was killed. */
  timedOut?: boolean;
  /** The child wrote more than `maxStdoutBytes`; the run is abandoned. */
  overflow?: boolean;
}

/**
 * One extractor invocation. Injectable so tests never spawn Node or Chromium.
 */
export type ExtractorRunner = (input: ExtractorRunInput) => Promise<ExtractorRunResult>;

/** The filesystem questions directory validation needs, injectable for tests. */
export interface ExtractorFileSystem {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
}

const defaultFileSystem: ExtractorFileSystem = {
  exists: (path) => existsSync(path),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
};

/**
 * Run the real extractor as a child process. The URL is an argv element with
 * `shell: false`, so it is never interpolated into a command string.
 *
 * Stdout is capped while it streams, and the child is killed once it outlives
 * its budget plus grace so a wedged browser cannot outlive the request.
 */
export const runExtractorProcess: ExtractorRunner = (input) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        input.extractorPath,
        input.url,
        "--mode",
        "jd",
        "--max-chars",
        String(input.maxChars),
        "--timeout",
        String(input.budgetMs),
      ],
      { shell: false, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: ExtractorRunResult): void => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
    };

    const kill = (): void => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The process already exited.
      }
    };

    killTimer = setTimeout(() => {
      finish({ code: null, stdout: "", stderr: "", timedOut: true });
      kill();
    }, input.budgetMs + input.graceMs);

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (settled) return;
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > input.maxStdoutBytes) {
        finish({ code: null, stdout: "", stderr: "", overflow: true });
        kill();
      }
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      if (settled) return;
      // Only the tail matters: the extractor prints one JSON object on failure.
      stderr = (stderr + chunk).slice(-8_000);
    });
    child.on("error", (error) => {
      finish({
        code: null,
        stdout: "",
        stderr: JSON.stringify({ error: error.message, code: "spawn_failed" }),
      });
    });
    child.on("close", (code) => finish({ code, stdout, stderr }));
  });

export interface JobFetchInput {
  url?: unknown;
  /** Per-request override; the browser sends the workspace setting here. */
  careerOpsDir?: unknown;
}

export interface JobFetchDeps {
  /** Workspace setting, when the caller can supply it directly. */
  careerOpsDir?: string;
  env?: Record<string, string | undefined>;
  runner?: ExtractorRunner;
  fileSystem?: ExtractorFileSystem;
  timeoutMs?: number;
  graceMs?: number;
  maxChars?: number;
}

export type JobFetchResult =
  | { ok: true; target: FetchedTarget; warnings: string[] }
  | {
      ok: false;
      status: number;
      code: JobFetchCode;
      error: string;
      /**
       * The extractor's own failure code (`navigation_timeout`, …) when it
       * printed one. Kept beside `code` so the route's contract stays the
       * documented set while the caller can still show what actually broke.
       */
      extractorCode?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function failure(code: JobFetchCode, error: string, extractorCode?: string): JobFetchResult {
  const result: JobFetchResult = { ok: false, status: JOB_FETCH_STATUS[code], code, error };
  if (extractorCode) result.extractorCode = extractorCode;
  return result;
}

function budgetFromEnv(env: Record<string, string | undefined>): number {
  const raw = env.JOB_FETCH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_FETCH_TIMEOUT_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FETCH_TIMEOUT_MS;
}

/** The extractor's own `{ error, code }` stderr object, when it printed one. */
function stderrReport(stderr: string): { message: string; code: string } {
  const text = stderr.trim();
  if (!text) return { message: "", code: "" };
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && typeof parsed.error === "string") {
      return {
        message: parsed.error.slice(0, 500),
        code: typeof parsed.code === "string" ? parsed.code.slice(0, 100) : "",
      };
    }
  } catch {
    // A prose stderr still carries a useful first line.
  }
  return { message: text.split("\n")[0]?.slice(0, 500) ?? "", code: "" };
}

/**
 * Resolve the extractor directory (per-request, then workspace setting, then
 * `CAREER_OPS_DIR`) and read one posting through it.
 *
 * Failure bodies carry a code and a message, never the resolved absolute path.
 */
export async function fetchJob(
  input: JobFetchInput,
  deps: JobFetchDeps = {},
): Promise<JobFetchResult> {
  if (!isRecord(input)) {
    return failure("bad_json", "The request body is not a JSON object.");
  }

  const url = typeof input.url === "string" ? input.url.trim() : "";
  if (!httpUrl(url)) {
    return failure("invalid_url", "The URL must be an absolute http(s) address.");
  }
  if (isUnsupportedSource(url)) {
    return failure(
      "unsupported_source",
      "This site cannot be read automatically. Paste the job description instead.",
    );
  }

  const env = deps.env ?? process.env;
  const directory = firstNonEmpty(input.careerOpsDir, deps.careerOpsDir, env.CAREER_OPS_DIR);
  if (!directory) {
    return failure(
      "not_configured",
      "No career-ops folder is set. Add one in Settings under Job intake to fetch a posting.",
    );
  }

  const fileSystem = deps.fileSystem ?? defaultFileSystem;
  if (!isAbsolute(directory) || !fileSystem.isDirectory(directory)) {
    return failure(
      "extractor_missing",
      "The career-ops folder is not a directory on this machine. Check the path in Settings.",
    );
  }
  const extractorPath = join(directory, EXTRACTOR_FILENAME);
  if (!fileSystem.exists(extractorPath)) {
    return failure(
      "extractor_missing",
      "The career-ops folder does not contain browser-extract.mjs.",
    );
  }

  const budgetMs = deps.timeoutMs ?? budgetFromEnv(env);
  const graceMs = deps.graceMs ?? FETCH_KILL_GRACE_MS;
  const maxChars = deps.maxChars ?? DEFAULT_MAX_DESCRIPTION_CHARS;
  const runner = deps.runner ?? runExtractorProcess;

  const run = await runWithDeadline(
    runner,
    {
      directory,
      extractorPath,
      url,
      budgetMs,
      graceMs,
      maxChars,
      maxStdoutBytes: MAX_EXTRACTOR_STDOUT_BYTES,
    },
    budgetMs + graceMs,
  );

  if (!run) {
    return failure(
      "timeout",
      `The posting did not answer within ${Math.round(budgetMs / 1000)} seconds.`,
    );
  }
  if (run.overflow) {
    return failure("extractor_failed", "The extractor returned more text than this app accepts.");
  }
  if (run.timedOut) {
    return failure(
      "timeout",
      `The posting did not answer within ${Math.round(budgetMs / 1000)} seconds.`,
    );
  }
  if (Buffer.byteLength(run.stdout, "utf8") > MAX_EXTRACTOR_STDOUT_BYTES) {
    return failure("extractor_failed", "The extractor returned more text than this app accepts.");
  }
  if (run.code !== 0) {
    const report = stderrReport(run.stderr);
    return failure(
      "extractor_failed",
      report.message || "The extractor could not read this posting.",
      report.code,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    return failure("bad_extraction", "The extractor returned output that is not valid JSON.");
  }

  const normalized = normalizeExtraction(parsed);
  if (!normalized.ok) {
    return failure("bad_extraction", normalized.message);
  }
  return {
    ok: true,
    target: normalized.target,
    warnings: buildFetchWarnings(normalized.target),
  };
}

/**
 * Bound a runner call so an injected (or wedged) runner cannot hold the route
 * open past the budget. `null` means the deadline won.
 */
async function runWithDeadline(
  runner: ExtractorRunner,
  input: ExtractorRunInput,
  deadlineMs: number,
): Promise<ExtractorRunResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deadlineMs);
  });
  try {
    return await Promise.race([
      runner(input).catch((): ExtractorRunResult => ({
        code: null,
        stdout: "",
        stderr: JSON.stringify({ error: "The extractor could not be started.", code: "spawn_failed" }),
      })),
      deadline,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
