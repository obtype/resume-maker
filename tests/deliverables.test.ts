import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import { createEmptyCv, getSchema } from "../src/core/cv/schema";
import { sampleCv } from "../src/core/cv/sample";
import {
  buildEnvelopeSchema,
  createDefaultDeliverableSelection,
  createEmptyRecipient,
  deliverableHasContent,
  deliverableLabel,
  deliverableTemplateFile,
  isDeliverableId,
  MESSAGE_DELIVERABLES,
} from "../src/core/deliverables/schema";
import {
  normalizeColdEmail,
  normalizeCoverLetter,
  normalizeDeliverableSelection,
  normalizeLinkedinMessage,
  normalizeSelection,
  splitResponseForSelection,
} from "../src/core/deliverables/normalize";
import {
  validateColdEmail,
  validateCoverLetter,
  validateLinkedinMessage,
  validateMessageDeliverable,
} from "../src/core/deliverables/validate";

const cvSchema = getSchema("classic").jsonSchema;

describe("deliverable selection", () => {
  it("keeps known ids, removes duplicates, and uses the canonical order", () => {
    expect(
      normalizeSelection([
        "linkedinMessage",
        "coverLetter",
        "coverLetter",
        "bogus",
      ]),
    ).toEqual(["coverLetter", "linkedinMessage"]);
  });

  it("falls back to CV for a missing, empty, or unknown selection", () => {
    expect(normalizeSelection(undefined)).toEqual(["cv"]);
    expect(normalizeSelection([])).toEqual(["cv"]);
    expect(normalizeSelection(["bogus"])).toEqual(["cv"]);
    expect(normalizeSelection("cv")).toEqual(["cv"]);
  });

  it("fills default settings and recipients", () => {
    const selection = normalizeDeliverableSelection(undefined);
    expect(selection.selected).toEqual(["cv"]);
    expect(selection.settings.cv).toEqual({ instructions: "" });
    expect(selection.settings.coverLetter).toEqual({ instructions: "" });
    expect(selection.settings.coldEmail.recipient).toEqual(createEmptyRecipient());
    expect(selection.settings.linkedinMessage.recipient).toEqual(
      createEmptyRecipient(),
    );
  });

  it("preserves instructions and recipient fields", () => {
    const selection = normalizeDeliverableSelection({
      selected: ["coldEmail"],
      settings: {
        coldEmail: {
          instructions: " Keep it short. ",
          recipient: { name: " Sam ", about: "Builds things." },
        },
        coverLetter: {
          instructions: "Warm.",
          recipient: { name: "Ignored" },
        },
      },
    });

    expect(selection.selected).toEqual(["coldEmail"]);
    expect(selection.settings.coldEmail.instructions).toBe(" Keep it short. ");
    expect(selection.settings.coldEmail.recipient?.name).toBe("Sam");
    expect(selection.settings.coldEmail.recipient?.about).toBe("Builds things.");
    expect(selection.settings.coverLetter.recipient).toBeUndefined();
  });

  it("creates a CV-first default selection", () => {
    const selection = createDefaultDeliverableSelection();
    expect(selection.selected).toEqual(["cv"]);
    expect(selection.settings.coldEmail.recipient).toEqual(createEmptyRecipient());
  });

  it("labels and maps the deliverable templates", () => {
    expect(deliverableLabel("coverLetter")).toBe("Cover letter");
    expect(deliverableTemplateFile("coverLetter")).toBe("cover-letter.md");
    expect(deliverableTemplateFile("cv")).toBe("cv.md");
    expect(isDeliverableId("coldEmail")).toBe(true);
    expect(isDeliverableId("cover_letter")).toBe(false);
  });
});

describe("deliverable content detection", () => {
  it("does not treat the placeholder CV as content", () => {
    const empty = createEmptyCv("classic");
    expect(deliverableHasContent({ cv: empty }, "cv")).toBe(false);
  });

  it("treats a real CV section as content", () => {
    const empty = createEmptyCv("classic");
    const withExperience = {
      ...empty,
      experience: [
        {
          role: "Engineer",
          dates: "2024",
          org: "Acme",
          bullets: ["Built things."],
        },
      ],
    };
    expect(deliverableHasContent({ cv: withExperience }, "cv")).toBe(true);

    const withSummary = { ...empty, summary: "A short profile." };
    expect(deliverableHasContent({ cv: withSummary }, "cv")).toBe(true);
  });

  it("detects message content and ignores whitespace", () => {
    const empty = createEmptyCv("classic");
    expect(
      deliverableHasContent(
        { cv: empty, artifacts: { coverLetter: "  \n " } },
        "coverLetter",
      ),
    ).toBe(false);
    expect(
      deliverableHasContent(
        { cv: empty, artifacts: { coverLetter: "Dear hiring manager," } },
        "coverLetter",
      ),
    ).toBe(true);
    expect(
      deliverableHasContent(
        { cv: empty, artifacts: { coldEmail: { subject: "Hi", body: "" } } },
        "coldEmail",
      ),
    ).toBe(true);
    expect(
      deliverableHasContent(
        { cv: empty, artifacts: { coldEmail: { subject: "", body: "" } } },
        "coldEmail",
      ),
    ).toBe(false);
    expect(
      deliverableHasContent(
        { cv: empty, artifacts: { linkedinMessage: "Thanks for connecting." } },
        "linkedinMessage",
      ),
    ).toBe(true);
  });
});

