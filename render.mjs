// render.mjs — turns aggregated ad-performance data into an HTML dashboard.
// Used both by build-dashboard.mjs (live refresh from GHL) and to render the
// committed snapshot. Exports renderBody() (inner markup, for embedding) and
// renderDoc() (a full standalone HTML document you can open in a browser).

export function renderBody(data) {
  const json = JSON.stringify(data);
  return `<style>
  .adx {
    color-scheme: light;
    --surface-0: #f4f4f2;
    --surface-1: #fcfcfb;
    --surface-2: #f0efec;
    --border:    #e2e1dc;
    --text-primary:   #0b0b0b;
    --text-secondary: #52514e;
    --text-muted:     #8a897f;
    --series-winning: #2a78d6;
    --series-test:    #eb6834;
    --series-ai:      #1baf7a;
    --series-other:   #8a897f;
    --good: #008300;
    --track: #e6e5e0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary);
    background: var(--surface-0);
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .adx {
      color-scheme: dark;
      --surface-0: #141413;
      --surface-1: #1f1f1d;
      --surface-2: #2a2a27;
      --border:    #35352f;
      --text-primary:   #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted:     #8f8e83;
      --series-winning: #3987e5;
      --series-test:    #d95926;
      --series-ai:      #199e70;
      --series-other:   #8f8e83;
      --good: #22a922;
      --track: #33332e;
    }
  }
  :root[data-theme="dark"] .adx {
    color-scheme: dark;
    --surface-0: #141413;
    --surface-1: #1f1f1d;
    --surface-2: #2a2a27;
    --border:    #35352f;
    --text-primary:   #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted:     #8f8e83;
    --series-winning: #3987e5;
    --series-test:    #d95926;
    --series-ai:      #199e70;
    --series-other:   #8f8e83;
    --good: #22a922;
    --track: #33332e;
  }
  .adx * { box-sizing: border-box; }
  .adx-wrap { max-width: 1180px; margin: 0 auto; padding: 28px 20px 64px; }
  .adx h1 { font-size: 1.6rem; font-weight: 680; margin: 0 0 4px; letter-spacing: -0.01em; }
  .adx .sub { color: var(--text-secondary); font-size: 0.9rem; margin: 0 0 24px; }
  .adx .sub b { color: var(--text-primary); font-weight: 600; }

  .adx-kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 22px; }
  @media (max-width: 900px){ .adx-kpis { grid-template-columns: repeat(2,1fr);} }
  @media (max-width: 520px){ .adx-kpis { grid-template-columns: 1fr;} }
  .adx-kpi { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .adx-kpi .lbl { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 600; }
  .adx-kpi .val { font-size: 1.85rem; font-weight: 700; margin-top: 4px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .adx-kpi .note { font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px; }

  .adx-callout { background: var(--surface-1); border: 1px solid var(--border); border-left: 3px solid var(--series-winning); border-radius: 10px; padding: 14px 16px; margin-bottom: 22px; font-size: 0.9rem; }
  .adx-callout b { color: var(--text-primary); }
  .adx-callout .pill { color: var(--text-secondary); }

  .adx-panel { background: var(--surface-1); border: 1px solid var(--border); border-radius: 14px; padding: 18px 18px 8px; margin-bottom: 22px; }
  .adx-panel h2 { font-size: 1.02rem; font-weight: 640; margin: 0 0 2px; }
  .adx-panel .phint { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 14px; }

  .adx-controls { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: 14px; }
  .adx-controls .grp { display: inline-flex; gap: 4px; background: var(--surface-2); border-radius: 9px; padding: 3px; }
  .adx-controls button.f { border: 0; background: transparent; color: var(--text-secondary); font: inherit; font-size: 0.82rem; padding: 5px 11px; border-radius: 7px; cursor: pointer; font-weight: 550; }
  .adx-controls button.f[aria-pressed="true"] { background: var(--surface-1); color: var(--text-primary); box-shadow: 0 1px 2px rgba(0,0,0,.12); }
  .adx-controls label { font-size: 0.82rem; color: var(--text-secondary); display: inline-flex; align-items: center; gap: 7px; }
  .adx-controls input[type=range]{ accent-color: var(--series-winning); }
  .adx-controls input[type=search]{ background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 0.82rem; color: var(--text-primary); min-width: 170px; }

  .adx-bars { display: flex; flex-direction: column; gap: 7px; }
  .adx-bar { display: grid; grid-template-columns: 210px 1fr auto; align-items: center; gap: 12px; }
  @media (max-width: 640px){ .adx-bar { grid-template-columns: 130px 1fr auto; } }
  .adx-bar .nm { font-size: 0.82rem; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .adx-bar .track { background: var(--track); border-radius: 5px; height: 16px; position: relative; overflow: hidden; }
  .adx-bar .fill { height: 100%; border-radius: 5px; }
  .adx-bar .rt { font-size: 0.82rem; font-variant-numeric: tabular-nums; color: var(--text-primary); font-weight: 600; min-width: 84px; text-align: right; }
  .adx-bar .rt small { color: var(--text-muted); font-weight: 500; }

  .adx-tablewrap { overflow-x: auto; }
  table.adx-t { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  table.adx-t th, table.adx-t td { padding: 9px 10px; text-align: right; white-space: nowrap; }
  table.adx-t th:first-child, table.adx-t td:first-child { text-align: left; white-space: normal; min-width: 220px; }
  table.adx-t thead th { position: sticky; top: 0; background: var(--surface-1); border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 600; cursor: pointer; user-select: none; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.04em; }
  table.adx-t thead th.active { color: var(--text-primary); }
  table.adx-t tbody tr { border-bottom: 1px solid var(--border); }
  table.adx-t tbody tr:hover { background: var(--surface-2); }
  table.adx-t td.num { font-variant-numeric: tabular-nums; }
  .adx-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; vertical-align: baseline; flex: none; }
  .adx-name { display: inline-flex; align-items: center; }
  .adx-minibar { display: inline-block; width: 60px; height: 8px; border-radius: 4px; background: var(--track); margin-left: 10px; vertical-align: middle; overflow: hidden; position: relative; }
  .adx-minibar i { display: block; height: 100%; border-radius: 4px; background: var(--series-winning); }
  .adx-foot { color: var(--text-muted); font-size: 0.78rem; margin-top: 10px; }
  .adx-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 14px; }
  .adx-legend span { display: inline-flex; align-items: center; }
  .adx-empty { color: var(--text-muted); font-size: 0.85rem; padding: 20px 0; }
</style>

<div class="adx"><div class="adx-wrap">
  <h1>Ad Creative Performance Dashboard</h1>
  <p class="sub" id="adx-sub"></p>

  <div class="adx-kpis" id="adx-kpis"></div>
  <div class="adx-callout" id="adx-callout"></div>

  <div class="adx-panel">
    <h2>Which ads to scale</h2>
    <p class="phint">Appointment booking rate (VA + Turning&nbsp;65) by ad, highest first. Bars are colored by ad family; the number in parentheses is leads. Use the leads filter to hide low-volume noise.</p>
    <div class="adx-legend">
      <span><i class="adx-dot" style="background:var(--series-winning)"></i>Winning</span>
      <span><i class="adx-dot" style="background:var(--series-test)"></i>Test</span>
      <span><i class="adx-dot" style="background:var(--series-ai)"></i>AI Test</span>
      <span><i class="adx-dot" style="background:var(--series-other)"></i>Other</span>
    </div>
    <div class="adx-controls">
      <div class="grp" id="adx-groups"></div>
      <label>Min leads: <input type="range" id="adx-min" min="0" max="100" step="5" value="20"><b id="adx-minval" style="min-width:2ch">20</b></label>
    </div>
    <div class="adx-bars" id="adx-bars"></div>
    <p class="adx-empty" id="adx-bars-empty" hidden>No ads match this filter.</p>
  </div>

  <div class="adx-panel">
    <h2>Full breakdown</h2>
    <p class="phint">Every ad creative value found on your contacts. Click a column header to sort. VA / T65 columns count distinct leads that booked at least one appointment on that calendar; Showed counts those who attended. Close&nbsp;% = sales ÷ appointments booked.</p>
    <div class="adx-controls">
      <input type="search" id="adx-search" placeholder="Filter ad name…" aria-label="Filter ad name">
      <label><input type="checkbox" id="adx-hidezero"> Hide ads with 0 appointments</label>
    </div>
    <div class="adx-tablewrap">
      <table class="adx-t" id="adx-table">
        <thead><tr>
          <th data-k="ad">Ad Creative</th>
          <th data-k="leads">Leads</th>
          <th data-k="va">VA</th>
          <th data-k="t65">T65</th>
          <th data-k="appts">Appts</th>
          <th data-k="appt_rate">Appt %</th>
          <th data-k="showed">Showed</th>
          <th data-k="sales">Sales</th>
          <th data-k="sale_rate">Sale %</th>
          <th data-k="close_rate">Close %</th>
        </tr></thead>
        <tbody id="adx-tbody"></tbody>
      </table>
    </div>
    <p class="adx-foot" id="adx-foot"></p>
  </div>
</div></div>

<script>
(function(){
  const DATA = ${json};
  const rows = DATA.rows.map(r => {
    const showed = (r.va_showed||0) + (r.t65_showed||0);
    return {
      ...r,
      showed,
      close_rate: r.appts ? +(100*r.sales/r.appts).toFixed(1) : 0,
      group: groupOf(r.ad)
    };
  });
  function groupOf(ad){
    const a = (ad||'').toLowerCase().trim();
    if (a.startsWith('winning')) return 'Winning';
    if (a.startsWith('ai |') || a.startsWith('ai|')) return 'AI Test';
    if (a.startsWith('test')) return 'Test';
    return 'Other';
  }
  const GROUP_COLOR = { 'Winning':'var(--series-winning)', 'Test':'var(--series-test)', 'AI Test':'var(--series-ai)', 'Other':'var(--series-other)' };
  const T = DATA.totals;
  const nf = n => n.toLocaleString('en-US');

  // ---- subtitle
  const gen = DATA.generatedAt ? new Date(DATA.generatedAt) : null;
  document.getElementById('adx-sub').innerHTML =
    'Mohr Insurance — GoHighLevel · <b>' + nf(T.leads) + '</b> leads across <b>' + rows.length + '</b> ad creatives'
    + (gen ? ' · generated ' + gen.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' ' + gen.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '');

  // ---- KPIs
  const apptRate = T.leads ? (100*T.appts/T.leads) : 0;
  const saleRate = T.leads ? (100*T.sales/T.leads) : 0;
  const closeRate = T.appts ? (100*T.sales/T.appts) : 0;
  const kpis = [
    { lbl:'Total Leads', val: nf(T.leads), note:'with an Ad Creative set' },
    { lbl:'Appointments Booked', val: nf(T.appts), note: apptRate.toFixed(1)+'% of leads' },
    { lbl:'VA Appointments', val: nf(T.va), note:(T.va_showed)+' showed' },
    { lbl:'Turning 65 Appointments', val: nf(T.t65), note:(T.t65_showed)+' showed' },
    { lbl:'Sales', val: nf(T.sales), note: saleRate.toFixed(1)+'% of leads · '+closeRate.toFixed(1)+'% close' },
  ];
  document.getElementById('adx-kpis').innerHTML = kpis.map(k =>
    '<div class="adx-kpi"><div class="lbl">'+k.lbl+'</div><div class="val">'+k.val+'</div><div class="note">'+k.note+'</div></div>'
  ).join('');

  // ---- callout: best scalable ad (highest appt rate among >=30 leads), best closer
  const scal = rows.filter(r=>r.leads>=30).slice().sort((a,b)=>b.appt_rate-a.appt_rate)[0];
  const closer = rows.filter(r=>r.appts>=5).slice().sort((a,b)=>b.close_rate-a.close_rate)[0];
  const vol = rows.slice().sort((a,b)=>b.leads-a.leads)[0];
  let co = '';
  if (scal) co += '<b>Best booking rate at volume:</b> “'+esc(scal.ad)+'” — '+scal.appt_rate+'% of '+nf(scal.leads)+' leads booked. ';
  if (closer) co += '<span class="pill"><b>Best closer:</b> “'+esc(closer.ad)+'” — '+closer.close_rate+'% of appointments became sales. </span>';
  if (vol) co += '<span class="pill"><b>Highest volume:</b> “'+esc(vol.ad)+'” ('+nf(vol.leads)+' leads).</span>';
  document.getElementById('adx-callout').innerHTML = co;

  // ---- group filter state
  let activeGroup = 'All';
  let minLeads = 20;
  const groups = ['All','Winning','Test','AI Test','Other'];
  document.getElementById('adx-groups').innerHTML = groups.map(g =>
    '<button class="f" data-g="'+g+'" aria-pressed="'+(g==='All')+'">'+g+'</button>').join('');
  document.querySelectorAll('#adx-groups button').forEach(b=>{
    b.onclick = () => { activeGroup=b.dataset.g;
      document.querySelectorAll('#adx-groups button').forEach(x=>x.setAttribute('aria-pressed', x.dataset.g===activeGroup));
      drawBars(); };
  });
  const minEl = document.getElementById('adx-min');
  minEl.oninput = () => { minLeads=+minEl.value; document.getElementById('adx-minval').textContent=minLeads; drawBars(); };

  function drawBars(){
    let list = rows.filter(r => (activeGroup==='All'||r.group===activeGroup) && r.leads>=minLeads);
    list.sort((a,b)=> b.appt_rate-a.appt_rate);
    const max = Math.max(1, ...list.map(r=>r.appt_rate));
    const host = document.getElementById('adx-bars');
    const empty = document.getElementById('adx-bars-empty');
    empty.hidden = list.length>0;
    host.innerHTML = list.map(r => {
      const w = (r.appt_rate/max*100).toFixed(1);
      return '<div class="adx-bar" title="'+esc(r.ad)+' — '+r.appts+' appts / '+nf(r.leads)+' leads · '+r.sales+' sales">'
        + '<div class="nm"><span class="adx-dot" style="background:'+GROUP_COLOR[r.group]+'"></span>'+esc(r.ad)+'</div>'
        + '<div class="track"><div class="fill" style="width:'+w+'%;background:'+GROUP_COLOR[r.group]+'"></div></div>'
        + '<div class="rt">'+r.appt_rate+'% <small>('+nf(r.leads)+')</small></div></div>';
    }).join('');
  }

  // ---- table
  let sortK='leads', sortDir=-1, search='', hideZero=false;
  const searchEl=document.getElementById('adx-search');
  searchEl.oninput=()=>{search=searchEl.value.toLowerCase();drawTable();};
  document.getElementById('adx-hidezero').onchange=(e)=>{hideZero=e.target.checked;drawTable();};
  document.querySelectorAll('#adx-table thead th').forEach(th=>{
    th.onclick=()=>{ const k=th.dataset.k; if(k===sortK){sortDir*=-1;} else {sortK=k; sortDir = (k==='ad')?1:-1;} drawTable(); };
  });
  function drawTable(){
    let list = rows.filter(r => (!search||r.ad.toLowerCase().includes(search)) && (!hideZero||r.appts>0));
    list.sort((a,b)=>{ let x=a[sortK],y=b[sortK]; if(typeof x==='string'){return x.localeCompare(y)*sortDir;} return (x-y)*sortDir; });
    const maxLeads = Math.max(1, ...rows.map(r=>r.leads));
    document.querySelectorAll('#adx-table thead th').forEach(th=>th.classList.toggle('active', th.dataset.k===sortK));
    document.getElementById('adx-tbody').innerHTML = list.map(r => {
      const mb = (r.leads/maxLeads*100).toFixed(1);
      return '<tr>'
        + '<td><span class="adx-name"><span class="adx-dot" style="background:'+GROUP_COLOR[r.group]+'"></span>'+esc(r.ad)+'</span>'
          + '<span class="adx-minibar"><i style="width:'+mb+'%;background:'+GROUP_COLOR[r.group]+'"></i></span></td>'
        + '<td class="num">'+nf(r.leads)+'</td>'
        + '<td class="num">'+r.va+'</td>'
        + '<td class="num">'+r.t65+'</td>'
        + '<td class="num">'+r.appts+'</td>'
        + '<td class="num">'+r.appt_rate+'%</td>'
        + '<td class="num">'+r.showed+'</td>'
        + '<td class="num">'+r.sales+'</td>'
        + '<td class="num">'+r.sale_rate+'%</td>'
        + '<td class="num">'+r.close_rate+'%</td>'
        + '</tr>';
    }).join('');
    document.getElementById('adx-foot').textContent =
      'Showing '+list.length+' of '+rows.length+' ad creatives. VA calendar: '+DATA.meta.va_events+' appointments · Turning 65: '+DATA.meta.t65_events+' appointments. “Sale” = Appointment Status containing the word Sale.';
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  drawBars(); drawTable();
})();
</script>`;
}

export function renderDoc(data) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ad Creative Performance Dashboard</title>
<style>*{margin:0}body{margin:0;background:#f4f4f2}@media(prefers-color-scheme:dark){body{background:#141413}}</style>
</head>
<body>
${renderBody(data)}
</body>
</html>`;
}
