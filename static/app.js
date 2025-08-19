/* ===== Helpers ===== */
const $ = (sel) => document.querySelector(sel);
const nowYM = () => { const d=new Date(); return { y:d.getFullYear(), m:d.getMonth()+1 }; };
async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  const t = await res.text(); let j={};
  try{ j = t ? JSON.parse(t) : {}; }catch{ j = { raw:t }; }
  if(!res.ok) throw new Error((j && (j.detail||j.message)) || res.statusText);
  return j;
}
const COLORS = ['#2563eb','#f59e0b','#10b981','#ef4444','#a855f7','#06b6d4','#22c55e','#fb7185','#f97316','#14b8a6'];

/* ===== Panels show/hide ===== */
$('#tile-issue').onclick = () => { $('#panel-issue').classList.remove('hidden'); $('#panel-rehab').classList.add('hidden'); };
$('#tile-rehab').onclick = () => { $('#panel-rehab').classList.remove('hidden'); $('#panel-issue').classList.add('hidden'); };
$('#sub-cab').onclick = () => { $('#block-cab').classList.remove('hidden'); $('#block-ast').classList.add('hidden'); $('#block-spa').classList.add('hidden'); };
$('#sub-ast').onclick = () => { $('#block-ast').classList.remove('hidden'); $('#block-cab').classList.add('hidden'); $('#block-spa').classList.add('hidden'); };
$('#sub-spa').onclick = () => { $('#block-spa').classList.remove('hidden'); $('#block-cab').classList.add('hidden'); $('#block-ast').classList.add('hidden'); };

/* ===== Issue (صرف/طارئ) ===== */
$('#form-issue').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.quantity = Number(body.quantity || 1);
  await fetchJSON('/api/issue',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  e.target.reset(); refreshIssue(); alert('تم الحفظ');
});
$('#btn-issue-full').onclick    = ()=> window.location = '/api/export/issue/full.xlsx';
$('#btn-issue-summary').onclick = ()=> window.location = '/api/export/issue/summary.xlsx';

async function refreshIssue(){
  const arr = await fetchJSON('/api/issue');
  $('#list-issue').innerHTML = arr.map(r => `<div class="rowcard">${r.issue_date} — ${r.item_name} ×${r.quantity} (${r.receiver||''})</div>`).join('');
}
refreshIssue();

/* ===== Defaults for Y/M inputs ===== */
(function setDefaultYM(){
  const {y,m} = nowYM();
  ['cab','ast','spa'].forEach(p => { const yEl=$(`#${p}-year`), mEl=$(`#${p}-month`); if(yEl) yEl.value=y; if(mEl) mEl.value=m; });
  $('#chart-year').value = y; $('#chart-month').value = m;
})();

