import { describe, expect, it } from "vitest";
import { createEmptyCv } from "../src/core/cv/schema";
import { sampleCv } from "../src/core/cv/sample";
import {
  missingDeliverableIds,
  selectMissingDeliverables,
  toggleDeliverableSelection,
} from "../src/core/deliverables/selection";
import type { DeliverableContentSource } from "../src/core/deliverables/types";

const emptyCv = createEmptyCv("classic");

function source(
  overrides: Partial<DeliverableContentSource> = {},
): DeliverableContentSource {
  return { cv: emptyCv, ...overrides };
}

describe("deliverable selection toggling", () => {
  it("adds a deliverable in canonical order", () => {
    expect(toggleDeliverableSelection(["cv"], "coverLetter", true)).toEqual([
      "cv",
      "coverLetter",
    ]);
    expect(
      toggleDeliverableSelection(["linkedinMessage", "coverLetter"], "cv", true),
    ).toEqual(["cv", "coverLetter", "linkedinMessage"]);
  });

  it("removes a deliverable when more than one is selected", () => {
    expect(
      toggleDeliverableSelection(["cv", "coverLetter"], "cv", false),
    ).toEqual(["coverLetter"]);
  });

  it("never unchecks the last selected deliverable", () => {
    expect(toggleDeliverableSelection(["cv"], "cv", false)).toEqual(["cv"]);
    expect(
      toggleDeliverableSelection(["coverLetter"], "coverLetter", false),
    ).toEqual(["coverLetter"]);
  });

  it("normalizes duplicates, unknown ids, and an empty selection", () => {
    expect(
      toggleDeliverableSelection(
        ["coverLetter", "coverLetter"],
        "coldEmail",
        true,
      ),
    ).toEqual(["coverLetter", "coldEmail"]);
    expect(toggleDeliverableSelection([], "cv", false)).toEqual(["cv"]);
  });
});

describe("select missing deliverables", () => {
  it("lists every deliverable when nothing has content", () => {
    expect(missingDeliverableIds(source())).toEqual([
      "cv",
      "coverLetter",
      "coldEmail",
      "linkedinMessage",
    ]);
  });

  it("excludes the CV once it has real content", () => {
    expect(missingDeliverableIds(source({ cv: sampleCv("classic") }))).toEqual([
      "coverLetter",
      "coldEmail",
      "linkedinMessage",
    ]);
  });

  it("excludes messages that have content", () => {
    const withMessages = source({
      artifacts: {
        coverLetter: "Dear hiring manager,",
        coldEmail: { subject: "Hello", body: "" },
        linkedinMessage: "   ",
      },
    });
    expect(missingDeliverableIds(withMessages)).toEqual([
      "cv",
      "linkedinMessage",
    ]);
  });

  it("selects exactly the missing deliverables, ignoring the current selection", () => {
    const partiallyGenerated = source({
      artifacts: { coverLetter: "Dear hiring manager," },
    });
    expect(
      selectMissingDeliverables(partiallyGenerated, ["coverLetter"]),
    ).toEqual(["cv", "coldEmail", "linkedinMessage"]);
  });

  it("keeps the current selection when everything already has content", () => {
    const complete = source({
      cv: sampleCv("classic"),
      artifacts: {
        coverLetter: "Dear hiring manager,",
        coldEmail: { subject: "Hello", body: "Short note." },
        linkedinMessage: "Thanks for connecting.",
      },
    });
    expect(missingDeliverableIds(complete)).toEqual([]);
    expect(
      selectMissingDeliverables(complete, ["coverLetter", "linkedinMessage"]),
    ).toEqual(["coverLetter", "linkedinMessage"]);
    expect(selectMissingDeliverables(complete, [])).toEqual(["cv"]);
  });
});
