import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
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
      return root.getDirectoryHandle(folder, { create: true });
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
  await page.getByPlaceholder("Machine Learning Engineer").fill("Machine Learning Engineer");
  await page.getByPlaceholder("Acme").fill("Acme");
  await page.locator(".modal button.primary").click();
  await page.locator(".stage-tabs").waitFor();

  await page
    .getByPlaceholder(/Paste the full job posting here/)
    .fill("Own perception models for edge devices. Python, PyTorch, C++, real-time inference.");
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

  await page.getByRole("button", { name: "Next: import" }).click();
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
    for await (const entry of projects.values()) {
      if (entry.kind !== "directory") continue;
      const projectDir = await projects.getDirectoryHandle(entry.name);
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
    return { cvName, cvContact, hasPdf, pdfBase64, projectJsonHasCv, styles };
  }, workspaceName);
  if (process.env.PDF_OUT && persisted.pdfBase64) {
    writeFileSync(process.env.PDF_OUT, Buffer.from(persisted.pdfBase64, "base64"));
  }
  assert(persisted.cvName.toLowerCase().includes("alex example"), `Persisted CV name was "${persisted.cvName}".`);
  assert(persisted.hasPdf, "The exported PDF was not written to the project folder.");
  assert(!persisted.projectJsonHasCv, "project.json must not duplicate CV content.");
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

  await page.locator(".topnav button", { hasText: "Settings" }).click();
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
