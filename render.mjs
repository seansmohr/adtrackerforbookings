// render.mjs — turns the ad-performance dataset into an HTML dashboard.
// Data model (v2): per-lead records with dates so the browser can re-aggregate
// for any date range without re-querying GHL.
//   data = { generatedAt, meta, activeAds[], ads[], contacts[], unattributedSales[] }
//   contacts[i] = { a: adIndex, d: "YYYY-MM-DD" (lead created), va,vs,t,ts,s: 0|1 }
// Exports renderBody() (inner markup) and renderDoc() (full standalone page).

export function renderBody(data) {
  const json = JSON.stringify(data);
  return `<style>
  .adx {
    color-scheme: light;
    --surface-0:#f4f4f2; --surface-1:#fcfcfb; --surface-2:#f0efec; --border:#e2e1dc;
    --text-primary:#0b0b0b; --text-secondary:#52514e; --text-muted:#8a897f;
    --series-winning:#2a78d6; --series-test:#eb6834; --series-ai:#1baf7a; --series-other:#8a897f;
    --accent:#2a78d6; --good:#008300; --track:#e6e5e0; --star:#eda100;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-primary); background: var(--surface-0); line-height:1.45; -webkit-font-smoothing:antialiased;
  }
  @media (prefers-color-scheme: dark){ :root:where(:not([data-theme="light"])) .adx{
    color-scheme:dark;
    --surface-0:#141413; --surface-1:#1f1f1d; --surface-2:#2a2a27; --border:#35352f;
    --text-primary:#fff; --text-secondary:#c3c2b7; --text-muted:#8f8e83;
    --series-winning:#3987e5; --series-test:#d95926; --series-ai:#199e70; --series-other:#8f8e83;
    --accent:#3987e5; --good:#22a922; --track:#33332e; --star:#c98500;
  }}
  :root[data-theme="dark"] .adx{
    color-scheme:dark;
    --surface-0:#141413; --surface-1:#1f1f1d; --surface-2:#2a2a27; --border:#35352f;
    --text-primary:#fff; --text-secondary:#c3c2b7; --text-muted:#8f8e83;
    --series-winning:#3987e5; --series-test:#d95926; --series-ai:#199e70; --series-other:#8f8e83;
    --accent:#3987e5; --good:#22a922; --track:#33332e; --star:#c98500;
  }
  .adx *{box-sizing:border-box;}
  .adx-wrap{max-width:1180px;margin:0 auto;padding:26px 20px 64px;}
  .adx h1{font-size:1.6rem;font-weight:680;margin:0 0 4px;letter-spacing:-0.01em;}
  .adx .sub{color:var(--text-secondary);font-size:0.9rem;margin:0 0 20px;}
  .adx .sub b{color:var(--text-primary);font-weight:600;}

  .adx-daterow{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:20px;}
  .adx-daterow .presets{display:inline-flex;gap:3px;background:var(--surface-2);border-radius:9px;padding:3px;flex-wrap:wrap;}
  .adx-daterow button.p{border:0;background:transparent;color:var(--text-secondary);font:inherit;font-size:0.8rem;padding:5px 10px;border-radius:7px;cursor:pointer;font-weight:550;}
  .adx-daterow button.p[aria-pressed="true"]{background:var(--surface-1);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,.12);}
  .adx-daterow label{font-size:0.8rem;color:var(--text-secondary);display:inline-flex;align-items:center;gap:6px;}
  .adx-daterow input[type=date]{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:5px 8px;font:inherit;font-size:0.8rem;color:var(--text-primary);color-scheme:light dark;}
  .adx-daterow .rng{margin-left:auto;font-size:0.8rem;color:var(--text-muted);}
  .adx-daterow #adx-refresh[disabled]{opacity:0.6;cursor:default;}
  .adx-refresh-msg{margin:-12px 0 20px;font-size:0.82rem;padding:9px 14px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text-secondary);}
  .adx-refresh-msg.err{border-color:var(--series-test);color:var(--text-primary);}
  .adx-refresh-msg.ok{border-color:var(--good);}

  .adx-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:22px;}
  @media (max-width:980px){.adx-kpis{grid-template-columns:repeat(3,1fr);}}
  @media (max-width:640px){.adx-kpis{grid-template-columns:repeat(2,1fr);}}
  @media (max-width:420px){.adx-kpis{grid-template-columns:1fr;}}
  .adx-kpi.rev .val{color:var(--good);}
  .adx-kpi{background:var(--surface-1);border:1px solid var(--border);border-radius:12px;padding:14px 16px;}
  .adx-kpi .lbl{font-size:0.72rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);font-weight:600;}
  .adx-kpi .val{font-size:1.8rem;font-weight:700;margin-top:4px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;}
  .adx-kpi .note{font-size:0.79rem;color:var(--text-secondary);margin-top:2px;}

  .adx-callout{background:var(--surface-1);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:10px;padding:13px 16px;margin-bottom:22px;font-size:0.9rem;}
  .adx-callout b{color:var(--text-primary);} .adx-callout .pill{color:var(--text-secondary);}

  .adx-panel{background:var(--surface-1);border:1px solid var(--border);border-radius:14px;padding:18px 18px 10px;margin-bottom:22px;}
  .adx-panel h2{font-size:1.02rem;font-weight:640;margin:0 0 2px;}
  .adx-panel .phint{font-size:0.8rem;color:var(--text-muted);margin:0 0 14px;}

  .adx-controls{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;margin-bottom:14px;}
  .adx-controls .grp{display:inline-flex;gap:4px;background:var(--surface-2);border-radius:9px;padding:3px;flex-wrap:wrap;}
  .adx-controls button.f{border:0;background:transparent;color:var(--text-secondary);font:inherit;font-size:0.82rem;padding:5px 11px;border-radius:7px;cursor:pointer;font-weight:550;}
  .adx-controls button.f[aria-pressed="true"]{background:var(--surface-1);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,.12);}
  .adx-controls label{font-size:0.82rem;color:var(--text-secondary);display:inline-flex;align-items:center;gap:7px;}
  .adx-controls input[type=range]{accent-color:var(--accent);}
  .adx-controls input[type=search]{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:inherit;font-size:0.82rem;color:var(--text-primary);min-width:170px;}

  .adx-watch{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;}
  .adx-chip{display:inline-flex;align-items:center;gap:6px;background:var(--surface-2);border:1px solid var(--border);border-radius:999px;padding:4px 6px 4px 11px;font-size:0.82rem;color:var(--text-primary);}
  .adx-chip.warn{border-color:var(--star);}
  .adx-chip .cnt{color:var(--text-muted);font-variant-numeric:tabular-nums;}
  .adx-chip button{border:0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:1rem;line-height:1;padding:0 2px;border-radius:50%;}
  .adx-chip button:hover{color:var(--text-primary);}
  .adx-addwrap{display:inline-flex;gap:6px;align-items:center;}
  .adx-addwrap input{background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;font:inherit;font-size:0.82rem;color:var(--text-primary);min-width:230px;}
  .adx-addwrap button, .adx-linkbtn{border:1px solid var(--border);background:var(--surface-2);color:var(--text-primary);font:inherit;font-size:0.8rem;font-weight:550;padding:6px 12px;border-radius:8px;cursor:pointer;}
  .adx-addwrap button:hover,.adx-linkbtn:hover{border-color:var(--accent);}

  .adx-bars{display:flex;flex-direction:column;gap:7px;}
  .adx-bar{display:grid;grid-template-columns:220px 1fr auto;align-items:center;gap:12px;}
  @media (max-width:640px){.adx-bar{grid-template-columns:130px 1fr auto;}}
  .adx-bar .nm{font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .adx-bar .track{background:var(--track);border-radius:5px;height:16px;position:relative;overflow:hidden;}
  .adx-bar .fill{height:100%;border-radius:5px;}
  .adx-bar .rt{font-size:0.82rem;font-variant-numeric:tabular-nums;color:var(--text-primary);font-weight:600;min-width:96px;text-align:right;}
  .adx-bar .rt small{color:var(--text-muted);font-weight:500;}

  .adx-tablewrap{overflow-x:auto;}
  table.adx-t{border-collapse:collapse;width:100%;font-size:0.85rem;}
  table.adx-t th,table.adx-t td{padding:9px 10px;text-align:right;white-space:nowrap;}
  table.adx-t th:first-child,table.adx-t td:first-child{text-align:left;white-space:normal;min-width:230px;}
  table.adx-t thead th{position:sticky;top:0;background:var(--surface-1);border-bottom:1px solid var(--border);color:var(--text-secondary);font-weight:600;cursor:pointer;user-select:none;font-size:0.76rem;text-transform:uppercase;letter-spacing:0.04em;}
  table.adx-t thead th.active{color:var(--text-primary);}
  table.adx-t tbody tr{border-bottom:1px solid var(--border);}
  table.adx-t tbody tr:hover{background:var(--surface-2);}
  table.adx-t tbody tr.unattr{color:var(--text-muted);font-style:italic;}
  table.adx-t td.num{font-variant-numeric:tabular-nums;}
  .adx-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;vertical-align:baseline;flex:none;}
  .adx-name{display:inline-flex;align-items:center;gap:2px;}
  .adx-star{color:var(--star);margin-left:6px;font-size:0.85rem;}
  .adx-minibar{display:inline-block;width:56px;height:8px;border-radius:4px;background:var(--track);margin-left:10px;vertical-align:middle;overflow:hidden;}
  .adx-minibar i{display:block;height:100%;border-radius:4px;}
  .adx-foot{color:var(--text-muted);font-size:0.78rem;margin-top:10px;}
  .adx-legend{display:flex;gap:16px;flex-wrap:wrap;font-size:0.8rem;color:var(--text-secondary);margin-bottom:14px;}
  .adx-legend span{display:inline-flex;align-items:center;}
  .adx-empty{color:var(--text-muted);font-size:0.85rem;padding:16px 0;}
</style>

<div class="adx"><div class="adx-wrap">
  <h1>Ad Creative Performance Dashboard</h1>
  <p class="sub" id="adx-sub"></p>

  <div class="adx-daterow">
    <div class="presets" id="adx-presets"></div>
    <label>From <input type="date" id="adx-from"></label>
    <label>To <input type="date" id="adx-to"></label>
    <span class="rng" id="adx-rnglabel"></span>
    <button class="adx-linkbtn" id="adx-refresh" title="Pull fresh data from GoHighLevel and rebuild (works on the deployed app when a GHL token is configured)">↻ Refresh from GHL</button>
  </div>
  <p class="adx-refresh-msg" id="adx-refresh-msg" hidden></p>

  <div class="adx-kpis" id="adx-kpis"></div>
  <div class="adx-callout" id="adx-callout"></div>

  <div class="adx-panel">
    <h2>Active ads <span style="font-weight:400;color:var(--text-muted);font-size:0.85rem">— the ones you're running now</span></h2>
    <p class="phint">Your watchlist. Add the exact Ad Creative value from GHL and its counts link automatically. Saved in this browser; edit <code>config.json</code> in the repo to change the shared defaults.</p>
    <div class="adx-watch" id="adx-watch"></div>
    <div class="adx-tablewrap">
      <table class="adx-t" id="adx-activetable"><thead><tr>
        <th>Active ad</th><th>Leads</th><th>VA</th><th>T65</th><th>Appts</th><th>Appt %</th><th>Sales</th><th>Conf $</th>
      </tr></thead><tbody id="adx-activebody"></tbody></table>
    </div>
    <p class="adx-empty" id="adx-active-empty" hidden>No active ads yet — add one above.</p>
  </div>

  <div class="adx-panel">
    <h2>Which ads to scale</h2>
    <p class="phint">Ranked by the metric you pick. Bars are colored by ad family; the value in parentheses is leads. Raise “min leads” to hide low-volume noise.</p>
    <div class="adx-legend">
      <span><i class="adx-dot" style="background:var(--series-winning)"></i>Winning</span>
      <span><i class="adx-dot" style="background:var(--series-test)"></i>Test</span>
      <span><i class="adx-dot" style="background:var(--series-ai)"></i>AI Test</span>
      <span><i class="adx-dot" style="background:var(--series-other)"></i>Other</span>
    </div>
    <div class="adx-controls">
      <div class="grp" id="adx-metric"></div>
      <label><input type="checkbox" id="adx-activeonly"> Active ads only</label>
      <label>Min leads: <input type="range" id="adx-min" min="0" max="100" step="5" value="20"><b id="adx-minval" style="min-width:2ch">20</b></label>
    </div>
    <div class="adx-bars" id="adx-bars"></div>
    <p class="adx-empty" id="adx-bars-empty" hidden>No ads match this filter.</p>
  </div>

  <div class="adx-panel">
    <h2>Full breakdown</h2>
    <p class="phint">Every ad creative found on your contacts in this date range. Click a column to sort. VA / T65 count distinct leads who booked ≥1 appointment on that calendar; Showed = attended. Close % = sales ÷ appointments. ★ = active ad.</p>
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
          <th data-k="rev_c">Conf $</th>
          <th data-k="rev_p">Proj $</th>
        </tr></thead>
        <tbody id="adx-tbody"></tbody>
      </table>
    </div>
    <p class="adx-foot" id="adx-foot"></p>
  </div>
  <datalist id="adx-adlist"></datalist>
</div></div>

<script>
(function(){
  var DATA = ${json};
  var ADS = DATA.ads, C = DATA.contacts, UNSALE = DATA.unattributedSales || [];
  var GC = {Winning:'var(--series-winning)',Test:'var(--series-test)','AI Test':'var(--series-ai)',Other:'var(--series-other)'};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function nf(n){return n.toLocaleString('en-US');}
  function money(n){ n=n||0; if(Math.abs(n)>=1000) return '$'+Math.round(n).toLocaleString('en-US'); return '$'+(Math.round(n*100)/100).toLocaleString('en-US'); }
  function groupOf(ad){var a=(ad||'').toLowerCase().trim();
    if(a.indexOf('winning')===0)return 'Winning';
    if(a.indexOf('ai |')===0||a.indexOf('ai|')===0)return 'AI Test';
    if(a.indexOf('test')===0)return 'Test';return 'Other';}

  // ---------- date range state ----------
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  var today = new Date();
  var PRESETS = [
    {k:'all', label:'All time', from:null, to:null},
    {k:'7', label:'Last 7d', from:function(){var d=new Date();d.setDate(d.getDate()-6);return iso(d);}, to:iso(today)},
    {k:'30', label:'Last 30d', from:function(){var d=new Date();d.setDate(d.getDate()-29);return iso(d);}, to:iso(today)},
    {k:'90', label:'Last 90d', from:function(){var d=new Date();d.setDate(d.getDate()-89);return iso(d);}, to:iso(today)},
    {k:'mtd', label:'This month', from:iso(new Date(today.getFullYear(),today.getMonth(),1)), to:iso(today)},
    {k:'qtd', label:'This quarter', from:iso(new Date(today.getFullYear(),Math.floor(today.getMonth()/3)*3,1)), to:iso(today)},
    {k:'ytd', label:'Year to date', from:iso(new Date(today.getFullYear(),0,1)), to:iso(today)}
  ];
  var from=null, to=null;
  var fromEl=document.getElementById('adx-from'), toEl=document.getElementById('adx-to');
  document.getElementById('adx-presets').innerHTML = PRESETS.map(function(p){
    return '<button class="p" data-k="'+p.k+'" aria-pressed="'+(p.k==='all')+'">'+p.label+'</button>';}).join('');
  document.querySelectorAll('#adx-presets button').forEach(function(b){
    b.onclick=function(){
      var p=PRESETS.filter(function(x){return x.k===b.dataset.k;})[0];
      from = typeof p.from==='function'?p.from():p.from;
      to = typeof p.to==='function'?p.to():p.to;
      fromEl.value=from||''; toEl.value=to||'';
      setPreset(b.dataset.k); render();
    };
  });
  function setPreset(k){document.querySelectorAll('#adx-presets button').forEach(function(x){x.setAttribute('aria-pressed', x.dataset.k===k);});}
  fromEl.onchange=function(){from=fromEl.value||null;setPreset(null);render();};
  toEl.onchange=function(){to=toEl.value||null;setPreset(null);render();};
  function inRange(d){ if(!d)return (!from&&!to); if(from&&d<from)return false; if(to&&d>to)return false; return true; }

  // ---------- manual refresh (POST /refresh on the deployed server) ----------
  var refreshBtn=document.getElementById('adx-refresh');
  var refreshMsg=document.getElementById('adx-refresh-msg');
  function showMsg(text,cls){ refreshMsg.hidden=false; refreshMsg.className='adx-refresh-msg'+(cls?' '+cls:''); refreshMsg.textContent=text; }
  refreshBtn.onclick=function(){
    refreshBtn.disabled=true; var old=refreshBtn.textContent; refreshBtn.textContent='↻ Refreshing…';
    showMsg('Pulling fresh data from GoHighLevel — this takes ~30–60 seconds…');
    fetch('/refresh',{method:'POST'})
      .then(function(r){return r.json().catch(function(){return {ok:false};});})
      .then(function(j){
        if(j&&j.ok){ showMsg('Updated. Reloading with the latest numbers…','ok'); setTimeout(function(){location.reload();},700); return; }
        refreshBtn.disabled=false; refreshBtn.textContent=old;
        if(j&&j.skipped){ showMsg('Refresh isn\\u2019t enabled: '+j.skipped+'. Add GHL_API_TOKEN in Railway (Variables tab) to turn it on.','err'); }
        else if(j&&j.error){ showMsg('Refresh failed: '+j.error,'err'); }
        else { showMsg('Refresh failed. Check the service logs in Railway.','err'); }
      })
      .catch(function(){
        refreshBtn.disabled=false; refreshBtn.textContent=old;
        showMsg('Manual refresh only works on the deployed app (the Node server on Railway), not when opening the HTML file or the preview directly.','err');
      });
  };

  // ---------- watchlist (active ads) ----------
  var LSKEY='adx_watchlist';
  var watch;
  try{ watch = JSON.parse(localStorage.getItem(LSKEY)); }catch(e){ watch=null; }
  if(!Array.isArray(watch)) watch = (DATA.activeAds||[]).slice();
  function saveWatch(){ try{localStorage.setItem(LSKEY, JSON.stringify(watch));}catch(e){} }
  var watchSet = function(){ return watch; };
  document.getElementById('adx-adlist').innerHTML = ADS.map(function(a){return '<option value="'+esc(a)+'">';}).join('');

  // leads-per-ad over ALL time (for watchlist match warnings)
  var leadsAllByAd = {};
  C.forEach(function(r){ var ad=ADS[r.a]; leadsAllByAd[ad]=(leadsAllByAd[ad]||0)+1; });

  // ---------- aggregation for current date range ----------
  function aggregate(){
    var m={}; // adName -> row
    for(var i=0;i<ADS.length;i++){ m[ADS[i]]={ad:ADS[i],group:groupOf(ADS[i]),leads:0,va:0,vs:0,t:0,ts:0,appts:0,sales:0,rev_p:0,rev_c:0}; }
    for(var j=0;j<C.length;j++){ var r=C[j]; if(!inRange(r.d))continue; var a=m[ADS[r.a]];
      a.leads++; if(r.va)a.va++; if(r.vs)a.vs++; if(r.t)a.t++; if(r.ts)a.ts++; if(r.va||r.t)a.appts++; if(r.s)a.sales++;
      a.rev_p+=r.pr||0; a.rev_c+=r.cr||0; }
    var rows=[];
    for(var k in m){ var a=m[k]; if(a.leads===0)continue;
      a.showed=a.vs+a.ts;
      a.appt_rate=a.leads?+(100*a.appts/a.leads).toFixed(1):0;
      a.sale_rate=a.leads?+(100*a.sales/a.leads).toFixed(1):0;
      a.close_rate=a.appts?+(100*a.sales/a.appts).toFixed(1):0;
      a.rev_lead=a.leads?a.rev_c/a.leads:0;
      rows.push(a); }
    var unsale=0; for(var u=0;u<UNSALE.length;u++){ if(inRange(UNSALE[u].d)) unsale++; }
    return {rows:rows, unattributedSales:unsale};
  }

  // ---------- render ----------
  var metric='confrev', activeOnly=false, minLeads=20, search='', hideZero=false, sortK='leads', sortDir=-1;
  var gen = DATA.generatedAt?new Date(DATA.generatedAt):null;

  document.getElementById('adx-metric').innerHTML =
    [['confrev','Confirmed $'],['revlead','$ / lead'],['appt','Appt rate'],['sales','Sales'],['salerate','Sale rate']].map(function(x){
      return '<button class="f" data-m="'+x[0]+'" aria-pressed="'+(x[0]==='confrev')+'">'+x[1]+'</button>';}).join('');
  document.querySelectorAll('#adx-metric button').forEach(function(b){
    b.onclick=function(){ metric=b.dataset.m;
      document.querySelectorAll('#adx-metric button').forEach(function(x){x.setAttribute('aria-pressed',x.dataset.m===metric);});
      drawBars(cur); };
  });
  document.getElementById('adx-activeonly').onchange=function(e){activeOnly=e.target.checked;drawBars(cur);};
  var minEl=document.getElementById('adx-min');
  minEl.oninput=function(){minLeads=+minEl.value;document.getElementById('adx-minval').textContent=minLeads;drawBars(cur);};
  var searchEl=document.getElementById('adx-search');
  searchEl.oninput=function(){search=searchEl.value.toLowerCase();drawTable(cur);};
  document.getElementById('adx-hidezero').onchange=function(e){hideZero=e.target.checked;drawTable(cur);};
  document.querySelectorAll('#adx-table thead th').forEach(function(th){
    th.onclick=function(){var k=th.dataset.k; if(k===sortK){sortDir*=-1;}else{sortK=k;sortDir=(k==='ad')?1:-1;} drawTable(cur);};
  });

  var cur=null;
  function render(){
    cur=aggregate();
    var tot={leads:0,va:0,vs:0,t:0,ts:0,appts:0,sales:0,rev_p:0,rev_c:0};
    cur.rows.forEach(function(r){tot.leads+=r.leads;tot.va+=r.va;tot.vs+=r.vs;tot.t+=r.t;tot.ts+=r.ts;tot.appts+=r.appts;tot.sales+=r.sales;tot.rev_p+=r.rev_p;tot.rev_c+=r.rev_c;});
    cur.tot=tot; cur.totalSales=tot.sales+cur.unattributedSales;

    // subtitle + range label
    document.getElementById('adx-sub').innerHTML='Mohr Insurance — GoHighLevel · <b>'+nf(tot.leads)+'</b> leads · <b>'+cur.rows.length+'</b> ad creatives in range'
      +(gen?' · data as of '+gen.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' '+gen.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'');
    document.getElementById('adx-rnglabel').textContent = (!from&&!to)?'All time':((from||'…')+'  →  '+(to||'…'));

    // KPIs
    var apptRate=tot.leads?100*tot.appts/tot.leads:0, saleRate=tot.leads?100*tot.sales/tot.leads:0, closeRate=tot.appts?100*tot.sales/tot.appts:0;
    var kpis=[
      {lbl:'Leads', val:nf(tot.leads), note:'with an Ad Creative'},
      {lbl:'Appointments', val:nf(tot.appts), note:apptRate.toFixed(1)+'% of leads'},
      {lbl:'VA / T65 Appts', val:nf(tot.va)+' / '+nf(tot.t), note:(tot.vs+tot.ts)+' showed'},
      {lbl:'Sales', val:nf(cur.totalSales), note:tot.sales+' from ads · '+cur.unattributedSales+' no ad creative'},
      {lbl:'Confirmed Revenue', val:money(tot.rev_c), note:'from ad-matched clients', rev:true},
      {lbl:'Projected Revenue', val:money(tot.rev_p), note:'incl. pending', rev:true}
    ];
    document.getElementById('adx-kpis').innerHTML=kpis.map(function(k){
      return '<div class="adx-kpi'+(k.rev?' rev':'')+'"><div class="lbl">'+k.lbl+'</div><div class="val">'+k.val+'</div><div class="note">'+k.note+'</div></div>';}).join('');

    // callout
    var byRev=cur.rows.slice().sort(function(a,b){return b.rev_c-a.rev_c;})[0];
    var bySales=cur.rows.slice().sort(function(a,b){return b.sales-a.sales;})[0];
    var perLead=cur.rows.filter(function(r){return r.leads>=30;}).sort(function(a,b){return b.rev_lead-a.rev_lead;})[0];
    var co='';
    if(byRev&&byRev.rev_c>0) co+='<b>Most revenue:</b> “'+esc(byRev.ad)+'” — '+money(byRev.rev_c)+' confirmed ('+money(byRev.rev_p)+' projected) from '+nf(byRev.leads)+' leads. ';
    if(perLead&&perLead.rev_lead>0) co+='<span class="pill"><b>Best revenue per lead at volume:</b> “'+esc(perLead.ad)+'” — '+money(perLead.rev_lead)+'/lead. </span>';
    else if(bySales&&bySales.sales>0) co+='<span class="pill"><b>Most sales:</b> “'+esc(bySales.ad)+'” — '+bySales.sales+' ('+bySales.sale_rate+'%). </span>';
    document.getElementById('adx-callout').innerHTML=co||'No ad activity in this date range.';

    drawWatch(cur); drawActiveTable(cur); drawBars(cur); drawTable(cur);
  }

  function rowByAd(cur){var m={};cur.rows.forEach(function(r){m[r.ad]=r;});return m;}

  function drawWatch(cur){
    var m=rowByAd(cur);
    var host=document.getElementById('adx-watch');
    var chips=watch.map(function(ad){
      var row=m[ad]; var everLeads=leadsAllByAd[ad]||0;
      var warn = everLeads===0;
      var cnt = row? (nf(row.leads)+' leads · '+row.sales+' sales') : (warn?'no match in GHL yet':'0 in range');
      return '<span class="adx-chip'+(warn?' warn':'')+'" title="'+esc(ad)+'">'+esc(ad)+' <span class="cnt">'+cnt+'</span>'
        +'<button data-rm="'+esc(ad)+'" aria-label="Remove">×</button></span>';
    }).join('');
    host.innerHTML = chips
      + '<span class="adx-addwrap"><input id="adx-addinput" list="adx-adlist" placeholder="Add exact Ad Creative name…"><button id="adx-addbtn">Add</button></span>'
      + '<button class="adx-linkbtn" id="adx-reset" title="Reset to config.json defaults">Reset</button>';
    host.querySelectorAll('button[data-rm]').forEach(function(b){b.onclick=function(){watch=watch.filter(function(x){return x!==b.dataset.rm;});saveWatch();render();};});
    var addIn=document.getElementById('adx-addinput'), addBtn=document.getElementById('adx-addbtn');
    function add(){var v=addIn.value.trim();if(v&&watch.indexOf(v)<0){watch.push(v);saveWatch();render();}}
    addBtn.onclick=add; addIn.onkeydown=function(e){if(e.key==='Enter')add();};
    document.getElementById('adx-reset').onclick=function(){watch=(DATA.activeAds||[]).slice();saveWatch();render();};
  }

  function drawActiveTable(cur){
    var m=rowByAd(cur);
    var body=document.getElementById('adx-activebody');
    var empty=document.getElementById('adx-active-empty');
    empty.hidden = watch.length>0;
    var rows=watch.map(function(ad){return m[ad]||{ad:ad,group:groupOf(ad),leads:0,va:0,t:0,appts:0,appt_rate:0,sales:0,rev_c:0,_none:true};});
    rows.sort(function(a,b){return b.rev_c-a.rev_c||b.sales-a.sales||b.leads-a.leads;});
    body.innerHTML=rows.map(function(r){
      return '<tr><td><span class="adx-name"><span class="adx-dot" style="background:'+GC[r.group]+'"></span>'+esc(r.ad)+'</span></td>'
        +'<td class="num">'+(r._none?'—':nf(r.leads))+'</td><td class="num">'+(r._none?'—':r.va)+'</td><td class="num">'+(r._none?'—':r.t)+'</td>'
        +'<td class="num">'+(r._none?'—':r.appts)+'</td><td class="num">'+(r._none?'—':r.appt_rate+'%')+'</td>'
        +'<td class="num">'+(r._none?'—':r.sales)+'</td><td class="num">'+(r._none?'—':(r.rev_c?money(r.rev_c):'$0'))+'</td></tr>';
    }).join('');
  }

  function metricVal(r){
    if(metric==='confrev')return r.rev_c; if(metric==='revlead')return r.rev_lead;
    if(metric==='sales')return r.sales; if(metric==='salerate')return r.sale_rate; return r.appt_rate; }
  function metricFmt(r){
    if(metric==='confrev'||metric==='revlead')return money(metricVal(r));
    if(metric==='sales')return nf(r.sales); return metricVal(r)+'%'; }
  function drawBars(cur){
    var list=cur.rows.filter(function(r){return (!activeOnly||watch.indexOf(r.ad)>=0)&&r.leads>=minLeads;});
    list.sort(function(a,b){return metricVal(b)-metricVal(a);});
    var max=Math.max.apply(null,[1].concat(list.map(metricVal)));
    var host=document.getElementById('adx-bars');
    document.getElementById('adx-bars-empty').hidden=list.length>0;
    host.innerHTML=list.map(function(r){
      var w=(metricVal(r)/max*100).toFixed(1);
      return '<div class="adx-bar" title="'+esc(r.ad)+' — '+r.appts+' appts, '+r.sales+' sales / '+nf(r.leads)+' leads">'
        +'<div class="nm"><span class="adx-dot" style="background:'+GC[r.group]+'"></span>'+esc(r.ad)+'</div>'
        +'<div class="track"><div class="fill" style="width:'+w+'%;background:'+GC[r.group]+'"></div></div>'
        +'<div class="rt">'+metricFmt(r)+' <small>('+nf(r.leads)+')</small></div></div>';
    }).join('');
  }

  function drawTable(cur){
    var list=cur.rows.filter(function(r){return (!search||r.ad.toLowerCase().indexOf(search)>=0)&&(!hideZero||r.appts>0);});
    list.sort(function(a,b){var x=a[sortK],y=b[sortK];if(typeof x==='string')return x.localeCompare(y)*sortDir;return (x-y)*sortDir;});
    var maxLeads=Math.max.apply(null,[1].concat(cur.rows.map(function(r){return r.leads;})));
    document.querySelectorAll('#adx-table thead th').forEach(function(th){th.classList.toggle('active',th.dataset.k===sortK);});
    var html=list.map(function(r){
      var mb=(r.leads/maxLeads*100).toFixed(1);
      var star=watch.indexOf(r.ad)>=0?'<span class="adx-star" title="Active ad">★</span>':'';
      return '<tr>'
        +'<td><span class="adx-name"><span class="adx-dot" style="background:'+GC[r.group]+'"></span>'+esc(r.ad)+star+'</span>'
          +'<span class="adx-minibar"><i style="width:'+mb+'%;background:'+GC[r.group]+'"></i></span></td>'
        +'<td class="num">'+nf(r.leads)+'</td><td class="num">'+r.va+'</td><td class="num">'+r.t+'</td>'
        +'<td class="num">'+r.appts+'</td><td class="num">'+r.appt_rate+'%</td><td class="num">'+r.showed+'</td>'
        +'<td class="num">'+r.sales+'</td><td class="num">'+r.sale_rate+'%</td><td class="num">'+r.close_rate+'%</td>'
        +'<td class="num">'+(r.rev_c?money(r.rev_c):'—')+'</td><td class="num">'+(r.rev_p?money(r.rev_p):'—')+'</td></tr>';
    }).join('');
    if(cur.unattributedSales>0 && !search && !hideZero){
      html+='<tr class="unattr"><td>(No Ad Creative — organic / referral)</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>'
        +'<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">'+cur.unattributedSales+'</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>';
    }
    document.getElementById('adx-tbody').innerHTML=html;
    document.getElementById('adx-foot').textContent='Showing '+list.length+' of '+cur.rows.length+' ad creatives in range. Total sales incl. unattributed: '+cur.totalSales
      +'. Appointment window covers VA + Turning 65 calendars. “Sale” = Appointment Status containing “Sale”.';
  }

  render();
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
