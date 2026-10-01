"use client";

import { useEffect, useState } from "react";
import styles from "./global-bar.module.css";

const LANG_KEY = "huxing-lang";

export default function GlobalBar() {
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [fullscreen, setFullscreen] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    try { setLang(localStorage.getItem(LANG_KEY) === "en" ? "en" : "zh"); } catch { /* use Chinese */ }
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement || (document as Document & {webkitFullscreenElement?:Element}).webkitFullscreenElement));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey && event.key.toLowerCase() === "f") {
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
        event.preventDefault(); void toggleFullscreen();
      }
    };
    const nav = navigator as Navigator & {standalone?:boolean};
    setStandalone(Boolean(nav.standalone || window.matchMedia("(display-mode: standalone)").matches));
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      document.removeEventListener("webkitfullscreenchange", syncFullscreen);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const toggleLanguage = () => {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* language remains active for this page */ }
    window.dispatchEvent(new CustomEvent("floorplan-language-change", { detail: next }));
  };

  const toggleFullscreen = async () => {
    const doc = document as Document & {webkitExitFullscreen?:()=>Promise<void>|void;webkitFullscreenElement?:Element};
    const root = document.documentElement as HTMLElement & {webkitRequestFullscreen?:()=>Promise<void>|void};
    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
      else await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    } catch { /* the browser can deny fullscreen requests */ }
  };

  return <div className={styles.bar}>
    <a className={styles.brand} href="/" aria-label={lang === "zh" ? "返回首页" : "Return home"}><span>户</span><strong>{lang === "zh" ? "户型设计" : "Floorplan Studio"}</strong></a>
    <div className={styles.spacer} />
    <button className={styles.button} onClick={toggleLanguage} title="Switch language / 切换语言">{lang === "zh" ? "EN" : "中文"}</button>
    {!standalone && <button className={styles.button} onClick={() => void toggleFullscreen()} title={fullscreen ? (lang === "zh" ? "退出全屏 (Shift+F)" : "Exit fullscreen (Shift+F)") : (lang === "zh" ? "全屏 (Shift+F)" : "Fullscreen (Shift+F)")}>{fullscreen ? (lang === "zh" ? "⛶ 退出全屏" : "⛶ Exit fullscreen") : (lang === "zh" ? "⛶ 全屏" : "⛶ Fullscreen")}</button>}
  </div>;
}
