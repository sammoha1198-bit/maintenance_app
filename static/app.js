/* ============================== app.js =============================== */
"use strict";

/* -------- Config -------- */
const API_BASE = ""; // same-origin for local + Render

/* -------- Helpers -------- */
const qs  = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
const log = (...a)=>console.log("[app]",...a);
const err = (...a)=>console.error("[app]",...a);

async function getJSON(url){
  try{
    const r = await fetch(url, { credentials:"same-origin" });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ err("GET failed:", url, e); return null; }
}
function download(url){ window.location.href = url; }

function setFixedCanvas(c, h=320){
  if(!c) return;
  c.style.width = "100%";
  c.style.height = `${h}px`;
  if(!c.getAttribute("height")) c.setAttribute("height", String(h));
}

/* -------- Panel / Block toggling -------- */
const PANELS = {
  home : ()=>qs("#panel-home"),
  issue: ()=>qs("#panel-issue"),
  rehab: ()=>qs("#panel-rehab"),
};
function showPanel(name){
  const all = [PANELS.home(), PANELS.issue(), PANELS.rehab()].filter(Boolean);
  all.forEach(p=>{ p.hidden = true; p.style.display="none"; });
  const t = PANELS[name] && PANELS[name]();
  if(t){ t.hidden = false; t.style.display=""; }
}

const BLOCKS = {
  cab: ()=>qs("#block-cab"),
  ast: ()=>qs("#block-ast"),
  spa: ()=>qs("#block-spa"),
};
function showBlock(name){
  const all = [BLOCKS.cab(), BLOCKS.ast(), BLOCKS.spa()].filter(Boolean);
  all.forEach(b=>{ b.classList.add("hidden"); });
  const t = BLOCKS[name] && BLOCKS[name]();
  if(t) t.classList.remove("hidden");
}

/* -------- Date inputs -------- */
function getYearMonth(){
  const now = new Date();
  const y = parseInt(qs("#year")?.value || now.getFullYear(), 10);
  const m = parseInt(qs("#month")?.value || (now.getMonth()+1), 10);
  return { year: y, month: m };
}

/* -------- Charts (Chart.js) -------- */
let CH = { cab:null, ast:null, spa:null };

function destroyChart(ref){ try{ ref?.destroy?.(); }catch{} }

function drawCabPie(data){
  const c = qs("#cabPie"); if(!c || !window.Chart || !data) return;
  setFixedCanvas(c, 320); destroyChart(CH.cab);
  const labels = ["ATS","AMF","HYBRID","حماية انفرتر","ظفيرة تحكم"];
  const values = labels.map(k=> Number(data[k]||0));
  CH.cab = new Chart(c.getContext("2d"), {
    type:"pie",
    data:{ labels, datasets:[{ data: values }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:600} }
  });
}

function drawAssetsBar(data){
  const c = qs("#assetsBar"); if(!c || !window.Chart || !data) return;
  setFixedCanvas(c, 320); destroyChart(CH.ast);
  const labels = ["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"];
  const values = labels.map(k=> Number(data[k]||0));
  CH.ast = new Chart(c.getContext("2d"), {
    type:"bar",
    data:{ labels, datasets:[{ label:"عدد", data: values }] },
    options:{
      responsive:true, maintainAspectRatio:false, animation:{duration:600},
      scales:{ y:{ beginAtZero:true, suggestedMax: Math.max(5, Math.max(...values)+1) } }
    }
  });
}

function drawSparesBar(data){
  const c = qs("#sparesBar"); if(!c || !window.Chart || !data) return;
  setFixedCanvas(c, 320); destroyChart(CH.spa);
  const labels = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
  const values = labels.map(k=> Number(data[k]||0));
  CH.spa = new Chart(c.getContext("2d"), {
    type:"bar",
    data:{ labels, datasets:[{ label:"عدد", data: values }] },
    options:{
      responsive:true, maintainAspectRatio:false, animation:{duration:600},
      scales:{ y:{ beginAtZero:true, suggestedMax: Math.max(5, Math.max(...values)+1) } }
    }
  });
}

async function updateCharts(){
  const { year, month } = getYearMonth();
  log("update charts", {year, month});
  const [cab, ast, spa] = await Promise.all([
    getJSON(`${API_BASE}/api/stats/cabinets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/assets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/spares?year=${year}&month=${month}`),
  ]);
  drawCabPie(cab);
  drawAssetsBar(ast);
  drawSparesBar(spa);
}

