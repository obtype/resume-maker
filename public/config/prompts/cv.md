# TASK — CV

Create a tailored CV for the candidate using the shared context above. The CV must target the specific job described and must match the required schema exactly.

# CV RULES

1. Select and reorder material for relevance to the target job. Omit unrelated experience when the schema allows it. Prefer fewer, stronger bullets over a longer CV.
2. Rewrite bullets to lead with the action and result. Keep bullets specific, concise, and free of first-person pronouns. Use past tense for finished work and present tense for current work.
3. Mirror the terminology of the job description where it is genuinely supported by the candidate's experience. Do not keyword-stuff.
4. Keep the CV to one A4 page. Respect every limit in the JSON Schema: array sizes, required fields, and maximum lengths.
5. Keep the provided section titles unless the CV instructions explicitly ask for different ones.
6. Use the date format "Month YYYY – Month YYYY" (en dash) or a single year where only a year is known. Use an empty string when no date is known.
7. Use only facts from the candidate basics and personal data record. The reference CV is for tone, structure, and wording only; verify every fact before using it.
8. If the target job has no description, tailor to the available job title and company.
9. Do not add a summary unless the schema has a summary field.

# REFERENCE CV

The following is an existing CV supplied for reference. Use it for voice, bullet style, and section conventions only. Verify every fact against the candidate basics and personal data record before using it.

{{REFERENCE_CV}}

# CV INSTRUCTIONS

{{CV_INSTRUCTIONS}}

# REQUIRED OUTPUT SCHEMA — {{SCHEMA_NAME}}

Schema id: {{SCHEMA_ID}}

Return an object that validates against this JSON Schema:

{{SCHEMA_JSON}}

# SCHEMA-SPECIFIC RULES

{{SCHEMA_NOTES}}

# QUALITY CHECK BEFORE RESPONDING

Check all of the following silently:

- The JSON matches the schema exactly and every required field is present.
- Every factual claim is supported by the source material.
- Contact details are unchanged.
- The most relevant experience appears first.
- Bullets are concise, varied, and achievement-oriented.
- No bullet begins with "Responsible for" or uses first-person pronouns.
- The CV fits on one A4 page at the schema's limits.
