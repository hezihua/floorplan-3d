"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { parseDxf } from "./dxf-import.js";
import { createImportedFloorplan, ensureFloorplanStorage, floorplanKey, LEGACY_STATE_KEY, PROJECTS_KEY, removeFloorplanStorage } from "./project-store.js";
import styles from "./floorplan-list.module.css";

type Project = { id: string; name: string; createdAt: number; updatedAt: number; schemeCount?: number; areaM2?:number; units?:string; originalScale?:number|null };
const polygonArea = (poly:number[][]) => Math.abs(poly.reduce((sum,[x,y],i) => { const [nx,ny]=poly[(i+1)%poly.length]; return sum+x*ny-nx*y; },0)/2);
function readFloorplanInfo(project:Project) {
  try {
    const geometry = JSON.parse(localStorage.getItem(floorplanKey(project.id)) || "null");
    if (Array.isArray(geometry?.rooms) && geometry.rooms.length) {
      const areaM2 = geometry.rooms.filter((room:{counted?:boolean}) => room.counted !== false).reduce((sum:number,room:{poly?:number[][]}) => { const poly=room.poly; return sum + (poly && poly.length >= 3 ? polygonArea(poly) : 0); },0) / 1_000_000;
      return {areaM2:Math.round(areaM2*100)/100,units:geometry.units || "mm",originalScale:null};
    }
  } catch {}
  if (project.areaM2 != null) return {areaM2:project.areaM2,units:project.units || "mm",originalScale:project.originalScale ?? null};
  // The built-in plan uses this fixed source drawing; imported plans always carry their own geometry.
  if (project.id === "my-floorplan") return {areaM2:87.18,units:"mm",originalScale:60};
  return null;
}
function readProjects(): Project[] {
  try {
    const value = JSON.parse(localStorage.getItem(PROJECTS_KEY) || "null");
    if (Array.isArray(value) && value.every(p => p && typeof p.id === "string" && typeof p.name === "string")) {
      value.forEach(p => { p.schemeCount = ensureFloorplanStorage(p.id).schemes.length; Object.assign(p,readFloorplanInfo(p) || {}); });
      return value.sort((a,b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    }
  } catch { /* create a fresh local project list */ }

  const now = Date.now();
  const initial: Project = { id: "my-floorplan", name: "我的户型", createdAt: now, updatedAt: now, schemeCount: 1 };
  const oldState = localStorage.getItem(LEGACY_STATE_KEY);
  if (oldState) localStorage.setItem(`${LEGACY_STATE_KEY}:${initial.id}`, oldState);
  localStorage.setItem(PROJECTS_KEY, JSON.stringify([initial]));
  ensureFloorplanStorage(initial.id);
  return [initial];
}

const dateText = (time: number, lang:"zh"|"en") => Number.isFinite(time)
  ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time)
  : "尚未编辑";

export default function FloorplanList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [ready, setReady] = useState(false);
  const [lang, setLang] = useState<"zh"|"en">("zh");
  const dxfInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjects(readProjects()); setReady(true);
    try { setLang(localStorage.getItem("huxing-lang") === "en" ? "en" : "zh"); } catch {}
    const onLanguage = (event: Event) => setLang((event as CustomEvent).detail === "en" ? "en" : "zh");
    window.addEventListener("floorplan-language-change", onLanguage);
    return () => window.removeEventListener("floorplan-language-change", onLanguage);
  }, []);
  const t = (zh:string,en:string) => lang === "zh" ? zh : en;

  const persist = (next: Project[]) => {
    const sorted = [...next].sort((a,b) => b.updatedAt - a.updatedAt);
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(sorted));
    setProjects(sorted);
  };

  const importFloorplan = () => dxfInput.current?.click();

  const onDxfSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const geometry = parseDxf(await file.text());
      const summary = `${t(`识别到 ${geometry.rooms.length} 个房间、${geometry.walls.length} 段墙体、${geometry.wins.length} 个窗和 ${geometry.doors.length} 扇门。`,`Found ${geometry.rooms.length} rooms, ${geometry.walls.length} wall segments, ${geometry.wins.length} windows and ${geometry.doors.length} doors.`)}${geometry.warnings.length ? `\n\n${geometry.warnings.join("\n")}` : ""}\n\n${t("导入并打开这个户型？","Import and open this floorplan?")}`;
      if (!window.confirm(summary)) return;

      const now = Date.now(), id = `plan-${now.toString(36)}-${Math.random().toString(36).slice(2,7)}`;
      const name = file.name.replace(/\.dxf$/i, "").trim() || `${t("户型","Floorplan")} ${projects.length + 1}`;
    const project: Project = { id, name, createdAt: now, updatedAt: now, schemeCount: 1 };
      const rooms = Object.fromEntries(geometry.rooms.map((room: {id:string;name:string;mat?:string}) => [room.id, {name:room.name,mat:room.mat || "tile800"}]));
      const plan = {rooms:geometry.rooms,walls:geometry.walls,wins:geometry.wins,doors:geometry.doors,slides:geometry.slides,wallHeight:geometry.wallHeight,units:geometry.units};
      createImportedFloorplan(id,plan,{furniture:[],rooms,demolished:[],measures:[]},now);
      persist([project, ...projects]);
      window.location.href = `/editor/${encodeURIComponent(id)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件格式不受支持";
      window.alert(`${t("DXF 导入失败：","DXF import failed: ")}${message}`);
    } finally {
      event.target.value = "";
    }
  };

  const rename = (project: Project) => {
    const name = window.prompt(t("户型名称","Floorplan name"), project.name)?.trim();
    if (name) persist(projects.map(p => p.id === project.id ? {...p, name, updatedAt:Date.now()} : p));
  };

  const remove = (project: Project) => {
    if (!window.confirm(t(`删除“${project.name}”及其 ${project.schemeCount ?? 1} 套方案？此操作不可撤销。`,`Delete “${project.name}” and its ${project.schemeCount ?? 1} schemes? This cannot be undone.`))) return;
    removeFloorplanStorage(project.id);
    persist(projects.filter(p => p.id !== project.id));
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerRight}><span className={styles.local}>{t("仅保存在此浏览器","Saved in this browser")}</span><button className={styles.primary} onClick={importFloorplan}>⇧ {t("导入户型","Import floorplan")}</button><input ref={dxfInput} className={styles.fileInput} type="file" accept=".dxf,application/dxf" onChange={onDxfSelected} /></div>
    </header>
    <section className={styles.content}>
      <div className={styles.intro}><div><span className={styles.eyebrow}>{t("我的项目","MY PROJECTS")}</span><h1>{t("户型图","Floorplans")}</h1><p>{t("打开列表中的户型继续编辑，或导入新的 DXF 户型图。","Open a floorplan to continue, or import a new DXF file.")}</p></div><span className={styles.count}>{ready ? t(`${projects.length} 个户型`,`${projects.length} floorplans`) : t("读取中…","Loading…")}</span></div>
      {!ready ? null : projects.length ? <div className={styles.grid}>{projects.map((project, i) => <article className={styles.card} key={project.id}>
        <a className={styles.open} href={`/editor/${encodeURIComponent(project.id)}`} aria-label={`打开 ${project.name}`}>
          <div className={`${styles.preview} ${i % 3 === 1 ? styles.previewAlt : i % 3 === 2 ? styles.previewWarm : ""}`}>
            <svg viewBox="0 0 240 150" aria-hidden="true"><path d="M53 23h132v104H53zM53 62h39v65m0-104v43h44V23m0 43h49M92 62h44m0 0v65m0-31h49"/><path className={styles.furn} d="M64 32h27v20H64zm84 0h28v24h-28zM64 80h20v31H64zm83 22h27v17h-27z"/></svg>
            <span className={styles.previewTag}>2D · 3D</span>
          </div>
      <div className={styles.cardInfo}><strong>{project.name}</strong>{(() => { const info=readFloorplanInfo(project); return info ? <span className={styles.floorplanMeta}>{t(`户型面积约 ${info.areaM2.toFixed(2)} m² · 单位 ${info.units}${info.originalScale ? ` · 原图比例 1:${info.originalScale}` : " · DXF 导入"}`,`Floor area ≈ ${info.areaM2.toFixed(2)} m² · Units ${info.units}${info.originalScale ? ` · Original scale 1:${info.originalScale}` : " · DXF import"}`)}</span> : null; })()}<span>{t(`${project.schemeCount ?? 1} 套方案 · 最近编辑 ${dateText(project.updatedAt,lang)}`,`${project.schemeCount ?? 1} schemes · Updated ${dateText(project.updatedAt,lang)}`)}</span></div>
        </a>
        <div className={styles.cardActions}><button onClick={() => rename(project)}>{t("重命名","Rename")}</button><button className={styles.delete} onClick={() => remove(project)}>{t("删除","Delete")}</button></div>
      </article>)}</div> : <div className={styles.empty}><div className={styles.emptyIcon}>⌂</div><strong>{t("还没有户型图","No floorplans yet")}</strong><p>{t("导入一张 DXF 户型图开始设计。","Import a DXF floorplan to get started.")}</p><button className={styles.primary} onClick={importFloorplan}>⇧ {t("导入户型","Import floorplan")}</button></div>}
      <p className={styles.note}>{t("户型数据保存在当前浏览器中。清理浏览器数据或更换设备前，请在编辑器里导出方案 JSON 备份。","Floorplans are stored in this browser. Export your scheme JSON before clearing browser data or changing devices.")}</p>
    </section>
  </main>;
}
