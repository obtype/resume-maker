#!/usr/bin/env node
/**
 * Offline stand-in for an extractor that fails transiently, used only by
 * `npm run smoke` to prove the retry path against the *same* URL.
 *
 * The first request for a URL exits 1 with the extractor's own `{ error, code }`
 * on stderr; later requests for that URL succeed with a distinct canned result.
 * The marker lives in the OS temp directory because the Target stage cannot
 * change the configured folder without unmounting, and the retry must reuse the
 * URL the user already typed. The smoke test puts a run-unique token in the URL,
 * so reruns start clean.
 *
 * Contract mirrored here: stdout is a single JSON object
 * `{ url, title, text, ats }`, exit 0 on success; stderr is `{ error, code }`,
 * exit 1 on failure.
 */
import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "";
const marker = join(
  tmpdir(),
  `cv-studio-smoke-failing-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`,
);

if (!existsSync(marker)) {
  writeFileSync(marker, "");
  process.stderr.write(
    JSON.stringify({
      error: "The page took too long to render.",
      code: "navigation_timeout",
    }),
  );
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({
    url,
    title: "Retry Succeeded Engineer",
    text: [
      "This description came from the second attempt.",
      "",
      "It exists so the smoke test can prove that a retry reuses the URL the user already typed.",
    ].join("\n"),
    ats: "ashby",
  }),
);
