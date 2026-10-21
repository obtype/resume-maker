import { useEffect, useRef, useState } from "react";
import type { Profile, Project } from "../../core/project";
import type { CvStyle } from "../../core/cv/types";
import { defaultStyle } from "../../core/style";
import { getRenderer, RENDERERS } from "../../renderers/registry";
import { getSchema } from "../../core/cv/schema";
import { CvPreview, type CvPreviewHandle } from "../../components/CvPreview";
import { pathSet } from "../../core/cv/paths";
import { migrateCv } from "../../core/cv/migrate";
import { validateCv } from "../../core/cv/validate";
import { projectCvFilename } from "../../core/workspace/projects";
import { downloadBlob, downloadFile } from "../../core/download";
import { buildPrintDoc } from "../../core/render/previewDoc";
import { requestPdf } from "../../core/export/pdf";

interface Props {
  project: Project;
  profile: Profile;
  onChange: (updater: (project: Project) => Project) => void;
  onOpenPrompt: () => void;
  onOpenImport: () => void;
  onSavePdf: (blob: Blob, filename: string) => Promise<boolean>;
}

export function PreviewStage({ project, profile, onChange, onOpenPrompt, onOpenImport, onSavePdf }: Props) {
  const renderer = getRenderer(project.rendererId);
  const style = project.styles[project.rendererId] ?? defaultStyle();
  const [editing, setEditing] = useState(true);
  const [previewKey, setPreviewKey] = useState(0);
  const [overflow, setOverflow] = useState({ clipped: false, pages: 1 });
  const [fontSize, setFontSize] = useState(9);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const previewRef = useRef<CvPreviewHandle>(null);
  const cvFileRef = useRef<HTMLInputElement>(null);
  const exportingRef = useRef(false);
  const projectIdRef = useRef(project.id);
  const schemaIdRef = useRef(project.schemaId);
  projectIdRef.current = project.id;
  schemaIdRef.current = project.schemaId;
  const filename = projectCvFilename(project, profile);

  useEffect(() => {
    setPreviewKey((key) => key + 1);
    setOverflow({ clipped: false, pages: 1 });
    setStatus("");
  }, [project.id]);

  const updateStyle = (patch: Partial<CvStyle>) => {
    onChange((current) => ({
      ...current,
      styles: {
        ...current.styles,
        [current.rendererId]: {
          ...(current.styles[current.rendererId] ?? defaultStyle()),
          ...patch,
        },
      },
    }));
  };

  const handleEdit = (path: string, text: string, html: string) => {
    if (!path) return;
    onChange((current) => {
      const cv = structuredClone(current.cv) as unknown as Record<string, unknown>;
      pathSet(cv, path, text);
      const currentStyle = current.styles[current.rendererId] ?? defaultStyle();
      return {
        ...current,
        cv: cv as unknown as Project["cv"],
        styles: {
          ...current.styles,
          [current.rendererId]: {
            ...currentStyle,
            fieldHtml: { ...currentStyle.fieldHtml, [path]: html },
            fieldText: { ...currentStyle.fieldText, [path]: text },
          },
        },
      };
    });
  };

  const changeRenderer = (id: string) => {
    const next = getRenderer(id);
    onChange((current) => {
      const nextSchema = next.meta.schemas.includes(current.schemaId)
        ? current.schemaId
        : next.meta.schemas[0];
      const styles = { ...current.styles };
      if (!styles[id]) styles[id] = defaultStyle();
      return { ...current, rendererId: id, schemaId: nextSchema, styles };
    });
    setPreviewKey((key) => key + 1);
  };

  const print = () => {
    if (overflow.clipped) {
      setStatus("The CV is clipped. Print anyway, or trim content first.");
    }
    previewRef.current?.print(`${filename}.pdf`);
  };

  const exportPdf = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setStatus("Rendering PDF with headless Chrome…");
    let blob: Blob;
    try {
      const html = buildPrintDoc({
        renderer,
        cv: project.cv,
        style,
        title: `${filename}.pdf`,
      });
      blob = await requestPdf(html, `${filename}.pdf`);
    } catch (error) {
      setStatus(
        `Automatic PDF export is unavailable (${(error as Error).message}). Opening the print dialog instead.`,
      );
      exportingRef.current = false;
      setExporting(false);
      previewRef.current?.print(`${filename}.pdf`);
      return;
    }
    try {
      const saved = await onSavePdf(blob, `${filename}.pdf`);
      if (saved) {
        setStatus(`Saved ${filename}.pdf to this project folder.`);
      } else {
        downloadBlob(`${filename}.pdf`, blob);
        setStatus("PDF ready. Your browser downloaded it.");
      }
    } catch (error) {
      downloadBlob(`${filename}.pdf`, blob);
      setStatus(
        `Could not write the PDF into the project folder (${(error as Error).message}). Downloaded instead.`,
      );
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const downloadJson = () => {
    downloadFile(`${filename}.json`, `${JSON.stringify(project.cv, null, 2)}\n`);
    setStatus("Downloaded CV JSON.");
  };

  const loadCvJson = async (file: File | undefined) => {
    if (!file) return;
    const targetId = project.id;
    const targetSchema = project.schemaId;
    try {
      const parsed = JSON.parse(await file.text());
      if (projectIdRef.current !== targetId || schemaIdRef.current !== targetSchema) return;
      const migrated = migrateCv(parsed, targetSchema);
      const check = validateCv(migrated.cv, targetSchema);
      if (!check.valid) {
        setStatus(
          `CV JSON does not match schema "${targetSchema}": ${check.errors
            .map((issue) => `${issue.path} ${issue.message}`)
            .join("; ")}`,
        );
        return;
      }
      onChange((current) => {
        const currentStyle = current.styles[current.rendererId] ?? defaultStyle();
        return {
          ...current,
          cv: check.data,
          styles: {
            ...current.styles,
            [current.rendererId]: migrated.wasLegacy
              ? { ...currentStyle, ...migrated.style }
              : currentStyle,
          },
        };
      });
      setPreviewKey((key) => key + 1);
      setStatus(migrated.wasLegacy ? "Loaded and migrated legacy CV JSON." : "Loaded CV JSON.");
    } catch (error) {
      setStatus(`Could not load CV JSON: ${(error as Error).message}`);
    } finally {
      if (cvFileRef.current) cvFileRef.current.value = "";
    }
  };

  return (
    <div className="stage preview-stage">
      <div className="stage-head">
        <div>
          <h2>Preview</h2>
          <p className="muted">
            Edit directly on the page when editing is on. Global font size and spacing update every
            renderer that follows the contract.
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={downloadJson}>Download CV JSON</button>
          <button className="secondary" onClick={() => cvFileRef.current?.click()}>Load CV JSON</button>
          <input
            ref={cvFileRef}
            hidden
            type="file"
            accept=".json,application/json"
            onChange={(event) => void loadCvJson(event.target.files?.[0])}
          />
          <button className="secondary" onClick={print}>Print</button>
          <button className="primary" onClick={() => void exportPdf()} disabled={exporting}>
            {exporting ? "Rendering PDF…" : "Save PDF"}
          </button>
        </div>
      </div>

      <div className="preview-toolbar">
        <label className="toolbar-field">
          <span>Renderer</span>
          <select value={project.rendererId} onChange={(event) => changeRenderer(event.target.value)}>
            {RENDERERS.map((item) => (
              <option key={item.meta.id} value={item.meta.id}>{item.meta.name}</option>
            ))}
          </select>
        </label>
        <label className="toolbar-field">
          <span>Schema</span>
          <select
            value={project.schemaId}
            onChange={(event) =>
              onChange((current) => ({ ...current, schemaId: event.target.value }))
            }
          >
            {renderer.meta.schemas.map((id) => (
              <option key={id} value={id}>{getSchema(id).name}</option>
            ))}
          </select>
        </label>
        <span className="toolbar-sep" />
        <button className={editing ? "toggle on" : "toggle"} onClick={() => setEditing((value) => !value)}>
          Editing: {editing ? "On" : "Off"}
        </button>
        <button className="tool" onClick={() => previewRef.current?.format("bold")} title="Bold"><b>B</b></button>
        <button className="tool" onClick={() => previewRef.current?.format("italic")} title="Italic"><i>I</i></button>
        <button className="tool" onClick={() => previewRef.current?.format("underline")} title="Underline"><u>U</u></button>
        <button className="tool" onClick={() => previewRef.current?.format("removeFormat")} title="Clear formatting">Clear</button>
        <label className="toolbar-field compact">
          <span>Selection</span>
          <input
            type="number"
            min={5}
            max={48}
            step={0.5}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
          <button className="tool" onClick={() => previewRef.current?.fontSize(fontSize)}>Apply</button>
        </label>
      </div>

      <div className="preview-toolbar">
        {renderer.meta.controls.typeScale && (
          <label className="toolbar-field">
            <span>Text size {style.typeScale.toFixed(2)}×</span>
            <input
              type="range"
              min={0.75}
              max={1.35}
              step={0.01}
              value={style.typeScale}
              onChange={(event) => updateStyle({ typeScale: Number(event.target.value) })}
            />
          </label>
        )}
        {renderer.meta.controls.spacing && (
          <label className="toolbar-field">
            <span>Spacing {style.verticalScale.toFixed(2)}</span>
            <input
              type="range"
              min={0.4}
              max={1.1}
              step={0.01}
              value={style.verticalScale}
              onChange={(event) => updateStyle({ verticalScale: Number(event.target.value) })}
            />
          </label>
        )}
        {renderer.meta.controls.margins && (
          <label className="toolbar-field">
            <span>Margins {style.marginMm} mm</span>
            <input
              type="range"
              min={3}
              max={11}
              step={0.5}
              value={style.marginMm}
              onChange={(event) => updateStyle({ marginMm: Number(event.target.value) })}
            />
          </label>
        )}
        {renderer.meta.controls.sidebar && (
          <label className="toolbar-field">
            <span>Sidebar {style.sidebarMm} mm</span>
            <input
              type="range"
              min={42}
              max={65}
              step={1}
              value={style.sidebarMm}
              onChange={(event) => updateStyle({ sidebarMm: Number(event.target.value) })}
            />
          </label>
        )}
        <button className="ghost" onClick={() => previewRef.current?.refresh()}>Refresh preview</button>
        <span className="grow" />
        <button className="link" onClick={onOpenPrompt}>Prompt</button>
        <button className="link" onClick={onOpenImport}>Import response</button>
      </div>

      {overflow.clipped && (
        <div className="callout warn">
          Content is clipped on the A4 page. Reduce bullets, text size, or spacing before saving the PDF.
          {overflow.pages > 1 ? ` (${overflow.pages} page elements detected.)` : ""}
        </div>
      )}
      {status && <p className="callout">{status}</p>}

      <CvPreview
        key={project.id}
        ref={previewRef}
        renderer={renderer}
        cv={project.cv}
        style={style}
        editing={editing}
        title={`${filename}.pdf`}
        previewKey={previewKey}
        onEdit={handleEdit}
        onOverflow={(clipped, pages) => setOverflow({ clipped, pages })}
      />
    </div>
  );
}
