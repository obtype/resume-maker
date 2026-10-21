import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { buildPreviewDoc } from "../core/render/previewDoc";
import { styleToCssVars } from "../core/style";
import type { CvContent, CvStyle, RendererModule } from "../core/cv/types";

export interface CvPreviewHandle {
  print: (title: string) => void;
  refresh: () => void;
  format: (command: string) => void;
  fontSize: (pt: number) => void;
  checkOverflow: () => void;
}

interface Props {
  renderer: RendererModule;
  cv: CvContent;
  style: CvStyle;
  editing: boolean;
  title: string;
  previewKey: number;
  onEdit: (path: string, text: string, html: string) => void;
  onOverflow: (clipped: boolean, pages: number) => void;
}

export const CvPreview = forwardRef<CvPreviewHandle, Props>(function CvPreview(
  { renderer, cv, style, editing, title, previewKey, onEdit, onOverflow },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const cvRef = useRef(cv);
  const styleRef = useRef(style);
  const editingRef = useRef(editing);
  const titleRef = useRef(title);
  const onEditRef = useRef(onEdit);
  const onOverflowRef = useRef(onOverflow);
  const readyRef = useRef(false);
  const [doc, setDoc] = useState("");
  const [internalKey, setInternalKey] = useState(0);

  cvRef.current = cv;
  styleRef.current = style;
  editingRef.current = editing;
  titleRef.current = title;
  onEditRef.current = onEdit;
  onOverflowRef.current = onOverflow;

  const post = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  };

  useEffect(() => {
    readyRef.current = false;
    setDoc(
      buildPreviewDoc({
        renderer,
        cv: cvRef.current,
        style: styleRef.current,
        editing: editingRef.current,
        title: titleRef.current,
      }),
    );
  }, [renderer.meta.id, previewKey, internalKey]);

  useEffect(() => {
    if (!readyRef.current) return;
    post({ type: "cv:style", vars: styleToCssVars(style) });
  }, [style]);

  useEffect(() => {
    if (!readyRef.current) return;
    post({ type: "cv:set-editing", enabled: editing });
  }, [editing]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      switch (data.type) {
        case "cv:ready":
          readyRef.current = true;
          post({ type: "cv:style", vars: styleToCssVars(styleRef.current) });
          post({ type: "cv:set-editing", enabled: editingRef.current });
          post({ type: "cv:check-overflow" });
          break;
        case "cv:edit":
          onEditRef.current(
            String(data.path ?? ""),
            String(data.text ?? ""),
            String(data.html ?? ""),
          );
          break;
        case "cv:sync": {
          const fields = Array.isArray(data.fields) ? data.fields : [];
          for (const field of fields as Array<Record<string, unknown>>) {
            onEditRef.current(
              String(field.path ?? ""),
              String(field.text ?? ""),
              String(field.html ?? ""),
            );
          }
          break;
        }
        case "cv:overflow":
          onOverflowRef.current(Boolean(data.clipped), Number(data.pages ?? 1));
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  useImperativeHandle(ref, () => ({
    print: (printTitle: string) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) return;
      try {
        win.document.title = printTitle;
      } catch {
        // The title is only a convenience for the PDF filename.
      }
      win.focus();
      win.print();
    },
    refresh: () => setInternalKey((key) => key + 1),
    format: (command: string) => post({ type: "cv:format", command }),
    fontSize: (pt: number) => post({ type: "cv:font-size", pt }),
    checkOverflow: () => post({ type: "cv:check-overflow" }),
  }));

  return (
    <iframe
      ref={iframeRef}
      className="cv-preview-frame"
      title="CV preview"
      srcDoc={doc}
    />
  );
});
