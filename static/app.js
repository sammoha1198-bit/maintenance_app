/* =========================================================================
   maintenance_app - front-end (Arabic, RTL)
   - Buttons open panels reliably (by IDs you already have)
   - Forms save as FormData (matches your FastAPI endpoints)
   - Charts: fixed height, destroy/recreate each time (no axis creep)
   - Global search (code/serial) at the top
   - Duplicate check shows results instantly
   - Excel exports accumulate from start of month to generation time
   ======================================================================== */

"use strict";

/* ----------------------------- Config ---------------------------------- */
const API = ""; // same-origin

/* --------------------------- Utilities --------------------------------- */
const qs  = (sel, el = document) => el.querySelector(sel);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const now = () => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; };
const toInt = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

async function getJSON(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) {
    // try to extract detail from JSON
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function postForm(url, form) {
  const r = await fetch(url, { method: "POST", body: form });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  // Some endpoints return JSON, others may return bodyless 204—handle both
  try { return await r.json(); } catch { return {}; }
}

async function putForm(url, form) {
  const r = await fetch(url, { method: "PUT", body: form });
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); if (j?.detail) msg = j.detail; } catch {}
    throw new Error(msg);
  }
  try { return await r.json(); } catch { return {}; }
}

function download(url) {
  window.location.href = url;
}

/* ----------------------------- Panels ---------------------------------- */
function showMain() {
  // Keep charts visible; only hide data-entry panels
  ["panel-issue", "panel-rehab", "panel-excel"].forEach(id => qs("#" + id)?.classList.add("hidden"));
}

function openIssue() {
  showMain();
  qs("#panel-issue")?.classList.remove("hidden");
}

function openRehab() {
  showMain();
  qs("#panel-rehab")?.classList.remove("hidden");
  rehabShowChooser();
}

function openExcel() {
  showMain();
  qs("#panel-excel")?.classList.remove("hidden");
}

function rehabShowChooser() {
  qs("#rehab-chooser")?.classList.remove("hidden");
  ["block-cab", "block-ast", "block-spa"].forEach(id => qs("#" + id)?.classList.add("hidden"));
}

function rehabOpenBlock(which) {
  qs("#rehab-chooser")?.classList.add("hidden");
  ["block-cab", "block-ast", "block-spa"].forEach(id => qs("#" + id)?.classList.add("hidden"));
  qs("#block-" + which)?.classList.remove("hidden");
}

/* ------------------------------ Charts --------------------------------- */
const CHARTS = { cab: null, ast: null, spa: null };
const CHART_HEIGHT = 320;

// Replace canvas with a fresh one to fully reset size/state (prevents axis creep)
function freshCtx(canvasId) {
  const old = qs("#" + canvasId);
  if (!old) return null;
  const parent = old.parentNode;
  const clone = old.cloneNode(false); // same id
  parent.replaceChild(clone, old);
  // lock pixel size so charts won't grow
  clone.style.width = "100%";
  clone.style.height = CHART_HEIGHT + "px";
  clone.setAttribute("height", String(CHART_HEIGHT));
  // width in pixels: try container width, fallback 800
  const px = Math.max(320, clone.clientWidth || (parent?.clientWidth || 800));
  clone.setAttribute("width", String(px));
  return clone.getContext("2d");
}

function killChart(key) {
  if (CHARTS[key]?.destroy) CHARTS[key].destroy();
  CHARTS[key] = null;
}

function yMaxFixed(arr) {
  const n = Math.max(0, ...arr.map(v => Number(v || 0)));
  return Math.max(5, Math.ceil(n * 1.15) + 1); // small headroom; min 5
}

async function updateCharts() {
  const cur = now();
  const y = toInt(qs("#chart-year")?.value || cur.y, cur.y);
  const m = toInt(qs("#chart-month")?.value || cur.m, cur.m);

  // Load all three series in parallel
  const [cab, ast, spa] = await Promise.allSettled([
    getJSON(`${API}/api/stats/cabinets?year=${y}&month=${m}`),
    getJSON(`${API}/api/stats/assets?year=${y}&month=${m}&date_field=rehab_date`),
    getJSON(`${API}/api/stats/spares?year=${y}&month=${m}`)
  ]);

  // Cabinets (pie)
  if (cab.status === "fulfilled") {
    const labels = ["ATS", "AMF", "HYBRID", "حماية انفرتر", "ظفيرة تحكم"];
    const data = labels.map(k => Number(cab.value?.[k] || 0));
    killChart("cab");
    const ctx = freshCtx("viz-cab");
    if (ctx && window.Chart) {
      CHARTS.cab = new Chart(ctx, {
        type: "pie",
        data: { labels, datasets: [{ data }] },
        options: { responsive: false, animation: { duration: 0 }, plugins: { legend: { position: "bottom" } } }
      });
    }
  }

  // Assets (bar)
  if (ast.status === "fulfilled") {
    const labels = ["بطاريات", "موحدات", "محركات", "مولدات", "مكيفات", "أصول أخرى"];
    const data = labels.map(k => Number(ast.value?.[k] || 0));
    killChart("ast");
    const ctx = freshCtx("viz-ast");
    if (ctx && window.Chart) {
      CHARTS.ast = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "عدد", data }] },
        options: {
          responsive: false, animation: { duration: 0 },
          scales: { y: { beginAtZero: true, max: yMaxFixed(data), ticks: { precision: 0 } } }
        }
      });
    }
  }

  // Spares (bar)
  if (spa.status === "fulfilled") {
    const labels = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"];
    const data = labels.map(k => Number(spa.value?.[k] || 0));
    killChart("spa");
    const ctx = freshCtx("viz-spa");
    if (ctx && window.Chart) {
      CHARTS.spa = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets: [{ label: "عدد", data }] },
        options: {
          responsive: false, animation: { duration: 0 },
          scales: { y: { beginAtZero: true, max: yMaxFixed(data), ticks: { precision: 0 } } }
        }
      });
    }
  }
}

