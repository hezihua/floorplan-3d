"use client";

import { useEffect } from "react";
import { editorMarkup } from "./editor-markup";

const markupWithoutGlobalActions = editorMarkup
  .replace(/<button class="btn" id="langBtn"[\s\S]*?<\/button>/, "")
  .replace(/<button class="btn" id="fullscreen"[\s\S]*?<\/button>/, "");

export default function Editor({ planId }: { planId: string }) {
  useEffect(() => {
    let cancelled = false;

    void import("./editor-runtime.js").then(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return <div className="editor-shell" data-plan-id={planId} dangerouslySetInnerHTML={{ __html: markupWithoutGlobalActions }} />;
}
