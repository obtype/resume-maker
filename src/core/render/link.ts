import { esc, nl2br } from "./escape";

/** Matches a markdown link: [label](target). */
const MARKDOWN_LINK = /\[([^\]\n]+)\]\(\s*([^()\s]+)\s*\)/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const ABSOLUTE_URL = /https?:\/\/[^\s<>"']+/i;
const WWW_ADDRESS = /(?<![A-Za-z0-9.@/_-])www\.[^\s<>"']+/i;
const DOMAIN_WITHOUT_SCHEME =
  /(?<![A-Za-z0-9@._/-])[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?:\/[^\s<>"']*)?/;

/** Punctuation that belongs to the sentence rather than to a bare address. */
const TRAILING_PUNCTUATION = /[.,;:!?)'"\]}]+$/;

/** A scheme-less string ending like a file is a path, not a domain. */
const FILE_EXTENSION = /\.(?:html?|xhtml|php|pdf|png|jpe?g|gif|svg|css|js|json|txt|docx?|xlsx?|pptx?)$/i;

/** Hosts that only wrap another URL in a query parameter. */
const REDIRECT_HOSTNAME = /(^|\.)google\.[a-z.]+$/i;
const REDIRECT_PATH = /^\/(search|url)$/;

export interface LinkifyOptions {
  /** Whether a domain without a scheme counts as a link. Prose often mentions such words. */
  allowBareDomain?: boolean;
}

interface Segment {
  index: number;
  text: string;
  html: string;
}

interface Rule {
  pattern: RegExp;
  /** How the matched text renders, and which characters it consumes. */
  render: (match: RegExpExecArray) => { text: string; html: string };
  enabled?: (options: LinkifyOptions) => boolean;
}

function withScheme(value: string): string | null {
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  if (value.startsWith("//")) return null;
  if (FILE_EXTENSION.test(value)) return null;
  return `https://${value}`;
}

function withoutSentencePunctuation(value: string): string {
  return value.replace(TRAILING_PUNCTUATION, "");
}

function unwrapRedirect(value: string): string | null {
  const absolute = withScheme(value);
  if (!absolute) return null;
  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    return null;
  }
  if (!REDIRECT_HOSTNAME.test(url.hostname)) return null;
  if (!REDIRECT_PATH.test(url.pathname)) return null;
  return url.searchParams.get("q") ?? url.searchParams.get("url");
}

/** Accepts only targets that are absolute and already carry an accepted scheme. */
export function resolveAnchorTarget(value: string): string | null {
  const raw = String(value ?? "").trim();
  if (!/^(https?:|mailto:)/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

/** A label that is itself a domain is a usable target when the link's own target is not. */
function fallbackFromLabel(label: string): string | null {
  const trimmed = label.trim();
  if (!/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?:\/[^\s<>"']*)?$/.test(trimmed)) {
    return null;
  }
  return resolveLinkTarget(`https://${trimmed}`);
}

/**
 * Resolves the destination a link in field text points at, or null when the
 * text is not a usable target. Redirect wrappers are unwrapped, and only
 * http(s) and mailto destinations are accepted.
 */
export function resolveLinkTarget(value: string, label = ""): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return fallbackFromLabel(label);

  const candidate = unwrapRedirect(raw) ?? raw;
  const absolute = withScheme(candidate);
  if (!absolute) return fallbackFromLabel(label);
  return resolveAnchorTarget(absolute) ?? fallbackFromLabel(label);
}

function anchor(target: string, label: string): string {
  return `<a href="${esc(target)}">${nl2br(label)}</a>`;
}

const RULES: Rule[] = [
  {
    pattern: MARKDOWN_LINK,
    render: (match) => {
      const label = match[1].trim();
      const target = resolveLinkTarget(match[2], label);
      return { text: match[0], html: target ? anchor(target, label) : nl2br(match[0]) };
    },
  },
  {
    pattern: EMAIL,
    render: (match) => ({ text: match[0], html: anchor(`mailto:${match[0]}`, match[0]) }),
  },
  {
    pattern: ABSOLUTE_URL,
    render: (match) => {
      const text = withoutSentencePunctuation(match[0]);
      const target = resolveLinkTarget(text);
      return { text, html: target ? anchor(target, text) : nl2br(text) };
    },
  },
  {
    pattern: WWW_ADDRESS,
    render: (match) => {
      const text = withoutSentencePunctuation(match[0]);
      return { text, html: anchor(`https://${text}`, text) };
    },
  },
  {
    pattern: DOMAIN_WITHOUT_SCHEME,
    enabled: (options) => Boolean(options.allowBareDomain),
    render: (match) => {
      const text = withoutSentencePunctuation(match[0]);
      return { text, html: anchor(`https://${text}`, text) };
    },
  },
];

/** The earliest rule match, with earlier rules winning ties at the same index. */
function firstMatch(rest: string, options: LinkifyOptions): Segment | null {
  let best: Segment | null = null;
  for (const rule of RULES) {
    if (rule.enabled && !rule.enabled(options)) continue;
    const match = rule.pattern.exec(rest);
    if (!match) continue;
    if (best && match.index >= best.index) continue;
    const { text, html } = rule.render(match);
    best = { index: match.index, text, html };
  }
  return best;
}

/** Renders field text as escaped HTML, turning recognised links into anchors. */
export function linkifyText(value: unknown, options: LinkifyOptions = {}): string {
  const source = String(value ?? "");
  let html = "";
  let rest = source;

  while (rest) {
    const match = firstMatch(rest, options);
    if (!match) {
      html += nl2br(rest);
      break;
    }
    html += nl2br(rest.slice(0, match.index));
    html += match.html;
    rest = rest.slice(match.index + match.text.length);
  }

  return html;
}
