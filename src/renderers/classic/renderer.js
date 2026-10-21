import css from "./renderer.css?inline";

export const meta = {
  apiVersion: 1,
  id: "classic",
  name: "Classic Sidebar",
  description: "The original navy sidebar layout. Single A4 page, no summary block.",
  schemas: ["classic"],
  page: { width: "210mm", height: "297mm", multiPage: false },
  controls: { typeScale: true, spacing: true, margins: true, sidebar: true },
  sections: ["education", "skills", "experience", "projects", "custom"],
};

export { css };

function educationBlock(cv, ctx) {
  const { field } = ctx;
  if (!cv.education.length) return "";
  return `<section class="side-block">
    <h2 class="side-title">${field("sectionTitles.education", cv.sectionTitles.education)}</h2>
    ${cv.education
      .map(
        (entry, i) => `<div class="education-item">
          <div class="edu-degree">${field(`education.${i}.degree`, entry.degree)}</div>
          <div class="edu-school">${field(`education.${i}.school`, entry.school)}</div>
          <div class="edu-meta">${field(`education.${i}.meta`, entry.meta)}</div>
        </div>`,
      )
      .join("")}
  </section>`;
}

function skillsBlock(cv, ctx) {
  const { field } = ctx;
  if (!cv.skills.length) return "";
  return `<section class="side-block">
    <h2 class="side-title">${field("sectionTitles.skills", cv.sectionTitles.skills)}</h2>
    ${cv.skills
      .map(
        (group, i) => `<div class="skill-group">
          <div class="skill-label">${field(`skills.${i}.label`, group.label)}</div>
          <div class="tags">${group.items
            .map((item, j) => `<span class="tag">${field(`skills.${i}.items.${j}`, item)}</span>`)
            .join("")}</div>
        </div>`,
      )
      .join("")}
  </section>`;
}

function entriesBlock(type, title, entries, ctx) {
  const { field } = ctx;
  if (!entries.length) return "";
  return `<section class="main-section">
    <h2 class="section-title">${field(`sectionTitles.${type}`, title)}</h2>
    ${entries
      .map(
        (entry, i) => `<article class="entry">
          <div class="entry-head">
            <div class="role">${field(`${type}.${i}.role`, entry.role)}</div>
            ${entry.dates ? `<div class="dates">${field(`${type}.${i}.dates`, entry.dates)}</div>` : ""}
          </div>
          ${entry.org ? `<div class="org">${field(`${type}.${i}.org`, entry.org)}</div>` : ""}
          ${entry.blurb ? `<div class="blurb">${field(`${type}.${i}.blurb`, entry.blurb)}</div>` : ""}
          ${
            entry.bullets && entry.bullets.length
              ? `<ul class="bullets">${entry.bullets
                  .map(
                    (bullet, j) =>
                      `<li>${field(`${type}.${i}.bullets.${j}`, bullet)}</li>`,
                  )
                  .join("")}</ul>`
              : ""
          }
        </article>`,
      )
      .join("")}
  </section>`;
}

export function renderClassic(cv, ctx, options = {}) {
  const { field } = ctx;
  const showSummary = !!options.summary && !!cv.summary;
  const summary = showSummary
    ? `<section class="main-section summary-section">
        <h2 class="section-title">${field("sectionTitles.summary", cv.sectionTitles.summary)}</h2>
        <p class="summary">${field("summary", cv.summary)}</p>
      </section>`
    : "";

  return `<div class="cv-page" data-cv-page>
    <header class="masthead">
      <h1>${field("basics.name", cv.basics.name)}</h1>
      ${cv.basics.headline ? `<div class="headline">${field("basics.headline", cv.basics.headline)}</div>` : ""}
      <div class="rule"></div>
      <p class="contact">${cv.basics.contact
        .map(
          (item, i) =>
            `<span class="contact-item">${field(`basics.contact.${i}`, item)}</span>`,
        )
        .join("")}</p>
    </header>
    <div class="columns">
      <aside class="sidebar" data-cv-overflow-watch>
        ${educationBlock(cv, ctx)}
        ${skillsBlock(cv, ctx)}
      </aside>
      <main class="main" data-cv-overflow-watch>
        ${summary}
        ${entriesBlock("experience", cv.sectionTitles.experience, cv.experience, ctx)}
        ${entriesBlock("projects", cv.sectionTitles.projects, cv.projects, ctx)}
        ${entriesBlock("custom", cv.sectionTitles.custom, cv.custom, ctx)}
      </main>
    </div>
  </div>`;
}

export function render(cv, ctx) {
  return renderClassic(cv, ctx, { summary: false });
}
