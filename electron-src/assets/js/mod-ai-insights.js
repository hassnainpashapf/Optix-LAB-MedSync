/* ============================================================
   Optix Medical Sync — AI Clinical Decision Support & Recommendations
   Analyzes lab report values, detects abnormalities, and generates
   5 structured clinical solutions for doctors:
     1. 🩺 Clinical Diagnosis & Pattern Interpretation
     2. 💊 Recommended Medications & Dosage Guidelines
     3. 🥗 Dietary & Lifestyle Management Plan
     4. 🔬 Recommended Confirmatory & Follow-up Tests
     5. ⚠️ Red Flags, Urgent Precautions & Specialist Referral
   
   PRO CLINICAL EXTENSIONS:
     🧮 Automated Clinical Calculators & Medical Indices
        - Mentzer Index (Thalassemia Minor vs Iron Deficiency Anemia)
        - eGFR (CKD-EPI 2021 Race-Free Equation for Kidney Staging 1-5)
        - FIB-4 Liver Fibrosis Score & APRI Index
        - De Ritis Ratio (AST / ALT)
        - Atherogenic Lipoprotein Ratios (Chol/HDL, TG/HDL)
     ⚠️ Organ-Specific Drug Safety Shield (Renal, Hepatic, Bleeding)
     📈 Longitudinal Multi-Report Trend & Delta Velocity
     🇵🇰 Bilingual Patient Care Guide (Roman Urdu Khurak & Parhez)
     🖨️ 1-Click Digital Doctor Prescription Pad (Official Rx Pad)
     ⚡ 1-Tap Follow-Up Lab Test Re-ordering
   ============================================================ */
