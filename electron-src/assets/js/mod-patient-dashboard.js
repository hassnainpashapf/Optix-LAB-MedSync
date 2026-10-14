/* Reference-style patient overview; cards contain only the selected patient's recorded details. */
(function () {
  'use strict';
  var App = window.App;
  function esc(value) { return App.esc(value == null ? '' : String(value)); }
  function render(patient) {
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
      '<div class="pd-visual"><div class="pd-art"><img src="assets/img/patient-lungs.png" alt="Reference anatomy illustration of lungs"><div class="pd-zoom"><button type="button" data-pd-zoom="in" aria-label="Zoom in">+</button><button type="button" data-pd-reset aria-label="Reset image">↔</button><button type="button" data-pd-zoom="out" aria-label="Zoom out">−</button></div><div class="pd-callout"><strong>Patient Overview</strong><span>'+esc(patient.name||'Patient')+' · '+esc(patient.id)+'</span></div></div>'+
      '<nav class="pd-options" aria-label="Patient detail sections"><button type="button" aria-pressed="false" data-pd-section="pdIdentity"><span>♧</span>Identity</button><button type="button" aria-pressed="false" data-pd-section="pdContact"><span>♙</span>Contact</button><button type="button" aria-pressed="false" data-pd-section="pdNotes"><span>☷</span>Notes</button></nav><p class="pd-caption">Anatomy reference illustration</p></div></div></section>';
  }
  function mount(host, patient) {
    if (!host || !host.isConnected) return false;
    if (!document.getElementById('ptDashboardStyles')) {
      var link = document.createElement('link');link.id='ptDashboardStyles';link.rel='stylesheet';
      link.href='assets/css/patient-dashboard.css?v='+encodeURIComponent(window.__ASSET_V||'295');document.head.appendChild(link);
    }
    host.innerHTML=render(patient);
    var image=host.querySelector('.pd-art img'),zoom=1;
    host.querySelectorAll('[data-pd-zoom]').forEach(function(button){button.addEventListener('click',function(){zoom=Math.max(.8,Math.min(1.25,zoom+(button.getAttribute('data-pd-zoom')==='in'?.1:-.1)));image.style.transform='translateX(-50%) scale('+zoom+')';});});
    host.querySelector('[data-pd-reset]').addEventListener('click',function(){zoom=1;image.style.transform='translateX(-50%)';});
    host.querySelectorAll('[data-pd-section]').forEach(function(button){button.addEventListener('click',function(){var target=host.querySelector('#'+button.getAttribute('data-pd-section'));host.querySelectorAll('[data-pd-section]').forEach(function(b){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',b===button?'true':'false');});if(target){target.classList.add('pd-highlight');setTimeout(function(){target.classList.remove('pd-highlight');},1200);}});});
    return true;
  }
  App.patientDashboard={render:render,mount:mount};
})();
