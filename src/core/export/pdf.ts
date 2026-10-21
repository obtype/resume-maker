/**
 * Ask the local Node server to render the standalone CV HTML to a PDF using
 * headless Chrome. The PDF bytes are returned to the browser, which then writes
 * them into the project folder through the File System Access handle.
 */
export async function requestPdf(html: string, filename: string): Promise<Blob> {
  const response = await fetch("/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `PDF server returned ${response.status}.`);
  }
  return response.blob();
}
