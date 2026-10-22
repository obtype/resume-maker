# Embedded links in the rendered CV

**Status:** ready-for-agent
**Tracker:** local markdown

## Problem Statement

Models routinely return contact details and prose containing markdown links, for example:

```json
"contact": [
  "candidate@example.com",
  "[github.com/example](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fexample)",
  "+92 333 1291761"
]
```

The CV renders that second entry literally: the reader sees brackets, parentheses, a percent-encoded URL, and a Google search redirect, and nothing is clickable. The same happens in the preview and the exported PDF. Simply embedding the URL as written would be worse — the PDF would link to a search results page rather than the candidate's profile. The CV author cannot fix this without hand-editing the JSON, and a regenerated response reintroduces it.

## Solution

Field text renders as rich text: recognised links become real anchors, displayed as their label, with a resolved absolute target. This works in the preview and in the exported PDF, survives inline editing, and does not change the visual design beyond a subtle underline. Unsafe or unrecognisable links degrade to plain text rather than breaking the page.

## User Stories

1. As a CV author, I want the links a model returns to render as readable, clickable text, so my CV does not ship with markdown syntax in it.
2. As a CV author, I want my GitHub profile link to point at my profile, so a reader who clicks it does not land on a search results page.
3. As a CV author, I want a bare domain such as `github.com/example` to be clickable even when the model omitted the scheme, so I do not have to correct the JSON by hand.
4. As a CV author, I want my email address to open the reader's mail client, so it is usable from the PDF.
5. As a CV author, I want markdown links in a summary or a project blurb to work too, not just in contact details, so prose can reference my work.
6. As a recruiter reading the PDF, I want links to look like links but still match the CV's typography, so the document stays presentable.
7. As a CV author, I want the preview and the PDF to render links identically, so what I see is what I export.
8. As a CV author editing in the preview, I want clicking inside a link to place my caret rather than open a browser tab, so I can fix a typo.
9. As a CV author, I want my edit to a linked detail to stay linked afterwards, so proofreading does not silently destroy the link.
10. As a CV author, I want a regenerated response to restore links from the new text, so links are never stuck on stale values.
11. As a CV author, I want a malformed, empty, or unsafe link to degrade to plain text, so one bad entry cannot break the whole CV.
12. As a CV author, I want a redirect wrapper to be unwrapped to its real destination, so a copied ChatGPT link still points somewhere useful.
13. As a CV author, I want the prompt to ask for bare URLs, so future responses arrive cleaner even though the renderer tolerates markdown.
14. As a maintainer, I want renderers to stay unaware of markdown, so a new renderer gets links for free and stays pure.
15. As a maintainer, I want the smoke test to prove a link annotation reaches the exported PDF, so a regression in the export path is caught.
16. As a security-conscious author, I want `javascript:` and `data:` targets rejected everywhere, so a hostile model response cannot execute in my preview.
17. As a CV author, I want the visual result to fit on one A4 page still, so links do not change layout or overflow.

## Implementation Decisions

**Where links are recognised.** Linkification happens in the render context helper that every renderer already uses for editable values, not in individual renderers. Renderers continue to pass a field path and a value; they never see the parser. A renderer added later inherits the behaviour with no change. The helper still escapes text first; anchors are constructed by the helper from validated parts, never concatenated from raw model output.

**What the content model stores.** The CV content keeps contact details and prose as plain strings. Link targets are derived at render time and are not schema fields; see `docs/adr/0001-derive-link-targets-at-render-time.md`.

**Recognition rules**, applied to the plain field value:
- Markdown links `[label](target)` — display the label, resolve the target. Applies in every field.
- Bare absolute URLs (`http://`, `https://`) — applies in every field.
- Bare `www.` addresses — treated as `https://`.
- Bare domains without a scheme (`github.com/example`, `linkedin.com/in/x`) — recognised only in contact details, where a domain-shaped string is consistently a profile link and not prose.
- Email addresses — become `mailto:` targets, in every field.
- Phone numbers — never linked. Formatting variants make normalisation guesswork, and a mis-dialled link in a PDF is worse than plain text.
- Trailing punctuation adjacent to a bare URL is not part of the target.

