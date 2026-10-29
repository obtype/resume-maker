/**
 * User-facing copy for a failed job fetch, derived from the server's error code.
 *
 * The server's `error` string is already specific — it names the malformed
 * field, or repeats the extractor's own message — so it stays the message. This
 * module only adds the one next step a code needs, plus which control the UI
 * should offer next to it. Retry is deliberately absent: the fetch button
 * itself becomes the retry, so a failure never grows a second code path.
 *
 * Pure and DOM-free so the failure taxonomy is testable without rendering.
 */
export type JobFetchAction = "settings" | "paste";

export interface JobFetchFailureCopy {
  /** The server's message, or this module's own when the server sent none. */
  message: string;
  /** One short next step, only when it says something the message does not. */
  nextStep?: string;
  /** A control the surface can render: open Settings, or focus the text box. */
  action?: JobFetchAction;
}

/**
 * Copy for a host this app refuses to read. It names the sites because the user
 * just pasted one of their URLs, and points at the only path that works.
 */
export const DENIED_SOURCE_MESSAGE =
  "LinkedIn, Indeed and Glassdoor pages cannot be read automatically. Paste the job description below instead.";

/** Used when a code arrives with no message at all. */
const FALLBACK_MESSAGES: Record<string, string> = {
  bad_json: "The app sent a request the server could not read.",
  invalid_url: "The posting URL is not a valid http(s) address.",
  unsupported_source: DENIED_SOURCE_MESSAGE,
  not_configured: "No career-ops folder is set, so fetching is disabled.",
  extractor_missing: "The career-ops folder does not contain the extractor.",
  extractor_failed: "The extractor could not read this posting.",
  bad_extraction: "The extractor returned a result this app could not use.",
  timeout: "The posting did not answer in time.",
  forbidden_origin: "The request came from another origin.",
  bad_method: "The request used the wrong method.",
  body_too_large: "The request was too large.",
  bad_content_type: "The request was not JSON.",
  network: "The local server did not answer.",
};

/**
 * Playwright's launch failure when its browser binary is not installed, as it
 * reaches us inside an `extractor_failed` message. A page-level navigation
 * failure shares the `navigation_error` code, so the text is the only thing
 * that tells them apart — and the distinction matters: no amount of retrying
 * installs a browser, so this must not be answered with "try again".
 */
const MISSING_BROWSER =
  /browserType\.launch: Executable doesn't exist|Executable doesn't exist at .*ms-playwright/i;

const NEXT_STEPS: Record<string, Pick<JobFetchFailureCopy, "nextStep" | "action">> = {
  // A retry is the fetch button; the paste fallback is the textarea below it.
  bad_json: { nextStep: "Try again; if it keeps happening, paste the description below." },
  unsupported_source: { action: "paste" },
  not_configured: { action: "settings" },
  extractor_missing: { action: "settings" },
  extractor_failed: { nextStep: "Try again in a moment, or paste the description below." },
  bad_extraction: {
    nextStep:
      "The page or the extractor produced this, not your URL. Pasting the description below still works.",
    action: "paste",
  },
  timeout: { nextStep: "Try again, or paste the description below." },
  forbidden_origin: { nextStep: "Reload the page and try again." },
  bad_method: { nextStep: "Reload the app and try again." },
  body_too_large: { nextStep: "Reload the app and try again." },
  bad_content_type: { nextStep: "Reload the app and try again." },
  network: { nextStep: "Start the local server, then try again." },
};

export function describeJobFetchFailure(
  code: string,
  serverMessage: string,
): JobFetchFailureCopy {
  // Before the per-code table: this arrives as `extractor_failed`, whose advice
  // is to retry, and retrying cannot fix a missing browser binary.
  if (MISSING_BROWSER.test(serverMessage)) {
    return {
      message: "The career-ops checkout has no browser installed for its extractor.",
      nextStep:
        "Run `npx playwright install chromium` in that folder, then try again.",
    };
  }
  const message = serverMessage.trim() || FALLBACK_MESSAGES[code] || "The fetch failed.";
  const next = NEXT_STEPS[code];
  const copy: JobFetchFailureCopy = { message };
  if (next?.nextStep) copy.nextStep = next.nextStep;
  if (next?.action) copy.action = next.action;
  return copy;
}
