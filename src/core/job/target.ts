import type { ProjectJob } from "../project";

/**
 * The normalized result of reading one posting page: what the Target stage
 * writes into a project. This is an internal shape, not a file format.
 *
 * `description` is the extractor's `text` field, trimmed. `company` is either
 * what the page exposed or a best-effort derivation from the URL, and stays
 * empty when nothing is derivable. `companySource` records which of those it
 * was, so a caller can warn about a guess without re-deriving it.
 */
export interface FetchedTarget {
  url: string;
  title: string;
  company: string;
  description: string;
  ats?: string;
  companySource?: "page" | "url";
}

export type ExtractionResult =
  | { ok: true; target: FetchedTarget }
  | { ok: false; field: string; message: string };

/** Absolute http(s) URL, or null for anything else. */
export function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A string field of the extractor result. `undefined` means absent, `null`
 * means present but not a string, which is a malformed result — never coerced.
 */
function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const raw = record[key];
  if (raw == null) return undefined;
  return typeof raw === "string" ? raw : null;
}

function reject(field: string, message: string): ExtractionResult {
  return { ok: false, field, message };
}

/**
 * Normalize one extractor result (`{ url, title, text, ats }`) into a target.
 *
 * A missing title, company, or ats is fine: a page can render a description
 * without them, and the user fills the rest in. An empty description is not a
 * successful fetch of nothing, so it is rejected.
 */
export function normalizeExtraction(value: unknown): ExtractionResult {
  if (!isRecord(value)) {
    return reject("result", "The extractor result is not a JSON object.");
  }
  const url = httpUrl(value.url);
  if (!url) {
    return reject("url", "The extractor result has no absolute http(s) URL.");
  }
  const title = optionalString(value, "title");
  if (title === null) {
    return reject("title", "The extractor returned a non-string title.");
  }
  const text = optionalString(value, "text");
  if (text === null) {
    return reject("text", "The extractor returned a non-string text.");
  }
  const ats = optionalString(value, "ats");
  if (ats === null) {
    return reject("ats", "The extractor returned a non-string ats.");
  }
  // Not part of the documented extractor output, but a page-derived company is
  // the only thing that can beat the URL derivation below.
  const pageCompany = optionalString(value, "company");
  if (pageCompany === null) {
    return reject("company", "The extractor returned a non-string company.");
  }

  // Past this point every field is a string: absent became empty above.
  const description = (text ?? "").trim();
  if (!description) {
    return reject("text", "The extractor returned an empty job description.");
  }

  const pageCompanyValue = (pageCompany ?? "").trim();
  const company = pageCompanyValue || deriveCompanyFromUrl(url.href);
  const target: FetchedTarget = {
    url: url.href,
    title: (title ?? "").trim(),
    company,
    description,
  };
  // Provenance only matters when there is a name at all; an empty company is
  // already covered by its own warning.
  if (company) target.companySource = pageCompanyValue ? "page" : "url";
  const atsLabel = (ats ?? "").trim();
  if (atsLabel) target.ats = atsLabel;
  return { ok: true, target };
}

/** Boards whose employer is the first path segment of the posting URL. */
const BOARD_PATH_HOSTS = ["greenhouse.io", "lever.co", "ashbyhq.com"];

/**
 * Boards whose employer is a tenant subdomain of the posting URL. A vendor
 * domain is listed here rather than left to `companyFromHost`, because that
 * fallback reads the label before the TLD as the employer — right for
 * `careers.acme.com`, wrong for `acme.careers-page.com`, where it yields the
 * vendor's own name ("Careers Page") instead of the tenant.
 */
const BOARD_TENANT_HOSTS = [
  "myworkdayjobs.com",
  "icims.com",
  "bamboohr.com",
  "careers-page.com",
  "recruitee.com",
  "teamtailor.com",
  "breezy.hr",
  "zohorecruit.com",
  "freshteam.com",
];

const GENERIC_PATH_SEGMENTS = new Set(["jobs", "job", "careers", "apply", "embed"]);

const GENERIC_HOST_LABELS = new Set([
  "www",
  "jobs",
  "job",
  "careers",
  "career",
  "apply",
  "hire",
  "hiring",
  "talent",
  "recruiting",
  "work",
  "boards",
  "job-boards",
  "embed",
  "my",
]);

