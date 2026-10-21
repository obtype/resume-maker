import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter((value): value is string => Boolean(value));

/**
 * Render a standalone CV document to a real A4 PDF using headless Chrome.
 * This runs only in the local Node server. The browser never sends the CV to
 * a third party; the HTML comes from the same machine.
 */
export async function exportPdf(html: string): Promise<Uint8Array> {
  if (!html || html.length > 8_000_000) {
    throw new Error("The CV document is empty or too large.");
  }
  const executablePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
  const browser = await chromium.launch(
    executablePath
      ? { executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] }
      : { channel: "chrome", args: ["--no-sandbox", "--disable-dev-shm-usage"] },
  );
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      return true;
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
}