/* ===== Cabinets ===== */
$('#form-cab').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  await fetchJSON('/api/cabinets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  e.target.reset(); $('#cab-id').value=''; $('#cab-find-hint').textContent='';
  refreshCab(); alert('تم الحفظ');
});
$('#cab-find-btn').onclick = async ()=>{
  const code = $('#cab-find-code').value.trim(); if(!code) return alert('أدخل الترميز');
  try{
    const r = await fetchJSON('/api/cabinets/find?code='+encodeURIComponent(code));
    $('#cab-id').value=r.id;
    const f=$('#form-cab');
    f.cabinet_type.value=r.cabinet_type||''; f.code.value=r.code||''; f.rehab_date.value=r.rehab_date||'';
    f.qualified_by.value=r.qualified_by||''; f.location.value=r.location||''; f.receiver.value=r.receiver||'';
    f.issue_date.value=r.issue_date||''; f.notes.value=r.notes||'';
    $('#cab-find-hint').textContent='تم العثور — عدّل ثم اضغط "تحديث السجل"';
  }catch(err){ alert(err.message); }
};
$('#cab-clear-btn').onclick = ()=>{ $('#form-cab').reset(); $('#cab-id').value=''; $('#cab-find-hint').textContent=''; };
$('#btn-cab-update').onclick = async ()=>{
  const id = $('#cab-id').value; if(!id) return alert('ابحث أولًا');
  const body = Object.fromEntries(new FormData($('#form-cab')).entries());
  await fetchJSON('/api/cabinets/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  refreshCab(); alert('تم التحديث');
};
$('#btn-cab-export').onclick = ()=>{
  const y=Number($('#cab-year').value), m=Number($('#cab-month').value);
  window.location = `/api/export/cabinets.xlsx?year=${y}&month=${m}`;
};
async function refreshCab(){
  const arr = await fetchJSON('/api/cabinets');
  $('#list-cab').innerHTML = arr.map(r => `<div class="rowcard">${r.rehab_date} — ${r.cabinet_type} (${r.code||''})</div>`).join('');
}
refreshCab();

/* ===== Assets ===== */
$('#form-ast').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.quantity = Number(body.quantity || 1);
  body.lifted = body.lifted==='true'?true:(body.lifted==='false'?false:null);
  body.tested = body.tested==='true'?true:(body.tested==='false'?false:null);
  await fetchJSON('/api/assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  e.target.reset(); $('#ast-id').value=''; $('#ast-find-hint').textContent='';
  refreshAst(); alert('تم الحفظ');
});
$('#ast-find-btn').onclick = async ()=>{
  const key = $('#ast-find-serial').value.trim(); if(!key) return alert('أدخل الرقم');
  try{
    const r = await fetchJSON('/api/assets/find?serial='+encodeURIComponent(key));
    $('#ast-id').value=r.id;
    const f=$('#form-ast');
    f.asset_type.value=r.asset_type||''; f.model.value=r.model||''; f.serial_or_code.value=r.serial_or_code||'';
    f.quantity.value=r.quantity??1; f.prev_location.value=r.prev_location||''; f.supply_date.value=r.supply_date||'';
    f.qualified_by.value=r.qualified_by||''; f.lifted.value=r.lifted===true?'true':(r.lifted===false?'false':'');
    f.inspector.value=r.inspector||''; f.tested.value=r.tested===true?'true':(r.tested===false?'false':'');
    f.issue_date.value=r.issue_date||''; f.current_location.value=r.current_location||'';
    f.requester.value=r.requester||''; f.receiver.value=r.receiver||''; f.notes.value=r.notes||'';
    $('#ast-find-hint').textContent='تم العثور — عدّل ثم "تحديث السجل"';
  }catch(err){ alert(err.message); }
};
$('#ast-clear-btn').onclick = ()=>{ $('#form-ast').reset(); $('#ast-id').value=''; $('#ast-find-hint').textContent=''; };
$('#btn-ast-update').onclick = async ()=>{
  const id=$('#ast-id').value; if(!id) return alert('ابحث أولًا');
  const body = Object.fromEntries(new FormData($('#form-ast')).entries());
  await fetchJSON('/api/assets/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  refreshAst(); alert('تم التحديث');
};
$('#btn-ast-export').onclick = ()=>{
  const y=Number($('#ast-year').value), m=Number($('#ast-month').value);
  window.location = `/api/export/assets.xlsx?year=${y}&month=${m}`;
};
async function refreshAst(){
  const arr = await fetchJSON('/api/assets');
  $('#list-ast').innerHTML = arr.map(r => `<div class="rowcard">${r.supply_date} — ${r.asset_type} ×${r.quantity} ${r.serial_or_code?('['+r.serial_or_code+']'):''}</div>`).join('');
}
refreshAst();

/* ===== Spares ===== */
$('#form-spa').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.quantity = Number(body.quantity || 1);
  body.tested = body.tested==='true'?true:(body.tested==='false'?false:null);
  await fetchJSON('/api/spares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  e.target.reset(); $('#spa-id').value=''; $('#spa-find-hint').textContent='';
  refreshSpa(); alert('تم الحفظ');
});
$('#spa-find-btn').onclick = async ()=>{
  const key = $('#spa-find-serial').value.trim(); if(!key) return alert('أدخل الرقم');
  try{
    const r = await fetchJSON('/api/spares/find?serial='+encodeURIComponent(key));
    $('#spa-id').value=r.id;
    const f=$('#form-spa');
    f.part_category.value=r.part_category||''; f.part_name.value=r.part_name||''; f.part_model.value=r.part_model||'';
    f.quantity.value=r.quantity??1; f.serial.value=r.serial||''; f.source.value=r.source||'';
    f.qualified_by.value=r.qualified_by||''; f.rehab_date.value=r.rehab_date||'';
    f.tested.value=r.tested===true?'true':(r.tested===false?'false':''); f.notes.value=r.notes||'';
    $('#spa-find-hint').textContent='تم العثور — عدّل ثم "تحديث السجل"';
  }catch(err){ alert(err.message); }
};
$('#spa-clear-btn').onclick = ()=>{ $('#form-spa').reset(); $('#spa-id').value=''; $('#spa-find-hint').textContent=''; };
$('#btn-spa-update').onclick = async ()=>{
  const id=$('#spa-id').value; if(!id) return alert('ابحث أولًا');
  const body = Object.fromEntries(new FormData($('#form-spa')).entries());
  await fetchJSON('/api/spares/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  refreshSpa(); alert('تم التحديث');
};
$('#btn-spa-export').onclick = ()=>{
  const y=Number($('#spa-year').value), m=Number($('#spa-month').value);
  window.location = `/api/export/spares.xlsx?year=${y}&month=${m}`;
};
async function refreshSpa(){
  const arr = await fetchJSON('/api/spares');
  $('#list-spa').innerHTML = arr.map(r => `<div class="rowcard">${r.rehab_date} — ${r.part_category} ×${r.quantity}</div>`).join('');
}
refreshSpa();

/* ===== Duplicate check ===== */
$('#btn-dup').onclick = async ()=>{
  const j = await fetchJSON('/api/validate/duplicates');
  const msg = [
    'تكرارات محتملة:',
    `أكواد الكبائن: ${j.cabinets_codes.length ? j.cabinets_codes.join(', ') : 'لا يوجد'}`,
    `سيريالات الأصول: ${j.assets_serials.length ? j.assets_serials.join(', ') : 'لا يوجد'}`,
    `(سيريال × موقع) للأصول: ${j.assets_serial_loc_pairs.length ? j.assets_serial_loc_pairs.join(' | ') : 'لا يوجد'}`,
    `(سيريال × مصدر) للغيار: ${j.spares_serial_src_pairs.length ? j.spares_serial_src_pairs.join(' | ') : 'لا يوجد'}`
  ].join('\n');
  alert(msg);
};

/* ===== Charts ===== */

/* Hard reset canvas: destroy chart, replace node, lock size to wrapper */
function prepCanvas(canvasId){
  const old = document.getElementById(canvasId);
  const existed = Chart.getChart(old);
  if (existed) existed.destroy();
  const parent = old.parentElement;
  const fresh = old.cloneNode(false);               // same id, empty
  parent.replaceChild(fresh, old);
  fresh.width  = parent.clientWidth;
  fresh.height = parent.clientHeight || 340;
  return fresh.getContext('2d');
}

function clearNoData(canvasId){
  const wrap = document.getElementById(canvasId).parentElement;
  const n = wrap.querySelector('.nodata'); if(n) n.remove();
}
function showNoData(canvasId){
  const wrap = document.getElementById(canvasId).parentElement;
  let n = wrap.querySelector('.nodata');
  if(!n){ n = document.createElement('div'); n.className='nodata'; wrap.appendChild(n); }
  n.textContent = 'لا توجد بيانات لهذا الشهر';
}

function drawPie(canvasId, obj){
  const labels = Object.keys(obj), values = Object.values(obj);
  const sum = values.reduce((a,b)=>a+b,0);
  if(sum===0){ showNoData(canvasId); return; }
  clearNoData(canvasId);

  const ctx = prepCanvas(canvasId);
  new Chart(ctx, {
    type: 'pie',
    data: { labels, datasets: [{ label:'العدد', data: values, backgroundColor: labels.map((_,i)=>COLORS[i%COLORS.length]) }] },
    options: { responsive:false, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{ position:'right', labels:{ font:{weight:'700'} } } } }
  });
}