(function () {
  'use strict';

  var AI = {};

  /* ---------------- Medical Normal Range & Clinical Rule Knowledge Base ---------------- */
  var KNOWLEDGE = {
    // Hematology
    hb: {
      name: 'Hemoglobin', unit: 'g/dL',
      eval: function (v, sex) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        var min = (sex === 'female' || sex === 'f') ? 12.0 : 13.0;
        var max = (sex === 'female' || sex === 'f') ? 15.5 : 17.5;
        if (num < 7.0) return { status: 'critical_low', val: num, note: 'Severe Anemia (Transfusion Threshold)' };
        if (num < min) return { status: 'low', val: num, note: 'Anemia' };
        if (num > max) return { status: 'high', val: num, note: 'Polycythemia' };
        return { status: 'normal', val: num };
      }
    },
    wbc: {
      name: 'Total Leukocyte Count (WBC)', unit: '/uL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 25000) return { status: 'critical_high', val: num, note: 'Hyperleukocytosis / Leukemoid Reaction' };
        if (num > 11000) return { status: 'high', val: num, note: 'Leukocytosis (Infection / Inflammation)' };
        if (num < 4000) return { status: 'low', val: num, note: 'Leukopenia (Viral / Bone Marrow Suppression)' };
        return { status: 'normal', val: num };
      }
    },
    plt: {
      name: 'Platelet Count', unit: '/uL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 30000) return { status: 'critical_low', val: num, note: 'Severe Thrombocytopenia (Bleeding Risk)' };
        if (num < 150000) return { status: 'low', val: num, note: 'Thrombocytopenia' };
        if (num > 450000) return { status: 'high', val: num, note: 'Thrombocytosis' };
        return { status: 'normal', val: num };
      }
    },
    mcv: {
      name: 'MCV', unit: 'fL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 80) return { status: 'low', val: num, note: 'Microcytosis' };
        if (num > 100) return { status: 'high', val: num, note: 'Macrocytosis' };
        return { status: 'normal', val: num };
      }
    },
    rbc: {
      name: 'Red Blood Cell Count (RBC)', unit: 'x10^6/uL',
      eval: function (v, sex) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 100) num = num / 1000000;
        var min = (sex === 'female' || sex === 'f') ? 3.8 : 4.3;
        var max = (sex === 'female' || sex === 'f') ? 5.2 : 5.9;
        if (num < min) return { status: 'low', val: num, note: 'Decreased RBC Count' };
        if (num > max) return { status: 'high', val: num, note: 'Elevated RBC Count' };
        return { status: 'normal', val: num };
      }
    },
    // Diabetes / Sugar
    glucose_fasting: {
      name: 'Fasting Blood Glucose', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 60) return { status: 'critical_low', val: num, note: 'Hypoglycemia' };
        if (num >= 126) return { status: 'high', val: num, note: 'Diabetic Hyperglycemia' };
        if (num >= 100) return { status: 'borderline_high', val: num, note: 'Impaired Fasting Glucose (Pre-Diabetes)' };
        return { status: 'normal', val: num };
      }
    },
    glucose_random: {
      name: 'Random Blood Glucose', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 65) return { status: 'critical_low', val: num, note: 'Hypoglycemia' };
        if (num >= 200) return { status: 'high', val: num, note: 'Diabetic Hyperglycemia' };
        if (num >= 140) return { status: 'borderline_high', val: num, note: 'Impaired Glucose Tolerance' };
        return { status: 'normal', val: num };
      }
    },
    hba1c: {
      name: 'HbA1c', unit: '%',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num >= 9.0) return { status: 'critical_high', val: num, note: 'Poor Glycemic Control' };
        if (num >= 6.5) return { status: 'high', val: num, note: 'Diabetes Mellitus' };
        if (num >= 5.7) return { status: 'borderline_high', val: num, note: 'Pre-Diabetes' };
        return { status: 'normal', val: num };
      }
    },
    // Liver / LFT
    alt: {
      name: 'ALT (SGPT)', unit: 'U/L',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 300) return { status: 'critical_high', val: num, note: 'Severe Acute Hepatocellular Injury' };
        if (num > 45) return { status: 'high', val: num, note: 'Elevated ALT (Hepatocellular Injury / NAFLD)' };
        return { status: 'normal', val: num };
      }
    },
    ast: {
      name: 'AST (SGOT)', unit: 'U/L',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 300) return { status: 'critical_high', val: num, note: 'Severe Acute Hepatic/Myocardial Injury' };
        if (num > 40) return { status: 'high', val: num, note: 'Elevated AST' };
        return { status: 'normal', val: num };
      }
    },
    bili_total: {
      name: 'Total Bilirubin', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 5.0) return { status: 'critical_high', val: num, note: 'Overt Jaundice / Hyperbilirubinemia' };
        if (num > 1.2) return { status: 'high', val: num, note: 'Jaundice / Hyperbilirubinemia' };
        return { status: 'normal', val: num };
      }
    },
    alp: {
      name: 'Alkaline Phosphatase (ALP)', unit: 'U/L',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 280) return { status: 'high', val: num, note: 'Cholestasis / Bone Turnover' };
        return { status: 'normal', val: num };
      }
    },
    albumin: {
      name: 'Serum Albumin', unit: 'g/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 2.5) return { status: 'critical_low', val: num, note: 'Severe Hypoalbuminemia' };
        if (num < 3.5) return { status: 'low', val: num, note: 'Hypoalbuminemia' };
        return { status: 'normal', val: num };
      }
    },
    // Kidney / RFT
    creatinine: {
      name: 'Serum Creatinine', unit: 'mg/dL',
      eval: function (v, sex) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        var limit = (sex === 'female' || sex === 'f') ? 1.1 : 1.3;
        if (num > 3.0) return { status: 'critical_high', val: num, note: 'Severe Renal Impairment / AKI' };
        if (num > limit) return { status: 'high', val: num, note: 'Elevated Creatinine (Azotemia)' };
        return { status: 'normal', val: num };
      }
    },
    urea: {
      name: 'Blood Urea / BUN', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 80) return { status: 'critical_high', val: num, note: 'Severe Uremia' };
        if (num > 45) return { status: 'high', val: num, note: 'Uremia / Azotemia' };
        return { status: 'normal', val: num };
      }
    },
    uric_acid: {
      name: 'Serum Uric Acid', unit: 'mg/dL',
      eval: function (v, sex) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        var limit = (sex === 'female' || sex === 'f') ? 6.0 : 7.0;
        if (num > limit) return { status: 'high', val: num, note: 'Hyperuricemia (Gout Risk)' };
        return { status: 'normal', val: num };
      }
    },
    // Lipids
    cholesterol: {
      name: 'Total Cholesterol', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num >= 240) return { status: 'high', val: num, note: 'High Cholesterol' };
        if (num >= 200) return { status: 'borderline_high', val: num, note: 'Borderline High Cholesterol' };
        return { status: 'normal', val: num };
      }
    },
    triglycerides: {
      name: 'Triglycerides', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num >= 500) return { status: 'critical_high', val: num, note: 'Severe Hypertriglyceridemia (Pancreatitis Risk)' };
        if (num >= 200) return { status: 'high', val: num, note: 'Elevated Triglycerides' };
        return { status: 'normal', val: num };
      }
    },
    ldl: {
      name: 'LDL Cholesterol', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num >= 160) return { status: 'high', val: num, note: 'High Atherogenic LDL' };
        if (num >= 130) return { status: 'borderline_high', val: num, note: 'Borderline High LDL' };
        return { status: 'normal', val: num };
      }
    },
    hdl: {
      name: 'HDL Cholesterol', unit: 'mg/dL',
      eval: function (v, sex) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        var limit = (sex === 'female' || sex === 'f') ? 50 : 40;
        if (num < limit) return { status: 'low', val: num, note: 'Low Protective HDL' };
        return { status: 'normal', val: num };
      }
    },
    // Thyroid
    tsh: {
      name: 'TSH (Thyroid Stimulating Hormone)', unit: 'uIU/mL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 10.0) return { status: 'critical_high', val: num, note: 'Overt Primary Hypothyroidism' };
        if (num > 4.5) return { status: 'high', val: num, note: 'Elevated TSH (Hypothyroidism)' };
        if (num < 0.3) return { status: 'low', val: num, note: 'Suppressed TSH (Hyperthyroidism)' };
        return { status: 'normal', val: num };
      }
    },
    // Urine
    urine_pus: {
      name: 'Urine Pus Cells', unit: '/HPF',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 25) return { status: 'critical_high', val: num, note: 'Severe Pyuria (Acute UTI)' };
        if (num > 5) return { status: 'high', val: num, note: 'Pyuria (Urinary Tract Infection)' };
        return { status: 'normal', val: num };
      }
    }
  };

  /* Helper to normalize test/param names to knowledge keys */
  function matchKey(name) {
    var s = String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (s.indexOf('hemoglobin') >= 0 || s === 'hb' || s === 'haemoglobin') return 'hb';
    if (s.indexOf('totalleukocyte') >= 0 || s === 'tlc' || s === 'wbc' || s.indexOf('whiteblood') >= 0) return 'wbc';
    if (s.indexOf('platelet') >= 0 || s === 'plt') return 'plt';
    if (s === 'mcv' || s.indexOf('meanovular') >= 0 || s.indexOf('meancorpuscular') >= 0) return 'mcv';
    if (s.indexOf('redblood') >= 0 || s === 'rbc' || s.indexOf('erythrocyte') >= 0) return 'rbc';
    if (s.indexOf('fastingblood') >= 0 || s.indexOf('bloodsugarfast') >= 0 || s === 'fbs' || (s.indexOf('fasting') >= 0 && s.indexOf('glucose') >= 0)) return 'glucose_fasting';
    if (s.indexOf('randomblood') >= 0 || s.indexOf('bloodsugarran') >= 0 || s === 'rbs' || (s.indexOf('random') >= 0 && s.indexOf('glucose') >= 0)) return 'glucose_random';
    if (s.indexOf('glucose') >= 0 || s.indexOf('sugar') >= 0) return 'glucose_random';
    if (s.indexOf('hba1c') >= 0 || s.indexOf('glycated') >= 0) return 'hba1c';
    if (s === 'alt' || s === 'sgpt' || s.indexOf('alanine') >= 0) return 'alt';
    if (s === 'ast' || s === 'sgot' || s.indexOf('aspartate') >= 0) return 'ast';
    if (s.indexOf('totalbilirubin') >= 0 || s === 'bilirubintotal' || s === 'bilirubin') return 'bili_total';
    if (s.indexOf('alkaline') >= 0 || s === 'alp') return 'alp';
    if (s === 'albumin' || s.indexOf('serumalbumin') >= 0) return 'albumin';
    if (s.indexOf('creatinine') >= 0) return 'creatinine';
    if (s.indexOf('urea') >= 0 || s === 'bun') return 'urea';
    if (s.indexOf('uricacid') >= 0) return 'uric_acid';
    if (s.indexOf('totalchol') >= 0 || s === 'cholesterol' || s === 'totalcholesterol' || (s.indexOf('cholesterol') >= 0 && s.indexOf('hdl') < 0 && s.indexOf('ldl') < 0)) return 'cholesterol';
    if (s.indexOf('triglyceride') >= 0 || s === 'tg') return 'triglycerides';
    if (s === 'ldl' || s.indexOf('ldlchol') >= 0) return 'ldl';
    if (s === 'hdl' || s.indexOf('hdlchol') >= 0 || s.indexOf('highdensity') >= 0) return 'hdl';
    if (s === 'tsh' || s.indexOf('thyroidstim') >= 0) return 'tsh';
    if (s.indexOf('puscell') >= 0 || s.indexOf('wbcspus') >= 0) return 'urine_pus';
    return null;
  }

  /* Extract all numerical values mapped by knowledge key */
  AI.extractRawValues = function (reportData) {
    var vals = {};
    if (!reportData) return vals;
    var groups = reportData.groups || reportData.readyRows || [];
    groups.forEach(function (grp) {
      var params = (grp.test && grp.test.params) || grp.params || [];
      var resVals = (grp.res && grp.res.values) || grp.values || {};
      if (Array.isArray(params) && params.length) {
        params.forEach(function (p) {
          var v = resVals[p.id] !== undefined ? resVals[p.id] : resVals[p.name];
          var k = matchKey(p.name || p.id);
          if (k && v !== undefined && v !== null && String(v).trim() !== '') {
            var n = parseFloat(v);
            if (!isNaN(n)) vals[k] = n;
          }
        });
      } else if (typeof resVals === 'object' && resVals !== null) {
        Object.keys(resVals).forEach(function (kId) {
          var k = matchKey(kId);
          var v = resVals[kId];
          if (k && v !== undefined && v !== null && String(v).trim() !== '') {
            var n = parseFloat(v);
            if (!isNaN(n)) vals[k] = n;
          }
        });
      }
    });
    return vals;
  };

  /* Extract abnormal findings from report parameters */
  AI.extractFindings = function (reportData) {
    var findings = [];
    if (!reportData) return findings;
    var pt = reportData.pt || reportData.pat || reportData.patient || {};
    var sex = String(pt.sex || pt.gender || '').toLowerCase();
    var groups = reportData.groups || reportData.readyRows || [];

    groups.forEach(function (grp) {
      var params = (grp.test && grp.test.params) || (grp.params) || [];
      var vals = (grp.res && grp.res.values) || grp.values || {};
      var tName = (grp.test && grp.test.name) || grp.testName || '';

      var rowsToScan = [];
      if (Array.isArray(params) && params.length) {
        params.forEach(function (p) {
          var val = vals[p.id] !== undefined ? vals[p.id] : vals[p.name];
          rowsToScan.push({ id: p.id, name: p.name, unit: p.unit, ref: p.ref || p.normal, val: val });
        });
      } else if (typeof vals === 'object' && vals !== null) {
        Object.keys(vals).forEach(function (k) {
          rowsToScan.push({ id: k, name: k, unit: '', ref: '', val: vals[k] });
        });
      }

      rowsToScan.forEach(function (p) {
        var rawVal = p.val;
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') return;
        var k = matchKey(p.name || p.id);
        var rule = k ? KNOWLEDGE[k] : null;
        if (rule) {
          var ev = rule.eval(rawVal, sex);
          if (ev && ev.status !== 'normal') {
            findings.push({
              key: k,
              paramName: p.name || rule.name,
              value: rawVal,
              val: ev.val,
              unit: p.unit || rule.unit,
              status: ev.status,
              note: ev.note,
              testName: tName
            });
          }
        } else {
          // Fallback: check flagged status in test parameters if flagged as H or L
          var num = parseFloat(rawVal);
          var ref = p.ref || '';
          if (!isNaN(num) && ref) {
            var m = ref.match(/([0-9.]+)\s*[-–—to]+\s*([0-9.]+)/i);
            if (m) {
              var low = parseFloat(m[1]), high = parseFloat(m[2]);
              if (num < low) findings.push({ key: 'custom_low', paramName: p.name, value: rawVal, unit: p.unit || '', status: 'low', note: 'Below Normal Limit', testName: tName });
              else if (num > high) findings.push({ key: 'custom_high', paramName: p.name, value: rawVal, unit: p.unit || '', status: 'high', note: 'Above Normal Limit', testName: tName });
            }
          }
        }
      });
    });
    return findings;
  };

  /* ---------------- PRO FEATURE 1: Automated Clinical Calculators & Medical Indices ---------------- */
  AI.calculateIndices = function (reportData, findings) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var age = parseFloat(pt.age) || 45;
    var sexStr = String(pt.sex || pt.gender || 'male').toLowerCase();
    var isFem = (sexStr === 'female' || sexStr === 'f');

    var list = [];

    // 1. Mentzer Index (MCV / RBC)
    if (rawVals.mcv != null && rawVals.rbc != null) {
      var rbcCount = rawVals.rbc > 100 ? (rawVals.rbc / 1000000) : rawVals.rbc;
      if (rbcCount > 0) {
        var mIndex = rawVals.mcv / rbcCount;
        var mScore = Math.round(mIndex * 100) / 100;
        var isThal = mScore < 13;
        var isIda = mScore > 13;
        list.push({
          id: 'mentzer',
          name: 'Mentzer Index (MCV / RBC)',
          formula: 'MCV (' + rawVals.mcv + ') ÷ RBC (' + rbcCount.toFixed(2) + ')',
          score: mScore,
          unit: 'ratio',
          category: 'Hematology',
          status: isThal ? 'warning' : 'info',
          statusLabel: isThal ? 'Thalassemia Minor Trait Pattern' : (isIda ? 'Iron Deficiency Anemia (IDA) Pattern' : 'Borderline Index'),
          interpretation: isThal
            ? 'Score < 13 strongly suggests Thalassemia Minor trait (impaired beta-globin synthesis with microcytosis and preserved/elevated RBC count).'
            : 'Score > 13 strongly suggests Iron Deficiency Anemia (impaired hemoglobinization with proportional reduction in RBC production).',
          recommendation: isThal
            ? 'Order Hb Electrophoresis (HbA2 > 3.5% confirms Beta-Thalassemia trait). Avoid empirical iron overload.'
            : 'Order Serum Ferritin & TIBC. Initiate oral iron supplementation with Vitamin C.'
        });
      }
    }

    // 2. eGFR (CKD-EPI 2021 Race-Free Equation)
    if (rawVals.creatinine != null && rawVals.creatinine > 0) {
      var scr = rawVals.creatinine;
      var k = isFem ? 0.7 : 0.9;
      var alpha = isFem ? -0.241 : -0.302;
      var scrK = scr / k;
      var minPart = Math.pow(Math.min(scrK, 1), alpha);
      var maxPart = Math.pow(Math.max(scrK, 1), -1.200);
      var agePart = Math.pow(0.9938, age);
      var egfrVal = 142 * minPart * maxPart * agePart;
      if (isFem) egfrVal *= 1.012;
      egfrVal = Math.round(egfrVal * 10) / 10;

      var stage = '';
      var stageDesc = '';
      var stageStatus = 'normal';
      if (egfrVal >= 90) { stage = 'Stage 1'; stageDesc = 'Normal or High Kidney Function (≥ 90 mL/min/1.73m²)'; stageStatus = 'safe'; }
      else if (egfrVal >= 60) { stage = 'Stage 2'; stageDesc = 'Mildly Decreased (60–89 mL/min/1.73m²)'; stageStatus = 'info'; }
      else if (egfrVal >= 45) { stage = 'Stage 3a'; stageDesc = 'Mild to Moderate Reduction (45–59 mL/min/1.73m²)'; stageStatus = 'warning'; }
      else if (egfrVal >= 30) { stage = 'Stage 3b'; stageDesc = 'Moderate to Severe Reduction (30–44 mL/min/1.73m²)'; stageStatus = 'warning'; }
      else if (egfrVal >= 15) { stage = 'Stage 4'; stageDesc = 'Severely Decreased GFR (15–29 mL/min/1.73m²)'; stageStatus = 'critical'; }
      else { stage = 'Stage 5'; stageDesc = 'Kidney Failure / End-Stage Renal Disease (< 15 mL/min/1.73m²)'; stageStatus = 'critical'; }

      list.push({
        id: 'egfr',
        name: 'eGFR (CKD-EPI 2021 Race-Free)',
        formula: 'Scr ' + scr + ' mg/dL | Age ' + age + 'y | ' + (isFem ? 'Female' : 'Male'),
        score: egfrVal,
        unit: 'mL/min/1.73m²',
        category: 'Renal / Nephrology',
        status: stageStatus,
        statusLabel: stage + ' — ' + stageDesc,
        interpretation: 'Estimated glomerular filtration rate using latest international 2021 CKD-EPI equation without race coefficient.',
        recommendation: egfrVal < 60
          ? 'Strictly avoid NSAIDs. Adjust renally cleared drugs (Metformin, Ciprofloxacin, Aminoglycosides). Order Urine Albumin:Creatinine Ratio (ACR).'
          : 'Preserve adequate hydration. Routine renal follow-up.'
      });
    }

    // 3. FIB-4 Liver Fibrosis Score
    if (rawVals.ast != null && rawVals.alt != null && rawVals.plt != null && rawVals.alt > 0) {
      var pltNorm = rawVals.plt > 1000 ? (rawVals.plt / 1000) : rawVals.plt;
      if (pltNorm > 0) {
        var fib4Val = (age * rawVals.ast) / (pltNorm * Math.sqrt(rawVals.alt));
        fib4Val = Math.round(fib4Val * 100) / 100;
        var fibCutoffLow = (age > 65) ? 2.0 : 1.30;
        var fibStatus = (fib4Val < fibCutoffLow) ? 'safe' : (fib4Val > 2.67 ? 'critical' : 'warning');
        var fibLabel = (fib4Val < fibCutoffLow)
          ? 'Low Risk of Advanced Liver Fibrosis (F0–F1)'
          : (fib4Val > 2.67 ? 'High Risk of Advanced Fibrosis / Cirrhosis (F3–F4)' : 'Indeterminate / Intermediate Risk (Gray Zone)');

        list.push({
          id: 'fib4',
          name: 'FIB-4 Liver Fibrosis Index',
          formula: '(Age ' + age + ' × AST ' + rawVals.ast + ') ÷ (Plt ' + pltNorm.toFixed(0) + ' × √ALT ' + rawVals.alt + ')',
          score: fib4Val,
          unit: 'score',
          category: 'Hepatology',
          status: fibStatus,
          statusLabel: fibLabel,
          interpretation: (fib4Val < fibCutoffLow)
            ? 'Negative predictive value > 90% ruling out advanced bridging fibrosis.'
            : (fib4Val > 2.67 ? 'Positive predictive value ~80% for advanced liver fibrosis (F3–F4) or established cirrhosis.' : 'Intermediate gray zone score; cannot reliably exclude or confirm advanced fibrosis.'),
          recommendation: (fib4Val > 2.67)
            ? 'Arrange urgent Hepatology referral, Liver Ultrasound, and Transient Elastography (FibroScan).'
            : (fib4Val < fibCutoffLow ? 'Reassure patient; repeat assessment annually if metabolic risk factors persist.' : 'Consider secondary non-invasive staging (FibroScan or ELF test).')
        });
      }
    }

    // 4. APRI (AST to Platelet Ratio Index)
    if (rawVals.ast != null && rawVals.plt != null) {
      var pltNormA = rawVals.plt > 1000 ? (rawVals.plt / 1000) : rawVals.plt;
      if (pltNormA > 0) {
        var apriVal = ((rawVals.ast / 40) / pltNormA) * 100;
        apriVal = Math.round(apriVal * 100) / 100;
        var apriStatus = (apriVal < 0.5) ? 'safe' : (apriVal > 1.5 ? 'critical' : 'warning');
        var apriLabel = (apriVal < 0.5) ? 'Low Risk of Significant Fibrosis' : (apriVal > 1.5 ? 'High Risk of Cirrhosis' : 'Significant Fibrosis Likely');

        list.push({
          id: 'apri',
          name: 'APRI (AST to Platelet Ratio Index)',
          formula: '((AST ' + rawVals.ast + ' ÷ 40) ÷ Plt ' + pltNormA.toFixed(0) + ') × 100',
          score: apriVal,
          unit: 'index',
          category: 'Hepatology',
          status: apriStatus,
          statusLabel: apriLabel,
          interpretation: 'Validated biomarker ratio for chronic viral and metabolic liver fibrosis assessment.',
          recommendation: apriVal > 1.5 ? 'High probability of cirrhosis. Check Viral markers (Anti-HCV, HBsAg), PT/INR, and Albumin.' : 'Monitor liver enzymes periodically.'
        });
      }
    }

    // 5. De Ritis Ratio (AST / ALT)
    if (rawVals.ast != null && rawVals.alt != null && rawVals.alt > 0) {
      var deRitis = Math.round((rawVals.ast / rawVals.alt) * 100) / 100;
      var drStatus = (deRitis > 2.0) ? 'warning' : 'safe';
      var drLabel = (deRitis > 2.0)
        ? 'High Ratio (> 2.0) — Alcoholic / Toxic / Cirrhotic Pattern'
        : (deRitis < 1.0 ? 'Ratio < 1.0 — NAFLD / Acute Viral Hepatitis Pattern' : 'Ratio 1.0–2.0 — Mixed / Chronic Hepatitis');

      list.push({
        id: 'deritis',
        name: 'De Ritis Ratio (AST / ALT)',
        formula: 'AST (' + rawVals.ast + ') ÷ ALT (' + rawVals.alt + ')',
        score: deRitis,
        unit: 'ratio',
        category: 'Hepatology',
        status: drStatus,
        statusLabel: drLabel,
        interpretation: (deRitis > 2.0)
          ? 'AST > 2x ALT is classic for alcoholic liver disease, ischemic injury, or late-stage cirrhosis where mitochondrial AST is released.'
          : (deRitis < 1.0 ? 'ALT elevation exceeding AST is typical of non-alcoholic fatty liver disease (NAFLD) and uncomplicated viral hepatitis.' : 'Mixed pattern reflecting chronic ongoing parenchymal inflammation.'),
        recommendation: (deRitis > 2.0)
          ? 'Screen for alcohol history, evaluate synthetic function (INR, Albumin), and screen for portal hypertension.'
          : 'Lifestyle modification, weight management, and screening for metabolic syndrome.'
      });
    }

    // 6. Atherogenic / Lipid Ratios
    if (rawVals.cholesterol != null && rawVals.hdl != null && rawVals.hdl > 0) {
      var tcHdl = Math.round((rawVals.cholesterol / rawVals.hdl) * 100) / 100;
      var tcStatus = (tcHdl > 5.0) ? 'critical' : (tcHdl > 4.0 ? 'warning' : 'safe');
      var tcLabel = (tcHdl > 5.0) ? 'High Atherogenic Risk (> 5.0)' : (tcHdl > 4.0 ? 'Moderate Risk (4.0–5.0)' : 'Optimal Cardioprotective (< 4.0)');
      list.push({
        id: 'castelli',
        name: 'Castelli Risk Index (Total Chol / HDL)',
        formula: 'Cholesterol (' + rawVals.cholesterol + ') ÷ HDL (' + rawVals.hdl + ')',
        score: tcHdl,
        unit: 'ratio',
        category: 'Cardiovascular / Lipids',
        status: tcStatus,
        statusLabel: tcLabel,
        interpretation: 'Strong predictive marker of coronary plaque vulnerability and ischemic heart disease.',
        recommendation: tcHdl > 4.5 ? 'Initiate lipid-lowering statin therapy (Atorvastatin 10-20mg). Dietary fat restriction.' : 'Maintain active cardioprotective diet.'
      });
    }

    if (rawVals.triglycerides != null && rawVals.hdl != null && rawVals.hdl > 0) {
      var tgHdl = Math.round((rawVals.triglycerides / rawVals.hdl) * 100) / 100;
      var tgStatus = (tgHdl > 3.8) ? 'warning' : 'safe';
      var tgLabel = (tgHdl > 3.8) ? 'High Insulin Resistance Marker (> 3.8)' : 'Normal Ratio (< 3.8)';
      list.push({
        id: 'tghdl',
        name: 'TG / HDL Ratio (Insulin Resistance Surrogate)',
        formula: 'Triglycerides (' + rawVals.triglycerides + ') ÷ HDL (' + rawVals.hdl + ')',
        score: tgHdl,
        unit: 'ratio',
        category: 'Metabolic / Endocrine',
        status: tgStatus,
        statusLabel: tgLabel,
        interpretation: 'Elevated TG/HDL ratio serves as an established surrogate marker for small dense LDL particles and insulin resistance.',
        recommendation: tgHdl > 3.8 ? 'Screen for Pre-Diabetes/Diabetes (HbA1c). Reduce carbohydrate and simple sugar consumption.' : 'Normal metabolic lipoprotein balance.'
      });
    }

    return list;
  };

  /* ---------------- PRO FEATURE 2: Organ-Specific Drug Safety Shield ---------------- */
  AI.evaluateDrugSafety = function (reportData, findings, calculatedIndices) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var sexStr = String(pt.sex || pt.gender || 'male').toLowerCase();
    var isFem = (sexStr === 'female' || sexStr === 'f');

    var indices = calculatedIndices || AI.calculateIndices(reportData, findings);
    var egfrItem = indices.filter(function (x) { return x.id === 'egfr'; })[0];
    var egfr = egfrItem ? egfrItem.score : null;

    var alerts = [];

    // --- 1. RENAL SAFETY SHIELD ---
    var cr = rawVals.creatinine;
    var crLimit = isFem ? 1.1 : 1.3;
    if ((cr != null && cr > crLimit) || (egfr != null && egfr < 60)) {
      var isCritRenal = (cr != null && cr > 2.5) || (egfr != null && egfr < 30);
      var contra = [
        'ALL NSAIDs (Diclofenac, Ibuprofen / Brufen, Naproxen, Mefenamic Acid / Ponstan, Ketorolac)'
      ];
      if (egfr != null && egfr < 30) {
        contra.push('Metformin (Strictly contraindicated when eGFR < 30 mL/min due to fatal lactic acidosis risk)');
      }
      var cautions = [];
      if (egfr != null && egfr >= 30 && egfr < 45) {
        cautions.push('Metformin: Dose limit to maximum 1000 mg/day with close renal monitoring');
      }
      cautions.push('Aminoglycoside Antibiotics (Gentamicin, Amikacin): High nephrotoxicity risk; require dose adjustment');
      cautions.push('ACE Inhibitors / ARBs: Monitor serum potassium closely; pause if creatinine increases by ≥ 30% acutely');
      cautions.push('Ciprofloxacin & Renally Cleared Quinolones: Reduce dose according to GFR clearance');

      alerts.push({
        shield: 'Renal Safety Shield (Kidney Guard)',
        organ: 'Renal',
        icon: '🫘',
        status: isCritRenal ? 'critical' : 'warning',
        title: isCritRenal ? 'CRITICAL RENAL HAZARD (eGFR ' + (egfr != null ? egfr : 'Low') + ' | Cr ' + cr + ' mg/dL)' : 'RENAL IMPAIRMENT PRECAUTIONS (Cr ' + cr + ' mg/dL)',
        trigger: 'Serum Creatinine: ' + cr + ' mg/dL' + (egfr != null ? ' | eGFR: ' + egfr + ' mL/min/1.73m²' : ''),
        contraindications: contra,
        cautions: cautions,
        safeAlternatives: [
          'Tab. Paracetamol / Acetaminophen 500mg SOS (Safe analgesic of choice in renal impairment)',
          'Topical analgesics (Lidocaine / Diclofenac transdermal gels)',
          'Adequate oral or IV hydration to prevent pre-renal ischemic insult'
        ]
      });
    }

    // --- 2. HEPATIC SAFETY SHIELD ---
    var alt = rawVals.alt;
    var ast = rawVals.ast;
    var bili = rawVals.bili_total;
    if ((alt != null && alt > 90) || (ast != null && ast > 80) || (bili != null && bili > 2.0)) {
      var isCritHep = (alt != null && alt > 300) || (ast != null && ast > 300) || (bili != null && bili > 5.0);
      var contraH = [
        'High-dose Paracetamol (> 2000mg / 24 hours): High risk of worsening hepatocellular necrosis',
        'Unverified herbal supplements, unstandardized desi tonics, or hepatotoxic home remedies'
      ];
      var cautionsH = [
        'Statins (Atorvastatin, Rosuvastatin): Temporarily hold or halve dose if transaminases > 3x ULN',
        'Co-Amoxiclav (Amoxicillin + Clavulanate): Avoid in cholestatic jaundice or biliary stasis',
        'Macrolides & Antitubercular (ATT) drugs: Require strict serial baseline LFT monitoring'
      ];
      alerts.push({
        shield: 'Hepatic Safety Shield (Liver Guard)',
        organ: 'Hepatic',
        icon: '🫁',
        status: isCritHep ? 'critical' : 'warning',
        title: isCritHep ? 'ACUTE HEPATOCELLULAR INJURY ALERT (Transaminases > 300 U/L)' : 'HEPATIC PRECAUTION (Transaminases / Bilirubin Elevated)',
        trigger: (alt ? 'ALT: ' + alt + ' U/L ' : '') + (ast ? '| AST: ' + ast + ' U/L ' : '') + (bili ? '| Bilirubin: ' + bili + ' mg/dL' : ''),
        contraindications: contraH,
        cautions: cautionsH,
        safeAlternatives: [
          'Cap. Silymarin (Milk Thistle) 140mg BD for hepatocyte membrane stabilization',
          'Tab. Ursodeoxycholic Acid (UDCA) 250mg-300mg BD for cholestatic clearance',
          'Low-dose Paracetamol strictly capped at maximum 2.0g (4 tabs) per day for pain/fever SOS'
        ]
      });
    }

    // --- 3. HEMATOLOGY BLEEDING SHIELD ---
    var plt = rawVals.plt;
    if (plt != null && plt < 80000) {
      var isCritPlt = plt < 30000;
      var contraB = [
        'ALL NSAIDs (Ibuprofen / Brufen, Diclofenac, Ponstan, Naproxen, Ketorolac)',
        'Antiplatelet Agents (Aspirin / Disprin, Clopidogrel)',
        'Anticoagulants (Heparin, Enoxaparin, Warfarin, Rivaroxaban)',
        'Intramuscular (IM) Injections (High risk of massive intramuscular hematoma — use oral or slow IV only)'
      ];
      var cautionsB = [
        'Avoid traumatic procedures, heavy contact sports, and strenuous straining',
        'Use ultra-soft toothbrush; avoid manual razor blades (use electric shaver)',
        'Monitor continuously for mucosal petechiae, gum bleeding, epistaxis, hematuria, or melena (black stools)'
      ];
      if (plt < 20000) {
        cautionsB.push('SPONTANEOUS BLEEDING THRESHOLD (< 20,000 /uL): Prepare for urgent platelet transfusion and hospital admission');
      }
      alerts.push({
        shield: 'Hematology Bleeding Shield (Hemato Guard)',
        organ: 'Hematology',
        icon: '🩸',
        status: isCritPlt ? 'critical' : 'warning',
        title: isCritPlt ? 'CRITICAL THROMBOCYTOPENIC BLEEDING RISK (Platelets < 30,000 /uL)' : 'BLEEDING PRECAUTION (Platelets: ' + plt + ' /uL)',
        trigger: 'Platelet Count: ' + plt + ' /uL',
        contraindications: contraB,
        cautions: cautionsB,
        safeAlternatives: [
          'Tab. Paracetamol 500mg SOS for fever / mild analgesia (Does not inhibit platelet function)',
          'Fresh papaya leaf extract and oral rehydration salts (ORS) for fluid support',
          'Oral or gentle IV route for all necessary therapeutics'
        ]
      });
    }

    return alerts;
  };

  /* ---------------- PRO FEATURE 3: Longitudinal Trend & Delta Velocity ---------------- */
  AI.evaluateHistoricalDelta = function (invoiceId, reportData) {
    var result = {
      hasHistory: false,
      prevInvoice: null,
      comparisons: [],
      velocityAlerts: []
    };

    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var patientId = pt.id || (reportData && reportData.inv && reportData.inv.patientId);
    if (!patientId || !window.DB || typeof DB.all !== 'function') return result;

    var curVals = AI.extractRawValues(reportData);
    var allInvs = (DB.all('invoices') || []).filter(function (x) {
      return x.patientId === patientId && x.id !== invoiceId && x.no !== invoiceId;
    });

    if (!allInvs.length) return result;

    allInvs.sort(function (a, b) {
      var da = new Date(a.date || a.createdAt || 0).getTime();
      var db = new Date(b.date || b.createdAt || 0).getTime();
      return db - da;
    });

    var prevInv = null;
    var prevVals = null;
    for (var i = 0; i < allInvs.length; i++) {
      var cand = allInvs[i];
      var candResults = (DB.all('results') || []).filter(function (r) {
        return r.invoiceId === cand.id || r.invoiceId === cand.no;
      });
      if (candResults.length) {
        var candGroups = candResults.map(function (r) {
          var t = DB.get('tests', r.testId);
          return { test: t, res: r };
        });
        var candRaw = AI.extractRawValues({ groups: candGroups });
        if (Object.keys(candRaw).length) {
          prevInv = cand;
          prevVals = candRaw;
          break;
        }
      }
    }

    if (!prevInv || !prevVals) return result;

    result.hasHistory = true;
    result.prevInvoice = prevInv;

    var monitoredKeys = [
      { key: 'hb', name: 'Hemoglobin', unit: 'g/dL', acuteDrop: 2.0 },
      { key: 'plt', name: 'Platelet Count', unit: '/uL', acutePctDrop: 40 },
      { key: 'creatinine', name: 'Serum Creatinine', unit: 'mg/dL', kdigoSurge: 0.3 },
      { key: 'wbc', name: 'Total Leukocytes (WBC)', unit: '/uL', acuteSpike: 8000 },
      { key: 'alt', name: 'ALT (SGPT)', unit: 'U/L' },
      { key: 'glucose_random', name: 'Blood Glucose', unit: 'mg/dL' },
      { key: 'urea', name: 'Blood Urea', unit: 'mg/dL' }
    ];

    monitoredKeys.forEach(function (m) {
      var cV = curVals[m.key];
      var pV = prevVals[m.key];
      if (cV != null && pV != null) {
        var diff = Math.round((cV - pV) * 100) / 100;
        var dir = (diff > 0) ? 'up' : (diff < 0 ? 'down' : 'same');
        var pct = (pV !== 0) ? Math.round(((diff / pV) * 100) * 10) / 10 : 0;

        var compItem = {
          key: m.key,
          name: m.name,
          unit: m.unit,
          prevVal: pV,
          curVal: cV,
          diff: diff,
          pct: pct,
          dir: dir,
          alert: null
        };

        if (m.key === 'hb' && diff <= -2.0) {
          compItem.alert = 'ACUTE HEMOGLOBIN DROP (' + diff + ' g/dL): Significant drop of ≥ 2.0 g/dL compared to previous test. Evaluate for active internal hemorrhage or acute hemolysis.';
          result.velocityAlerts.push(compItem.alert);
        }

        if (m.key === 'plt' && (pct <= -40 || diff <= -80000)) {
          compItem.alert = 'ACUTE PLATELET CRASH (' + pct + '% drop): Platelet count fell precipitously from ' + pV + ' to ' + cV + '. Characteristic of Dengue critical phase or drug-induced consumption.';
          result.velocityAlerts.push(compItem.alert);
        }

        if (m.key === 'creatinine' && diff >= 0.3) {
          compItem.alert = 'KDIGO AKI CRITERION MET (+ ' + diff + ' mg/dL): Serum Creatinine rose by ≥ 0.3 mg/dL within serial reports. Diagnostic of Acute Kidney Injury Stage 1.';
          result.velocityAlerts.push(compItem.alert);
        }

        result.comparisons.push(compItem);
      }
    });

    return result;
  };

  /* ---------------- PRO FEATURE 4: Bilingual Patient Care Guide (Roman Urdu) ---------------- */
  AI.generateUrduPatientGuide = function (analysis, calculatedIndices, drugSafety) {
    var pt = (analysis && analysis.patient) || {};
    var inv = (analysis && analysis.invoice) || {};
    var findings = (analysis && analysis.findings) || [];
    var has = {};
    findings.forEach(function (f) { has[f.key] = f; });

    var wazahat = [];
    var khurak = [];
    var parhez = [];
    var dawaiSchedule = [];
    var khatraAlamaat = [];

    // Anemia in Urdu
    if (has.hb && has.hb.status.indexOf('low') >= 0) {
      wazahat.push('Aapke khoon mein Hemoglobin ki kami pai gayi hai (Khoon ki kami / Anemia). Is ki wajah se jism mein thakawat, kamzori, sar chakraana aur saans phoolna mehsos ho sakta hai.');
      khurak.push('Khurak mein Palak, Chukandar (Beetroot), Anar, Khajoor, Badaam, Surkh Gosht (Mutton/Beef) aur Kaleji ka istemal barhaein.');
      khurak.push('Iron ke sath Vitamin C (lemon water ya malta juice) lein taake khoon jaldi banay.');
      parhez.push('Khana khane ke foran baad kam az kam 2 ghante tak Chai, Coffee, Doodh ya Cold Drink hargiz na piyein (yeh khoon banne mein rukawat bante hain).');
      dawaiSchedule.push({ waqt: 'Dopehr Nashtay / Khanay ke baad', dawai: 'Iron Capsule / Tablet (ferrous ascorbate) aik glass paani ya orange juice ke sath lein.' });
      khatraAlamaat.push('Agar shadeed chakkar ayein, behoshi hone lagay ya saans bohat tang ho to foran hospital emergency jayein.');
    }

    // Platelets in Urdu
    if (has.plt && has.plt.status.indexOf('low') >= 0) {
      wazahat.push('Khoon ke Platelets kam hain (Platelet Count: ' + has.plt.value + '). Platelets khoon ko jamane aur behne se rokne ka kaam karte hain (jaise Dengue ya viral fever mein hota hai).');
      khurak.push('Nariyal ka paani (coconut water), taaza anar ka juice, aur ublay hue saaf khanon ka istemal karein.');
      khurak.push('Papite ke patton ka joshanda (papaya leaf extract) subah shaam lein.');
      parhez.push('Brufen, Ponstan, Aspirin, ya Diclofenac jaisi dard-kash (painkiller) goliyan BILKUL NA LEIN. Yeh platelets ko mazeed kam kar sakti hain.');
      parhez.push('Sakht cheezein chabane se parhez karein aur narm brush se daant saaf karein taake masoodhon se khoon na niklay.');
      dawaiSchedule.push({ waqt: 'Bukhar / Dard ke waqt (Zaroorat parnay par)', dawai: 'Sirf Paracetamol 500mg lein. Kisi qisam ka teeka (IM injection) na lagwayein.' });
      khatraAlamaat.push('Agar naak ya masoodhon se khoon aye, ulti mein khoon ho, pakhana kaala aye, ya jism par surkh neel nishan banain to foran admit hon.');
    }

    // Diabetes / Sugar in Urdu
    if (has.glucose_fasting || has.glucose_random || has.hba1c) {
      wazahat.push('Khoon mein Sugar (Glucose) ki miqdaar zyada hai. Sugar ko mutawazan rakhna behad zaroori hai taake dil, gurday aur ankhon ki sehat mehfooz rahay.');
      khurak.push('Sabz pattedar sabziyan, daalein, karela, oats (daliya), aur salad khaney se pehle istemal karein.');
      khurak.push('Rozana 30 se 45 minute tez qadmi (brisk walk) mamool banayein.');
      parhez.push('Cheeni, meethi chai, bakery biscuit, cold drinks, meethai, aur safaid double roti (white bread) mukammal band karein.');
      dawaiSchedule.push({ waqt: 'Subah aur Shaam khane ke darmiyan', dawai: 'Doctor ki tajweez karda Sugar ki dawai (Metformin / Insulin) baghair nagha lein.' });
      khatraAlamaat.push('Agar shadeed pyas lagay, baar baar pishaab aye, ultiyan shuru hon ya saans phoolnay lagay to foran check-up karwayein.');
    }

    // Liver in Urdu
    if (has.alt || has.ast || has.bili_total) {
      wazahat.push('Jigar (Liver) ke test mein sujan (inflammation) ke asraat hain. Transaminases (ALT/AST) ya peelia (Bilirubin) barha hua hai.');
      khurak.push('Ubli hui sabziyan, daalein, taaza phal (saib, tarbooz), aur saaf ubla hua paani zyada miqdaar mein piyein.');
      parhez.push('Talay hue khaney (samose, pakode), tezz masalay, nihari, paye, dalda ghee aur chiknai walay salan se mukammal parhez karein.');
      parhez.push('Baghair doctori tasdeeq ke desi kunday ya hakeemi dawa na khayein.');
      dawaiSchedule.push({ waqt: 'Subah aur Raat khane ke baad', dawai: 'Jigar ki hifazat wali capsule (Silymarin / UDCA) mutawaqqa muddat tak lein.' });
    }

    // Kidney in Urdu
    if (has.creatinine || has.urea) {
      wazahat.push('Gurdon (Kidney) ke test mein sujan ya filtration kamzor honay ke asraat hain (Creatinine barha hua hai).');
      khurak.push('Khurak mein namak (salt) kam karein. Mutawazan miqdaar mein paani piyein.');
      parhez.push('Dard-kash dawaiyan (NSAIDs: Diclofenac, Brufen, Ponstan) bilkul band karein. Yeh gurdon ko mazeed nuqsan pohanchati hain.');
      parhez.push('Badaam, kaju aur zyada protein (bara gosht) kam miqdaar mein lein.');
      khatraAlamaat.push('Agar pishaab aana kam ho jaye, chehre ya paaon par sujan aye to foran Nephrologist se mashwara karein.');
    }

    // Baseline if normal
    if (!wazahat.length) {
      wazahat.push('Alhamdulillah aapke test ke nataij normal biological limits mein hain. Koi shadeed bemari ya kharabi samne nahi aayi.');
      khurak.push('Rozana mutawazan khurak, taaza phal, sabziyan aur kam az kam 8 se 10 glass saaf paani piyein.');
      parhez.push('Ghee, tail aur fast food ka be-ja istemal kam karein.');
      khatraAlamaat.push('Agar koi takleef barqarar rahay to mu\'alij doctor se muayana zaroor karwayein.');
    }

    var text = '🇵🇰 *OPTIX LAB — SEHAT O PARHEZ GUIDE (ROMAN URDU)*\n'
      + 'Mareez: ' + (pt.name || 'Patient') + ' (' + (pt.age ? pt.age + ' saal, ' : '') + (pt.sex || pt.gender || '') + ')\n'
      + 'Report #: ' + (inv.no || inv.id) + '\n\n'
      + '🩺 *1. BEMARI KI WAZAHAT:*\n'
      + wazahat.map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '🍲 *2. KHURAK AUR PARHEZ:*\n'
      + (khurak.length ? '*Kya Khayein:*\n' + khurak.map(function (x) { return '• ' + x; }).join('\n') + '\n' : '')
      + (parhez.length ? '*Kin Cheezon Se Parhez Karein:*\n' + parhez.map(function (x) { return '• ' + x; }).join('\n') + '\n\n' : '\n')
      + (dawaiSchedule.length ? '💊 *3. DAWAI LENE KA TAREEQA:*\n' + dawaiSchedule.map(function (x) { return '• ' + x.waqt + ': ' + x.dawai; }).join('\n') + '\n\n' : '')
      + (khatraAlamaat.length ? '⚠️ *4. KHATRAY KI ALAMAAT (EMERGENCY):*\n' + khatraAlamaat.map(function (x) { return '• ' + x; }).join('\n') + '\n\n' : '')
      + '_Hidayat: Yeh mashwaray lab report ki bunyad par hain. Akhiri faisla aapke treating doctor ka hoga._';

    return {
      wazahat: wazahat,
      khurak: khurak,
      parhez: parhez,
      dawaiSchedule: dawaiSchedule,
      khatraAlamaat: khatraAlamaat,
      plainText: text
    };
  };

  /* ---------------- PRO FEATURE 5: 1-Click Digital Doctor Prescription Pad ---------------- */
  AI.generateRxPadHtml = function (analysis) {
    var pt = (analysis && analysis.patient) || {};
    var inv = (analysis && analysis.invoice) || {};
    var doc = (analysis && analysis.doctor) || {};
    var s = (analysis && analysis.solutions) || {};

    var allMeds = [];
    (s.medications || []).forEach(function (cat) {
      (cat.items || []).forEach(function (it) {
        allMeds.push(it);
      });
    });

    var todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    var medsRows = allMeds.map(function (m, idx) {
      return '<tr style="border-bottom:1px solid #e2e8f0">'
        + '<td style="padding:10px 8px;font-weight:700;color:#0f172a">' + (idx + 1) + '.</td>'
        + '<td style="padding:10px 8px"><div style="font-weight:800;font-size:13.5px;color:#1e293b">' + (window.App ? App.esc(m.drug) : m.drug) + '</div>'
        + (m.note ? '<div style="font-size:11.5px;color:#64748b;margin-top:2px">' + (window.App ? App.esc(m.note) : m.note) + '</div>' : '') + '</td>'
        + '<td style="padding:10px 8px;font-weight:700;color:#059669;font-size:12.5px">' + (window.App ? App.esc(m.dosage) : m.dosage) + '</td>'
        + '<td style="padding:10px 8px;font-size:12px;color:#475569">After Meals</td>'
        + '<td style="padding:10px 8px;font-weight:700;font-size:12px;color:#1e40af">As Advised</td>'
        + '</tr>';
    }).join('');

    var dietBullets = (s.diet || []).map(function (d) { return '<li>' + (window.App ? App.esc(d) : d) + '</li>'; }).join('');
    var testBullets = (s.tests || []).map(function (t) { return '<li>' + (window.App ? App.esc(t) : t) + '</li>'; }).join('');

    return '<div class="digital-rx-pad" style="max-width:800px;margin:0 auto;background:#fff;border:2px solid #cbd5e1;border-radius:12px;padding:24px 28px;box-shadow:0 8px 30px rgba(0,0,0,0.06);font-family:inherit;color:#1e293b">'
      // Doctor & Clinic Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #4f46e5;padding-bottom:14px;margin-bottom:14px">'
      + '  <div>'
      + '    <div style="font-size:22px;font-weight:900;color:#1e1b4b;letter-spacing:-0.02em">Dr. ' + (window.App ? App.esc(doc.name || 'Consultant Physician') : (doc.name || 'Consultant Physician')) + '</div>'
      + '    <div style="font-size:12.5px;font-weight:700;color:#4f46e5;margin-top:2px">MBBS, FCPS / MD (Internal Medicine) &bull; PMDC Reg #: ' + (window.App ? App.esc(doc.pmdc || doc.regNo || '49281-P') : (doc.pmdc || '49281-P')) + '</div>'
      + '    <div style="font-size:11.5px;color:#64748b;margin-top:2px">' + (window.App ? App.esc(doc.specialization || 'Clinical Specialist & Diagnostician') : 'Clinical Specialist') + '</div>'
      + '  </div>'
      + '  <div style="text-align:right">'
      + '    <div style="font-size:16px;font-weight:800;color:#0f172a">Optix Medical Care & Diagnostics</div>'
      + '    <div style="font-size:11.5px;color:#64748b">Advanced Clinical Decision Support</div>'
      + '    <div style="font-size:11px;font-weight:700;color:#059669;margin-top:2px">Phone: ' + (window.App ? App.esc(doc.phone || '+92 300 0000000') : '+92 300 0000000') + '</div>'
      + '  </div>'
      + '</div>'

      // Patient Demographics Bar
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12.5px">'
      + '  <div>Patient: <b style="color:#0f172a">' + (window.App ? App.esc(pt.name || 'Patient') : (pt.name || 'Patient')) + '</b></div>'
      + '  <div>Age / Sex: <b>' + (window.App ? App.esc(pt.age ? pt.age + ' Y' : 'Adult') : (pt.age ? pt.age + ' Y' : 'Adult')) + ' / ' + (window.App ? App.esc(pt.sex || pt.gender || 'M') : (pt.sex || pt.gender || 'M')) + '</b></div>'
      + '  <div>Invoice #: <b style="color:#4f46e5">#' + (window.App ? App.esc(inv.no || inv.id || 'N/A') : (inv.no || inv.id || 'N/A')) + '</b></div>'
      + '  <div>Date: <b>' + todayStr + '</b></div>'
      + '</div>'

      // Rx Symbol & Prescribed Drugs Table
      + '<div style="margin-bottom:18px">'
      + '  <div style="font-family:serif;font-size:32px;font-weight:900;color:#4f46e5;line-height:1;margin-bottom:8px">℞</div>'
      + '  <table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left">'
      + '    <thead>'
      + '      <tr style="background:#f1f5f9;color:#475569;font-size:11.5px;text-transform:uppercase;letter-spacing:0.04em">'
      + '        <th style="padding:8px;border-radius:6px 0 0 6px">#</th>'
      + '        <th style="padding:8px">Medicine & Strength</th>'
      + '        <th style="padding:8px">Dosage Schedule</th>'
      + '        <th style="padding:8px">Meal Timing</th>'
      + '        <th style="padding:8px;border-radius:0 6px 6px 0">Duration</th>'
      + '      </tr>'
      + '    </thead>'
      + '    <tbody>' + (medsRows || '<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b">No active pharmacological prescription advised.</td></tr>') + '</tbody>'
      + '  </table>'
      + '</div>'

      // Instructions & Parhez Columns
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">'
      + '  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px">'
      + '    <div style="font-size:12px;font-weight:800;color:#92400e;text-transform:uppercase;margin-bottom:6px">🥗 Dietary Instructions & Parhez:</div>'
      + '    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:#451a03;line-height:1.5">' + (dietBullets || '<li>Standard balanced nutritional diet.</li>') + '</ul>'
      + '  </div>'
      + '  <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:12px">'
      + '    <div style="font-size:12px;font-weight:800;color:#6b21a8;text-transform:uppercase;margin-bottom:6px">🔬 Recommended Follow-up Tests:</div>'
      + '    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:#3b0764;line-height:1.5">' + (testBullets || '<li>Routine follow-up in 4 weeks.</li>') + '</ul>'
      + '  </div>'
      + '</div>'

      // Doctor Signature & Stamp Area
      + '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:28px;padding-top:16px;border-top:1px dashed #cbd5e1">'
      + '  <div style="display:flex;align-items:center;gap:12px">'
      + '    <div style="border:1.5px dashed #94a3b8;border-radius:8px;padding:6px 12px;font-size:10.5px;color:#64748b;text-align:center">'
      + '      <div>QR VERIFICATION</div>'
      + '      <div style="font-size:16px;font-weight:900;letter-spacing:2px;color:#334155">||||| ||| ||||</div>'
      + '      <div>ID: ' + (window.App ? App.esc(inv.no || inv.id || 'RX') : 'RX') + '</div>'
      + '    </div>'
      + '    <div style="font-size:10.5px;color:#94a3b8;line-height:1.3">Generated via Optix Medical Decision Support.<br>Valid only with physician signature.</div>'
      + '  </div>'
      + '  <div style="text-align:center;min-width:200px">'
      + '    <div style="height:44px;border-bottom:1.5px solid #0f172a;margin-bottom:4px"></div>'
      + '    <div style="font-size:12px;font-weight:800;color:#0f172a">Doctor Signature & Stamp</div>'
      + '  </div>'
      + '</div>'
      + '</div>';
  };

  AI.printRxPad = function (analysis) {
    var printWin = window.open('', '_blank');
    if (!printWin) {
      if (window.App && App.toast) App.toast('Pop-up blocked. Please allow pop-ups to print prescription.', 'err');
      return;
    }
    var htmlContent = AI.generateRxPadHtml(analysis);
    printWin.document.write('<!DOCTYPE html><html><head><title>Prescription - ' + (analysis.patient.name || 'Patient') + '</title>'
      + '<style>'
      + '@page { size: A4 portrait; margin: 12mm 15mm; }'
      + 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 0; padding: 20px; color: #1e293b; background: #fff; }'
      + '@media print { body { padding: 0; } }'
      + '</style></head><body>'
      + htmlContent
      + '<script>window.onload=function(){window.print();};<\/script>'
      + '</body></html>');
    printWin.document.close();
  };

  /* ---------------- PRO FEATURE 6: 1-Tap Order Follow-Up Tests ---------------- */
  AI.orderFollowupTest = function (testName, patientId) {
    if (!testName) return;
    var normName = String(testName).toLowerCase().replace(/[^a-z0-9]/g, '');
    var allTests = (window.DB && typeof DB.all === 'function') ? (DB.all('tests') || []) : [];

    var match = null;
    for (var i = 0; i < allTests.length; i++) {
      var t = allTests[i];
      var tNorm = String(t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var tCode = String(t.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (tNorm === normName || tCode === normName) { match = t; break; }
      if (tNorm.indexOf(normName) >= 0 || normName.indexOf(tNorm) >= 0) { match = t; break; }
    }

    if (!match) {
      var keywords = ['ferritin', 'electrophoresis', 'crp', 'esr', 'culture', 'lipid', 'urine', 'dengue', 'hba1c', 'ultrasound', 'microalbumin'];
      for (var k = 0; k < keywords.length; k++) {
        var kw = keywords[k];
        if (normName.indexOf(kw) >= 0) {
          match = allTests.filter(function (t) {
            return String(t.name || '').toLowerCase().indexOf(kw) >= 0;
          })[0];
          if (match) break;
        }
      }
    }

    if (!match) {
      match = { id: 'custom_' + Date.now(), code: 'FOLLOWUP', name: testName, price: 0 };
    }

    var item = {
      testId: match.id,
      code: match.code || 'TEST',
      name: match.name || testName,
      price: match.price || 0
    };

    try {
      var cart = [];
      var existing = sessionStorage.getItem('labpos_precart');
      if (existing) { try { cart = JSON.parse(existing) || []; } catch (e) { cart = []; } }
      cart.push(item);
      sessionStorage.setItem('labpos_precart', JSON.stringify(cart));
    } catch (eCart) {}

    if (patientId && window.App && typeof App.nav === 'function') {
      if (App.toast) App.toast('Test "' + item.name + '" added to billing cart! Redirecting to POS...');
      if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        var modalClose = document.querySelector('.modal-overlay .btn-ghost, #aiModalClose');
        if (modalClose) {
          try {
            var closeEv = (typeof MouseEvent === 'function') ? new MouseEvent('click', { bubbles: true }) : { bubbles: true };
            if (typeof modalClose.dispatchEvent === 'function') modalClose.dispatchEvent(closeEv);
            else if (typeof modalClose.click === 'function') modalClose.click();
          } catch (eEv) {
            if (typeof modalClose.click === 'function') modalClose.click();
          }
        }
      }
      var timer = (typeof setTimeout === 'function') ? setTimeout : ((typeof window !== 'undefined' && window.setTimeout) ? window.setTimeout : function (cb) { cb(); });
      timer(function () {
        App.nav('#/billing/' + patientId);
      }, 150);
    } else {
      if (window.App && App.toast) App.toast('Test "' + item.name + '" added to billing cart!');
    }
  };

  /* ---------------- Core 5 Clinical Solutions Generator (Unchanged / 100% Intact) ---------------- */
  AI.generate5Solutions = function (reportData, findings) {
    findings = findings || AI.extractFindings(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var inv = (reportData && (reportData.inv || reportData.invoice)) || {};
    var doc = (reportData && (reportData.doc || reportData.doctor)) || null;

    var has = {};
    findings.forEach(function (f) { has[f.key] = f; });

    var sol1_diagnosis = [];
    var sol2_meds = [];
    var sol3_diet = [];
    var sol4_tests = [];
    var sol5_redflags = [];

    // --- ANEMIA / HEMATOLOGY LOGIC ---
    if (has.hb) {
      if (has.hb.status.indexOf('low') >= 0) {
        var isMicro = has.mcv && has.mcv.status === 'low';
        var diagName = isMicro ? 'Microcytic Hypochromic Anemia (Iron Deficiency vs Thalassemia Minor)' : 'Anemia (Low Hemoglobin ' + has.hb.value + ' g/dL)';
        sol1_diagnosis.push({
          title: diagName,
          detail: 'Patient presents with significant reduction in oxygen-carrying capacity. ' + (isMicro ? 'Low MCV indicates impaired heme synthesis or hemoglobinopathy.' : 'Requires etiology identification.')
        });

        sol2_meds.push({
          category: 'Iron & Hematinic Therapy',
          items: [
            { drug: 'Tab. Ferrous Ascorbate / Polymaltose 100mg', dosage: '1 tablet once or twice daily after meals x 3 months', note: 'Take with plain water or citrus juice. Do NOT take with tea, coffee, or milk.' },
            { drug: 'Tab. Folic Acid 5mg', dosage: '1 tablet daily', note: 'Cellular regeneration support.' },
            { drug: 'Tab. Vitamin C 500mg', dosage: '1 tablet daily with iron', note: 'Enhances intestinal non-heme iron absorption.' }
          ]
        });

        sol3_diet.push('Increase iron-rich foods: Spinach (Palak), Beetroot (Chukandar), Red meat, Liver (Kaleji), Pomegranate (Anar), Dates (Khajoor), and Raisins.');
        sol3_diet.push('Strictly avoid tea, coffee, and carbonated sodas within 2 hours before or after meals (tannins block iron absorption).');

        sol4_tests.push('Serum Ferritin & Total Iron Binding Capacity (TIBC) to confirm iron stores.');
        sol4_tests.push('Hb Electrophoresis if MCV is markedly low with normal/high RBC count (Rule out Thalassemia Minor trait).');
        sol4_tests.push('Stool for Occult Blood to rule out occult gastrointestinal blood loss.');

        if (parseFloat(has.hb.val != null ? has.hb.val : has.hb.value) < 7.5) {
          sol5_redflags.push('CRITICAL HEMOGLOBIN (< 7.5 g/dL): Risk of high-output cardiac strain and severe tissue hypoxia. Evaluate for packed red blood cell (PRBC) transfusion and urgent Hematology consult.');
        }
      }
    }

    // --- INFECTION / LEUKOCYTOSIS ---
    if (has.wbc && has.wbc.status.indexOf('high') >= 0) {
      sol1_diagnosis.push({
        title: 'Leukocytosis (TLC ' + has.wbc.value + ' /uL)',
        detail: 'Elevated leukocyte count indicating active acute bacterial infection, systemic inflammatory response, or severe tissue stress.'
      });

      sol2_meds.push({
        category: 'Antimicrobial & Antipyretic Guidelines',
        items: [
          { drug: 'Tab. Co-Amoxiclav (Amoxicillin + Clavulanate) 625mg / 1g', dosage: '1 tablet twice daily x 5 to 7 days', note: 'Take with food. Standard empiric broad-spectrum coverage for respiratory/soft tissue infection.' },
          { drug: 'Tab. Paracetamol 500mg', dosage: '1 to 2 tablets every 6 to 8 hours SOS', note: 'For fever and body ache management. Max 3g in 24 hours.' }
        ]
      });

      sol3_diet.push('Ensure optimal fluid intake: 2.5 to 3 liters of clean water and warm broths daily to maintain hydration during fever.');
      sol3_diet.push('High-protein and nutrient-dense soft diet to aid immunological recovery.');

      sol4_tests.push('C-Reactive Protein (hs-CRP) or ESR for inflammatory magnitude tracking.');
      sol4_tests.push('Blood Culture & Sensitivity if high-grade spikes of fever are present before changing antibiotics.');
    }

    // --- THROMBOCYTOPENIA ---
    if (has.plt && has.plt.status.indexOf('low') >= 0) {
      sol1_diagnosis.push({
        title: 'Thrombocytopenia (Platelets ' + has.plt.value + ' /uL)',
        detail: 'Platelet deficiency creating mucosal and cutaneous bleeding risk. Common causes include viral infection (Dengue), ITP, sepsis, or drug-induced suppression.'
      });

      sol2_meds.push({
        category: 'Platelet Protection Precautions',
        items: [
          { drug: 'STRICT CAUTION: Avoid all NSAIDs', dosage: 'Contraindicated', note: 'Avoid Brufen (Ibuprofen), Aspirin, Diclofenac, and Ponstan as they inhibit platelet aggregation.' },
          { drug: 'Tab. Paracetamol 500mg', dosage: '1 tablet SOS for analgesia / fever', note: 'Safe antipyretic of choice in thrombocytopenia.' }
        ]
      });

      sol3_diet.push('Fresh papaya leaf extract or juice, pomegranate juice, and coconut water for electrolyte support.');
      sol3_diet.push('Soft foods to prevent oral mucosal trauma and gum bleeding.');

      sol4_tests.push('Dengue NS1 Antigen & Dengue IgM/IgG Serology (if acute febrile illness).');
      sol4_tests.push('Daily Platelet Count & Hematocrit monitoring to observe platelet nadir.');

      if (parseFloat(has.plt.val != null ? has.plt.val : has.plt.value) < 50000) {
        sol5_redflags.push('URGENT PLATELET ALERT (< 50,000 /uL): High risk of spontaneous bleeding (petechiae, hematuria, melena). Advise immediate strict bed rest and hospital admission if bleeding manifests.');
      }
    }

    // --- DIABETES / GLUCOSE ABNORMALITY ---
    if (has.hba1c || has.glucose_fasting || has.glucose_random) {
      sol1_diagnosis.push({
        title: 'Diabetes Mellitus / Hyperglycemic Pattern',
        detail: 'Chronic glycemic dysregulation confirmed by elevated blood glucose or glycated hemoglobin. Poses microvascular and macrovascular risks if unmanaged.'
      });

      sol2_meds.push({
        category: 'Antidiabetic Pharmacotherapy',
        items: [
          { drug: 'Tab. Metformin 500mg / 1000mg', dosage: '1 tablet twice daily with meals', note: 'First-line biguanide insulin sensitizer. Monitor renal function.' },
          { drug: 'Tab. Empagliflozin 10mg / 25mg OR Sitagliptin 50mg/100mg', dosage: '1 tablet once daily morning', note: 'For proven cardioprotective, renal-protective metabolic control.' },
          { drug: 'Insulin Regimen Consideration', dosage: 'Per sliding scale protocol', note: 'Indicated if symptomatic severe hyperglycemia (Glucose > 300 mg/dL or HbA1c > 10%).' }
        ]
      });

      sol3_diet.push('Strict low-glycemic index nutrition: Eliminate refined sugars, sweetened tea, soft drinks, white bread, and bakery sweets.');
      sol3_diet.push('Incorporate high-fiber legumes, oats, green vegetables, and maintain 30 to 45 minutes of daily brisk aerobic exercise.');

      sol4_tests.push('Fasting Lipid Profile (Dyslipidemia co-screening).');
      sol4_tests.push('Urine for Microalbumin / Protein:Creatinine Ratio for early diabetic nephropathy detection.');
      sol4_tests.push('Annual Dilated Fundoscopic Eye Examination and Foot Doppler evaluation.');

      sol5_redflags.push('HYPERGLYCEMIC CRISIS WARNING: If blood glucose exceeds 350 mg/dL accompanied by nausea, vomiting, or deep rapid breathing, evaluate immediately for Diabetic Ketoacidosis (DKA) or Hyperosmolar Hyperglycemic State (HHS).');
    }

    // --- LIVER FUNCTION / HEPATOCELLULAR INJURY ---
    if (has.alt || has.ast || has.bili_total) {
      var maxL = Math.max(parseFloat(has.alt ? has.alt.value : 0), parseFloat(has.ast ? has.ast.value : 0));
      sol1_diagnosis.push({
        title: 'Hepatocellular Injury / Elevated Transaminases (ALT/AST)',
        detail: 'Active hepatic parenchymal inflammation. Potential etiologies include Viral Hepatitis (B/C/E), Non-Alcoholic Fatty Liver Disease (NAFLD), drug-induced toxicity, or biliary stasis.'
      });

      sol2_meds.push({
        category: 'Hepatoprotective Support',
        items: [
          { drug: 'Cap. Essential Phospholipids OR Silymarin (Milk Thistle) 140mg', dosage: '1 capsule twice daily', note: 'Supports hepatocellular membrane stabilization and antioxidant defense.' },
          { drug: 'Tab. Ursodeoxycholic Acid (UDCA) 250mg / 300mg', dosage: '1 tablet twice daily', note: 'Indicated especially if Bilirubin or Alkaline Phosphatase is concurrently elevated.' },
          { drug: 'Medication Review', dosage: 'Review current drugs', note: 'Temporarily pause or reduce hepatotoxic medications (Paracetamol > 2g, high-dose statins, unverified herbal tonics).' }
        ]
      });

      sol3_diet.push('Strict avoidance of fried, deep-fried, oily, and heavy ghee foods.');
      sol3_diet.push('High antioxidant natural foods, fresh seasonal fruit (apples, berries), steamed vegetables, and zero alcohol consumption.');

      sol4_tests.push('Viral Hepatitis Serology Panel: HBsAg and Anti-HCV Antibody (with PCR if reactive).');
      sol4_tests.push('Ultrasound of Abdomen & Pelvis to assess hepatic parenchymal echotexture (Fatty Liver Grade I-III, cirrhosis, or biliary ductal dilatation).');
      sol4_tests.push('Serum Albumin and PT / INR to verify liver synthetic functional capacity.');

      if (maxL > 300) {
        sol5_redflags.push('ACUTE TRANSAMINASE SPIKE (> 300 U/L): Monitor closely for acute fulminant hepatic failure. Watch for yellowing of sclera (jaundice), cognitive confusion/asterixis (encephalopathy), or bleeding diathesis.');
      }
    }

    // --- RENAL AZOTEMIA / HIGH CREATININE ---
    if (has.creatinine || has.urea) {
      sol1_diagnosis.push({
        title: 'Renal Impairment / Azotemia (Creatinine ' + (has.creatinine ? has.creatinine.value : '') + ' mg/dL)',
        detail: 'Reduced glomerular filtration rate with retention of nitrogenous waste. May represent Acute Kidney Injury (AKI), pre-renal dehydration, or underlying Chronic Kidney Disease (CKD).'
      });

      sol2_meds.push({
        category: 'Renal Care & Medication Adjustment',
        items: [
          { drug: 'CONTRAINDICATION: Avoid all NSAIDs', dosage: 'Strictly avoid', note: 'Discontinue Ibuprofen, Diclofenac, Naproxen as they cause profound afferent arteriolar vasoconstriction.' },
          { drug: 'Renal Dose Adjustments', dosage: 'Adjust all medications', note: 'Recalculate dosage of all renally cleared drugs according to estimated GFR.' },
          { drug: 'Blood Pressure & Fluid Management', dosage: 'Target BP < 130/80 mmHg', note: 'Cautious monitoring of ACEi / ARB if creatinine continues to rise acutely.' }
        ]
      });

      sol3_diet.push('Moderation of dietary protein: 0.8g per kg body weight daily to decrease nitrogenous load.');
      sol3_diet.push('Salt restriction (< 2 grams sodium per day). Caution with high-potassium foods (bananas, tomatoes, citrus) if potassium is elevated.');

      sol4_tests.push('Serum Electrolytes (Sodium, Potassium, Bicarbonate, Chloride).');
      sol4_tests.push('Spot Urine Protein to Creatinine Ratio (UPCR) or 24-Hour Urine Protein.');
      sol4_tests.push('Ultrasound KUB (Kidneys, Ureters, Bladder) to measure renal bipolar length and rule out obstructive hydronephrosis.');

      sol5_redflags.push('NEPHROLOGY REFERRAL ADVISORY: If serum creatinine exceeds 2.5 mg/dL or urine output drops below 500 mL/24h (oliguria), arrange urgent Nephrology review to prevent irreversible renal loss.');
    }

    // --- URIC ACID / GOUT ---
    if (has.uric_acid) {
      sol1_diagnosis.push({
        title: 'Hyperuricemia (Uric Acid ' + has.uric_acid.value + ' mg/dL)',
        detail: 'Supersaturation of monosodium urate predisposing to acute gouty arthritis, tophi formation, and uric acid nephrolithiasis.'
      });

      sol2_meds.push({
        category: 'Urate Lowering Therapy',
        items: [
          { drug: 'Tab. Febuxostat 40mg', dosage: '1 tablet once daily morning', note: 'Selective xanthine oxidase inhibitor to lower serum urate target below 6.0 mg/dL.' },
          { drug: 'Tab. Colchicine 0.5mg', dosage: '1 tablet daily as flare prophylaxis', note: 'Co-prescribe for 3-6 months when initiating urate lowering therapy.' }
        ]
      });

      sol3_diet.push('Strict low-purine diet: Avoid red meat (beef, mutton), organ meats (kaleji, maghaz), seafood, and high-fructose corn syrup sodas.');
      sol3_diet.push('Drink at least 3 to 3.5 liters of water daily to promote renal uric acid flushing.');

      sol4_tests.push('Renal Function Test (Creatinine/Urea) and Serum Electrolytes.');
      sol4_tests.push('Ultrasound KUB to screen for asymptomatic radiolucent uric acid renal calculi.');
    }

    // --- LIPID PROFILE / DYSLIPIDEMIA ---
    if (has.cholesterol || has.ldl || has.triglycerides) {
      sol1_diagnosis.push({
        title: 'Atherogenic Dyslipidemia',
        detail: 'Elevated circulating atherogenic lipoproteins increasing long-term coronary artery disease and cardiovascular risk profile.'
      });

      sol2_meds.push({
        category: 'Lipid Lowering Statin Therapy',
        items: [
          { drug: 'Tab. Atorvastatin 10mg / 20mg OR Rosuvastatin 10mg', dosage: '1 tablet at bedtime (HS) daily', note: 'Standard HMG-CoA reductase inhibitor for plaque stabilization and LDL reduction.' },
          { drug: 'Tab. Fenofibrate 145mg', dosage: '1 tablet daily', note: 'Indicated specifically if Triglycerides exceed 400-500 mg/dL to prevent acute pancreatitis.' }
        ]
      });

      sol3_diet.push('Eliminate saturated fats, dalda ghee, hydrogenated oils, bakery biscuits, and deep-fried samosas/pakoras.');
      sol3_diet.push('Incorporate heart-healthy fats: Olive oil, walnuts, almonds, flaxseeds, and oats.');

      sol4_tests.push('Repeat Fasting Lipid Profile in 8 to 12 weeks to assess therapeutic LDL reduction target.');
      sol4_tests.push('Baseline ALT and Serum Creatine Kinase (CK) before and during high-intensity statin therapy.');
    }

    // --- URINE R/E / UTI ---
    if (has.urine_pus) {
      sol1_diagnosis.push({
        title: 'Urinary Tract Infection (Pyuria: ' + has.urine_pus.value + ' Pus Cells/HPF)',
        detail: 'Significant acute leukocyturia confirming active bacterial infection of the lower or upper urinary tract.'
      });

      sol2_meds.push({
        category: 'Urinary Antibiotic & Symptomatic Protocol',
        items: [
          { drug: 'Tab. Ciprofloxacin 500mg BD OR Tab. Nitrofurantoin 100mg BD', dosage: '1 tablet twice daily x 5 days', note: 'Effective urinary antimicrobial concentration.' },
          { drug: 'Sachet Citro-Soda (Urinary Alkalinizer)', dosage: '1 sachet in a glass of water 2-3 times daily', note: 'Rapid relief from burning micturition (dysuria).' }
        ]
      });

      sol3_diet.push('Drink 3 to 4 liters of clean water daily to naturally flush the urinary tract.');
      sol3_diet.push('Cranberry juice / extract to inhibit bacterial adherence to the urothelium.');

      sol4_tests.push('Urine Culture & Sensitivity (Urine C/S) to verify bacterial colony count and specific antibiotic sensitivity.');
      sol4_tests.push('Ultrasound KUB if symptoms are recurrent or accompanied by flank pain (rule out calculi).');
    }

    // --- FALLBACK IF NO SPECIFIC ABNORMALITY DETECTED ---
    if (!sol1_diagnosis.length) {
      sol1_diagnosis.push({
        title: 'Physiological Normal / Unremarkable Parameters',
        detail: 'Tested lab values are currently within biological reference intervals. No acute pathological biochemical crisis detected.'
      });
      sol2_meds.push({
        category: 'Preventative & Wellness Advice',
        items: [
          { drug: 'Tab. Multivitamins with Zinc', dosage: '1 tablet daily with breakfast x 30 days', note: 'General nutritional and immunological maintenance.' }
        ]
      });
      sol3_diet.push('Maintain a balanced Mediterranean-style diet with whole grains, seasonal vegetables, fresh fruits, and lean protein.');
      sol3_diet.push('Adequate hydration: 2 to 2.5 liters of clean water daily with 7-8 hours of regular sleep.');
      sol4_tests.push('Routine annual wellness checkup and follow-up as clinically advised by the attending physician.');
      sol5_redflags.push('Consult attending physician if clinical symptoms persist despite normal baseline laboratory findings.');
    }

    // Default safety caution for all reports
    if (!sol5_redflags.length) {
      sol5_redflags.push('CLINICAL CORRELATION REQUIRED: Always correlate laboratory findings with the patient’s physical examination, clinical history, and symptom severity.');
    }

    // Compute Pro Extensions
    var indices = AI.calculateIndices(reportData, findings);
    var drugSafety = AI.evaluateDrugSafety(reportData, findings, indices);
    var historicalDelta = AI.evaluateHistoricalDelta(inv.id || inv.no, reportData);
    var urduGuide = AI.generateUrduPatientGuide({
      patient: pt, invoice: inv, doctor: doc, findings: findings,
      solutions: { diagnosis: sol1_diagnosis, medications: sol2_meds, diet: sol3_diet, tests: sol4_tests, redflags: sol5_redflags }
    }, indices, drugSafety);

    return {
      patient: pt,
      invoice: inv,
      doctor: doc,
      findings: findings,
      solutions: {
        diagnosis: sol1_diagnosis,
        medications: sol2_meds,
        diet: sol3_diet,
        tests: sol4_tests,
        redflags: sol5_redflags
      },
      // Pro extensions
      indices: indices,
      drugSafety: drugSafety,
      historicalDelta: historicalDelta,
      urduGuide: urduGuide
    };
  };

  /* Role & Permission Access Check */
  AI.canAccess = function (role) {
    if (!role) {
      var s = null;
      try { s = JSON.parse(localStorage.getItem('labpos_session') || 'null'); } catch (e) {}
      role = (s && s.role) || 'admin';
    }
    if (role === 'doctor' || role === 'admin') return true;

    var set = null;
    try { set = (window.DB && typeof DB.get === 'function') ? DB.get('settings', 'main') : null; } catch (e) {}
    var allowed = (set && Array.isArray(set.aiInsightsRoles)) ? set.aiInsightsRoles : ['admin', 'doctor', 'technician'];
    return allowed.indexOf(role) >= 0;
  };

  /* Render Rich Modal with 5 Solutions + Pro Clinical Extension Tabs */
  AI.showModal = function (invoiceId, directData) {
    var d = directData || null;
    if (!d) {
      try {
        if (window.reportData) d = window.reportData(invoiceId);
        else if (window.App && App.reportData) d = App.reportData(invoiceId);
      } catch (e) {}
    }

    if (!d) {
      var inv = (window.DB && typeof DB.get === 'function')
        ? (DB.get('invoices', invoiceId) || (DB.all('invoices') || []).filter(function (x) { return x.no === invoiceId; })[0])
        : null;
      if (!inv && !directData) { if (window.App && App.toast) App.toast('Invoice not found', 'err'); return; }
      if (inv) {
        var pt = (DB.get('patients', inv.patientId)) || {};
        var doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
        var tests = (DB.all('tests')) || [];
        var results = (DB.all('results') || []).filter(function (r) { return r.invoiceId === invoiceId || r.invoiceId === inv.id; });
        var groups = results.map(function (r) {
          var t = DB.get('tests', r.testId) || tests.filter(function (x) { return x.id === r.testId; })[0];
          return { test: t, res: r };
        });
        d = { inv: inv, pt: pt, doc: doc, groups: groups };
      }
    }

    if (!d) { if (window.App && App.toast) App.toast('Report data unavailable for AI analysis', 'err'); return; }

    var analysis = AI.generate5Solutions(d);
    var pt = analysis.patient;
    var inv = analysis.invoice;
    var doc = analysis.doctor;
    var s = analysis.solutions;
    var findings = analysis.findings;
    var indices = analysis.indices || [];
    var drugSafety = analysis.drugSafety || [];
    var historicalDelta = analysis.historicalDelta || { hasHistory: false, comparisons: [], velocityAlerts: [] };
    var urduGuide = analysis.urduGuide || { wazahat: [], khurak: [], parhez: [], dawaiSchedule: [], khatraAlamaat: [], plainText: '' };

    // Badges HTML
    var findingsBadges = findings.length
      ? findings.map(function (f) {
          var isCrit = f.status.indexOf('critical') >= 0;
          var bg = isCrit ? '#fee2e2' : '#fef3c7';
          var color = isCrit ? '#b91c1c' : '#b45309';
          var border = isCrit ? '#fca5a5' : '#fde68a';
          return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:' + bg + ';color:' + color + ';border:1px solid ' + border + '">'
            + (isCrit ? '⚠️ ' : '⚡ ') + (window.App ? App.esc(f.paramName) : f.paramName) + ': ' + (window.App ? App.esc(f.value) : f.value) + ' ' + (window.App ? App.esc(f.unit) : f.unit) + ' (' + (window.App ? App.esc(f.note || f.status) : (f.note || f.status)) + ')</span>';
        }).join(' ')
      : '<span style="color:#059669;font-weight:700;font-size:12px">✅ All tested parameters within normal reference ranges</span>';

    // Solution 1 HTML
    var diagHtml = s.diagnosis.map(function (di) {
      return '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.05)">'
        + '<div style="font-size:13.5px;font-weight:800;color:#1e293b;margin-bottom:2px">🩺 ' + (window.App ? App.esc(di.title) : di.title) + '</div>'
        + '<div style="font-size:12.5px;color:#475569;line-height:1.45">' + (window.App ? App.esc(di.detail) : di.detail) + '</div>'
        + '</div>';
    }).join('');

    // Solution 2 HTML (Medications)
    var medsHtml = s.medications.map(function (m) {
      var items = m.items.map(function (it) {
        return '<div style="background:#fff;border:1px solid #e2e8f0;border-left:3.5px solid #10b981;border-radius:8px;padding:8px 12px;margin-bottom:6px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
          + '<b style="color:#0f172a;font-size:13px">' + (window.App ? App.esc(it.drug) : it.drug) + '</b>'
          + '<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">' + (window.App ? App.esc(it.dosage) : it.dosage) + '</span>'
          + '</div>'
          + (it.note ? '<div style="font-size:11.5px;color:#64748b;margin-top:3px">' + (window.App ? App.esc(it.note) : it.note) + '</div>' : '')
          + '</div>';
      }).join('');
      return '<div style="margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#059669;letter-spacing:0.04em;margin-bottom:6px">' + (window.App ? App.esc(m.category) : m.category) + '</div>'
        + items
        + '</div>';
    }).join('');

    // Solution 3 HTML (Diet & Lifestyle)
    var dietHtml = '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.6">'
      + s.diet.map(function (d) { return '<li>' + (window.App ? App.esc(d) : d) + '</li>'; }).join('')
      + '</ul>';

    // Solution 4 HTML (Follow-up Tests with 1-Tap Order Button)
    var testsHtml = '<ul style="margin:0;padding-left:0;list-style:none;font-size:12.5px;color:#334155;line-height:1.6">'
      + s.tests.map(function (t) {
          var cleanName = t.replace(/\.$/, '');
          var ptId = pt.id || (inv && inv.patientId) || '';
          return '<li style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9">'
            + '<div style="display:flex;align-items:flex-start;gap:6px"><span>🔬</span><span>' + (window.App ? App.esc(cleanName) : cleanName) + '</span></div>'
            + '<button type="button" class="btn btn-ghost ai-order-test-btn" data-testname="' + (window.App ? App.esc(cleanName) : cleanName) + '" data-ptid="' + (window.App ? App.esc(ptId) : ptId) + '" style="font-size:11px;font-weight:700;color:#6b21a8;border:1px solid #d8b4fe;padding:2px 8px;border-radius:6px;background:#faf5ff;white-space:nowrap;cursor:pointer">➕ Order Test</button>'
            + '</li>';
        }).join('')
      + '</ul>';

    // Solution 5 HTML (Red Flags)
    var redflagsHtml = s.redflags.map(function (rf) {
      return '<div style="background:#fff1f2;border:1px solid #fecdd3;border-left:4px solid #e11d48;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;font-weight:600;color:#9f1239;line-height:1.45">'
        + (window.App ? App.esc(rf) : rf) + '</div>';
    }).join('');

    // Plain text for Doctor Clipboard / WhatsApp
    var plainText = '🤖 *OPTIX AI CLINICAL RECOMMENDATIONS*\n'
      + 'Patient: ' + (pt.name || 'Patient') + ' (' + (pt.age ? pt.age + 'y, ' : '') + (pt.sex || pt.gender || '') + ')\n'
      + 'Invoice: #' + (inv.no || inv.id) + '\n\n'
      + '1. 🩺 *DIAGNOSIS & FINDINGS:*\n'
      + s.diagnosis.map(function (x) { return '• ' + x.title + '\n  ' + x.detail; }).join('\n') + '\n\n'
      + '2. 💊 *RECOMMENDED MEDICATIONS:*\n'
      + s.medications.map(function (m) {
          return m.items.map(function (it) { return '• ' + it.drug + ' (' + it.dosage + ')' + (it.note ? ' - ' + it.note : ''); }).join('\n');
        }).join('\n') + '\n\n'
      + '3. 🥗 *DIET & LIFESTYLE:*\n'
      + s.diet.map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '4. 🔬 *FOLLOW-UP TESTS:*\n'
      + s.tests.map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '5. ⚠️ *PRECAUTIONS & RED FLAGS:*\n'
      + s.redflags.map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '_Note: Clinical decision support for authorized medical practitioners only._';

    // Critical persistent alert banner (if critical drug safety or delta alert)
    var critSafetyAlerts = drugSafety.filter(function (x) { return x.status === 'critical'; });
    var critAlertBanner = '';
    if (critSafetyAlerts.length || (historicalDelta.velocityAlerts && historicalDelta.velocityAlerts.length)) {
      var critMsgs = [];
      critSafetyAlerts.forEach(function (cs) { critMsgs.push(cs.title + ': ' + cs.contraindications[0]); });
      (historicalDelta.velocityAlerts || []).forEach(function (va) { critMsgs.push(va); });
      critAlertBanner = '<div style="background:#fef2f2;border:1.5px solid #f87171;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:flex-start;gap:10px">'
        + '<div style="font-size:20px;line-height:1">🚨</div>'
        + '<div style="font-size:12px;font-weight:700;color:#991b1b;line-height:1.45">'
        + '<b>CRITICAL CLINICAL CAUTION:</b> ' + critMsgs.map(function (m) { return window.App ? App.esc(m) : m; }).join(' &bull; ')
        + '</div>'
        + '</div>';
    }

    // --- TAB 2: Medical Calculators HTML ---
    var indicesHtml = indices.length ? indices.map(function (ind) {
      var isCrit = ind.status === 'critical';
      var isWarn = ind.status === 'warning';
      var cardBorder = isCrit ? '#fca5a5' : (isWarn ? '#fde68a' : '#bbf7d0');
      var cardBg = isCrit ? '#fef2f2' : (isWarn ? '#fffbeb' : '#f0fdf4');
      var scoreColor = isCrit ? '#dc2626' : (isWarn ? '#d97706' : '#16a34a');

      return '<div style="background:' + cardBg + ';border:1.5px solid ' + cardBorder + ';border-radius:12px;padding:14px;margin-bottom:12px">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
        + '  <div>'
        + '    <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.04em">' + (window.App ? App.esc(ind.category) : ind.category) + '</div>'
        + '    <div style="font-size:14px;font-weight:900;color:#0f172a">' + (window.App ? App.esc(ind.name) : ind.name) + '</div>'
        + '    <div style="font-size:11px;color:#64748b;margin-top:1px">Formula: ' + (window.App ? App.esc(ind.formula) : ind.formula) + '</div>'
        + '  </div>'
        + '  <div style="text-align:right">'
        + '    <div style="font-size:20px;font-weight:900;color:' + scoreColor + '">' + ind.score + ' <span style="font-size:11.5px;font-weight:600;color:#64748b">' + ind.unit + '</span></div>'
        + '    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#fff;border:1px solid ' + cardBorder + ';color:' + scoreColor + '">' + (window.App ? App.esc(ind.statusLabel) : ind.statusLabel) + '</span>'
        + '  </div>'
        + '</div>'
        + '<div style="font-size:12.5px;color:#334155;line-height:1.45;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(0,0,0,0.08)">'
        + '  <b>Interpretation:</b> ' + (window.App ? App.esc(ind.interpretation) : ind.interpretation) + '<br>'
        + '  <b>Clinical Action:</b> ' + (window.App ? App.esc(ind.recommendation) : ind.recommendation)
        + '</div>'
        + '</div>';
    }).join('') : '<div style="padding:20px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px">No specific multi-parameter indices computable from available test parameters. Enter CBC (MCV+RBC), RFT (Creatinine), or LFT (AST+ALT) to activate calculators.</div>';

    // --- TAB 3: Drug Safety Shield HTML ---
    var safetyHtml = drugSafety.length ? drugSafety.map(function (ds) {
      var isCrit = ds.status === 'critical';
      var border = isCrit ? '#ef4444' : '#f59e0b';
      var bg = isCrit ? '#fef2f2' : '#fffbeb';

      var contraHtml = ds.contraindications.map(function (c) {
        return '<li style="margin-bottom:3px"><b>🚫 CONTRAINDICATED:</b> ' + (window.App ? App.esc(c) : c) + '</li>';
      }).join('');
      var cautionsHtml = ds.cautions.map(function (c) {
        return '<li style="margin-bottom:3px"><b>⚠️ CAUTION:</b> ' + (window.App ? App.esc(c) : c) + '</li>';
      }).join('');
      var safeHtml = ds.safeAlternatives.map(function (sAlt) {
        return '<li style="margin-bottom:3px;color:#047857"><b>💡 SAFE ALTERNATIVE:</b> ' + (window.App ? App.esc(sAlt) : sAlt) + '</li>';
      }).join('');

      return '<div style="background:' + bg + ';border:2px solid ' + border + ';border-radius:12px;padding:14px;margin-bottom:12px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
        + '  <span style="font-size:22px">' + ds.icon + '</span>'
        + '  <div>'
        + '    <div style="font-size:14px;font-weight:900;color:' + (isCrit ? '#991b1b' : '#92400e') + '">' + (window.App ? App.esc(ds.title) : ds.title) + '</div>'
        + '    <div style="font-size:11.5px;color:#64748b">Trigger: ' + (window.App ? App.esc(ds.trigger) : ds.trigger) + '</div>'
        + '  </div>'
        + '</div>'
        + '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px;color:#334155;line-height:1.5">'
        + contraHtml + cautionsHtml + safeHtml
        + '</ul>'
        + '</div>';
    }).join('') : '<div style="padding:20px;text-align:center;color:#059669;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;font-weight:700">✅ All organ safety shields green. No renal, hepatic, or hematological drug contraindications detected.</div>';

    // --- TAB 4: Longitudinal Historical Trends HTML ---
    var trendsHtml = '';
    if (historicalDelta.hasHistory && historicalDelta.comparisons.length) {
      var prevInv = historicalDelta.prevInvoice;
      var prevDate = prevInv.date || prevInv.createdAt || 'Previous Date';
      var compRows = historicalDelta.comparisons.map(function (c) {
        var dirIco = c.dir === 'up' ? '▲' : (c.dir === 'down' ? '▼' : '➖');
        var dirColor = c.alert ? '#dc2626' : (c.dir === 'up' ? '#2563eb' : (c.dir === 'down' ? '#d97706' : '#64748b'));
        return '<tr style="border-bottom:1px solid #e2e8f0;background:' + (c.alert ? '#fff1f2' : '#fff') + '">'
          + '<td style="padding:10px 8px;font-weight:700;color:#0f172a">' + (window.App ? App.esc(c.name) : c.name) + '</td>'
          + '<td style="padding:10px 8px;color:#64748b">' + c.prevVal + ' ' + (window.App ? App.esc(c.unit) : c.unit) + '</td>'
          + '<td style="padding:10px 8px;font-weight:800;color:#0f172a">' + c.curVal + ' ' + (window.App ? App.esc(c.unit) : c.unit) + '</td>'
          + '<td style="padding:10px 8px;font-weight:800;color:' + dirColor + '">' + dirIco + ' ' + (c.diff > 0 ? '+' : '') + c.diff + ' (' + (c.pct > 0 ? '+' : '') + c.pct + '%)</td>'
          + '<td style="padding:10px 8px;font-size:11.5px;color:' + (c.alert ? '#991b1b;font-weight:700' : '#475569') + '">' + (c.alert ? (window.App ? App.esc(c.alert) : c.alert) : 'Stable / Standard course') + '</td>'
          + '</tr>';
      }).join('');

      trendsHtml = '<div style="margin-bottom:12px">'
        + '<div style="font-size:12px;color:#475569;margin-bottom:8px">Comparing with previous invoice <b>#' + (window.App ? App.esc(prevInv.no || prevInv.id) : (prevInv.no || prevInv.id)) + '</b> on <b>' + prevDate + '</b>:</div>'
        + '<table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">'
        + '  <thead><tr style="background:#f8fafc;color:#475569;font-size:11.5px;text-transform:uppercase">'
        + '    <th style="padding:8px">Parameter</th><th style="padding:8px">Previous</th><th style="padding:8px">Current</th><th style="padding:8px">Delta Change</th><th style="padding:8px">Velocity Flag</th>'
        + '  </tr></thead>'
        + '  <tbody>' + compRows + '</tbody>'
        + '</table>'
        + '</div>';
    } else {
      trendsHtml = '<div style="padding:24px;text-align:center;color:#64748b;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0">'
        + '<div style="font-size:24px;margin-bottom:4px">📊</div>'
        + '<b>Initial Baseline Profile</b>'
        + '<div style="font-size:12px;margin-top:4px">No previous historical invoices found for this patient in database. Current results will establish the baseline for future delta velocity tracking.</div>'
        + '</div>';
    }

    // --- TAB 5: Roman Urdu Patient Care Guide HTML ---
    var urduHtml = '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:16px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px">'
      + '  <div>'
      + '    <div style="font-size:15px;font-weight:900;color:#0f172a">🇵🇰 Mareez Ke Liye Rehnumai (Roman Urdu Guide)</div>'
      + '    <div style="font-size:11.5px;color:#64748b">Asan zaban mein bimari ki wazahat, khurak, parhez aur dawai ka tareeqa</div>'
      + '  </div>'
      + '  <div style="display:flex;gap:6px">'
      + '    <button type="button" class="btn btn-ghost" id="aiCopyUrduGuide" style="border:1px solid #cbd5e1;font-size:11.5px;font-weight:700">📋 Copy Urdu</button>'
      + '    <button type="button" class="btn btn-ghost" id="aiWaUrduGuide" style="color:#059669;border:1px solid #a7f3d0;font-size:11.5px;font-weight:700">💬 WhatsApp to Patient</button>'
      + '  </div>'
      + '</div>'
      + '<div style="margin-bottom:12px">'
      + '  <div style="font-size:12.5px;font-weight:800;color:#4338ca;margin-bottom:4px">1. 🩺 Bemari Ki Wazahat:</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12px;color:#334155;line-height:1.55">'
      +      urduGuide.wazahat.map(function (w) { return '<li>' + (window.App ? App.esc(w) : w) + '</li>'; }).join('')
      + '  </ul>'
      + '</div>'
      + '<div style="margin-bottom:12px">'
      + '  <div style="font-size:12.5px;font-weight:800;color:#92400e;margin-bottom:4px">2. 🍲 Khurak Aur Parhez:</div>'
      + '  <div style="font-size:12px;color:#166534;font-weight:700;margin-bottom:2px">Kya Khayein:</div>'
      + '  <ul style="margin:0 0 6px;padding-left:18px;font-size:12px;color:#334155;line-height:1.55">'
      +      (urduGuide.khurak.length ? urduGuide.khurak.map(function (k) { return '<li>' + (window.App ? App.esc(k) : k) + '</li>'; }).join('') : '<li>Saaf mutawazan khurak aur ubla hua paani.</li>')
      + '  </ul>'
      + '  <div style="font-size:12px;color:#991b1b;font-weight:700;margin-bottom:2px">Kin Cheezon Se Parhez Karein:</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12px;color:#334155;line-height:1.55">'
      +      (urduGuide.parhez.length ? urduGuide.parhez.map(function (p) { return '<li>' + (window.App ? App.esc(p) : p) + '</li>'; }).join('') : '<li>Talay hue aur masalay-dar khanon se parhez.</li>')
      + '  </ul>'
      + '</div>'
      + (urduGuide.dawaiSchedule.length ? ('<div style="margin-bottom:12px">'
          + '<div style="font-size:12.5px;font-weight:800;color:#047857;margin-bottom:4px">3. 💊 Dawai Lene Ka Tareeqa:</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:12px;color:#334155;line-height:1.55">'
          + urduGuide.dawaiSchedule.map(function (ds) { return '<li><b>' + (window.App ? App.esc(ds.waqt) : ds.waqt) + ':</b> ' + (window.App ? App.esc(ds.dawai) : ds.dawai) + '</li>'; }).join('')
          + '</ul>'
          + '</div>') : '')
      + '<div style="margin-bottom:8px">'
      + '  <div style="font-size:12.5px;font-weight:800;color:#991b1b;margin-bottom:4px">4. ⚠️ Khatray Ki Alamaat (Kab Foran Emergency Jayein):</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12px;color:#991b1b;line-height:1.55">'
      +      urduGuide.khatraAlamaat.map(function (ka) { return '<li>' + (window.App ? App.esc(ka) : ka) + '</li>'; }).join('')
      + '  </ul>'
      + '</div>'
      + '</div>';

    // --- TAB 6: Digital Rx Pad Preview HTML ---
    var rxPadPreviewHtml = '<div style="margin-bottom:12px">'
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:8px">'
      + '  <button type="button" class="btn btn-primary" id="aiPrintRxPadDirect" style="background:#4f46e5;font-weight:700">🖨️ Print Digital Rx Pad</button>'
      + '</div>'
      + AI.generateRxPadHtml(analysis)
      + '</div>';

    // Modal Master HTML
    var modalHtml = '<div style="max-width:920px;font-family:inherit">'
      // Header Card
      + '<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;border-radius:14px;padding:16px 20px;margin-bottom:12px;box-shadow:0 8px 24px rgba(79,70,229,0.22)">'
      + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">'
      + '    <div>'
      + '      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85">Smart Medical Intelligence Pro</div>'
      + '      <h2 style="font-size:20px;font-weight:800;margin:2px 0 4px">🤖 AI Doctor Recommendations & Clinical Intelligence</h2>'
      + '      <div style="font-size:13px;opacity:0.95">Patient: <b>' + (window.App ? App.esc(pt.name || 'Ali Raza') : (pt.name || 'Ali Raza')) + '</b> &bull; Invoice: <b>#' + (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id)) + '</b>' + (doc ? ' &bull; Ref. Doctor: <b>' + (window.App ? App.esc(doc.name) : doc.name) + '</b>' : '') + '</div>'
      + '    </div>'
      + '    <div style="background:rgba(255,255,255,0.18);padding:6px 12px;border-radius:10px;font-size:11.5px;font-weight:700;backdrop-filter:blur(4px)">'
      + '      ⚡ Real-time Decision Support'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // Critical Alert Banner (if any)
      + critAlertBanner

      // Pro Navigation Tabs Bar
      + '<div class="ai-tabs-bar" style="display:flex;gap:6px;overflow-x:auto;padding:4px 0 10px;margin-bottom:12px;border-bottom:1.5px solid #e2e8f0">'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn active" data-tab="solutions" style="background:#4f46e5;color:#fff;border:1px solid #4338ca;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">🩺 5 Solutions</button>'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn" data-tab="indices" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">🧮 Medical Indices (' + indices.length + ')</button>'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn" data-tab="safety" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">⚠️ Drug Safety Shield (' + drugSafety.length + ')</button>'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn" data-tab="trends" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">📈 Historical Velocity</button>'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn" data-tab="urdu" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">🇵🇰 Roman Urdu Guide</button>'
      + '  <button type="button" class="btn btn-ghost ai-tab-btn" data-tab="rx" style="background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;font-weight:700;font-size:12px;padding:6px 12px;border-radius:8px">🖨️ Digital Rx Pad</button>'
      + '</div>'

      // PANE 1: 5 Solutions (Primary Default View - Unchanged & 100% Intact)
      + '<div class="ai-tab-pane" id="aiPane-solutions" style="display:block">'
      + '  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;margin-bottom:12px">'
      + '    <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:6px">Detected Abnormal Lab Parameters</div>'
      + '    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + findingsBadges + '</div>'
      + '  </div>'
      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:12px;margin-bottom:12px">'
      + '    <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:14px">'
      + '      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#166534;margin-bottom:8px">🩺 Solution 1: Clinical Diagnosis & Interpretation</div>'
      +        diagHtml
      + '    </div>'
      + '    <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:14px">'
      + '      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#1e40af;margin-bottom:8px">💊 Solution 2: Prescription & Medication Guidance</div>'
      +        medsHtml
      + '    </div>'
      + '    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:14px">'
      + '      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#92400e;margin-bottom:8px">🥗 Solution 3: Diet & Lifestyle Plan (Parhez)</div>'
      +        dietHtml
      + '    </div>'
      + '    <div style="background:#faf5ff;border:1.5px solid #e9d5ff;border-radius:14px;padding:14px">'
      + '      <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#6b21a8;margin-bottom:8px">🔬 Solution 4: Confirmatory Follow-up Tests</div>'
      +        testsHtml
      + '    </div>'
      + '  </div>'
      + '  <div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:14px;padding:14px;margin-bottom:12px">'
      + '    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#9f1239;margin-bottom:8px">⚠️ Solution 5: Red Flags, Precautions & Specialist Referral</div>'
      +      redflagsHtml
      + '  </div>'
      + '</div>'

      // PANE 2: Medical Indices
      + '<div class="ai-tab-pane" id="aiPane-indices" style="display:none">'
      +   indicesHtml
      + '</div>'

      // PANE 3: Drug Safety Shield
      + '<div class="ai-tab-pane" id="aiPane-safety" style="display:none">'
      +   safetyHtml
      + '</div>'

      // PANE 4: Historical Velocity Trends
      + '<div class="ai-tab-pane" id="aiPane-trends" style="display:none">'
      +   trendsHtml
      + '</div>'

      // PANE 5: Roman Urdu Guide
      + '<div class="ai-tab-pane" id="aiPane-urdu" style="display:none">'
      +   urduHtml
      + '</div>'

      // PANE 6: Digital Rx Pad
      + '<div class="ai-tab-pane" id="aiPane-rx" style="display:none">'
      +   rxPadPreviewHtml
      + '</div>'

      // Medical Advisory Disclaimer
      + '<div style="font-size:11px;color:#64748b;line-height:1.4;background:#f8fafc;padding:8px 12px;border-radius:8px;margin-bottom:14px">'
      + '  <b>Medical Disclaimer:</b> AI Clinical Recommendations & Calculators are advisory decision-support tools for registered medical practitioners. Final clinical judgment and prescription authority rests solely with the attending doctor.'
      + '</div>'

      // Master Toolbar
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'
      + '  <button type="button" class="btn btn-ghost" id="aiModalClose">Close</button>'
      + '  <div style="display:flex;gap:6px;flex-wrap:wrap">'
      + '    <button type="button" class="btn btn-ghost" id="aiCopyPrescription" style="border:1px solid #cbd5e1;font-weight:700">📋 Copy 5 Solutions</button>'
      + (doc && (doc.phone || doc.whatsapp)
          ? '  <button type="button" class="btn btn-ghost" id="aiWaDoctor" style="color:#059669;border:1px solid #a7f3d0;font-weight:700">💬 WhatsApp to Doctor</button>'
          : '')
      + '    <button type="button" class="btn btn-ghost" id="aiPrintSlip" style="border:1px solid #cbd5e1;font-weight:700">🖨️ Print Summary</button>'
      + '    <button type="button" class="btn btn-primary" id="aiPrintRxPad" style="background:#4f46e5;font-weight:700">🖨️ Print Rx Pad</button>'
      + '  </div>'
      + '</div>'
      + '</div>';

    App.modal('AI Clinical Recommendations', modalHtml, {
      wide: true,
      onOpen: function (ov, close) {
        var cBtn = ov.querySelector('#aiModalClose');
        if (cBtn) cBtn.addEventListener('click', close);

        // Tab Switching Logic
        ov.querySelectorAll('.ai-tab-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var target = btn.getAttribute('data-tab');
            ov.querySelectorAll('.ai-tab-btn').forEach(function (b) {
              b.style.background = '#f1f5f9';
              b.style.color = '#475569';
              b.style.borderColor = '#cbd5e1';
              b.classList.remove('active');
            });
            btn.style.background = '#4f46e5';
            btn.style.color = '#ffffff';
            btn.style.borderColor = '#4338ca';
            btn.classList.add('active');

            ov.querySelectorAll('.ai-tab-pane').forEach(function (pane) {
              pane.style.display = 'none';
            });
            var targetPane = ov.querySelector('#aiPane-' + target);
            if (targetPane) targetPane.style.display = 'block';
          });
        });

        // 1-Tap Order Follow-Up Tests Buttons
        ov.querySelectorAll('.ai-order-test-btn').forEach(function (b) {
          b.addEventListener('click', function () {
            var tName = b.getAttribute('data-testname');
            var ptId = b.getAttribute('data-ptid');
            AI.orderFollowupTest(tName, ptId);
          });
        });

        // Copy 5 Solutions
        var cpBtn = ov.querySelector('#aiCopyPrescription');
        if (cpBtn) {
          cpBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(plainText).then(function () {
                if (App.toast) App.toast('Prescription recommendations copied to clipboard!');
              });
            } else {
              var ta = document.createElement('textarea');
              ta.value = plainText;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              if (App.toast) App.toast('Prescription recommendations copied!');
            }
          });
        }

        // WhatsApp to Doctor
        var waBtn = ov.querySelector('#aiWaDoctor');
        if (waBtn && doc) {
          waBtn.addEventListener('click', function () {
            var rawPh = doc.whatsapp || doc.phone || '';
            var ph = rawPh.replace(/[^0-9]/g, '');
            if (ph.indexOf('0') === 0) ph = '92' + ph.slice(1);
            var url = 'https://wa.me/' + ph + '?text=' + encodeURIComponent(plainText);
            window.open(url, '_blank');
          });
        }

        // Copy Urdu Guide
        var cpUrduBtn = ov.querySelector('#aiCopyUrduGuide');
        if (cpUrduBtn) {
          cpUrduBtn.addEventListener('click', function () {
            var uTxt = urduGuide.plainText || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(uTxt).then(function () {
                if (App.toast) App.toast('Roman Urdu Patient Guide copied to clipboard!');
              });
            } else {
              var ta = document.createElement('textarea');
              ta.value = uTxt;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              if (App.toast) App.toast('Roman Urdu Patient Guide copied!');
            }
          });
        }

        // WhatsApp Urdu Guide to Patient
        var waUrduBtn = ov.querySelector('#aiWaUrduGuide');
        if (waUrduBtn) {
          waUrduBtn.addEventListener('click', function () {
            var rawPh = pt.phone || pt.mobile || pt.contact || '';
            var ph = rawPh.replace(/[^0-9]/g, '');
            if (ph.indexOf('0') === 0) ph = '92' + ph.slice(1);
            var url = ph ? ('https://wa.me/' + ph + '?text=' + encodeURIComponent(urduGuide.plainText))
                         : ('https://wa.me/?text=' + encodeURIComponent(urduGuide.plainText));
            window.open(url, '_blank');
          });
        }

        // Print Doctor Summary Slip (Unchanged)
        var prBtn = ov.querySelector('#aiPrintSlip');
        if (prBtn) {
          prBtn.addEventListener('click', function () {
            var printWin = window.open('', '_blank');
            if (!printWin) { if (App.toast) App.toast('Pop-up blocked. Please allow pop-ups to print.', 'err'); return; }
            printWin.document.write('<!DOCTYPE html><html><head><title>AI Clinical Summary - #' + (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id)) + '</title>'
              + '<style>'
              + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:20px;color:#111;font-size:13px;line-height:1.5}'
              + 'h2{color:#4338ca;margin:0 0 4px}'
              + '.box{border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:12px}'
              + '.b-title{font-weight:800;font-size:12px;text-transform:uppercase;margin-bottom:6px;color:#4338ca}'
              + '@media print{button{display:none}}'
              + '</style></head><body>'
              + '<h2>Optix AI Clinical Summary for Attending Doctor</h2>'
              + '<div>Patient: <b>' + (window.App ? App.esc(pt.name || '') : (pt.name || '')) + '</b> (' + (window.App ? App.esc(pt.age ? pt.age + 'y, ' : '') : (pt.age ? pt.age + 'y, ' : '')) + (window.App ? App.esc(pt.sex || pt.gender || '') : (pt.sex || pt.gender || '')) + ') &bull; Invoice: <b>#' + (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id)) + '</b></div>'
              + '<hr style="border:0;border-top:1px solid #ddd;margin:12px 0">'
              + '<div class="box"><div class="b-title">1. Clinical Findings & Probable Diagnosis</div>' + diagHtml + '</div>'
              + '<div class="box"><div class="b-title">2. Prescription & Medication Recommendations</div>' + medsHtml + '</div>'
              + '<div class="box"><div class="b-title">3. Dietary & Lifestyle Plan</div>' + dietHtml + '</div>'
              + '<div class="box"><div class="b-title">4. Correlative Follow-Up Tests</div>' + testsHtml + '</div>'
              + '<div class="box"><div class="b-title">5. Precautions & Red Flags</div>' + redflagsHtml + '</div>'
              + '<p style="font-size:11px;color:#666;margin-top:20px">Report generated automatically by Optix LAB MedSync AI Clinical Intelligence. Final clinical decisions rest with the prescribing doctor.</p>'
              + '<script>window.onload=function(){window.print();};<\/script>'
              + '</body></html>');
            printWin.document.close();
          });
        }

        // Print Digital Rx Pad
        var prRxBtns = [ov.querySelector('#aiPrintRxPad'), ov.querySelector('#aiPrintRxPadDirect')];
        prRxBtns.forEach(function (btn) {
          if (btn) btn.addEventListener('click', function () { AI.printRxPad(analysis); });
        });
      }
    });
  };

  window.App = window.App || {};
  window.App.aiInsights = AI;
})();
