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
    return source
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<a\b([^>]*)>/gi, (_match, attributes: string) => {
        const href = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
        const target = href ? resolveAnchorTarget(href[2] ?? href[3] ?? href[4] ?? "") : null;
        return target ? `<a href="${target.replace(/"/g, "&quot;")}">` : "<a>";
      })
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "");
  }
  const doc = new DOMParser().parseFromString(source, "text/html");
  const walk = (node: Element): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      const tag = element.tagName.toUpperCase();
      if (tag === "SCRIPT" || tag === "STYLE") {
        element.remove();
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        while (element.firstChild) node.insertBefore(element.firstChild, element);
        element.remove();
        continue;
      }
      for (const attribute of Array.from(element.attributes)) {
        if (tag === "A" && attribute.name === "href") {
          const target = resolveAnchorTarget(attribute.value);
          if (target) element.setAttribute("href", target);
          else element.removeAttribute("href");
        } else if (tag === "SPAN" && attribute.name === "style") {
          const match = attribute.value.trim().match(/^font-size\s*:\s*([\d.]+pt);?$/i);
          if (match) element.setAttribute("style", `font-size: ${match[1]}pt`);
          else element.removeAttribute("style");
        } else {
          element.removeAttribute(attribute.name);
        }
      }
      walk(element);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
