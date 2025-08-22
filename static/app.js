"use strict";

/* ================== Utilities (لا تغيير في السلوك) ================== */
const API = ""; // same-origin
const qs  = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>Array.from(el.querySelectorAll(s));
const now = ()=>{ const d=new Date(); return {y:d.getFullYear(), m:d.getMonth()+1}; };
const toInt=(v,d)=>{ const n=parseInt(v,10); return Number.isFinite(n)?n:d; };
function toast(msg){ alert(msg); }
function download(url){ window.location.href = url; }

async function getJSON(url){
  const r = await fetch(url, { credentials:"same-origin" });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function sendForm(url, formEl){
  const fd = new FormData(formEl);
  const r = await fetch(url, { method:"POST", body:fd, credentials:"same-origin" });
  if(!r.ok){
    let msg = `HTTP ${r.status}`;
    try{ const j = await r.json(); if(j?.detail) msg = j.detail; }catch(_){}
    throw new Error(msg);
  }
  return r.json().catch(()=> ({}));
}
async function sendJSON(url, method, obj){
  const r = await fetch(url, {
    method, credentials:"same-origin",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(obj||{})
  });
  if(!r.ok){
    let msg = `HTTP ${r.status}`;
    try{ const j = await r.json(); if(j?.detail) msg = j.detail; }catch(_){}
    throw new Error(msg);
  }
  return r.json().catch(()=> ({}));
}

/* ================== Panels (بدون تغيير على التصميم) ================== */
function hideAllPanels(){
  ["panel-issue","panel-rehab","panel-excel"].forEach(id=> qs("#"+id)?.classList.add("hidden"));
}
function openIssue(){ hideAllPanels(); qs("#panel-issue")?.classList.remove("hidden"); }
function openRehab(){ hideAllPanels(); qs("#panel-rehab")?.classList.remove("hidden"); qs("#rehab-chooser")?.classList.remove("hidden"); ["block-cab","block-ast","block-spa"].forEach(id=>qs("#"+id)?.classList.add("hidden")); }
function openExcel(){ hideAllPanels(); qs("#panel-excel")?.classList.remove("hidden"); }
function rehabOpenBlock(which){
  qs("#rehab-chooser")?.classList.add("hidden");
  ["block-cab","block-ast","block-spa"].forEach(id=>qs("#"+id)?.classList.add("hidden"));
  qs("#block-"+which)?.classList.remove("hidden");
}

/* ================== Charts (إصلاح دقيق) ================== */
/* الفكرة:
   - لا نغيّر عناصر canvas نهائيًا (No cloning/replacing)
   - نثبّت الارتفاع برمجيًا مرّة واحدة
   - نُنشئ رسمًا إن لم يوجد، ونحدّث بياناته إن كان موجودًا
   - في حال فشل API نرسم بيانات صفرية بدل عدم الرسم
*/
const CH = { cab:null, ast:null, spa:null };
const FIXED_H = 320;

function fixCanvasSize(id){
  const c = document.getElementById(id);
  if(!c) return null;
  // ثبّت الارتفاع فقط، واترك العرض مرن
  c.style.height = FIXED_H + "px";
  if (!c.getAttribute("height")) c.setAttribute("height", String(FIXED_H));
  return c;
}

function ensureCabinetChart(){
  const c = fixCanvasSize("viz-cab") || fixCanvasSize("chart-cab") || fixCanvasSize("cabPie");
  if(!c || !window.Chart) return null;
  if (CH.cab) return CH.cab;
  const ctx = c.getContext("2d");
  CH.cab = new Chart(ctx, {
    type: "pie",
    data: { labels:["ATS","AMF","HYBRID","حماية انفرتر","ظفيرة تحكم"], datasets:[{ data:[0,0,0,0,0] }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: 0 }, plugins:{ legend:{ position:"bottom" } } }
  });
  return CH.cab;
}
function ensureAssetsChart(){
  const c = fixCanvasSize("viz-ast") || fixCanvasSize("chart-ast") || fixCanvasSize("assetsBar");
  if(!c || !window.Chart) return null;
  if (CH.ast) return CH.ast;
  const ctx = c.getContext("2d");
  CH.ast = new Chart(ctx, {
    type: "bar",
    data: { labels:["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"], datasets:[{ label:"عدد", data:[0,0,0,0,0,0] }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation:{ duration:0 },
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });
  return CH.ast;
}
function ensureSparesChart(){
  const c = fixCanvasSize("viz-spa") || fixCanvasSize("chart-spa") || fixCanvasSize("sparesBar");
  if(!c || !window.Chart) return null;
  if (CH.spa) return CH.spa;
  const ctx = c.getContext("2d");
  CH.spa = new Chart(ctx, {
    type: "bar",
    data: { labels:["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"], datasets:[{ label:"عدد", data:Array(9).fill(0) }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation:{ duration:0 },
      scales:{ y:{ beginAtZero:true, ticks:{ precision:0 } } }
    }
  });
  return CH.spa;
}

function setBarYAxisMax(chart, data){
  try{
    const nums = (data||[]).map(v=>Number(v||0));
    const m = Math.max(1, ...nums);
    chart.options.scales.y.max = Math.ceil(m * 1.15) + 1;
  }catch(_){}
}

async function updateCharts(){
  const cur = now();
  const y = toInt(qs("#chart-year")?.value || cur.y, cur.y);
  const m = toInt(qs("#chart-month")?.value || cur.m, cur.m);

  // اجلب كل إحصائية مع سقوط آمن لقيمة صفرية
  const safe = async (u, zeroObj)=> {
    try{ return await getJSON(u); }catch(_){ return zeroObj; }
  };

  const cab = await safe(`${API}/api/stats/cabinets?year=${y}&month=${m}`, {ATS:0,AMF:0,HYBRID:0,"حماية انفرتر":0,"ظفيرة تحكم":0});
  const ast = await safe(`${API}/api/stats/assets?year=${y}&month=${m}`, {"بطاريات":0,"موحدات":0,"محركات":0,"مولدات":0,"مكيفات":0,"أصول أخرى":0});
  const spa = await safe(`${API}/api/stats/spares?year=${y}&month=${m}`, {"مضخات الديزل":0,"النوزلات":0,"سلف":0,"دينمو شحن":0,"كروت وشواحن":0,"موديولات":0,"منظمات وانفرترات":0,"تسييخ":0,"أخرى":0});

  // كبائن
  const cabChart = ensureCabinetChart();
  if (cabChart){
    const labels = cabChart.data.labels;
    cabChart.data.datasets[0].data = labels.map(k => Number(cab?.[k]||0));
    cabChart.update();
  }
  // أصول
  const astChart = ensureAssetsChart();
  if (astChart){
    const labels = astChart.data.labels;
    const data = labels.map(k => Number(ast?.[k]||0));
    astChart.data.datasets[0].data = data;
    setBarYAxisMax(astChart, data);
    astChart.update();
  }
  // قطع غيار
  const spaChart = ensureSparesChart();
  if (spaChart){
    const labels = spaChart.data.labels;
    const data = labels.map(k => Number(spa?.[k]||0));
    spaChart.data.datasets[0].data = data;
    setBarYAxisMax(spaChart, data);
    spaChart.update();
  }
}

/* ================== Forms (بدون تغيير على السلوك) ================== */
// صرف/طارئ
function bindIssue(){
  const f = qs("#form-issue"); if(!f) return;
  f.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await sendForm(`${API}/api/issue`, f);
      toast("تم الحفظ");
      f.reset();
      updateCharts();
    }catch(err){ toast("فشل الحفظ: " + err.message); }
  });
}
// كبائن
function bindCab(){
  const f = qs("#form-cab"); if(!f) return;
  f.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await sendForm(`${API}/api/cabinets`, f); // السيرفر يمنع التكرار ويرجع 400 برسالة واضحة
      toast("تم الحفظ");
      f.reset();
      updateCharts();
    }catch(err){ toast("فشل الحفظ: " + err.message); }
  });
}
// أصول (سندعم الطريقتين: FormData أولاً؛ إن رجع 422 نجرب JSON)
function bindAst(){
  const f = qs("#form-ast"); if(!f) return;
  f.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await sendForm(`${API}/api/assets`, f);
      toast("تم الحفظ");
      f.reset();
      updateCharts();
    }catch(err){
      if (String(err.message).includes("422")) {
        // تحويل إلى JSON إن كان السيرفر ينتظر JSON
        const obj = Object.fromEntries(new FormData(f).entries());
        if ("quantity" in obj) obj.quantity = Number(obj.quantity||1);
        try{
          await sendJSON(`${API}/api/assets`, "POST", obj);
          toast("تم الحفظ");
          f.reset();
          updateCharts();
          return;
        }catch(err2){
          toast("فشل الحفظ: " + err2.message);
          return;
        }
      }
      toast("فشل الحفظ: " + err.message);
    }
  });
}
// قطع غيار
function bindSpa(){
  const f = qs("#form-spa"); if(!f) return;
  f.addEventListener("submit", async (e)=>{
    e.preventDefault();
    try{
      await sendForm(`${API}/api/spares`, f);
      toast("تم الحفظ");
      f.reset();
      updateCharts();
    }catch(err){ toast("فشل الحفظ: " + err.message); }
  });
}