/* -------- Exports -------- */
function exportMonthly(){
  const {year, month} = getYearMonth();
  download(`${API_BASE}/api/export/monthly_summary.xlsx?year=${year}&month=${month}`);
}
function exportQuarterly(){
  const {year, month} = getYearMonth();
  download(`${API_BASE}/api/export/quarterly_summary.xlsx?start_year=${year}&start_month=${month}`);
}
// Issue reports
function exportIssueFull(){ download(`${API_BASE}/api/export/issue/full.xlsx`); }
function exportIssueSummary(){ download(`${API_BASE}/api/export/issue/summary.xlsx`); }
// Section exports (until today)
function exportCabToDate(){
  const y = parseInt(qs("#cab-year")?.value || new Date().getFullYear(), 10);
  const m = parseInt(qs("#cab-month")?.value || (new Date().getMonth()+1), 10);
  download(`${API_BASE}/api/export/cabinets.xlsx?year=${y}&month=${m}`);
}
function exportAstToDate(){
  const y = parseInt(qs("#ast-year")?.value || new Date().getFullYear(), 10);
  const m = parseInt(qs("#ast-month")?.value || (new Date().getMonth()+1), 10);
  download(`${API_BASE}/api/export/assets.xlsx?year=${y}&month=${m}`);
}
function exportSpaToDate(){
  const y = parseInt(qs("#spa-year")?.value || new Date().getFullYear(), 10);
  const m = parseInt(qs("#spa-month")?.value || (new Date().getMonth()+1), 10);
  download(`${API_BASE}/api/export/spares.xlsx?year=${y}&month=${m}`);
}

/* -------- Init / Bindings -------- */
document.addEventListener("DOMContentLoaded", () => {
  log("app.js ready");

  // Default landing panel
  showPanel("home");

  // Defaults for year/month
  const now = new Date();
  if(qs("#year")  && !qs("#year").value)  qs("#year").value  = String(now.getFullYear());
  if(qs("#month") && !qs("#month").value) qs("#month").value = String(now.getMonth()+1);

  // Top tiles
  qs("#open-issue")?.addEventListener("click", e => { e.preventDefault(); showPanel("issue"); });
  qs("#open-qual") ?.addEventListener("click", e => { e.preventDefault(); showPanel("rehab"); showBlock("cab"); updateCharts(); });

  // Back buttons
  qs("#back-home")  ?.addEventListener("click", e => { e.preventDefault(); showPanel("home"); });
  qs("#back-home-2")?.addEventListener("click", e => { e.preventDefault(); showPanel("home"); });

  // Sub tabs inside rehab
  qs("#sub-cab")?.addEventListener("click", e => { e.preventDefault(); showBlock("cab");   });
  qs("#sub-ast")?.addEventListener("click", e => { e.preventDefault(); showBlock("ast");   });
  qs("#sub-spa")?.addEventListener("click", e => { e.preventDefault(); showBlock("spa");   });

  // Charts + summaries
  qs("#btnUpdateCharts")    ?.addEventListener("click", e => { e.preventDefault(); updateCharts(); });
  qs("#btnMonthlySummary")  ?.addEventListener("click", e => { e.preventDefault(); exportMonthly(); });
  qs("#btnQuarterlySummary")?.addEventListener("click", e => { e.preventDefault(); exportQuarterly(); });

  // Issue exports
  qs("#btnIssueFull")   ?.addEventListener("click", e => { e.preventDefault(); exportIssueFull(); });
  qs("#btnIssueSummary")?.addEventListener("click", e => { e.preventDefault(); exportIssueSummary(); });

  // Per-section exports (to date)
  qs("#btn-cab-export")?.addEventListener("click", e => { e.preventDefault(); exportCabToDate(); });
  qs("#btn-ast-export")?.addEventListener("click", e => { e.preventDefault(); exportAstToDate(); });
  qs("#btn-spa-export")?.addEventListener("click", e => { e.preventDefault(); exportSpaToDate(); });

  // Keep charts responsive width while preserving fixed height
  window.addEventListener("resize", () => {
    CH.cab?.resize?.(); CH.ast?.resize?.(); CH.spa?.resize?.();
  });
});
/* ============================ end app.js ============================== */
