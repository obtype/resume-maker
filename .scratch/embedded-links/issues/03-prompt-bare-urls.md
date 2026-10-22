# 03: Ask the model for bare URLs in the prompt template

**What to build:** The canonical prompt template tells the model to write URLs as bare URLs rather than markdown links, and to put one contact detail per entry, so future responses arrive in the cleanest form the renderer accepts.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] The canonical prompt template includes a rule that URLs are written bare — no markdown link syntax — and that each contact detail is its own entry.
- [x] The rule sits with the existing "JSON only / no invented facts" writing rules rather than in a new section of its own.
- [x] The prompt test asserts the rule is present, alongside the existing placeholder assertions.
- [x] Existing workspace prompt overrides are unaffected, and the renderer still tolerates markdown links when they appear.
- [x] `npm test` passes.

## Notes

- Added rule 13 to the existing `# ABSOLUTE RULES` block. `PROMPT_VERSION` bumped to `2026-10-22.1`.
