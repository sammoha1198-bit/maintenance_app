/* =========================
   app.js — Maintenance App
   ========================= */

"use strict";

/* ----------- Config ----------- */
const API_BASE = ""; // relative base: works locally and on Render

/* --------- Helpers ---------- */
async function fetchJSON(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.json();
  } catch (err) {
    console.error("fetchJSON failed:", path, err);
    return null;
  }
}

async function sendJSON(path, method, body) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch {}
    if (!res.ok) throw new Error(data?.detail || txt || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error(`${method} ${path} failed`, err);
    alert(err.message || "حدث خطأ في الطلب");
    return null;
  }
}

function downloadFile(url) {
  // trigger a file download without leaving the page
  const a = document.createElement("a");
  a.href = `${API_BASE}${url}`;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function parseIntSafe(v, def = 0) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function sumValues(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

/* ----- Draw "empty" message on a canvas (when no data) ----- */
function drawEmptyMessageOnCanvas(canvasId, message = "لا توجد بيانات لهذا الشهر") {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  // clear
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // draw message, center-ish
  ctx.save();
  ctx.fillStyle = "#999";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const x = canvas.width / 2;
  const y = canvas.height / 2;
  ctx.fillText(message, x, y);
  ctx.restore();
}

/* ---------- Charts (Chart.js) ---------- */
const charts = {
  cabinets: null,
  assets: null,
  spares: null,
};

function destroyChart(key) {
  if (charts[key]) {
    try { charts[key].destroy(); } catch {}
    charts[key] = null;
  }
}

function makePieChart(canvasId, labels, values, title) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "pie",
    data: { labels, datasets: [{ data: values }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: true, position: "bottom" },
        title: { display: !!title, text: title },
      },
      animation: { duration: 300 },
    },
  });
}

function makeBarChart(canvasId, labels, values, title) {
  const ctx = document.getElementById(canvasId)?.getContext("2d");
  if (!ctx) return null;
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        title: { display: !!title, text: title }
      },
      animation: { duration: 300 },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

/* ---------- Month/Year controls ---------- */
function getSelectedYearMonth() {
  const yearEl = document.getElementById("year");
  const monthEl = document.getElementById("month");
  const year = parseIntSafe(yearEl?.value, new Date().getFullYear());
  const month = parseIntSafe(monthEl?.value, new Date().getMonth() + 1);
  return { year, month };
}

/* ---------- Charts updater ---------- */
async function updateCharts() {
  const { year, month } = getSelectedYearMonth();

  // Cabinets
  const cab = await fetchJSON(`/api/stats/cabinets?year=${year}&month=${month}`);
  if (cab && sumValues(cab) > 0) {
    destroyChart("cabinets");
    charts.cabinets = makePieChart(
      "cabinetChart",
      Object.keys(cab),
      Object.values(cab),
      "نِسَب إنجاز الكبائن"
    );
  } else {
    destroyChart("cabinets");
    drawEmptyMessageOnCanvas("cabinetChart");
  }

  // Assets
  const ast = await fetchJSON(`/api/stats/assets?year=${year}&month=${month}`);
  if (ast && sumValues(ast) > 0) {
    destroyChart("assets");
    charts.assets = makeBarChart(
      "assetChart",
      Object.keys(ast),
      Object.values(ast),
      "الأصول المؤهلة"
    );
  } else {
    destroyChart("assets");
    drawEmptyMessageOnCanvas("assetChart");
  }

  // Spares
  const spa = await fetchJSON(`/api/stats/spares?year=${year}&month=${month}`);
  if (spa && sumValues(spa) > 0) {
    destroyChart("spares");
    charts.spares = makeBarChart(
      "spareChart",
      Object.keys(spa),
      Object.values(spa),
      "قطع الغيار"
    );
  } else {
    destroyChart("spares");
    drawEmptyMessageOnCanvas("spareChart");
  }
}

