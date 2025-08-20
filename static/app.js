/* ============================== app.js v5 ============================== */
"use strict";
const API_BASE = ""; // same-origin for local + Render

/* ----------------- helpers ----------------- */
const qs  = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>Array.from(el.querySelectorAll(s));
const log = (...a)=>console.log("[app]",...a);
const err = (...a)=>console.error("[app]",...a);

async function getJSON(url){
  try{
    const r=await fetch(url,{credentials:"same-origin"});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ err("GET failed:", url, e); return null; }
}
function download(url){ window.location.href = url; }

function setFixedCanvas(c, h=320){
  if(!c) return;
  c.style.width="100%";
  c.style.height=`${h}px`;
  if(!c.getAttribute("height")) c.setAttribute("height", String(h));
}

/* ----------------- panels/blocks ----------------- */
const PANELS = {
  home : ()=>qs("#panel-home"),
  issue: ()=>qs("#panel-issue"),
  rehab: ()=>qs("#panel-rehab"),
};
function showPanel(name){
  const all=[PANELS.home(),PANELS.issue(),PANELS.rehab()].filter(Boolean);
  all.forEach(p=>{p.hidden=true;p.style.display="none";});
  const t=PANELS[name]&&PANELS[name]();
  if(t){t.hidden=false;t.style.display="";}
}
const BLOCKS = {
  cab: ()=>qs("#block-cab"),
  ast: ()=>qs("#block-ast"),
  spa: ()=>qs("#block-spa"),
};
function showBlock(name){
  const all=[BLOCKS.cab(),BLOCKS.ast(),BLOCKS.spa()].filter(Boolean);
  all.forEach(b=>b.classList.add("hidden"));
  const t=BLOCKS[name]&&BLOCKS[name]();
  if(t) t.classList.remove("hidden");
}

/* ----------------- date helpers ----------------- */
function getYearMonth(){
  const now=new Date();
  const y=parseInt(qs("#year")?.value || now.getFullYear(),10);
  const m=parseInt(qs("#month")?.value || (now.getMonth()+1),10);
  return {year:y, month:m};
}
/* ensure objects even if API returns null */
function mapToObject(keys, data){
  const o={};
  keys.forEach(k=>{ o[k]=Number((data||{})[k]||0); });
  return o;
}

/* ----------------- charts ----------------- */
let CH={cab:null, ast:null, spa:null};
function destroyChart(ref){ try{ref?.destroy?.();}catch{} }

