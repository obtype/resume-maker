import { describe, expect, it } from "vitest";
import { RENDERERS } from "../src/renderers/registry";
import { buildPreviewDoc, buildPrintDoc } from "../src/core/render/previewDoc";
import { sampleCv } from "../src/core/cv/sample";
import { defaultStyle } from "../src/core/style";
import { sanitizeSavedHtml } from "../src/core/render/sanitize";
import type { CvContent, RendererModule } from "../src/core/cv/types";

const PROFILE_LINK =
  "[github.com/example](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fexample)";
const PROFILE_TARGET = "https://github.com/example";

function printDoc(cv: CvContent, renderer: RendererModule): string {
  return buildPrintDoc({ renderer, cv, style: defaultStyle(), title: "CV" });
}

function previewDoc(cv: CvContent, renderer: RendererModule): string {
  return buildPreviewDoc({ renderer, cv, style: defaultStyle(), title: "CV", editing: false });
}

function cvWith(contact: string[], renderer: RendererModule): CvContent {
  const cv = sampleCv(renderer.meta.schemas[0]);
  cv.basics.contact = contact;
  return cv;
}

describe("embedded links", () => {
  it("renders a markdown contact link as an anchor pointing at the unwrapped target", () => {
    for (const renderer of RENDERERS) {
      const html = printDoc(cvWith(["candidate@example.com", PROFILE_LINK], renderer), renderer);

      expect(html, renderer.meta.id).toContain(
        `<a href="${PROFILE_TARGET}">github.com/example</a>`,
      );
      expect(html, renderer.meta.id).not.toContain("google.com/search");
      expect(html, renderer.meta.id).not.toContain("[github.com/example]");
    }
  });

  it("renders the same anchors in the preview document as in the print document", () => {
    const renderer = RENDERERS[0];
    const cv = cvWith(["candidate@example.com", PROFILE_LINK], renderer);

    const print = printDoc(cv, renderer);
    const preview = previewDoc(cv, renderer);

    expect(print).toContain(`<a href="${PROFILE_TARGET}">github.com/example</a>`);
    expect(preview).toContain(`<a href="${PROFILE_TARGET}">github.com/example</a>`);
  });

  it("links bare domains in contact details, emails as mailto, and excludes trailing punctuation", () => {
    for (const renderer of RENDERERS) {
      const html = printDoc(
        cvWith(
          ["github.com/example", "candidate@example.com", "See https://example.com/notes."],
          renderer,
        ),
        renderer,
      );

      expect(html, renderer.meta.id).toContain(
        '<a href="https://github.com/example">github.com/example</a>',
      );
      expect(html, renderer.meta.id).toContain(
        '<a href="mailto:candidate@example.com">candidate@example.com</a>',
      );
      expect(html, renderer.meta.id).toContain(
        '<a href="https://example.com/notes">https://example.com/notes</a>.',
      );
    }
  });

  it("links markdown in any field but leaves bare domains in prose alone", () => {
    const renderer = RENDERERS[0];
    const cv = sampleCv(renderer.meta.schemas[0]);
    cv.basics.headline = "Engineer at github.com, see [my work](https://example.com/work)";

    const html = printDoc(cv, renderer);

    expect(html).not.toContain('<a href="https://github.com">github.com</a>');
    expect(html).toContain('<a href="https://example.com/work">my work</a>');
  });

  it("refuses unsafe targets and falls back to a domain-shaped label", () => {
    const renderer = RENDERERS[0];
    const html = printDoc(
      cvWith(
        [
          "[click](javascript:alert)",
          "[github.com/example](javascript:alert)",
          "[data](data:text/html,hi)",
          "[file](file:///etc/passwd)",
          "[rel](//evil.example/path)",
          "candidate@example.com",
        ],
        renderer,
      ),
      renderer,
    );

    expect(html).not.toContain('href="javascript');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('href="file:');
    expect(html).not.toContain('href="//evil');
    expect(html).toContain('<a href="https://github.com/example">github.com/example</a>');
    expect(html).toContain(
      '<a href="mailto:candidate@example.com">candidate@example.com</a>',
    );
  });

  it("keeps safe anchors in saved field html and strips unsafe ones", () => {
    const safe = sanitizeSavedHtml(
      '<a href="https://github.com/example" target="_blank" rel="noopener" onclick="steal()">github.com/example</a>',
    );
    expect(safe).toBe('<a href="https://github.com/example">github.com/example</a>');

    const unsafe = sanitizeSavedHtml('<a href="javascript:alert(1)">click</a>');
    expect(unsafe).not.toContain("href=");
    expect(unsafe).toContain("click");

    const relative = sanitizeSavedHtml('<a href="notes.html">notes</a>');
    expect(relative).not.toContain("href=");
    expect(relative).toContain("notes");
  });
});
