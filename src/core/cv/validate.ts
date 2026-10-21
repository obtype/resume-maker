import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import { getSchema } from "./schema";
import { normalizeCv } from "./normalize";
import type { CvContent } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validators = new Map<string, ValidateFunction>();

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface CvValidation {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  data: CvContent;
}

function getValidator(schemaId: string): ValidateFunction {
  const cached = validators.get(schemaId);
  if (cached) return cached;
  const compiled = ajv.compile(getSchema(schemaId).jsonSchema);
  validators.set(schemaId, compiled);
  return compiled;
}

function pathOf(error: ErrorObject): string {
  const parent = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
  if (error.keyword === "required") {
    const key = String((error.params as { missingProperty?: string }).missingProperty ?? "");
    return parent ? `${parent}.${key}` : key;
  }
  return parent || "root";
}

function messageOf(error: ErrorObject): string {
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case "required":
      return `missing required field "${String(params.missingProperty)}"`;
    case "additionalProperties":
      return `unexpected field "${String(params.additionalProperty)}"`;
    case "maxItems":
      return `must have at most ${String(params.limit)} items`;
    case "minItems":
      return `must have at least ${String(params.limit)} item(s)`;
    case "maxLength":
      return `must be at most ${String(params.limit)} characters`;
    case "minLength":
      return "must not be empty";
    case "type":
      return `must be ${String(params.type)}`;
    case "const":
      return `must equal ${JSON.stringify(params.allowedValue)}`;
    default:
      return error.message ?? "is invalid";
  }
}

function collectWarnings(cv: CvContent): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  const totalBullets = cv.experience.reduce((n, e) => n + e.bullets.length, 0);
  if (totalBullets > 18) {
    warnings.push({
      path: "experience",
      message: `${totalBullets} experience bullets across all roles may overflow a one-page CV.`,
    });
  }
  for (const [i, entry] of cv.experience.entries()) {
    if (entry.bullets.length > 4) {
      warnings.push({
        path: `experience.${i}.bullets`,
        message: "More than 4 bullets for one role; consider trimming to the most relevant.",
      });
    }
    for (const [j, bullet] of entry.bullets.entries()) {
      if (bullet.length > 280) {
        warnings.push({
          path: `experience.${i}.bullets.${j}`,
          message: `Bullet is ${bullet.length} characters; shorter bullets read better.`,
        });
      }
    }
    if (entry.dates && !/\b(19|20)\d{2}\b/.test(entry.dates)) {
      warnings.push({
        path: `experience.${i}.dates`,
        message: "Dates do not contain a 4-digit year.",
      });
    }
  }
  for (const [i, entry] of cv.projects.entries()) {
    if (entry.dates && !/\b(19|20)\d{2}\b/.test(entry.dates)) {
      warnings.push({
        path: `projects.${i}.dates`,
        message: "Dates do not contain a 4-digit year.",
      });
    }
  }
  if (!cv.basics.contact.some((c) => c.includes("@"))) {
    warnings.push({
      path: "basics.contact",
      message: "No email address found in contact details.",
    });
  }
  return warnings;
}

/**
 * Normalizes first (drops unknown fields), then validates against the schema
 * attached to the project. Returns the normalized data so callers can apply it.
 */
export function validateCv(value: unknown, schemaId: string): CvValidation {
  const data = normalizeCv(value, schemaId);
  const validate = getValidator(schemaId);
  const valid = validate(data) as boolean;
  const errors = valid
    ? []
    : (validate.errors ?? []).map((error) => ({
        path: pathOf(error),
        message: messageOf(error),
      }));
  return {
    valid,
    errors,
    warnings: collectWarnings(data),
    data,
  };
}
