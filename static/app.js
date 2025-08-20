/* ============================== app.js v6 ============================== */
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
  }catch(e){ err("GET:", url, e); return null; }
}
async function sendJSON(method, url, body){
  try{
    const r=await fetch(url,{
      method,
      headers:{ "Content-Type":"application/json" },
      credentials:"same-origin",
      body: JSON.stringify(body || {})
    });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json().catch(()=>true);
  }catch(e){ err(method, url, e); alert("فشل الحفظ: "+e.message); return null; }
}
const postJSON = (u,b)=>sendJSON("POST",u,b);
const putJSON  = (u,b)=>sendJSON("PUT",u,b);
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
function mapToObject(labels, data){
  const o={}; labels.forEach(k=>o[k]=Number((data||{})[k]||0)); return o;
}

/* ----------------- charts ----------------- */
let CH={cab:null, ast:null, spa:null};
function destroyChart(ref){ try{ref?.destroy?.();}catch{} }

function drawCabPie(data){
  const c=qs("#cabPie"); if(!c || !window.Chart){ return; }
  setFixedCanvas(c,320); destroyChart(CH.cab);
  const labels=["ATS","AMF","HYBRID","حماية انفرتر","ظفيرة تحكم"];
  const vals=labels.map(k=>Number((data||{})[k]||0));
  CH.cab=new Chart(c.getContext("2d"),{
    type:"pie",
    data:{labels,datasets:[{data:vals}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500}}
  });
}
function drawAssetsBar(data){
  const c=qs("#assetsBar"); if(!c || !window.Chart){ return; }
  setFixedCanvas(c,320); destroyChart(CH.ast);
  const labels=["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"];
  const vals=labels.map(k=>Number((data||{})[k]||0));
  CH.ast=new Chart(c.getContext("2d"),{
    type:"bar",
    data:{labels,datasets:[{label:"عدد",data:vals}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},scales:{y:{beginAtZero:true}}}
  });
}
function drawSparesBar(data){
  const c=qs("#sparesBar"); if(!c || !window.Chart){ return; }
  setFixedCanvas(c,320); destroyChart(CH.spa);
  const labels=["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
  const vals=labels.map(k=>Number((data||{})[k]||0));
  CH.spa=new Chart(c.getContext("2d"),{
    type:"bar",
    data:{labels,datasets:[{label:"عدد",data:vals}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},scales:{y:{beginAtZero:true}}}
  });
}
async function updateCharts(){
  const {year, month}=getYearMonth();
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
  download(`${API_BASE}/api/export/quarterly_summary.xlsx?start_year=${year}&start_month=${month}&date_field=rehab_date`);
}
function exportCabToDate(){
  const y=parseInt(qs("#cab-year")?.value||new Date().getFullYear(),10);
  const m=parseInt(qs("#cab-month")?.value||(new Date().getMonth()+1),10);
  download(`${API_BASE}/api/export/cabinets.xlsx?year=${y}&month=${m}&date_field=rehab_date`);
}
function exportAstToDate(){
  const y=parseInt(qs("#ast-year")?.value||new Date().getFullYear(),10);
  const m=parseInt(qs("#ast-month")?.value||(new Date().getMonth()+1),10);
  download(`${API_BASE}/api/export/assets.xlsx?year=${y}&month=${m}&date_field=rehab_date`);
}
function exportSpaToDate(){
  const y=parseInt(qs("#spa-year")?.value||new Date().getFullYear(),10);
  const m=parseInt(qs("#spa-month")?.value||(new Date().getMonth()+1),10);
  download(`${API_BASE}/api/export/spares.xlsx?year=${y}&month=${m}&date_field=rehab_date`);
}

/* ----------------- forms save/update ----------------- */
// Cabinets
async function saveCabinet(isUpdate){
  const f=qs("#form-cab"); if(!f) return;
  const body={
    id:          qs("#cab-id")?.value || undefined,
    cabinet_type:f.cabinet_type.value,
    code:        f.code.value,
    rehab_date:  f.rehab_date.value,
    qualified_by:f.qualified_by.value,
    location:    f.location.value,
    receiver:    f.receiver.value,
    issue_date:  f.issue_date.value,
    notes:       f.notes.value
  };
  const url = isUpdate && body.id ? `${API_BASE}/api/cabinets/${body.id}` : `${API_BASE}/api/cabinets`;
  const res = isUpdate && body.id ? await putJSON(url,body) : await postJSON(url,body);
  if(res){ alert("تم الحفظ"); }
}

// Assets
async function saveAsset(isUpdate){
  const f=qs("#form-ast"); if(!f) return;
  const body={
    id:               qs("#ast-id")?.value || undefined,
    asset_type:       f.asset_type.value,
    model:            f.model.value,
    serial_or_code:   f.serial_or_code.value,
    quantity:         Number(f.quantity.value||1),
    prev_location:    f.prev_location.value,
    supply_date:      f.supply_date.value,
    qualified_by:     f.qualified_by.value,
    lifted:           f.lifted.value || null,
    inspector:        f.inspector.value,
    tested:           f.tested.value || null,
    issue_date:       f.issue_date.value,
    current_location: f.current_location.value,
    requester:        f.requester.value,
    receiver:         f.receiver.value,
    notes:            f.notes.value
  };
  const url = isUpdate && body.id ? `${API_BASE}/api/assets/${body.id}` : `${API_BASE}/api/assets`;
  const res = isUpdate && body.id ? await putJSON(url,body) : await postJSON(url,body);
  if(res){ alert("تم الحفظ"); }
}

// Spares
async function saveSpare(isUpdate){
  const f=qs("#form-spa"); if(!f) return;
  const body={
    id:            qs("#spa-id")?.value || undefined,
    part_category: f.part_category.value,
    part_name:     f.part_name.value,
    part_model:    f.part_model.value,
    quantity:      Number(f.quantity.value||1),
    serial:        f.serial.value,
    source:        f.source.value,
    qualified_by:  f.qualified_by.value,
    rehab_date:    f.rehab_date.value,
    tested:        f.tested.value || null,
    notes:         f.notes.value
  };
  const url = isUpdate && body.id ? `${API_BASE}/api/spares/${body.id}` : `${API_BASE}/api/spares`;
  const res = isUpdate && body.id ? await putJSON(url,body) : await postJSON(url,body);
  if(res){ alert("تم الحفظ"); }
}

/* ----------------- per-section find/edit ----------------- */
async function findCabByCode(){
  const code=(qs("#cab-find-code")?.value||"").trim();
  if(!code){ qs("#cab-find-hint").textContent=""; return; }
  const data=await getJSON(`${API_BASE}/api/cabinets/find?code=${encodeURIComponent(code)}`);
  qs("#cab-find-hint").textContent = data ? "تم العثور على سجل" : "لا توجد نتيجة";
  if(data){
    qs("#cab-id").value = data.id || "";
    const f=qs("#form-cab");
    f.cabinet_type.value = data.cabinet_type || "";
    f.code.value         = data.code || "";
    f.rehab_date.value   = (data.rehab_date||"").slice(0,10);
    f.qualified_by.value = data.qualified_by || "";
    f.location.value     = data.location || "";
    f.receiver.value     = data.receiver || "";
    f.issue_date.value   = (data.issue_date||"").slice(0,10);
    f.notes.value        = data.notes || "";
  }
}
async function findAssetBySerial(){
  const sn=(qs("#ast-find-serial")?.value||"").trim();
  if(!sn){ qs("#ast-find-hint").textContent=""; return; }
  const data=await getJSON(`${API_BASE}/api/assets/find?serial=${encodeURIComponent(sn)}`);
  qs("#ast-find-hint").textContent = data ? "تم العثور على سجل" : "لا توجد نتيجة";
  if(data){
    qs("#ast-id").value = data.id || "";
    const f=qs("#form-ast");
    f.asset_type.value       = data.asset_type || "";
    f.model.value            = data.model || "";
    f.serial_or_code.value   = data.serial_or_code || "";
    f.quantity.value         = data.quantity || 1;
    f.prev_location.value    = data.prev_location || "";
    f.supply_date.value      = (data.supply_date||"").slice(0,10);
    f.qualified_by.value     = data.qualified_by || "";
    f.lifted.value           = data.lifted==null ? "" : String(data.lifted);
    f.inspector.value        = data.inspector || "";
    f.tested.value           = data.tested==null ? "" : String(data.tested);
    f.issue_date.value       = (data.issue_date||"").slice(0,10);
    f.current_location.value = data.current_location || "";
    f.requester.value        = data.requester || "";
    f.receiver.value         = data.receiver || "";
    f.notes.value            = data.notes || "";
  }
}
async function findSpareBySerial(){
  const sn=(qs("#spa-find-serial")?.value||"").trim();
  if(!sn){ qs("#spa-find-hint").textContent=""; return; }
  const data=await getJSON(`${API_BASE}/api/spares/find?serial=${encodeURIComponent(sn)}`);
  qs("#spa-find-hint").textContent = data ? "تم العثور على سجل" : "لا توجد نتيجة";
  if(data){
    qs("#spa-id").value = data.id || "";
    const f=qs("#form-spa");
    f.part_category.value = data.part_category || "";
    f.part_name.value     = data.part_name || "";
    f.part_model.value    = data.part_model || "";
    f.quantity.value      = data.quantity || 1;
    f.serial.value        = data.serial || "";
    f.source.value        = data.source || "";
    f.qualified_by.value  = data.qualified_by || "";
    f.rehab_date.value    = (data.rehab_date||"").slice(0,10);
    f.tested.value        = data.tested==null ? "" : String(data.tested);
    f.notes.value         = data.notes || "";
  }
}

/* ----------------- global search (top) ----------------- */
async function globalSearch(){
  const q=(qs("#search-all")?.value||"").trim();
  const resBox=qs("#search-results");
  if(!resBox) return;
  if(!q){ resBox.innerHTML=`<div class="muted">اكتب الترميز أو الرقم التسلسلي للبحث.</div>`; return; }

  resBox.innerHTML=`<div class="muted">جارِ البحث…</div>`;
  const [cab, ast, spa]=await Promise.all([
    getJSON(`${API_BASE}/api/cabinets/find?code=${encodeURIComponent(q)}`),
    getJSON(`${API_BASE}/api/assets/find?serial=${encodeURIComponent(q)}`),
    getJSON(`${API_BASE}/api/spares/find?serial=${encodeURIComponent(q)}`)
  ]);
  const parts=[];
  if(cab){ parts.push(renderCard("الكبائن", cab)); }
  if(ast){ parts.push(renderCard("الأصول", ast)); }
  if(spa){ parts.push(renderCard("قطع الغيار", spa)); }
  resBox.innerHTML = parts.length ? parts.join("") : `<div class="muted">لا توجد نتائج مطابقة.</div>`;
}
function renderCard(title, obj){
  const pretty=escapeHtml(JSON.stringify(obj,null,2));
  return `<div class="search-card"><div style="font-weight:700;margin-bottom:6px">${title}</div><pre style="margin:0;white-space:pre-wrap">${pretty}</pre></div>`;
}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}

