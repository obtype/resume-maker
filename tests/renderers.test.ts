import { describe, expect, it } from "vitest";
import { RENDERERS } from "../src/renderers/registry";
import { checkRenderer } from "../src/core/render/validateRenderer";
import { sampleCv } from "../src/core/cv/sample";
import { createRenderContext } from "../src/core/render/context";
import { sanitizeSavedHtml } from "../src/core/render/sanitize";
import { defaultStyle } from "../src/core/style";

describe("renderer contract", () => {
  for (const renderer of RENDERERS) {
    it(`passes conformance checks for ${renderer.meta.id}`, () => {
      const results = checkRenderer(renderer);
      const errors = results.filter((result) => result.level === "error");
      expect(errors, errors.map((error) => error.message).join("\n")).toEqual([]);
    });

    it(`escapes model text in ${renderer.meta.id}`, () => {
      const schemaId = renderer.meta.schemas[0];
      const html = renderer.render(sampleCv(schemaId), createRenderContext(defaultStyle()));
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
    });

    it(`exposes editable fields in ${renderer.meta.id}`, () => {
      const schemaId = renderer.meta.schemas[0];
      const html = renderer.render(sampleCv(schemaId), createRenderContext(defaultStyle()));
      expect(html).toContain('data-field="basics.name"');
      expect(html).toContain("data-cv-page");
    });
  }

  it("sanitizes legacy rich HTML before rendering", () => {
    const cleaned = sanitizeSavedHtml(
      '<b onclick="steal()">Bold</b><script>alert(1)</script><img src=x onerror=alert(2)>',
    );
    expect(cleaned).toContain("<b>Bold</b>");
    expect(cleaned).not.toContain("<script");
    expect(cleaned).not.toContain("onclick");
    expect(cleaned).not.toContain("onerror");
  });
});
