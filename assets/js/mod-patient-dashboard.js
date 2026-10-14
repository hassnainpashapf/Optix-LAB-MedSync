/* Reference-style patient overview; cards contain only the selected patient's recorded details. */
(function () {
  'use strict';
  var App = window.App;
  function esc(value) { return App.esc(value == null ? '' : String(value)); }

  // Related anatomy is a test illustration, never an inferred diagnosis or lesion location.
  var regions = {
    liver: {name:'Liver', spots:[[45,33,7,4]]}, kidneys:{name:'Kidneys',spots:[[44,37,3,5],[57,37,3,5]]},
    heart:{name:'Heart / cardiovascular',spots:[[53,27,4,4]]}, lungs:{name:'Lungs',spots:[[44,27,5,6],[57,27,5,6]]},
    thyroid:{name:'Thyroid',spots:[[50,19,3,2]]}, pancreas:{name:'Pancreas / glucose metabolism',spots:[[50,35,6,2]]},
    blood:{name:'Blood / systemic — no exact site',spots:[[30,39,2,2],[71,39,2,2],[43,67,2,2],[58,67,2,2]]},
    general:{name:'General laboratory test — no specific organ',spots:[]}
  };
  function regionFor(test) {
    var name=String((test||{}).name||'')+' '+String((test||{}).code||'');
    var rules=[['liver',/\b(lft|liver|alt|ast|sgpt|sgot|bilirubin|alkaline phosphatase|hcv|hepatitis)\b/i],
      ['kidneys',/\b(rft|kft|renal|kidney|creatinine|urea|bun|egfr|urine)\b/i],
      ['heart',/\b(lipid|cholesterol|hdl|ldl|triglycerides?|troponin|cardiac)\b/i],
      ['lungs',/\b(lung|pulmonary|respiratory|sputum|spirometry)\b/i],
      ['thyroid',/\b(thyroid|tft|tsh|t3|t4)\b/i],
      ['pancreas',/\b(glucose|blood sugar|fbs|rbs|hba1c|glycated|amylase|lipase)\b/i],
      ['blood',/\b(cbc|complete blood count|blood group|hemoglobin|haemoglobin|platelet|wbc|rbc|pt|inr|aptt|coagulation)\b/i]];
    var matches=rules.filter(function(rule){return rule[1].test(name);});
    return matches.length===1?matches[0][0]:'general';
  }
  function outsideRange(value, ref) {
    // Do not treat missing, qualitative, censored, or unparseable results as normal.
    var number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
    value=String(value==null?'':value).trim(); if(!number.test(value))return null;
    var v=Number(value),r=String(ref||'').trim().replace(/[–—]/g,'-'),n='([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+))';
    var range=r.match(new RegExp('^'+n+'\\s*(?:-|to)\\s*'+n+'$','i'));
    if(range){var low=Number(range[1]),high=Number(range[2]);return low<=high?v<low||v>high:null;}
    var bound=r.match(new RegExp('^(<=|>=|<|>|≤|≥)\\s*'+n+'$'));
    if(!bound)return null;var b=Number(bound[2]);
    return bound[1]==='<'?v>=b:bound[1]==='>'?v<=b:(bound[1]==='<='||bound[1]==='≤')?v>b:v<b;
  }
  function reference(param, patient) {
    var gender=String(patient.gender||patient.sex||'').toLowerCase()[0];
    if(patient.age!=null&&String(patient.age).trim()!==''&&Number(patient.age)<13&&param.refChild)return param.refChild;
    return (gender==='m'?param.refMale:gender==='f'?param.refFemale:'')||param.ref||param.normal||'';
  }
  function testsFor(patient) {
    var invoices=(DB.all('invoices')||[]).filter(function(inv){return inv.patientId===patient.id;}).sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
    var results=DB.all('results')||[],seen={},entries=[];
    invoices.forEach(function(inv){(inv.items||[]).forEach(function(item){
      if(!item.testId||seen[item.testId])return;seen[item.testId]=true;
      var test=DB.get('tests',item.testId)||{},name=test.name||item.name||test.code||'Laboratory test';
      var ready=results.filter(function(res){return res.invoiceId===inv.id&&res.testId===item.testId&&res.status==='ready';}).sort(function(a,b){return String(b.reportedAt||b.updatedAt||'').localeCompare(String(a.reportedAt||a.updatedAt||''));})[0];
      var flags=[],checked=0,populated=0,params=Array.isArray(test.params)?test.params:[];
      if(ready)params.forEach(function(param){var values=ready.values||{},value=values[param.id]!=null?values[param.id]:values[param.name];
        if(value!=null&&String(value).trim()!=='')populated++;
        var ref=reference(param,patient),outside=outsideRange(value,ref);if(outside!==null)checked++;
        if(outside)flags.push((param.name||param.id)+': '+value+(param.unit?' '+param.unit:'')+' (reference '+ref+')');
      });
      entries.push({name:name,region:regionFor({name:name,code:test.code}),status:flags.length?'abnormal':!ready?'pending':checked>0&&checked===params.length&&populated===params.length?'within':'unknown',flags:flags,date:inv.createdAt||''});
    });});return entries;
  }
  function anatomy(entry) {
    entry=entry||{region:'general',status:'pending',flags:[],name:'No ordered tests'};
    var region=regions[entry.region],red=entry.status==='abnormal';
    var status=red?'Outside reference range':entry.status==='within'?'Compared values within reference range':entry.status==='pending'?'Results pending':'Reference comparison unavailable / incomplete';
    return '<div class="pd-body-frame"><img src="assets/img/patient-body-reference.png" alt="Full-body anatomy reference">'+
      '<svg class="pd-body-markers '+(red?'pd-abnormal':'')+'" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="'+esc(region.name)+' related area">'+region.spots.map(function(spot){return '<ellipse cx="'+spot[0]+'" cy="'+spot[1]+'" rx="'+spot[2]+'" ry="'+spot[3]+'"/>';}).join('')+'</svg></div>'+
      '<div class="pd-callout '+(red?'pd-abnormal':'')+'"><strong>'+esc(region.name)+'</strong><span>'+esc(status)+'</span>'+(entry.flags.length?'<p>'+entry.flags.map(esc).join('<br>')+'</p>':'')+'</div>';
  }
  function render(patient) {
    var tests=testsFor(patient);
    var doctor = patient.doctorId ? (DB.get('doctors', patient.doctorId) || {}).name : '';
    var registered = patient.createdAt ? (App.dt ? App.dt(patient.createdAt) : patient.createdAt) : '';
    var initials = String(patient.name || '?').trim().split(/\s+/).slice(0, 2).map(function (word) { return word[0] || ''; }).join('').toUpperCase();
    function fields(list, cls) {
      return '<dl class="'+cls+'">'+list.map(function(field){return '<div class="pd-field"><dt>'+esc(field[0])+'</dt><dd>'+esc(field[1]||'Not recorded')+'</dd></div>';}).join('')+'</dl>';
    }
    return '<section id="ptPatientDashboard" aria-label="Patient details"><div class="pd-layout"><div class="pd-left">'+
      '<article class="pd-card pd-overview"><header class="pd-header"><div><h2>'+esc(patient.name||'Patient')+'</h2><p>Patient Details Overview</p></div><span class="pd-avatar" aria-hidden="true">'+esc(initials)+'</span></header>'+
      fields([['Patient ID',patient.id],['Age',patient.age==null?'':patient.age+' years'],['Gender',patient.gender||patient.sex],['Blood group',patient.blood],['Date of birth',patient.dob],['Registered',registered]],'pd-grid')+'</article>'+
      '<div class="pd-lower"><article class="pd-card" id="pdContact"><h3>Contact Details</h3><p class="pd-sub">Patient contact information</p>'+fields([['Phone',patient.phone],['WhatsApp',patient.whatsapp],['Email',patient.email],['Address',patient.address]],'pd-list')+'</article>'+
      '<div class="pd-stack"><article class="pd-card" id="pdIdentity"><h3>Identity &amp; Referring Doctor</h3>'+fields([['Father / guardian',patient.father],['CNIC',patient.cnic],['Referring doctor',doctor]],'pd-list')+'</article>'+
      '<article class="pd-card" id="pdNotes"><h3>Patient Notes</h3><p class="pd-notes">'+esc(patient.notes||'Not recorded')+'</p></article></div></div></div>'+
      '<div class="pd-visual"><label class="pd-test-label" for="pdTestSelect">Test anatomy</label><select id="pdTestSelect" class="pd-test-select" aria-label="Select test anatomy">'+(tests.length?tests.map(function(test,index){return '<option value="'+index+'">'+esc(test.name)+' · '+esc(test.date?String(test.date).slice(0,10):'Date not recorded')+'</option>';}).join(''):'<option>No ordered tests</option>')+'</select><div class="pd-art"><div data-pd-anatomy>'+anatomy(tests[0])+'</div><div class="pd-zoom"><button type="button" data-pd-zoom="in" aria-label="Zoom in">+</button><button type="button" data-pd-reset aria-label="Reset image">↔</button><button type="button" data-pd-zoom="out" aria-label="Zoom out">−</button></div></div>'+
      '<nav class="pd-options" aria-label="Patient detail sections"><button type="button" aria-pressed="false" data-pd-section="pdIdentity"><span>♧</span>Identity</button><button type="button" aria-pressed="false" data-pd-section="pdContact"><span>♙</span>Contact</button><button type="button" aria-pressed="false" data-pd-section="pdNotes"><span>☷</span>Notes</button></nav><p class="pd-caption">Blue: test-related area · Red: abnormal report value.<br>Illustration only; not an exact disease location or a patient scan.</p></div></div></section>';
  }
  function mount(host, patient) {
    if (!host || !host.isConnected) return false;
    if (!document.getElementById('ptDashboardStyles')) {
      var link = document.createElement('link');link.id='ptDashboardStyles';link.rel='stylesheet';
      link.href='assets/css/patient-dashboard.css?v='+encodeURIComponent(window.__ASSET_V||'297');document.head.appendChild(link);
    }
    // Patient profiles open with the existing desktop navigation expanded.
    if(window.matchMedia && window.matchMedia('(min-width:768px)').matches){
      document.body.classList.remove('side-collapsed');
      var toggle=document.getElementById('navToggle');if(toggle)toggle.setAttribute('aria-expanded','true');
    }
    host.innerHTML=render(patient);
    var image=host.querySelector('.pd-body-frame'),zoom=1;
    var tests=testsFor(patient);
    host.querySelector('#pdTestSelect').addEventListener('change',function(event){host.querySelector('[data-pd-anatomy]').innerHTML=anatomy(tests[Number(event.target.value)]);image=host.querySelector('.pd-body-frame');zoom=1;});
    host.querySelectorAll('[data-pd-zoom]').forEach(function(button){button.addEventListener('click',function(){zoom=Math.max(.8,Math.min(1.25,zoom+(button.getAttribute('data-pd-zoom')==='in'?.1:-.1)));image.style.transform='scale('+zoom+')';});});
    host.querySelector('[data-pd-reset]').addEventListener('click',function(){zoom=1;image.style.transform='scale(1)';});
    host.querySelectorAll('[data-pd-section]').forEach(function(button){button.addEventListener('click',function(){var target=host.querySelector('#'+button.getAttribute('data-pd-section'));host.querySelectorAll('[data-pd-section]').forEach(function(b){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button?'true':'false');});if(target){target.classList.add('pd-highlight');setTimeout(function(){target.classList.remove('pd-highlight');},1200);}});});
    return true;
  }
  App.patientDashboard={render:render,mount:mount,regionFor:regionFor,testsFor:testsFor,outsideRange:outsideRange};
})();
