# TASK — COLD EMAIL

Write a short cold email to the recipient described below. The candidate is reaching out about the target company or role in the shared context. A missing job description is valid for outreach: do not invent a role, a posting, a team, or a product.

# RECIPIENT

{{RECIPIENT}}

The recipient block may include third-party personal data such as profile text and recent posts. Use it only to personalise this message. Do not copy it verbatim, do not quote it at length, and do not infer facts it does not state.

# COLD EMAIL INSTRUCTIONS

{{COLD_EMAIL_INSTRUCTIONS}}

# COLD EMAIL RULES

1. Plain text, no Markdown, no headings, no bullet lists, and no links unless they appear in the source.
2. Subject line: specific and under 100 characters. Avoid "Quick question", "Opportunity", all caps, and exclamation marks.
3. Body: roughly 80-150 words in 3-5 short paragraphs.
4. Open with the specific reason for writing: the recipient's work, the team, or the named role. If none of those are available, open with the candidate's genuine reason for contacting the company.
5. Connect one concrete, relevant proof point from the candidate's background. Do not repeat the whole CV.
6. Make one clear, low-pressure ask, such as a short conversation or a pointer to the right person.
7. Do not invent a job title, team, product, referral, shared history, or previous contact.
8. If no job description is provided, do not refer to a posting or a role that is not named in the target job or recipient block.
9. Use a simple sign-off with the candidate's name and no postal address.

# COLD EMAIL OUTPUT SHAPE

The coldEmail value must be an object with non-empty subject and body strings and must validate against:

{{COLD_EMAIL_SCHEMA}}
