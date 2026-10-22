# 01: Render recognised links as anchors in preview and PDF

**What to build:** A CV whose contact detail or prose contains a markdown link, a bare URL, a bare domain, or an email address renders that entry as readable, clickable text in both the preview and the exported PDF. Redirect wrappers are unwrapped, unsafe targets are refused, and renderers themselves are untouched.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] A contact detail written as `[github.com/example](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fexample)` renders as an anchor whose visible text is `github.com/example` and whose target is `https://github.com/example`; the literal bracket syntax does not appear in the document.
- [x] An explicit markdown link in any field — summary, project blurb, bullet — renders the same way, so the behaviour is not contact-specific.
- [x] Bare `https://` URLs and `www.` addresses are linked in every field; bare domains without a scheme are linked in contact details only.
- [x] Email addresses become `mailto:` targets in every field; phone numbers stay plain text.
- [x] `javascript:`, `data:`, `file:`, and protocol-relative targets are never emitted as anchors; the entry renders as plain text and one bad entry does not affect its siblings.
- [x] A markdown target that is rejected still resolves from a domain-shaped label when possible, and otherwise stays plain text.
- [x] Trailing punctuation next to a bare URL is excluded from the target.
- [x] The preview document and the print document produce identical anchors, with no runtime required in the print document.
- [x] Anchor styling lives in the shared base stylesheet: inherited colour, thin underline, no change to weight or size, and no `target`/`rel` attributes on the element.
- [x] The render-time sanitizer keeps a safe anchor and its `href` while stripping `javascript:`, `onclick`, and every other attribute; saved field HTML that predates this feature continues to render.
- [x] Both registered renderers show links without any renderer change; the unit suite passes for each.
- [x] New unit tests assert through the document builder: anchor presence, visible label, absolute target, and the absence of the raw markdown string. Sanitizer assertions follow the existing legacy-HTML test.
- [x] The smoke test's injected profile includes a markdown link with a redirect wrapper, and after export the PDF bytes contain a URI annotation for the unwrapped target while the raw markdown string is absent from the exported document.
- [x] The agent entrypoint's invariants are updated to state that the field helper may emit anchors with validated targets.
- [x] `npm test`, `npm run check:renderers`, `npm run build`, and `npm run smoke` pass.

## Notes

- The PDF assertion in the smoke test checks that the exported bytes carry a `/URI` annotation for the unwrapped target. Checking the PDF for the *absence* of the raw markdown is not meaningful because its content streams are compressed; the absence is asserted against the rendered document HTML in the unit tests and against the preview text in the smoke test instead.
- Runtime-sanitizer parity and click behaviour during editing remain in ticket 02.