/* ---------- Excel Exports ---------- */
function wireExports() {
  // Issue (full + summary)
  document.getElementById("btnIssueFull")?.addEventListener("click", () => {
    downloadFile("/api/export/issue/full.xlsx");
  });
  document.getElementById("btnIssueSummary")?.addEventListener("click", () => {
    downloadFile("/api/export/issue/summary.xlsx");
  });

  // Monthly/Quarterly summaries
  document.getElementById("btnMonthlySummary")?.addEventListener("click", () => {
    const { year, month } = getSelectedYearMonth();
    downloadFile(`/api/export/monthly_summary.xlsx?year=${year}&month=${month}`);
  });

  document.getElementById("btnQuarterlySummary")?.addEventListener("click", () => {
    const y = parseIntSafe(document.getElementById("qYear")?.value, new Date().getFullYear());
    const m = parseIntSafe(document.getElementById("qMonth")?.value, new Date().getMonth() + 1);
    downloadFile(`/api/export/quarterly_summary.xlsx?start_year=${y}&start_month=${m}`);
  });

  // Per-module monthly exports
  document.getElementById("btnExportCabinets")?.addEventListener("click", () => {
    const { year, month } = getSelectedYearMonth();
    downloadFile(`/api/export/cabinets.xlsx?year=${year}&month=${month}`);
  });
  document.getElementById("btnExportAssets")?.addEventListener("click", () => {
    const { year, month } = getSelectedYearMonth();
    downloadFile(`/api/export/assets.xlsx?year=${year}&month=${month}`);
  });
  document.getElementById("btnExportSpares")?.addEventListener("click", () => {
    const { year, month } = getSelectedYearMonth();
    downloadFile(`/api/export/spares.xlsx?year=${year}&month=${month}`);
  });
}

/* ---------- Forms: صرف (Issue) ---------- */
function wireIssueForm() {
  const form = document.getElementById("issueForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      item_name: form.item_name?.value || "",
      model: form.model?.value || null,
      serial: form.serial?.value || null,
      status: form.status?.value || null,
      quantity: parseIntSafe(form.quantity?.value, 1),
      location: form.location?.value || null,
      requester: form.requester?.value || null,
      issue_date: form.issue_date?.value, // YYYY-MM-DD
      qualified_by: form.qualified_by?.value || null,
      receiver: form.receiver?.value || null,
    };
    const ok = await sendJSON("/api/issue", "POST", payload);
    if (ok) {
      alert("تم حفظ الصرف بنجاح");
      form.reset();
    }
  });
}

/* ---------- Forms: توريد/تأهيل → كبائن ---------- */
function wireCabinets() {
  const form = document.getElementById("cabinetForm");
  const searchForm = document.getElementById("cabinetSearchForm");
  const updateBtn = document.getElementById("cabinetUpdateBtn");
  let editingId = null;

  // Create
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      cabinet_type: form.cabinet_type?.value || "",
      code: form.cab_code?.value || null,
      rehab_date: form.cab_rehab_date?.value,
      qualified_by: form.cab_qualified_by?.value || null,
      location: form.cab_location?.value || null,
      receiver: form.cab_receiver?.value || null,
      issue_date: form.cab_issue_date?.value || null,
      notes: form.cab_notes?.value || null,
    };
    const ok = await sendJSON("/api/cabinets", "POST", payload);
    if (ok) {
      alert("تم حفظ بيانات الكبائن");
      form.reset();
      editingId = null;
      await updateCharts();
    }
  });

  // Find by code (الترميز)
  searchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = searchForm.cab_search_code?.value || "";
    if (!code) return alert("أدخل الترميز للبحث");
    const data = await fetchJSON(`/api/cabinets/find?code=${encodeURIComponent(code)}`);
    if (!data) return alert("لم يتم العثور");
    // fill form
    editingId = data.id;
    form.cabinet_type && (form.cabinet_type.value = data.cabinet_type || "");
    form.cab_code && (form.cab_code.value = data.code || "");
    form.cab_rehab_date && (form.cab_rehab_date.value = data.rehab_date || "");
    form.cab_qualified_by && (form.cab_qualified_by.value = data.qualified_by || "");
    form.cab_location && (form.cab_location.value = data.location || "");
    form.cab_receiver && (form.cab_receiver.value = data.receiver || "");
    form.cab_issue_date && (form.cab_issue_date.value = data.issue_date || "");
    form.cab_notes && (form.cab_notes.value = data.notes || "");
  });

  // Update current record
  updateBtn?.addEventListener("click", async () => {
    if (!editingId) return alert("ابحث عن سجل أولاً");
    const payload = {
      id: editingId,
      cabinet_type: form.cabinet_type?.value || "",
      code: form.cab_code?.value || null,
      rehab_date: form.cab_rehab_date?.value,
      qualified_by: form.cab_qualified_by?.value || null,
      location: form.cab_location?.value || null,
      receiver: form.cab_receiver?.value || null,
      issue_date: form.cab_issue_date?.value || null,
      notes: form.cab_notes?.value || null,
    };
    const ok = await sendJSON(`/api/cabinets/${editingId}`, "PUT", payload);
    if (ok) {
      alert("تم تحديث بيانات الكبائن");
      await updateCharts();
    }
  });
}

