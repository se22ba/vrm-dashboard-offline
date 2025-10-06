// ===== util =====
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const esc = (s)=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt = (n)=>Number(n||0).toLocaleString('es-AR');
const sum = (arr)=>arr.reduce((a,b)=>a+Number(b||0),0);
const pct = (a,b)=> b>0 ? (100*a/b) : 0;

// ===== estado =====
const state = {
  endpoints: [],
  cams: [],
  overview: null,
  overviewFinal: null,
  derivedOverview: null,
  perVrmCounters: {},
  camSearch: '',
  camFilter: 'all',
  camsSortMulti: [{key:'cameraName',dir:'asc'}],
  autoTimer: null,
  targets: null
};

// ===== presets (de fábrica) =====
const FACTORY_PRESETS = [
  { bvms:'BVMS1', vrm:'VRM1', ip:'172.25.0.15' },
  { bvms:'BVMS1', vrm:'VRM2', ip:'172.25.0.18' },
  { bvms:'BVMS2', vrm:'VRM1', ip:'172.25.20.3' },
  { bvms:'BVMS2', vrm:'VRM2', ip:'172.25.20.4' },
  { bvms:'BVMS2', vrm:'VRM3', ip:'172.25.20.5' },
];

// ===== Chart defaults + donut center label =====
if (window.Chart) {
  Chart.defaults.font.family = 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.font.size   = 18;
  Chart.defaults.color       = '#ffffff';

  const CenterText = {
    id:'centerText',
    beforeDraw(chart, args, opts){
      if (!opts?.text) return;
      const {ctx, chartArea:{width,height}} = chart;
      ctx.save();
      ctx.fillStyle = opts.color || '#fff';
      ctx.font = (opts.font || '700 24px Inter');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.text, width/2, height/2);
      ctx.restore();
    }
  };
  Chart.register(CenterText);
}

// ===== tabs =====
(function setupTopTabs(){
  const nav = $('#tabs-top'); if (!nav) return;
  nav.addEventListener('click', ev => {
    const btn = ev.target.closest('.tab'); if (!btn) return;
    $$('#tabs-top .tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.tabpage').forEach(p=>p.classList.remove('active'));
    $('#'+btn.dataset.tab)?.classList.add('active');
  });
})();

// ===== endpoints + storage =====
function loadEndpoints(){ try{
  state.endpoints = JSON.parse(localStorage.getItem('endpoints')||'null') || FACTORY_PRESETS.slice();
} catch { state.endpoints = FACTORY_PRESETS.slice(); } }
function saveEndpoints(){ localStorage.setItem('endpoints', JSON.stringify(state.endpoints)); }
function loadCreds(){
  const remember = localStorage.getItem('rememberCreds')==='1';
  $('#remember-creds').checked = remember;
  if (remember){
    const u = localStorage.getItem('credUser') || 'srvadmin';
    const p = localStorage.getItem('credPass') || 'DFDgsfe01!';
    $('#in-user').value=u; $('#in-pass').value=p;
  }
}
$('#remember-creds')?.addEventListener('change', e=>{
  localStorage.setItem('rememberCreds', e.target.checked ? '1':'0');
  if (!e.target.checked){ localStorage.removeItem('credUser'); localStorage.removeItem('credPass'); }
});
function maybeSaveCreds(){
  if ($('#remember-creds').checked){
    localStorage.setItem('credUser',$('#in-user').value||'');
    localStorage.setItem('credPass',$('#in-pass').value||'');
  }
}

// ===== build selectors + chips =====
function buildSelectors(){
  const bvmsSel = $('#sel-bvms'), vrmSel = $('#sel-vrm'), ipIn = $('#in-ip');
  if (!bvmsSel || !vrmSel || !ipIn) return;

  const bvmsList = [...new Set(FACTORY_PRESETS.map(x=>x.bvms))];
  bvmsSel.innerHTML = bvmsList.map(b=>`<option>${b}</option>`).join('');

  const fillVrms = ()=>{
    const bv = bvmsSel.value;
    const vrms = FACTORY_PRESETS.filter(x=>x.bvms===bv).map(x=>x.vrm);
    vrmSel.innerHTML = [...new Set(vrms)].map(v=>`<option>${v}</option>`).join('');
    updateIp();
  };
  const updateIp = ()=>{
    const match = FACTORY_PRESETS.find(x=>x.bvms===bvmsSel.value && x.vrm===vrmSel.value);
    ipIn.value = match?.ip || '';
  };
  bvmsSel.onchange = fillVrms;
  vrmSel.onchange  = updateIp;
  fillVrms(); // inicial
}

