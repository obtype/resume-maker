import type { RendererModule } from "../cv/types";
import { getSchema } from "../cv/schema";
import { sampleCv } from "../cv/sample";
import { createRenderContext } from "./context";
import { defaultStyle } from "../style";

export interface RendererCheck {
  level: "ok" | "warn" | "error";
  message: string;
}

/**
 * Contract checks used by tests and the Settings screen. They are intentionally
 * string-based so an LLM-generated renderer can be checked without a browser.
 */
export function checkRenderer(renderer: RendererModule): RendererCheck[] {
  const checks: RendererCheck[] = [];
  const meta = renderer.meta;
  if (!meta || meta.apiVersion !== 1) {
    checks.push({ level: "error", message: "meta.apiVersion must be 1." });
  }
  if (!meta?.id || !meta?.name) {
    checks.push({ level: "error", message: "Renderer needs an id and name." });
  }
  if (!Array.isArray(meta?.schemas) || meta.schemas.length === 0) {
    checks.push({ level: "error", message: "Renderer must declare at least one schema id." });
    return checks;
  }
  if (typeof renderer.render !== "function") {
    checks.push({ level: "error", message: "Renderer must export render(cv, ctx)." });
    return checks;
  }
  if (typeof renderer.css !== "string" || !renderer.css.trim()) {
    checks.push({ level: "warn", message: "Renderer has no CSS." });
  }

  for (const schemaId of meta.schemas) {
    const schema = getSchema(schemaId);
    if (schema.id !== schemaId) {
      checks.push({ level: "error", message: `Unknown schema "${schemaId}".` });
      continue;
    }
    let html = "";
    try {
      html = renderer.render(sampleCv(schemaId), createRenderContext(defaultStyle()));
    } catch (error) {
      checks.push({
        level: "error",
        message: `render() threw for schema "${schemaId}": ${(error as Error).message}`,
      });
      continue;
    }
    if (typeof html !== "string" || !html.trim()) {
      checks.push({ level: "error", message: `render() returned no HTML for "${schemaId}".` });
      continue;
    }
    if (/<script[\s>]/i.test(html)) {
      checks.push({ level: "error", message: "Renderer output must not contain <script> tags." });
    }
    if (!html.includes('data-field="basics.name"')) {
      checks.push({ level: "error", message: "basics.name is not exposed as an editable field." });
    }
    if (!html.includes('data-field="experience.0.role"')) {
      checks.push({ level: "warn", message: "Experience entries are not exposed as editable fields." });
    }
    if (!html.includes("data-cv-page")) {
      checks.push({ level: "error", message: "The page element needs data-cv-page for overflow checks." });
    }
    if (!html.includes("&lt;script&gt;")) {
      checks.push({ level: "error", message: "Text fields are not HTML-escaped." });
    }
    checks.push({ level: "ok", message: `Renders schema "${schemaId}" successfully.` });
  }

  if (meta.controls?.typeScale && !renderer.css?.includes("--cv-type-scale")) {
    checks.push({
      level: "warn",
      message: "Global type scaling is enabled but the CSS does not use --cv-type-scale.",
    });
  }
  if (meta.controls?.spacing && !renderer.css?.includes("--cv-space-scale")) {
    checks.push({
      level: "warn",
      message: "Spacing is enabled but the CSS does not use --cv-space-scale.",
    });
  }
  return checks;
}
