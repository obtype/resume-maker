import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateCv } from "../src/core/cv/validate";

function example(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));
}

describe("bundled examples", () => {
  it("validates the classic example", () => {
    const result = validateCv(example("cv.classic.example.json"), "classic");
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("validates the impact example", () => {
    const result = validateCv(example("cv.impact.example.json"), "impact");
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