/* ----------------- duplicate detection ----------------- */
/* Rules:
   1) Cabinets: no repeated `code`.
   2) Assets: no repeated `serial_or_code`.
   3) For Assets with asset_type = "محركات": for the SAME engine (same serial_or_code),
      you cannot repeat the same `source` (المصدر) or the same `current_location` (الموقع الحالي).
*/
async function checkDuplicates(){
  const box=qs("#dup-results");
  if(!box) return;
  box.hidden=false;
  box.innerHTML=`<div class="muted">جارِ الفحص…</div>`;

  // Try to filter by rehab_date month/year if backend supports it; otherwise get all
  const {year,month}=getYearMonth();
  const q=`year=${year}&month=${month}&date_field=rehab_date`;
  const [cabs, assets] = await Promise.all([
    getJSON(`${API_BASE}/api/cabinets?${q}`)  || getJSON(`${API_BASE}/api/cabinets`),
    getJSON(`${API_BASE}/api/assets?${q}`)    || getJSON(`${API_BASE}/api/assets`)
  ]);

  const issues=[];

  // 1) Cabinets duplicate code
  if (Array.isArray(cabs)) {
    const seenCab=new Map();
    for(const it of cabs){
      const k=(it.code||"").trim();
      if(!k) continue;
      if(seenCab.has(k)) { issues.push(`تكرار في الكبائن: الترميز "${k}" (IDs: ${seenCab.get(k)}, ${it.id})`); }
      else { seenCab.set(k, it.id); }
    }
  }

  // 2) Assets duplicate serial_or_code
  if (Array.isArray(assets)) {
    const seenAsset=new Map();
    // also engine-specific map
    const engines=new Map(); // key: serial_or_code -> {sources:Set, locations:Set, ids:Set}
    for(const it of assets){
      const k=(it.serial_or_code||"").trim();
      if(k){
        if(seenAsset.has(k)) { issues.push(`تكرار في الأصول: الرقم/الترميز "${k}" (IDs: ${seenAsset.get(k)}, ${it.id})`); }
        else { seenAsset.set(k, it.id); }
      }
      if((it.asset_type||"") === "محركات"){
        const e = engines.get(k) || {sources:new Map(), locs:new Map(), ids:new Set()};
        const src=(it.source||it.prev_location||"").trim();
        const loc=(it.current_location||"").trim();
        if(src){
          if(e.sources.has(src)) issues.push(`محرك "${k}": تكرار نفس "المصدر" (${src}) (IDs: ${e.sources.get(src)}, ${it.id})`);
          else e.sources.set(src, it.id);
        }
        if(loc){
          if(e.locs.has(loc)) issues.push(`محرك "${k}": تكرار نفس "الموقع الحالي" (${loc}) (IDs: ${e.locs.get(loc)}, ${it.id})`);
          else e.locs.set(loc, it.id);
        }
        e.ids.add(it.id);
        engines.set(k, e);
      }
    }
  }

  box.innerHTML = issues.length
    ? `<div><b>نتائج الفحص:</b><ul>${issues.map(i=>`<li>${escapeHtml(i)}</li>`).join("")}</ul></div>`
    : `<div class="muted">لا توجد تكرارات وفق القواعد المحددة.</div>`;
}