describe("response splitting", () => {
  const bareCv = sampleCv("classic");

  it("treats a CV-only bare object as the CV", () => {
    const result = splitResponseForSelection(bareCv, ["cv"]);
    expect(result.parts.cv).toBe(bareCv);
    expect(result.missing).toEqual([]);
    expect(result.unrequested).toEqual([]);
    expect(result.bareCv).toBe(true);
  });

  it("accepts a CV-only envelope", () => {
    const result = splitResponseForSelection({ cv: bareCv }, ["cv"]);
    expect(result.parts.cv).toBe(bareCv);
    expect(result.bareCv).toBe(false);
  });

  it("reports unrequested envelope keys", () => {
    const result = splitResponseForSelection(
      { cv: bareCv, coverLetter: "Hello" },
      ["cv"],
    );
    expect(result.parts.cv).toBe(bareCv);
    expect(result.unrequested).toEqual(["coverLetter"]);
  });

  it("extracts selected envelope keys and reports missing ones", () => {
    const result = splitResponseForSelection(
      { coverLetter: "Hello" },
      ["cv", "coverLetter"],
    );
    expect(result.parts.coverLetter).toBe("Hello");
    expect(result.parts.cv).toBeUndefined();
    expect(result.missing).toEqual(["cv"]);
    expect(result.unrequested).toEqual([]);
  });

  it("accepts a bare CV for a multi-deliverable request when CV was requested", () => {
    const result = splitResponseForSelection(bareCv, ["cv", "coverLetter"]);
    expect(result.parts.cv).toBe(bareCv);
    expect(result.missing).toEqual(["coverLetter"]);
  });

  it("reports a bare CV as unrequested when CV was not requested", () => {
    const result = splitResponseForSelection(bareCv, ["coverLetter"]);
    expect(result.parts.coverLetter).toBeUndefined();
    expect(result.missing).toEqual(["coverLetter"]);
    expect(result.unrequested).toEqual(["cv"]);
  });

  it("handles primitives, nulls, and empty objects", () => {
    expect(
      splitResponseForSelection("not json", ["cv", "coldEmail"]).missing,
    ).toEqual(["cv", "coldEmail"]);
    expect(
      splitResponseForSelection({ cv: null, coldEmail: {} }, [
        "cv",
        "coldEmail",
      ]),
    ).toMatchObject({
      parts: { coldEmail: {} },
      missing: ["cv"],
    });
    expect(splitResponseForSelection({}, ["cv"]).missing).toEqual(["cv"]);
  });

  it("keeps unrequested keys in canonical order", () => {
    const result = splitResponseForSelection(
      {
        cv: bareCv,
        coverLetter: "Hello",
        coldEmail: { subject: "Hi", body: "There" },
        linkedinMessage: "Thanks",
      },
      ["coverLetter"],
    );
    expect(result.parts.coverLetter).toBe("Hello");
    expect(result.unrequested).toEqual(["cv", "coldEmail", "linkedinMessage"]);
  });
});

describe("envelope schema", () => {
  it("contains only the requested keys, CV first", () => {
    const schema = buildEnvelopeSchema(["coverLetter", "cv"], cvSchema);
    expect(schema.required).toEqual(["cv", "coverLetter"]);
    expect(Object.keys(schema.properties as Record<string, unknown>)).toEqual([
      "cv",
      "coverLetter",
    ]);
    expect(schema.additionalProperties).toBe(false);
    expect(
      (schema.properties as Record<string, unknown>).coverLetter,
    ).toBe(MESSAGE_DELIVERABLES.coverLetter.jsonSchema);
  });

  it("works without a CV", () => {
    const schema = buildEnvelopeSchema(["coldEmail"], cvSchema);
    expect(schema.required).toEqual(["coldEmail"]);
    expect(Object.keys(schema.properties as Record<string, unknown>)).toEqual([
      "coldEmail",
    ]);
  });

  it("rejects an empty selection", () => {
    expect(() => buildEnvelopeSchema([], cvSchema)).toThrow();
  });

  it("validates a representative envelope", () => {
    const schema = buildEnvelopeSchema(["cv", "coverLetter"], cvSchema);
    const validate = new Ajv({ strict: false }).compile(schema);
    const valid = validate({
      cv: sampleCv("classic"),
      coverLetter: "Dear hiring manager,",
    });
    expect(valid).toBe(true);
    expect(validate({ cv: sampleCv("classic") })).toBe(false);
    expect(
      validate({
        cv: sampleCv("classic"),
        coverLetter: "Dear hiring manager,",
        coldEmail: { subject: "Hi", body: "There" },
      }),
    ).toBe(false);
  });
});

