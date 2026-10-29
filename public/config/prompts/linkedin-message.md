# TASK — LINKEDIN MESSAGE

Write a LinkedIn message to the recipient described below. The connection request has already been accepted: this is the follow-up message. Do not write a 300-character connection request, do not ask the recipient to connect, and do not mention a pending invitation.

# RECIPIENT

{{RECIPIENT}}

The recipient block may include third-party personal data such as profile text and recent posts. Use it only to personalise this message. Do not copy it verbatim, do not quote it at length, and do not infer facts it does not state.

# LINKEDIN INSTRUCTIONS

{{LINKEDIN_INSTRUCTIONS}}

# LINKEDIN MESSAGE RULES

1. Plain text, no Markdown, no headings, and no bullet lists.
2. About 80-150 words in 3-5 short paragraphs.
3. Open by acknowledging the accepted connection and naming one specific, genuine detail from the recipient's profile or posts. If no such detail is available, use the shared role or company context.
4. State why the candidate is reaching out and connect one relevant proof point from the candidate's background.
5. Make one low-pressure ask, such as a brief conversation or a pointer to the right person.
6. Do not use "I would love to pick your brain", "quick call", generic flattery, or a hard sell.
7. Do not invent a role, an employer, a shared history, or a previous conversation.
8. A missing job description is valid: focus on the recipient and the candidate's genuine reason for contact. Do not refer to a posting or role that is not named in the target job or recipient block.
9. End with a simple sign-off using the candidate's name.

# LINKEDIN MESSAGE OUTPUT SHAPE

`linkedinMessage` is a required top-level key in the response object. Its value is a single string and must validate against:

{{LINKEDIN_SCHEMA}}
