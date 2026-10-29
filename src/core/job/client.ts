import { DENIED_SOURCE_MESSAGE } from "./failure";
import { isUnsupportedSource, type FetchedTarget } from "./target";

/** One successful fetch: the target plus non-blocking notes. */
export interface FetchedJob {
  target: FetchedTarget;
  warnings: string[];
}

/**
 * An error the server produced, carrying its code so a caller can tell a
 * timeout from an unconfigured extractor without parsing prose.
 */
export class JobFetchRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    /** The extractor's own failure code, when the server could relay one. */
    readonly extractorCode = "",
  ) {
    super(message);
    this.name = "JobFetchRequestError";
  }
}

/**
 * Ask the local Node server to read a posting URL through the career-ops
 * extractor. No retry, no caching: a failed run is the user's call to repeat.
 *
 * The deny-list is checked here as well as on the server, before any request:
 * a page this app will not read should not cost a round trip, and every surface
 * that calls this client gets the refusal without reimplementing it.
 */
export async function requestJobFetch(
  url: string,
  careerOpsDir: string,
): Promise<FetchedJob> {
  if (isUnsupportedSource(url)) {
    throw new JobFetchRequestError(DENIED_SOURCE_MESSAGE, "unsupported_source", 400);
  }

  const directory = careerOpsDir.trim();
  let response: Response;
  try {
    response = await fetch("/api/fetch-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(directory ? { url, careerOpsDir: directory } : { url }),
    });
  } catch {
    // The route lives on the same origin, so a rejection means the local server
    // is not answering at all — not that the posting is unreachable.
    throw new JobFetchRequestError(
      "The local server did not answer. Check that it is running, then try again.",
      "network",
      0,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        target?: unknown;
        warnings?: unknown;
        error?: unknown;
        code?: unknown;
        extractorCode?: unknown;
      }
    | null;

  if (!response.ok) {
    throw new JobFetchRequestError(
      typeof payload?.error === "string" ? payload.error : `Job fetch returned ${response.status}.`,
      typeof payload?.code === "string" ? payload.code : "bad_json",
      response.status,
      typeof payload?.extractorCode === "string" ? payload.extractorCode : "",
    );
  }

  const target = payload?.target as FetchedTarget | undefined;
  if (!target || typeof target.description !== "string" || !target.description.trim()) {
    throw new JobFetchRequestError(
      "The fetch response did not contain a job description.",
      "bad_extraction",
      response.status,
    );
  }
  return {
    target,
    warnings: Array.isArray(payload?.warnings)
      ? payload.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}
