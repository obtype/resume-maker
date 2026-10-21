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
    contact: ["alex@example.com", "+1 555 0100", "Berlin, Germany"],
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
  const page = await context.newPage();
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
    let hasPdf = false;
    let pdfBase64 = "";
    let projectJsonHasCv = false;
    for await (const entry of projects.values()) {
      if (entry.kind !== "directory") continue;
      const projectDir = await projects.getDirectoryHandle(entry.name);
      try {
        const file = await projectDir.getFileHandle("cv.json");
        const text = await (await file.getFile()).text();
        cvName = JSON.parse(text).basics.name;
      } catch {
        // no cv.json yet
      }
      try {
        const projectFile = await projectDir.getFileHandle("project.json");
        const projectData = JSON.parse(await (await projectFile.getFile()).text());
        projectJsonHasCv = Object.prototype.hasOwnProperty.call(projectData, "cv");
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
    return { cvName, hasPdf, pdfBase64, projectJsonHasCv };
  }, workspaceName);
  if (process.env.PDF_OUT && persisted.pdfBase64) {
    writeFileSync(process.env.PDF_OUT, Buffer.from(persisted.pdfBase64, "base64"));
  }
  assert(persisted.cvName.toLowerCase().includes("alex example"), `Persisted CV name was "${persisted.cvName}".`);
  assert(persisted.hasPdf, "The exported PDF was not written to the project folder.");
  assert(!persisted.projectJsonHasCv, "project.json must not duplicate CV content.");

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
