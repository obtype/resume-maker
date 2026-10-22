import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import {
  normalizeColdEmail,
  normalizeCoverLetter,
  normalizeLinkedinMessage,
} from "./normalize";
import { MESSAGE_DELIVERABLES } from "./schema";
import type { ColdEmailContent, MessageDeliverableId } from "./types";

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface DeliverableValidation<T> {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  data: T;
}

const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
const validators = new Map<MessageDeliverableId, ValidateFunction>();

function getValidator(id: MessageDeliverableId): ValidateFunction {
  const cached = validators.get(id);
  if (cached) return cached;
  const compiled = ajv.compile(MESSAGE_DELIVERABLES[id].jsonSchema);
  validators.set(id, compiled);
  return compiled;
}

function pathOf(error: ErrorObject): string {
  const parent = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
  if (error.keyword === "required") {
    const key = String(
      (error.params as { missingProperty?: string }).missingProperty ?? "",
    );
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
    case "maxLength":
      return `must be at most ${String(params.limit)} characters`;
    case "minLength":
      return "must not be empty";
    case "type":
      return `must be ${String(params.type)}`;
    default:
      return error.message ?? "is invalid";
  }
}

function validateSchema<T>(
  id: MessageDeliverableId,
  data: T,
): { valid: boolean; errors: ValidationIssue[] } {
  const validate = getValidator(id);
  if (validate(data)) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: (validate.errors ?? []).map((error) => ({
      path: pathOf(error),
      message: messageOf(error),
    })),
  };
}

export function validateCoverLetter(
  value: unknown,
): DeliverableValidation<string> {
  const data = normalizeCoverLetter(value);
  const result = validateSchema("coverLetter", data);
  const { minChars, maxChars } = MESSAGE_DELIVERABLES.coverLetter.advisory;
  const warnings: ValidationIssue[] = [];

  if (data.length > 0 && minChars && data.length < minChars) {
    warnings.push({
      path: "coverLetter",
      message: `Cover letter is ${data.length} characters; aim for at least ${minChars} (common letters run 1,500-2,500).`,
    });
  }
  if (data.length > 0 && maxChars && data.length > maxChars) {
    warnings.push({
      path: "coverLetter",
      message: `Cover letter is ${data.length} characters; consider trimming below ${maxChars}.`,
    });
  }

  return { ...result, warnings, data };
}

export function validateColdEmail(
  value: unknown,
): DeliverableValidation<ColdEmailContent> {
  const data = normalizeColdEmail(value);
  const result = validateSchema("coldEmail", data);
  const { subjectMaxChars, bodyMinChars, bodyMaxChars } =
    MESSAGE_DELIVERABLES.coldEmail.advisory;
  const warnings: ValidationIssue[] = [];

  if (data.subject.length > 0 && subjectMaxChars && data.subject.length > subjectMaxChars) {
    warnings.push({
      path: "subject",
      message: `Subject is ${data.subject.length} characters; keep it under ${subjectMaxChars}.`,
    });
  }
  if (data.body.length > 0 && bodyMinChars && data.body.length < bodyMinChars) {
    warnings.push({
      path: "body",
      message: `Body is ${data.body.length} characters; it may be too terse to make a clear ask.`,
    });
  }
  if (data.body.length > 0 && bodyMaxChars && data.body.length > bodyMaxChars) {
    warnings.push({
      path: "body",
      message: `Body is ${data.body.length} characters; consider trimming below ${bodyMaxChars}.`,
    });
  }

  return { ...result, warnings, data };
}

export function validateLinkedinMessage(
  value: unknown,
): DeliverableValidation<string> {
  const data = normalizeLinkedinMessage(value);
  const result = validateSchema("linkedinMessage", data);
  const { maxChars } = MESSAGE_DELIVERABLES.linkedinMessage.advisory;
  const warnings: ValidationIssue[] = [];

  if (data.length > 0 && data.length < 300) {
    warnings.push({
      path: "linkedinMessage",
      message:
        "Message is under 300 characters; make sure it is a post-acceptance message, not a connection note.",
    });
  } else if (data.length > 0 && maxChars && data.length > maxChars) {
    warnings.push({
      path: "linkedinMessage",
      message: `Message is ${data.length} characters; consider trimming below ${maxChars}.`,
    });
  }

  return { ...result, warnings, data };
}

export type MessageValidation =
  | { id: "coverLetter"; validation: DeliverableValidation<string> }
  | { id: "coldEmail"; validation: DeliverableValidation<ColdEmailContent> }
  | {
      id: "linkedinMessage";
      validation: DeliverableValidation<string>;
    };

export function validateMessageDeliverable(
  id: MessageDeliverableId,
  value: unknown,
): MessageValidation {
  switch (id) {
    case "coverLetter":
      return { id, validation: validateCoverLetter(value) };
    case "coldEmail":
      return { id, validation: validateColdEmail(value) };
    case "linkedinMessage":
      return { id, validation: validateLinkedinMessage(value) };
  }
}
