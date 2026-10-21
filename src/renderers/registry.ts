import * as classic from "./classic/renderer.js";
import * as classicSummary from "./classic-summary/renderer.js";
import * as impact from "./impact/renderer.js";
import type { RendererModule } from "../core/cv/types";
import { DEFAULT_SCHEMA_ID } from "../core/cv/schema";

export const RENDERERS: RendererModule[] = [
  classic as unknown as RendererModule,
  classicSummary as unknown as RendererModule,
  impact as unknown as RendererModule,
];

export function getRenderer(id: string): RendererModule {
  return RENDERERS.find((renderer) => renderer.meta.id === id) ?? RENDERERS[0];
}

export function renderersForSchema(schemaId: string): RendererModule[] {
  return RENDERERS.filter((renderer) => renderer.meta.schemas.includes(schemaId));
}

export function defaultSchemaForRenderer(rendererId: string): string {
  const renderer = getRenderer(rendererId);
  return renderer.meta.schemas[0] ?? DEFAULT_SCHEMA_ID;
}

export function isRendererCompatible(rendererId: string, schemaId: string): boolean {
  return getRenderer(rendererId).meta.schemas.includes(schemaId);
}
