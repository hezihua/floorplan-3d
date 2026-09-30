"use client";

import { useEffect } from "react";
import { editorMarkup } from "./editor-markup";

export default function Editor() {
  useEffect(() => {
    let cancelled = false;

    void import("./editor-runtime.js").then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: editorMarkup }} />;
}
