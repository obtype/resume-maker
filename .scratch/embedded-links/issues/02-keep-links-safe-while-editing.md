# 02: Keep links safe and intact while editing the preview

**What to build:** A CV author can click into a linked contact detail in the preview, select and retype its text without being navigated away, and have the link still be clickable afterwards. Clicking a link when not editing opens it in a new tab and leaves the preview on the CV.

**Blocked by:** 01.

**Status:** done

- [x] In editing mode, a click inside a link places the caret; it never navigates the preview and never opens a tab.
- [x] Outside editing mode, clicking a link opens the target in a new tab with `noopener`, and the preview document still shows the CV afterwards.
- [x] Editing the visible text of a linked field keeps the anchor and its target in the saved field HTML, so the field remains clickable after the edit.
- [x] Field text written back to the CV content remains the plain visible text — no markdown, no HTML — and the drift guard still falls back to plain text when the underlying value changes from elsewhere, such as a regenerated response.
- [x] The editing runtime's sanitizer accepts the same safe anchors as the render-time sanitizer and rejects unsafe schemes and unwanted attributes on them, so a captured edit cannot smuggle in a hostile href.
- [x] Formatting commands (bold, italic, underline, font size) still work on text inside a link.
- [x] `npm test`, `npm run build`, and `npm run smoke` pass, with the smoke flow still exercising an inline edit.

## Notes

- The runtime sanitizer now mirrors `resolveAnchorTarget` (absolute `http(s)`/`mailto` only), keeps a validated `href`, and unwraps an anchor whose target is missing or unsafe so it renders as plain text instead of a dead link. Both sanitizers now also sanitize the contents of unwrapped disallowed elements, which the previous walks skipped.
- In editing mode `body.cv-editing [data-field] a { pointer-events: none; }` lands the click in the field; the click handler still prevents default and, outside editing mode, opens the target with `window.open(..., "_blank", "noopener")`.
- The smoke test covers caret placement, link persistence after an inline edit, bold and font-size inside a link, popup behaviour with editing off and no `window.opener`, hostile `javascript:`/`onclick` input, plain-text degradation of unsafe anchors, the persisted plain text and saved HTML, and the exported PDF annotation staying on the original target.
