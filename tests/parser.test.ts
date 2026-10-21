import { describe, expect, it } from "vitest";
import { extractJson, parseLlmResponse } from "../src/core/llm/parseResponse";

describe("LLM response parsing", () => {
  it("parses a plain JSON object", () => {
    const result = parseLlmResponse('{"ok": true}');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true });
  });

  it("strips markdown fences", () => {
    const result = parseLlmResponse('Sure, here you go:\n```json\n{"ok": true}\n```\nHope this helps!');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ ok: true });
  });

  it("extracts an object surrounded by prose", () => {
    const extracted = extractJson('Here is the CV: {"name": "A {B} C", "nested": {"x": 1}} Thanks.');
    expect(JSON.parse(extracted)).toEqual({ name: "A {B} C", nested: { x: 1 } });
  });

  it("repairs trailing commas", () => {
    const result = parseLlmResponse('{"name": "Alex", "items": [1, 2,],}');
    expect(result.ok).toBe(true);
    expect(result.repaired).toBe(true);
    expect(result.data).toEqual({ name: "Alex", items: [1, 2] });
  });

  it("returns a helpful error for unparseable text", () => {
    const result = parseLlmResponse("not json at all");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
