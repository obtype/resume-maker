import { describe, expect, it } from "vitest";
import {
  markdownToPlainText,
  renderCoverLetterPreview,
} from "../src/core/deliverables/preview";

describe("renderCoverLetterPreview", () => {
  it("returns an empty string for empty input", () => {
    expect(renderCoverLetterPreview("")).toBe("");
    expect(renderCoverLetterPreview(undefined)).toBe("");
    expect(renderCoverLetterPreview("   \n\n  ")).toBe("");
  });

  it("splits paragraphs on blank lines and keeps single newlines inside one", () => {
    expect(renderCoverLetterPreview("First paragraph.\nStill first.\n\nSecond.")).toBe(
      "<p>First paragraph.<br>Still first.</p><p>Second.</p>",
    );
  });

  it("renders bold and italic without leaking markers", () => {
    const html = renderCoverLetterPreview("A **strong** and *careful* letter.");
    expect(html).toBe("<p>A <strong>strong</strong> and <em>careful</em> letter.</p>");
    expect(html).not.toContain("**");
  });

  it("renders safe links as anchors with the resolved target", () => {
    const html = renderCoverLetterPreview(
      "See [the edge work](https://example.com/edge?x=1&amp;y=2) and [mail](mailto:hiring@example.com).",
    );
    expect(html).toContain(
      '<a href="https://example.com/edge?x=1&amp;y=2" target="_blank" rel="noreferrer noopener">the edge work</a>',
    );
    expect(html).toContain('href="mailto:hiring@example.com"');
  });

  it("renders unsafe schemes and relative targets as plain text", () => {
    const html = renderCoverLetterPreview(
      "[bad](javascript:alert) and [local](/somewhere) and [data](data:text/html,hi)",
    );
    expect(html).not.toContain("<a");
    expect(html).toContain("[bad](javascript:alert)");
    expect(html).toContain("[local](/somewhere)");
    expect(html).toContain("[data](data:text/html,hi)");
  });

  it("escapes raw model HTML instead of injecting it", () => {
    const html = renderCoverLetterPreview(
      'Hello <script>alert("x")</script><b onclick="evil()">bold?</b>',
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b onclick=&quot;evil()&quot;&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b ");
  });

  it("does not treat HTML-looking text inside a link label as markup", () => {
    const html = renderCoverLetterPreview("[<img src=x>](https://example.com)");
    expect(html).toContain("&lt;img src=x&gt;");
    expect(html).not.toContain("<img");
  });
});

describe("markdownToPlainText", () => {
  it("strips emphasis markers", () => {
    expect(markdownToPlainText("A **strong** and *careful* letter.")).toBe(
      "A strong and careful letter.",
    );
  });

  it("renders Markdown links as their label", () => {
    expect(
      markdownToPlainText("See [the edge work](https://example.com/edge) and [mail](mailto:a@b.test)."),
    ).toBe("See the edge work and mail.");
  });

  it("keeps line structure and handles empty input", () => {
    expect(markdownToPlainText("One\n\nTwo")).toBe("One\n\nTwo");
    expect(markdownToPlainText(undefined)).toBe("");
  });
});
