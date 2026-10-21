# Example data

All data in this folder is fictional and safe to commit.

| File | Purpose |
| --- | --- |
| `cv.classic.example.json` | Valid `classic` schema CV. Load it from the Preview stage to see the renderer. |
| `cv.impact.example.json` | Valid `impact` schema CV with per-role skills and Problem / Solution / Outcome projects. |
| `profile.example.json` | Example profile file with basics, PDR text, and default instructions. |
| `pdr.example.md` | Sanitized personal data record. Import it from Profile, or use it as a format reference. |

The app also reads legacy `cv-studio.html` JSON (schema version 1) through **Preview → Load CV JSON**. Imported style is migrated where possible. Real personal data belongs in the gitignored `local-data/` folder, never in `examples/`.