/* ------------------------------ Forms ---------------------------------- */
// صرف/طارئ
function bindIssue() {
  const f = qs("#form-issue"); if (!f) return;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await postForm(`${API}/api/issue`, new FormData(f));
      alert("تم الحفظ");
      f.reset();
      updateCharts();
    } catch (err) {
      alert("فشل الحفظ: " + err.message);
    }
  });
}

// كبائن
function bindCab() {
  const f = qs("#form-cab"); if (!f) return;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const id = fd.get("id");
    try {
      if (id) await putForm(`${API}/api/cabinets/${encodeURIComponent(id)}`, fd);
      else     await postForm(`${API}/api/cabinets`, fd);
      alert("تم الحفظ");
      f.reset();
      updateCharts();
    } catch (err) {
      alert("فشل الحفظ: " + err.message);
    }
  });
}

// أصول (منع الحفظ عند تكرار: السيرفر يرجع 400 برسالة مفهومة)
function bindAst() {
  const f = qs("#form-ast"); if (!f) return;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const id = fd.get("id");
    try {
      if (id) await putForm(`${API}/api/assets/${encodeURIComponent(id)}`, fd);
      else     await postForm(`${API}/api/assets`, fd);
      alert("تم الحفظ");
      f.reset();
      updateCharts();
    } catch (err) {
      // 400 من السيرفر عند التكرار: تظهر الرسالة العربية كما هي
      alert("فشل الحفظ: " + err.message);
    }
  });
}

// قطع الغيار
function bindSpa() {
  const f = qs("#form-spa"); if (!f) return;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await postForm(`${API}/api/spares`, new FormData(f));
      alert("تم الحفظ");
      f.reset();
      updateCharts();
    } catch (err) {
      alert("فشل الحفظ: " + err.message);
    }
  });
}

/* ------------------------------ Excel ---------------------------------- */
function bindExcel() {
  // الصرف
  qs("#btn-excel-issue-full")?.addEventListener("click", () => {
    const y = qs("#excel-issue-year")?.value, m = qs("#excel-issue-month")?.value;
    const q = (y && m) ? `?year=${y}&month=${m}` : "";
    download(`${API}/api/export/issue/full.xlsx${q}`);
  });
  qs("#btn-excel-issue-summary")?.addEventListener("click", () => {
    const y = qs("#excel-issue-year")?.value, m = qs("#excel-issue-month")?.value;
    const q = (y && m) ? `?year=${y}&month=${m}` : "";
    download(`${API}/api/export/issue/summary.xlsx${q}`);
  });

  // كبائن
  qs("#btn-excel-cab")?.addEventListener("click", () => {
    const cur = now();
    const y = toInt(qs("#excel-cab-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-cab-month")?.value || cur.m, cur.m);
    download(`${API}/api/export/cabinets.xlsx?year=${y}&month=${m}`);
  });

  // أصول
  qs("#btn-excel-ast")?.addEventListener("click", () => {
    const cur = now();
    const y = toInt(qs("#excel-ast-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-ast-month")?.value || cur.m, cur.m);
    download(`${API}/api/export/assets.xlsx?year=${y}&month=${m}`);
  });

  // قطع الغيار
  qs("#btn-excel-spa")?.addEventListener("click", () => {
    const cur = now();
    const y = toInt(qs("#excel-spa-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-spa-month")?.value || cur.m, cur.m);
    download(`${API}/api/export/spares.xlsx?year=${y}&month=${m}`);
  });

  // ملخصات
  qs("#btn-excel-monthly")?.addEventListener("click", () => {
    const cur = now();
    const y = toInt(qs("#excel-sum-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-sum-month")?.value || cur.m, cur.m);
    download(`${API}/api/export/monthly_summary.xlsx?year=${y}&month=${m}`);
  });
  qs("#btn-excel-quarterly")?.addEventListener("click", () => {
    const cur = now();
    const y = toInt(qs("#excel-q-year")?.value || cur.y, cur.y);
    const m = toInt(qs("#excel-q-month")?.value || cur.m, cur.m);
    download(`${API}/api/export/quarterly_summary.xlsx?start_year=${y}&start_month=${m}`);
  });
}

