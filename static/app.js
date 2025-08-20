/* =========================================================================
   maintenance_app - front-end bootstrap
   - Works on localhost and Render (relative API base)
   - Robust button binding (by ID or Arabic label)
   - Safe fetch wrappers with clear console errors
   - Charts: destroys old instances to avoid stretching/overlap
   - Fixed canvas heights; responsive width
   - Exports: monthly, quarterly, issue full/summary
   ======================================================================== */

"use strict";

/* ----------------------------- Config ---------------------------------- */
// Always call the same origin the page is served from.
const API_BASE = "";

/* --------------------------- Utilities --------------------------------- */
const qs  = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function log(...args)   { console.log("[app]", ...args); }
function warn(...args)  { console.warn("[app]", ...args); }
function error(...args) { console.error("[app]", ...args); }

async function getJSON(url) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    return await r.json();
  } catch (e) {
    error("GET failed:", url, e);
    return null;
  }
}

function download(url) {
  // Using same window is more reliable with some blockers
  window.location.href = url;
}

function bindClickByIdOrText(id, containsText, handler) {
  let el = id ? qs(`#${id}`) : null;
  if (!el && containsText) {
    el = qsa("button, a, .btn").find(b => (b.textContent || "").trim().includes(containsText));
  }
  if (el) {
    el.addEventListener("click", ev => { ev.preventDefault?.(); handler(); });
    log("bound:", id || containsText);
  } else {
    warn("button not found:", id || containsText);
  }
}

function int(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/* ---------------------------- Date inputs ------------------------------ */
function getYearMonth() {
  const yEl = qs("#year")  || qs('[name="year"]');
  const mEl = qs("#month") || qs('[name="month"]');
  const now = new Date();
  const year  = int(yEl?.value ?? now.getFullYear(), now.getFullYear());
  const month = int(mEl?.value ?? (now.getMonth() + 1), now.getMonth() + 1); // 1..12
  return { year, month };
}

/* --------------------------- Charts setup ------------------------------ */
// We support Chart.js if present; otherwise show minimal text.
let CHARTS = { cab: null, ast: null, spa: null };

function fixedCanvas(el, height = 320) {
  if (!el) return null;
  // Ensure a fixed height to prevent vertical stretching
  el.style.width = "100%";
  el.style.height = `${height}px`;
  // For Chart.js, set attribute height too
  if (!el.getAttribute("height")) el.setAttribute("height", String(height));
  return el.getContext ? el : null;
}

function destroyChart(slot) {
  if (CHARTS[slot] && typeof CHARTS[slot].destroy === "function") {
    CHARTS[slot].destroy();
  }
  CHARTS[slot] = null;
}

function hasData(obj) {
  if (!obj) return false;
  const vals = Object.values(obj).map(v => Number(v || 0));
  return vals.some(n => n > 0);
}

/* ---------- Render Cabinets (Pie) ---------- */
function renderCabinetsPie(dataObj) {
  const canvas =
    qs("#cabPie") || qs("#cabinetPie") || qs("#chartCabinets") || qs('canvas[data-chart="cabinets"]');
  if (!canvas) { warn("cabinet pie canvas not found"); return; }
  fixedCanvas(canvas, 320);
  destroyChart("cab");

  const labels = ["ATS", "AMF", "HYBRID", "حماية انفرتر", "ظفيرة تحكم"];
  const dataset = labels.map(k => Number((dataObj || {})[k] || 0));

  if (!window.Chart) {
    // fallback: show text
    canvas.replaceWith(textFallback("الكبائن", labels, dataset));
    return;
  }

  CHARTS.cab = new Chart(canvas.getContext("2d"), {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: dataset
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 }
    }
  });
}

/* ---------- Render Assets (Bar) ---------- */
function renderAssetsBar(dataObj) {
  const canvas =
    qs("#assetsBar") || qs("#chartAssets") || qs('canvas[data-chart="assets"]');
  if (!canvas) { warn("assets bar canvas not found"); return; }
  fixedCanvas(canvas, 320);
  destroyChart("ast");

  const labels = ["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"];
  const dataset = labels.map(k => Number((dataObj || {})[k] || 0));

  if (!window.Chart) {
    canvas.replaceWith(textFallback("الأصول", labels, dataset));
    return;
  }

  CHARTS.ast = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "عدد", data: dataset }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        y: { beginAtZero: true, suggestedMax: Math.max(5, Math.max(...dataset) + 1) }
      }
    }
  });
}

/* ---------- Render Spares (Bar) ---------- */
function renderSparesBar(dataObj) {
  const canvas =
    qs("#sparesBar") || qs("#chartSpares") || qs('canvas[data-chart="spares"]');
  if (!canvas) { warn("spares bar canvas not found"); return; }
  fixedCanvas(canvas, 320);
  destroyChart("spa");

  const labels = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
  const dataset = labels.map(k => Number((dataObj || {})[k] || 0));

  if (!window.Chart) {
    canvas.replaceWith(textFallback("قطع الغيار", labels, dataset));
    return;
  }

  CHARTS.spa = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "عدد", data: dataset }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      scales: {
        y: { beginAtZero: true, suggestedMax: Math.max(5, Math.max(...dataset) + 1) }
      }
    }
  });
}