function renderChips(){
  const host = $('#chips-list'); if (!host) return;
  host.innerHTML = '';
  if (!state.endpoints.length){
    host.innerHTML = `<span class="chip" style="opacity:.7">Sin endpoints seleccionados</span>`;
    return;
  }
  state.endpoints.forEach((e,idx)=>{
    const chip = document.createElement('div'); chip.className='chip';
    chip.innerHTML = `<span>${esc(e.bvms)} · ${esc(e.vrm)} · ${esc(e.ip)}</span><button class="rm" title="Quitar">✕</button>`;
    chip.querySelector('.rm').onclick = ()=>{ state.endpoints.splice(idx,1); saveEndpoints(); renderChips(); };
    host.appendChild(chip);
  });
}
$('#btn-add-endpoint')?.addEventListener('click', ()=>{
  const bvms = $('#sel-bvms')?.value, vrm = $('#sel-vrm')?.value, ip = $('#in-ip')?.value?.trim();
  if (!bvms || !vrm || !ip) return;
  if (!state.endpoints.some(e=>e.bvms===bvms && e.vrm===vrm && e.ip===ip)){
    state.endpoints.push({bvms,vrm,ip}); saveEndpoints(); renderChips();
  }
});
$('#btn-reset-endpoints')?.addEventListener('click', ()=>{
  state.endpoints = FACTORY_PRESETS.slice(); saveEndpoints(); renderChips();
});

// ===== badge adjuntos =====
function refreshAttachBadge(){
  const files = [$('#f-index'),$('#f-cams'),$('#f-devs'),$('#f-targets')];
  const cnt = files.filter(i=>i?.files?.length).length;
  $('#attach-badge').textContent = `${cnt}/4`;
}
['#f-index','#f-cams','#f-devs','#f-targets'].forEach(id=>{
  $(id)?.addEventListener('change', refreshAttachBadge);
});
refreshAttachBadge();

// ===== parse uploads =====
$('#btn-parse')?.addEventListener('click', async () => {
  const form = new FormData();
  const idx = $('#f-index')?.files?.[0]; if (idx) form.append('index_mhtml', idx, idx.name);
  const cams = $('#f-cams')?.files?.[0];  if (cams) form.append('showCameras', cams, cams.name);
  const devs = $('#f-devs')?.files?.[0];  if (devs) form.append('showDevices', devs, devs.name);
  const tgs  = $('#f-targets')?.files?.[0];if (tgs) form.append('showTargets', tgs, tgs.name);

  const res = await fetch('/api/parse-uploads', { method:'POST', body:form });
  if (!res.ok) { console.error('parse fail', await res.text()); alert('Parse falló'); return; }
  const j = await res.json();
  applyPayload(j);
  $('#tabs-top .tab[data-tab="overview"]')?.click();
});

