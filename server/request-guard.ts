import type { IncomingMessage } from "node:http";

/**
 * Shared guard for the local JSON endpoints (PDF export and job fetch): same
 * origin only, POST only, JSON only, bounded body. Factored so a new route
 * cannot accidentally ship with a weaker guard than an existing one.
 */
export interface GuardedRequest {
  ok: true;
  value: unknown;
}

export interface RejectedRequest {
  ok: false;
  status: number;
  message: string;
}

export type RequestGuardResult = GuardedRequest | RejectedRequest;

/**
 * Read and parse a JSON request body after the same-origin, method, and
 * content-type checks. The caller decides how to render the failure (plain
 * text for PDF, `{ error, code }` JSON for job fetch).
 */
export async function readJsonRequest(
  request: IncomingMessage,
  maxBytes: number,
): Promise<RequestGuardResult> {
  const { origin, host } = request.headers;
  if (origin && host && origin !== `http://${host}` && origin !== `https://${host}`) {
    return { ok: false, status: 403, message: "Cross-origin requests are not allowed." };
  }
  if (request.method !== "POST") {
    return { ok: false, status: 405, message: "Use POST." };
  }
  const contentType = request.headers["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return { ok: false, status: 415, message: "Content-Type must be application/json." };
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let overflow = false;
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        // Keep draining rather than destroying the socket, so the caller can
        // still write the error response.
        overflow = true;
        continue;
      }
      chunks.push(buffer);
    }
  } catch {
    return { ok: false, status: 400, message: "The request body could not be read." };
  }
  if (overflow) {
    return { ok: false, status: 413, message: "Request body is too large." };
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return { ok: false, status: 400, message: "Request body is empty." };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, message: "Request body is not valid JSON." };
  }
}