/* ================== Excel bindings (كما كانت) ================== */
function bindExcel(){
  qs("#btn-excel-issue-full")   ?.addEventListener("click", ()=> download(`${API}/api/export/issue/full.xlsx`));
  qs("#btn-excel-issue-summary")?.addEventListener("click", ()=> download(`${API}/api/export/issue/summary.xlsx`));

  qs("#btn-excel-cab")?.addEventListener("click", ()=>{
    const cur=now(); const y = toInt(qs("#excel-cab-year")?.value||cur.y,cur.y);
    const m = toInt(qs("#excel-cab-month")?.value||cur.m,cur.m);
    download(`${API}/api/export/cabinets.xlsx?year=${y}&month=${m}`);
  });
  qs("#btn-excel-ast")?.addEventListener("click", ()=>{
    const cur=now(); const y = toInt(qs("#excel-ast-year")?.value||cur.y,cur.y);
    const m = toInt(qs("#excel-ast-month")?.value||cur.m,cur.m);
    download(`${API}/api/export/assets.xlsx?year=${y}&month=${m}`);
  });
  qs("#btn-excel-spa")?.addEventListener("click", ()=>{
    const cur=now(); const y = toInt(qs("#excel-spa-year")?.value||cur.y,cur.y);
    const m = toInt(qs("#excel-spa-month")?.value||cur.m,cur.m);
    download(`${API}/api/export/spares.xlsx?year=${y}&month=${m}`);
  });

  // دعم معرفات بديلة للملخصات
  const monthlyBtns = [qs("#btn-excel-monthly"), qs("#btn-monthly")].filter(Boolean);
  monthlyBtns.forEach(btn => btn.addEventListener("click", ()=>{
    const cur=now();
    const y = toInt(qs("#excel-sum-year")?.value || qs("#sum-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-sum-month")?.value|| qs("#sum-month")?.value|| cur.m, cur.m);
    download(`${API}/api/export/monthly_summary.xlsx?year=${y}&month=${m}`);
  }));

  const quarterlyBtns = [qs("#btn-excel-quarterly"), qs("#btn-quarterly")].filter(Boolean);
  quarterlyBtns.forEach(btn => btn.addEventListener("click", ()=>{
    const cur=now();
    const y = toInt(qs("#excel-q-year")?.value || qs("#q-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-q-month")?.value|| qs("#q-month")?.value|| cur.m, cur.m);
    download(`${API}/api/export/quarterly_summary.xlsx?start_year=${y}&start_month=${m}`);
  }));

  // زر تحديث الرسوم (أي معرف)
  const updBtns = [qs("#btn-refresh-charts"), qs("#btnUpdateCharts")].filter(Boolean);
  updBtns.forEach(btn => btn.addEventListener("click", updateCharts));
}