// ===== scan endpoints =====
$('#btn-scan')?.addEventListener('click', doScan);
async function doScan(){
  if (!state.endpoints.length){ alert('Agregá al menos un endpoint.'); return; }
  maybeSaveCreds();
  const user = $('#in-user')?.value ?? '';
  const pass = $('#in-pass')?.value ?? '';

  const aggregate = {
    overview:{ perVrm:{} },
    overviewFinal:{ totals:{ totalChannels:0, offlineChannels:0, activeRecordings:0, idle:0, signalLoss:0 }, perVrm:{} },
    derivedOverview:null,
    perVrmCounters:{},
    cameras:[],
    targets:{ targetsSummary:{}, lunsSummary:{}, blocksSummary:{}, details:[] }
  };

  for (const ep of state.endpoints){
    try{
      const res = await fetch('/api/scrape',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ bvms:ep.bvms, vrm:ep.vrm, ip:ep.ip, user, pass })
      });
      if (!res.ok){ console.warn('scan fail', ep, await res.text()); continue; }
      const j = await res.json();
      mergePayload(aggregate, j);
    }catch(e){ console.error('scan error', ep, e); }
  }
  applyPayload(aggregate);
}
function mergePayload(dst, j){
  const t = j.overviewFinal?.totals || {};
  dst.overviewFinal.totals.totalChannels    += Number(t.totalChannels||0);
  dst.overviewFinal.totals.offlineChannels  += Number(t.offlineChannels||0);
  dst.overviewFinal.totals.activeRecordings += Number(t.activeRecordings||0);
  dst.overviewFinal.totals.idle             += Number(t.idle||0);
  dst.overviewFinal.totals.signalLoss       += Number(t.signalLoss||0);
  Object.assign(dst.overview.perVrm, j.overview?.perVrm || {});
  Object.assign(dst.overviewFinal.perVrm, j.overviewFinal?.perVrm || {});
  for (const [k,v] of Object.entries(j.perVrmCounters||{})){
    const target = dst.perVrmCounters[k] ||= { bvmsIssues:0, offline:0, total:0 };
    target.bvmsIssues += Number(v.bvmsIssues||0);
    target.offline    += Number(v.offline||0);
    target.total      += Number(v.total||0);
  }
  dst.cameras.push(...(j.cameras||[]));
  const addObj = (to,from)=>{ for (const [k,val] of Object.entries(from||{})){ to[k]=(Number(to[k]||0)+Number(val||0)); } };
  addObj(dst.targets.targetsSummary, j.targets?.targetsSummary);
  addObj(dst.targets.lunsSummary,    j.targets?.lunsSummary);
  addObj(dst.targets.blocksSummary,  j.targets?.blocksSummary);
  dst.targets.details.push(...(j.targets?.details||[]));
}
function applyPayload(j){
  state.overview        = j.overview || null;
  state.overviewFinal   = j.overviewFinal || { totals:{ totalChannels:0, offlineChannels:0, activeRecordings:0 } };
  state.derivedOverview = j.derivedOverview || null;
  state.cams            = j.cameras || [];
  state.perVrmCounters  = j.perVrmCounters || {};
  state.targets         = j.targets || null;

  renderOverview();
  buildCameraTabs(); renderCams();
  buildVrmTabs();    renderTargets(); renderVrmCompare();

  persistCamHistory(state.cams);
}

// ===== OVERVIEW donut =====
let overviewChart=null;
function renderOverview(){
  const t = state.overviewFinal?.totals || {};

  const totalChannels   = Number(t.totalChannels   || 0);
  const activeRecordings= Number(t.activeRecordings|| 0);
  const idle            = Number(t.idle            || 0);
  const offlineChannels = Number(t.offlineChannels || 0);
  const signalLoss      = Number(t.signalLoss      || 0);
  
  // ---- Cards (IDs reales del HTML) ----
  $('#ov-total-channels').textContent = fmt(totalChannels);
  $('#ov-offline').textContent       = fmt(idle);
  $('#ov-active').textContent        = fmt(activeRecordings);
  const bvmsIssues = Math.max(idle - offlineChannels - signalLoss, 0);
  $('#ov-bvms').textContent = fmt(bvmsIssues);
  const nonBvmsIssues = offlineChannels + signalLoss;
  $('#ov-problems').textContent = fmt(nonBvmsIssues);
  const lbl = $('#ov-problems-label');
  if (lbl) lbl.textContent = 'Problemas no BVMS';

  // ---- Donut (3 segmentos) ----
  const total      = totalChannels;
  const data       = [activeRecordings, bvmsIssues, nonBvmsIssues];
  const labels     = ['Grabaciones activas','Problemas BVMS','Problemas no BVMS'];
  const colors     = ['#2ea043', '#f0883e', '#f85149'];

  const ctx = $('#chart-overview');
  if (overviewChart) overviewChart.destroy();
  overviewChart = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor: colors, borderWidth:0 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'54%',
      layout:{ padding:{ top:12, bottom:16, left:12, right:12 } },
      plugins:{
        centerText:{ text:`Total: ${fmt(total)}`, font:'800 26px Inter', color:'#fff' },
        legend:{
          position:'bottom',
          labels:{
            color:'#ffffff', font:{ size:19, weight:'800' }, padding:22, boxWidth:20, boxHeight:12,
            generateLabels(chart){
              const defGen = Chart.defaults.plugins.legend.labels.generateLabels;
              const items  = defGen(chart);
              const ds = chart.data.datasets[0] || { data:[] };
              const tot = total || ((ds.data||[]).reduce((a,b)=>a+Number(b||0),0) || 1);
              return items.map((it,i)=>{
                const v = Number((ds.data||[])[i]||0);
                it.text = `${chart.data.labels[i]} (${pct(v,tot).toFixed(1)}%)`;
                return it;
              });
            }
          }
        },
        tooltip:{
          titleColor:'#fff', bodyColor:'#fff',
          titleFont:{ size:18, weight:'800' }, bodyFont:{ size:18 },
          callbacks:{ label:(ctx)=>{
            const v=ctx.parsed; const tot=total||data.reduce((a,b)=>a+b,0);
            return `${ctx.label}: ${fmt(v)} (${pct(v,tot).toFixed(1)}%)`;
          } }
        }
      }
    }
  });
}

