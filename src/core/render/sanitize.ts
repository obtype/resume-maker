import { resolveAnchorTarget } from "./link";

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "SPAN", "DIV", "P", "A"]);

/**
 * Sanitizes rich text that is about to be injected by a renderer. The editing
 * runtime already sanitizes input, but this also protects old cv-studio JSON
 * and any hand-edited style data.
 */
export function sanitizeSavedHtml(html: string): string {
  const source = String(html ?? "");
  if (!source) return "";
  if (typeof DOMParser === "undefined") {
    return sanitizeWithoutDom(source);
  }
  const doc = new DOMParser().parseFromString(source, "text/html");

  const unwrap = (element: Element, parent: Node): void => {
    while (element.firstChild) {
      const moved = element.firstChild;
      parent.insertBefore(moved, element);
      if (moved.nodeType === 1) cleanElement(moved as Element, parent);
    }
    element.remove();
  };

  const cleanElement = (element: Element, parent: Node): void => {
    const tag = element.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE") {
      element.remove();
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      unwrap(element, parent);
      return;
    }
    if (tag === "A") {
      const target = resolveAnchorTarget(element.getAttribute("href") ?? "");
      if (!target) {
        // An unsafe or missing target renders as plain text, not a dead link.
        unwrap(element, parent);
        return;
      }
      for (const attribute of Array.from(element.attributes)) {
        element.removeAttribute(attribute.name);
      }
      element.setAttribute("href", target);
    } else {
      for (const attribute of Array.from(element.attributes)) {
        if (tag === "SPAN" && attribute.name === "style") {
          const match = attribute.value.trim().match(/^font-size\s*:\s*([\d.]+pt);?$/i);
          if (match) element.setAttribute("style", `font-size: ${match[1]}pt`);
          else element.removeAttribute("style");
        } else {
          element.removeAttribute(attribute.name);
        }
      }
    }
    cleanChildren(element);
  };

  const cleanChildren = (parent: Node): void => {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType !== 1) continue;
      cleanElement(child as Element, parent);
    }
  };

  cleanChildren(doc.body);
  return doc.body.innerHTML;
}

/**
 * DOM-free fallback for unit tests and non-browser hosts. It handles the
 * formatting allowlist's anchor rule and event handlers, but it is not a
 * general-purpose HTML parser.
 */
function sanitizeWithoutDom(source: string): string {
  let html = source
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const safe: string[] = [];
  html = html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, attributes: string, content: string) => {
      const href = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
      const target = href ? resolveAnchorTarget(href[2] ?? href[3] ?? href[4] ?? "") : null;
      if (!target) return content;
      safe.push(`<a href="${target.replace(/"/g, "&quot;")}">${content}</a>`);
      return `\u0000A${safe.length - 1}\u0000`;
    },
  );
  // Anything left after pairing is malformed or unsafe: drop the tag.
  html = html.replace(/<a\b[^>]*>/gi, "").replace(/<\/a>/gi, "");
  html = html.replace(/\u0000A(\d+)\u0000/g, (_match, index: string) => safe[Number(index)] ?? "");
  return html
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}
