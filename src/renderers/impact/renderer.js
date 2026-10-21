import css from "./renderer.css?inline";

export const meta = {
  apiVersion: 1,
  id: "impact",
  name: "Impact",
  description:
    "Single-column layout with per-role skill lists and Problem / Solution / Outcome project write-ups.",
  schemas: ["impact"],
  page: { width: "210mm", height: "297mm", multiPage: false },
  controls: { typeScale: true, spacing: true, margins: true, sidebar: false },
  sections: ["summary", "education", "skills", "experience", "projects", "custom"],
};

export { css };

function header(cv, ctx) {
  const { field } = ctx;
  return `<header class="impact-header">
    <div class="header-main">
      <h1>${field("basics.name", cv.basics.name)}</h1>
      ${cv.basics.headline ? `<div class="header-headline">${field("basics.headline", cv.basics.headline)}</div>` : ""}
    </div>
    <div class="header-contact">${cv.basics.contact
      .map((item, i) => `<span>${field(`basics.contact.${i}`, item)}</span>`)
      .join("")}</div>
  </header>`;
}

function summary(cv, ctx) {
  if (!cv.summary) return "";
  const { field } = ctx;
  return `<section class="impact-section summary-section">
    <h2>${field("sectionTitles.summary", cv.sectionTitles.summary)}</h2>
    <p class="summary-text">${field("summary", cv.summary)}</p>
  </section>`;
}

function educationAndSkills(cv, ctx) {
  const { field } = ctx;
  if (!cv.education.length && !cv.skills.length) return "";
  return `<div class="top-grid">
    ${
      cv.education.length
        ? `<section class="impact-section">
            <h2>${field("sectionTitles.education", cv.sectionTitles.education)}</h2>
            ${cv.education
              .map(
                (entry, i) => `<div class="edu-item">
                  <div class="item-title">${field(`education.${i}.degree`, entry.degree)}</div>
                  <div class="item-sub">${field(`education.${i}.school`, entry.school)}</div>
                  <div class="item-meta">${field(`education.${i}.meta`, entry.meta)}</div>
                </div>`,
              )
              .join("")}
          </section>`
        : ""
    }
    ${
      cv.skills.length
        ? `<section class="impact-section">
            <h2>${field("sectionTitles.skills", cv.sectionTitles.skills)}</h2>
            ${cv.skills
              .map(
                (group, i) => `<div class="skill-row">
                  <div class="skill-label">${field(`skills.${i}.label`, group.label)}</div>
                  <div class="skill-items">${group.items
                    .map(
                      (item, j) =>
                        `<span class="skill-chip">${field(`skills.${i}.items.${j}`, item)}</span>`,
                    )
                    .join("")}</div>
                </div>`,
              )
              .join("")}
          </section>`
        : ""
    }
  </div>`;
}

function experienceBlock(cv, ctx) {
  const { field } = ctx;
  if (!cv.experience.length) return "";
  return `<section class="impact-section">
    <h2>${field("sectionTitles.experience", cv.sectionTitles.experience)}</h2>
    ${cv.experience
      .map(
        (entry, i) => `<article class="role-entry">
          <div class="entry-head">
            <div>
              <div class="item-title">${field(`experience.${i}.role`, entry.role)}</div>
              ${entry.org ? `<div class="item-sub">${field(`experience.${i}.org`, entry.org)}</div>` : ""}
            </div>
            ${entry.dates ? `<div class="dates">${field(`experience.${i}.dates`, entry.dates)}</div>` : ""}
          </div>
          ${entry.blurb ? `<div class="blurb">${field(`experience.${i}.blurb`, entry.blurb)}</div>` : ""}
          ${
            entry.bullets?.length
              ? `<ul class="bullets">${entry.bullets
                  .map((bullet, j) => `<li>${field(`experience.${i}.bullets.${j}`, bullet)}</li>`)
                  .join("")}</ul>`
              : ""
          }
          ${
            entry.skills?.length
              ? `<div class="role-skills"><span class="role-skills-label">Applied skills</span>${entry.skills
                  .map(
                    (skill, j) =>
                      `<span class="role-skill">${field(`experience.${i}.skills.${j}`, skill)}</span>`,
                  )
                  .join("")}</div>`
              : ""
          }
        </article>`,
      )
      .join("")}
  </section>`;
}

function projectsBlock(cv, ctx) {
  const { field } = ctx;
  if (!cv.projects.length) return "";
  return `<section class="impact-section">
    <h2>${field("sectionTitles.projects", cv.sectionTitles.projects)}</h2>
    ${cv.projects
      .map(
        (entry, i) => `<article class="project-entry">
          <div class="entry-head">
            <div>
              <div class="item-title">${field(`projects.${i}.role`, entry.role)}</div>
              ${entry.org ? `<div class="item-sub">${field(`projects.${i}.org`, entry.org)}</div>` : ""}
            </div>
            ${entry.dates ? `<div class="dates">${field(`projects.${i}.dates`, entry.dates)}</div>` : ""}
          </div>
          ${entry.blurb ? `<div class="blurb">${field(`projects.${i}.blurb`, entry.blurb)}</div>` : ""}
          <div class="pso">
            <div class="pso-row"><span class="pso-label">Problem</span><p>${field(`projects.${i}.problem`, entry.problem ?? "")}</p></div>
            <div class="pso-row"><span class="pso-label">Solution</span><p>${field(`projects.${i}.solution`, entry.solution ?? "")}</p></div>
            <div class="pso-row"><span class="pso-label">Outcome</span><p>${field(`projects.${i}.outcome`, entry.outcome ?? "")}</p></div>
          </div>
        </article>`,
      )
      .join("")}
  </section>`;
}

function customBlock(cv, ctx) {
  const { field } = ctx;
  if (!cv.custom.length) return "";
  return `<section class="impact-section">
    <h2>${field("sectionTitles.custom", cv.sectionTitles.custom)}</h2>
    ${cv.custom
      .map(
        (entry, i) => `<article class="role-entry">
          <div class="entry-head">
            <div class="item-title">${field(`custom.${i}.role`, entry.role)}</div>
            ${entry.dates ? `<div class="dates">${field(`custom.${i}.dates`, entry.dates)}</div>` : ""}
          </div>
          ${entry.org ? `<div class="item-sub">${field(`custom.${i}.org`, entry.org)}</div>` : ""}
          ${
            entry.bullets?.length
              ? `<ul class="bullets">${entry.bullets
                  .map((bullet, j) => `<li>${field(`custom.${i}.bullets.${j}`, bullet)}</li>`)
                  .join("")}</ul>`
              : ""
          }
        </article>`,
      )
      .join("")}
  </section>`;
}

export function render(cv, ctx) {
  return `<div class="cv-page" data-cv-page>
    ${header(cv, ctx)}
    ${summary(cv, ctx)}
    ${educationAndSkills(cv, ctx)}
    ${experienceBlock(cv, ctx)}
    ${projectsBlock(cv, ctx)}
    ${customBlock(cv, ctx)}
  </div>`;
}