/* ----------------- init ----------------- */
document.addEventListener("DOMContentLoaded", ()=>{
  log("app v6 ready");

  // default year/month
  const now=new Date();
  if(qs("#year")  && !qs("#year").value)  qs("#year").value  = String(now.getFullYear());
  if(qs("#month") && !qs("#month").value) qs("#month").value = String(now.getMonth()+1);

  // main panel toggles
  qs("#open-issue")?.addEventListener("click",e=>{e.preventDefault();showPanel("issue");});
  qs("#open-qual") ?.addEventListener("click",e=>{e.preventDefault();showPanel("rehab");showBlock("cab");updateCharts();});
  qs("#back-home")  ?.addEventListener("click",e=>{e.preventDefault();showPanel("home");});
  qs("#back-home-2")?.addEventListener("click",e=>{e.preventDefault();showPanel("home");});

  // sub blocks
  qs("#sub-cab")?.addEventListener("click",e=>{e.preventDefault();showBlock("cab");});
  qs("#sub-ast")?.addEventListener("click",e=>{e.preventDefault();showBlock("ast");});
  qs("#sub-spa")?.addEventListener("click",e=>{e.preventDefault();showBlock("spa");});

  // charts & summaries based on rehab_date
  qs("#btnUpdateCharts")    ?.addEventListener("click",e=>{e.preventDefault();updateCharts();});
  qs("#btnMonthlySummary")  ?.addEventListener("click",e=>{e.preventDefault();exportMonthly();});
  qs("#btnQuarterlySummary")?.addEventListener("click",e=>{e.preventDefault();exportQuarterly();});

  // per-section exports
  qs("#btn-cab-export")?.addEventListener("click",e=>{e.preventDefault();exportCabToDate();});
  qs("#btn-ast-export")?.addEventListener("click",e=>{e.preventDefault();exportAstToDate();});
  qs("#btn-spa-export")?.addEventListener("click",e=>{e.preventDefault();exportSpaToDate();});

  // forms save/update
  qs("#form-cab")?.addEventListener("submit", e=>{e.preventDefault();saveCabinet(false);});
  qs("#btn-cab-update")?.addEventListener("click", e=>{e.preventDefault();saveCabinet(true);});
  qs("#form-ast")?.addEventListener("submit", e=>{e.preventDefault();saveAsset(false);});
  qs("#btn-ast-update")?.addEventListener("click", e=>{e.preventDefault();saveAsset(true);});
  qs("#form-spa")?.addEventListener("submit", e=>{e.preventDefault();saveSpare(false);});
  qs("#btn-spa-update")?.addEventListener("click", e=>{e.preventDefault();saveSpare(true);});

  // find/edit per-section
  qs("#cab-find-btn")?.addEventListener("click", e=>{e.preventDefault();findCabByCode();});
  qs("#cab-clear-btn")?.addEventListener("click", e=>{e.preventDefault(); const i=qs("#cab-find-code"); if(i){i.value="";} qs("#cab-find-hint").textContent=""; });
  qs("#ast-find-btn")?.addEventListener("click", e=>{e.preventDefault();findAssetBySerial();});
  qs("#ast-clear-btn")?.addEventListener("click", e=>{e.preventDefault(); const i=qs("#ast-find-serial"); if(i){i.value="";} qs("#ast-find-hint").textContent=""; });
  qs("#spa-find-btn")?.addEventListener("click", e=>{e.preventDefault();findSpareBySerial();});
  qs("#spa-clear-btn")?.addEventListener("click", e=>{e.preventDefault(); const i=qs("#spa-find-serial"); if(i){i.value="";} qs("#spa-find-hint").textContent=""; });

  // global search
  qs("#search-all-btn")  ?.addEventListener("click", e=>{e.preventDefault();globalSearch();});
  qs("#search-all-clear")?.addEventListener("click", e=>{e.preventDefault(); const i=qs("#search-all"); if(i){i.value="";} qs("#search-results").innerHTML=""; });

  // duplicate detection
  qs("#btn-dup")?.addEventListener("click", e=>{e.preventDefault();checkDuplicates();});

  // initial landing
  showPanel("home");

  // keep charts responsive width
  window.addEventListener("resize", ()=>{ CH.cab?.resize?.(); CH.ast?.resize?.(); CH.spa?.resize?.(); });
});
/* ============================ end app.js =============================== */
