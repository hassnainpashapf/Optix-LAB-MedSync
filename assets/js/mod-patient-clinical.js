/* Patient clinical overview. Procedural 3D anatomy is illustrative, never a scan or a lesion detector. */
(function () {
  'use strict';
  var App = window.App;
  var names = { liver: 'Liver', lungs: 'Lungs', heart: 'Heart', kidneys: 'Kidneys', brain: 'Brain', pancreas: 'Pancreas', blood: 'Blood', joints: 'Bones & joints' };
  var rank = { untested: 0, normal: 1, warning: 2, critical: 3 };
  var colors = { untested: [139, 157, 181], normal: [26, 170, 174], warning: [226, 145, 49], critical: [223, 73, 91] };
  function esc(v) { return App.esc(v == null ? '' : String(v)); }
  function date(v) { return v ? esc(App.dt ? App.dt(v) : v) : 'Not recorded'; }
  function canView() { try { var session = JSON.parse(localStorage.getItem('labpos_session') || 'null'); return !!(session && session.role && App.aiInsights && App.aiInsights.canAccess(session.role)); } catch (e) { return false; } }
  function bestOrgan(organs) {
    return organs.slice().sort(function (a, b) { return (rank[b.status] || 0) - (rank[a.status] || 0); })[0] || null;
  }
  function reportFor(patient, invoices, results, reportId) {
    var reports = invoices.filter(function (i) { return i.patientId === patient.id; }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    var available = reports.filter(function (i) { return results.some(function (r) { return r.invoiceId === i.id && r.status === 'ready'; }); });
    var inv = available.filter(function (i) { return i.id === reportId; })[0] || available[0] || null;
    // Each report is evaluated independently. Never combine old and new results into a synthetic report.
    var byTest = {};
    if (inv) results.filter(function (r) { return r.invoiceId === inv.id && r.status === 'ready'; }).sort(function (a, b) { return String(a.reportedAt || a.updatedAt || '').localeCompare(String(b.reportedAt || b.updatedAt || '')); }).forEach(function (r) { byTest[r.testId] = r; });
    var groups = Object.keys(byTest).map(function (id) { return { test: DB.get('tests', id), res: byTest[id] }; });
    var data = { pt: patient, inv: inv || {}, groups: groups };
    var AI = App.aiInsights;
    var organs = inv ? AI.evaluateOrganMap(data, AI.extractFindings(data)) : [];
    return { patient: patient, reports: reports, available: available, inv: inv, data: data, organs: organs, selected: bestOrgan(organs) };
  }
  function badge(o) { return o.status === 'untested' ? 'No related markers' : o.status === 'normal' ? 'Markers within rules' : o.status === 'critical' ? 'Critical marker flag' : 'Raised / abnormal markers'; }
  var css = '<style>' +
    '.pc-overview{margin:20px 0;background:#f7f9fc;border:1px solid #e1e8f1;border-radius:24px;padding:22px;color:#1b2a4a}.pc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}.pc-head h2{margin:0;font-size:22px}.pc-muted{color:#738299;font-size:12px;line-height:1.6}.pc-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:20px}.pc-card{background:white;border:1px solid #e4eaf2;border-radius:18px;padding:18px;margin-bottom:14px}.pc-card h3{margin:0 0 12px;font-size:15px}.pc-facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pc-facts dt{font-size:11px;color:#738299}.pc-facts dd{margin:4px 0 0;font-size:13px;overflow-wrap:anywhere}.pc-stage{background:radial-gradient(ellipse at 50% 50%,#e5f4f7,#f8fafc 70%);position:relative;border-radius:20px;border:1px solid #e3ebf2;overflow:hidden}.pc-stage canvas{display:block;width:100%;height:510px;touch-action:none;cursor:grab}.pc-stage canvas:active{cursor:grabbing}.pc-toolbar{position:absolute;top:12px;right:12px;display:flex;gap:6px}.pc-toolbar button,.pc-organs button{border:1px solid #dce4f0;border-radius:12px;background:#fff;color:#1b2a4a;cursor:pointer;padding:9px 12px;font:inherit}.pc-organs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:12px 0}.pc-organs button{font-size:12px;padding:10px 5px;white-space:normal}.pc-organs button[aria-pressed=true]{background:#2f6df6;color:white;border-color:#2f6df6}.pc-overview button:focus-visible,.pc-overview select:focus-visible{outline:3px solid #8eafff;outline-offset:2px}.pc-status{display:inline-block;border-radius:99px;padding:5px 9px;font-size:11px;background:#e9eff7}.pc-status.warning{background:#fff0d8;color:#935300}.pc-status.critical{background:#ffe4e9;color:#a3203b}.pc-marker{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f6;font-size:13px}.pc-marker:last-child{border:0}.pc-marker small{display:block;color:#738299;margin-top:3px}.pc-marker strong{white-space:nowrap}.pc-history{padding:10px 0;border-bottom:1px solid #edf1f7;font-size:12px;display:flex;justify-content:space-between;gap:10px}.pc-select{padding:10px;border:1px solid #dce4ee;border-radius:10px;background:#fff;max-width:100%}.pc-note{background:#edf3fd;border-radius:12px;padding:12px;font-size:12px;line-height:1.6;color:#52667f}.pc-empty{padding:24px;text-align:center;color:#738299}.pc-report-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:900px){.pc-layout{grid-template-columns:1fr}.pc-overview{padding:14px}.pc-stage canvas{height:430px}}@media(max-width:460px){.pc-organs{grid-template-columns:repeat(2,minmax(0,1fr))}.pc-facts{grid-template-columns:1fr 1fr}.pc-head h2{font-size:19px}}' + '.pc-overview{background:#f8fafb;border:0;border-radius:24px;padding:22px}.pc-head{margin-bottom:24px}.pc-head h2{font-size:23px;color:#172b45}.pc-layout{grid-template-columns:minmax(0,1.2fr) minmax(330px,1fr);gap:24px}.pc-card{border-color:#e9edf2;border-radius:20px;box-shadow:none;padding:18px}.pc-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.pc-card-top h3{margin:0}.pc-dates{display:flex;gap:12px;padding:4px 0 18px;overflow-x:auto}.pc-dates button{border:0;background:transparent;border-radius:20px;min-width:46px;padding:9px 8px;color:#344762;cursor:pointer}.pc-dates button[aria-pressed=true]{background:#eaf2ff;color:#2f6df6}.pc-dates strong,.pc-dates small{display:block}.pc-dates strong{font-size:15px}.pc-dates small{font-size:11px;margin-top:8px}.pc-pattern-body{display:grid;grid-template-columns:110px 1fr;gap:20px;align-items:center}.pc-ring{background:conic-gradient(#3880ee var(--pc-angle),#edf3fa 0);width:104px;height:104px;border-radius:50%;padding:9px}.pc-ring>div{height:100%;background:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column}.pc-ring strong{font-size:24px}.pc-ring small{font-size:10px;color:#8290a1}.pc-pattern-facts{display:flex;gap:24px;margin-top:12px}.pc-pattern-facts strong,.pc-pattern-facts small{display:block}.pc-pattern-facts strong{font-size:16px}.pc-pattern-facts small{font-size:10px;color:#7c8b9e;margin-top:4px}.pc-lower{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}.pc-lower>.pc-card{margin-bottom:0;min-width:0}.pc-marker strong{white-space:normal;overflow-wrap:anywhere;text-align:right;font-size:12px}.pc-care{grid-row:span 2}.pc-facts{grid-template-columns:1fr}.pc-note{background:#f5f8fc;font-size:11px}.pc-stage{background:radial-gradient(ellipse at 50% 45%,#edf8fa 0,transparent 66%);border:0;overflow:visible;min-height:500px}.pc-stage canvas{height:520px}.pc-toolbar{top:10px;right:0;flex-wrap:wrap;max-width:100%;z-index:2}.pc-toolbar button{font-size:11px;border:0;box-shadow:0 3px 15px rgba(32,56,87,.04)}.pc-toolbar button[aria-pressed=true]{color:#2f6df6;background:#eaf2ff}.pc-float{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);width:82%;max-width:300px;background:#fff;border:1px solid #eef1f5;border-radius:18px;box-shadow:0 8px 26px rgba(33,67,96,.08);padding:14px 16px;pointer-events:none}.pc-float strong{display:block;font-size:13px;margin-bottom:4px}.pc-float p{margin:0;font-size:11px;color:#687a92;line-height:1.5}.pc-organ-row{display:flex;gap:10px;align-items:center;margin-top:16px}.pc-carousel-arrow{border:0;background:transparent;font-size:26px;color:#456079;padding:8px;cursor:pointer}.pc-organs{position:relative;display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;scrollbar-width:thin;margin:0;padding:8px 1px 12px;flex:1}.pc-organs button{flex:0 0 96px;border:1px solid transparent;border-radius:18px;background:#fff;color:#496078;scroll-snap-align:center;min-height:102px;box-shadow:0 4px 18px rgba(40,67,93,.03);display:flex;flex-direction:column;align-items:center;gap:6px}.pc-organs svg{width:54px;height:54px}.pc-organs button[aria-pressed=true]{background:#fff;color:#1b2a4a;border-color:#95b5d7;box-shadow:0 3px 15px rgba(42,97,167,.09);font-weight:700}.pc-model-info{font-size:11px;color:#718096;margin:12px 0}.pc-model-info summary{cursor:pointer}.pc-report-actions{justify-content:center}@media(max-width:1000px){.pc-layout{grid-template-columns:1fr}.pc-stage canvas{height:460px}.pc-facts{grid-template-columns:1fr 1fr}}@media(max-width:540px){.pc-lower{grid-template-columns:1fr}.pc-pattern-body{grid-template-columns:80px 1fr;gap:12px}.pc-ring{height:78px;width:78px;padding:7px}.pc-ring strong{font-size:20px}.pc-pattern-facts{gap:14px}.pc-overview{padding:12px}.pc-head h2{font-size:19px}.pc-stage canvas{height:440px}.pc-organs button{flex-basis:86px}}' + '</style>';
  function detailHtml(model, organ) {
    if (!organ) return '<h3>No report analysis yet</h3><p class="pc-muted">Save a patient report with ready results to populate the organ overview.</p>';
    var markers = organ.markers || [];
    return '<h3>' + esc(names[organ.id] || organ.name) + ' · Report findings</h3><span class="pc-status ' + esc(organ.status) + '">' + esc(badge(organ)) + '</span>' +
      (markers.length ? markers.map(function (m) { return '<div class="pc-marker"><span>' + esc(m.name) + '<small>' + esc(m.status || 'Recorded') + '</small></span><strong>' + esc(m.val) + '</strong></div>'; }).join('') : '<p class="pc-muted">This report has no markers mapped to this organ.</p>') +
      '<p class="pc-muted">Report-linked organ findings. Review alongside the patient’s clinical history.</p>';
  }

  function reportOverview(model) {
    var tested = model.organs.filter(function(o){return o.tested;}).length;
    var flagged = model.organs.filter(function(o){return o.status==='warning'||o.status==='critical';}).length;
    var angle = tested ? Math.round(flagged/tested*360) : 0;
    return '<article class="pc-card pc-patterns"><div class="pc-card-top"><h3>Report Patterns Overview</h3><span class="pc-muted">'+(model.inv?date(model.inv.createdAt):'No report selected')+'</span></div><div class="pc-dates">'+model.available.slice(0,7).map(function(i){var d=new Date(i.createdAt);var valid=!isNaN(d.getTime());return '<button type="button" data-pc-date="'+esc(i.id)+'" aria-pressed="'+(model.inv&&i.id===model.inv.id?'true':'false')+'"><strong>'+esc(valid?d.getDate():i.no||i.id)+'</strong><small>'+esc(valid?d.toLocaleDateString('en',{weekday:'short'}):'Report')+'</small></button>';}).join('')+'</div><div class="pc-pattern-body"><div class="pc-ring" style="--pc-angle:'+angle+'deg"><div><strong>'+flagged+'</strong><small>Flagged groups</small></div></div><div><h3>Current report overview</h3><p class="pc-muted">'+tested+' organ group(s) have related markers in this report. Colors follow those recorded markers.</p><div class="pc-pattern-facts"><span><strong>'+model.available.length+'</strong><small>Ready reports</small></span><span><strong>'+model.data.groups.length+'</strong><small>Result panels</small></span><span><strong>'+tested+'</strong><small>Assessed groups</small></span></div></div></div></article>';
  }
  function organThumb(id) {
    var paths={liver:'M6 24C6 11 19 8 33 13L55 23C57 28 45 32 36 29L26 44C17 47 7 38 6 24Z',lungs:'M24 12C12 10 7 26 9 44C10 52 23 49 26 39V18L30 14L34 18V39C37 49 50 52 51 44C53 26 48 10 36 12L32 8V2H28V8Z',heart:'M27 12C15 4 5 16 12 31L30 52L47 30C56 14 44 5 33 13L32 4H25Z',kidneys:'M16 10C4 8 3 43 15 46C25 48 27 36 21 30C16 26 27 15 16 10ZM44 10C56 8 57 43 45 46C35 48 33 36 39 30C44 26 33 15 44 10Z',brain:'M29 10C18 0 9 13 13 19C3 22 7 35 12 36C11 48 27 51 29 43ZM32 10C43 0 52 13 48 19C58 22 54 35 49 36C50 48 34 51 32 43Z',pancreas:'M7 32C2 20 14 18 20 22L45 16C56 13 58 25 49 29L23 35C17 47 10 44 7 32Z',blood:'M30 5C24 19 13 27 13 36C13 58 47 58 47 36C47 27 36 19 30 5Z',joints:'M19 4C5 0 6 15 15 20L26 40C19 48 28 56 34 48C43 53 51 41 40 37L29 17C33 6 24 0 19 4Z'};
    return '<svg aria-hidden="true" viewBox="0 0 60 60"><path fill="#2aadb4" stroke="#187e97" stroke-width="1" d="'+(paths[id]||paths.liver)+'"/><path d="M30 15L30 43M30 25L20 30M30 32L40 38" fill="none" stroke="#b4eff2" stroke-width="1.5" opacity=".65"/></svg>';
  }

  // A shaded triangle mesh rendered in true 3D, with depth sorting, rotation and perspective projection.
  function anatomy(id) {
    var parts = [];
    function lobe(cx, cy, cz, rx, ry, rz, tilt, kind) {
      var vertices = [], faces = [], rows = 20, cols = 32;
      for (var i = 0; i <= rows; i++) for (var j = 0; j <= cols; j++) {
        var phi = Math.PI * i / rows, theta = 2 * Math.PI * j / cols;
        var x = Math.sin(phi) * Math.cos(theta), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(theta);
        if (kind === 'kidney') x *= 1 - .32 * Math.exp(-8 * y * y) * (x > 0 ? 1 : 0);
        if (kind === 'liver') { y += .20 * x + .10 * Math.sin(theta) * Math.sin(phi); z *= .9 + .14 * x; }
        if (kind === 'brain') { var fold = 1 + .035 * Math.sin(theta * 9 + phi * 5) * Math.sin(phi * 12); x *= fold; y *= fold; z *= fold; }
        var sx = x * rx, sy = y * ry;
        vertices.push([cx + sx * Math.cos(tilt) - sy * Math.sin(tilt), cy + sx * Math.sin(tilt) + sy * Math.cos(tilt), cz + z * rz]);
      }
      for (var a = 0; a < rows; a++) for (var b = 0; b < cols; b++) { var k = a * (cols + 1) + b; faces.push([k, k + 1, k + cols + 1], [k + 1, k + cols + 2, k + cols + 1]); }
      parts.push({ vertices: vertices, faces: faces });
    }
    if (id === 'envelope') { lobe(0,0,0,1,1,1,0); }
    else if (id === 'liver') { lobe(-.24,0,0,1.18,.67,.56,-.12,'liver'); lobe(.82,-.07,0,.58,.39,.40,.17,'liver'); }
    else if (id === 'lungs') { lobe(-.68,0,0,.55,1.07,.46,-.13); lobe(.68,0,0,.55,1.07,.46,.13); lobe(0,.92,-.12,.12,.55,.12,0); }
    else if (id === 'kidneys') { lobe(-.64,0,0,.43,.76,.35,-.16,'kidney'); lobe(.64,0,0,.43,.76,.35,.16,'kidney'); }
    else if (id === 'heart') { lobe(-.25,.15,0,.59,.78,.5,-.38); lobe(.29,.24,0,.55,.62,.48,.18); lobe(.12,.8,-.13,.18,.44,.18,-.22); }
    else if (id === 'brain') { lobe(-.45,0,0,.51,.73,.65,0,'brain'); lobe(.45,0,0,.51,.73,.65,0,'brain'); }
    else if (id === 'pancreas') { lobe(0,0,0,1.15,.29,.31,.14); lobe(-.89,-.12,0,.36,.42,.32,0); }
    else if (id === 'blood') { for (var c=0;c<7;c++) lobe(Math.cos(c*2.4)*.8,Math.sin(c*2.4)*.7,(c%3-1)*.32,.34,.15,.34,.4); }
    else { lobe(0,0,0,.22,.83,.23,0); [-1,1].forEach(function (side) { lobe(0,side*.79,0,.42,.30,.29,0); }); }
    return parts;
  }
  function fullBody(organs) {
    var pieces = [], states = {};
    (organs || []).forEach(function (o) { states[o.id] = o.status; });
    function add(id, location, size, skin) {
      anatomy(id).forEach(function (part) {
        pieces.push({ vertices: part.vertices.map(function (v) { return [location[0]+v[0]*size[0],location[1]+v[1]*size[1],location[2]+v[2]*size[2]]; }), faces: part.faces,
          tint: skin ? [141,165,191] : (colors[states[id]] || colors.untested), alpha: skin ? .13 : .95, organ: skin ? null : id });
      });
    }
    // Transparent anatomical envelope keeps the internal report-linked organs visible.
    add('envelope',[0,2.20,0],[.40,.52,.36],true);
    add('envelope',[0,1.62,-.08],[.17,.25,.17],true);
    add('envelope',[0,.64,-.18],[.69,1.10,.39],true);
    add('envelope',[0,-.68,-.10],[.49,.44,.34],true);
    [-1,1].forEach(function (side) {
      add('envelope',[side*.80,.67,-.05],[.17,.68,.17],true);
      add('envelope',[side*.97,-.53,.06],[.13,.59,.14],true);
      add('envelope',[side*1.00,-1.20,.11],[.14,.26,.12],true);
      add('envelope',[side*.29,-1.64,-.10],[.21,.83,.22],true);
      add('envelope',[side*.29,-2.87,-.06],[.15,.60,.16],true);
      add('envelope',[side*.29,-3.45,.18],[.16,.14,.32],true);
    });
    add('brain',[0,2.20,.12],[.31,.37,.30]);
    add('lungs',[0,1.02,.28],[.45,.52,.35]);
    add('heart',[.12,.98,.59],[.29,.32,.26]);
    add('liver',[-.34,.25,.43],[.43,.47,.34]);
    add('pancreas',[.08,-.08,.54],[.33,.31,.25]);
    add('kidneys',[0,-.15,.08],[.47,.43,.29]);
    if (states.joints === 'warning' || states.joints === 'critical') {
      [-1,1].forEach(function(side){ add('joints',[side*.35,-2.05,.22],[.27,.63,.28]); add('joints',[side*.91,.15,.23],[.16,.8,.22]); });
    }
    // Blood markers are systemic. Show an off-body legend rather than a falsely localized lesion.
    if (states.blood === 'warning' || states.blood === 'critical') add('blood',[1.7,.38,.2],[.28,.35,.3]);
    return pieces;
  }
  function viewer(canvas, organ, organs) {
    var ctx = canvas.getContext('2d');
    if (!ctx) { canvas.replaceWith(document.createTextNode('3D canvas is unavailable. Report findings remain below.')); return { set: function () {}, zoom: function () {}, reset: function () {}, mode: function () {} }; }
    var mesh, tint, mode = 'body', currentOrgan = organ, yaw = -.12, pitch = 0, zoom = 1, drag = null;
    function rotate(v) { var x=v[0]*Math.cos(yaw)+v[2]*Math.sin(yaw), z=-v[0]*Math.sin(yaw)+v[2]*Math.cos(yaw); return [x,v[1]*Math.cos(pitch)-z*Math.sin(pitch),v[1]*Math.sin(pitch)+z*Math.cos(pitch)]; }
    function draw() {
      if (!canvas.isConnected) return;
      var w=canvas.clientWidth||440,h=canvas.clientHeight||360,dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      var scale=Math.min(w,h)*(mode==='body'?.14:.34)*zoom, tris=[];
      mesh.forEach(function (part) { var verts=part.vertices.map(rotate); part.faces.forEach(function (f) {
        var a=verts[f[0]],b=verts[f[1]],c=verts[f[2]],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
        var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(n[0],n[1],n[2]);
        if (len<.00001) return;
        var light=.38+.62*Math.abs((n[0]*-.35+n[1]*.55+n[2]*.76)/len);
        tris.push({ points:[a,b,c].map(function(p){var perspective=4/(4-p[2]);return [w/2+p[0]*scale*perspective,h/2-(p[1]+(mode==='body'?.38:0))*scale*perspective];}),depth:(a[2]+b[2]+c[2])/3,light:light,tint:part.tint||tint,alpha:part.alpha==null?1:part.alpha });
      }); });
      tris.sort(function(a,b){return a.depth-b.depth;}).forEach(function(t){ctx.beginPath();t.points.forEach(function(p,i){if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.closePath();ctx.globalAlpha=t.alpha;ctx.fillStyle='rgb('+t.tint.map(function(c){return Math.round(c*t.light);}).join(',')+')';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=.35;ctx.stroke();});ctx.globalAlpha=1;
      if(mode==='body' && (organs||[]).some(function(o){return o.id==='blood'&&(o.status==='warning'||o.status==='critical');})){ctx.fillStyle='#59718e';ctx.font='11px Arial';ctx.fillText('Blood: systemic flag',w*.70,h*.48);}
    }
    function set(o) { currentOrgan=o;mesh=mode==='body'?fullBody(organs):anatomy(o ? o.id : 'liver');tint=colors[o ? o.status : 'untested']||colors.untested;draw(); }
    canvas.addEventListener('pointerdown',function(e){drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',function(e){if(!drag)return;yaw+=(e.clientX-drag[0])*.012;pitch=Math.max(-1.3,Math.min(1.3,pitch+(e.clientY-drag[1])*.012));drag=[e.clientX,e.clientY];draw();});
    canvas.addEventListener('pointerup',function(){drag=null;});canvas.addEventListener('pointercancel',function(){drag=null;});
    canvas.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;e.preventDefault();yaw+=e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0;pitch+=e.key==='ArrowUp'?.15:e.key==='ArrowDown'?-.15:0;draw();});
    var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(!canvas.isConnected){observer.disconnect();return;}draw();}):null;if(observer)observer.observe(canvas);
    set(organ);
    return { set:set, mode:function(value){mode=value;yaw=value==='body'?-.12:-.28;pitch=0;zoom=1;set(currentOrgan);}, zoom:function(delta){zoom=Math.max(.6,Math.min(1.8,zoom+delta));draw();},reset:function(){yaw=mode==='body'?-.12:-.28;pitch=0;zoom=1;draw();} };
  }
  function mount(host, patient, reportId) {
    if (!host || !host.isConnected) return;
    if (!canView()) { host.innerHTML='';return; }
    var model=reportFor(patient,DB.all('invoices')||[],DB.all('results')||[],reportId),selected=model.selected;
    var facts=[['Patient',patient.name],['Age / sex',(patient.age==null?'Not recorded':patient.age+' years')+' / '+(patient.gender||patient.sex||'Not recorded')],['Patient ID',patient.id],['Blood group',patient.blood],['Contact',patient.phone],['Referring doctor',(DB.get('doctors',patient.doctorId)||{}).name]];
    var factHtml=facts.map(function(f){return '<div><dt>'+esc(f[0])+'</dt><dd>'+esc(f[1]||'Not recorded')+'</dd></div>';}).join('');
    var reportOptions=model.available.length?model.available.map(function(i){return '<option value="'+esc(i.id)+'"'+(model.inv&&i.id===model.inv.id?' selected':'')+'>'+esc(i.no||i.id)+' · '+date(i.createdAt)+'</option>';}).join(''):'<option>No ready reports</option>';
    var history=model.reports.length?model.reports.map(function(i){return '<div class="pc-history"><a href="#/invoice/'+encodeURIComponent(i.id)+'">'+esc(i.no||i.id)+'</a><span>'+date(i.createdAt)+'</span></div>';}).join(''):'<p class="pc-muted">No visits recorded.</p>';
    host.innerHTML=css+'<section class="pc-overview" aria-label="Patient clinical overview">'+
      '<div class="pc-head"><div><h2>'+esc(patient.name)+' · Patient Overview</h2><div class="pc-muted">Recorded patient information, report patterns and organ findings.</div></div><label><span class="pc-muted">Report </span><select class="pc-select" data-pc-report aria-label="Select patient report">'+reportOptions+'</select></label></div>'+
      '<div class="pc-layout"><div>'+reportOverview(model)+'<div class="pc-lower">'+
      '<article class="pc-card pc-care"><h3>Patient &amp; Care Details</h3><dl class="pc-facts">'+factHtml+'</dl><h3 style="margin-top:22px">Recorded care notes</h3><p class="pc-muted">'+esc(patient.notes||'No care plan or clinical notes recorded yet.')+'</p></article>'+
      '<article class="pc-card" data-pc-detail>'+detailHtml(model,selected)+'</article>'+
      '<article class="pc-card"><h3>Report timeline</h3>'+history+'</article></div></div>'+
      '<div class="pc-visual"><div class="pc-stage"><div class="pc-toolbar">'+
      '<button type="button" data-pc-mode="body" aria-pressed="true">Full body</button><button type="button" data-pc-mode="organ" aria-pressed="false">Organ</button><button type="button" data-pc-zoom="in" aria-label="Zoom in">+</button><button type="button" data-pc-zoom="out" aria-label="Zoom out">−</button><button type="button" data-pc-reset>Reset</button></div>'+
      '<canvas tabindex="0" aria-label="Rotate illustrative 3D full body using arrow keys or drag">Illustrative 3D body and organ view</canvas>'+
      '<div class="pc-float" data-pc-callout><strong>'+esc(selected?names[selected.id]:'Organ overview')+'</strong><p>'+esc(selected?badge(selected):'Save ready results to see report flags.')+'</p></div></div>'+
      '<p class="pc-muted" style="text-align:center">Drag to rotate · Arrow keys · + / − to zoom</p>'+
      '<div class="pc-organ-row"><button type="button" class="pc-carousel-arrow" data-pc-scroll="previous" aria-label="Previous organs">‹</button><div class="pc-organs" aria-label="Select organ">'+model.organs.map(function(o){return '<button type="button" data-pc-organ="'+esc(o.id)+'" aria-pressed="'+(selected&&o.id===selected.id?'true':'false')+'">'+organThumb(o.id)+'<span>'+esc(names[o.id]||o.name)+'</span></button>';}).join('')+'</div><button type="button" class="pc-carousel-arrow" data-pc-scroll="next" aria-label="Next organs">›</button></div>'+
      '<details class="pc-model-info"><summary>How highlights work</summary><p>Amber: abnormal markers · Red: critical markers · Teal: mapped markers within rules · Gray: no related markers. This is an illustrative 3D model, not patient imaging or a confirmed diagnosis. Lab reports do not establish an exact lesion location.</p></details>'+
      (model.inv?'<div class="pc-report-actions"><button type="button" class="btn btn-primary" data-pc-analysis>Open full AI analysis</button><a class="btn btn-ghost" href="#/invoice/'+encodeURIComponent(model.inv.id)+'">Open report</a></div>':'')+'</div></div></section>';
    var canvas=host.querySelector('canvas'),scene=viewer(canvas,selected,model.organs);
    var rail=host.querySelector('.pc-organs');
    function centerOrgan(button){if(button)rail.scrollLeft=button.offsetLeft-(rail.clientWidth-button.offsetWidth)/2;}
    centerOrgan(host.querySelector('[data-pc-organ][aria-pressed="true"]'));
    host.querySelectorAll('[data-pc-organ]').forEach(function(b){b.addEventListener('click',function(){centerOrgan(b);selected=model.organs.filter(function(o){return o.id===b.getAttribute('data-pc-organ');})[0];scene.set(selected);host.querySelector('[data-pc-callout]').innerHTML='<strong>'+esc(names[selected.id])+'</strong><p>'+esc(badge(selected))+'</p>';host.querySelector('[data-pc-detail]').innerHTML=detailHtml(model,selected);host.querySelectorAll('[data-pc-organ]').forEach(function(other){other.setAttribute('aria-pressed',other===b?'true':'false');});canvas.setAttribute('aria-label','Illustrative 3D '+names[selected.id]+'. Drag or use arrow keys to rotate.');});});
    host.querySelectorAll('[data-pc-mode]').forEach(function(b){b.addEventListener('click',function(){scene.mode(b.getAttribute('data-pc-mode'));host.querySelectorAll('[data-pc-mode]').forEach(function(other){other.setAttribute('aria-pressed',other===b?'true':'false');});});});
    host.querySelectorAll('[data-pc-date]').forEach(function(b){b.addEventListener('click',function(){mount(host,patient,b.getAttribute('data-pc-date'));});});
    host.querySelectorAll('[data-pc-scroll]').forEach(function(b){b.addEventListener('click',function(){host.querySelector('.pc-organs').scrollBy({left:b.getAttribute('data-pc-scroll')==='next'?220:-220,behavior:'smooth'});});});
    host.querySelector('[data-pc-report]').addEventListener('change',function(e){mount(host,patient,e.target.value);});
    host.querySelectorAll('[data-pc-zoom]').forEach(function(b){b.addEventListener('click',function(){scene.zoom(b.getAttribute('data-pc-zoom')==='in'?.15:-.15);});});host.querySelector('[data-pc-reset]').addEventListener('click',scene.reset);
    var analysis=host.querySelector('[data-pc-analysis]');if(analysis)analysis.addEventListener('click',function(){App.aiInsights.showModal(model.inv.id,model.data);});
  }
  App.patientClinical={mount:mount,reportFor:reportFor,bestOrgan:bestOrgan,anatomy:anatomy,fullBody:fullBody};
})();