/* ---------- Text fallback (no Chart.js) ---------- */
function textFallback(title, labels, values) {
  const wrap = document.createElement("div");
  wrap.className = "panel-lite";
  const has = values.some(v => Number(v) > 0);
  wrap.innerHTML = `
    <div style="padding:10px">
      <div style="font-weight:700;margin-bottom:8px">${title}</div>
      ${has
        ? `<ul style="list-style:disc;padding-inline-start:20px;margin:0">
             ${labels.map((l,i)=>`<li>${l}: ${values[i]}</li>`).join("")}
           </ul>`
        : `<div class="muted">لا توجد بيانات لهذا الشهر</div>`}
    </div>`;
  return wrap;
}

/* ----------------------- Update Charts Flow ---------------------------- */
async function updateCharts() {
  const { year, month } = getYearMonth();
  log("update charts for", { year, month });

  // Disable all buttons while loading to prevent double-press
  setButtonsDisabled(true);

  const [cab, ast, spa] = await Promise.all([
    getJSON(`${API_BASE}/api/stats/cabinets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/assets?year=${year}&month=${month}`),
    getJSON(`${API_BASE}/api/stats/spares?year=${year}&month=${month}`)
  ]);

  // Render
  renderCabinetsPie(cab);
  renderAssetsBar(ast);
  renderSparesBar(spa);

  // Show simple “no data” banners if everything is zero
  if (!hasData(cab) && !hasData(ast) && !hasData(spa)) {
    infoBanner("لا توجد بيانات لهذا الشهر. أضف سجلات ثم اضغط (تحديث الرسوم).");
  } else {
    clearBanner();
  }

  setButtonsDisabled(false);
}

/* --------------------------- Exports ----------------------------------- */
function exportMonthly() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/monthly_summary.xlsx?year=${year}&month=${month}`);
}
function exportQuarterly() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/quarterly_summary.xlsx?start_year=${year}&start_month=${month}`);
}
function exportIssueFull()    { download(`${API_BASE}/api/export/issue/full.xlsx`); }
function exportIssueSummary() { download(`${API_BASE}/api/export/issue/summary.xlsx`); }

// Optional: per-section exports if you added buttons for them
function exportCabinetsMonth() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/cabinets.xlsx?year=${year}&month=${month}`);
}
function exportAssetsMonth() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/assets.xlsx?year=${year}&month=${month}`);
}
function exportSparesMonth() {
  const { year, month } = getYearMonth();
  download(`${API_BASE}/api/export/spares.xlsx?year=${year}&month=${month}`);
}

/* ---------------------- Optional Search Hooks -------------------------- */
/* If your HTML has inputs with these IDs, the handlers will be attached:
   - #searchCode  (cabinet code)
   - #searchSerialAsset  (asset serial)
   - #searchSerialSpare  (spare serial)
   - and result containers with #searchResultCab / #searchResultAsset / #searchResultSpare
*/
async function attachSearchHandlers() {
  const codeInput = qs("#searchCode");
  if (codeInput) {
    const btn = qs("#btnFindCabinet") || findBtnByText("بحث الكبائن") || findBtnByText("بحث الترميز");
    if (btn) btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const code = (codeInput.value || "").trim();
      if (!code) return;
      const data = await getJSON(`${API_BASE}/api/cabinets/find?code=${encodeURIComponent(code)}`);
      renderResult("#searchResultCab", data, "نتيجة الترميز");
    });
  }

  const assetSerial = qs("#searchSerialAsset");
  if (assetSerial) {
    const btn = qs("#btnFindAsset") || findBtnByText("بحث الأصل");
    if (btn) btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const sn = (assetSerial.value || "").trim();
      if (!sn) return;
      const data = await getJSON(`${API_BASE}/api/assets/find?serial=${encodeURIComponent(sn)}`);
      renderResult("#searchResultAsset", data, "نتيجة الأصل");
    });
  }

  const spareSerial = qs("#searchSerialSpare");
  if (spareSerial) {
    const btn = qs("#btnFindSpare") || findBtnByText("بحث القطعة");
    if (btn) btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const sn = (spareSerial.value || "").trim();
      if (!sn) return;
      const data = await getJSON(`${API_BASE}/api/spares/find?serial=${encodeURIComponent(sn)}`);
      renderResult("#searchResultSpare", data, "نتيجة القطعة");
    });
  }
}

function findBtnByText(txt) {
  return qsa("button, a, .btn").find(b => (b.textContent || "").trim().includes(txt));
}

function renderResult(targetSel, data, title) {
  const target = qs(targetSel);
  if (!target) return;
  if (!data) {
    target.innerHTML = `<div class="panel-lite"><div class="muted">لا توجد نتيجة</div></div>`;
    return;
  }
  const pre = document.createElement("pre");
  pre.style.background = "#f8fafc";
  pre.style.border = "1px solid #e5e7eb";
  pre.style.borderRadius = "8px";
  pre.style.padding = "10px";
  pre.textContent = JSON.stringify(data, null, 2);
  target.innerHTML = `<div style="font-weight:700;margin-bottom:8px">${title}</div>`;
  target.appendChild(pre);
}