/* ================== Duplicates checker (بدون تغيير) ============== */
function bindDuplicates(){
  const btn = qs("#btn-dup"); if(!btn) return;
  const box = qs("#dup-result");
  btn.addEventListener("click", async ()=>{
    if (box){ box.style.display="block"; box.innerHTML = `<span class="muted">...جاري الفحص</span>`; }
    try{
      const r = await getJSON(`${API}/api/validate/duplicates`);
      const html = `
        <div><b>أكواد كبائن مكررة:</b> ${r.cabinets_codes?.length? r.cabinets_codes.join(" ، ") : "لا يوجد"}</div>
        <div><b>أرقام أصول مكررة:</b> ${r.assets_serials?.length? r.assets_serials.join(" ، ") : "لا يوجد"}</div>
        <div><b>(رقم+موقع) للأصول مكرر:</b> ${r.assets_serial_loc_pairs?.length? r.assets_serial_loc_pairs.join(" ، ") : "لا يوجد"}</div>
        <div><b>(سيريال+مصدر) للغيار مكرر:</b> ${r.spares_serial_src_pairs?.length? r.spares_serial_src_pairs.join(" ، ") : "لا يوجد"}</div>
      `;
      if (box) box.innerHTML = html;
    }catch(e){
      if (box) box.innerHTML = `<span class="muted">تعذّر الفحص: ${e.message}</span>`;
    }
  });
}

/* ================== Init ================== */
document.addEventListener("DOMContentLoaded", ()=>{
  // البلاطات الرئيسية
  qs("#tile-issue")?.addEventListener("click", openIssue);
  qs("#tile-rehab")?.addEventListener("click", openRehab);
  qs("#tile-excel")?.addEventListener("click", openExcel);

  // رجوع
  qsa(".btn-back-main").forEach(b=> b.addEventListener("click", hideAllPanels));
  qsa(".btn-back-rehab").forEach(b=> b.addEventListener("click", ()=>{
    qs("#rehab-chooser")?.classList.remove("hidden");
    ["block-cab","block-ast","block-spa"].forEach(id=>qs("#"+id)?.classList.add("hidden"));
  }));

  // اختيار نوع التأهيل
  qs("#sub-cab")?.addEventListener("click", ()=> rehabOpenBlock("cab"));
  qs("#sub-ast")?.addEventListener("click", ()=> rehabOpenBlock("ast"));
  qs("#sub-spa")?.addEventListener("click", ()=> rehabOpenBlock("spa"));

  // النماذج
  bindIssue();
  bindCab();
  bindAst();
  bindSpa();

  // التقارير + التكرارات
  bindExcel();
  bindDuplicates();

  // الرسوم (تُرسم حتى لو APIs فشلت — تُظهر أصفاراً بدلاً من اختفاء الرسم)
  updateCharts();

  // إبقاء الصفحة على القائمة الرئيسية كما هي
  hideAllPanels();

  // لو تغيّر حجم النافذة، اكتفِ باستدعاء update() بدل إعادة بناء الرسم
  window.addEventListener("resize", ()=>{
    [CH.cab, CH.ast, CH.spa].forEach(ch => { try{ ch?.update("none"); }catch(_){ } });
  });
});