**Target resolution and hygiene.** A target is only used if it resolves to an absolute `http(s)` or `mailto` destination. `javascript:`, `data:`, `file:`, and protocol-relative targets are rejected, and the text renders unlinked. Known redirect wrappers — Google search and Google redirect links carrying the real URL in a query parameter — are percent-decoded and unwrapped to the inner URL, which is then subjected to the same validation. If a markdown target is rejected but its label is itself a bare domain, the label is used to derive the target; otherwise the entry stays plain text. The link's visible text is always the label, never the URL.

**Rendering and styling.** Both the preview document and the print document carry the same anchors; the print document has no runtime and needs none, because the PDF writer turns anchors into link annotations. Anchor styling lives in the shared base stylesheet rather than in each renderer: inherited text colour, a thin underline in the current colour, and no other change to weight or size. No `target` or `rel` attributes are emitted by the renderer.

**Safe HTML.** Both sanitizers that can emit field HTML — the render-time one for saved field HTML and the editing runtime's one for captured edits — accept `A` with an `href` that passes the same target validation, and strip every other attribute on it. The existing formatting allowlist is otherwise unchanged.

**Interaction while editing.** In editing mode anchors do not receive pointer events, so a click lands in the field and places the caret. Outside editing mode the preview runtime intercepts anchor clicks, prevents navigation of the preview document, and opens the target in a new tab. Editing a field that contains a link posts the visible label as field text and the anchor-bearing HTML as saved field HTML, so the drift guard keeps the link alive while the field content still matches.

**Known limitation, recorded deliberately.** Once a linked field is edited, the URL lives in saved field HTML, not in the CV content. Regenerating the response, switching to a renderer with a different style record, or clearing saved formatting drops that link; the link is restored only if the new content still contains a recognisable link.

**Prompt guidance.** The canonical prompt template gains a rule that URLs are written as bare URLs, not markdown links, and that each contact detail is one entry. A workspace-level override is unaffected, which is acceptable because the renderer tolerates both forms.

**Documentation.** The agent entrypoint's invariants describing what renderers may emit are updated to say that the field helper may produce anchors with validated targets.

## Testing Decisions

Good tests here assert what a reader or an exporter receives, not how the parser is structured. Concretely: given CV content containing a markdown link, does the rendered document contain an anchor with the right absolute target and the right visible label; and does hostile or malformed input produce no anchor at all. Tests should not assert on regular expressions, helper names, or intermediate parse results.

One primary seam: the document builder that produces the print document from renderer, content, and style. It composes the render context, the renderer, and the sanitizers, so a single assertion per renderer proves the feature end to end without a browser. Every registered renderer is exercised, because contact details appear in the shared header of each one.

Secondary seams already used by prior art:
- Sanitizer assertions in the style of the existing legacy-HTML test: a safe anchor survives, an unsafe scheme or an event handler does not.
- The browser smoke test, which already exports a PDF: after export, assert the PDF bytes contain a URI annotation for the profile link and that the raw markdown string is absent from the exported document. This is the only seam that proves the annotation actually survives Chrome's PDF writer.

The smoke test's injected profile gains a contact detail written as a markdown link with a redirect wrapper, so the end-to-end path is exercised rather than a bare URL.

No new test infrastructure is needed; the unit suite runs in Node and the sanitizer's DOM-free path is the one already covered.

## Out of Scope

- Structured link fields in the CV content, or any schema change.
- A link-editing UI in the Profile view; contact details stay a plain text list there.
- `tel:` links, QR codes, and vCards.
- Rich text beyond links in model output — bold, italic, and headings in a response stay literal.
- Link previews, hover cards, or click tracking.
- Migrating existing projects, since no stored data changes.
- Multi-page CVs and any pagination change.

## Further Notes

- Verified during design: headless Chrome's PDF writer preserves `https:` and `mailto:` anchors as `/URI` annotations, so the export path needs no changes.
- The redirect-wrapper rule is a heuristic on two well-known Google patterns. Other wrappers, such as link shorteners, are deliberately not resolved.
- Contact entries are capped at 120 characters by the schema. A long markdown link plus a wrapper can approach that cap; this is not addressed here because the validator already rejects over-long entries.
