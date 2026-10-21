import { normalizeCv } from "./normalize";
import type { CvContent, CvStyle } from "./types";
import { defaultStyle } from "../style";

export interface MigrationResult {
  cv: CvContent;
  style: CvStyle;
  wasLegacy: boolean;
}

function htmlToPlain(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").replace(/\r/g, "").trim();
  }
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "")
    .trim();
}

/**
 * Accepts the old cv-studio JSON format (schemaVersion 1, style embedded) or a
 * current content file, and returns canonical content + renderer style.
 */
export function migrateCv(value: unknown, schemaId = "classic"): MigrationResult {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const wasLegacy = raw.schemaVersion !== 2;
  const style = defaultStyle();
  const legacyStyle = (raw.style && typeof raw.style === "object" ? raw.style : {}) as Record<string, unknown>;

  const globalScale = Number(legacyStyle.globalScale);
  const bodySize = parseFloat(String(legacyStyle.bodyFontSize ?? "8.5pt"));
  if (Number.isFinite(globalScale)) style.typeScale = globalScale;
  if (Number.isFinite(bodySize) && bodySize > 0) style.typeScale *= bodySize / 8.5;

  const verticalScale = Number(legacyStyle.verticalScale);
  if (Number.isFinite(verticalScale)) style.verticalScale = verticalScale;

  const marginMm = Number(legacyStyle.marginMm);
  if (Number.isFinite(marginMm)) style.marginMm = marginMm;
  else {
    const margins = String(legacyStyle.margins ?? "default");
    style.marginMm = margins === "compact" ? 5 : margins === "wide" ? 9 : 7;
  }

  const sidebar = parseFloat(String(legacyStyle.sidebarWidth ?? "51mm"));
  if (Number.isFinite(sidebar)) style.sidebarMm = sidebar;

  const fieldHtml = legacyStyle.fieldHtml;
  if (fieldHtml && typeof fieldHtml === "object") {
    for (const [path, html] of Object.entries(fieldHtml as Record<string, unknown>)) {
      if (typeof html !== "string") continue;
      style.fieldHtml[path] = html;
      style.fieldText[path] = legacyStyle.fieldText && typeof legacyStyle.fieldText === "object"
        ? String((legacyStyle.fieldText as Record<string, unknown>)[path] ?? htmlToPlain(html))
        : htmlToPlain(html);
    }
  }

  const cv = normalizeCv(
    { ...raw, schemaVersion: 2 },
    wasLegacy ? "classic" : schemaId,
  );
  return { cv, style, wasLegacy };
}

export function migrateLegacyCv(value: unknown): MigrationResult {
  return migrateCv(value, "classic");
}