/* ---------- Forms: توريد/تأهيل → الأصول ---------- */
function wireAssets() {
  const form = document.getElementById("assetForm");
  const searchForm = document.getElementById("assetSearchForm");
  const updateBtn = document.getElementById("assetUpdateBtn");
  let editingId = null;

  // Create
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      asset_type: form.asset_type?.value || "",
      model: form.asset_model?.value || null,
      serial_or_code: form.asset_serial?.value || null,
      quantity: parseIntSafe(form.asset_quantity?.value, 1),
      prev_location: form.asset_prev_location?.value || null,
      supply_date: form.asset_supply_date?.value,
      qualified_by: form.asset_qualified_by?.value || null,
      lifted: form.asset_lifted?.checked ?? null,
      inspector: form.asset_inspector?.value || null,
      tested: form.asset_tested?.checked ?? null,
      issue_date: form.asset_issue_date?.value || null,
      current_location: form.asset_current_location?.value || null,
      requester: form.asset_requester?.value || null,
      receiver: form.asset_receiver?.value || null,
      notes: form.asset_notes?.value || null,
    };
    const ok = await sendJSON("/api/assets", "POST", payload);
    if (ok) {
      alert("تم حفظ بيانات الأصول");
      form.reset();
      editingId = null;
      await updateCharts();
    }
  });

  // Find by serial/code (الرقم التسلسلي/الترميز)
  searchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const serial = searchForm.asset_search_serial?.value || "";
    if (!serial) return alert("أدخل الرقم التسلسلي/الترميز للبحث");
    const data = await fetchJSON(`/api/assets/find?serial=${encodeURIComponent(serial)}`);
    if (!data) return alert("لم يتم العثور");
    editingId = data.id;
    // fill
    form.asset_type && (form.asset_type.value = data.asset_type || "");
    form.asset_model && (form.asset_model.value = data.model || "");
    form.asset_serial && (form.asset_serial.value = data.serial_or_code || "");
    form.asset_quantity && (form.asset_quantity.value = data.quantity ?? 1);
    form.asset_prev_location && (form.asset_prev_location.value = data.prev_location || "");
    form.asset_supply_date && (form.asset_supply_date.value = data.supply_date || "");
    form.asset_qualified_by && (form.asset_qualified_by.value = data.qualified_by || "");
    if (form.asset_lifted) form.asset_lifted.checked = !!data.lifted;
    form.asset_inspector && (form.asset_inspector.value = data.inspector || "");
    if (form.asset_tested) form.asset_tested.checked = !!data.tested;
    form.asset_issue_date && (form.asset_issue_date.value = data.issue_date || "");
    form.asset_current_location && (form.asset_current_location.value = data.current_location || "");
    form.asset_requester && (form.asset_requester.value = data.requester || "");
    form.asset_receiver && (form.asset_receiver.value = data.receiver || "");
    form.asset_notes && (form.asset_notes.value = data.notes || "");
  });

  // Update
  updateBtn?.addEventListener("click", async () => {
    if (!editingId) return alert("ابحث عن سجل أولاً");
    const payload = {
      id: editingId,
      asset_type: form.asset_type?.value || "",
      model: form.asset_model?.value || null,
      serial_or_code: form.asset_serial?.value || null,
      quantity: parseIntSafe(form.asset_quantity?.value, 1),
      prev_location: form.asset_prev_location?.value || null,
      supply_date: form.asset_supply_date?.value,
      qualified_by: form.asset_qualified_by?.value || null,
      lifted: form.asset_lifted?.checked ?? null,
      inspector: form.asset_inspector?.value || null,
      tested: form.asset_tested?.checked ?? null,
      issue_date: form.asset_issue_date?.value || null,
      current_location: form.asset_current_location?.value || null,
      requester: form.asset_requester?.value || null,
      receiver: form.asset_receiver?.value || null,
      notes: form.asset_notes?.value || null,
    };
    const ok = await sendJSON(`/api/assets/${editingId}`, "PUT", payload);
    if (ok) {
      alert("تم تحديث بيانات الأصل");
      await updateCharts();
    }
  });
}

