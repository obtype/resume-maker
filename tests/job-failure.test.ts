import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DENIED_SOURCE_MESSAGE,
  describeJobFetchFailure,
} from "../src/core/job/failure";
import { JobFetchRequestError, requestJobFetch } from "../src/core/job/client";

/** The server's own messages, one per code it can return. */
const SERVER_MESSAGES: Record<string, string> = {
  bad_json: "The request body is not a JSON object.",
  invalid_url: "The URL must be an absolute http(s) address.",
  unsupported_source: "This site cannot be read automatically. Paste the job description instead.",
  not_configured: "No career-ops folder is set. Add one in Settings under Job intake to fetch a posting.",
  extractor_missing: "The career-ops folder does not contain browser-extract.mjs.",
  extractor_failed: "Navigation timed out.",
  bad_extraction: "The extractor returned a non-string title.",
  timeout: "The posting did not answer within 240 seconds.",
  forbidden_origin: "Cross-origin requests are not allowed.",
  bad_method: "Use POST.",
  body_too_large: "Request body is too large.",
  bad_content_type: "Content-Type must be application/json.",
  network: "The local server did not answer.",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeJobFetchFailure", () => {
  it("keeps the server's specific message for every code", () => {
    for (const [code, message] of Object.entries(SERVER_MESSAGES)) {
      expect(describeJobFetchFailure(code, message).message, code).toBe(message);
    }
  });

  it("gives every code a copy that differs from the others", () => {
    const copies = Object.entries(SERVER_MESSAGES).map(([code, message]) => {
      const copy = describeJobFetchFailure(code, message);
      return JSON.stringify(copy);
    });
    expect(new Set(copies).size).toBe(copies.length);
  });

  it("points an unconfigured extractor at Settings", () => {
    expect(describeJobFetchFailure("not_configured", SERVER_MESSAGES.not_configured).action).toBe(
      "settings",
    );
    expect(describeJobFetchFailure("extractor_missing", SERVER_MESSAGES.extractor_missing).action).toBe(
      "settings",
    );
  });

  it("points an unreadable page at the description box", () => {
    expect(
      describeJobFetchFailure("unsupported_source", SERVER_MESSAGES.unsupported_source).action,
    ).toBe("paste");
    expect(describeJobFetchFailure("bad_extraction", SERVER_MESSAGES.bad_extraction).action).toBe(
      "paste",
    );
  });

  it("tells a timeout to retry or paste, without restating the message", () => {
    const copy = describeJobFetchFailure("timeout", SERVER_MESSAGES.timeout);
    expect(copy.nextStep).toContain("Try again");
    expect(copy.nextStep).toContain("paste");
    expect(copy.message).not.toContain("Try again");
  });

  it("names the missing browser instead of advising a pointless retry", () => {
    // Verbatim shape of what the extractor printed for a real posting (#user
    // report): Playwright's launch failure, wrapped by browser-extract.mjs.
    const copy = describeJobFetchFailure(
      "extractor_failed",
      "navigation error: browserType.launch: Executable doesn't exist at " +
        "/home/someone/.cache/ms-playwright/chromium_headless_shell-1248/" +
        "chrome-headless-shell-linux64/chrome-headless-shell",
    );
    expect(copy.message).toContain("no browser installed");
    expect(copy.nextStep).toContain("npx playwright install chromium");
    // The one piece of advice that cannot work here.
    expect(copy.nextStep).not.toContain("Try again in a moment");
    // A cache path is not something the user can act on.
    expect(copy.message).not.toContain("/home/");
  });

  it("still offers a retry for a genuine navigation failure", () => {
    const copy = describeJobFetchFailure(
      "extractor_failed",
      "navigation error: page.goto: Timeout 30000ms exceeded.",
    );
    expect(copy.message).toContain("Timeout");
    expect(copy.nextStep).toContain("Try again in a moment");
  });

  it("keeps a malformed result distinguishable from an extractor crash", () => {
    const malformed = describeJobFetchFailure("bad_extraction", SERVER_MESSAGES.bad_extraction);
    const crashed = describeJobFetchFailure("extractor_failed", SERVER_MESSAGES.extractor_failed);
    expect(malformed.message).toContain("title");
    expect(crashed.message).toBe("Navigation timed out.");
    expect(malformed.message).not.toBe(crashed.message);
  });

  it("falls back to its own sentence when a code arrives without a message", () => {
    const copy = describeJobFetchFailure("timeout", "  ");
    expect(copy.message.length).toBeGreaterThan(0);
    expect(copy.message).not.toBe("  ");
  });

  it("keeps an unknown code readable instead of showing nothing", () => {
    const copy = describeJobFetchFailure("something_new", "");
    expect(copy.message).toBe("The fetch failed.");
  });
});

describe("requestJobFetch", () => {
  it("refuses a deny-listed host before any request is made", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const url of [
      "https://www.linkedin.com/jobs/view/123",
      "https://de.indeed.com/viewjob?jk=abc",
      "https://GLASSDOOR.com/partner/jobListing.htm?pos=1",
    ]) {
      await expect(requestJobFetch(url, "/tmp/career-ops")).rejects.toMatchObject({
        code: "unsupported_source",
        message: DENIED_SOURCE_MESSAGE,
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the paste fallback for an unreadable host", () => {
    expect(DENIED_SOURCE_MESSAGE).toContain("Paste the job description");
    expect(DENIED_SOURCE_MESSAGE).toContain("LinkedIn");
  });

  it("reports a server that does not answer as a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const failure = await requestJobFetch("https://jobs.ashbyhq.com/acme/1", "").catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(JobFetchRequestError);
    expect(failure).toMatchObject({ code: "network" });
  });

  it("carries the server's code and message through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "The posting did not answer within 240 seconds.",
              code: "timeout",
            }),
            { status: 504, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(requestJobFetch("https://jobs.ashbyhq.com/acme/1", "")).rejects.toMatchObject({
      code: "timeout",
      status: 504,
    });
  });

  it("carries the extractor's own failure code beside the route's code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "The page took too long to render.",
              code: "extractor_failed",
              extractorCode: "navigation_timeout",
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(requestJobFetch("https://jobs.ashbyhq.com/acme/1", "")).rejects.toMatchObject({
      code: "extractor_failed",
      extractorCode: "navigation_timeout",
      message: "The page took too long to render.",
    });
  });

  it("leaves the extractor code empty when the server relays none", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Nope.", code: "bad_extraction" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const failure = await requestJobFetch("https://jobs.ashbyhq.com/acme/1", "").catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: "bad_extraction", extractorCode: "" });
  });

  it("passes a successful target and its warnings through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              target: {
                url: "https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e",
                title: "Computer Vision Engineer",
                company: "Acme Robotics",
                description: "Own perception for the warehouse fleet.",
                ats: "ashby",
                companySource: "url",
              },
              warnings: ["The company name came from the posting URL."],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const result = await requestJobFetch("https://jobs.ashbyhq.com/acme-robotics/8f4d2c1e", "");
    expect(result.target.companySource).toBe("url");
    expect(result.warnings).toHaveLength(1);
  });
});
