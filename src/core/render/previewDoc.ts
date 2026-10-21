import runtimeSource from "../../runtime/preview-runtime.js?raw";
import baseCss from "./preview-base.css?inline";
import { createRenderContext, esc } from "./context";
import { styleToCssVars } from "../style";
import type { CvContent, CvStyle, RendererModule } from "../cv/types";

function composeDoc(options: {
  renderer: RendererModule;
  cv: CvContent;
  style: CvStyle;
  editing: boolean;
  title: string;
  runtime: boolean;
}): string {
  const { renderer, cv, style, editing, title, runtime } = options;
  const html = renderer.render(cv, createRenderContext(style));
  const vars = Object.entries(styleToCssVars(style))
    .map(([key, value]) => `${key}:${value};`)
    .join("");
  const runtimeScript = runtime
    ? `<script>${runtimeSource.replace(/<\/script/gi, "<\\/script")}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<style>${baseCss}</style>
<style>${renderer.css}</style>
<style>:root{${vars}}</style>
</head>
<body class="${editing ? "cv-editing" : ""}">
${html}
${runtimeScript}
</body>
</html>`;
}

export function buildPreviewDoc(options: {
  renderer: RendererModule;
  cv: CvContent;
  style: CvStyle;
  editing: boolean;
  title?: string;
}): string {
  return composeDoc({
    ...options,
    title: options.title || "CV",
    runtime: true,
  });
}

/** Standalone document for headless PDF generation. No editing runtime. */
export function buildPrintDoc(options: {
  renderer: RendererModule;
  cv: CvContent;
  style: CvStyle;
  title: string;
}): string {
  return composeDoc({
    ...options,
    editing: false,
    runtime: false,
  });
}