/** Second-level labels that sit above a country code, as in `acme.co.uk`. */
const SECOND_LEVEL_SUFFIXES = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "edu",
  "ac",
  "or",
  "ne",
  "go",
]);

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function boardTokenFromPath(url: URL): string {
  const [first] = url.pathname.split("/").filter(Boolean);
  if (!first || GENERIC_PATH_SEGMENTS.has(first.toLowerCase())) return "";
  return first;
}

/** Tenant prefixes some vendors prepend, as in `careers-acme.icims.com`. */
const TENANT_PREFIXES = ["careers-", "career-", "jobs-", "job-", "apply-", "hire-", "talent-"];

/** The tenant label that precedes a vendor domain, skipping `www`/`wd1`. */
function tenantLabel(host: string, domain: string): string {
  if (host === domain) return "";
  const prefix = host.slice(0, host.length - domain.length - 1);
  const labels = prefix
    .split(".")
    .filter((label) => label && !GENERIC_HOST_LABELS.has(label) && !/^wd\d+$/.test(label));
  const label = labels[0] ?? "";
  const stripped = TENANT_PREFIXES.find((candidate) => label.toLowerCase().startsWith(candidate));
  return stripped ? label.slice(stripped.length) : label;
}

/** The registrable-ish label of a careers host: `careers.acme.com` -> `acme`. */
function companyFromHost(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return "";
  let start = 0;
  while (start < labels.length - 2 && GENERIC_HOST_LABELS.has(labels[start])) {
    start += 1;
  }
  const rest = labels.slice(start);
  let end = rest.length - 1;
  if (end > 0 && SECOND_LEVEL_SUFFIXES.has(rest[end - 1])) end -= 1;
  return rest[end - 1] ?? "";
}

/** `acme-robotics` -> `Acme Robotics`; a numeric or empty token derives nothing. */
function humanizeToken(token: string): string {
  const cleaned = token.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || /^\d+$/.test(cleaned)) return "";
  return cleaned.replace(/(^|\s)([a-z])/g, (_match, space: string, letter: string) =>
    `${space}${letter.toUpperCase()}`,
  );
}

/**
 * Best-effort employer name from a posting URL. Returns an empty string when
 * nothing is derivable, so a bad guess never reaches a prompt or a folder name.
 */
export function deriveCompanyFromUrl(value: string): string {
  const url = httpUrl(value);
  if (!url) return "";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  for (const domain of BOARD_PATH_HOSTS) {
    if (hostMatches(host, domain)) return humanizeToken(boardTokenFromPath(url));
  }
  for (const domain of BOARD_TENANT_HOSTS) {
    if (hostMatches(host, domain)) return humanizeToken(tenantLabel(host, domain));
  }
  return humanizeToken(companyFromHost(host));
}

/** Hosts whose postings cannot be read automatically (no login/cookie handling). */
const UNSUPPORTED_SOURCE_HOSTS = ["linkedin.com", "indeed.com", "glassdoor.com"];

/**
 * True when the URL belongs to a site this app refuses to read. Matching is on
 * the hostname and its subdomains, so `notlinkedin.com` does not match.
 */
export function isUnsupportedSource(value: string): boolean {
  const url = httpUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return UNSUPPORTED_SOURCE_HOSTS.some((domain) => hostMatches(host, domain));
}

/**
 * Merge a fetched target into a job. With `replace` off (the default) a field
 * is written only when the current value is empty or whitespace-only, so a
 * mis-click cannot destroy text the user wrote. `sourceUrl` is always written
 * because it identifies which posting produced the current text.
 */
export function mergeTargetIntoJob(
  job: ProjectJob,
  target: FetchedTarget,
  options: { replace?: boolean } = {},
): ProjectJob {
  const replace = options.replace === true;
  const fill = (current: string, next: string): string => {
    if (!next.trim()) return current;
    return replace || !current.trim() ? next : current;
  };
  return {
    ...job,
    title: fill(job.title, target.title),
    company: fill(job.company, target.company),
    description: fill(job.description, target.description),
    sourceUrl: target.url,
  };
}

/** Non-blocking notes the caller shows next to a successful fetch. */
export function buildFetchWarnings(target: FetchedTarget): string[] {
  const warnings: string[] = [];
  if (!target.title.trim() && !target.company.trim()) {
    warnings.push(
      "The page returned no job title or company, so this project will use a generic name.",
    );
  }
  // A derived name is a guess from the URL, not something the posting said, so
  // say so before it becomes a project name the user never checks.
  if (target.company.trim() && target.companySource === "url") {
    warnings.push(
      "The company name came from the posting URL, not the page, so check it before relying on it.",
    );
  }
  return warnings;
}
