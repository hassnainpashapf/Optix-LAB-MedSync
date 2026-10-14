/* The approved patient dashboard design, populated only from this patient's stored records. */
(function(){
  'use strict';
  var App=window.App;
  function esc(v){return App.esc(v==null?'':String(v));}
  function money(v){return esc(App.money?App.money(v):v);}
  function date(v){return v?esc(App.d?App.d(v):v):'Not recorded';}
  function model(patient){
    var invoices=(DB.all('invoices')||[]).filter(function(i){return i.patientId===patient.id;}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
    var ids=invoices.map(function(i){return i.id;});
    var ready=(DB.all('results')||[]).filter(function(r){return ids.indexOf(r.invoiceId)>=0&&r.status==='ready';});
    var latest=invoices.find(function(i){return ready.some(function(r){return r.invoiceId===i.id;});})||null;
    var rows=[],tests=[];
    invoices.forEach(function(i){(i.items||[]).forEach(function(t){tests.push({name:t.name||t.code||'Lab test',invoice:i});});});
    if(latest)ready.filter(function(r){return r.invoiceId===latest.id;}).forEach(function(r){var test=DB.get('tests',r.testId)||{};var vals=r.values||{};if((test.params||[]).length){test.params.forEach(function(p){var v=vals[p.id]!==undefined?vals[p.id]:vals[p.name];if(v!==undefined&&v!==null&&String(v).trim()!=='')rows.push({name:p.name||p.id,value:v,unit:p.unit||''});});}else Object.keys(vals).forEach(function(k){rows.push({name:k,value:vals[k],unit:''});});});
    var spent=invoices.reduce(function(n,i){return n+(Number(i.total)||0);},0),due=invoices.reduce(function(n,i){return n+(Number(i.due)||0);},0);
    return {invoices:invoices,ready:ready,latest:latest,rows:rows,tests:tests,spent:spent,due:due};
  }
  function render(patient,m){
    var doctor=(patient.doctorId&&DB.get('doctors',patient.doctorId)||{}).name||'Not recorded';
    var facts=[['Age / Gender',(patient.age==null?'Not recorded':patient.age+' years')+' / '+(patient.gender||'Not recorded')],['Patient ID',patient.id],['Phone',patient.phone],['Blood group',patient.blood],['Referring doctor',doctor],['Registered',patient.createdAt?date(patient.createdAt):'Not recorded']];
    var more=[['Father / guardian',patient.father],['Date of birth',patient.dob],['CNIC',patient.cnic],['WhatsApp',patient.whatsapp],['Email',patient.email],['Address',patient.address]];
    function factHTML(list){return '<dl class="pd-facts">'+list.map(function(f){return '<div><dt>'+esc(f[0])+'</dt><dd>'+esc(f[1]||'Not recorded')+'</dd></div>';}).join('')+'</dl>';}
    var initials=String(patient.name||'?').trim().split(/\s+/).slice(0,2).map(function(x){return x[0]||'';}).join('').toUpperCase();
    var paid=m.spent>0?Math.max(0,Math.min(100,Math.round((m.spent-m.due)/m.spent*100))):0;
    return '<div id="ptPatientDashboard"><main class="main"><div class="title"><h1>'+esc(patient.name)+' · Patient Overview</h1><p>Patient details, laboratory reports and visit history.</p></div><div class="columns"><section>'+ 
      '<article class="card"><div class="cardhead"><h2>Patient Details Overview</h2><span class="pd-name-icon">'+esc(initials)+'</span></div>'+factHTML(facts)+'<details class="pd-more"><summary>More patient details</summary>'+factHTML(more)+'</details><div class="overview" style="margin-top:18px"><div class="gauge"><svg viewBox="0 0 110 110"><circle class="base" cx="55" cy="55" r="43"/><circle fill="none" stroke="#4285ed" stroke-width="7" cx="55" cy="55" r="43"/></svg><div class="gauge-label"><b>'+m.invoices.length+'</b><span>Recorded visits</span></div></div><div class="trend"><h3>Patient report history</h3><p>Ready results are shown from this patient’s latest completed report.</p><div class="peaks"><div><b>Ready result panels</b><span>'+m.ready.length+'</span></div><div><b>Latest report</b><span>'+date(m.latest&&m.latest.createdAt)+'</span></div></div></div></div></article>'+ 
      '<div class="lower"><article class="card plan"><h2>Tests &amp; Visits</h2><div class="sub">'+m.tests.length+' test(s) ordered for this patient</div><ol class="plan-items">'+(m.tests.length?m.tests.map(function(t,i){return '<li><span class="num">'+(i+1)+'</span><div><strong>'+esc(t.name)+'</strong><p>'+date(t.invoice.createdAt)+' · <a href="#/invoice/'+encodeURIComponent(t.invoice.id)+'">'+esc(t.invoice.no||t.invoice.id)+'</a></p></div></li>';}).join(''):'<li><p>No tests ordered yet.</p></li>')+'</ol></article>'+ 
      '<article class="card"><h2>Billing Summary</h2><div class="sub">Total billed across recorded visits</div><div class="capacity"><b>'+money(m.spent)+'</b><div class="bar"><div style="width:'+paid+'%"></div></div><div class="scale"><span>'+paid+'% paid</span><span>Due '+money(m.due)+'</span></div></div></article>'+ 
      '<article class="card"><h2>Recent Results</h2><div class="sub">'+esc(m.latest?m.latest.no||m.latest.id:'No ready report')+'</div><div class="med-items">'+(m.rows.length?m.rows.map(function(r){return '<div class="med"><span class="pill">▥</span><div><strong>'+esc(r.name)+'</strong><small>'+esc(r.value)+' '+esc(r.unit)+'</small></div></div>';}).join(''):'<p class="sub">No ready result values recorded.</p>')+'</div></article>'+ 
      '<article class="card" style="grid-column:1/-1"><h2>Recorded Clinical Notes</h2><p class="sub">'+esc(patient.notes||'No clinical notes recorded.')+'</p></article></div>'+ 
      '</section><section class="visual"><div class="organ-stage"><img class="organ-art" src="assets/img/patient-lungs.png" alt="Reference anatomy illustration of lungs"><div class="tools"><button type="button" data-pd-zoom="in" aria-label="Zoom anatomy artwork">+</button><button type="button" data-pd-reset aria-label="Reset anatomy artwork">↔</button><button type="button" data-pd-zoom="out" aria-label="Zoom out anatomy artwork">−</button></div><article class="warning"><h3>Anatomy reference</h3><p>Illustrative artwork. Patient findings and organ flags are available in the interactive overview.</p></article></div><p class="pd-caption">Anatomy illustration · Not a patient scan</p><div class="pd-tools"><button type="button" data-pd-records>Lab entry, reports &amp; billing</button><button type="button" data-pd-clinical>Interactive organ overview</button></div></section></div></main></div>';
  }
  function mount(host,patient){
    if(!host||!host.isConnected)return false;
    if(!document.getElementById('ptDashboardStyles')){var link=document.createElement('link');link.id='ptDashboardStyles';link.rel='stylesheet';link.href='assets/css/patient-dashboard.css?v='+encodeURIComponent(window.__ASSET_V||'294');document.head.appendChild(link);}
    host.innerHTML=render(patient,model(patient));
    var image=host.querySelector('.organ-art'),zoom=1;
    host.querySelectorAll('[data-pd-zoom]').forEach(function(b){b.addEventListener('click',function(){zoom=Math.max(.7,Math.min(1.3,zoom+(b.getAttribute('data-pd-zoom')==='in'?.1:-.1)));image.style.transform='translateX(-50%) scale('+zoom+')';});});
    host.querySelector('[data-pd-reset]').addEventListener('click',function(){zoom=1;image.style.transform='translateX(-50%)';});
    host.querySelector('[data-pd-records]').addEventListener('click',function(){var records=document.getElementById('ptPatientRecords');if(records){records.open=true;records.scrollIntoView({behavior:'smooth',block:'start'});}});
    var clinicalButton=host.querySelector('[data-pd-clinical]');
    var canAI=App.aiInsights&&App.aiInsights.canAccess();clinicalButton.hidden=!canAI;
    clinicalButton.addEventListener('click',function(){var target=document.getElementById('ptClinicalOverview'),records=document.getElementById('ptPatientRecords');if(records)records.open=true;if(target)target.scrollIntoView({behavior:'smooth',block:'start'});});
    return true;
  }
  App.patientDashboard={mount:mount,model:model,render:render};
})();
