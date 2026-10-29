import { jsonrepair } from "jsonrepair";

export interface ParsedResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
  repaired?: boolean;
  extracted?: string;
}

/** Extract the first balanced JSON object, tolerating code fences and prose. */
export function extractJson(text: string): string {
  let source = String(text ?? "").replace(/^\uFEFF/, "").trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();
  const start = source.indexOf("{");
  if (start < 0) return source;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/**
 * ChatGPT sometimes escapes structural JSON characters to protect Markdown
 * (`\[`, `\]`, `\{`, `\}`). Those escapes are invalid in JSON, so drop the
 * stray backslash while leaving an escaped backslash (`\\[`) intact.
 */
function unescapeJsonStructure(source: string): string {
  let output = "";
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (
      char === "\\" &&
      i + 1 < source.length &&
      "[]{}".includes(source[i + 1]) &&
      source[i - 1] !== "\\"
    ) {
      continue;
    }
    output += char;
  }
  return output;
}

export function parseLlmResponse(text: string): ParsedResponse {
  const extracted = unescapeJsonStructure(extractJson(text));
  if (!extracted.trim()) return { ok: false, error: "The response is empty.", extracted };
  const accept = (value: unknown, repaired: boolean): ParsedResponse =>
    value && typeof value === "object"
      ? { ok: true, data: value, extracted, repaired }
      : {
          ok: false,
          error: "The response did not contain a JSON object.",
          extracted,
        };
  try {
    return accept(JSON.parse(extracted), false);
  } catch (firstError) {
    try {
      return accept(JSON.parse(jsonrepair(extracted)), true);
    } catch {
      return {
        ok: false,
        error: `Could not parse JSON: ${(firstError as Error).message}`,
        extracted,
      };
    }
  }
}