/* ---------- Forms: توريد/تأهيل → قطع الغيار ---------- */
function wireSpares() {
  const form = document.getElementById("spareForm");
  const searchForm = document.getElementById("spareSearchForm");
  const updateBtn = document.getElementById("spareUpdateBtn");
  let editingId = null;

  // Create
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      part_category: form.spare_category?.value || "",
      part_name: form.spare_name?.value || null,
      part_model: form.spare_model?.value || null,
      quantity: parseIntSafe(form.spare_quantity?.value, 1),
      serial: form.spare_serial?.value || null,
      source: form.spare_source?.value || null,
      qualified_by: form.spare_qualified_by?.value || null,
      rehab_date: form.spare_rehab_date?.value,
      tested: form.spare_tested?.checked ?? null,
      notes: form.spare_notes?.value || null,
    };
    const ok = await sendJSON("/api/spares", "POST", payload);
    if (ok) {
      alert("تم حفظ بيانات قطع الغيار");
      form.reset();
      editingId = null;
      await updateCharts();
    }
  });

  // Find by serial (الرقم التسلسلي)
  searchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const serial = searchForm.spare_search_serial?.value || "";
    if (!serial) return alert("أدخل الرقم التسلسلي للبحث");
    const data = await fetchJSON(`/api/spares/find?serial=${encodeURIComponent(serial)}`);
    if (!data) return alert("لم يتم العثور");
    editingId = data.id;
    // fill
    form.spare_category && (form.spare_category.value = data.part_category || "");
    form.spare_name && (form.spare_name.value = data.part_name || "");
    form.spare_model && (form.spare_model.value = data.part_model || "");
    form.spare_quantity && (form.spare_quantity.value = data.quantity ?? 1);
    form.spare_serial && (form.spare_serial.value = data.serial || "");
    form.spare_source && (form.spare_source.value = data.source || "");
    form.spare_qualified_by && (form.spare_qualified_by.value = data.qualified_by || "");
    form.spare_rehab_date && (form.spare_rehab_date.value = data.rehab_date || "");
    if (form.spare_tested) form.spare_tested.checked = !!data.tested;
    form.spare_notes && (form.spare_notes.value = data.notes || "");
  });

  // Update
  updateBtn?.addEventListener("click", async () => {
    if (!editingId) return alert("ابحث عن سجل أولاً");
    const payload = {
      id: editingId,
      part_category: form.spare_category?.value || "",
      part_name: form.spare_name?.value || null,
      part_model: form.spare_model?.value || null,
      quantity: parseIntSafe(form.spare_quantity?.value, 1),
      serial: form.spare_serial?.value || null,
      source: form.spare_source?.value || null,
      qualified_by: form.spare_qualified_by?.value || null,
      rehab_date: form.spare_rehab_date?.value,
      tested: form.spare_tested?.checked ?? null,
      notes: form.spare_notes?.value || null,
    };
    const ok = await sendJSON(`/api/spares/${editingId}`, "PUT", payload);
    if (ok) {
      alert("تم تحديث بيانات قطعة الغيار");
      await updateCharts();
    }
  });
}

/* ---------- Wire buttons ---------- */
function wireButtons() {
  const refresh = document.getElementById("refreshChartsBtn") || document.getElementById("updateChartsBtn");
  refresh?.addEventListener("click", updateCharts);

  // Auto-update once on load
  updateCharts();

  wireExports();
  wireIssueForm();
  wireCabinets();
  wireAssets();
  wireSpares();
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", wireButtons);
