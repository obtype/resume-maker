import mammoth from "mammoth";
import TurndownService from "turndown";

export interface PdrImport {
  sourceName: string;
  sourceKind: "docx" | "md" | "txt";
  markdown: string;
}

export function docxHtmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  turndown.addRule("lineBreak", {
    filter: "br",
    replacement: () => "  \n",
  });
  return turndown
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function importPdrFile(file: File): Promise<PdrImport> {
  const name = file.name;
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return {
      sourceName: name,
      sourceKind: "docx",
      markdown: docxHtmlToMarkdown(result.value),
    };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return { sourceName: name, sourceKind: "md", markdown: await file.text() };
  }
  if (lower.endsWith(".txt")) {
    return { sourceName: name, sourceKind: "txt", markdown: await file.text() };
  }
  if (lower.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not supported. Save the document as .docx, .md, or .txt first.");
  }
  throw new Error("Unsupported file type. Use .docx, .md, or .txt.");
}
