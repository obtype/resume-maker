import type { CvStyle, RenderContext } from "../cv/types";
import { esc, nl2br } from "./escape";
import { linkifyText } from "./link";
import { sanitizeSavedHtml } from "./sanitize";

export { esc, nl2br };

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
        : linkifyText(String(value ?? "").replace(/\u00a0/g, " ").trim(), {
            allowBareDomain: path.startsWith("basics.contact."),
          });
    return `<span data-field="${esc(path)}">${content}</span>`;
  };
  return { esc, field, nl2br };
}
