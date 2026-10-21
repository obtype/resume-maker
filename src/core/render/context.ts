import type { CvStyle, RenderContext } from "../cv/types";
import { sanitizeSavedHtml } from "./sanitize";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function nl2br(value: unknown): string {
  return esc(value).replace(/\r?\n/g, "<br>");
}

/**
 * Builds the helper object handed to renderers. Renderers never handle saved
 * formatting themselves: ctx.field applies the rich HTML only when its plain
 * text still matches the current JSON value.
 */
export function createRenderContext(style: CvStyle): RenderContext {
  const field = (path: string, value: unknown): string => {
    const plain = String(value ?? "").replace(/\u00a0/g, " ").trim();
    const saved = style.fieldHtml[path];
    const savedText = style.fieldText[path];
    const content =
      saved != null && savedText === plain
        ? sanitizeSavedHtml(saved)
        : nl2br(String(value ?? "").replace(/\u00a0/g, " ").trim());
    return `<span data-field="${esc(path)}">${content}</span>`;
  };
  return { esc, field, nl2br };
}