// ===== VRMs: subtabs + charts =====
function buildVrmTabs(){
  const sub = $('#vrms-subtabs'); if (!sub) return;
  sub.innerHTML = '';
  const keys = Object.keys(state.overview?.perVrm || {}).sort();
  if (!keys.length) { sub.style.display='none'; return; }
  sub.style.display='flex';
  keys.forEach((k,i)=>{
    const b = document.createElement('button');
    b.className='tab'+(i===0?' active':''); b.textContent=k;
    b.onclick = ()=>{ [...sub.querySelectorAll('.tab')].forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderTargets(); };
    sub.appendChild(b);
  });
}

function drawBar(id, labels, data){
  const el = document.getElementById(id); if (!el) return;
  if (el._chart) el._chart.destroy();
  el._chart = new Chart(el, {
    type:'bar',
    data:{ labels, datasets:[{ data, label:'Valor', backgroundColor:'#2f81f7' }] },
    options:{
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${fmt(ctx.parsed.y??ctx.parsed)}` } } },
      scales:{ x:{ ticks:{color:'#c9d1d9'} }, y:{ ticks:{color:'#c9d1d9'} } }
    }
  });
}
function renderTargets(){
  const s = state.targets || {};
  drawBar('chart-targets',
    ['Total number of targets','Usable capacity targets [GiB]','Offline Targets'],
    [s.targetsSummary?.['Total number of targets']||0, s.targetsSummary?.['Usable capacity targets [GiB]']||0, s.targetsSummary?.['Offline Targets']||0]
  );
  drawBar('chart-luns',
    ['Total number of LUNs','Read-only LUNs','Offline LUNs'],
    [s.lunsSummary?.['Total number of LUNs']||0, s.lunsSummary?.['Read-only LUNs']||0, s.lunsSummary?.['Offline LUNs']||0]
  );
  drawBar('chart-blocks',
    ['Total number of blocks','Total GiB','Empty blocks [GiB]','Available blocks [GiB]','Protected blocks [GiB]'],
    [s.blocksSummary?.['Total number of blocks']||0, s.blocksSummary?.['Total GiB']||0, s.blocksSummary?.['Empty blocks [GiB]']||0, s.blocksSummary?.['Available blocks [GiB]']||0, s.blocksSummary?.['Protected blocks [GiB]']||0]
  );
}

// Comparativo VRM (activos / offline / sin grabar)
let vrmCompareChart=null;
function renderVrmCompare(){
  const per = state.overviewFinal?.perVrm || {};
  const labels = Object.keys(per).sort();
  if (!labels.length){ if (vrmCompareChart){vrmCompareChart.destroy(); vrmCompareChart=null;} return; }

  const total = labels.map(k=>Number(per[k]?.totalChannels||0));
  const active= labels.map(k=>Number(per[k]?.activeRecordings||0));
  const offline=labels.map(k=>Number(per[k]?.offlineChannels||0));
  const nograb = labels.map((_,i)=>Math.max(0,total[i]-active[i]));

  const el = $('#chart-vrm-compare'); if (!el) return;
  if (vrmCompareChart) vrmCompareChart.destroy();
  vrmCompareChart = new Chart(el, {
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Activas',     data:active, backgroundColor:'#2ea043' },
        { label:'Offline',     data:offline, backgroundColor:'#f85149' },
        { label:'Sin grabar',  data:nograb, backgroundColor:'#e3b341' },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        tooltip:{ callbacks:{ label:(ctx)=>{
          const idx=ctx.dataIndex, v=ctx.parsed.y, tot=total[idx];
          return `${ctx.dataset.label}: ${fmt(v)} (${pct(v,tot).toFixed(1)}%)`;
        }}},
        legend:{ labels:{ color:'#fff' } }
      },
      scales:{ x:{ ticks:{color:'#c9d1d9'} }, y:{ ticks:{color:'#c9d1d9'} }, }
    }
  });

  // deltas vs. último snapshot
  const key='vrmTotalsPrev';
  try{
    const prev = JSON.parse(localStorage.getItem(key)||'null');
    if (prev){
      // reservado para futuros deltas
    }
    localStorage.setItem(key, JSON.stringify({ labels, total, active, offline, nograb, ts:Date.now() }));
  }catch{}
}

// ===== buscador + filtros =====
$('#cam-search')?.addEventListener('input', e=>{ state.camSearch = e.target.value.toLowerCase(); renderCams(currentVrmFilter()); });
$('#cam-filters')?.addEventListener('click', e=>{
  const btn = e.target.closest('.filter'); if (!btn) return;
  $$('#cam-filters .filter').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); state.camFilter = btn.dataset.state; renderCams(currentVrmFilter());
});
function currentVrmFilter(){
  const t = $('#cams-subtabs .tab.active')?.textContent;
  return (t && t!=='Todas') ? t : null;
}

function rowMatches(r){
  const s = state.camSearch;
  if (s){
    const blob = `${r.cameraName} ${r.address} ${r.recordingState} ${r.fwVersion}`.toLowerCase();
    if (!blob.includes(s)) return false;
  }
  const f = state.camFilter;
  if (f && f!=='all'){
    const st = (r.recordingState||'').toLowerCase();
    if (f==='Recording' && !st.startsWith('recording')) return false;
    if (f==='Pending'   && !st.startsWith('pending'))   return false;
    if (f==='Disabled'  && !st.startsWith('recording disabled')) return false;
    if (f==='Offline'   && !st.includes('offline')) return false;
  }
  return true;
}

// drill-down modal
const modal = $('#modal'); $('#md-close')?.addEventListener('click', ()=>modal.classList.remove('open'));
modal?.addEventListener('click', e=>{ if (e.target===modal) modal.classList.remove('open'); });

function renderCams(filterVrmKey){
  const tbody = $('#tbl-cams tbody'); if (!tbody) return;
  let rows = (state.cams||[]).filter(r => (!filterVrmKey || r.primaryTarget===filterVrmKey) && rowMatches(r));

  // multi-sort
  rows = rows.slice().sort((a,b)=>{
    for (const {key,dir} of state.camsSortMulti){
      const av=(a?.[key]??'').toString().toLowerCase();
      const bv=(b?.[key]??'').toString().toLowerCase();
      if (av===bv) continue;
      const r = av<bv ? -1 : 1;
      return dir==='desc' ? -r : r;
    }
    return 0;
  });

  tbody.innerHTML = '';
  for (const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.cameraName)}</td>
      <td>${esc(r.address)}</td>
      <td>${esc(r.fwVersion)}</td>
      <td>${esc(r.recordingState)}</td>
      <td>${esc(r.maxBitrate)}</td>
      <td>${esc(r.connectionTime)}</td>`;
    tr.onclick = ()=> openDrillDown(r);
    tbody.appendChild(tr);
  }

  // sort headers
  $$('#tbl-cams thead th.sortable').forEach(th=>{
    th.onclick = (ev)=>{
      const key = th.dataset.key;
      const withShift = ev.shiftKey;
      if (!withShift){
        state.camsSortMulti = [{key,dir:'asc'}];
      } else {
        const i = state.camsSortMulti.findIndex(s=>s.key===key);
        if (i>=0){ state.camsSortMulti[i].dir = state.camsSortMulti[i].dir==='asc'?'desc':'asc'; }
        else state.camsSortMulti.push({key,dir:'asc'});
      }
      $$('#tbl-cams thead th').forEach(x=>x.classList.remove('th-asc','th-desc'));
      const thNow = Array.from($$('#tbl-cams thead th')).find(x=>x.dataset.key===key);
      if (thNow) thNow.classList.add('th-asc');
      renderCams(filterVrmKey);
    };
  });
}

// histórico local corto
function persistCamHistory(rows){
  const key='camHistory';
  let hist={}; try{ hist=JSON.parse(localStorage.getItem(key)||'{}'); }catch{}
  rows.forEach(r=>{
    const id = r.address||r.cameraName;
    const arr = hist[id] ||= [];
    arr.unshift({ ts:Date.now(), recordingState:r.recordingState, maxBitrate:r.maxBitrate, connectionTime:r.connectionTime });
    hist[id] = arr.slice(0,20);
  });
  localStorage.setItem(key, JSON.stringify(hist));
}
function readCamHistory(id){
  try{ const h=JSON.parse(localStorage.getItem('camHistory')||'{}'); return h[id]||[]; }catch{ return []; }
}
function openDrillDown(r){
  $('#md-title').textContent = r.cameraName || r.address || 'Detalle';
  const hist = readCamHistory(r.address||r.cameraName);
  const last = hist[1]; // estado anterior
  const body = $('#md-body');
  body.innerHTML = `
    <div class="grid">
      <div><b>Address</b><br>${esc(r.address||'')}</div>
      <div><b>FW</b><br>${esc(r.fwVersion||'')}</div>
      <div><b>Recording state</b><br>${esc(r.recordingState||'')}</div>
      <div><b>Max bitrate</b><br>${esc(r.maxBitrate||'')}</div>
      <div><b>Connection time</b><br>${esc(r.connectionTime||'')}</div>
      <div><b>Target</b><br>${esc(r.primaryTarget||'')}</div>
      <div><b>Anterior</b><br>${last?esc(last.recordingState):'—'}</div>
      <div><b>Δ Connection time</b><br>${last?(Number(r.connectionTime||0)-Number(last.connectionTime||0)):'—'}</div>
    </div>
    <div style="margin-top:12px;color:#8b949e">Histórico (local, últimas ${hist.length} lecturas): ${hist.map(h=>h.recordingState).join(' → ')}</div>
  `;
  modal.classList.add('open');
}

// export con filtros aplicados
$('#btn-export')?.addEventListener('click', ()=>{
  const vrmKey = currentVrmFilter();
  const rows = (state.cams||[]).filter(r => (!vrmKey || r.primaryTarget===vrmKey) && rowMatches(r))
                               .sort((a,b)=>{
                                 for (const {key,dir} of state.camsSortMulti){
                                   const av=(a?.[key]??'').toString().toLowerCase();
                                   const bv=(b?.[key]??'').toString().toLowerCase();
                                   if (av===bv) continue;
                                   const r = av<bv ? -1 : 1;
                                   return dir==='desc' ? -r : r;
                                 }
                                 return 0;
                               });
  const csvRows = [
    ['CameraName','Address','FW version','Recording state','Max bitrate','Connection time'],
    ...rows.map(r=>[r.cameraName,r.address,r.fwVersion,r.recordingState,r.maxBitrate,r.connectionTime])
  ];
  const csv = csvRows.map(r=>r.map(x=>`"${String(x??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'}), url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), {href:url, download: vrmKey?`camaras_${vrmKey}.csv`:'camaras.csv'});
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
});

// ===== init =====
loadEndpoints(); loadCreds(); buildSelectors(); renderChips();