"use strict";

/* ================== إعدادات عامة ================== */
const API_BASE = ""; // نسبي: يعمل محليًا وعلى Render

const qs  = (s, el=document) => el.querySelector(s);
const qsa = (s, el=document) => Array.from(el.querySelectorAll(s));
const log = (...a) => console.log("[app]", ...a);
const err = (...a) => console.error("[app]", ...a);

function showOnly(id) {
  qsa('[data-panel]').forEach(p => p.hidden = true);
  const el = (typeof id === "string") ? qs(`#${id}`) : id;
  if (el) el.hidden = false;
}

function fixedCanvas(canvas, h=320) {
  if (!canvas) return;
  canvas.style.width  = "100%";
  canvas.style.height = `${h}px`;
  if (!canvas.getAttribute("height")) canvas.setAttribute("height", String(h));
}

/* ================== ربط الأزرار ================== */
function bindUI() {
  // قوائم عليا
  qs("#open-issue")?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-issue"); });
  qs("#open-qual") ?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-qual");  });

  // رجوع
  qs("#back-home")  ?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-home"); });
  qs("#back-home-2")?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-home"); });

  // تبويبات التأهيل
  qs("#open-cab")   ?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-cab");    });
  qs("#open-assets")?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-assets"); });
  qs("#open-spares")?.addEventListener("click", e => { e.preventDefault(); showOnly("panel-spares"); });

  // أزرار الرسوم والتقارير
  qs("#btnUpdateCharts")    ?.addEventListener("click", e => { e.preventDefault(); updateCharts(); });
  qs("#btnMonthlySummary")  ?.addEventListener("click", e => { e.preventDefault(); exportMonthly(); });
  qs("#btnQuarterlySummary")?.addEventListener("click", e => { e.preventDefault(); exportQuarterly(); });
  qs("#btnIssueFull")       ?.addEventListener("click", e => { e.preventDefault(); download(`${API_BASE}/api/export/issue/full.xlsx`); });
  qs("#btnIssueSummary")    ?.addEventListener("click", e => { e.preventDefault(); download(`${API_BASE}/api/export/issue/summary.xlsx`); });

  // إظهار القائمة الرئيسية كبداية
  showOnly("panel-home");
}

function getYearMonth() {
  const now = new Date();
  const y = parseInt(qs("#year")?.value ?? now.getFullYear(), 10);
  const m = parseInt(qs("#month")?.value ?? (now.getMonth()+1), 10);
  return { year: y, month: m };
}

async function getJSON(url) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    err("GET failed:", url, e);
    return null;
  }
}
function download(url) { window.location.href = url; }

/* ================== الرسم البياني ================== */
let CH = { cab:null, ast:null, spa:null };

function destroy(ch) { try { ch?.destroy?.(); } catch {} }

function drawCabinetsPie(data) {
  const c = qs("#cabPie"); if (!c) return;
  fixedCanvas(c, 320); destroy(CH.cab);

  const labels = ["ATS","AMF","HYBRID","حماية انفرتر","ظفيرة تحكم"];
  const values = labels.map(k => Number((data||{})[k] || 0));

  if (!window.Chart) { c.replaceWith(textFallback("الكبائن", labels, values)); return; }

  CH.cab = new Chart(c.getContext("2d"), {
    type: "pie",
    data: { labels, datasets: [{ data: values }] },
    options: { responsive:true, maintainAspectRatio:false, animation:{duration:600} }
  });
}

function drawAssetsBar(data) {
  const c = qs("#assetsBar"); if (!c) return;
  fixedCanvas(c, 320); destroy(CH.ast);

  const labels = ["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"];
  const values = labels.map(k => Number((data||{})[k] || 0));

  if (!window.Chart) { c.replaceWith(textFallback("الأصول", labels, values)); return; }

  CH.ast = new Chart(c.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label:"عدد", data: values }] },
    options: {
      responsive:true, maintainAspectRatio:false, animation:{duration:600},
      scales: { y: { beginAtZero:true, suggestedMax: Math.max(5, Math.max(...values)+1) } }
    }
  });
}

function drawSparesBar(data) {
  const c = qs("#sparesBar"); if (!c) return;
  fixedCanvas(c, 320); destroy(CH.spa);

  const labels = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
  const values = labels.map(k => Number((data||{})[k] || 0));

  if (!window.Chart) { c.replaceWith(textFallback("قطع الغيار", labels, values)); return; }

  CH.spa = new Chart(c.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label:"عدد", data: values }] },
    options: {
      responsive:true, maintainAspectRatio:false, animation:{duration:600},
      scales: { y: { beginAtZero:true, suggestedMax: Math.max(5, Math.max(...values)+1) } }
    }
  });
}

function textFallback(title, labels, vals) {
  const div = document.createElement("div");
  const has = vals.some(v => Number(v) > 0);
  div.className = "panel-lite";
  div.innerHTML = `
    <div style="padding:10px">
      <div style="font-weight:700;margin-bottom:8px">${title}</div>
      ${has ? `<ul style="list-style:disc;padding-inline-start:20px;margin:0">
        ${labels.map((l,i)=>`<li>${l}: ${vals[i]}</li>`).join("")}
      </ul>` : `<div class="muted">لا توجد بيانات لهذا الشهر</div>`}
    </div>`;
  return div;
}

/* ================== تدفق التحديث ================== */
async function updateCharts() {
  const { year, month } = getYearMonth();
  log("update charts", { year, month });

  setDisabled(true);
  const [cab, ast, spa] = await Promise.all([
    getJSON(`${API_BASE}/api/stats/cabinets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/assets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/spares?year=${year}&month=${month}`)
  ]);

  drawCabinetsPie(cab);
  drawAssetsBar(ast);
  drawSparesBar(spa);
  setDisabled(false);
}

function setDisabled(x) {
  qsa("button.btn, button").forEach(b => b.disabled = !!x);
}

/* ================== تصدير ================== */
function exportMonthly() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/monthly_summary.xlsx?year=${year}&month=${month}`);
}
function exportQuarterly() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/quarterly_summary.xlsx?start_year=${year}&start_month=${month}`);
}

/* ================== تشغيل ================== */
document.addEventListener("DOMContentLoaded", () => {
  log("app.js ready");
  bindUI();

  // لو عندك قيم افتراضية للسنة/الشهر خليها الآن
  const now = new Date();
  if (qs("#year")  && !qs("#year").value)  qs("#year").value  = String(now.getFullYear());
  if (qs("#month") && !qs("#month").value) qs("#month").value = String(now.getMonth()+1);

  // جهّز الكانفاسات
  fixedCanvas(qs("#cabPie")); fixedCanvas(qs("#assetsBar")); fixedCanvas(qs("#sparesBar"));

  // تحديث أولي (إن وُجدت بيانات)
  updateCharts();
});
