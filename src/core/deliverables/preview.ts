import { esc } from "../render/escape";
import { resolveAnchorTarget } from "../render/link";

/**
 * A deliberately small Markdown subset for cover letters.
 *
 * The source is escaped before any markup is generated, so raw model HTML can
 * never reach the DOM. Only paragraphs, line breaks, `**bold**`, `*italic*`,
 * and `[label](target)` links are recognised. Link targets must pass
 * `resolveAnchorTarget`; anything else stays visible as plain text.
 */

const MARKDOWN_LINK = /\[([^\]\n]+)\]\(\s*([^()\s]+)\s*\)/g;

/** Escaped ampersands are common in URLs; undo only that safe entity. */
function targetFromEscaped(value: string): string {
  let target = value;
  while (target.includes("&amp;")) target = target.replace(/&amp;/g, "&");
  return target;
}

function emphasis(value: string): string {
  return value
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

/** Inline markup for text that has already been escaped. */
function inline(escaped: string): string {
  let html = "";
  let last = 0;
  MARKDOWN_LINK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK.exec(escaped)) !== null) {
    html += emphasis(escaped.slice(last, match.index));
    const label = emphasis(match[1]);
    const target = resolveAnchorTarget(targetFromEscaped(match[2]));
    if (target) {
      html += `<a href="${esc(target)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
    } else {
      // Unsafe or unusable target: keep the original text, inert.
      html += match[0];
    }
    last = match.index + match[0].length;
  }
  html += emphasis(escaped.slice(last));
  return html;
}

/**
 * Renders the cover-letter subset to safe HTML.
 *
 * Paragraphs are separated by blank lines; a single newline inside a
 * paragraph becomes a line break.
 */
export function renderCoverLetterPreview(value: unknown): string {
  const source = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!source) return "";

  return source
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").map((line) => inline(esc(line)));
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
}

/**
 * Plain-text form for "Copy as plain text": strips emphasis markers and keeps
 * only the label of a Markdown link. Line structure is preserved.
 */
export function markdownToPlainText(value: unknown): string {
  return String(value ?? "")
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
}
