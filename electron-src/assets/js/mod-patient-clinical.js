/* Patient clinical overview. Procedural 3D anatomy is illustrative, never a scan or a lesion detector. */
(function () {
  'use strict';
  var App = window.App;
  var names = { liver: 'Liver', lungs: 'Lungs', heart: 'Heart', kidneys: 'Kidneys', brain: 'Brain', pancreas: 'Pancreas', blood: 'Blood', joints: 'Bones & joints' };
  var rank = { untested: 0, normal: 1, warning: 2, critical: 3 };
  var colors = { untested: [139, 157, 181], normal: [26, 170, 174], warning: [226, 145, 49], critical: [223, 73, 91] };
  function esc(v) { return App.esc(v == null ? '' : String(v)); }
  function date(v) { return v ? esc(App.dt ? App.dt(v) : v) : 'Not recorded'; }
  function canView() { return App.aiInsights && App.aiInsights.canAccess(); }
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
    '.pc-overview{margin:20px 0;background:#f7f9fc;border:1px solid #e1e8f1;border-radius:24px;padding:22px;color:#1b2a4a}.pc-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}.pc-head h2{margin:0;font-size:22px}.pc-muted{color:#738299;font-size:12px;line-height:1.6}.pc-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:20px}.pc-card{background:white;border:1px solid #e4eaf2;border-radius:18px;padding:18px;margin-bottom:14px}.pc-card h3{margin:0 0 12px;font-size:15px}.pc-facts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.pc-facts dt{font-size:11px;color:#738299}.pc-facts dd{margin:4px 0 0;font-size:13px;overflow-wrap:anywhere}.pc-stage{background:radial-gradient(ellipse at 50% 50%,#e5f4f7,#f8fafc 70%);position:relative;border-radius:20px;border:1px solid #e3ebf2;overflow:hidden}.pc-stage canvas{display:block;width:100%;height:360px;touch-action:none;cursor:grab}.pc-stage canvas:active{cursor:grabbing}.pc-toolbar{position:absolute;top:12px;right:12px;display:flex;gap:6px}.pc-toolbar button,.pc-organs button{border:1px solid #dce4f0;border-radius:12px;background:#fff;color:#1b2a4a;cursor:pointer;padding:9px 12px;font:inherit}.pc-organs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:12px 0}.pc-organs button{font-size:12px;padding:10px 5px;white-space:normal}.pc-organs button[aria-pressed=true]{background:#2f6df6;color:white;border-color:#2f6df6}.pc-overview button:focus-visible,.pc-overview select:focus-visible{outline:3px solid #8eafff;outline-offset:2px}.pc-status{display:inline-block;border-radius:99px;padding:5px 9px;font-size:11px;background:#e9eff7}.pc-status.warning{background:#fff0d8;color:#935300}.pc-status.critical{background:#ffe4e9;color:#a3203b}.pc-marker{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f6;font-size:13px}.pc-marker:last-child{border:0}.pc-marker small{display:block;color:#738299;margin-top:3px}.pc-marker strong{white-space:nowrap}.pc-history{padding:10px 0;border-bottom:1px solid #edf1f7;font-size:12px;display:flex;justify-content:space-between;gap:10px}.pc-select{padding:10px;border:1px solid #dce4ee;border-radius:10px;background:#fff;max-width:100%}.pc-note{background:#edf3fd;border-radius:12px;padding:12px;font-size:12px;line-height:1.6;color:#52667f}.pc-empty{padding:24px;text-align:center;color:#738299}.pc-report-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:900px){.pc-layout{grid-template-columns:1fr}.pc-overview{padding:14px}.pc-stage canvas{height:320px}}@media(max-width:460px){.pc-organs{grid-template-columns:repeat(2,minmax(0,1fr))}.pc-facts{grid-template-columns:1fr 1fr}.pc-head h2{font-size:19px}}' + '</style>';
  function detailHtml(model, organ) {
    if (!organ) return '<h3>No report analysis yet</h3><p class="pc-muted">Save a patient report with ready results to populate the organ overview.</p>';
    var markers = organ.markers || [];
    return '<h3>' + esc(names[organ.id] || organ.name) + ' · Report findings</h3><span class="pc-status ' + esc(organ.status) + '">' + esc(badge(organ)) + '</span>' +
      (markers.length ? markers.map(function (m) { return '<div class="pc-marker"><span>' + esc(m.name) + '<small>' + esc(m.status || 'Recorded') + '</small></span><strong>' + esc(m.val) + '</strong></div>'; }).join('') : '<p class="pc-muted">This report has no markers mapped to this organ.</p>') +
      '<p class="pc-note">' + (organ.status === 'warning' || organ.status === 'critical' ? 'Highlighted: the whole organ associated with flagged markers. ' : '') + 'Exact affected location is not established by these lab results. This is an illustrative 3D model, not patient imaging or a confirmed diagnosis.</p>';
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
    if (id === 'liver') { lobe(-.24,0,0,1.18,.67,.56,-.12,'liver'); lobe(.82,-.07,0,.58,.39,.40,.17,'liver'); }
    else if (id === 'lungs') { lobe(-.68,0,0,.55,1.07,.46,-.13); lobe(.68,0,0,.55,1.07,.46,.13); lobe(0,.92,-.12,.12,.55,.12,0); }
    else if (id === 'kidneys') { lobe(-.64,0,0,.43,.76,.35,-.16,'kidney'); lobe(.64,0,0,.43,.76,.35,.16,'kidney'); }
    else if (id === 'heart') { lobe(-.25,.15,0,.59,.78,.5,-.38); lobe(.29,.24,0,.55,.62,.48,.18); lobe(.12,.8,-.13,.18,.44,.18,-.22); }
    else if (id === 'brain') { lobe(-.45,0,0,.51,.73,.65,0,'brain'); lobe(.45,0,0,.51,.73,.65,0,'brain'); }
    else if (id === 'pancreas') { lobe(0,0,0,1.15,.29,.31,.14); lobe(-.89,-.12,0,.36,.42,.32,0); }
    else if (id === 'blood') { for (var c=0;c<7;c++) lobe(Math.cos(c*2.4)*.8,Math.sin(c*2.4)*.7,(c%3-1)*.32,.34,.15,.34,.4); }
    else { lobe(0,0,0,.22,.83,.23,0); [-1,1].forEach(function (side) { lobe(0,side*.79,0,.42,.30,.29,0); }); }
    return parts;
  }
  function viewer(canvas, organ) {
    var ctx = canvas.getContext('2d');
    if (!ctx) { canvas.replaceWith(document.createTextNode('3D canvas is unavailable. Report findings remain below.')); return { set: function () {} }; }
    var mesh, tint, yaw = -.28, pitch = .12, zoom = 1, drag = null;
    function rotate(v) { var x=v[0]*Math.cos(yaw)+v[2]*Math.sin(yaw), z=-v[0]*Math.sin(yaw)+v[2]*Math.cos(yaw); return [x,v[1]*Math.cos(pitch)-z*Math.sin(pitch),v[1]*Math.sin(pitch)+z*Math.cos(pitch)]; }
    function draw() {
      if (!canvas.isConnected) return;
      var w=canvas.clientWidth||440,h=canvas.clientHeight||360,dpr=Math.min(window.devicePixelRatio||1,2);
      canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      var scale=Math.min(w,h)*.27*zoom, tris=[];
      mesh.forEach(function (part) { var verts=part.vertices.map(rotate); part.faces.forEach(function (f) {
        var a=verts[f[0]],b=verts[f[1]],c=verts[f[2]],u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
        var n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(n[0],n[1],n[2]);
        if (len<.00001) return;
        var light=.38+.62*Math.abs((n[0]*-.35+n[1]*.55+n[2]*.76)/len);
        tris.push({ points:[a,b,c].map(function(p){var perspective=4/(4-p[2]);return [w/2+p[0]*scale*perspective,h/2-p[1]*scale*perspective];}),depth:(a[2]+b[2]+c[2])/3,light:light });
      }); });
      tris.sort(function(a,b){return a.depth-b.depth;}).forEach(function(t){ctx.beginPath();t.points.forEach(function(p,i){if(i===0)ctx.moveTo(p[0],p[1]);else ctx.lineTo(p[0],p[1]);});ctx.closePath();ctx.fillStyle='rgb('+tint.map(function(c){return Math.round(c*t.light);}).join(',')+')';ctx.fill();ctx.strokeStyle='rgba(255,255,255,.09)';ctx.lineWidth=.35;ctx.stroke();});
    }
    function set(o) { mesh=anatomy(o ? o.id : 'liver');tint=colors[o ? o.status : 'untested']||colors.untested;draw(); }
    canvas.addEventListener('pointerdown',function(e){drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',function(e){if(!drag)return;yaw+=(e.clientX-drag[0])*.012;pitch=Math.max(-1.3,Math.min(1.3,pitch+(e.clientY-drag[1])*.012));drag=[e.clientX,e.clientY];draw();});
    canvas.addEventListener('pointerup',function(){drag=null;});canvas.addEventListener('pointercancel',function(){drag=null;});
    canvas.addEventListener('keydown',function(e){if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(e.key)<0)return;e.preventDefault();yaw+=e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0;pitch+=e.key==='ArrowUp'?.15:e.key==='ArrowDown'?-.15:0;draw();});
    var observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(function(){if(!canvas.isConnected){observer.disconnect();return;}draw();}):null;if(observer)observer.observe(canvas);
    set(organ);
    return { set:set, zoom:function(delta){zoom=Math.max(.6,Math.min(1.8,zoom+delta));draw();},reset:function(){yaw=-.28;pitch=.12;zoom=1;draw();} };
  }
  function mount(host, patient, reportId) {
    if (!host || !host.isConnected) return;
    if (!canView()) { host.innerHTML='';return; }
    var model=reportFor(patient,DB.all('invoices')||[],DB.all('results')||[],reportId),selected=model.selected;
    var facts=[['Patient',patient.name],['Age / sex',(patient.age==null?'Not recorded':patient.age+' years')+' / '+(patient.gender||patient.sex||'Not recorded')],['Patient ID',patient.id],['Blood group',patient.blood],['Contact',patient.phone],['Referring doctor',(DB.get('doctors',patient.doctorId)||{}).name]];
    host.innerHTML=css+'<section class="pc-overview" aria-label="Patient clinical overview"><div class="pc-head"><div><h2>'+esc(patient.name)+' · Clinical Overview</h2><div class="pc-muted">Patient details, report history and interactive organ findings</div></div><label><span class="pc-muted">Report </span><select class="pc-select" data-pc-report aria-label="Select patient report">'+(model.available.length?model.available.map(function(i){return '<option value="'+esc(i.id)+'"'+(model.inv&&i.id===model.inv.id?' selected':'')+'>'+esc(i.no||i.id)+' · '+date(i.createdAt)+'</option>';}).join(''):'<option>No ready reports</option>')+'</select></label></div><div class="pc-layout"><div><article class="pc-card"><h3>Patient details</h3><dl class="pc-facts">'+facts.map(function(f){return '<div><dt>'+esc(f[0])+'</dt><dd>'+esc(f[1]||'Not recorded')+'</dd></div>';}).join('')+'</dl>'+(patient.notes?'<p class="pc-note">Recorded notes: '+esc(patient.notes)+'</p>':'')+'</article><article class="pc-card" data-pc-detail>'+detailHtml(model,selected)+'</article><article class="pc-card"><h3>Report history</h3>'+ (model.reports.length?model.reports.map(function(i){return '<div class="pc-history"><a href="#/invoice/'+encodeURIComponent(i.id)+'">'+esc(i.no||i.id)+'</a><span>'+date(i.createdAt)+'</span></div>';}).join(''):'<p class="pc-muted">No visits recorded.</p>')+'</article></div><div><div class="pc-stage"><div class="pc-toolbar"><button type="button" data-pc-zoom="in" aria-label="Zoom in">+</button><button type="button" data-pc-zoom="out" aria-label="Zoom out">−</button><button type="button" data-pc-reset>Reset</button></div><canvas tabindex="0" aria-label="Rotate illustrative 3D organ using arrow keys or drag">Illustrative 3D organ view</canvas></div><p class="pc-muted" style="text-align:center">Drag or use arrow keys to rotate · + / − to zoom</p><div class="pc-organs" aria-label="Select organ">'+model.organs.map(function(o){return '<button type="button" data-pc-organ="'+esc(o.id)+'" aria-pressed="'+(selected&&o.id===selected.id?'true':'false')+'">'+esc(names[o.id]||o.name)+'</button>';}).join('')+'</div><p class="pc-note">'+(selected?'Automatically selected: '+esc(names[selected.id]||selected.name)+'. Most flagged organ in the selected report.':'No ready results: neutral anatomy illustration.')+'<br>Teal: mapped markers within rules · Amber: abnormal flag · Red: critical flag · Gray: no related markers.<br>These colors describe report rules, not tissue damage.</p>'+(model.inv?'<div class="pc-report-actions"><button type="button" class="btn btn-primary" data-pc-analysis>Open full AI analysis</button><a class="btn btn-ghost" href="#/invoice/'+encodeURIComponent(model.inv.id)+'">Open report</a></div>':'')+'</div></div></section>';
    var canvas=host.querySelector('canvas'),scene=viewer(canvas,selected);
    host.querySelectorAll('[data-pc-organ]').forEach(function(b){b.addEventListener('click',function(){selected=model.organs.filter(function(o){return o.id===b.getAttribute('data-pc-organ');})[0];scene.set(selected);host.querySelector('[data-pc-detail]').innerHTML=detailHtml(model,selected);host.querySelectorAll('[data-pc-organ]').forEach(function(other){other.setAttribute('aria-pressed',other===b?'true':'false');});canvas.setAttribute('aria-label','Illustrative 3D '+names[selected.id]+'. Drag or use arrow keys to rotate.');});});
    host.querySelector('[data-pc-report]').addEventListener('change',function(e){mount(host,patient,e.target.value);});
    host.querySelectorAll('[data-pc-zoom]').forEach(function(b){b.addEventListener('click',function(){scene.zoom(b.getAttribute('data-pc-zoom')==='in'?.15:-.15);});});host.querySelector('[data-pc-reset]').addEventListener('click',scene.reset);
    var analysis=host.querySelector('[data-pc-analysis]');if(analysis)analysis.addEventListener('click',function(){App.aiInsights.showModal(model.inv.id,model.data);});
  }
  App.patientClinical={mount:mount,reportFor:reportFor,bestOrgan:bestOrgan,anatomy:anatomy};
})();
