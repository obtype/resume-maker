import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const APP_URL = "http://127.0.0.1:5173";
const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const workspaceName = `cv-studio-smoke-${Date.now()}`;

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) return;
    } catch {
      // server not ready
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not start.\n${serverOutput}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sampleCv = {
  schemaVersion: 2,
  basics: {
    name: "Alex Example",
    headline: "Computer Vision Engineer",
    contact: [
      "alex@example.com",
      "+1 555 0100",
      "[github.com/example](https://www.google.com/search?q=https%3A%2F%2Fgithub.com%2Fexample)",
      "Berlin, Germany",
    ],
  },
  sectionTitles: {
    education: "Education",
    skills: "Skills",
    experience: "Experience",
    projects: "Projects",
    custom: "Additional",
  },
  education: [
    { degree: "BSc Artificial Intelligence", school: "Example University", meta: "2026" },
  ],
  skills: [
    { label: "Programming", items: ["Python", "C++"] },
    { label: "ML", items: ["PyTorch", "OpenCV"] },
  ],
  experience: [
    {
      role: "Machine Learning Intern",
      dates: "June 2025 – August 2025",
      org: "Example Labs",
      bullets: [
        "Built a real-time detector reaching 25 FPS on edge hardware.",
        "Improved recall by 12% on an internal benchmark.",
      ],
    },
    {
      role: "Software Engineer",
      dates: "August 2024 – June 2025",
      org: "Example Aerospace",
      bullets: ["Developed vision-based precision landing software."],
    },
  ],
  projects: [
    {
      role: "GPS-Denied Localisation",
      dates: "2026",
      org: "Final Year Project",
      bullets: ["Built a vision-based localisation pipeline with learned feature matching."],
    },
  ],
  custom: [],
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("https://github.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "profile" }),
  );
  const page = await context.newPage();

  // Mark the current preview document, then wait until a fresh one replaces it.
  async function refreshPreview() {
    await page.evaluate(() => {
      const iframe = document.querySelector("iframe.cv-preview-frame");
      if (iframe?.contentDocument?.body) iframe.contentDocument.body.dataset.smokeStale = "1";
    });
    await page.getByRole("button", { name: "Refresh preview" }).click();
    await page.waitForFunction(() => {
      const iframe = document.querySelector("iframe.cv-preview-frame");
      const body = iframe?.contentDocument?.body;
      return Boolean(body && !body.dataset.smokeStale);
    });
  }

  // Read every project's deliverables files and project.json in one go.
  async function readProjects() {
    return page.evaluate(async (name) => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle(name);
      const projects = await workspace.getDirectoryHandle("projects");
      const result = [];
      for await (const entry of projects.values()) {
        if (entry.kind !== "directory") continue;
        const directory = await projects.getDirectoryHandle(entry.name);
        const files = [];
        try {
          const deliverables = await directory.getDirectoryHandle("deliverables");
          for await (const fileEntry of deliverables.values()) {
            if (fileEntry.kind !== "file") continue;
            const file = await fileEntry.getFile();
            files.push({ name: fileEntry.name, text: await file.text() });
          }
        } catch {
          // no deliverables/ yet
        }
        let projectJson = "";
        try {
          const projectFile = await directory.getFileHandle("project.json");
          projectJson = await (await projectFile.getFile()).text();
        } catch {
          // no project.json yet
        }
        result.push({ id: entry.name, files, projectJson });
      }
      return result;
    }, workspaceName);
  }

  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", async (response) => {
    if (!process.env.PDF_OUT || !response.url().includes("/api/export-pdf") || !response.ok()) return;
    try {
      writeFileSync(process.env.PDF_OUT, await response.body());
    } catch {
      // The smoke assertions still verify the PDF through OPFS.
    }
  });

  await page.addInitScript((name) => {
    let pickerCount = 0;
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const folder = pickerCount === 0 ? name : `${name}-second`;
      pickerCount += 1;
      const directory = await root.getDirectoryHandle(folder, { create: true });
      if (folder === name) {
        // Seed the pre-deliverables single override so the migration notice and
        // the one-time archive are exercised on the first boot.
        const config = await directory.getDirectoryHandle("config", { create: true });
        const legacy = await config.getFileHandle("cv-prompt.md", { create: true });
        const writable = await legacy.createWritable();
        await writable.write("Legacy smoke-test CV template.\n");
        await writable.close();
      }
      return directory;
    };
  }, workspaceName);

  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Choose workspace folder" }).click();
  await page.getByRole("heading", { name: "Applications", exact: true }).waitFor({ timeout: 15000 });

  await page.locator(".topnav button", { hasText: "Profile" }).click();
  await page.getByPlaceholder("Your full name").fill("Alex Example");
  await page
    .getByPlaceholder(/email@example.com/)
    .fill("alex@example.com\n+1 555 0100\nBerlin, Germany");
  if (process.env.PDR_DOCX) {
    await page
      .locator('input[type=file][accept*=".docx"]')
      .setInputFiles(process.env.PDR_DOCX);
    await page.getByText(/Source: .*\.docx/).waitFor({ timeout: 30000 });
    const importedPdr = await page
      .getByPlaceholder("Import a file, or paste your PDR text here.")
      .inputValue();
    assert(importedPdr.length > 100, "DOCX PDR import produced too little text.");
  }
  await page
    .getByPlaceholder("Import a file, or paste your PDR text here.")
    .fill("Built a real-time detector at 25 FPS on edge hardware.");
  await page.locator("h1").first().click();

  await page.locator(".topnav button", { hasText: "Projects" }).click();
  await page.locator(".view-head button.primary").click();
  const newProjectModal = page.locator(".modal");
  assert(
    await newProjectModal.getByRole("checkbox", { name: "CV", exact: true }).isChecked(),
    "The New Project modal should default to the CV deliverable.",
  );
  assert(
    (await newProjectModal.getByLabel("Starting renderer").count()) === 1,
    "The renderer selector was hidden while the CV was selected.",
  );
  await page.getByPlaceholder("Machine Learning Engineer").fill("Machine Learning Engineer");
  await page.getByPlaceholder("Acme").fill("Acme");
  await page.locator(".modal button.primary").click();
  await page.locator(".stage-tabs").waitFor();
  assert(
    (await page.locator(".stage-tabs button.active").innerText()).includes("1 · Target"),
    "A new CV project did not open on Target.",
  );
  assert(
    (await page.locator(".stage-tabs button", { hasText: "4 · Preview" }).count()) === 1,
    "A new project with the CV selected should show the Preview tab.",
  );

  const cvDeliverable = page.getByRole("checkbox", { name: "CV", exact: true });
  assert(await cvDeliverable.isChecked(), "A new project should default to the CV deliverable.");
  assert(
    await cvDeliverable.isDisabled(),
    "The last selected deliverable must not be uncheckable.",
  );

  await page
    .getByPlaceholder(/Paste the full job posting here/)
    .fill("Own perception models for edge devices. Python, PyTorch, C++, real-time inference.");

  const sharedInstructions = "Lead with the edge perception work and keep the CV to one page.";
  const coverLetterInstructions =
    "Emphasise the perception project and keep the letter to three paragraphs.";
  const recipientName = "Jordan Example";
  const recipientAbout = "Leads the perception team at Globex Robotics.";

  await page
    .getByLabel("Shared instructions for this application")
    .fill(sharedInstructions);
  await page.getByRole("checkbox", { name: "Cover letter", exact: true }).check();
  await page.getByRole("checkbox", { name: "Cold email", exact: true }).check();
  assert(
    !(await cvDeliverable.isDisabled()),
    "The CV should be uncheckable once another deliverable is selected.",
  );

  await page
    .locator('[data-deliverable="coverLetter"]')
    .getByPlaceholder(/Keep it to three paragraphs/)
    .fill(coverLetterInstructions);

  const coldEmailPanel = page.locator('[data-deliverable="coldEmail"]');
  await coldEmailPanel.getByPlaceholder("Jordan Example").fill(recipientName);
  await coldEmailPanel.getByPlaceholder("Head of Engineering").fill("Head of Perception");
  await coldEmailPanel.getByPlaceholder("Globex", { exact: true }).fill("Globex Robotics");
  await coldEmailPanel
    .getByPlaceholder("https://www.linkedin.com/in/jordan-example")
    .fill("https://www.linkedin.com/in/jordan-example");
  await coldEmailPanel.getByPlaceholder(/profile summary or about/).fill(recipientAbout);
  await coldEmailPanel
    .getByPlaceholder(/recent posts that are relevant/)
    .fill("Posted about deploying detectors on low-power hardware.");
  await coldEmailPanel
    .getByPlaceholder(/We met at the Edge AI/)
    .fill("Met at the Edge AI meetup in May.");
  await coldEmailPanel
    .getByPlaceholder(/20-minute intro call/)
    .fill("Ask for a short intro call about the perception team.");
  await page.getByText(/third-party personal data/).first().waitFor();

  await page.getByRole("button", { name: "Next: prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  const promptText = await page.locator(".prompt-box").inputValue();
  assert(promptText.includes("REQUIRED OUTPUT SCHEMA"), "Prompt did not include the schema section.");
  assert(promptText.includes("Alex Example"), "Prompt did not include the candidate name.");
  assert(promptText.includes("Own perception models"), "Prompt did not include the job description.");

  await page.getByLabel("Renderer").selectOption("impact");
  await page.getByLabel("Output schema for this prompt").selectOption("impact");
  await page.getByRole("button", { name: "Regenerate" }).click();
  const impactPrompt = await page.locator(".prompt-box").inputValue();
  assert(impactPrompt.includes('"problem"'), "Impact prompt did not include the PSO schema.");
  assert(impactPrompt.includes("Applied skills") || impactPrompt.includes("concrete skills"), "Impact prompt did not mention per-role skills.");
  await page.getByLabel("Renderer").selectOption("classic");
  await page.getByRole("button", { name: "Regenerate" }).click();
  const restoredSchema = await page.getByLabel("Output schema for this prompt").inputValue();
  assert(restoredSchema === "classic", `Schema did not follow the renderer: ${restoredSchema}`);

  // The prompt follows the selection: the current request has a CV, a cover
  // letter, and a cold email, so it must use the combined envelope contract.
  const combinedPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    combinedPrompt.includes("TASK — CV"),
    "A combined request did not include the CV task.",
  );
  assert(
    combinedPrompt.includes("TASK — COVER LETTER"),
    "A combined request did not include the cover-letter task.",
  );
  assert(
    combinedPrompt.includes('"coverLetter"'),
    "A combined request did not include the envelope coverLetter key.",
  );
  const selectionSummary = page.getByTestId("selection-summary");
  await selectionSummary.waitFor();
  assert(
    (await selectionSummary.locator('[data-deliverable="cv"]').getAttribute("data-selected")) ===
      "true",
    "The selection summary did not mark the requested CV.",
  );
  assert(
    (await selectionSummary
      .locator('[data-deliverable="linkedinMessage"]')
      .getAttribute("data-selected")) === "false",
    "The selection summary did not mark the unrequested LinkedIn message.",
  );

  // Narrow the same project to CV + cover letter and regenerate.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "Cold email", exact: true }).uncheck();
  await page.getByRole("button", { name: "Next: prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  await page.getByRole("button", { name: "Regenerate" }).click();
  const cvAndLetterPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    cvAndLetterPrompt.includes("TASK — CV") &&
      cvAndLetterPrompt.includes("TASK — COVER LETTER"),
    "A CV + cover-letter prompt did not include both tasks.",
  );
  assert(
    cvAndLetterPrompt.includes('"coverLetter"') &&
      cvAndLetterPrompt.includes('"required"'),
    "A CV + cover-letter prompt did not include the envelope contract.",
  );
  assert(
    !cvAndLetterPrompt.includes("TASK — COLD EMAIL"),
    "The unselected cold-email task stayed in the prompt.",
  );

  // A cover-letter-only request must not contain any CV contract or controls.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "CV", exact: true }).uncheck();
  await page.getByRole("checkbox", { name: "Cold email", exact: true }).uncheck();
  await page.getByRole("button", { name: "Next: prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  await page.getByRole("button", { name: "Regenerate" }).click();
  const letterOnlyPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    letterOnlyPrompt.includes("TASK — COVER LETTER"),
    "A cover-letter-only prompt did not include the cover-letter task.",
  );
  assert(
    !letterOnlyPrompt.includes("TASK — CV"),
    "A cover-letter-only prompt included the CV task.",
  );
  assert(
    !letterOnlyPrompt.includes("REQUIRED OUTPUT SCHEMA"),
    "A cover-letter-only prompt included a CV schema.",
  );
  assert(
    !letterOnlyPrompt.includes('"schemaVersion"'),
    "A cover-letter-only prompt embedded the CV schema.",
  );
  assert(
    letterOnlyPrompt.includes("Schema: none (CV not requested)"),
    "A cover-letter-only prompt did not declare that no CV schema was used.",
  );
  assert(
    (await page.getByLabel("Renderer").count()) === 0,
    "The renderer control stayed visible without a requested CV.",
  );
  assert(
    (await page.getByLabel("Output schema for this prompt").count()) === 0,
    "The schema control stayed visible without a requested CV.",
  );
  await page.getByTestId("cv-not-requested").waitFor();

  // Changing the selection in stage 1 marks the existing prompt stale;
  // Regenerate refreshes it and clears the badge.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "CV", exact: true }).check();
  await page.getByRole("button", { name: "Next: prompt" }).click();
  const staleBadge = page.getByTestId("prompt-stale");
  await staleBadge.waitFor();
  assert(
    (await staleBadge.innerText()).includes("Inputs changed"),
    "Changing the selection did not mark the prompt stale.",
  );
  await page.getByRole("button", { name: "Regenerate" }).click();
  assert(
    (await page.getByTestId("prompt-stale").count()) === 0,
    "Regenerate did not clear the stale badge.",
  );
  const refreshedPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    refreshedPrompt.includes("TASK — CV"),
    "Regenerate did not refresh the prompt for the new selection.",
  );

  // Restore the cold email for the rest of the existing flow.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "Cold email", exact: true }).check();

  // The Target stage keeps its inputs when the user navigates away and back.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "Cover letter", exact: true }).waitFor();
  assert(
    await page.getByRole("checkbox", { name: "Cover letter", exact: true }).isChecked(),
    "Cover-letter selection did not survive navigation.",
  );
  assert(
    await page.getByRole("checkbox", { name: "Cold email", exact: true }).isChecked(),
    "Cold-email selection did not survive navigation.",
  );
  assert(
    (await page
      .getByLabel("Shared instructions for this application")
      .inputValue()) === sharedInstructions,
    "Shared instructions did not survive navigation.",
  );
  assert(
    (await page
      .locator('[data-deliverable="coverLetter"]')
      .getByPlaceholder(/Keep it to three paragraphs/)
      .inputValue()) === coverLetterInstructions,
    "Cover-letter instructions did not survive navigation.",
  );
  const coldEmailPanelAfterNav = page.locator('[data-deliverable="coldEmail"]');
  assert(
    (await coldEmailPanelAfterNav.getByPlaceholder("Jordan Example").inputValue()) ===
      recipientName,
    "Cold-email recipient name did not survive navigation.",
  );
  assert(
    (await coldEmailPanelAfterNav
      .getByPlaceholder(/profile summary or about/)
      .inputValue()) === recipientAbout,
    "Cold-email recipient about text did not survive navigation.",
  );
  await page.getByRole("button", { name: "Next: prompt" }).click();
  await page.locator(".prompt-box").waitFor();

  // Copy still persists the prompt, including manual edits, to prompts/latest.md.
  const copyMarker = "SMOKE-COPY-MARKER";
  const promptForCopy = `${await page.locator(".prompt-box").inputValue()}\n${copyMarker}`;
  await page.locator(".prompt-box").fill(promptForCopy);
  await page.getByRole("button", { name: "Copy prompt" }).click();
  await page.locator("button.primary", { hasText: "Copied" }).waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "Next: response" }).click();
  await page.getByPlaceholder(/Paste the full LLM response here/).fill(JSON.stringify(sampleCv));
  await page.getByRole("button", { name: "Parse & validate" }).click();
  await page.getByRole("heading", { name: "Schema valid" }).waitFor();
  await page.getByRole("button", { name: "Apply to CV" }).click();
  await page.locator("iframe.cv-preview-frame").waitFor();
  await page.waitForTimeout(700);

  const frame = page.frameLocator("iframe.cv-preview-frame");
  await frame.locator('[data-field="basics.name"]').waitFor();
  await page.waitForFunction(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const field = iframe?.contentDocument?.querySelector('[data-field="basics.name"]');
    return field?.getAttribute("contenteditable") === "true";
  });
  const renderedName = await frame.locator('[data-field="basics.name"]').innerText();
  assert(renderedName.toLowerCase().includes("alex example"), `Preview name was "${renderedName}".`);
  const renderedRole = await frame.locator('[data-field="experience.0.role"]').innerText();
  assert(renderedRole.includes("Machine Learning Intern"), `Preview role was "${renderedRole}".`);

  const contactLink = frame.locator('a[href="https://github.com/example"]');
  assert((await contactLink.count()) === 1, "Contact profile link did not render as an anchor.");
  const contactLabel = await frame.locator('[data-field="basics.contact.2"]').innerText();
  assert(
    contactLabel.trim() === "github.com/example",
    `Contact link label was "${contactLabel}".`,
  );
  const previewText = await frame.locator("body").innerText();
  assert(
    !previewText.includes("[github.com/example]"),
    "The raw markdown link was rendered literally in the preview.",
  );

  // Editing a linked field: the click lands in the field, the caret moves, and
  // the anchor must survive the runtime sanitizer with its original target.
  const pagesBeforeEdit = context.pages().length;
  await frame.locator('[data-field="basics.contact.2"]').click();
  await page.waitForTimeout(300);
  assert(
    context.pages().length === pagesBeforeEdit,
    "Clicking a link while editing opened a new tab.",
  );
  const caretInsideLinkField = await page.evaluate(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const doc = iframe?.contentDocument;
    const field = doc?.querySelector('[data-field="basics.contact.2"]');
    return Boolean(field && doc.activeElement && field.contains(doc.activeElement));
  });
  assert(caretInsideLinkField, "Clicking a link while editing did not place the caret in the field.");
  // Put the caret at the end of the link's text and type, so the edit is
  // visibly part of the linked label rather than a sibling text node.
  await page.evaluate(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const doc = iframe?.contentDocument;
    const field = doc?.querySelector('[data-field="basics.contact.2"]');
    const anchor = field?.querySelector("a");
    if (!field || !anchor) throw new Error("Missing contact link field.");
    const range = doc.createRange();
    range.selectNodeContents(anchor);
    range.collapse(false);
    const selection = iframe.contentWindow.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    field.focus();
  });
  await page.keyboard.type("s");
  await page.waitForTimeout(1200);

  await refreshPreview();
  await frame.locator('[data-field="basics.contact.2"]').waitFor();
  const editedLink = frame.locator('[data-field="basics.contact.2"] a');
  assert((await editedLink.count()) === 1, "The link was lost after editing its visible text.");
  assert(
    (await editedLink.getAttribute("href")) === "https://github.com/example",
    `The edited link target changed to "${await editedLink.getAttribute("href")}".`,
  );
  const editedLabel = (await frame.locator('[data-field="basics.contact.2"]').innerText()).trim();
  assert(
    editedLabel.includes("github.com/example") && editedLabel !== "github.com/example",
    `The edited field text did not keep the visible label: "${editedLabel}".`,
  );

  // Formatting commands still work on text inside a link.
  await frame.locator('[data-field="basics.contact.2"]').click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.locator('button[title="Bold"]').click();
  await page.waitForTimeout(500);
  await refreshPreview();
  const formattedField = frame.locator('[data-field="basics.contact.2"]');
  await formattedField.waitFor();
  const formattedHtml = await formattedField.innerHTML();
  assert(/<(b|strong)[\s>]/i.test(formattedHtml), "Bold did not apply inside a link.");
  assert(
    (await formattedField.locator("a").getAttribute("href")) === "https://github.com/example",
    "Formatting inside a link lost its target.",
  );

  // Font size runs through execCommand's <font> rewrite, another anchor-fragile path.
  await frame.locator('[data-field="basics.contact.2"]').click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.locator('.toolbar-field.compact input[type="number"]').fill("10");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await page.waitForTimeout(500);
  await refreshPreview();
  const sizedField = frame.locator('[data-field="basics.contact.2"]');
  await sizedField.waitFor();
  assert(
    /font-size:\s*10pt/i.test(await sizedField.innerHTML()),
    "Font size did not apply inside a link.",
  );
  assert(
    (await sizedField.locator("a").getAttribute("href")) === "https://github.com/example",
    "Font size inside a link lost its target.",
  );

  // Outside editing mode the runtime opens the target in a new tab without
  // navigating the preview document.
  await page.getByRole("button", { name: /Editing: On/ }).click();
  await page.waitForFunction(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const field = iframe?.contentDocument?.querySelector('[data-field="basics.name"]');
    return field?.getAttribute("contenteditable") === null;
  });
  const popupPromise = context.waitForEvent("page", { timeout: 10000 });
  await frame.locator('a[href="https://github.com/example"]').click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  assert(
    popup.url().startsWith("https://github.com/example"),
    `Clicking the link opened "${popup.url()}" instead of the profile.`,
  );
  assert(
    (await popup.evaluate(() => window.opener === null)),
    "The new tab kept a window.opener reference.",
  );
  assert(
    (await frame.locator('[data-field="basics.name"]').count()) === 1,
    "Clicking a link navigated the preview document away from the CV.",
  );
  await popup.close();
  await page.getByRole("button", { name: /Editing: Off/ }).click();
  await page.waitForFunction(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const field = iframe?.contentDocument?.querySelector('[data-field="basics.name"]');
    return field?.getAttribute("contenteditable") === "true";
  });

  // The editing runtime must refuse hostile HTML captured from a field.
  await page.evaluate(() => {
    const iframe = document.querySelector("iframe.cv-preview-frame");
    const field = iframe?.contentDocument?.querySelector('[data-field="basics.headline"]');
    if (!field) throw new Error("Missing headline field.");
    field.innerHTML =
      '<a href="javascript:alert(1)" onclick="alert(2)">Hostile</a><b onclick="alert(3)">Bold</b>';
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  await refreshPreview();
  await frame.locator('[data-field="basics.headline"]').waitFor();
  const headlineHtml = await frame.locator('[data-field="basics.headline"]').innerHTML();
  assert(!/javascript:/i.test(headlineHtml), "The runtime sanitizer kept a javascript: href.");
  assert(!/onclick/i.test(headlineHtml), "The runtime sanitizer kept an event handler.");
  assert(!/<a\b/i.test(headlineHtml), "The runtime sanitizer left a dead unsafe anchor.");
  assert(headlineHtml.includes("Hostile"), "The runtime sanitizer dropped safe text.");

  const editable = await frame.locator('[data-field="basics.name"]').getAttribute("contenteditable");
  assert(editable === "true", "Preview fields are not editable by default.");
  const clippedWarnings = await page
    .locator(".callout.warn", { hasText: "Content is clipped" })
    .count();
  assert(clippedWarnings === 0, "A short sample CV was incorrectly reported as clipped.");

  await frame.locator('[data-field="basics.name"]').click();
  await page.keyboard.press("End");
  await page.keyboard.type(" X");
  await page.waitForTimeout(1400);
  const editedName = await frame.locator('[data-field="basics.name"]').innerText();
  assert(editedName.includes("X"), "Inline editing did not update the preview.");

  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await page
    .getByText(/Saved .*\.pdf to this project folder/)
    .waitFor({ timeout: 45000 });

  const persisted = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(name);
    const projects = await workspace.getDirectoryHandle("projects");
    let cvName = "";
    let cvContact = [];
    let hasPdf = false;
    let pdfBase64 = "";
    let projectJsonHasCv = false;
    let styles = {};
    let deliverables = null;
    let persistedSharedInstructions = "";
    let promptFileText = "";
    for await (const entry of projects.values()) {
      if (entry.kind !== "directory") continue;
      const projectDir = await projects.getDirectoryHandle(entry.name);
      try {
        const promptsDir = await projectDir.getDirectoryHandle("prompts");
        const promptFile = await promptsDir.getFileHandle("latest.md");
        promptFileText = await (await promptFile.getFile()).text();
      } catch {
        // no prompts/latest.md yet
      }
      try {
        const file = await projectDir.getFileHandle("cv.json");
        const text = await (await file.getFile()).text();
        const cv = JSON.parse(text);
        cvName = cv.basics.name;
        cvContact = cv.basics.contact;
      } catch {
        // no cv.json yet
      }
      try {
        const projectFile = await projectDir.getFileHandle("project.json");
        const projectData = JSON.parse(await (await projectFile.getFile()).text());
        projectJsonHasCv = Object.prototype.hasOwnProperty.call(projectData, "cv");
        styles = projectData.styles ?? {};
        deliverables = projectData.deliverables ?? null;
        persistedSharedInstructions = projectData.job?.sharedInstructions ?? "";
      } catch {
        // no project.json yet
      }
      for await (const fileEntry of projectDir.values()) {
        if (fileEntry.kind !== "file" || !fileEntry.name.endsWith(".pdf")) continue;
        const file = await fileEntry.getFile();
        const bytes = new Uint8Array(await file.arrayBuffer());
        hasPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        pdfBase64 = btoa(binary);
      }
    }
    return {
      cvName,
      cvContact,
      hasPdf,
      pdfBase64,
      projectJsonHasCv,
      styles,
      deliverables,
      persistedSharedInstructions,
      promptFileText,
    };
  }, workspaceName);
  if (process.env.PDF_OUT && persisted.pdfBase64) {
    writeFileSync(process.env.PDF_OUT, Buffer.from(persisted.pdfBase64, "base64"));
  }
  assert(persisted.cvName.toLowerCase().includes("alex example"), `Persisted CV name was "${persisted.cvName}".`);
  assert(persisted.hasPdf, "The exported PDF was not written to the project folder.");
  assert(
    persisted.promptFileText.includes("SMOKE-COPY-MARKER"),
    "Copying the prompt did not save it to prompts/latest.md.",
  );
  assert(!persisted.projectJsonHasCv, "project.json must not duplicate CV content.");
  assert(
    persisted.deliverables?.selected?.includes("coverLetter") &&
      persisted.deliverables?.selected?.includes("coldEmail"),
    `Deliverable selection was not persisted: ${JSON.stringify(persisted.deliverables?.selected)}.`,
  );
  assert(
    persisted.deliverables?.settings?.coverLetter?.instructions ===
      coverLetterInstructions,
    "Cover-letter instructions were not persisted.",
  );
  assert(
    persisted.deliverables?.settings?.coldEmail?.recipient?.name === recipientName,
    "Cold-email recipient name was not persisted.",
  );
  assert(
    persisted.deliverables?.settings?.coldEmail?.recipient?.about === recipientAbout,
    "Cold-email recipient about text was not persisted.",
  );
  assert(
    persisted.persistedSharedInstructions === sharedInstructions,
    "Shared instructions were not persisted as job.sharedInstructions.",
  );
  assert(
    !("recipient" in (persisted.deliverables?.settings?.cv ?? {})) &&
      !("recipient" in (persisted.deliverables?.settings?.coverLetter ?? {})),
    "Only cold email and LinkedIn should persist recipient fields.",
  );
  assert(
    persisted.deliverables?.settings?.linkedinMessage?.recipient != null,
    "The LinkedIn deliverable should keep a recipient record even when it is empty.",
  );
  assert(
    persisted.cvContact[2] === editedLabel,
    `The linked contact value was persisted as "${persisted.cvContact[2]}".`,
  );

  const classicStyle = persisted.styles.classic ?? {};
  assert(
    classicStyle.fieldText?.["basics.contact.2"] === editedLabel,
    "The edited link text was not captured for the drift guard.",
  );
  assert(
    classicStyle.fieldHtml?.["basics.contact.2"]?.includes(
      'href="https://github.com/example"',
    ),
    `The saved field HTML lost the link: "${classicStyle.fieldHtml?.["basics.contact.2"]}".`,
  );
  assert(
    !/javascript:|onclick|<a\b/i.test(classicStyle.fieldHtml?.["basics.headline"] ?? ""),
    "The saved field HTML kept hostile markup.",
  );

  const pdfBytes = Buffer.from(persisted.pdfBase64, "base64").toString("latin1");
  assert(pdfBytes.includes("/URI"), "The exported PDF has no link annotations.");
  assert(
    pdfBytes.includes("https://github.com/example"),
    "The exported PDF does not link the contact profile URL.",
  );
  assert(
    !pdfBytes.includes(`https://${editedLabel}`),
    "The exported PDF linked the edited label instead of the saved target.",
  );
  assert(pdfBytes.length > 1000, "The exported PDF looks empty.");

  // Generated deliverables are badged, and the shortcut checks only the parts
  // that still lack content without unchecking everything.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  const cvOption = page.locator('[data-deliverable-option="cv"]');
  await cvOption.locator(".badge.generated").waitFor();
  assert(
    (await cvOption.locator(".badge.generated").count()) === 1,
    "The generated CV did not show a generated badge.",
  );
  await page.getByRole("button", { name: "Select missing only" }).click();
  assert(
    !(await page.getByRole("checkbox", { name: "CV", exact: true }).isChecked()),
    "Select missing only did not leave the generated CV unchecked.",
  );
  assert(
    await page.getByRole("checkbox", { name: "Cover letter", exact: true }).isChecked(),
    "Select missing only did not check the missing cover letter.",
  );
  assert(
    await page.getByRole("checkbox", { name: "Cold email", exact: true }).isChecked(),
    "Select missing only did not check the missing cold email.",
  );
  assert(
    await page.getByRole("checkbox", { name: "LinkedIn message", exact: true }).isChecked(),
    "Select missing only did not check the missing LinkedIn message.",
  );

  // ----- Response stage: per-deliverable cards -----
  // Narrow to CV + cover letter + cold email (no LinkedIn message) and verify
  // each selected deliverable gets its own card.
  await page.getByRole("checkbox", { name: "CV", exact: true }).check();
  await page.getByRole("checkbox", { name: "LinkedIn message", exact: true }).uncheck();

  const coverLetterFiller =
    "At Example Labs I shipped a detector that ran at 25 FPS on low-power hardware and improved recall by 12 percent on an internal benchmark. ";
  const coverLetterMarkdown = [
    "Dear Hiring Team,",
    "",
    "I build **real-time perception** systems for edge devices and care about [measurable deployment](https://example.com/edge). I also value *clear communication*.",
    "",
    coverLetterFiller.repeat(7).trim(),
    "",
    "Ignore <b>this raw HTML</b> and [this unsafe link](javascript:alert).",
    "",
    "Best,",
    "Alex Example",
  ].join("\n");
  const coldEmailSubject = "Perception systems at Globex Robotics";
  const coldEmailBody =
    "Hi Jordan,\n\nI saw that the perception team at Globex Robotics is growing. I recently built a real-time detector that ran at 25 FPS on low-power hardware and improved recall by 12 percent on an internal benchmark.\n\nWould you be open to a short conversation about where edge perception is heading at Globex?\n\nBest,\nAlex Example";
  const responseEnvelope = {
    cv: sampleCv,
    coverLetter: coverLetterMarkdown,
    coldEmail: { subject: coldEmailSubject, body: coldEmailBody },
  };

  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  const responseEditor = page.getByPlaceholder(/Paste the full LLM response here/);
  await responseEditor.fill(JSON.stringify(responseEnvelope));
  await page.getByRole("button", { name: "Parse & validate" }).click();

  const coverCard = page.locator('[data-deliverable-card="coverLetter"]');
  const emailCard = page.locator('[data-deliverable-card="coldEmail"]');
  await coverCard.waitFor();
  await emailCard.waitFor();
  assert(
    (await page.locator('[data-deliverable-card="cv"]').count()) === 1,
    "A CV + message envelope did not show a CV card.",
  );
  assert(
    (await page.locator('[data-deliverable-card="linkedinMessage"]').count()) === 0,
    "An unrequested LinkedIn message got a response card.",
  );
  assert(
    (await coverCard.getAttribute("data-testid")) === "response-card-coverLetter" &&
      (await coverCard.locator(".badge.status").getAttribute("data-status")) === "valid",
    "The cover-letter card was not valid for a valid envelope.",
  );
  assert(
    (await emailCard.locator(".badge.status").getAttribute("data-status")) === "valid",
    "The cold-email card was not valid for a valid envelope.",
  );

  // The cover-letter preview is read-only and matches the editable textarea.
  await coverCard.getByRole("button", { name: "Preview", exact: true }).click();
  const letterPreview = coverCard.getByTestId("cover-letter-preview");
  await letterPreview.waitFor();
  const previewHtml = await letterPreview.innerHTML();
  assert(
    previewHtml.includes("<strong>real-time perception</strong>") &&
      previewHtml.includes("<em>clear communication</em>"),
    `The preview did not render bold and italic: "${previewHtml}".`,
  );
  assert(
    (await letterPreview.locator('a[href="https://example.com/edge"]').count()) === 1,
    "The preview did not render the safe link.",
  );
  assert(
    previewHtml.includes("&lt;b&gt;this raw HTML&lt;/b&gt;") &&
      (await letterPreview.locator("b").count()) === 0,
    "The preview injected raw model HTML.",
  );
  assert(
    !previewHtml.includes('href="javascript:'),
    "The preview rendered an unsafe link target.",
  );

  // Copy as plain text strips emphasis and link syntax; Copy Markdown is exact.
  const plainCoverLetter = coverLetterMarkdown
    .replace(/\[([^\]\n]+)\]\([^)\n]*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");
  await coverCard.getByRole("button", { name: "Copy plain text", exact: true }).click();
  await page.waitForTimeout(250);
  const copiedPlain = await page.evaluate(() => navigator.clipboard.readText());
  assert(
    copiedPlain === plainCoverLetter,
    "Copy as plain text did not strip Markdown markers correctly.",
  );
  await coverCard.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await page.waitForTimeout(250);
  const copiedMarkdown = await page.evaluate(() => navigator.clipboard.readText());
  assert(
    copiedMarkdown === coverLetterMarkdown,
    "Copy Markdown did not copy the cover letter verbatim.",
  );

  const [letterDownload] = await Promise.all([
    page.waitForEvent("download"),
    coverCard.getByRole("button", { name: "Download .md", exact: true }).click(),
  ]);
  assert(
    letterDownload.suggestedFilename().endsWith("-cover-letter.md"),
    `The cover letter download was named "${letterDownload.suggestedFilename()}".`,
  );
  assert(
    readFileSync(await letterDownload.path(), "utf8") === coverLetterMarkdown,
    "The downloaded cover letter Markdown did not match the card.",
  );

  // Cold-email copy actions and the .txt download.
  await emailCard.getByRole("button", { name: "Copy subject", exact: true }).click();
  await page.waitForTimeout(250);
  assert(
    (await page.evaluate(() => navigator.clipboard.readText())) === coldEmailSubject,
    "Copy subject did not copy the cold-email subject.",
  );
  await emailCard.getByRole("button", { name: "Copy both", exact: true }).click();
  await page.waitForTimeout(250);
  assert(
    (await page.evaluate(() => navigator.clipboard.readText())) ===
      `Subject: ${coldEmailSubject}\n\n${coldEmailBody}`,
    "Copy both did not combine the cold-email subject and body.",
  );
  const [emailDownload] = await Promise.all([
    page.waitForEvent("download"),
    emailCard.getByRole("button", { name: "Download .txt", exact: true }).click(),
  ]);
  assert(
    emailDownload.suggestedFilename().endsWith("-cold-email.txt"),
    `The cold-email download was named "${emailDownload.suggestedFilename()}".`,
  );
  const downloadedEmail = readFileSync(await emailDownload.path(), "utf8");
  assert(
    downloadedEmail.includes(`Subject: ${coldEmailSubject}`) &&
      downloadedEmail.includes(coldEmailBody),
    "The downloaded cold email did not include the subject and body.",
  );

  // Applying the CV must not apply either message card.
  await page.getByRole("button", { name: "Apply to CV" }).click();
  await page.locator("iframe.cv-preview-frame").waitFor();
  await page.waitForTimeout(1200);
  const afterCvApply = (await readProjects())[0];
  assert(
    afterCvApply.files.length === 0,
    `Applying the CV also wrote message files: ${afterCvApply.files.map((file) => file.name).join(", ")}.`,
  );

  // Saving each message stores it in project.artifacts and keeps the stage open.
  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  await responseEditor.fill(JSON.stringify(responseEnvelope));
  await page.getByRole("button", { name: "Parse & validate" }).click();
  await coverCard.waitFor();
  await emailCard.waitFor();
  await coverCard.getByRole("button", { name: "Save cover letter", exact: true }).click();
  await emailCard.getByRole("button", { name: "Save cold email", exact: true }).click();
  assert(
    (await page.locator(".stage-tabs button.active").innerText()).includes("3 · Response"),
    "Saving a message navigated away from the Response stage.",
  );
  await page.waitForTimeout(1200);

  const afterSave = (await readProjects())[0];
  const savedLetter = afterSave.files.find((file) => file.name === "cover-letter.md");
  const savedEmail = afterSave.files.find((file) => file.name === "cold-email.json");
  assert(savedLetter?.text === coverLetterMarkdown, "deliverables/cover-letter.md did not match the card.");
  assert(
    savedEmail && JSON.parse(savedEmail.text).subject === coldEmailSubject,
    "deliverables/cold-email.json did not contain the saved subject.",
  );
  assert(
    !afterSave.projectJson.includes("real-time perception") &&
      !afterSave.projectJson.includes("Hi Jordan") &&
      !afterSave.projectJson.includes(coldEmailSubject),
    "project.json duplicated message content.",
  );
  assert(
    !Object.prototype.hasOwnProperty.call(JSON.parse(afterSave.projectJson), "artifacts"),
    "project.json kept the in-memory artifacts object.",
  );

  // Clearing asks for confirmation, removes the artifact, and deletes the file
  // on the next save while leaving the other message alone.
  page.once("dialog", (dialog) => dialog.accept());
  await coverCard.getByRole("button", { name: "Clear cover letter", exact: true }).click();
  await page.waitForTimeout(1200);
  const afterClear = (await readProjects())[0];
  assert(
    !afterClear.files.some((file) => file.name === "cover-letter.md"),
    "Clearing the cover letter left deliverables/cover-letter.md behind.",
  );
  assert(
    afterClear.files.some((file) => file.name === "cold-email.json"),
    "Clearing the cover letter removed the cold email too.",
  );
  assert(
    !JSON.parse(afterClear.projectJson).files?.coverLetter,
    "Clearing the cover letter left its file index entry in project.json.",
  );

  await coverCard.getByRole("button", { name: "Save cover letter", exact: true }).click();
  await page.waitForTimeout(1200);
  assert(
    (await readProjects())[0].files.some((file) => file.name === "cover-letter.md"),
    "Re-saving the cover letter did not restore deliverables/cover-letter.md.",
  );

  // A bare CV is a CV-only response even for a multi-deliverable request: the
  // CV card fills and the requested messages report themselves missing.
  await responseEditor.fill(JSON.stringify(sampleCv));
  await page.getByRole("button", { name: "Parse & validate" }).click();
  await coverCard.waitFor();
  assert(
    (await coverCard.locator(".badge.status").getAttribute("data-status")) === "missing",
    "A bare CV did not report the missing cover letter.",
  );
  assert(
    (await emailCard.locator(".badge.status").getAttribute("data-status")) === "missing",
    "A bare CV did not report the missing cold email.",
  );
  assert(
    await page.getByRole("button", { name: "Apply to CV" }).isEnabled(),
    "A valid CV could not be applied while another deliverable was missing.",
  );
  await page.getByRole("button", { name: "Apply to CV" }).click();
  await page.locator("iframe.cv-preview-frame").waitFor();

  // An unrequested key is ignored with a warning and gets no card.
  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  await responseEditor.fill(
    JSON.stringify({
      cv: sampleCv,
      coverLetter: coverLetterMarkdown,
      linkedinMessage: "Thanks for connecting. I would enjoy comparing notes on perception teams.",
    }),
  );
  await page.getByRole("button", { name: "Parse & validate" }).click();
  await page.getByTestId("response-unrequested").waitFor();
  const unrequestedText = await page.getByTestId("response-unrequested").innerText();
  assert(
    unrequestedText.includes("LinkedIn message"),
    `The unrequested-key warning did not name the key: "${unrequestedText}".`,
  );
  assert(
    (await page.locator('[data-deliverable-card="linkedinMessage"]').count()) === 0,
    "An unrequested key created a card.",
  );

  await page.locator(".topnav button", { hasText: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();

  // The legacy single override is archived once on hydrate and named in Settings.
  const legacyNotice = page.locator('[data-testid="legacy-archive-notice"]');
  await legacyNotice.waitFor({ timeout: 10000 });
  const legacyNoticeText = await legacyNotice.innerText();
  assert(
    legacyNoticeText.includes("config/cv-prompt.legacy.md"),
    `Legacy archive notice did not name the archive path: "${legacyNoticeText}".`,
  );
  const legacyFiles = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(name);
    const config = await workspace.getDirectoryHandle("config");
    const names = [];
    for await (const entry of config.values()) names.push(entry.name);
    let archiveText = "";
    try {
      const archive = await config.getFileHandle("cv-prompt.legacy.md");
      archiveText = await (await archive.getFile()).text();
    } catch {
      // Missing archive is asserted below.
    }
    return { names, archiveText };
  }, workspaceName);
  assert(
    legacyFiles.names.includes("cv-prompt.legacy.md") &&
      !legacyFiles.names.includes("cv-prompt.md"),
    `Legacy override was not archived once: ${legacyFiles.names.join(", ")}.`,
  );
  assert(
    legacyFiles.archiveText === "Legacy smoke-test CV template.\n",
    "The archived legacy override did not keep its content.",
  );

  const templateTabs = page.locator(".template-tabs button");
  const templateTabsWithMarkers = [
    ["Shared context", "{{BASICS}}"],
    ["CV", "{{SCHEMA_JSON}}"],
    ["Cover letter", "{{COVER_LETTER_INSTRUCTIONS}}"],
    ["Cold email", "{{COLD_EMAIL_INSTRUCTIONS}}"],
    ["LinkedIn message", "{{LINKEDIN_INSTRUCTIONS}}"],
  ];
  for (const [label, marker] of templateTabsWithMarkers) {
    await templateTabs.filter({ hasText: label }).click();
    await page.waitForFunction(
      (expected) =>
        document.querySelector(".template-editor textarea")?.value.includes(expected),
      marker,
    );
    const editor = page.locator(".template-editor textarea");
    const value = await editor.inputValue();
    assert(value.trim().length > 0, `The ${label} template loaded empty.`);
  }

  await templateTabs.filter({ hasText: "Cover letter" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".template-editor textarea")
      ?.value.includes("{{COVER_LETTER_INSTRUCTIONS}}"),
  );
  const templateEditor = page.locator(".template-editor textarea");
  const bundledLetter = await templateEditor.inputValue();
  const overrideLetter = `${bundledLetter}\n\nSmoke override marker.`;
  await templateEditor.fill(overrideLetter);
  await page
    .locator(".template-editor")
    .getByRole("button", { name: "Save override" })
    .click();
  await page.waitForFunction(() => {
    const badge = document.querySelector(".template-tab-head .badge");
    return badge?.textContent?.trim() === "override";
  });
  assert(
    (await page.locator(".template-tab-head .badge").innerText()).trim() ===
      "override",
    "Saving an override did not switch the badge to override.",
  );

  const storedOverrides = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(name);
    const config = await workspace.getDirectoryHandle("config");
    const prompts = await config.getDirectoryHandle("prompts");
    const names = [];
    let letter = "";
    for await (const entry of prompts.values()) {
      names.push(entry.name);
      if (entry.name === "cover-letter.md") {
        letter = await (await entry.getFile()).text();
      }
    }
    return { names, letter };
  }, workspaceName);
  assert(
    storedOverrides.letter === overrideLetter,
    "The cover-letter override was not written to config/prompts/cover-letter.md.",
  );
  assert(
    storedOverrides.names.length === 1 &&
      storedOverrides.names[0] === "cover-letter.md",
    `Saving an override wrote unexpected files: ${storedOverrides.names.join(", ")}.`,
  );

  // The Prompt stage must show the templates actually used and name the
  // cover-letter override instead of claiming a single bundled template.
  await page.locator(".rail-item").first().click();
  await page.locator(".stage-tabs").waitFor();
  await page.locator(".stage-tabs button", { hasText: "2 · Prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  const coverSourceBadge = page.locator(
    '[data-testid="template-sources"] [data-template="coverLetter"]',
  );
  await coverSourceBadge.waitFor();
  const coverSourceText = await coverSourceBadge.innerText();
  assert(
    coverSourceText.includes("override"),
    `The cover-letter source badge did not show the override: "${coverSourceText}".`,
  );
  const sourceSummaryText = (
    await page.getByTestId("template-source-summary").innerText()
  ).trim();
  assert(
    sourceSummaryText === "mixed",
    `Differing template sources were not summarised as mixed: "${sourceSummaryText}".`,
  );

  // Back to Settings for the external-edit and reset checks.
  await page.locator(".topnav button", { hasText: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await templateTabs.filter({ hasText: "Cover letter" }).click();
  await page.waitForFunction(() =>
    document
      .querySelector(".template-editor textarea")
      ?.value.includes("{{COVER_LETTER_INSTRUCTIONS}}"),
  );

  // Reload must pick up an edit made outside the app.
  const externalLetter = "External cover-letter template edit.\n";
  await page.evaluate(
    async ({ name, text }) => {
      const root = await navigator.storage.getDirectory();
      const workspace = await root.getDirectoryHandle(name);
      const config = await workspace.getDirectoryHandle("config");
      const prompts = await config.getDirectoryHandle("prompts");
      const file = await prompts.getFileHandle("cover-letter.md");
      const writable = await file.createWritable();
      await writable.write(text);
      await writable.close();
    },
    { name: workspaceName, text: externalLetter },
  );
  await page
    .locator(".template-editor")
    .getByRole("button", { name: "Reload" })
    .click();
  await page.waitForFunction(
    (expected) =>
      document.querySelector(".template-editor textarea")?.value === expected,
    externalLetter,
  );

  // "Use bundled default" removes only the active override.
  await page
    .locator(".template-editor")
    .getByRole("button", { name: "Use bundled default" })
    .click();
  await page.waitForFunction(() => {
    const badge = document.querySelector(".template-tab-head .badge");
    return badge?.textContent?.trim() === "bundled";
  });
  await page.waitForFunction(
    (expected) =>
      document.querySelector(".template-editor textarea")?.value === expected,
    bundledLetter,
  );
  assert(
    (await templateEditor.inputValue()) === bundledLetter,
    "Resetting the override did not restore the bundled cover-letter template.",
  );
  const overridesAfterReset = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(name);
    const config = await workspace.getDirectoryHandle("config");
    const prompts = await config.getDirectoryHandle("prompts");
    const names = [];
    for await (const entry of prompts.values()) names.push(entry.name);
    return names;
  }, workspaceName);
  assert(
    !overridesAfterReset.includes("cover-letter.md"),
    "Use bundled default did not remove config/prompts/cover-letter.md.",
  );

  // A cover-letter-only project with a company but no CV can be created
  // directly from the modal. Without a requested CV the renderer selector is
  // hidden and the project opens on Target.
  await page.locator(".topnav button", { hasText: "Projects" }).click();
  assert(
    (await page.locator(".view-head p.muted").innerText()).includes(
      "One project per application or outreach effort.",
    ),
    "The Projects page did not use the application-or-outreach copy.",
  );
  await page.locator(".view-head button.primary").click();
  await page.getByRole("checkbox", { name: "Cover letter", exact: true }).check();
  await page.getByRole("checkbox", { name: "CV", exact: true }).uncheck();
  assert(
    (await page.getByLabel("Starting renderer").count()) === 0,
    "The renderer selector stayed visible in the modal without a requested CV.",
  );
  const createProjectButton = page.locator(".modal button.primary");
  assert(
    await createProjectButton.isDisabled(),
    "A cover-letter-only project with no title, company, or recipient could be created.",
  );
  assert(
    (await page.getByTestId("new-project-blocked").innerText()).includes(
      "job title, company, or recipient",
    ),
    "The modal did not explain why Create was disabled.",
  );
  await page.getByPlaceholder("Acme").fill("Initech");
  assert(
    await createProjectButton.isEnabled(),
    "Adding a company did not enable Create for a cover-letter-only project.",
  );
  await createProjectButton.click();
  await page.locator(".stage-tabs").waitFor();
  assert(
    (await page.locator(".stage-tabs button.active").innerText()).includes("1 · Target"),
    "A cover-letter-only project did not open on Target.",
  );
  assert(
    (await page.locator(".stage-tabs button", { hasText: "4 · Preview" }).count()) === 0,
    "A cover-letter-only project without CV content kept the Preview tab.",
  );
  assert(
    (await page.locator(".project-head h1").innerText()).trim() === "Initech",
    "The cover-letter-only project did not use the company as its display name.",
  );
  assert(
    await page.getByRole("checkbox", { name: "Cover letter", exact: true }).isChecked(),
    "The modal did not create the project with only the cover letter selected.",
  );
  assert(
    !(await page.getByRole("checkbox", { name: "CV", exact: true }).isChecked()),
    "The modal created the project with the CV still selected.",
  );

  const coverOnlyProjects = (await readProjects())
    .map((entry) => ({ ...entry, record: JSON.parse(entry.projectJson || "{}") }))
    .filter((entry) => entry.record.job?.company === "Initech");
  assert(
    coverOnlyProjects.length === 1,
    `Expected one cover-letter-only project, found ${coverOnlyProjects.length}.`,
  );
  const coverOnly = coverOnlyProjects[0];
  assert(
    coverOnly.id.startsWith("initech-"),
    `The cover-letter-only folder slug was "${coverOnly.id}".`,
  );
  assert(
    coverOnly.record.name === "Initech",
    `The cover-letter-only project name was "${coverOnly.record.name}".`,
  );
  assert(
    JSON.stringify(coverOnly.record.deliverables?.selected) ===
      JSON.stringify(["coverLetter"]),
    "project.json did not persist the cover-letter-only selection.",
  );
  assert(
    coverOnly.record.rendererId === "classic" &&
      coverOnly.record.schemaId === "classic",
    "A non-CV project did not keep the default renderer and a valid schema.",
  );

  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  await page.getByRole("heading", { name: "Response", exact: true }).waitFor();
  assert(
    (await page.locator(".stage-tabs button", { hasText: "4 · Preview" }).count()) === 0,
    "Preview reappeared on the Response stage of a cover-letter-only project.",
  );

  // A cover-letter-only request keeps the shared job context and the
  // cover-letter task, and contains no CV schema, reference CV, or CV task.
  await page.locator(".stage-tabs button", { hasText: "2 · Prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  const coverOnlyPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    coverOnlyPrompt.includes("TASK — COVER LETTER"),
    "A cover-letter-only project did not include the cover-letter task.",
  );
  assert(
    coverOnlyPrompt.includes("Company: Initech"),
    "A cover-letter-only prompt did not include the job context.",
  );
  assert(
    !coverOnlyPrompt.includes("TASK — CV") &&
      !coverOnlyPrompt.includes("REQUIRED OUTPUT SCHEMA") &&
      !coverOnlyPrompt.includes("REFERENCE CV"),
    "A cover-letter-only prompt included CV-only material.",
  );
  assert(
    !coverOnlyPrompt.includes('"schemaVersion"'),
    "A cover-letter-only prompt embedded the CV schema.",
  );

  const coverOnlyLetter = [
    "Dear Initech Team,",
    "",
    "I am writing about the platform engineering work described for Initech. I build reliable data systems and care about clear, measurable outcomes.",
    "",
    coverLetterFiller.repeat(6).trim(),
    "",
    "Best,",
    "Alex Example",
  ].join("\n");

  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  const coverOnlyEditor = page.getByPlaceholder(/Paste the full LLM response here/);
  await coverOnlyEditor.fill(JSON.stringify({ coverLetter: coverOnlyLetter }));
  await page.getByRole("button", { name: "Parse & validate" }).click();
  const coverLetterOnlyCard = page.locator('[data-deliverable-card="coverLetter"]');
  await coverLetterOnlyCard.waitFor();
  assert(
    (await coverLetterOnlyCard.locator(".badge.status").getAttribute("data-status")) === "valid",
    "A cover-letter-only envelope did not produce a valid cover-letter card.",
  );
  await coverLetterOnlyCard.getByRole("button", { name: "Preview", exact: true }).click();
  const coverOnlyPreview = coverLetterOnlyCard.getByTestId("cover-letter-preview");
  await coverOnlyPreview.waitFor();
  assert(
    (await coverOnlyPreview.innerText()).includes("Dear Initech Team"),
    "The cover-letter-only card did not render its preview.",
  );
  await coverLetterOnlyCard.getByRole("button", { name: "Copy Markdown", exact: true }).click();
  await page.waitForTimeout(250);
  assert(
    (await page.evaluate(() => navigator.clipboard.readText())) === coverOnlyLetter,
    "Copy Markdown did not copy the cover-letter-only message.",
  );
  const [coverOnlyDownload] = await Promise.all([
    page.waitForEvent("download"),
    coverLetterOnlyCard.getByRole("button", { name: "Download .md", exact: true }).click(),
  ]);
  assert(
    coverOnlyDownload.suggestedFilename().endsWith("-cover-letter.md"),
    `The cover-letter-only download was named "${coverOnlyDownload.suggestedFilename()}".`,
  );
  assert(
    readFileSync(await coverOnlyDownload.path(), "utf8") === coverOnlyLetter,
    "The downloaded cover-letter-only Markdown did not match the card.",
  );
  await coverLetterOnlyCard.getByRole("button", { name: "Save cover letter", exact: true }).click();
  await page.waitForTimeout(1200);
  const coverOnlySaved = (await readProjects()).find((entry) => {
    try {
      return JSON.parse(entry.projectJson || "{}").job?.company === "Initech";
    } catch {
      return false;
    }
  });
  assert(coverOnlySaved, "The cover-letter-only project disappeared after saving.");
  assert(
    coverOnlySaved.files.find((file) => file.name === "cover-letter.md")?.text ===
      coverOnlyLetter,
    "deliverables/cover-letter.md did not contain the cover-letter-only message.",
  );
  assert(
    !coverOnlySaved.projectJson.includes("Dear Initech Team") &&
      !coverOnlySaved.projectJson.includes("measurable outcomes"),
    "project.json duplicated the cover-letter-only message content.",
  );

  // The project cards use a neutral company fallback and do not repeat the
  // project name when an outreach project has no job title.
  await page.locator(".topnav button", { hasText: "Projects" }).click();
  const coverOnlyCard = page.locator(".project-card", { hasText: "Initech" });
  await coverOnlyCard.waitFor();
  const coverOnlyCompany = (
    await coverOnlyCard.locator(".project-card-company").innerText()
  ).trim();
  assert(
    coverOnlyCompany.toLowerCase() === "initech",
    `The cover-letter-only card used "${coverOnlyCompany}" as its company label.`,
  );
  assert(
    (await coverOnlyCard.locator("strong").innerText()).trim() === "Outreach",
    "The cover-letter-only card repeated the project name instead of using a neutral label.",
  );

  // A LinkedIn-only project may have no job or company and is identified by its
  // recipient. The recipient name must pre-fill the LinkedIn settings.
  await page.locator(".view-head button.primary").click();
  assert(
    await page.getByRole("checkbox", { name: "CV", exact: true }).isChecked(),
    "The New Project modal did not reset to the CV default.",
  );
  await page.getByRole("checkbox", { name: "LinkedIn message", exact: true }).check();
  await page.getByRole("checkbox", { name: "CV", exact: true }).uncheck();
  assert(
    (await page.getByLabel("Starting renderer").count()) === 0,
    "The renderer selector stayed visible for a LinkedIn-only project.",
  );
  await page.getByLabel("Recipient name").fill("Sam Rivera");
  assert(
    await page.locator(".modal button.primary").isEnabled(),
    "A recipient name did not enable Create for a LinkedIn-only project.",
  );
  await page.locator(".modal button.primary").click();
  await page.locator(".stage-tabs").waitFor();
  assert(
    (await page.locator(".stage-tabs button.active").innerText()).includes("1 · Target"),
    "A LinkedIn-only project did not open on Target.",
  );
  assert(
    (await page.locator(".project-head h1").innerText()).trim() ===
      "Outreach — Sam Rivera",
    "The LinkedIn-only project did not use the recipient display name.",
  );
  assert(
    await page.getByRole("checkbox", { name: "LinkedIn message", exact: true }).isChecked(),
    "The modal did not create the project with only the LinkedIn message selected.",
  );
  assert(
    !(await page.getByRole("checkbox", { name: "CV", exact: true }).isChecked()),
    "The LinkedIn-only project kept the CV selected.",
  );
  assert(
    (await page
      .locator('[data-deliverable="linkedinMessage"]')
      .getByPlaceholder("Jordan Example")
      .inputValue()) === "Sam Rivera",
    "The LinkedIn recipient name was not pre-filled.",
  );

  const linkedInProjects = (await readProjects())
    .map((entry) => ({ ...entry, record: JSON.parse(entry.projectJson || "{}") }))
    .filter(
      (entry) =>
        entry.record.deliverables?.settings?.linkedinMessage?.recipient?.name ===
        "Sam Rivera",
    );
  assert(
    linkedInProjects.length === 1,
    `Expected one LinkedIn-only project, found ${linkedInProjects.length}.`,
  );
  const linkedInOnly = linkedInProjects[0];
  assert(
    linkedInOnly.id.startsWith("sam-rivera-"),
    `The LinkedIn-only folder slug was "${linkedInOnly.id}".`,
  );
  assert(
    linkedInOnly.record.name === "Outreach — Sam Rivera",
    `The LinkedIn-only project name was "${linkedInOnly.record.name}".`,
  );
  assert(
    JSON.stringify(linkedInOnly.record.deliverables?.selected) ===
      JSON.stringify(["linkedinMessage"]),
    "project.json did not persist the LinkedIn-only selection.",
  );
  assert(
    linkedInOnly.record.deliverables?.settings?.coldEmail?.recipient?.name ===
      "Sam Rivera",
    "The recipient name was not kept for the cold-email settings.",
  );

  // LinkedIn-only prompt: the recipient block and the post-acceptance rules.
  await page.locator(".stage-tabs button", { hasText: "2 · Prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  const linkedInPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    linkedInPrompt.includes("TASK — LINKEDIN MESSAGE"),
    "A LinkedIn-only prompt did not include the LinkedIn task.",
  );
  assert(
    linkedInPrompt.includes("RECIPIENT") && linkedInPrompt.includes("Sam Rivera"),
    "A LinkedIn-only prompt did not include the recipient block.",
  );
  assert(
    linkedInPrompt.includes("connection request has already been accepted"),
    "A LinkedIn prompt did not state the post-acceptance rule.",
  );
  assert(
    linkedInPrompt.includes("300-character connection"),
    "A LinkedIn prompt did not rule out a connection-request note.",
  );
  assert(
    !linkedInPrompt.includes("TASK — CV") &&
      !linkedInPrompt.includes("REQUIRED OUTPUT SCHEMA"),
    "A LinkedIn-only prompt included CV-only material.",
  );

  // Add a cold email to the same no-job outreach project. The recipient block
  // and neutral no-job guidance apply, and the missing job description is not a
  // warning for a cold email.
  await page.locator(".stage-tabs button", { hasText: "1 · Target" }).click();
  await page.getByRole("checkbox", { name: "Cold email", exact: true }).check();
  const linkedInColdEmailPanel = page.locator('[data-deliverable="coldEmail"]');
  await linkedInColdEmailPanel
    .getByPlaceholder("Globex", { exact: true })
    .fill("Globex Robotics");
  await page.locator(".stage-tabs button", { hasText: "2 · Prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  await page.getByRole("button", { name: "Regenerate" }).click();
  const coldEmailPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    coldEmailPrompt.includes("TASK — COLD EMAIL"),
    "A cold-email request did not include the cold-email task.",
  );
  assert(
    coldEmailPrompt.includes("Sam Rivera") &&
      coldEmailPrompt.includes("Globex Robotics"),
    "A cold-email prompt did not include the recipient block.",
  );
  assert(
    coldEmailPrompt.includes("A missing job description is valid for outreach"),
    "A cold-email prompt did not use the neutral no-job text.",
  );
  assert(
    !coldEmailPrompt.includes("REQUIRED OUTPUT SCHEMA"),
    "A cold-email prompt embedded the CV schema.",
  );
  const coldEmailWarnings = page.getByTestId("prompt-warnings");
  const coldEmailWarningText = (await coldEmailWarnings.count())
    ? await coldEmailWarnings.innerText()
    : "";
  assert(
    !coldEmailWarningText.toLowerCase().includes("description"),
    `A cold-email request warned about a missing description: "${coldEmailWarningText}".`,
  );

  await page.locator(".topnav button", { hasText: "Projects" }).click();
  const linkedInCard = page.locator(".project-card", { hasText: "Outreach — Sam Rivera" });
  await linkedInCard.waitFor();
  const linkedInCardCompany = (
    await linkedInCard.locator(".project-card-company").innerText()
  ).trim();
  assert(
    linkedInCardCompany.toLowerCase() === "outreach",
    `The LinkedIn-only card used "${linkedInCardCompany}" as its company label.`,
  );

  // A CV-only project still uses the bare-CV contract, applies the CV, and
  // exports a real PDF into the project folder.
  await page.locator(".topnav button", { hasText: "Projects" }).click();
  await page.locator(".view-head button.primary").click();
  const cvOnlyModal = page.locator(".modal");
  assert(
    await cvOnlyModal.getByRole("checkbox", { name: "CV", exact: true }).isChecked(),
    "The New Project modal did not default a new CV-only project to the CV.",
  );
  for (const name of ["Cover letter", "Cold email", "LinkedIn message"]) {
    assert(
      !(await cvOnlyModal.getByRole("checkbox", { name, exact: true }).isChecked()),
      `A new CV-only project started with ${name} selected.`,
    );
  }
  await page.getByPlaceholder("Machine Learning Engineer").fill("Data Platform Engineer");
  await page.getByPlaceholder("Acme").fill("Umbrella Labs");
  await page.locator(".modal button.primary").click();
  await page.locator(".stage-tabs").waitFor();
  assert(
    (await page.locator(".stage-tabs button.active").innerText()).includes("1 · Target"),
    "A CV-only project did not open on Target.",
  );
  assert(
    (await page.locator(".stage-tabs button", { hasText: "4 · Preview" }).count()) === 1,
    "A CV-only project did not show the Preview tab.",
  );

  await page.locator(".stage-tabs button", { hasText: "2 · Prompt" }).click();
  await page.locator(".prompt-box").waitFor();
  const cvOnlyPrompt = await page.locator(".prompt-box").inputValue();
  assert(
    cvOnlyPrompt.includes("TASK — CV") &&
      cvOnlyPrompt.includes("Return the CV object directly"),
    "A CV-only prompt did not use the bare-CV contract.",
  );
  assert(
    !cvOnlyPrompt.includes('"coverLetter"') &&
      !cvOnlyPrompt.includes('"coldEmail"') &&
      !cvOnlyPrompt.includes('"linkedinMessage"'),
    "A CV-only prompt embedded an envelope key.",
  );
  assert(
    !cvOnlyPrompt.includes("TASK — COVER LETTER") &&
      !cvOnlyPrompt.includes("TASK — COLD EMAIL") &&
      !cvOnlyPrompt.includes("TASK — LINKEDIN MESSAGE"),
    "A CV-only prompt included a message task.",
  );

  await page.locator(".stage-tabs button", { hasText: "3 · Response" }).click();
  await page
    .getByPlaceholder(/Paste the CV JSON here/)
    .fill(JSON.stringify(sampleCv));
  await page.getByRole("button", { name: "Parse & validate" }).click();
  await page.getByRole("heading", { name: "Schema valid" }).waitFor();
  await page.getByRole("button", { name: "Apply to CV" }).click();
  await page.locator("iframe.cv-preview-frame").waitFor();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  await page
    .getByText(/Saved .*\.pdf to this project folder/)
    .waitFor({ timeout: 45000 });
  await page.waitForTimeout(1200);

  const cvOnlyPersisted = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(name);
    const projects = await workspace.getDirectoryHandle("projects");
    for await (const entry of projects.values()) {
      if (entry.kind !== "directory") continue;
      const directory = await projects.getDirectoryHandle(entry.name);
      let project = null;
      try {
        const file = await directory.getFileHandle("project.json");
        project = JSON.parse(await (await file.getFile()).text());
      } catch {
        continue;
      }
      if (project.job?.company !== "Umbrella Labs") continue;

      let cvName = "";
      let hasCvFile = false;
      try {
        const file = await directory.getFileHandle("cv.json");
        const cv = JSON.parse(await (await file.getFile()).text());
        cvName = cv.basics?.name ?? "";
        hasCvFile = true;
      } catch {
        // The missing cv.json is asserted below.
      }

      let hasPdf = false;
      for await (const fileEntry of directory.values()) {
        if (fileEntry.kind !== "file" || !fileEntry.name.endsWith(".pdf")) continue;
        const bytes = new Uint8Array(await (await fileEntry.getFile()).arrayBuffer());
        hasPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
      }

      const deliverables = [];
      try {
        const folder = await directory.getDirectoryHandle("deliverables");
        for await (const fileEntry of folder.values()) {
          if (fileEntry.kind === "file") deliverables.push(fileEntry.name);
        }
      } catch {
        // No deliverables folder was created.
      }

      return {
        id: entry.name,
        cvName,
        hasCvFile,
        hasPdf,
        deliverables,
        selected: project.deliverables?.selected ?? [],
        hasCvContent: Object.prototype.hasOwnProperty.call(project, "cv"),
        hasArtifacts: Object.prototype.hasOwnProperty.call(project, "artifacts"),
      };
    }
    return null;
  }, workspaceName);

  assert(cvOnlyPersisted, "The CV-only project was not written to the workspace.");
  assert(
    cvOnlyPersisted.hasCvFile &&
      cvOnlyPersisted.cvName.toLowerCase().includes("alex example"),
    `The CV-only project did not write cv.json: "${cvOnlyPersisted.cvName}".`,
  );
  assert(cvOnlyPersisted.hasPdf, "The CV-only project did not export a PDF.");
  assert(
    JSON.stringify(cvOnlyPersisted.selected) === JSON.stringify(["cv"]),
    `The CV-only project selection was "${JSON.stringify(cvOnlyPersisted.selected)}".`,
  );
  assert(
    !cvOnlyPersisted.hasCvContent && !cvOnlyPersisted.hasArtifacts,
    "project.json kept CV content or in-memory artifacts.",
  );
  assert(
    cvOnlyPersisted.deliverables.length === 0,
    `A CV-only project wrote message files: ${cvOnlyPersisted.deliverables.join(", ")}.`,
  );

  await page.locator(".topnav button", { hasText: "Settings" }).click();
  await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
  await page.getByRole("button", { name: "Change workspace folder" }).click();
  await page.getByRole("heading", { name: "Applications", exact: true }).waitFor({ timeout: 15000 });

  const switched = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    const workspace = await root.getDirectoryHandle(`${name}-second`);
    const profiles = await workspace.getDirectoryHandle("profiles");
    const profileFile = await profiles.getFileHandle("default.json");
    const profile = JSON.parse(await (await profileFile.getFile()).text());
    const projects = await workspace.getDirectoryHandle("projects");
    let projectCount = 0;
    for await (const entry of projects.values()) {
      if (entry.kind === "directory") projectCount += 1;
    }
    return { profileName: profile.basics.name, projectCount };
  }, workspaceName);
  assert(
    switched.profileName === "",
    `Switching workspaces leaked the old profile: "${switched.profileName}".`,
  );
  assert(switched.projectCount === 0, "A new workspace should not contain the old project.");

  assert(errors.length === 0, `Browser errors:\n${errors.join("\n")}`);
  console.log("Smoke test passed.");
} finally {
  if (browser) await browser.close();
  try {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}
