// ===== util =====
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const esc = (s)=>String(s??'').replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
const fmt = (n)=>Number(n||0).toLocaleString('es-AR');
const sum = (arr)=>arr.reduce((a,b)=>a+Number(b||0),0);
const pct = (a,b)=> b>0 ? (100*a/b) : 0;

function createEmptyTargetsSummary(){
  return { targetsSummary:{}, lunsSummary:{}, blocksSummary:{}, details:[] };
}

function cloneTargetsSummary(data={}){
  const cloned = {
    targetsSummary:{ ...(data.targetsSummary||{}) },
    lunsSummary:{ ...(data.lunsSummary||{}) },
    blocksSummary:{ ...(data.blocksSummary||{}) },
    details: Array.isArray(data.details) ? data.details.slice() : []
  };
  if (data.meta) cloned.meta = { ...(data.meta||{}) };
  return cloned;
}

function createTargetsState(){
  return { totals:createEmptyTargetsSummary(), byVrm:{} };
}

function normalizeTargetsData(payload){
  if (!payload) return createTargetsState();
  const hasNewShape = payload.totals || payload.byVrm;
  if (hasNewShape){
    const totals = cloneTargetsSummary(payload.totals || {});
    const byVrm = {};
    for (const [key,val] of Object.entries(payload.byVrm || {})){
      byVrm[key] = cloneTargetsSummary(val || {});
    }
    return { totals, byVrm };
  }
  return { totals: cloneTargetsSummary(payload), byVrm:{} };
}

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
  targets: createTargetsState()
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
    targets: createTargetsState()
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
  const incomingTargets = normalizeTargetsData(j.targets);
  addObj(dst.targets.totals.targetsSummary, incomingTargets.totals.targetsSummary);
  addObj(dst.targets.totals.lunsSummary,    incomingTargets.totals.lunsSummary);
  addObj(dst.targets.totals.blocksSummary,  incomingTargets.totals.blocksSummary);
  dst.targets.totals.details.push(...(incomingTargets.totals.details||[]));
  for (const [key,data] of Object.entries(incomingTargets.byVrm||{})){
    const bucket = dst.targets.byVrm[key] ||= createEmptyTargetsSummary();
    addObj(bucket.targetsSummary, data.targetsSummary);
    addObj(bucket.lunsSummary,    data.lunsSummary);
    addObj(bucket.blocksSummary,  data.blocksSummary);
    bucket.details.push(...(data.details||[]));
    if (data.meta && !bucket.meta) bucket.meta = { ...(data.meta||{}) };
  }
}
function applyPayload(j){
  state.overview        = j.overview || null;
  state.overviewFinal   = j.overviewFinal || { totals:{ totalChannels:0, offlineChannels:0, activeRecordings:0 } };
  state.derivedOverview = j.derivedOverview || null;
  state.cams            = j.cameras || [];
  state.perVrmCounters  = j.perVrmCounters || {};
  state.targets         = normalizeTargetsData(j.targets);

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
// ===== CÁMARAS: subtabs + hint =====
function cameraCountersTotals(vrmKey){
  const counters = state.perVrmCounters || {};
  const totals = { total:0, offline:0, bvmsIssues:0 };
  const entries = vrmKey ? [[vrmKey, counters[vrmKey] || {}]] : Object.entries(counters);
  if (entries.length){
    for (const [,data] of entries){
      totals.total      += Number(data?.total || 0);
      totals.offline    += Number(data?.offline || 0);
      totals.bvmsIssues += Number(data?.bvmsIssues || 0);
    }
    return totals;
  }

  const cams = state.cams || [];
  const filtered = vrmKey ? cams.filter(c=>c.primaryTarget===vrmKey) : cams;
  totals.total = filtered.length;
  totals.offline = filtered.filter(c=>String(c.recordingState||'').toLowerCase().includes('offline')).length;
  return totals;
}

function updateCamsHint(vrmKey){
  const hint = $('#camaras .hint'); if (!hint) return;
  const hasData = (state.cams?.length || 0) > 0 || Object.keys(state.perVrmCounters||{}).length > 0;
  if (!hasData){
    hint.textContent = '';
    hint.style.display = 'none';
    return;
  }
  hint.style.display = '';
  const key = vrmKey || null;
  const totals = cameraCountersTotals(key);
  const activeLabelRaw = $('#cams-subtabs .tab.active')?.textContent || '';
  const baseLabel = activeLabelRaw.split(' (')[0].trim();
  const scopeLabel = key ? (baseLabel || key) : 'general';
  const prefix = key ? `Resumen ${scopeLabel}` : 'Resumen general';
  hint.textContent = `${prefix}: ${fmt(totals.total)} cámaras · ${fmt(totals.offline)} offline · ${fmt(totals.bvmsIssues)} problemas BVMS`;
}

function buildCameraTabs(){
  const host = $('#cams-subtabs'); if (!host) return;
  const prevActive = host.querySelector('.tab.active')?.dataset.vrm || '';
  const counters = state.perVrmCounters || {};
  const vrmSet = new Set();
  (state.cams||[]).forEach(cam=>{ if (cam?.primaryTarget) vrmSet.add(cam.primaryTarget); });
  Object.keys(counters).forEach(k=>{ if (k) vrmSet.add(k); });
  const keys = [...vrmSet].sort((a,b)=>a.localeCompare(b,'es',{ numeric:true, sensitivity:'base' }));

  host.innerHTML = '';
  if (!keys.length){
    host.style.display = 'none';
    updateCamsHint(null);
    return;
  }
  host.style.display = 'flex';

  const buttons = [];
  const addButton = (label, vrmValue)=>{
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.vrm = vrmValue || '';
    btn.textContent = label;
    btn.onclick = ()=>{
      [...host.querySelectorAll('.tab')].forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.dataset.vrm || null;
      updateCamsHint(key);
      renderCams(key);
    };
    host.appendChild(btn);
    buttons.push(btn);
    return btn;
  };

  const totalsAll = cameraCountersTotals(null);
  const allBtn = addButton(`Todas (${fmt(totalsAll.total)})`, '');
  keys.forEach(key=>{
    const totals = cameraCountersTotals(key);
    addButton(`${key} (${fmt(totals.total)})`, key);
  });

  const activeKey = keys.includes(prevActive) ? prevActive : '';
  let activeBtn = buttons.find(b=>b.dataset.vrm === (activeKey || '')) || allBtn;
  activeBtn.classList.add('active');
  updateCamsHint(activeBtn.dataset.vrm || null);
}

// ===== VRMs: subtabs + charts =====
function buildVrmTabs(){
  const sub = $('#vrms-subtabs'); if (!sub) return;
  const prevActive = sub.querySelector('.tab.active')?.dataset.vrm || null;
  sub.innerHTML = '';
  const keys = Object.keys(state.targets?.byVrm || {}).sort();
  if (keys.length <= 1) { sub.style.display='none'; return; }
  sub.style.display='flex';
  keys.forEach((k,i)=>{
    const data = state.targets.byVrm[k] || {};
    const label = data.meta?.label || k;
    const b = document.createElement('button');
    b.className='tab';
    b.dataset.vrm = k;
    b.textContent = label;
    if ((prevActive && prevActive===k) || (!prevActive && i===0)) b.classList.add('active');
    b.onclick = ()=>{ [...sub.querySelectorAll('.tab')].forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderTargets(); };
    sub.appendChild(b);
  });
  if (!sub.querySelector('.tab.active') && sub.firstChild){ sub.firstChild.classList.add('active'); }
}


 function renderTargets(){
  const host = $('#vrm-cards'); if (!host) return;
  host.innerHTML = '';
  const per = state.targets?.byVrm || {};
  const keys = Object.keys(per).sort();
  if (!keys.length){
    host.innerHTML = '<div class="vrm-empty">Sin información de almacenamiento.</div>';
    return;
  }
  const activeKey = $('#vrms-subtabs .tab.active')?.dataset.vrm || null;
  const offlineLabels = new Set(['Offline Targets','Offline LUNs']);
  keys.forEach(key=>{
    const data = per[key] || {};
    const card = document.createElement('article');
    card.className = 'vrm-card';
    if (activeKey && activeKey === key) card.classList.add('active');
    const title = data.meta?.vrm || data.meta?.label || key;
    const subtitleParts = [];
    if (data.meta?.bvms) subtitleParts.push(data.meta.bvms);
    if (data.meta?.ip) subtitleParts.push(data.meta.ip);
    const subtitle = subtitleParts.join(' • ');
    const metrics = [
      ['Total number of targets', data.targetsSummary?.['Total number of targets']],
      ['Usable capacity Targets (GiB)', data.targetsSummary?.['Usable capacity targets [GiB]']],
      ['Offline Targets', data.targetsSummary?.['Offline Targets']],
      ['Total number of LUNs', data.lunsSummary?.['Total number of LUNs']],
      ['Offline LUNs', data.lunsSummary?.['Offline LUNs']],
      ['Total number of Blocks', data.blocksSummary?.['Total number of blocks']],
      ['Total GiB', data.blocksSummary?.['Total GiB']],
      ['Empty blocks (GiB)', data.blocksSummary?.['Empty blocks [GiB]']],
      ['Available blocks (GiB)', data.blocksSummary?.['Available blocks [GiB]']],
      ['Protected blocks (GiB)', data.blocksSummary?.['Protected blocks [GiB]']]
    ];
    const metricsHtml = metrics.map(([label,value])=>{
      const num = Number(value ?? 0);
      const formatted = Number.isFinite(num) ? fmt(num) : '—';
      const warnClass = offlineLabels.has(label) && num > 0 ? ' warn' : '';
      return `<div class="vrm-metric${warnClass}"><span>${esc(label)}</span><strong>${formatted}</strong></div>`;
    }).join('');
    card.innerHTML = `
      <header>
        <h3>${esc(title)}</h3>
        ${subtitle ? `<span class="vrm-subtitle">${esc(subtitle)}</span>` : ''}
      </header>
      <div class="vrm-metrics">${metricsHtml}</div>
    `;
    host.appendChild(card);
  });
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
  const tab = $('#cams-subtabs .tab.active');
  const val = tab?.dataset.vrm || '';
  return val ? val : null;
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
  if (typeof filterVrmKey === 'undefined') filterVrmKey = currentVrmFilter();
  if (!filterVrmKey) filterVrmKey = null;
  updateCamsHint(filterVrmKey);
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