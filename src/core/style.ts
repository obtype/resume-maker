import type { CvStyle } from "./cv/types";

export function defaultStyle(): CvStyle {
  return {
    typeScale: 1,
    verticalScale: 0.65,
    marginMm: 7,
    sidebarMm: 51,
    accent: "#1f6fbf",
    fieldHtml: {},
    fieldText: {},
  };
}

export function normalizeStyle(value: unknown): CvStyle {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<CvStyle>;
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const strMap = (v: unknown): Record<string, string> => {
    if (!v || typeof v !== "object") return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  };
  return {
    typeScale: num(raw.typeScale, 1, 0.7, 1.5),
    verticalScale: num(raw.verticalScale, 0.65, 0.4, 1.1),
    marginMm: num(raw.marginMm, 7, 3, 11),
    sidebarMm: num(raw.sidebarMm, 51, 42, 65),
    accent: typeof raw.accent === "string" ? raw.accent : "#1f6fbf",
    fieldHtml: strMap(raw.fieldHtml),
    fieldText: strMap(raw.fieldText),
  };
}

export function styleToCssVars(style: CvStyle): Record<string, string> {
  return {
    "--cv-type-scale": String(style.typeScale),
    "--cv-space-scale": String(style.verticalScale),
    "--cv-margin": `${style.marginMm}mm`,
    "--cv-sidebar": `${style.sidebarMm}mm`,
    "--cv-accent": style.accent,
  };
}
