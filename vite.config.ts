import { defineConfig, type Plugin, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { exportPdf } from "./server/pdf";

function pdfExportMiddleware(
  server: ViteDevServer | PreviewServer,
): void {
  server.middlewares.use("/api/export-pdf", async (request, response) => {
    const origin = request.headers.origin;
    const host = request.headers.host;
    const contentType = request.headers["content-type"] ?? "";
    if (origin && host && origin !== `http://${host}` && origin !== `https://${host}`) {
      response.statusCode = 403;
      response.end("Cross-origin PDF export is not allowed.");
      return;
    }
    if (request.method !== "POST") {
      response.statusCode = 405;
      response.setHeader("Content-Type", "text/plain");
      response.end("Use POST.");
      return;
    }
    if (!contentType.includes("application/json")) {
      response.statusCode = 415;
      response.end("Content-Type must be application/json.");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 9_000_000) throw new Error("Request body is too large.");
        chunks.push(buffer);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        html?: string;
      };
      if (typeof payload.html !== "string") throw new Error("Missing html field.");
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

function pdfExportPlugin(): Plugin {
  return {
    name: "cv-studio-pdf-export",
    configureServer(server) {
      pdfExportMiddleware(server);
    },
    configurePreviewServer(server) {
      pdfExportMiddleware(server);
    },
  };
}

// The port is fixed on purpose: File System Access handles are stored in
// IndexedDB, which is scoped to the origin (including the port). Changing the
// port would silently lose the remembered workspace.
export default defineConfig({
  plugins: [react(), pdfExportPlugin()],
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: "es2022" },
  // Playwright is a Node-only dependency; never bundle it into the browser.
  optimizeDeps: { exclude: ["playwright-core"] },
});