/* -------------------------- Duplicate check ---------------------------- */
function bindDuplicates() {
  const btn = qs("#btn-dup"); if (!btn) return;
  btn.addEventListener("click", async () => {
    const box = qs("#dup-result"); if (!box) return;
    try {
      const r = await getJSON(`${API}/api/validate/duplicates`);
      const html = `
        <div><b>أكواد كبائن مكررة:</b> ${r.cabinets_codes?.length ? r.cabinets_codes.join(" ، ") : "لا يوجد"}</div>
        <div><b>أرقام أصول مكررة:</b> ${r.assets_serials?.length ? r.assets_serials.join(" ، ") : "لا يوجد"}</div>
        <div><b>(رقم+موقع) للأصول مكرر:</b> ${r.assets_serial_loc_pairs?.length ? r.assets_serial_loc_pairs.join(" ، ") : "لا يوجد"}</div>
        <div><b>(سيريال+مصدر) للغيار مكرر:</b> ${r.spares_serial_src_pairs?.length ? r.spares_serial_src_pairs.join(" ، ") : "لا يوجد"}</div>
      `;
      box.innerHTML = html;
      box.style.display = "block";
    } catch (e) {
      box.innerHTML = `<span class="muted">تعذّر الفحص: ${e.message}</span>`;
      box.style.display = "block";
    }
  });
}

/* ----------------------------- Global search --------------------------- */
/* متطلب: حقل إدخال بأعلى الصفحة:
   <input id="global-search-input" placeholder="بحث بالترميز أو الرقم التسلسلي">
   <button id="global-search-btn">بحث</button>
   <div id="global-search-result"></div>
*/
async function doGlobalSearch(term) {
  const out = qs("#global-search-result");
  if (out) { out.textContent = "جارِ البحث..."; out.style.display = "block"; }

  // نحاول حسب الترتيب: كبائن (code) → أصول (serial_or_code) → غيار (serial)
  try {
    const cab = await getJSON(`${API}/api/cabinets/find?code=${encodeURIComponent(term)}`);
    if (out) {
      out.innerHTML = `<div>تم العثور على <b>كبينة</b> بالترميز: ${cab.code || "-"}</div>`;
      out.style.display = "block";
    }
    openRehab(); rehabOpenBlock("cab");
    return;
  } catch {}

  try {
    const ast = await getJSON(`${API}/api/assets/find?serial=${encodeURIComponent(term)}`);
    if (out) {
      out.innerHTML = `<div>تم العثور على <b>أصل</b> بالرقم/الترميز: ${ast.serial_or_code || "-"}</div>`;
      out.style.display = "block";
    }
    openRehab(); rehabOpenBlock("ast");
    return;
  } catch {}

  try {
    const spa = await getJSON(`${API}/api/spares/find?serial=${encodeURIComponent(term)}`);
    if (out) {
      out.innerHTML = `<div>تم العثور على <b>قطعة غيار</b> بالرقم التسلسلي: ${spa.serial || "-"}</div>`;
      out.style.display = "block";
    }
    openRehab(); rehabOpenBlock("spa");
    return;
  } catch {}

  if (out) {
    out.innerHTML = `<span class="muted">لا توجد نتائج مطابقة.</span>`;
    out.style.display = "block";
  }
}

function bindGlobalSearch() {
  const input = qs("#global-search-input");
  const btn   = qs("#global-search-btn");
  if (!input || !btn) return;
  const go = () => {
    const t = (input.value || "").trim();
    if (!t) return;
    doGlobalSearch(t);
  };
  btn.addEventListener("click", (e) => { e.preventDefault(); go(); });
  input.addEventListener("keyup", (e) => { if (e.key === "Enter") go(); });
}

/* -------------------------------- Init --------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Main tiles
  qs("#tile-issue")?.addEventListener("click", openIssue);
  qs("#tile-rehab")?.addEventListener("click", openRehab);
  qs("#tile-excel")?.addEventListener("click", openExcel);

  // Back buttons
  qsa(".btn-back-main").forEach(b => b.addEventListener("click", showMain));
  qsa(".btn-back-rehab").forEach(b => b.addEventListener("click", rehabShowChooser));

  // Rehab sub-tiles
  qs("#sub-cab")?.addEventListener("click", () => rehabOpenBlock("cab"));
  qs("#sub-ast")?.addEventListener("click", () => rehabOpenBlock("ast"));
  qs("#sub-spa")?.addEventListener("click", () => rehabOpenBlock("spa"));

  // Forms
  bindIssue();
  bindCab();
  bindAst();
  bindSpa();

  // Excel & Duplicates
  bindExcel();
  bindDuplicates();

  // Global search
  bindGlobalSearch();

  // Charts
  qs("#btn-refresh-charts")?.addEventListener("click", updateCharts);
  updateCharts();

  // Start on main menu with charts visible
  showMain();

  // Refix charts if container width changes
  window.addEventListener("resize", () => {
    updateCharts(); // recreate with fresh widths
  });
});
