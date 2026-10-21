import { renderClassic } from "../classic/renderer.js";
import css from "../classic/renderer.css?inline";

export const meta = {
  apiVersion: 1,
  id: "classic-summary",
  name: "Classic + Summary",
  description: "The classic sidebar layout with a tailored summary block at the top of the main column.",
  schemas: ["classic-summary", "classic"],
  page: { width: "210mm", height: "297mm", multiPage: false },
  controls: { typeScale: true, spacing: true, margins: true, sidebar: true },
  sections: ["summary", "education", "skills", "experience", "projects", "custom"],
};

export { css };

export function render(cv, ctx) {
  return renderClassic(cv, ctx, { summary: true });
}