function drawCabPie(data){
  const c=qs("#cabPie"); if(!c || !window.Chart) return;
  setFixedCanvas(c,320); destroyChart(CH.cab);
  const labels=["ATS","AMF","HYBRID","حماية انفرتر","ظفيرة تحكم"];
  const safe=mapToObject(labels, data);
  const values=labels.map(k=>safe[k]);
  CH.cab=new Chart(c.getContext("2d"),{
    type:"pie",
    data:{labels,datasets:[{data:values}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500}}
  });
}
function drawAssetsBar(data){
  const c=qs("#assetsBar"); if(!c || !window.Chart) return;
  setFixedCanvas(c,320); destroyChart(CH.ast);
  const labels=["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"];
  const safe=mapToObject(labels, data);
  const values=labels.map(k=>safe[k]);
  CH.ast=new Chart(c.getContext("2d"),{
    type:"bar",
    data:{labels,datasets:[{label:"عدد",data:values}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},scales:{y:{beginAtZero:true}}}
  });
}
function drawSparesBar(data){
  const c=qs("#sparesBar"); if(!c || !window.Chart) return;
  setFixedCanvas(c,320); destroyChart(CH.spa);
  const labels=["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
  const safe=mapToObject(labels, data);
  const values=labels.map(k=>safe[k]);
  CH.spa=new Chart(c.getContext("2d"),{
    type:"bar",
    data:{labels,datasets:[{label:"عدد",data:values}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},scales:{y:{beginAtZero:true}}}
  });
}

/* all charts via rehab_date */
async function updateCharts(){
  const {year, month}=getYearMonth();
  log("charts (by rehab_date)",{year,month});

  // pass date_field=rehab_date so backend groups/filters by تاريخ التأهيل
  const q=`year=${year}&month=${month}&date_field=rehab_date`;
  const [cab,ast,spa]=await Promise.all([
    getJSON(`${API_BASE}/api/stats/cabinets?${q}`),
    getJSON(`${API_BASE}/api/stats/assets?${q}`),
    getJSON(`${API_BASE}/api/stats/spares?${q}`)
  ]);

  drawCabPie(cab||{});
  drawAssetsBar(ast||{});
  drawSparesBar(spa||{});
}

/* ----------------- exports (by rehab_date) ----------------- */
function exportMonthly(){
  const {year,month}=getYearMonth();
  download(`${API_BASE}/api/export/monthly_summary.xlsx?year=${year}&month=${month}&date_field=rehab_date`);
}
function exportQuarterly(){
  const {year,month}=getYearMonth();
  // quarter start is month in inputs; date_field forces rehab_date basis
  download(`${API_BASE}/api/export/quarterly_summary.xlsx?start_year=${year}&start_month=${month}&date_field=rehab_date`);
}
/* optional per-section to-date exports also by rehab_date month/year if you later add buttons
   (kept minimal here; monthly/quarterly above should be enough) */

/* ----------------- global search (single box) ----------------- */
async function globalSearch(){
  const q=(qs("#search-all")?.value||"").trim();
  const resBox=qs("#search-results");
  if(!resBox) return;
  if(!q){ resBox.innerHTML=`<div class="muted">اكتب الترميز أو الرقم التسلسلي للبحث.</div>`; return; }

  resBox.innerHTML=`<div class="muted">جارِ البحث…</div>`;

  // run in parallel: cabinets by code, assets by serial, spares by serial
  const [cab, ast, spa]=await Promise.all([
    getJSON(`${API_BASE}/api/cabinets/find?code=${encodeURIComponent(q)}`),
    getJSON(`${API_BASE}/api/assets/find?serial=${encodeURIComponent(q)}`),
    getJSON(`${API_BASE}/api/spares/find?serial=${encodeURIComponent(q)}`)
  ]);

  const parts=[];
  if(cab){ parts.push(renderCard("الكبائن", cab)); }
  if(ast){ parts.push(renderCard("الأصول", ast)); }
  if(spa){ parts.push(renderCard("قطع الغيار", spa)); }

  if(parts.length===0){
    resBox.innerHTML=`<div class="muted">لا توجد نتائج مطابقة.</div>`;
  }else{
    resBox.innerHTML=parts.join("");
  }
}
function renderCard(title, obj){
  const pretty=escapeHtml(JSON.stringify(obj,null,2));
  return `<div class="search-card">
    <div style="font-weight:700;margin-bottom:6px">${title}</div>
    <pre style="margin:0;white-space:pre-wrap">${pretty}</pre>
  </div>`;
}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

/* ----------------- init ----------------- */
document.addEventListener("DOMContentLoaded", ()=>{
  log("app v5 ready");

  // default year/month
  const now=new Date();
  if(qs("#year")  && !qs("#year").value)  qs("#year").value  = String(now.getFullYear());
  if(qs("#month") && !qs("#month").value) qs("#month").value = String(now.getMonth()+1);

  // main icons
  qs("#open-issue")?.addEventListener("click",e=>{e.preventDefault();showPanel("issue");});
  qs("#open-qual") ?.addEventListener("click",e=>{e.preventDefault();showPanel("rehab");showBlock("cab");updateCharts();});

  // back
  qs("#back-home")  ?.addEventListener("click",e=>{e.preventDefault();showPanel("home");});
  qs("#back-home-2")?.addEventListener("click",e=>{e.preventDefault();showPanel("home");});

  // sub-tabs in rehab
  qs("#sub-cab")?.addEventListener("click",e=>{e.preventDefault();showBlock("cab");});
  qs("#sub-ast")?.addEventListener("click",e=>{e.preventDefault();showBlock("ast");});
  qs("#sub-spa")?.addEventListener("click",e=>{e.preventDefault();showBlock("spa");});

  // charts & summaries (rehab_date basis)
  qs("#btnUpdateCharts")    ?.addEventListener("click",e=>{e.preventDefault();updateCharts();});
  qs("#btnMonthlySummary")  ?.addEventListener("click",e=>{e.preventDefault();exportMonthly();});
  qs("#btnQuarterlySummary")?.addEventListener("click",e=>{e.preventDefault();exportQuarterly();});

  // global search
  qs("#search-all-btn")  ?.addEventListener("click", e=>{e.preventDefault();globalSearch();});
  qs("#search-all-clear")?.addEventListener("click", e=>{e.preventDefault(); const i=qs("#search-all"); if(i){i.value="";} qs("#search-results").innerHTML=""; });

  // initial landing
  showPanel("home");

  // keep charts responsive width
  window.addEventListener("resize", ()=>{ CH.cab?.resize?.(); CH.ast?.resize?.(); CH.spa?.resize?.(); });
});
/* ============================ end app.js =============================== */