/* ------------------------ UI Helpers ----------------------------------- */
function setButtonsDisabled(disabled) {
  qsa("button, .btn").forEach(b => {
    if (b.dataset.nolock === "1") return; // opt-out if needed
    b.disabled = !!disabled;
  });
}

function infoBanner(msg) {
  let bar = qs("#info-banner");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "info-banner";
    bar.style.background = "#fff8e1";
    bar.style.border = "1px solid #ffe08a";
    bar.style.padding = "10px";
    bar.style.borderRadius = "10px";
    bar.style.margin = "10px 0";
    const container = qs("#banner-container") || qs("main") || document.body;
    container.prepend(bar);
  }
  bar.textContent = msg;
}
function clearBanner() {
  const bar = qs("#info-banner");
  if (bar) bar.remove();
}

/* --------------------------- Init -------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  log("app.js loaded @", new Date().toISOString());

  // Bind by ID if present; else by Arabic label text.
  bindClickByIdOrText("btnUpdateCharts", "تحديث الرسوم", updateCharts);
  bindClickByIdOrText("btnMonthlySummary", "توليد ملخص شهري", exportMonthly);
  bindClickByIdOrText("btnQuarterlySummary", "توليد ملخص ربع سنوي", exportQuarterly);
  bindClickByIdOrText("btnIssueFull", "تقرير الصرف كامل", exportIssueFull);
  bindClickByIdOrText("btnIssueSummary", "تقرير الصرف الملخص", exportIssueSummary);

  // Optional monthly section exports if you have buttons for them
  bindClickByIdOrText("btnExportCabMonth", "تصدير الكبائن", exportCabinetsMonth);
  bindClickByIdOrText("btnExportAstMonth", "تصدير الأصول",  exportAssetsMonth);
  bindClickByIdOrText("btnExportSpaMonth", "تصدير قطع الغيار", exportSparesMonth);

  // Attach search handlers if the inputs/buttons exist in your HTML
  attachSearchHandlers();

  // Auto-render once on load so the page shows something immediately
  updateCharts();

  // Keep fixed height on resize but let width be responsive
  window.addEventListener("resize", () => {
    ["cab", "ast", "spa"].forEach(slot => {
      if (CHARTS[slot]?.resize) CHARTS[slot].resize();
    });
  });
});
// ===== Fix Panel Toggle (بدون تغيير التصميم) =====
(function () {
  function byText(txt) {
    return Array.from(document.querySelectorAll("button, a, .btn"))
      .find(b => (b.textContent || "").trim().includes(txt));
  }
  function pick(cands) {
    for (const s of cands) { const el = document.querySelector(s); if (el) return el; }
    return null;
  }
  function pickByHeading(text){
    const boxes = Array.from(document.querySelectorAll("section,div,article"))
      .filter(el => el.hasAttribute("data-panel") || /panel|لوحة|section|tab|content/i.test(el.className||""));
    return boxes.find(el => {
      const h = el.querySelector("h1,h2,h3,.title,.section-title");
      return h && (h.textContent||"").includes(text);
    }) || null;
  }
  const homePanel  = pick(["#panel-home","#home",".home-panel"]) || pickByHeading("القائمة") || pickByHeading("الرئيسية");
  const issuePanel = pick(["#panel-issue","#issue-panel","#issue",".panel-issue",".issue-panel"]) || pickByHeading("الصرف") || pickByHeading("الطارئ");
  const qualPanel  = pick(["#panel-qual","#qual-panel","#qualification",".panel-qual",".qual-panel"]) || pickByHeading("توريد") || pickByHeading("تأهيل");

  function showOnly(el) {
    [homePanel, issuePanel, qualPanel].forEach(p => { if (!p) return; p.hidden = true; p.style.display = "none"; });
    if (el) { el.hidden = false; el.style.display = ""; }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const btnIssue = document.querySelector("#open-issue") || byText("الصرف/الطارئ") || byText("الصرف");
    const btnQual  = document.querySelector("#open-qual")  || byText("توريد/تأهيل") || byText("التأهيل") || byText("توريد");
    const backBtns = document.querySelectorAll("#back-home, #back-home-2, .btn-back");

    if (homePanel) showOnly(homePanel);

    if (btnIssue && issuePanel) {
      btnIssue.addEventListener("click", e => { e.preventDefault(); showOnly(issuePanel); });
    } else {
      console.warn("⚠️ لم يتم العثور على زر أو لوحة الصرف/الطارئ");
    }
    if (btnQual && qualPanel) {
      btnQual.addEventListener("click", e => { e.preventDefault(); showOnly(qualPanel); });
    } else {
      console.warn("⚠️ لم يتم العثور على زر أو لوحة التوريد/التأهيل");
    }
    backBtns.forEach(b => b.addEventListener("click", e => { e.preventDefault(); if (homePanel) showOnly(homePanel); }));
  });
})();