describe("message normalization", () => {
  it("trims text and rejects non-strings", () => {
    expect(normalizeCoverLetter("  Hello  ")).toBe("Hello");
    expect(normalizeCoverLetter(42)).toBe("");
    expect(normalizeLinkedinMessage("  Thanks  ")).toBe("Thanks");
    expect(normalizeLinkedinMessage(null)).toBe("");
  });

  it("repairs double-escaped newlines in message prose", () => {
    expect(normalizeCoverLetter("Dear team,\\n\\nBody")).toBe(
      "Dear team,\n\nBody",
    );
    expect(normalizeLinkedinMessage("Hello,\\r\\nThanks")).toBe(
      "Hello,\nThanks",
    );
    expect(normalizeColdEmail({ subject: "Hi", body: "One\\nTwo" })).toEqual({
      subject: "Hi",
      body: "One\nTwo",
    });
  });

  it("trims cold email fields and drops unknown fields", () => {
    expect(
      normalizeColdEmail({
        subject: " Hi ",
        body: " There ",
        extra: "ignored",
      }),
    ).toEqual({ subject: "Hi", body: "There" });
    expect(normalizeColdEmail("Hello")).toEqual({ subject: "", body: "Hello" });
    expect(normalizeColdEmail(null)).toEqual({ subject: "", body: "" });
  });
});

describe("message validation", () => {
  it("accepts a normal cover letter with no warnings", () => {
    const result = validateCoverLetter("A".repeat(1000));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("warns on short and long cover letters", () => {
    expect(validateCoverLetter("A".repeat(700)).warnings).toHaveLength(1);
    expect(validateCoverLetter("A".repeat(5500)).warnings).toHaveLength(1);
  });

  it("rejects empty, non-string, and over-limit cover letters", () => {
    expect(validateCoverLetter("").valid).toBe(false);
    expect(validateCoverLetter(42).valid).toBe(false);
    expect(validateCoverLetter("A".repeat(6001)).valid).toBe(false);
  });

  it("accepts a normal cold email", () => {
    const result = validateColdEmail({
      subject: "Hello",
      body: "B".repeat(500),
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("requires a subject and a body", () => {
    const noSubject = validateColdEmail({ body: "B".repeat(500) });
    expect(noSubject.valid).toBe(false);
    expect(noSubject.errors.some((issue) => issue.path === "subject")).toBe(true);

    const noBody = validateColdEmail({ subject: "Hello", body: "" });
    expect(noBody.valid).toBe(false);
    expect(noBody.errors.some((issue) => issue.path === "body")).toBe(true);
  });

  it("warns on a long subject and a short or long body", () => {
    const subject = validateColdEmail({
      subject: "S".repeat(120),
      body: "B".repeat(500),
    });
    expect(subject.valid).toBe(true);
    expect(subject.warnings.some((issue) => issue.path === "subject")).toBe(true);

    const body = validateColdEmail({
      subject: "Hello",
      body: "B".repeat(200),
    });
    expect(body.valid).toBe(true);
    expect(body.warnings.some((issue) => issue.path === "body")).toBe(true);

    const longBody = validateColdEmail({
      subject: "Hello",
      body: "B".repeat(2600),
    });
    expect(longBody.valid).toBe(true);
    expect(longBody.warnings.some((issue) => issue.path === "body")).toBe(true);
  });

  it("rejects over-limit cold email fields", () => {
    expect(
      validateColdEmail({ subject: "S".repeat(161), body: "B".repeat(500) })
        .valid,
    ).toBe(false);
    expect(
      validateColdEmail({ subject: "Hello", body: "B".repeat(4001) }).valid,
    ).toBe(false);
  });

  it("accepts a normal LinkedIn message", () => {
    const result = validateLinkedinMessage("A".repeat(500));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("warns when a LinkedIn message looks like a connection note", () => {
    const result = validateLinkedinMessage("A".repeat(250));
    expect(result.valid).toBe(true);
    expect(result.warnings[0]?.message).toContain("connection note");
  });

  it("warns on a long LinkedIn message and rejects an over-limit one", () => {
    expect(validateLinkedinMessage("A".repeat(1300)).warnings).toHaveLength(1);
    expect(validateLinkedinMessage("A".repeat(2001)).valid).toBe(false);
  });

  it("dispatches to the right validator", () => {
    const result = validateMessageDeliverable("coldEmail", {
      subject: "Hello",
      body: "B".repeat(500),
    });
    expect(result.id).toBe("coldEmail");
    expect(result.validation.valid).toBe(true);
  });
});