function drawBar(canvasId, obj){
  const labels = Object.keys(obj), values = Object.values(obj);
  const sum = values.reduce((a,b)=>a+b,0);
  if(sum===0){ showNoData(canvasId); return; }
  clearNoData(canvasId);

  const ctx = prepCanvas(canvasId);
  const maxVal = Math.max(1, ...values);
  const yMax  = Math.ceil(maxVal * 1.2);          // headroom
  const step  = Math.max(1, Math.ceil(yMax/5));   // nice ticks

  new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label:'العدد', data: values, backgroundColor: labels.map((_,i)=>COLORS[i%COLORS.length]) }] },
    options: { responsive:false, maintainAspectRatio:false, animation:false,
      plugins:{ legend:{ display:false } },
      scales:{ y:{ beginAtZero:true, max:yMax, ticks:{ precision:0, stepSize:step } } } }
  });
}

async function refreshCharts(){
  const y = Number($('#chart-year').value || nowYM().y);
  const m = Number($('#chart-month').value || nowYM().m);
  let data = await fetchJSON(`/api/stats/cabinets?year=${y}&month=${m}`); drawPie('viz-cab', data);
  data = await fetchJSON(`/api/stats/assets?year=${y}&month=${m}`);       drawBar('viz-ast', data);
  data = await fetchJSON(`/api/stats/spares?year=${y}&month=${m}`);       drawBar('viz-spa', data);
}
$('#btn-refresh-charts').onclick = refreshCharts;
refreshCharts();

/* ===== Monthly / Quarterly exports ===== */
$('#btn-monthly').onclick = ()=>{
  const y = Number($('#sum-year').value || nowYM().y);
  const m = Number($('#sum-month').value || nowYM().m);
  window.location = `/api/export/monthly_summary.xlsx?year=${y}&month=${m}`;
};
$('#btn-quarterly').onclick = ()=>{
  const y = Number($('#q-year').value || nowYM().y);
  const m = Number($('#q-month').value || nowYM().m);
  window.location = `/api/export/quarterly_summary.xlsx?start_year=${y}&start_month=${m}`;
};
