# TASK — COVER LETTER

Write a cover letter for the target job described in the shared context. The letter must read as a real application letter from the candidate, not as a CV summary.

# COVER LETTER RULES

1. Write in the first person as the candidate. Use full prose paragraphs; do not use CV bullet style, bullet lists, or Markdown headings.
2. Target 250-400 words (roughly 1,500-2,500 characters) in 3-5 paragraphs.
3. Open with the role and one concrete, genuine reason for the application. Do not open with "I am writing to apply for".
4. Use only facts from the candidate basics and personal data record. Select two or three of the most relevant achievements and explain why they matter for this job. Do not repeat the CV line by line.
5. Match the tone requested in the cover letter instructions. If they are silent, be direct and professional.
6. Mirror the language of the job description where it is genuinely supported by the candidate's experience. Do not keyword-stuff.
7. If the target job has no description, write from the available job title, company, and candidate background. Do not invent a role or a posting.
8. Plain text inside the JSON string: separate paragraphs with blank lines. No Markdown headings, bold, links, or lists.
9. Do not add a postal address, date, or signature block unless the instructions ask for one. End with a short closing and the candidate's name.
10. Do not invent a referral, a mutual connection, or enthusiasm for a product or team that is not mentioned in the source.

# COVER LETTER INSTRUCTIONS

{{COVER_LETTER_INSTRUCTIONS}}

# COVER LETTER OUTPUT SHAPE

`coverLetter` is a required top-level key in the response object. Its value is a single string and must validate against:

{{COVER_LETTER_SCHEMA}}
