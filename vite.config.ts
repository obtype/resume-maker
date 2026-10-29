import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { exportPdf } from "./server/pdf";
import { fetchJob, type JobFetchCode } from "./server/job-fetch";
import { readJsonRequest } from "./server/request-guard";

/** A CV document plus its inline assets; 9 MB is the ceiling Chrome accepts. */
const MAX_PDF_BODY_BYTES = 9_000_000;
/** A job-fetch body is a URL and an optional folder path. */
const MAX_JOB_FETCH_BODY_BYTES = 64_000;

/** Guard failures are not part of the extractor contract, but stay JSON. */
const GUARD_CODES: Record<number, string> = {
  400: "bad_json",
  403: "forbidden_origin",
  405: "bad_method",
  413: "body_too_large",
  415: "bad_content_type",
};

function pdfExportMiddleware(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use("/api/export-pdf", async (request, response) => {
    const guarded = await readJsonRequest(request, MAX_PDF_BODY_BYTES);
    if (!guarded.ok) {
      response.statusCode = guarded.status;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(guarded.message);
      return;
    }
    try {
      const payload = guarded.value as { html?: unknown };
      if (typeof payload?.html !== "string") throw new Error("Missing html field.");
      const pdf = await exportPdf(payload.html);
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", 'attachment; filename="cv.pdf"');
      response.setHeader("Cache-Control", "no-store");
      response.end(Buffer.from(pdf));
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(`PDF export failed: ${(error as Error).message}`);
    }
  });
}

/**
 * POST /api/fetch-job -> run the local career-ops extractor.
 *
 * The workspace setting travels in the body because the Node sidecar cannot
 * read the browser-owned workspace; `CAREER_OPS_DIR` is the server-side
 * fallback. Every failure is `{ error, code }`, matching the extractor's own
 * stderr shape, and never names the resolved absolute path.
 */
function jobFetchMiddleware(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use("/api/fetch-job", async (request, response) => {
    const sendJson = (status: number, body: unknown): void => {
      response.statusCode = status;
      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "no-store");
      response.end(JSON.stringify(body));
    };

    const guarded = await readJsonRequest(request, MAX_JOB_FETCH_BODY_BYTES);
    if (!guarded.ok) {
      sendJson(guarded.status, {
        error: guarded.message,
        code: GUARD_CODES[guarded.status] ?? "bad_json",
      });
      return;
    }

    try {
      const result = await fetchJob(guarded.value as { url?: unknown; careerOpsDir?: unknown });
      if (!result.ok) {
        sendJson(result.status, {
          error: result.error,
          code: result.code,
          ...(result.extractorCode ? { extractorCode: result.extractorCode } : {}),
        });
        return;
      }
      sendJson(200, { target: result.target, warnings: result.warnings });
    } catch {
      const code: JobFetchCode = "extractor_failed";
      sendJson(502, { error: "The fetch failed unexpectedly.", code });
    }
  });
}

function localApiPlugin(): Plugin {
  return {
    name: "cv-studio-local-api",
    configureServer(server) {
      pdfExportMiddleware(server);
      jobFetchMiddleware(server);
    },
    configurePreviewServer(server) {
      pdfExportMiddleware(server);
      jobFetchMiddleware(server);
    },
  };
}

// The port is fixed on purpose: File System Access handles are stored in
// IndexedDB, which is scoped to the origin (including the port). Changing the
// port would silently lose the remembered workspace.
export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: "es2022" },
  // Playwright is a Node-only dependency; never bundle it into the browser.
  optimizeDeps: { exclude: ["playwright-core"] },
});
