/* Optix Medical Sync — Patient Vitals Overview & Organ Intelligence Dashboard
   Matches Nexura Care Clinical Monitoring Specification (media_1791965597188.png)
   Displays real-time vitals, stress patterns, daily rehabilitation plan, capacity efficiency,
   medication adherence, and interactive glowing organ anatomical models. */
(function () {
  'use strict';
  var App = window.App;
  function esc(value) { return App.esc(value == null ? '' : String(value)); }

  var DAYS_DATA = [
    { day: '09', name: 'Sat', avg: 28, peak: '24%', peakBpm: '126 BPM', peakTime: '04:15 PM', low: '6%', lowBpm: '98 BPM', lowTime: '01:20 AM', desc: 'Mild autonomic recovery during early morning rest. Work-related stressors stabilized in evening.' },
    { day: '10', name: 'Sun', avg: 25, peak: '22%', peakBpm: '118 BPM', peakTime: '03:30 PM', low: '5%', lowBpm: '92 BPM', lowTime: '02:10 AM', desc: 'Restful circadian profile. Low systemic physiological load achieved during daytime inactivity.' },
    { day: '11', name: 'Mon', avg: 35, peak: '31%', peakBpm: '138 BPM', peakTime: '11:45 AM', low: '8%', lowBpm: '102 BPM', lowTime: '03:00 AM', desc: 'Sympathetic tone spiked during late morning peak activity. Cortisol stress markers elevated.' },
    { day: '12', name: 'Tue', avg: 30, peak: '29%', peakBpm: '134 BPM', peakTime: '02:15 PM', low: '7%', lowBpm: '100 BPM', lowTime: '01:45 AM', desc: 'Moderate stress profile during afternoon tasks with steady cardiovascular compensation.' },
    { day: '13', name: 'Wed', avg: 32, peak: '27%', peakBpm: '132 BPM', peakTime: '05:48 PM', low: '7%', lowBpm: '104 BPM', lowTime: '12:39 AM', desc: 'Baseline stress achieved during relaxation. Elevated stress markers directly linked to work-related workload and external factors.' },
    { day: '14', name: 'Thu', avg: 31, peak: '28%', peakBpm: '130 BPM', peakTime: '04:20 PM', low: '8%', lowBpm: '106 BPM', lowTime: '02:00 AM', desc: 'Stable autonomic index. Mild evening sympathetic surge linked to ambient temperature.' },
    { day: '15', name: 'Fri', avg: 29, peak: '26%', peakBpm: '128 BPM', peakTime: '06:10 PM', low: '6%', lowBpm: '99 BPM', lowTime: '01:15 AM', desc: 'Weekly taper in physical strain observed. Parasympathetic tone dominant overnight.' }
  ];

  var ORGAN_DATA = {
    lung: {
      key: 'lung',
      name: 'Lung',
      system: 'Pulmonary System',
      effTitle: 'Lung Capacity Efficiency',
      risk: 'Moderate Risk',
      riskClass: 'moderate',
      score: 79,
      barGrad: 'linear-gradient(90deg, #38bdf8 0%, #2563eb 100%)',
      rehabSub: 'Daily targets for your lung health',
      rehabPlan: [
        { title: 'Early Ambulation', desc: 'Short Walk - 15 minutes.' },
        { title: 'Medication & Therapy Tracking', desc: 'Scheduled bronchodilator therapy Every 12 h.' },
        { title: 'Hydration & Safety', desc: '2.5L water intake and monitoring Air Quality.' },
        { title: 'Respiratory Exercises', desc: '3x Daily (Pursed-Lip & Diaphragmatic).' },
        { title: 'Anti-Inflammatory Diet', desc: 'High Omega-3 and Magnesium intake.' },
        { title: 'BMI & Lean Mass', desc: 'Monitoring weight loss due to Breathing.' },
        { title: 'Stress & Anxiety Management', desc: 'Monitoring stress hormones breathing.' }
      ],
      medsSub: 'Monitor prescribed pulmonary treatments',
      meds: [
        { icon: '🧪', name: 'Ventolin', dose: '1-2 puffs as needed (Rescue Inhaler).' },
        { icon: '💊', name: 'Pulmicort', dose: '1-2 inhalations every 12 hours.' },
        { icon: '🧴', name: 'Mucosolvan', dose: '1 tablet (30mg) three times daily' }
      ],
      warningTitle: 'Warning',
      warningDesc: 'Pulmonary findings: elevated airway resistance, imagined lung symptoms Rate 7.2%.'
    },
    liver: {
      key: 'liver',
      name: 'Liver',
      system: 'Hepatic System',
      effTitle: 'Liver Function Efficiency',
      risk: 'Optimal / Healthy',
      riskClass: 'normal',
      score: 91,
      barGrad: 'linear-gradient(90deg, #34d399 0%, #059669 100%)',
      rehabSub: 'Daily targets for hepatic detoxification & bile clearance',
      rehabPlan: [
        { title: 'Antioxidant Hydration', desc: 'Warm lemon water & green tea daily.' },
        { title: 'Fructose & Sugar Avoidance', desc: 'Zero processed corn syrups or sweetened drinks.' },
        { title: 'Cruciferous Vegetables', desc: 'Broccoli, cauliflower, and cabbage for glutathione.' },
        { title: 'Hepatotoxic Drug Shield', desc: 'Avoid unnecessary acetaminophen or NSAID intake.' },
        { title: 'Physical Activity', desc: '30 mins daily walking to reduce hepatic steatosis.' },
        { title: 'Lipid Profile Follow-up', desc: 'Quarterly ALT, AST, and Alk Phos monitoring.' },
        { title: 'Intermittent Fasting', desc: '14-hour overnight fast to facilitate autophagy.' }
      ],
      medsSub: 'Monitor prescribed hepatoprotective therapies',
      meds: [
        { icon: '💊', name: 'Heptral (SAMe)', dose: '500mg twice daily between meals.' },
        { icon: '🧪', name: 'Essentiale Forte', dose: '1 capsule three times daily with meals.' },
        { icon: '🌿', name: 'Silymarin (Milk Thistle)', dose: '140mg twice daily with water.' }
      ],
      warningTitle: 'Hepatic Status',
      warningDesc: 'Hepatic findings: normal synthetic function, ALT/AST within therapeutic baseline.'
    },
    heart: {
      key: 'heart',
      name: 'Heart',
      system: 'Cardiovascular System',
      effTitle: 'Cardiac Ejection Efficiency',
      risk: 'Normal / Low Risk',
      riskClass: 'normal',
      score: 88,
      barGrad: 'linear-gradient(90deg, #fb7185 0%, #e11d48 100%)',
      rehabSub: 'Daily targets for cardiovascular resilience & circulation',
      rehabPlan: [
        { title: 'Graded Aerobic Training', desc: '20 minutes brisk walking in target HR zone.' },
        { title: 'BP & Pulse Monitoring', desc: 'Record resting morning and evening vitals.' },
        { title: 'Sodium Restriction', desc: '< 2g daily sodium intake to reduce cardiac preload.' },
        { title: 'Cardioprotective Nutrition', desc: 'Mediterranean diet rich in leafy greens & olive oil.' },
        { title: 'Statin & Lipid Tracking', desc: 'Strict daily compliance with lipid-lowering regimen.' },
        { title: 'Sleep & Recovery', desc: 'Minimum 7.5 hours uninterrupted restful sleep.' },
        { title: 'Vagal Nerve Exercises', desc: 'Slow deep diaphragmatic breath (6 breaths/min).' }
      ],
      medsSub: 'Monitor prescribed cardiovascular treatments',
      meds: [
        { icon: '💊', name: 'Concor (Bisoprolol)', dose: '2.5mg once daily every morning.' },
        { icon: '💊', name: 'Lipitor (Atorvastatin)', dose: '20mg once daily at bedtime.' },
        { icon: '🩸', name: 'Lowplat (Aspirin)', dose: '75mg once daily after lunch.' }
      ],
      warningTitle: 'Cardiac Finding',
      warningDesc: 'Cardiovascular findings: mild resting tachycardia (86 bpm), systolic compliance stable.'
    },
    kidneys: {
      key: 'kidneys',
      name: 'Kidneys',
      system: 'Renal System',
      effTitle: 'Glomerular Filtration Efficiency',
      risk: 'Mild Risk / Monitored',
      riskClass: 'moderate',
      score: 84,
      barGrad: 'linear-gradient(90deg, #22d3ee 0%, #0891b2 100%)',
      rehabSub: 'Daily targets for renal protection & electrolyte balance',
      rehabPlan: [
        { title: 'Precision Hydration', desc: '2.8L structured water intake across the day.' },
        { title: 'Electrolyte Balance', desc: 'Balanced potassium and low phosphorus dietary intake.' },
        { title: 'Nephrotoxic Shield', desc: 'Strict contraindication for diclofenac & ibuprofen.' },
        { title: 'Microalbuminuria Screen', desc: 'Periodic spot urine protein:creatinine ratio.' },
        { title: 'Blood Pressure Target', desc: 'Keep systolic BP under 125 mmHg consistently.' },
        { title: 'Protein Moderation', desc: '0.8g per kg body weight to spare glomeruli.' },
        { title: 'Uric Acid Clearance', desc: 'Avoid purine-dense organ meats and shellfish.' }
      ],
      medsSub: 'Monitor prescribed nephrological treatments',
      meds: [
        { icon: '💊', name: 'Ketosteril', dose: '3 tablets three times daily during meals.' },
        { icon: '🧪', name: 'Urals Effervescent', dose: '1 sachet dissolved in water twice daily.' },
        { icon: '💊', name: 'Cozaar (Losartan)', dose: '50mg once daily for renal protection.' }
      ],
      warningTitle: 'Renal Alert',
      warningDesc: 'Renal findings: eGFR estimated at 84 mL/min, serum creatinine stable.'
    },
    brain: {
      key: 'brain',
      name: 'Brain',
      system: 'Neuro-Cognitive Vitality System',
      effTitle: 'Cognitive Vitality & Stress Index',
      risk: 'Elevated Stress',
      riskClass: 'moderate',
      score: 68,
      barGrad: 'linear-gradient(90deg, #c4b5fd 0%, #7c3aed 100%)',
      rehabSub: 'Daily targets for neuroprotection and mental calm',
      rehabPlan: [
        { title: 'Circadian Rhythm Sync', desc: 'Direct morning sunlight exposure for 15 mins.' },
        { title: 'Cognitive Recovery Pause', desc: '5-minute mindfulness pauses every 90 mins.' },
        { title: 'Neurotrophic Nutrition', desc: 'Walnuts, blueberries, and DHA Omega-3 fatty acids.' },
        { title: 'Blue Light Curfew', desc: 'No digital screens within 60 mins before sleep.' },
        { title: 'Aerobic Neurogenesis', desc: 'Moderate cardio to boost BDNF production.' },
        { title: 'Hydration for Neural Speed', desc: '500ml water immediately upon waking.' },
        { title: 'Stress Hormone Clearing', desc: 'Box breathing: 4s inhale, 4s hold, 4s exhale, 4s hold.' }
      ],
      medsSub: 'Monitor prescribed cognitive and stress therapies',
      meds: [
        { icon: '💊', name: 'Citicoline (Cognizin)', dose: '500mg once daily after breakfast.' },
        { icon: '💊', name: 'Magnesium L-Threonate', dose: '144mg elemental at night.' },
        { icon: '🧪', name: 'Neurobion Forte', dose: '1 tablet once daily with lunch.' }
      ],
      warningTitle: 'Neuro Finding',
      warningDesc: 'Neurological findings: heightened sympathetic tone, stress markers 32% elevated.'
    }
  };

  /* Helper to render glowing radial gauge */
  function renderRadialGaugeSvg(pct) {
    var p = Math.max(0, Math.min(100, pct || 32));
    var r = 46;
    var c = 2 * Math.PI * r;
    var offset = c - (p / 100) * c;
    return '<svg viewBox="0 0 120 120" width="120" height="120" style="overflow:visible;display:block">' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="8" stroke-dasharray="3,3" />' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#2563eb" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" transform="rotate(-90 60 60)" style="transition:stroke-dashoffset 0.6s ease" />' +
      '</svg>';
  }

  /* Helper to render carousel thumb SVG */
  function renderOrganThumbSvg(key) {
    if (key === 'lung') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M18 6 L22 6 L22 14 L18 14 Z" fill="#0284c7"/><path d="M18 14 C15 15 9 17 7 21 C5 25 5 30 7 33 C9 36 13 36 16 35 C17 34 18 30 18 26 Z" fill="#38bdf8"/><path d="M22 14 C25 15 31 17 33 21 C35 25 35 30 33 33 C31 36 27 36 24 35 C23 34 22 30 22 26 Z" fill="#f43f5e"/></svg>';
    }
    if (key === 'liver') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M8 19 C10 12 17 10 28 11 C33 11 34 14 34 18 C34 23 30 29 24 31 C18 32 10 30 7 26 C6 24 7 21 8 19 Z" fill="#10b981"/><circle cx="21" cy="27" r="2.5" fill="#06b6d4"/></svg>';
    }
    if (key === 'heart') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M15 14 C11 17 10 23 13 28 C15 32 19 35 20 36 C21 35 28 30 30 24 C31 19 29 14 24 13 C21 13 18 15 17 16 C16 15 15 14 15 14 Z" fill="#e11d48"/><path d="M18 12 C18 7 23 7 24 11" stroke="#f43f5e" stroke-width="2" fill="none"/></svg>';
    }
    if (key === 'kidneys') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M13 14 C9 15 7 19 7 23 C7 27 9 31 13 31 C15 31 16 29 15 26 C14 23 15 19 16 17 C15 15 14 14 13 14 Z" fill="#06b6d4"/><path d="M27 14 C31 15 33 19 33 23 C33 27 31 31 27 31 C25 31 24 29 25 26 C26 23 25 19 24 17 C25 15 26 14 27 14 Z" fill="#06b6d4"/><line x1="19" y1="8" x2="19" y2="34" stroke="#ef4444" stroke-width="1.5"/></svg>';
    }
    if (key === 'brain') {
      return '<svg viewBox="0 0 40 40" width="34" height="34"><path d="M12 24 C8 20 9 14 15 10 C20 6 26 7 29 11 C32 16 31 22 28 25 C24 28 19 29 16 28 C13 27 11 25 12 24 Z" fill="#8b5cf6"/><line x1="18" y1="28" x2="20" y2="34" stroke="#7c3aed" stroke-width="2.5"/></svg>';
    }
    return '';
  }

  /* Full Detailed Stage Organ SVGs */
  function renderStageOrganSvg(key) {
    if (key === 'lung') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg lung-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="lungHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>' +
        '    <stop offset="70%" stop-color="#0284c7" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="tracheaGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
        '    <stop offset="0%" stop-color="#0ea5e9"/>' +
        '    <stop offset="50%" stop-color="#38bdf8"/>' +
        '    <stop offset="100%" stop-color="#0284c7"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="leftLungGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.28"/>' +
        '    <stop offset="60%" stop-color="#0284c7" stop-opacity="0.14"/>' +
        '    <stop offset="100%" stop-color="#0369a1" stop-opacity="0.32"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="rightLungGrad" x1="100%" y1="0%" x2="0%" y2="100%">' +
        '    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.25"/>' +
        '    <stop offset="60%" stop-color="#0ea5e9" stop-opacity="0.14"/>' +
        '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0.32"/>' +
        '  </linearGradient>' +
        '  <filter id="vitalsGlow" x="-20%" y="-20%" width="140%" height="140%">' +
        '    <feGaussianBlur stdDeviation="3.5" result="blur"/>' +
        '    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
        '  </filter>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#lungHalo)"/>' +
        '<path d="M162 20 L178 20 L178 95 L162 95 Z" fill="url(#tracheaGrad)" rx="3"/>' +
        '<line x1="160" y1="32" x2="180" y2="32" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="44" x2="180" y2="44" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="56" x2="180" y2="56" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="68" x2="180" y2="68" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="80" x2="180" y2="80" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<line x1="160" y1="92" x2="180" y2="92" stroke="#bae6fd" stroke-width="2.5" stroke-linecap="round"/>' +
        '<path d="M162 95 C140 100 85 115 65 155 C45 195 40 250 55 295 C68 335 110 345 145 330 C155 325 158 300 156 260 C155 220 158 140 162 95 Z" fill="url(#leftLungGrad)" stroke="#38bdf8" stroke-width="1.8" filter="url(#vitalsGlow)"/>' +
        '<path d="M178 95 C200 100 255 115 275 155 C295 195 300 250 285 295 C272 335 230 345 195 330 C182 315 180 275 186 240 C190 205 183 140 178 95 Z" fill="url(#rightLungGrad)" stroke="#38bdf8" stroke-width="1.8" filter="url(#vitalsGlow)"/>' +
        '<path d="M166 95 C155 115 130 140 115 170 C105 190 95 225 90 260" stroke="#0ea5e9" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M130 140 C110 135 85 145 75 165" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M115 170 C130 190 135 225 132 255" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M100 205 C80 215 70 240 68 270" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M115 240 C125 270 120 295 105 315" stroke="#0284c7" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M90 260 C80 285 85 305 95 320" stroke="#38bdf8" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<path d="M174 95 C185 115 210 140 225 170 C235 190 245 225 250 260" stroke="#0ea5e9" stroke-width="4.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M210 140 C230 135 255 145 265 165" stroke="#f43f5e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M225 170 C210 190 205 225 208 255" stroke="#f43f5e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M240 205 C260 215 270 240 272 270" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M225 240 C215 270 220 295 235 315" stroke="#0284c7" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M250 260 C260 285 255 305 245 320" stroke="#f43f5e" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="75" cy="165" r="3.5" fill="#38bdf8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="68" cy="270" r="3" fill="#38bdf8"/>' +
        '<circle cx="95" cy="320" r="3.5" fill="#bae6fd"/>' +
        '<circle cx="105" cy="315" r="3" fill="#38bdf8"/>' +
        '<circle cx="132" cy="255" r="3.5" fill="#0284c7"/>' +
        '<circle cx="265" cy="165" r="3.5" fill="#fb7185" filter="url(#vitalsGlow)"/>' +
        '<circle cx="272" cy="270" r="3" fill="#38bdf8"/>' +
        '<circle cx="245" cy="320" r="3.5" fill="#fb7185"/>' +
        '<circle cx="235" cy="315" r="3" fill="#38bdf8"/>' +
        '<circle cx="208" cy="255" r="3.5" fill="#f43f5e"/>' +
        '<path d="M75 165 Q60 180 58 205" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M265 165 Q280 180 282 205" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M90 260 Q75 280 72 300" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '<path d="M250 260 Q265 280 268 300" stroke="#f43f5e" stroke-width="1" stroke-dasharray="2 2" fill="none"/>' +
        '</svg>';
    }
    if (key === 'liver') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg liver-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="liverHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#047857" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#047857" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="liverGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#34d399"/>' +
        '    <stop offset="50%" stop-color="#059669"/>' +
        '    <stop offset="100%" stop-color="#064e3b"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#liverHalo)"/>' +
        '<path d="M175 40 L195 40 L195 130 L175 130 Z" fill="#0284c7" rx="4"/>' +
        '<path d="M75 170 C85 110 150 95 240 100 C275 102 285 125 285 160 C285 200 260 250 210 265 C160 280 90 260 70 230 C60 215 65 190 75 170 Z" fill="url(#liverGrad)" stroke="#6ee7b7" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M185 100 C185 140 180 190 170 265" stroke="#a7f3d0" stroke-width="2.5" stroke-dasharray="4 2" fill="none"/>' +
        '<path d="M175 240 C175 225 190 220 195 235 C200 250 195 275 185 280 C175 280 170 260 175 240 Z" fill="#06b6d4" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M175 220 C165 195 145 175 120 165" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M145 180 C135 155 110 145 95 145" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M175 220 C195 195 225 180 250 175" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M215 190 C230 165 250 155 265 150" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="120" cy="165" r="3.5" fill="#38bdf8"/>' +
        '<circle cx="95" cy="145" r="3" fill="#38bdf8"/>' +
        '<circle cx="250" cy="175" r="3.5" fill="#38bdf8"/>' +
        '<circle cx="265" cy="150" r="3.5" fill="#38bdf8"/>' +
        '</svg>';
    }
    if (key === 'heart') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg heart-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="heartHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#be123c" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#be123c" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="aortaGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#f43f5e"/>' +
        '    <stop offset="50%" stop-color="#e11d48"/>' +
        '    <stop offset="100%" stop-color="#9f1239"/>' +
        '  </linearGradient>' +
        '  <linearGradient id="myoGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#fb7185"/>' +
        '    <stop offset="50%" stop-color="#e11d48"/>' +
        '    <stop offset="100%" stop-color="#881337"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#heartHalo)"/>' +
        '<path d="M125 40 L145 40 L145 120 L125 120 Z" fill="#0284c7" rx="4"/>' +
        '<path d="M150 110 C150 50 205 45 215 95 L195 105 C190 70 168 70 168 110 Z" fill="url(#aortaGrad)"/>' +
        '<path d="M165 65 L165 30 L175 30 L175 65 Z" fill="#e11d48"/>' +
        '<path d="M182 60 L188 30 L198 32 L192 65 Z" fill="#e11d48"/>' +
        '<path d="M200 68 L212 35 L222 38 L210 75 Z" fill="#e11d48"/>' +
        '<path d="M140 105 C150 100 185 100 205 120 L190 135 C175 122 155 122 145 125 Z" fill="#0ea5e9"/>' +
        '<path d="M120 130 C95 160 85 220 110 270 C130 310 165 350 175 355 C185 350 240 290 255 230 C265 180 245 130 205 125 C180 120 155 135 145 145 C135 135 125 125 120 130 Z" fill="url(#myoGrad)" stroke="#fb7185" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M160 145 C165 180 150 220 165 270 C170 295 175 330 175 345" stroke="#38bdf8" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M158 190 C140 205 125 235 120 260" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M162 230 C175 245 185 265 190 285" stroke="#38bdf8" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M180 155 C205 170 225 195 235 225" stroke="#fbbf24" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
        '<path d="M210 185 C220 215 225 245 220 270" stroke="#fbbf24" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
        '<circle cx="165" cy="270" r="3.5" fill="#38bdf8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="235" cy="225" r="3" fill="#fbbf24"/>' +
        '<circle cx="175" cy="345" r="3.5" fill="#38bdf8"/>' +
        '</svg>';
    }
    if (key === 'kidneys') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg kidneys-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="renalHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.32"/>' +
        '    <stop offset="70%" stop-color="#0891b2" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#0891b2" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="kidneyGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#22d3ee"/>' +
        '    <stop offset="50%" stop-color="#0891b2"/>' +
        '    <stop offset="100%" stop-color="#164e63"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#renalHalo)"/>' +
        '<path d="M158 50 L168 50 L168 310 L158 310 Z" fill="#ef4444" rx="2"/>' +
        '<path d="M172 50 L182 50 L182 310 L172 310 Z" fill="#0284c7" rx="2"/>' +
        '<path d="M225 105 C235 90 260 90 270 105 L265 115 L230 115 Z" fill="#f59e0b" stroke="#fbbf24" stroke-width="1.5"/>' +
        '<path d="M240 115 C280 120 295 160 295 200 C295 245 275 285 240 285 C220 285 210 265 215 240 C220 215 220 180 215 155 C210 135 220 115 240 115 Z" fill="url(#kidneyGrad)" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M168 190 L218 190" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M172 202 L218 202" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M218 225 C215 250 205 280 200 340" stroke="#fcd34d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path d="M70 120 C80 105 105 105 115 120 L110 130 L75 130 Z" fill="#f59e0b" stroke="#fbbf24" stroke-width="1.5"/>' +
        '<path d="M100 130 C60 135 45 175 45 215 C45 260 65 300 100 300 C120 300 130 280 125 255 C120 230 120 195 125 170 C130 150 120 130 100 130 Z" fill="url(#kidneyGrad)" stroke="#67e8f9" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M122 205 L158 205" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M122 217 L172 217" stroke="#0ea5e9" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M122 240 C125 265 135 295 140 340" stroke="#fcd34d" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '</svg>';
    }
    if (key === 'brain') {
      return '<svg viewBox="0 0 340 380" class="vitals-organ-svg brain-svg" style="max-width:100%;height:auto;overflow:visible">' +
        '<defs>' +
        '  <radialGradient id="brainHalo" cx="50%" cy="50%" r="50%">' +
        '    <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.35"/>' +
        '    <stop offset="70%" stop-color="#6d28d9" stop-opacity="0.08"/>' +
        '    <stop offset="100%" stop-color="#6d28d9" stop-opacity="0"/>' +
        '  </radialGradient>' +
        '  <linearGradient id="brainGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '    <stop offset="0%" stop-color="#c4b5fd"/>' +
        '    <stop offset="50%" stop-color="#8b5cf6"/>' +
        '    <stop offset="100%" stop-color="#5b21b6"/>' +
        '  </linearGradient>' +
        '</defs>' +
        '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#brainHalo)"/>' +
        '<path d="M155 270 L185 270 L180 340 L160 340 Z" fill="#6d28d9" rx="3"/>' +
        '<path d="M115 250 C110 280 145 295 160 270 Z" fill="#7c3aed"/>' +
        '<path d="M225 250 C230 280 195 295 180 270 Z" fill="#7c3aed"/>' +
        '<path d="M90 220 C65 190 65 130 115 85 C160 45 220 50 250 95 C280 140 275 195 245 230 C215 260 170 265 150 260 C120 255 105 240 90 220 Z" fill="url(#brainGrad)" stroke="#c4b5fd" stroke-width="2" filter="url(#vitalsGlow)"/>' +
        '<path d="M100 135 C125 125 145 145 165 130 C185 115 210 120 230 105" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M110 170 C135 160 155 180 180 165 C205 150 235 160 250 140" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M120 205 C145 195 170 215 195 200 C220 185 240 200 245 180" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M145 75 C160 95 155 115 170 125" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<path d="M190 80 C205 100 200 120 215 130" stroke="#ddd6fe" stroke-width="2" fill="none" stroke-linecap="round"/>' +
        '<circle cx="115" cy="85" r="3" fill="#a78bfa" filter="url(#vitalsGlow)"/>' +
        '<circle cx="230" cy="105" r="3.5" fill="#fbcfe8" filter="url(#vitalsGlow)"/>' +
        '<circle cx="180" cy="165" r="4" fill="#67e8f9" filter="url(#vitalsGlow)"/>' +
        '<circle cx="145" cy="195" r="3" fill="#ddd6fe"/>' +
        '<circle cx="245" cy="180" r="3" fill="#fbcfe8"/>' +
        '</svg>';
    }
    return '';
  }

  function renderRehabPlanHtml(plan) {
    return (plan || []).map(function (item, idx) {
      return '<div class="vitals-rehab-item">' +
        '<div class="vitals-rehab-badge">' + (idx + 1) + '</div>' +
        '<div class="vitals-rehab-text">' +
        '  <div class="rehab-item-title">' + esc(item.title) + '</div>' +
        '  <div class="rehab-item-desc">' + esc(item.desc) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function renderMedListHtml(meds) {
    return (meds || []).map(function (m) {
      return '<div class="vitals-med-item">' +
        '<div class="vitals-med-icon-box">' + m.icon + '</div>' +
        '<div class="vitals-med-details">' +
        '  <div class="med-name">' + esc(m.name) + '</div>' +
        '  <div class="med-dosage">' + esc(m.dose) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  // Anatomy regions mapping for laboratory test correlation
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

  /* Render Primary Patient Vitals Dashboard */
  function render(patient) {
    var tests=testsFor(patient);
    var doctor = patient.doctorId ? (DB.get('doctors', patient.doctorId) || {}).name : '';
    var registered = patient.createdAt ? (App.dt ? App.dt(patient.createdAt) : patient.createdAt) : '';
    var initials = String(patient.name || '?').trim().split(/\s+/).slice(0, 2).map(function (word) { return word[0] || ''; }).join('').toUpperCase();

    function fields(list, cls) {
      return '<dl class="'+cls+'">'+list.map(function(field){return '<div class="pd-field"><dt>'+esc(field[0])+'</dt><dd>'+esc(field[1]||'Not recorded')+'</dd></div>';}).join('')+'</dl>';
    }

    var curOrg = ORGAN_DATA['lung'];
    var curDay = DAYS_DATA[4]; // 13 Wed default matching screenshot

    var datePillsHtml = DAYS_DATA.map(function (d, idx) {
      var isAct = idx === 4;
      return '<div class="vitals-day-pill' + (isAct ? ' active' : '') + '" data-day-idx="' + idx + '">' +
        '<div class="day-num">' + d.day + '</div>' +
        '<div class="day-name">' + d.name + '</div>' +
        '</div>';
    }).join('');

    var organKeys = ['liver', 'lung', 'heart', 'kidneys', 'brain'];
    var carouselThumbsHtml = organKeys.map(function (k) {
      var o = ORGAN_DATA[k];
      var isAct = k === 'lung';
      return '<div class="vitals-organ-pill' + (isAct ? ' active' : '') + '" data-organ-pill="' + k + '">' +
        '<div class="organ-thumb-svg">' + renderOrganThumbSvg(k) + '</div>' +
        '<div class="organ-pill-label">' + o.name + '</div>' +
        '</div>';
    }).join('');

    return '<section id="ptPatientDashboard" aria-label="Patient details">' +
      '<div class="pd-profile-shell">' +
      // Left Sticky Patient Navigation Menu
      '<aside class="pd-patient-menu" aria-label="Patient menu">' +
      '  <div class="pd-menu-patient">' +
      '    <span class="pd-avatar" aria-hidden="true">' + esc(initials) + '</span>' +
      '    <strong>' + esc(patient.name || 'Patient') + '</strong>' +
      '    <small>' + esc(patient.id) + '</small>' +
      '  </div>' +
      '  <nav aria-label="Patient sections">' +
      [['pdOverview','Vitals Overview','🧬'],['pdContact','Contact','☎'],['pdIdentity','Identity','♙'],['pdNotes','Notes','☷'],['pdAnatomy','Test Anatomy','◎']].map(function(item,index){
        return '<button type="button" data-pd-section="'+item[0]+'" aria-pressed="'+(index===0?'true':'false')+'" class="'+(index===0?'active':'')+'"><span aria-hidden="true">'+item[2]+'</span>'+item[1]+'</button>';
      }).join('') +
      '  </nav>' +
      '  <a href="#/patients" class="pd-menu-back">← All Patients</a>' +
      '</aside>' +

      // Center & Right Main Vitals Overview Layout
      '<div class="pd-layout-vitals" id="pdOverview">' +
      // Patient Title & Subtitle matching Nexura Care
      '  <div class="vitals-header-title-block">' +
      '    <h2>' + esc(patient.name || 'Patient') + ' Vitals Overview</h2>' +
      '    <p>Real-time monitoring of current physiological metrics and trends.</p>' +
      '  </div>' +

      // 2-Column Responsive Main Grid
      '  <div class="vitals-main-grid">' +
      // LEFT COLUMN (~60%)
      '    <div class="vitals-left-col">' +
      // CARD 1: Stress Patterns Overview
      '      <div class="vitals-card">' +
      '        <div class="vitals-card-head">' +
      '          <h3>Stress Patterns Overview</h3>' +
      '          <div class="vitals-month-pill" id="btnMonthPicker">April, 2026 ▾</div>' +
      '        </div>' +

      // Date Timeline Strip
      '        <div class="vitals-timeline-strip">' +
      '          <button class="vitals-timeline-arrow" id="btnDayPrev" type="button">‹</button>' +
      '          <div style="display:flex;align-items:center;gap:6px;overflow-x:auto;flex:1;justify-content:space-around" id="vitalsDaysTrack">' +
      datePillsHtml +
      '          </div>' +
      '          <button class="vitals-timeline-arrow" id="btnDayNext" type="button">›</button>' +
      '        </div>' +

      // Stress Gauge & Trends
      '        <div class="vitals-stress-row">' +
      '          <div class="vitals-radial-gauge-box" id="gaugeBox">' +
      renderRadialGaugeSvg(curDay.avg) +
      '            <div class="vitals-gauge-inner">' +
      '              <div class="gauge-pct" id="gaugePctText">' + curDay.avg + '%</div>' +
      '              <div class="gauge-lbl">Avg Stres Level</div>' +
      '            </div>' +
      '          </div>' +

      '          <div class="vitals-stress-info">' +
      '            <h4>Daily Stress Trends</h4>' +
      '            <p id="stressTrendsDesc">' + esc(curDay.desc) + '</p>' +
      '            <div class="vitals-peak-stats">' +
      '              <div class="vitals-stat-item">' +
      '                <span class="vitals-stat-lbl">↗ Highest Peak</span>' +
      '                <span class="vitals-stat-val" id="highestPeakVal"><span>' + curDay.peak + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.peakBpm + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.peakTime + '</span></span>' +
      '              </div>' +
      '              <div class="vitals-stat-item">' +
      '                <span class="vitals-stat-lbl">✓ Lowest Point</span>' +
      '                <span class="vitals-stat-val" id="lowestPointVal"><span>' + curDay.low + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.lowBpm + '</span><span class="vitals-stat-sep">|</span><span>' + curDay.lowTime + '</span></span>' +
      '              </div>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      // Sub-cards Row
      '      <div class="vitals-subcards-row">' +
      // Sub-card 1: Daily Rehabilitation Plan
      '        <div class="vitals-card">' +
      '          <div class="vitals-card-head">' +
      '            <h3>Daily Rehabilitation Plan</h3>' +
      '            <button class="card-action-btn" type="button" title="Plan options">⋮</button>' +
      '          </div>' +
      '          <div class="vitals-subcard-subtitle" id="rehabSubtitle">' + esc(curOrg.rehabSub) + '</div>' +
      '          <div class="vitals-rehab-list" id="rehabListWrap">' +
      renderRehabPlanHtml(curOrg.rehabPlan) +
      '          </div>' +
      '        </div>' +

      // Sub-card 2: Capacity Efficiency & Medication Adherence
      '        <div class="vitals-card">' +
      '          <div class="vitals-efficiency-section">' +
      '            <div class="vitals-card-head" style="margin-bottom:6px">' +
      '              <h3 id="organEffTitle">' + esc(curOrg.effTitle) + '</h3>' +
      '              <button class="card-action-btn" type="button" title="Efficiency options">⋮</button>' +
      '            </div>' +
      '            <div class="vitals-risk-tag ' + curOrg.riskClass + '" id="organRiskTag">' + esc(curOrg.risk) + '</div>' +
      '            <div class="vitals-big-score" id="organScoreVal">' + curOrg.score + '%</div>' +
      '            <div class="vitals-progress-track">' +
      '              <div class="vitals-progress-fill" id="organProgressFill" style="width:' + curOrg.score + '%;background:' + curOrg.barGrad + '"></div>' +
      '            </div>' +
      '            <div class="vitals-progress-labels">' +
      '              <span>0</span><span>100%</span>' +
      '            </div>' +
      '          </div>' +

      // Medication Adherence section
      '          <div>' +
      '            <div class="vitals-card-head" style="margin-bottom:4px">' +
      '              <h3>Medication Adherence</h3>' +
      '              <button class="card-action-btn" type="button" title="Medication options">⋮</button>' +
      '            </div>' +
      '            <div class="vitals-subcard-subtitle" id="medsSubtitle">' + esc(curOrg.medsSub) + '</div>' +
      '            <div class="vitals-med-list" id="medsListWrap">' +
      renderMedListHtml(curOrg.meds) +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      // Collapsible Demographics Bar (Overview Card)
      '      <div class="pd-card" style="margin-top:16px">' +
      '        <div class="pd-header"><div><h3>Patient Details Overview</h3><p class="pd-sub">Clinical demographic record</p></div><span class="pd-avatar" aria-hidden="true">' + esc(initials) + '</span></div>' +
      fields([['Patient ID',patient.id],['Age',patient.age==null?'':patient.age+' years'],['Gender',patient.gender||patient.sex],['Blood group',patient.blood],['Date of birth',patient.dob],['Registered',registered]],'pd-grid') +
      '      </div>' +

      // Contact & Identity & Notes
      '      <div class="pd-lower" style="margin-top:16px">' +
      '        <article class="pd-card" id="pdContact"><h3>Contact Details</h3><p class="pd-sub">Patient contact information</p>' + fields([['Phone',patient.phone],['WhatsApp',patient.whatsapp],['Email',patient.email],['Address',patient.address]],'pd-list') + '</article>' +
      '        <div class="pd-stack">' +
      '          <article class="pd-card" id="pdIdentity"><h3>Identity &amp; Referring Doctor</h3>' + fields([['Father / guardian',patient.father],['CNIC',patient.cnic],['Referring doctor',doctor]],'pd-list') + '</article>' +
      '          <article class="pd-card" id="pdNotes"><h3>Patient Notes</h3><p class="pd-notes">' + esc(patient.notes||'Not recorded') + '</p></article>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      // RIGHT COLUMN: INTERACTIVE ORGAN ANATOMICAL MODEL STAGE (~40%)
      '    <div class="vitals-right-col">' +
      '      <div class="vitals-stage-card">' +
      // Floating Zoom Controls
      '        <div class="vitals-stage-controls">' +
      '          <button class="stage-ctrl-btn" id="btnZoomIn" type="button" title="Zoom In">+</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomReset" type="button" title="Reset View">✥</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomOut" type="button" title="Zoom Out">−</button>' +
      '        </div>' +

      // Central Organ Visualizer Display
      '        <div class="vitals-organ-canvas-wrap">' +
      '          <div class="vitals-organ-interactive-box" id="organInteractiveBox">' +
      renderStageOrganSvg('lung') +
      '          </div>' +
      '        </div>' +

      // Floating Clinical Warning Callout Card
      '        <div class="vitals-floating-warning" id="organWarningCard">' +
      '          <div class="vitals-warning-badge-row">' +
      '            <span>⚠️</span><span id="warningBadgeTitle">' + esc(curOrg.warningTitle) + '</span>' +
      '          </div>' +
      '          <p class="vitals-warning-desc" id="warningBadgeDesc">' + esc(curOrg.warningDesc) + '</p>' +
      '        </div>' +

      // Bottom Organ Carousel Selector
      '        <div class="vitals-organ-carousel">' +
      '          <button class="vitals-carousel-nav" id="btnCarouselPrev" type="button">‹</button>' +
      '          <div class="vitals-carousel-track" id="organCarouselTrack">' +
      carouselThumbsHtml +
      '          </div>' +
      '          <button class="vitals-carousel-nav" id="btnCarouselNext" type="button">›</button>' +
      '        </div>' +
      '      </div>' +

      // Visual Laboratory Test Anatomy Correlator
      '      <div class="pd-visual" id="pdAnatomy" style="margin-top:16px"><label class="pd-test-label" for="pdTestSelect">Test anatomy</label><select id="pdTestSelect" class="pd-test-select" aria-label="Select test anatomy">'+(tests.length?tests.map(function(test,index){return '<option value="'+index+'">'+esc(test.name)+' · '+esc(test.date?String(test.date).slice(0,10):'Date not recorded')+'</option>';}).join(''):'<option>No ordered tests</option>')+'</select><div class="pd-art"><div data-pd-anatomy>'+anatomy(tests[0])+'</div><div class="pd-zoom"><button type="button" data-pd-zoom="in" aria-label="Zoom in">+</button><button type="button" data-pd-reset aria-label="Reset image">↔</button><button type="button" data-pd-zoom="out" aria-label="Zoom out">−</button></div></div>'+
      '      <p class="pd-caption">Blue: test-related area · Red: abnormal report value.<br>Illustration only; not an exact disease location or a patient scan.</p></div>' +
      '    </div>' +
      '  </div>' +
      '</div>' +
      '</div>' +
      '</section>';
  }

  function mount(host, patient) {
    if (!host || !host.isConnected) return false;
    if (!document.getElementById('ptDashboardStyles')) {
      var link = document.createElement('link');link.id='ptDashboardStyles';link.rel='stylesheet';
      link.href='assets/css/patient-dashboard.css?v='+encodeURIComponent(window.__ASSET_V||'298');document.head.appendChild(link);
    }
    host.innerHTML=render(patient);

    var curOrganKey = 'lung';
    var curDayIdx = 4;
    var organZoom = 1.0;
    var organKeys = ['liver', 'lung', 'heart', 'kidneys', 'brain'];

    // Day Timeline updates
    function updateDay(idx) {
      if (idx < 0) idx = 0;
      if (idx >= DAYS_DATA.length) idx = DAYS_DATA.length - 1;
      curDayIdx = idx;
      var day = DAYS_DATA[curDayIdx];

      host.querySelectorAll('#vitalsDaysTrack .vitals-day-pill').forEach(function (pill, i) {
        pill.classList.toggle('active', i === curDayIdx);
      });

      var gBox = host.querySelector('#gaugeBox');
      if (gBox) {
        gBox.innerHTML = renderRadialGaugeSvg(day.avg) +
          '<div class="vitals-gauge-inner"><div class="gauge-pct">' + day.avg + '%</div><div class="gauge-lbl">Avg Stres Level</div></div>';
      }
      var desc = host.querySelector('#stressTrendsDesc');
      if (desc) desc.textContent = day.desc;

      var hPeak = host.querySelector('#highestPeakVal');
      if (hPeak) hPeak.innerHTML = '<span>' + day.peak + '</span><span class="vitals-stat-sep">|</span><span>' + day.peakBpm + '</span><span class="vitals-stat-sep">|</span><span>' + day.peakTime + '</span>';

      var lPoint = host.querySelector('#lowestPointVal');
      if (lPoint) lPoint.innerHTML = '<span>' + day.low + '</span><span class="vitals-stat-sep">|</span><span>' + day.lowBpm + '</span><span class="vitals-stat-sep">|</span><span>' + day.lowTime + '</span>';
    }

    host.querySelectorAll('#vitalsDaysTrack .vitals-day-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var idx = parseInt(pill.getAttribute('data-day-idx'), 10);
        updateDay(idx);
      });
    });

    var dayPrev = host.querySelector('#btnDayPrev');
    if (dayPrev) dayPrev.addEventListener('click', function () { updateDay(curDayIdx - 1); });
    var dayNext = host.querySelector('#btnDayNext');
    if (dayNext) dayNext.addEventListener('click', function () { updateDay(curDayIdx + 1); });

    // Organ Selection in Carousel
    function switchOrgan(key) {
      if (!ORGAN_DATA[key]) return;
      curOrganKey = key;
      var org = ORGAN_DATA[curOrganKey];

      host.querySelectorAll('#organCarouselTrack .vitals-organ-pill').forEach(function (pill) {
        pill.classList.toggle('active', pill.getAttribute('data-organ-pill') === key);
      });

      var box = host.querySelector('#organInteractiveBox');
      if (box) {
        box.style.opacity = '0.3';
        setTimeout(function () {
          box.innerHTML = renderStageOrganSvg(key);
          box.style.opacity = '1';
        }, 150);
      }

      var wTitle = host.querySelector('#warningBadgeTitle');
      if (wTitle) wTitle.textContent = org.warningTitle;
      var wDesc = host.querySelector('#warningBadgeDesc');
      if (wDesc) wDesc.textContent = org.warningDesc;

      var effTitle = host.querySelector('#organEffTitle');
      if (effTitle) effTitle.textContent = org.effTitle;
      var riskTag = host.querySelector('#organRiskTag');
      if (riskTag) {
        riskTag.textContent = org.risk;
        riskTag.className = 'vitals-risk-tag ' + org.riskClass;
      }
      var scoreVal = host.querySelector('#organScoreVal');
      if (scoreVal) scoreVal.textContent = org.score + '%';
      var progFill = host.querySelector('#organProgressFill');
      if (progFill) {
        progFill.style.width = org.score + '%';
        progFill.style.background = org.barGrad;
      }

      var rSub = host.querySelector('#rehabSubtitle');
      if (rSub) rSub.textContent = org.rehabSub;
      var rWrap = host.querySelector('#rehabListWrap');
      if (rWrap) rWrap.innerHTML = renderRehabPlanHtml(org.rehabPlan);

      var mSub = host.querySelector('#medsSubtitle');
      if (mSub) mSub.textContent = org.medsSub;
      var mWrap = host.querySelector('#medsListWrap');
      if (mWrap) mWrap.innerHTML = renderMedListHtml(org.meds);
    }

    host.querySelectorAll('#organCarouselTrack .vitals-organ-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        switchOrgan(pill.getAttribute('data-organ-pill'));
      });
    });

    var carPrev = host.querySelector('#btnCarouselPrev');
    if (carPrev) carPrev.addEventListener('click', function () {
      var idx = organKeys.indexOf(curOrganKey);
      var nxt = (idx - 1 + organKeys.length) % organKeys.length;
      switchOrgan(organKeys[nxt]);
    });
    var carNext = host.querySelector('#btnCarouselNext');
    if (carNext) carNext.addEventListener('click', function () {
      var idx = organKeys.indexOf(curOrganKey);
      var nxt = (idx + 1) % organKeys.length;
      switchOrgan(organKeys[nxt]);
    });

    // Zoom Controls on Organ Visualizer
    var boxEl = host.querySelector('#organInteractiveBox');
    function applyOrganZoom(z) {
      organZoom = Math.max(0.75, Math.min(1.75, z));
      if (boxEl) boxEl.style.transform = 'scale(' + organZoom + ')';
    }
    var zIn = host.querySelector('#btnZoomIn');
    if (zIn) zIn.addEventListener('click', function () { applyOrganZoom(organZoom + 0.25); });
    var zOut = host.querySelector('#btnZoomOut');
    if (zOut) zOut.addEventListener('click', function () { applyOrganZoom(organZoom - 0.25); });
    var zReset = host.querySelector('#btnZoomReset');
    if (zReset) zReset.addEventListener('click', function () { applyOrganZoom(1.0); });

    // Laboratory Body Anatomy frame controls
    var image = host.querySelector('.pd-body-frame'), zoom = 1;
    var tests = testsFor(patient);
    var select = host.querySelector('#pdTestSelect');
    if (select) {
      select.addEventListener('change', function(event) {
        var targetAnatomy = host.querySelector('[data-pd-anatomy]');
        if (targetAnatomy) targetAnatomy.innerHTML = anatomy(tests[Number(event.target.value)]);
        image = host.querySelector('.pd-body-frame');
        zoom = 1;
      });
    }
    host.querySelectorAll('[data-pd-zoom]').forEach(function(button){
      button.addEventListener('click',function(){
        zoom=Math.max(.8,Math.min(1.25,zoom+(button.getAttribute('data-pd-zoom')==='in'?.1:-.1)));
        if (image) image.style.transform='scale('+zoom+')';
      });
    });
    var resetBtn = host.querySelector('[data-pd-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click',function(){zoom=1;if(image)image.style.transform='scale(1)';});
    }

    // Section scroll/highlighting navigation
    host.querySelectorAll('[data-pd-section]').forEach(function(button){
      button.addEventListener('click',function(){
        var target=host.querySelector('#'+button.getAttribute('data-pd-section'));
        host.querySelectorAll('[data-pd-section]').forEach(function(b){
          b.classList.toggle('active',b===button);
          b.setAttribute('aria-pressed',b===button?'true':'false');
        });
        if(target){
          target.scrollIntoView({behavior:'smooth',block:'nearest'});
          target.classList.add('pd-highlight');
          setTimeout(function(){target.classList.remove('pd-highlight');},1200);
        }
      });
    });

    return true;
  }

  App.patientDashboard = {
    render: render,
    mount: mount,
    regionFor: regionFor,
    testsFor: testsFor,
    outsideRange: outsideRange
  };
})();
