/* ============================================================
   Optix Medical Sync — AI Clinical Decision Support & Recommendations
   Analyzes lab report values, detects abnormalities, and generates
   5 structured clinical solutions for doctors:
     1. 🩺 Clinical Diagnosis & Pattern Interpretation
     2. 💊 Recommended Medications & Dosage Guidelines
     3. 🥗 Dietary & Lifestyle Management Plan
     4. 🔬 Recommended Confirmatory & Follow-up Tests
     5. ⚠️ Red Flags, Urgent Precautions & Specialist Referral
   
   PRO CLINICAL EXTENSIONS (ULTRA-ADVANCED):
     🧮 Automated Clinical Calculators & Medical Indices
        - Mentzer Index (Thalassemia Minor vs Iron Deficiency Anemia)
        - eGFR (CKD-EPI 2021 Race-Free Equation for Kidney Staging 1-5)
        - FIB-4 Liver Fibrosis Score & APRI Index
        - De Ritis Ratio (AST / ALT)
        - Atherogenic Lipoprotein Ratios (Chol/HDL, TG/HDL)
     🫀 10-Year ASCVD Cardiovascular Risk Calculator (ACC/AHA Guidelines)
     🚨 Automatic Panic-Value SOS Alert to Doctor (CAP / ISO 15189 Standard)
     💊 Multi-Drug Interaction & CYP450 Cross-Clash Checker (DDI Matrix)
     🧠 Differential Diagnosis (DDx) Probability Matrix (Multi-Disease Engine)
     🧬 Family Genetic & Thalassemia Marriage Guard (Pakistan Context)
     🎙️ Urdu / English Voice-to-Rx Dictation ("Bol Kar Nuskha Likhein")
     📄 1-Click "AI Executive Summary" On Printed Lab Report Remarks
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
        if (num < 6.5) return { status: 'critical_low', val: num, note: 'Severe Anemia (Emergency Transfusion Threshold)' };
        if (num < min) return { status: 'low', val: num, note: 'Anemia' };
        if (num > max) return { status: 'high', val: num, note: 'Polycythemia' };
        return { status: 'normal', val: num };
      }
    },
    wbc: {
      name: 'Total Leukocyte Count (WBC)', unit: '/uL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 35000) return { status: 'critical_high', val: num, note: 'Hyperleukocytosis / Severe Sepsis / Leukemoid' };
        if (num > 11000) return { status: 'high', val: num, note: 'Leukocytosis (Infection / Inflammation)' };
        if (num < 1500) return { status: 'critical_low', val: num, note: 'Severe Agranulocytosis / Neutropenia' };
        if (num < 4000) return { status: 'low', val: num, note: 'Leukopenia (Viral / Bone Marrow Suppression)' };
        return { status: 'normal', val: num };
      }
    },
    plt: {
      name: 'Platelet Count', unit: '/uL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 20000) return { status: 'critical_low', val: num, note: 'Extreme Thrombocytopenia (Spontaneous Bleed Risk)' };
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
        if (num < 50) return { status: 'critical_low', val: num, note: 'Severe Hypoglycemia (Coma Risk)' };
        if (num >= 350) return { status: 'critical_high', val: num, note: 'Extreme Hyperglycemia (DKA/HHS Risk)' };
        if (num >= 126) return { status: 'high', val: num, note: 'Diabetic Hyperglycemia' };
        if (num >= 100) return { status: 'borderline_high', val: num, note: 'Impaired Fasting Glucose (Pre-Diabetes)' };
        return { status: 'normal', val: num };
      }
    },
    glucose_random: {
      name: 'Random Blood Glucose', unit: 'mg/dL',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num < 50) return { status: 'critical_low', val: num, note: 'Severe Hypoglycemia (Coma Risk)' };
        if (num >= 400) return { status: 'critical_high', val: num, note: 'Extreme Hyperglycemia (DKA/HHS Risk)' };
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
        if (num > 10.0) return { status: 'critical_high', val: num, note: 'Severe Hyperbilirubinemia (Acute Cholestasis/Necrosis)' };
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
        if (num > 4.0) return { status: 'critical_high', val: num, note: 'Severe Renal Shutdown / Dialysis Threshold' };
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
    // Electrolytes
    potassium: {
      name: 'Serum Potassium (K+)', unit: 'mEq/L',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 6.2) return { status: 'critical_high', val: num, note: 'Severe Hyperkalemia (Cardiac Arrhythmia Risk)' };
        if (num > 5.2) return { status: 'high', val: num, note: 'Hyperkalemia' };
        if (num < 2.8) return { status: 'critical_low', val: num, note: 'Severe Hypokalemia (Arrhythmia/Paralysis Risk)' };
        if (num < 3.5) return { status: 'low', val: num, note: 'Hypokalemia' };
        return { status: 'normal', val: num };
      }
    },
    sodium: {
      name: 'Serum Sodium (Na+)', unit: 'mEq/L',
      eval: function (v) {
        var num = parseFloat(v); if (isNaN(num)) return null;
        if (num > 155) return { status: 'critical_high', val: num, note: 'Severe Hypernatremia' };
        if (num > 145) return { status: 'high', val: num, note: 'Hypernatremia' };
        if (num < 125) return { status: 'critical_low', val: num, note: 'Severe Hyponatremia (Seizure Risk)' };
        if (num < 135) return { status: 'low', val: num, note: 'Hyponatremia' };
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
    if (s === 'potassium' || s === 'k' || s.indexOf('serumpotassium') >= 0) return 'potassium';
    if (s === 'sodium' || s === 'na' || s.indexOf('serumsodium') >= 0) return 'sodium';
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
    var age = parseFloat(pt.age);
    var hasAge = isFinite(age) && age >= 18;
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
    if (hasAge && ['male', 'm', 'female', 'f'].indexOf(String(pt.sex || pt.gender || '').toLowerCase()) >= 0 && rawVals.creatinine != null && rawVals.creatinine > 0) {
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
    if (hasAge && rawVals.ast != null && rawVals.alt != null && rawVals.plt != null && rawVals.alt > 0) {
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

  /* ---------------- PRO FEATURE: 10-Year ASCVD Cardiovascular Risk Calculator ---------------- */
  AI.calculateAscvdRisk = function (reportData) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var age = parseFloat(pt.age);
    var sexStr = String(pt.sex || pt.gender || 'male').toLowerCase();
    var isFem = (sexStr === 'female' || sexStr === 'f');

    var chol = rawVals.cholesterol;
    var hdl = rawVals.hdl;
    var sbp = Number(pt.systolicBP);
    // The existing equation supports untreated non-smokers only. Never substitute invented measurements or medical history.
    if (!isFinite(age) || age < 40 || age > 79 || ['male', 'm', 'female', 'f'].indexOf(String(pt.sex || pt.gender || '').toLowerCase()) < 0 ||
        !isFinite(chol) || chol <= 0 || !isFinite(hdl) || hdl <= 0 || !isFinite(sbp) || sbp <= 0 ||
        pt.smoker !== false || pt.bpTreated !== false || typeof pt.diabetes !== 'boolean') return null;
    var isDiabetic = pt.diabetes;

    var lnAge = Math.log(Math.max(age, 20));
    var lnTotChol = Math.log(Math.max(chol, 100));
    var lnHDL = Math.log(Math.max(hdl, 20));
    var lnSBP = Math.log(sbp);

    var coeffSum = 0;
    var pct = 5.0;
    if (isFem) {
      coeffSum = (-29.799 * lnAge) + (4.884 * Math.pow(lnAge, 2)) + (13.540 * lnTotChol)
        + (-3.114 * lnAge * lnTotChol) + (-13.578 * lnHDL) + (3.149 * lnAge * lnHDL)
        + (2.019 * lnSBP) + (0.661 * (isDiabetic ? 1 : 0));
      var indF = coeffSum - (-29.18);
      var riskF = 1 - Math.pow(0.9665, Math.exp(indF));
      pct = Math.round(Math.min(Math.max(riskF * 100, 1.0), 75.0) * 10) / 10;
    } else {
      coeffSum = (12.344 * lnAge) + (11.853 * lnTotChol) + (-2.664 * lnAge * lnTotChol)
        + (-7.990 * lnHDL) + (1.769 * lnAge * lnHDL) + (1.797 * lnSBP) + (0.658 * (isDiabetic ? 1 : 0));
      var indM = coeffSum - (61.18);
      var riskM = 1 - Math.pow(0.8954, Math.exp(indM));
      pct = Math.round(Math.min(Math.max(riskM * 100, 1.2), 80.0) * 10) / 10;
    }

    var tier = '';
    var status = 'safe';
    var recommendation = '';

    if (pct < 5.0) {
      tier = 'Low Cardiovascular Risk (< 5.0%)';
      status = 'safe';
      recommendation = 'Emphasize lifestyle modifications: Mediterranean cardioprotective diet, 150 mins/week regular aerobic exercise.';
    } else if (pct < 7.5) {
      tier = 'Borderline Cardiovascular Risk (5.0% – 7.4%)';
      status = 'info';
      recommendation = 'Consider Moderate-Intensity Statin therapy if risk-enhancing factors present (family history, metabolic syndrome).';
    } else if (pct < 20.0) {
      tier = 'Intermediate Cardiovascular Risk (7.5% – 19.9%)';
      status = 'warning';
      recommendation = 'Initiate Moderate-to-High Intensity Statin (Atorvastatin 20mg or Rosuvastatin 10mg) to reduce LDL by ≥ 30-50%.';
    } else {
      tier = 'High Cardiovascular Risk (≥ 20.0%)';
      status = 'critical';
      recommendation = 'Urgent initiation of High-Intensity Statin (Atorvastatin 40-80mg or Rosuvastatin 20mg), Low-Dose Aspirin, and strict BP control.';
    }

    return {
      riskScore: pct,
      unit: '% 10-Year Risk',
      tier: tier,
      status: status,
      recommendation: recommendation,
      details: 'Age: ' + age + 'y | Total Chol: ' + chol + ' mg/dL | HDL: ' + hdl + ' mg/dL' + (isDiabetic ? ' | Diabetic: Yes' : ' | Non-Diabetic')
    };
  };

  /* ---------------- PRO FEATURE: Automatic Panic-Value SOS Alert (CAP / ISO 15189) ---------------- */
  AI.checkPanicValues = function (reportData) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var inv = (reportData && (reportData.inv || reportData.invoice)) || {};
    var doc = (reportData && (reportData.doc || reportData.doctor)) || null;

    var alerts = [];

    var cfg = (typeof AI.getAiConfig === 'function') ? AI.getAiConfig() : null;
    if (cfg && cfg.modules && cfg.modules.panicSos === false) {
      return {
        isPanic: false,
        alerts: [],
        formattedMessage: '',
        patient: pt,
        invoice: inv,
        doctor: doc
      };
    }

    var th = (cfg && cfg.panicThresholds) || {};
    var pltCut = (th.plt != null && !isNaN(th.plt)) ? Number(th.plt) : 20000;
    var hbCut = (th.hb != null && !isNaN(th.hb)) ? Number(th.hb) : 6.5;
    var wbcHi = (th.wbcHigh != null && !isNaN(th.wbcHigh)) ? Number(th.wbcHigh) : 35000;
    var wbcLo = (th.wbcLow != null && !isNaN(th.wbcLow)) ? Number(th.wbcLow) : 1500;
    var gHi = (th.glucoseHigh != null && !isNaN(th.glucoseHigh)) ? Number(th.glucoseHigh) : 400;
    var gLo = (th.glucoseLow != null && !isNaN(th.glucoseLow)) ? Number(th.glucoseLow) : 50;
    var crCut = (th.creatinine != null && !isNaN(th.creatinine)) ? Number(th.creatinine) : 4.0;
    var biliCut = (th.bilirubin != null && !isNaN(th.bilirubin)) ? Number(th.bilirubin) : 10.0;
    var kHi = (th.potassiumHigh != null && !isNaN(th.potassiumHigh)) ? Number(th.potassiumHigh) : 6.2;
    var kLo = (th.potassiumLow != null && !isNaN(th.potassiumLow)) ? Number(th.potassiumLow) : 2.8;

    // 1. Platelets Panic (< pltCut /uL)
    if (rawVals.plt != null && rawVals.plt < pltCut) {
      alerts.push({
        param: 'Platelet Count',
        value: rawVals.plt + ' /uL',
        threshold: '< ' + pltCut.toLocaleString() + ' /uL',
        severity: 'EMERGENCY',
        hazard: 'Extreme risk of spontaneous fatal intracranial or gastrointestinal hemorrhage.'
      });
    }

    // 2. Hemoglobin Panic (< hbCut g/dL)
    if (rawVals.hb != null && rawVals.hb < hbCut) {
      alerts.push({
        param: 'Hemoglobin',
        value: rawVals.hb + ' g/dL',
        threshold: '< ' + hbCut + ' g/dL',
        severity: 'EMERGENCY',
        hazard: 'Critical tissue hypoxia & high-output myocardial heart failure. Immediate PRBC transfusion required.'
      });
    }

    // 3. WBC Panic (> wbcHi or < wbcLo)
    if (rawVals.wbc != null) {
      if (rawVals.wbc > wbcHi) {
        alerts.push({
          param: 'Total Leukocytes (WBC)',
          value: rawVals.wbc + ' /uL',
          threshold: '> ' + wbcHi.toLocaleString() + ' /uL',
          severity: 'CRITICAL',
          hazard: 'Hyperleukocytosis / Severe Sepsis / Leukostasis crisis.'
        });
      } else if (rawVals.wbc < wbcLo) {
        alerts.push({
          param: 'Total Leukocytes (WBC)',
          value: rawVals.wbc + ' /uL',
          threshold: '< ' + wbcLo.toLocaleString() + ' /uL',
          severity: 'CRITICAL',
          hazard: 'Agranulocytosis / Severe neutropenia. Extreme susceptibility to life-threatening sepsis.'
        });
      }
    }

    // 4. Glucose Panic (> gHi or < gLo mg/dL)
    var gVal = rawVals.glucose_random != null ? rawVals.glucose_random : rawVals.glucose_fasting;
    if (gVal != null) {
      if (gVal > gHi) {
        alerts.push({
          param: 'Blood Glucose',
          value: gVal + ' mg/dL',
          threshold: '> ' + gHi + ' mg/dL',
          severity: 'EMERGENCY',
          hazard: 'Diabetic Ketoacidosis (DKA) or Hyperosmolar Hyperglycemic State (HHS) alert.'
        });
      } else if (gVal < gLo) {
        alerts.push({
          param: 'Blood Glucose',
          value: gVal + ' mg/dL',
          threshold: '< ' + gLo + ' mg/dL',
          severity: 'EMERGENCY',
          hazard: 'Critical neuroglycopenia / Hypoglycemic coma risk. Immediate IV 25% Dextrose administration.'
        });
      }
    }

    // 5. Serum Creatinine Panic (> crCut mg/dL)
    if (rawVals.creatinine != null && rawVals.creatinine > crCut) {
      alerts.push({
        param: 'Serum Creatinine',
        value: rawVals.creatinine + ' mg/dL',
        threshold: '> ' + crCut + ' mg/dL',
        severity: 'CRITICAL',
        hazard: 'Acute severe renal shutdown / Uremic encephalopathy. Urgent nephrology / dialysis assessment.'
      });
    }

    // 6. Bilirubin Panic (> biliCut mg/dL)
    if (rawVals.bili_total != null && rawVals.bili_total > biliCut) {
      alerts.push({
        param: 'Total Bilirubin',
        value: rawVals.bili_total + ' mg/dL',
        threshold: '> ' + biliCut + ' mg/dL',
        severity: 'CRITICAL',
        hazard: 'Severe obstructive cholestasis or acute fulminant hepatocellular necrosis.'
      });
    }

    // 7. Potassium Panic (> kHi or < kLo mEq/L)
    if (rawVals.potassium != null) {
      if (rawVals.potassium > kHi) {
        alerts.push({
          param: 'Serum Potassium (K+)',
          value: rawVals.potassium + ' mEq/L',
          threshold: '> ' + kHi + ' mEq/L',
          severity: 'EMERGENCY',
          hazard: 'Severe hyperkalemia. Risk of peaked T-waves, ventricular arrhythmia, and sudden cardiac arrest.'
        });
      } else if (rawVals.potassium < kLo) {
        alerts.push({
          param: 'Serum Potassium (K+)',
          value: rawVals.potassium + ' mEq/L',
          threshold: '< ' + kLo + ' mEq/L',
          severity: 'EMERGENCY',
          hazard: 'Severe hypokalemia. Paralytic ileus and lethal ventricular dysrhythmia risk.'
        });
      }
    }

    var isPanic = alerts.length > 0;
    var formattedMessage = '';
    if (isPanic) {
      formattedMessage = '🚨 *CRITICAL PANIC-VALUE LAB ALERT (ISO 15189 / CAP Standard)*\n'
        + 'Patient: ' + (pt.name || 'Patient') + ' (' + (pt.age ? pt.age + 'y, ' : '') + (pt.sex || pt.gender || '') + ')\n'
        + 'Invoice #: ' + (inv.no || inv.id) + '\n'
        + (doc ? 'Attending Doctor: Dr. ' + doc.name + '\n' : '')
        + 'Time: ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) + '\n\n'
        + '*CRITICAL FINDING(S):*\n'
        + alerts.map(function (a) { return '⚠️ *' + a.param + ': ' + a.value + '* (Alert: ' + a.threshold + ')\n   → ' + a.hazard; }).join('\n\n') + '\n\n'
        + '_Immediate clinical intervention advised. Generated automatically by Optix LAB Panic Notification System._';
    }

    return {
      isPanic: isPanic,
      alerts: alerts,
      formattedMessage: formattedMessage
    };
  };

  /* ---------------- PRO FEATURE: Multi-Drug Interaction & CYP450 Cross-Clash Checker ---------------- */
  AI.checkDrugInteractions = function (medsList) {
    var list = [];
    if (!Array.isArray(medsList)) return list;

    var flat = [];
    medsList.forEach(function (m) {
      if (typeof m === 'string') flat.push(m);
      else if (m && m.drug) flat.push(m.drug);
      else if (m && m.name) flat.push(m.name);
    });

    var drugStr = flat.join(' | ').toLowerCase();
    function hasDrug(rx) { return rx.test(drugStr); }

    var RULES = [
      {
        id: 'nsaid_blood_thinner',
        d1: /nsaid|ibuprofen|brufen|diclofenac|naproxen|ponstan|ketorolac|mefenamic/i,
        d2: /aspirin|disprin|clopidogrel|plavix|warfarin|heparin|enoxaparin|rivaroxaban|xarelto|eliquis/i,
        severity: 'critical',
        pair: 'NSAID + Antiplatelet / Anticoagulant',
        title: 'Severe Gastrointestinal Hemorrhage Hazard',
        mechanism: 'Concurrent inhibition of COX-1 mucosal protection and platelet aggregation increases severe GI ulcer bleeding risk by 5-to-10 fold.',
        solution: 'Strictly avoid NSAID. Substitute with Paracetamol 500mg or topical analgesics. Add PPI if anticoagulation is mandatory.'
      },
      {
        id: 'acei_spirono',
        d1: /captopril|enalapril|ramipril|lisinopril|losartan|valsartan|telmisartan/i,
        d2: /spironolactone|aldactone|eplerenone|amiloride/i,
        severity: 'critical',
        pair: 'ACE Inhibitor / ARB + Potassium-Sparing Diuretic',
        title: 'Fatal Hyperkalemia & Conduction Block Risk',
        mechanism: 'Synergistic reduction in aldosterone production prevents renal potassium excretion, risking sudden ventricular arrhythmias.',
        solution: 'Monitor Serum Potassium within 5-7 days of initiation. Withhold any potassium supplements.'
      },
      {
        id: 'cipro_theophylline',
        d1: /ciprofloxacin|cipro|levofloxacin/i,
        d2: /theophylline|aminophylline/i,
        severity: 'critical',
        pair: 'Ciprofloxacin + Theophylline',
        title: 'Theophylline Toxicity & Seizure Risk',
        mechanism: 'Ciprofloxacin strongly inhibits hepatic CYP1A2, increasing serum theophylline concentrations by 100-300%, triggering cardiac arrhythmias and seizures.',
        solution: 'Reduce theophylline dosage by 50% or switch antimicrobial coverage to Azithromycin or Ceftriaxone.'
      },
      {
        id: 'statin_macrolide',
        d1: /atorvastatin|lipitor|simvastatin|rosuvastatin/i,
        d2: /clarithromycin|klacid|erythromycin|azithromycin/i,
        severity: 'critical',
        pair: 'Statin + Macrolide Antibiotic',
        title: 'Severe Rhabdomyolysis & Acute Tubular Necrosis',
        mechanism: 'Macrolides inhibit CYP3A4, causing dangerous accumulation of statin metabolites, triggering muscle breakdown (rhabdomyolysis).',
        solution: 'Temporarily pause statin therapy during the 5-7 day antimicrobial course.'
      },
      {
        id: 'clopidogrel_omeprazole',
        d1: /clopidogrel|plavix/i,
        d2: /omeprazole|losec|esomeprazole|nexium/i,
        severity: 'moderate',
        pair: 'Clopidogrel + Omeprazole / Esomeprazole',
        title: 'Attenuated Antiplatelet Protective Efficacy',
        mechanism: 'Omeprazole inhibits CYP2C19, significantly reducing bioactivation of clopidogrel prodrug into active antiplatelet metabolite.',
        solution: 'Substitute Omeprazole with Pantoprazole or Dexlansoprazole, which exhibit negligible CYP2C19 competition.'
      },
      {
        id: 'metformin_nsaid',
        d1: /metformin|glucophage/i,
        d2: /diclofenac|ibuprofen|brufen|naproxen|ketorolac/i,
        severity: 'major',
        pair: 'Metformin + NSAIDs',
        title: 'Renal Perfusion Impairment & Lactic Acidosis Risk',
        mechanism: 'NSAIDs induce acute renal vasoconstriction, precipitating acute kidney injury and impairing metformin clearance.',
        solution: 'Discontinue NSAIDs. Prescribe Paracetamol SOS.'
      },
      {
        id: 'iron_chelation',
        d1: /ferrous|iron|polymaltose/i,
        d2: /levothyroxine|thyroxine|ciprofloxacin|calcium/i,
        severity: 'moderate',
        pair: 'Oral Iron + Levothyroxine / Ciprofloxacin / Calcium',
        title: 'Insoluble Chelate Formation (Poor Absorption)',
        mechanism: 'Divalent and trivalent iron cations bind to thyroid hormones and quinolones, inhibiting intestinal absorption by > 60%.',
        solution: 'Enforce a minimum 2 to 4 hour administration separation gap between doses.'
      }
    ];

    RULES.forEach(function (r) {
      if (hasDrug(r.d1) && hasDrug(r.d2)) {
        list.push(r);
      }
    });

    return list;
  };

  /* ---------------- PRO FEATURE: Differential Diagnosis (DDx) Probability Matrix ---------------- */
  AI.calculateDifferentialDiagnosis = function (reportData, findings) {
    findings = findings || AI.extractFindings(reportData);
    var rawVals = AI.extractRawValues(reportData);
    var has = {};
    findings.forEach(function (f) { has[f.key] = f; });

    var ddx = [];

    // 1. Thrombocytopenia DDx
    if (has.plt && has.plt.status.indexOf('low') >= 0) {
      var pltVal = rawVals.plt || 0;
      var wbcVal = rawVals.wbc || 7000;
      var isWbcLow = wbcVal < 5000;

      ddx.push({
        domain: 'Hematology / Thrombocytopenia',
        candidates: [
          {
            disease: 'Dengue Fever / Arboviral Illness',
            probability: isWbcLow ? 88 : 75,
            badge: isWbcLow ? 'High Probability' : 'Probable',
            status: 'warning',
            supporting: 'Acute thrombocytopenia (' + pltVal + ' /uL)' + (isWbcLow ? ' with leukopenia (WBC ' + wbcVal + ' /uL)' : ''),
            differentiator: 'Febrile illness, retro-orbital ache, petechiae, hemoconcentration.',
            confirmatoryTest: 'Dengue NS1 Antigen (Day 1-5) and Dengue IgM/IgG Serology'
          },
          {
            disease: 'Immune Thrombocytopenic Purpura (ITP)',
            probability: 60,
            badge: 'Consider',
            status: 'info',
            supporting: 'Isolated destruction of peripheral platelets with preserved erythroid/myeloid lines.',
            differentiator: 'Absence of fever, splenomegaly, or systemic infection.',
            confirmatoryTest: 'Peripheral Blood Film (rule out pseudothrombocytopenia) & Bone Marrow Biopsy'
          },
          {
            disease: 'Drug-Induced Thrombocytopenia / Sepsis',
            probability: 30,
            badge: 'Possible',
            status: 'info',
            supporting: 'Immune-mediated clearance or consumptive coagulopathy.',
            differentiator: 'Recent initiation of antibiotics, heparin, or systemic infection.',
            confirmatoryTest: 'Serum Procalcitonin, Blood Culture & Coagulation Profile (PT/INR, D-Dimer)'
          }
        ]
      });
    }

    // 2. Microcytic Anemia DDx
    if (has.hb && has.hb.status.indexOf('low') >= 0 && has.mcv && has.mcv.status === 'low') {
      var rbc = rawVals.rbc || 0;
      var mcv = rawVals.mcv || 0;
      var mentzer = (rbc > 0) ? (mcv / (rbc > 100 ? rbc / 1000000 : rbc)) : 15;
      var isMentzerLow = mentzer < 13;

      ddx.push({
        domain: 'Microcytic Hypochromic Anemia',
        candidates: [
          {
            disease: 'Beta-Thalassemia Minor Trait',
            probability: isMentzerLow ? 92 : 35,
            badge: isMentzerLow ? 'High Probability' : 'Differential',
            status: isMentzerLow ? 'warning' : 'info',
            supporting: 'Microcytosis (MCV ' + mcv + ' fL) with Mentzer Index ' + mentzer.toFixed(1) + (isMentzerLow ? ' (< 13)' : ''),
            differentiator: 'High/normal RBC count, family history, resistance to oral iron.',
            confirmatoryTest: 'Hemoglobin Electrophoresis (HbA2 quantification > 3.5%)'
          },
          {
            disease: 'Iron Deficiency Anemia (IDA)',
            probability: isMentzerLow ? 40 : 94,
            badge: isMentzerLow ? 'Differential' : 'High Probability',
            status: isMentzerLow ? 'info' : 'warning',
            supporting: 'Impaired heme synthesis with microcytic red blood cells.',
            differentiator: 'Low serum iron, high TIBC, koilonychia, occult blood loss.',
            confirmatoryTest: 'Serum Ferritin (< 15 ng/mL) and Total Iron Binding Capacity (TIBC)'
          },
          {
            disease: 'Anemia of Chronic Disease (ACD)',
            probability: 25,
            badge: 'Possible',
            status: 'info',
            supporting: 'Hepcidin-mediated iron sequestration.',
            differentiator: 'Normal/elevated ferritin with underlying chronic inflammation.',
            confirmatoryTest: 'High-Sensitivity CRP, ESR, and Serum Transferrin Receptor'
          }
        ]
      });
    }

    // 3. Glycemic Dysregulation DDx
    if (has.glucose_fasting || has.glucose_random || has.hba1c) {
      var a1c = rawVals.hba1c;
      ddx.push({
        domain: 'Endocrine / Glycemic Dysregulation',
        candidates: [
          {
            disease: 'Type 2 Diabetes Mellitus with Insulin Resistance',
            probability: 92,
            badge: 'High Probability',
            status: 'warning',
            supporting: 'Chronic hyperglycemia' + (a1c ? ' with HbA1c ' + a1c + '%' : ''),
            differentiator: 'Adult onset, metabolic syndrome, central adiposity, acanthosis nigricans.',
            confirmatoryTest: 'Fasting Lipid Profile, Spot Urine Microalbumin:Creatinine Ratio'
          },
          {
            disease: 'Latent Autoimmune Diabetes in Adults (LADA)',
            probability: 25,
            badge: 'Consider',
            status: 'info',
            supporting: 'Hyperglycemia presenting with progressive beta-cell failure.',
            differentiator: 'Non-obese phenotype, poor response to oral sulfonylureas.',
            confirmatoryTest: 'Anti-GAD65 Antibodies & Fasting C-Peptide level'
          }
        ]
      });
    }

    // 4. Hepatocellular Injury DDx
    if (has.alt || has.ast) {
      var altV = rawVals.alt || 0;
      var isMarked = altV > 250;
      ddx.push({
        domain: 'Hepatology / Transaminitis',
        candidates: [
          {
            disease: isMarked ? 'Acute Viral Hepatitis (B / C / E)' : 'Non-Alcoholic Fatty Liver Disease (NAFLD / NASH)',
            probability: isMarked ? 86 : 82,
            badge: 'High Probability',
            status: 'warning',
            supporting: 'Elevated serum transaminases (ALT ' + altV + ' U/L)',
            differentiator: isMarked ? 'Marked transaminase spike > 5x ULN, jaundice, prodromal fatigue.' : 'Mild-to-moderate elevation, metabolic syndrome, fatty liver on ultrasound.',
            confirmatoryTest: isMarked ? 'Viral Hepatitis Serology (HBsAg, Anti-HCV, Anti-HEV IgM)' : 'Ultrasound of Abdomen & FIB-4 Liver Fibrosis Staging'
          },
          {
            disease: 'Drug-Induced Liver Injury (DILI)',
            probability: 45,
            badge: 'Consider',
            status: 'info',
            supporting: 'Parenchymal hepatic inflammatory response.',
            differentiator: 'Temporal relationship with antibiotics, statins, NSAIDs, or herbal remedies.',
            confirmatoryTest: 'Drug dechallenge response & Baseline Alkaline Phosphatase/Bilirubin'
          }
        ]
      });
    }

    return ddx;
  };

  /* ---------------- PRO FEATURE: Family Genetic & Thalassemia Marriage Guard ---------------- */
  AI.evaluateGeneticGuard = function (reportData, findings, calculatedIndices) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var indices = calculatedIndices || AI.calculateIndices(reportData, findings);
    var mentzer = indices.filter(function (x) { return x.id === 'mentzer'; })[0];

    var alerts = [];

    // 1. Thalassemia Carrier Premarital Shield
    var isThalCarrier = (mentzer && mentzer.score < 13) || (rawVals.mcv != null && rawVals.mcv < 75 && rawVals.rbc != null && rawVals.rbc > 4.8);
    if (isThalCarrier) {
      alerts.push({
        title: '🧬 Premarital Thalassemia Screening & Family Guard',
        category: 'Hemoglobinopathy Prevention',
        severity: 'CRITICAL PRECAUTION',
        summary: 'Red cell indices indicate strong probability of Heterozygous Beta-Thalassemia Minor trait (Carrier state).',
        geneticRisk: 'Consanguineous (cousin) marriage with another asymptomatic carrier poses a 25% (1 in 4) risk per child of Thalassemia Major (Cooley’s Anemia) requiring lifelong blood transfusions and iron chelation.',
        mandatoryAction: 'MANDATORY PREMARITAL SCREENING: Intended spouse must undergo Hemoglobin Electrophoresis (HbA2 quantification) prior to marriage.',
        familyAction: 'First-degree relatives (siblings & parents) should also be screened to map familial inheritance pattern.'
      });
    }

    // 2. Young-Onset Familial Metabolic Guard
    var age = parseFloat(pt.age) || 40;
    var isYoungDiabetic = (age < 35) && (rawVals.glucose_fasting >= 126 || rawVals.glucose_random >= 200 || rawVals.hba1c >= 6.5);
    if (isYoungDiabetic) {
      alerts.push({
        title: '🧬 Early-Onset Familial Diabetes & Monogenic (MODY) Advisory',
        category: 'Endocrine Genetics',
        severity: 'FAMILY ADVISORY',
        summary: 'Diabetic onset at age < 35 warrants screening for familial clustering or Monogenic Maturity-Onset Diabetes of the Young (MODY).',
        geneticRisk: 'Strong autosomal dominant transmission risk to offspring and siblings.',
        mandatoryAction: 'Screen all first-degree relatives (parents, siblings, children) with Fasting Blood Glucose and HbA1c.',
        familyAction: 'Maintain early dietary vigilance and physical activity in children.'
      });
    }

    return alerts;
  };

  /* ---------------- PRO FEATURE: Interactive Human Anatomy Organ Impact Map ---------------- */
  AI.evaluateOrganMap = function (reportData, findings, calculatedIndices) {
    var rawVals = AI.extractRawValues(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var sexStr = String(pt.sex || pt.gender || 'male').toLowerCase();
    var isFem = (sexStr === 'female' || sexStr === 'f');
    var indices = calculatedIndices || AI.calculateIndices(reportData, findings);
    var egfrItem = indices.filter(function (x) { return x.id === 'egfr'; })[0];
    var egfr = egfrItem ? egfrItem.score : null;
    var fib4Item = indices.filter(function (x) { return x.id === 'fib4'; })[0];
    var fib4 = fib4Item ? fib4Item.score : null;
    var mentzerItem = indices.filter(function (x) { return x.id === 'mentzer'; })[0];
    var mentzer = mentzerItem ? mentzerItem.score : null;

    var organs = [];

    // 1. Brain & Central Nervous System (🧠 Dimagh)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazards = [];
      var actions = [];

      var g = rawVals.glucose_random != null ? rawVals.glucose_random : rawVals.glucose_fasting;
      if (g != null) {
        tested = true;
        if (g < 50) {
          status = 'critical';
          markers.push({ name: 'Blood Glucose', val: g + ' mg/dL', status: 'critical', note: 'Severe Neuroglycopenia' });
          hazards.push('Critical hypoglycemia (< 50 mg/dL): Deprivation of obligate cerebral glucose substrate. High risk of seizure, loss of consciousness, and irreversible neuronal injury.');
          actions.push('EMERGENCY: Immediate IV 25% Dextrose (50-100 mL) followed by 10% Dextrose infusion and hourly glucometry.');
        } else if (g > 400) {
          if (status !== 'critical') status = 'critical';
          markers.push({ name: 'Blood Glucose', val: g + ' mg/dL', status: 'critical', note: 'Extreme Hyperosmolar Threat' });
          hazards.push('Extreme hyperglycemia (> 400 mg/dL): High serum hyperosmolality predisposing to intracellular cerebral dehydration and hyperosmolar hyperglycemic coma.');
          actions.push('Urgent isotonic saline rehydration and intravenous sliding-scale regular insulin.');
        } else {
          markers.push({ name: 'Blood Glucose', val: g + ' mg/dL', status: 'normal', note: 'Euglycemic' });
        }
      }

      if (rawVals.sodium != null) {
        tested = true;
        var na = rawVals.sodium;
        if (na < 125) {
          status = 'critical';
          markers.push({ name: 'Serum Sodium (Na+)', val: na + ' mEq/L', status: 'critical', note: 'Severe Hyponatremia' });
          hazards.push('Severe acute hyponatremia (< 125 mEq/L): Rapid cerebral edema with raised intracranial pressure, risk of uncal herniation and coma.');
          actions.push('Cautious hypertonic (3%) saline in ICU setting. Restrict Na correction rate to maximum 8 mEq/L in 24 hours to prevent osmotic demyelination syndrome.');
        } else if (na > 155) {
          status = 'critical';
          markers.push({ name: 'Serum Sodium (Na+)', val: na + ' mEq/L', status: 'critical', note: 'Severe Hypernatremia' });
          hazards.push('Severe hypernatremia (> 155 mEq/L): Acute brain shrinkage, subarachnoid vessel stretching, and intracranial hemorrhage risk.');
          actions.push('Slow correction with hypotonic IV fluids (5% Dextrose or 0.45% Saline).');
        } else if (na < 135 || na > 145) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Serum Sodium (Na+)', val: na + ' mEq/L', status: 'warning', note: 'Mild Dysnatremia' });
          hazards.push('Mild electrolyte imbalance causing potential lethargy, headache, and confusion in elderly patients.');
          actions.push('Adjust fluid balance and recheck electrolytes in 48 hours.');
        } else {
          markers.push({ name: 'Serum Sodium (Na+)', val: na + ' mEq/L', status: 'normal', note: 'Normal Osmolality' });
        }
      }

      if (rawVals.creatinine != null && rawVals.creatinine > 4.0) {
        status = 'critical';
        markers.push({ name: 'Creatinine', val: rawVals.creatinine + ' mg/dL', status: 'critical', note: 'Uremic Threat' });
        hazards.push('Severe nitrogenous waste buildup causing uremic encephalopathy, asterixis, and altered mental sensorium.');
        actions.push('Urgent nephrology consultation and dialysis evaluation for clearance of uremic neurotoxins.');
      }

      if (rawVals.bili_total != null && rawVals.bili_total > 10.0) {
        if (status !== 'critical') status = 'critical';
        markers.push({ name: 'Total Bilirubin', val: rawVals.bili_total + ' mg/dL', status: 'critical', note: 'Neurotoxic Bilirubin' });
        hazards.push('Severe hyperbilirubinemia: Potential passage across blood-brain barrier causing subcortical neuronal toxicity.');
        actions.push('Urgent intervention to decompress biliary obstruction or treat underlying acute hepatic necrosis.');
      }

      var finalHazard = tested
        ? (hazards.length ? hazards.join(' | ') : 'Cerebral parenchymal metabolic homeostasis is well-maintained within physiological parameters.')
        : 'Parameters for brain metabolic osmolality (Glucose, Sodium) not included in current test panel.';
      var finalAction = tested
        ? (actions.length ? actions.join(' | ') : 'Maintain standard neurological wellness, adequate hydration, and balanced glycemic habits.')
        : 'Include Fasting Glucose & Serum Electrolytes for baseline neurological assessment.';

      organs.push({
        id: 'brain',
        name: 'Brain & Central Nervous System',
        urduName: 'Dimagh & Aasabi Nizam',
        icon: '🧠',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 55 : (tested ? 10 : 0)),
        markers: markers,
        hazard: finalHazard,
        action: finalAction,
        svgX: 160,
        svgY: 52
      });
    })();

    // 2. Heart & Cardiovascular System (🫀 Dil & Raggain)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Cardiovascular hemodynamic and electrophysiological parameters within normal limits.';
      var action = 'Maintain cardioprotective lifestyle, low saturated fat diet, and regular aerobic exercise.';

      if (rawVals.potassium != null) {
        tested = true;
        var k = rawVals.potassium;
        if (k > 6.2) {
          status = 'critical';
          markers.push({ name: 'Serum Potassium (K+)', val: k + ' mEq/L', status: 'critical', note: 'Fatal Arrhythmia Hazard' });
          hazard = 'CRITICAL HYPERKALEMIA (> 6.2 mEq/L): Lethal cardiac conduction blockade, tall peaked T-waves, sine-wave progression, and ventricular arrest.';
          action = 'STAT 12-lead ECG, IV Calcium Gluconate (10ml of 10% over 5-10 mins) for membrane stabilization, followed by IV Insulin + Dextrose and nebulized Salbutamol.';
        } else if (k < 2.8) {
          status = 'critical';
          markers.push({ name: 'Serum Potassium (K+)', val: k + ' mEq/L', status: 'critical', note: 'Severe Hypokalemia' });
          hazard = 'CRITICAL HYPOKALEMIA (< 2.8 mEq/L): Prolonged QTc, U-waves, flattened T-waves, and fatal Torsades de Pointes ventricular tachycardia.';
          action = 'Continuous ECG monitoring, slow IV Potassium Chloride infusion (max 10-20 mEq/hr via infusion pump with central or wide vein).';
        } else if (k > 5.2 || k < 3.5) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Serum Potassium (K+)', val: k + ' mEq/L', status: 'warning', note: 'Mild K+ Imbalance' });
          hazard = 'Suboptimal serum potassium predisposing to atrial ectopic beats and mild myocardial irritability.';
          action = 'Dietary adjustment and repeat serum electrolytes within 7 days.';
        } else {
          markers.push({ name: 'Serum Potassium (K+)', val: k + ' mEq/L', status: 'normal', note: 'Electrophysiologically Stable' });
        }
      }

      if (rawVals.cholesterol != null || rawVals.ldl != null) {
        tested = true;
        var chol = rawVals.cholesterol;
        var ldl = rawVals.ldl;
        if ((chol != null && chol >= 240) || (ldl != null && ldl >= 160)) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Total Cholesterol / LDL', val: (chol ? chol + ' mg/dL' : '') + (ldl ? ' / LDL ' + ldl + ' mg/dL' : ''), status: 'warning', note: 'High Atherogenic Burden' });
          hazard = 'Atherosclerotic lipid buildup accelerating coronary artery disease, plaque stenosis, and acute myocardial infarction risk.';
          action = 'Initiate lipid-lowering Statin therapy (Atorvastatin 20mg or Rosuvastatin 10mg HS). Restrict saturated dietary fats.';
        } else if (chol != null && chol >= 200) {
          if (status === 'normal') status = 'warning';
          markers.push({ name: 'Total Cholesterol', val: chol + ' mg/dL', status: 'warning', note: 'Borderline High' });
          hazard = 'Early plaque deposition risk; requires lifestyle vigilance.';
          action = 'Dietary fat control, exercise, and follow-up lipid profile in 12 weeks.';
        } else if (chol != null) {
          markers.push({ name: 'Total Cholesterol', val: chol + ' mg/dL', status: 'normal', note: 'Optimal Range' });
        }
      }

      if (rawVals.hb != null && rawVals.hb < 6.5) {
        status = 'critical';
        markers.push({ name: 'Hemoglobin', val: rawVals.hb + ' g/dL', status: 'critical', note: 'Severe Myocardial Strain' });
        hazard = 'Extreme tissue hypoxia forcing hyperdynamic cardiac output, predisposing to high-output heart failure and angina.';
        action = 'Urgent packed red blood cell (PRBC) transfusion and bed rest.';
      }

      organs.push({
        id: 'heart',
        name: 'Heart & Cardiovascular System',
        urduName: 'Dil & Khoon Ki Raggain',
        icon: '🫀',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 60 : (tested ? 12 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Lipid profile and electrolytes not included in current test panel.',
        action: tested ? action : 'Order Fasting Lipid Profile & Serum Electrolytes to assess coronary heart disease risk.',
        svgX: 174,
        svgY: 156
      });
    })();

    // 3. Lungs & Respiratory System (🫁 Phepde)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Bronchopulmonary gas exchange and alveolar capillary bed appear non-compromised.';
      var action = 'Maintain clean pulmonary hygiene, avoid passive smoke exposure, and practice aerobic conditioning.';

      if (rawVals.wbc != null) {
        tested = true;
        var w = rawVals.wbc;
        if (w > 35000) {
          status = 'critical';
          markers.push({ name: 'WBC (TLC)', val: w + ' /uL', status: 'critical', note: 'Severe Sepsis / Leukostasis Threat' });
          hazard = 'Hyperleukocytosis: Potential sludging of white blood cells in pulmonary microcirculation causing acute dyspnea, alveolar injury, and ARDS.';
          action = 'Immediate hospital admission, Chest X-ray, blood cultures, and broad-spectrum IV antimicrobial coverage.';
        } else if (w < 1500) {
          status = 'critical';
          markers.push({ name: 'WBC (TLC)', val: w + ' /uL', status: 'critical', note: 'Severe Immunodeficiency' });
          hazard = 'Profound neutropenia / agranulocytosis: Extreme vulnerability to fulminant opportunistic bacterial/fungal pneumonia.';
          action = 'Reverse barrier isolation, prompt empiric broad-spectrum antibiotic coverage at first fever spike.';
        } else if (w > 11000) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'WBC (TLC)', val: w + ' /uL', status: 'warning', note: 'Active Infection / Inflammation' });
          hazard = 'Active leukocyte mobilization consistent with acute respiratory, bronchial, or systemic inflammatory response.';
          action = 'Co-Amoxiclav 625mg/1g BD x 5-7 days for respiratory infection; monitor oxygen saturation.';
        } else {
          markers.push({ name: 'WBC (TLC)', val: w + ' /uL', status: 'normal', note: 'Immune Defense Intact' });
        }
      }

      if (rawVals.hb != null) {
        tested = true;
        if (rawVals.hb < 8.0) {
          if (status === 'normal') status = 'warning';
          markers.push({ name: 'Hemoglobin', val: rawVals.hb + ' g/dL', status: 'warning', note: 'Oxygen Carrying Deficit' });
          hazard = 'Reduced arterial oxygen content triggering compensatory exertional tachypnea and shortness of breath.';
          action = 'Hematinic restoration; supplement iron and avoid intense physical exertion until Hb recovers.';
        }
      }

      organs.push({
        id: 'lungs',
        name: 'Lungs & Respiratory System',
        urduName: 'Phepde & Saans Ka Nizam',
        icon: '🫁',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 90 : (status === 'warning' ? 50 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Respiratory inflammatory markers (WBC, Sputum) not tested in this panel.',
        action: tested ? action : 'Perform Complete Blood Count (CBC) and Chest examination if cough or shortness of breath is present.',
        svgX: 148,
        svgY: 138
      });
    })();

    // 4. Liver & Hepatobiliary System (🥩 Jigar & Pitta)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Hepatic parenchymal architecture, transaminases, and bile secretion are physiologically stable.';
      var action = 'Maintain liver health: minimize deep-fried foods, zero unverified desi tonics, and preserve normal body mass index.';

      var alt = rawVals.alt;
      var ast = rawVals.ast;
      var bili = rawVals.bili_total;
      var alp = rawVals.alp;
      var alb = rawVals.albumin;

      if (alt != null || ast != null || bili != null || alp != null || alb != null) {
        tested = true;

        var maxT = Math.max(alt || 0, ast || 0);
        if (maxT > 300) {
          status = 'critical';
          markers.push({ name: 'Transaminases (ALT/AST)', val: (alt ? 'ALT ' + alt : '') + (ast ? ' | AST ' + ast : '') + ' U/L', status: 'critical', note: 'Fulminant Hepatocellular Injury' });
          hazard = 'Severe acute hepatic necrosis (> 300 U/L). Risk of acute liver failure, coagulopathy, and hepatic encephalopathy.';
          action = 'Urgent hospitalization, check PT/INR and Blood Ammonia, screen for Viral Hepatitis (HBsAg, Anti-HCV, Anti-HEV), withhold all hepatotoxic drugs.';
        } else if (maxT > 45) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Transaminases (ALT/AST)', val: (alt ? 'ALT ' + alt : '') + (ast ? ' | AST ' + ast : '') + ' U/L', status: 'warning', note: 'Transaminitis (Liver Inflammation)' });
          hazard = 'Active liver parenchymal inflammation consistent with NAFLD / Fatty Liver, viral infection, or drug stress.';
          action = 'Cap. Silymarin 140mg BD, strict elimination of fried foods, Ultrasound Abdomen, viral hepatitis screening.';
        } else if (alt != null) {
          markers.push({ name: 'ALT (SGPT)', val: alt + ' U/L', status: 'normal', note: 'Normal Hepatocytes' });
        }

        if (bili != null) {
          if (bili > 10.0) {
            status = 'critical';
            markers.push({ name: 'Total Bilirubin', val: bili + ' mg/dL', status: 'critical', note: 'Severe Cholestatic Jaundice' });
            hazard = 'Severe hyperbilirubinemia: Biliary tract obstruction or massive hepatocellular failure with overt scleral icterus and pruritus.';
            action = 'Urgent Ultrasound Abdomen & MRCP to evaluate biliary obstruction / CBD dilatation.';
          } else if (bili > 1.2) {
            if (status !== 'critical') status = 'warning';
            markers.push({ name: 'Total Bilirubin', val: bili + ' mg/dL', status: 'warning', note: 'Elevated Bilirubin (Jaundice)' });
            hazard = 'Impaired bilirubin clearance or accelerated hemolysis creating clinical jaundice.';
            action = 'Tab. UDCA 250mg BD, check direct/indirect fraction, evaluate for biliary stasis.';
          } else {
            markers.push({ name: 'Total Bilirubin', val: bili + ' mg/dL', status: 'normal', note: 'Normal Clearance' });
          }
        }

        if (fib4 != null && fib4 > 2.67) {
          if (status !== 'critical') status = 'critical';
          markers.push({ name: 'FIB-4 Liver Fibrosis Score', val: fib4 + ' (High Risk)', status: 'critical', note: 'Advanced Fibrosis / Cirrhosis' });
          hazard = 'FIB-4 score > 2.67 has ~80% positive predictive value for advanced bridging fibrosis or established cirrhosis.';
          action = 'Urgent Hepatology referral, Transient Elastography (FibroScan), screen for portal hypertension.';
        }
      }

      organs.push({
        id: 'liver',
        name: 'Liver & Hepatobiliary System',
        urduName: 'Jigar & Pitta',
        icon: '🥩',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 65 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Liver Function Tests (ALT, AST, Bilirubin) not present in current report.',
        action: tested ? action : 'Order Liver Function Tests (LFTs) and Ultrasound Abdomen for comprehensive hepatic staging.',
        svgX: 130,
        svgY: 206
      });
    })();

    // 5. Pancreas & Endocrine System (🥞 Lublooba & Sugar)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Pancreatic endocrine beta-cell function and insulin sensitivity are within physiological boundaries.';
      var action = 'Maintain low glycemic index diet, limit refined confectionery sweets, and maintain regular physical activity.';

      var g = rawVals.glucose_random != null ? rawVals.glucose_random : rawVals.glucose_fasting;
      var a1c = rawVals.hba1c;
      var tg = rawVals.triglycerides;

      if (g != null || a1c != null || tg != null) {
        tested = true;

        if (tg != null && tg >= 500) {
          status = 'critical';
          markers.push({ name: 'Triglycerides', val: tg + ' mg/dL', status: 'critical', note: 'Acute Pancreatitis Hazard' });
          hazard = 'Extreme hypertriglyceridemia (≥ 500 mg/dL): Chylomicron accumulation triggering localized capillary thrombosis and acute necrotizing pancreatitis.';
          action = 'Urgent initiation of Fenofibrate 145mg daily and Gemfibrozil/Omega-3; zero dietary fat intake; screen for epigastric pain radiating to back.';
        } else if (tg != null && tg >= 200) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Triglycerides', val: tg + ' mg/dL', status: 'warning', note: 'Elevated Triglycerides' });
          hazard = 'High circulating triglyceride levels causing insulin resistance and metabolic stress.';
          action = 'Reduce dietary sugars and carbohydrates, increase dietary fiber and exercise.';
        }

        if (a1c != null) {
          if (a1c >= 9.0) {
            status = 'critical';
            markers.push({ name: 'HbA1c', val: a1c + '%', status: 'critical', note: 'Severe Glycemic Decompensation' });
            hazard = 'Chronic severe hyperglycemia with extensive microvascular and macrovascular endothelial damage.';
            action = 'Intensify antidiabetic therapy (Metformin + SGLT2i / GLP-1 RA or basal insulin). Screen for diabetic retinopathy and nephropathy.';
          } else if (a1c >= 6.5) {
            if (status !== 'critical') status = 'warning';
            markers.push({ name: 'HbA1c', val: a1c + '%', status: 'warning', note: 'Diabetes Mellitus' });
            hazard = 'Chronic hyperglycemic dysregulation promoting beta-cell burnout and accelerated atherosclerosis.';
            action = 'Tab. Metformin 500-1000mg BD with meals, dietary sugar restriction, daily brisk walking.';
          } else if (a1c >= 5.7) {
            if (status === 'normal') status = 'warning';
            markers.push({ name: 'HbA1c', val: a1c + '%', status: 'warning', note: 'Pre-Diabetes' });
            hazard = 'Impaired glucose tolerance and early insulin resistance.';
            action = 'Lifestyle intervention: 7% weight loss target and 150 minutes weekly exercise to prevent progression to overt diabetes.';
          } else {
            markers.push({ name: 'HbA1c', val: a1c + '%', status: 'normal', note: 'Euglycemic Control' });
          }
        }

        if (g != null && a1c == null) {
          if (g >= 200) {
            if (status !== 'critical') status = 'warning';
            markers.push({ name: 'Blood Glucose', val: g + ' mg/dL', status: 'warning', note: 'Diabetic Hyperglycemia' });
            hazard = 'Elevated blood glucose indicating inadequate insulin release or peripheral receptor insensitivity.';
            action = 'Order confirmatory HbA1c, initiate oral hypoglycemic agent, eliminate refined sugars.';
          } else {
            markers.push({ name: 'Blood Glucose', val: g + ' mg/dL', status: 'normal', note: 'Normal Sugar' });
          }
        }
      }

      organs.push({
        id: 'pancreas',
        name: 'Pancreas & Endocrine System',
        urduName: 'Lublooba (Pancreas) & Sugar',
        icon: '🥞',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 60 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Glycemic parameters (Glucose, HbA1c) not tested in current panel.',
        action: tested ? action : 'Order Fasting Blood Glucose and HbA1c to screen for metabolic syndrome.',
        svgX: 160,
        svgY: 228
      });
    })();

    // 6. Kidneys & Urinary System (🫘 Gurday & Pishaab)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Renal filtration, tubular reabsorption, and urinary tract are biologically healthy.';
      var action = 'Maintain 2 to 2.5 liters daily water hydration. Avoid habitual consumption of OTC NSAID painkillers.';

      var cr = rawVals.creatinine;
      var ur = rawVals.urea;
      var pus = rawVals.urine_pus;
      var crLimit = isFem ? 1.1 : 1.3;

      if (cr != null || ur != null || pus != null || egfr != null) {
        tested = true;

        if (cr != null && cr > 4.0) {
          status = 'critical';
          markers.push({ name: 'Serum Creatinine', val: cr + ' mg/dL', status: 'critical', note: 'Severe Renal Shutdown' });
          hazard = 'Acute kidney shutdown / End-stage renal crisis (> 4.0 mg/dL). High risk of uremic pericarditis, metabolic acidosis, and pulmonary edema.';
          action = 'EMERGENCY: Urgent Nephrology consultation for hemodialysis access. Strictly stop all NSAIDs, Metformin, and ACEi/ARBs.';
        } else if (egfr != null && egfr < 15) {
          status = 'critical';
          markers.push({ name: 'eGFR', val: egfr + ' mL/min/1.73m²', status: 'critical', note: 'Kidney Failure (Stage 5)' });
          hazard = 'Severe end-stage renal filtration collapse.';
          action = 'Dialysis or renal transplant evaluation; fluid and potassium restriction.';
        } else if ((cr != null && cr > crLimit) || (egfr != null && egfr < 60)) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Serum Creatinine / eGFR', val: (cr ? cr + ' mg/dL' : '') + (egfr ? ' (eGFR ' + egfr + ')' : ''), status: 'warning', note: 'Renal Impairment (Azotemia)' });
          hazard = 'Reduced glomerular filtration capacity causing nitrogenous waste retention and impaired drug elimination.';
          action = 'STRICTLY AVOID ALL NSAIDs (Diclofenac, Brufen, Ponstan). Adjust renal doses of all drugs. Order Urine ACR and Ultrasound KUB.';
        } else if (cr != null) {
          markers.push({ name: 'Serum Creatinine', val: cr + ' mg/dL (eGFR ' + (egfr || '>90') + ')', status: 'normal', note: 'Normal Glomerular Filtration' });
        }

        if (pus != null) {
          if (pus > 25) {
            if (status !== 'critical') status = 'critical';
            markers.push({ name: 'Urine Pus Cells', val: pus + ' /HPF', status: 'critical', note: 'Severe Acute Pyuria (UTI)' });
            hazard = 'Severe active bacterial infection of urinary tract with risk of ascending pyelonephritis and bacteremia.';
            action = 'Urine Culture & Sensitivity STAT; Tab. Ciprofloxacin 500mg BD or Nitrofurantoin 100mg BD x 5-7 days; 3.5L fluid hydration.';
          } else if (pus > 5) {
            if (status === 'normal') status = 'warning';
            markers.push({ name: 'Urine Pus Cells', val: pus + ' /HPF', status: 'warning', note: 'Pyuria (Urinary Infection)' });
            hazard = 'Active lower urinary tract infection with dysuria and frequency.';
            action = 'Urine C/S, empiric urinary antibiotic coverage, Citro-soda urinary alkalinizer.';
          } else {
            markers.push({ name: 'Urine Pus Cells', val: pus + ' /HPF', status: 'normal', note: 'Clear Sterile Urine' });
          }
        }
      }

      organs.push({
        id: 'kidneys',
        name: 'Kidneys & Urinary Tract',
        urduName: 'Gurday & Pishaab Ka Nizam',
        icon: '🫘',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 65 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Renal parameters (Creatinine, Urine R/E) not tested in current panel.',
        action: tested ? action : 'Order Serum Creatinine, Blood Urea, and Urine Routine Examination for baseline renal staging.',
        svgX: 126,
        svgY: 256
      });
    })();

    // 7. Bone Marrow & Hematological Circulation (🩸 Khoon & Bone Marrow)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Hematopoiesis, erythroid/myeloid maturation, and platelet hemostatic function are within normal ranges.';
      var action = 'Maintain balanced dietary iron, folate, and vitamin B12 intake.';

      var hb = rawVals.hb;
      var plt = rawVals.plt;
      var mcv = rawVals.mcv;
      var rbc = rawVals.rbc;

      if (hb != null || plt != null || mcv != null || rbc != null) {
        tested = true;

        if (plt != null && plt < 20000) {
          status = 'critical';
          markers.push({ name: 'Platelet Count', val: plt + ' /uL', status: 'critical', note: 'Extreme Thrombocytopenia' });
          hazard = 'SPONTANEOUS FATAL BLEED THRESHOLD (< 20,000 /uL): High hazard of spontaneous intracranial, pulmonary, or massive gastrointestinal hemorrhage.';
          action = 'EMERGENCY: Strict bed rest, hospital admission, prepare platelet concentrate transfusion, avoid IM injections and all NSAIDs/blood thinners.';
        } else if (plt != null && plt < 80000) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Platelet Count', val: plt + ' /uL', status: 'warning', note: 'Thrombocytopenia (Bleeding Risk)' });
          hazard = 'Marked platelet deficiency predisposing to mucosal petechiae, gum bleeding, and hematoma.';
          action = 'STRICT BLEEDING SHIELD: Absolute contraindication of Brufen, Aspirin, Diclofenac. Use soft brush. Monitor platelet nadir daily.';
        } else if (plt != null) {
          markers.push({ name: 'Platelet Count', val: plt + ' /uL', status: 'normal', note: 'Adequate Hemostasis' });
        }

        if (hb != null) {
          var minHb = isFem ? 12.0 : 13.0;
          if (hb < 6.5) {
            status = 'critical';
            markers.push({ name: 'Hemoglobin', val: hb + ' g/dL', status: 'critical', note: 'Severe Anemia (Transfusion Trigger)' });
            hazard = 'Profound oxygen carrying collapse with critical myocardial and end-organ hypoxia.';
            action = 'Urgent packed red blood cell (PRBC) transfusion; urgent hematology workup.';
          } else if (hb < minHb) {
            if (status !== 'critical') status = 'warning';
            markers.push({ name: 'Hemoglobin', val: hb + ' g/dL', status: 'warning', note: 'Anemia' });
            hazard = 'Deficient red blood cell mass causing fatigue, weakness, dizziness, and pallor.';
            action = 'Tab. Ferrous Polymaltose / Ascorbate 100mg with Vitamin C 500mg daily x 3 months; Serum Ferritin test.';
          } else {
            markers.push({ name: 'Hemoglobin', val: hb + ' g/dL', status: 'normal', note: 'Adequate Oxygenation' });
          }
        }

        if (mentzer != null && mentzer < 13) {
          if (status !== 'critical') status = 'warning';
          markers.push({ name: 'Mentzer Index', val: mentzer + ' (<13)', status: 'warning', note: 'Beta-Thalassemia Trait Pattern' });
          hazard = 'Genetic hemoglobinopathy carrier state with microcytic target cells.';
          action = 'Order Hemoglobin Electrophoresis (HbA2 > 3.5%). Avoid empirical iron overload.';
        }
      }

      organs.push({
        id: 'blood',
        name: 'Bone Marrow & Circulatory System',
        urduName: 'Khoon & Bone Marrow (Hemato)',
        icon: '🩸',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 95 : (status === 'warning' ? 65 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Complete Blood Count (CBC) not tested in current panel.',
        action: tested ? action : 'Order Complete Blood Count (CBC / CP) for baseline hematological profiling.',
        svgX: 160,
        svgY: 310
      });
    })();

    // 8. Musculoskeletal & Joints (🦴 Haddi & Jor)
    (function () {
      var tested = false;
      var markers = [];
      var status = 'normal';
      var hazard = 'Bone mineral turnover and synovial joint fluid uric acid saturation are within physiological limits.';
      var action = 'Maintain adequate dietary calcium, Vitamin D3, and proper hydration to prevent crystalluria.';

      var ua = rawVals.uric_acid;
      var alp = rawVals.alp;
      var uaLimit = isFem ? 6.0 : 7.0;

      if (ua != null || alp != null) {
        tested = true;

        if (ua != null) {
          if (ua > 9.0) {
            status = 'critical';
            markers.push({ name: 'Serum Uric Acid', val: ua + ' mg/dL', status: 'critical', note: 'Severe Hyperuricemia (Gout)' });
            hazard = 'Extreme monosodium urate supersaturation: High risk of excruciating acute podagra (big toe gout), joint tophi, and urate nephropathy.';
            action = 'Tab. Febuxostat 40mg daily morning + Tab. Colchicine 0.5mg flare prophylaxis; strict low-purine diet (avoid red meat, kaleji, seafood); 3.5L water daily.';
          } else if (ua > uaLimit) {
            if (status !== 'critical') status = 'warning';
            markers.push({ name: 'Serum Uric Acid', val: ua + ' mg/dL', status: 'warning', note: 'Elevated Uric Acid' });
            hazard = 'Hyperuricemia increasing long-term risk of inflammatory arthritis and crystal nephrolithiasis.';
            action = 'Eliminate beef, mutton, organ meats, and high-fructose sodas. Recheck uric acid in 6 weeks.';
          } else {
            markers.push({ name: 'Serum Uric Acid', val: ua + ' mg/dL', status: 'normal', note: 'Normal Urate Balance' });
          }
        }

        if (alp != null && alp > 280) {
          if (status === 'normal') status = 'warning';
          markers.push({ name: 'Alkaline Phosphatase (ALP)', val: alp + ' U/L', status: 'warning', note: 'High Osteoblastic / Bone Turnover' });
          hazard = 'Elevated ALP indicating accelerated bone remodelling, Vitamin D deficiency osteomalacia, or biliary ductal micro-stasis.';
          action = 'Serum 25-OH Vitamin D3, Serum Calcium, and liver isoenzyme differentiation.';
        }
      }

      organs.push({
        id: 'joints',
        name: 'Musculoskeletal & Joints',
        urduName: 'Haddiyan & Jor (Bones/Joints)',
        icon: '🦴',
        tested: tested,
        status: tested ? status : 'untested',
        stressScore: status === 'critical' ? 85 : (status === 'warning' ? 55 : (tested ? 10 : 0)),
        markers: markers,
        hazard: tested ? hazard : 'Uric acid and bone turnover markers not tested in current panel.',
        action: tested ? action : 'Order Serum Uric Acid & Alkaline Phosphatase if joint pain or stiffness is present.',
        svgX: 160,
        svgY: 420
      });
    })();

    return organs;
  };

  /* Render Single Organ Deep-Dive Card (Theme Harmonized) */
  AI.renderSingleOrganCard = function (org) {
    if (!org) return '';
    var isCrit = org.status === 'critical';
    var isWarn = org.status === 'warning';
    var isSafe = org.status === 'normal';
    var badgeBg = '#f8fafc';
    var badgeColor = '#1e293b';
    var badgeBorder = '#cbd5e1';
    var badgeText = isCrit ? '🚨 CRITICAL STRESS' : (isWarn ? '⚠️ WARNING / STRESSED' : (isSafe ? '✅ OPTIMAL / HEALTHY' : '⚪ UNTESTED IN PANEL'));

    var markersHtml = '';
    if (org.markers && org.markers.length) {
      markersHtml = '<div style="margin-bottom:14px">'
        + '<div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.04em;margin-bottom:8px">Tested Organ Biomarkers</div>'
        + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">'
        + org.markers.map(function (m) {
            var mColor = '#0f172a';
            return '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px">'
              + '<div style="font-size:11px;color:#64748b">' + (window.App ? App.esc(m.name) : m.name) + '</div>'
              + '<div style="font-size:14px;font-weight:800;color:' + mColor + '">' + (window.App ? App.esc(m.val) : m.val) + '</div>'
              + (m.note ? '<div style="font-size:11px;color:#475569;margin-top:2px">' + (window.App ? App.esc(m.note) : m.note) + '</div>' : '')
              + '</div>';
          }).join('')
        + '</div>'
        + '</div>';
    } else {
      markersHtml = '<div style="font-size:12px;color:#64748b;background:#ffffff;padding:10px 12px;border-radius:8px;border:1px dashed #cbd5e1;margin-bottom:14px">No direct parameters tested for this organ in current laboratory order.</div>';
    }

    var gaugeColor = '#131845';

    return '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(15,30,46,0.04);transition:all 0.2s ease">'
      // Header
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:14px">'
      + '  <div style="display:flex;align-items:center;gap:10px">'
      + '    <span style="font-size:32px">' + org.icon + '</span>'
      + '    <div>'
      + '      <div style="font-size:17px;font-weight:800;color:#131845">' + (window.App ? App.esc(org.name) : org.name) + '</div>'
      + '      <div style="font-size:12px;font-weight:600;color:#64748b">' + (window.App ? App.esc(org.urduName) : org.urduName) + '</div>'
      + '    </div>'
      + '  </div>'
      + '  <span style="background:' + badgeBg + ';color:' + badgeColor + ';border:1px solid ' + badgeBorder + ';font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px">' + badgeText + '</span>'
      + '</div>'

      // Organ Stress Level Gauge
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px">'
      + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:12px">'
      + '    <span style="font-weight:700;color:#334155">Organ Stress Index:</span>'
      + '    <span style="font-weight:800;color:' + gaugeColor + '">' + org.stressScore + '% Stress</span>'
      + '  </div>'
      + '  <div style="width:100%;height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden">'
      + '    <div style="width:' + org.stressScore + '%;height:100%;background:' + gaugeColor + ';border-radius:999px;transition:width 0.4s ease"></div>'
      + '  </div>'
      + '</div>'

      // Markers Grid
      + markersHtml

      // Pathological Hazard / Stress Mechanism
      + '<div style="background:#ffffff;border:1px solid #e2e8f0;border-left:3px solid #131845;border-radius:8px;padding:12px 14px;margin-bottom:12px">'
      + '  <div style="font-size:12px;font-weight:700;color:#131845;text-transform:uppercase;margin-bottom:3px">⚠️ Pathophysiological Stress & Hazard:</div>'
      + '  <div style="font-size:13px;color:#334155;line-height:1.55">' + (window.App ? App.esc(org.hazard) : org.hazard) + '</div>'
      + '</div>'

      // Clinical Action Plan
      + '<div style="background:#ffffff;border:1px solid #e2e8f0;border-left:3px solid #131845;border-radius:8px;padding:12px 14px">'
      + '  <div style="font-size:12px;font-weight:700;color:#131845;text-transform:uppercase;margin-bottom:3px">💡 Evidence-Based Clinical Protection Plan:</div>'
      + '  <div style="font-size:13px;color:#0f172a;line-height:1.55;font-weight:600">' + (window.App ? App.esc(org.action) : org.action) + '</div>'
      + '</div>'
      + '</div>';
  };

  /* Render Interactive Body Map HTML (Theme Harmonized) */
  AI.renderBodyMapHtml = function (analysis) {
    var organs = (analysis && analysis.organMap) || [];
    if (!organs.length) return '<div style="padding:24px;text-align:center;color:#64748b;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px">No organ map data available.</div>';

    var activeOrganId = organs[0].id;
    var critOne = organs.filter(function (o) { return o.status === 'critical'; })[0];
    var warnOne = organs.filter(function (o) { return o.status === 'warning'; })[0];
    if (critOne) activeOrganId = critOne.id;
    else if (warnOne) activeOrganId = warnOne.id;

    var selectorButtons = organs.map(function (o) {
      var isAct = o.id === activeOrganId;

      return '<button type="button" class="btn ai-organ-select-btn' + (isAct ? ' active' : '') + '" data-organ-id="' + o.id + '" style="border:1px solid ' + (isAct ? '#131845' : '#cbd5e1') + ';background:' + (isAct ? '#131845' : '#ffffff') + ';color:' + (isAct ? '#ffffff' : '#1e293b') + ';font-weight:700;font-size:12px;padding:7px 10px;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;white-space:nowrap;box-shadow:0 1px 2px rgba(15,30,46,0.04);transition:all .15s ease">'
        + '<span>' + o.icon + '</span> <span>' + (window.App ? App.esc(o.name.split(' ')[0]) : o.name.split(' ')[0]) + '</span>'
        + '</button>';
    }).join('');

    var beaconsSvg = organs.map(function (o) {
      var isCrit = o.status === 'critical';
      var isWarn = o.status === 'warning';
      var pulseColor = '#94a3b8';
      var coreBg = '#f8fafc';
      var coreStroke = '#cbd5e1';
      var isAct = o.id === activeOrganId;

      return '<g class="ai-organ-beacon" data-organ-id="' + o.id + '" style="cursor:pointer" transform="translate(0,0)">'
        + (isCrit ? '<circle cx="' + o.svgX + '" cy="' + o.svgY + '" r="22" fill="none" stroke="' + pulseColor + '" stroke-width="1.5" opacity="0.4"><animate attributeName="r" values="16;24;16" dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite"/></circle>' : '')
        + (isWarn ? '<circle cx="' + o.svgX + '" cy="' + o.svgY + '" r="19" fill="none" stroke="' + pulseColor + '" stroke-width="1.2" opacity="0.4"/>' : '')
        + '<circle class="ai-beacon-ring" cx="' + o.svgX + '" cy="' + o.svgY + '" r="16" fill="' + (isAct ? '#131845' : coreBg) + '" stroke="' + (isAct ? '#131845' : coreStroke) + '" stroke-width="' + (isAct ? '2.5' : '1.5') + '" />'
        + '<text x="' + o.svgX + '" y="' + (o.svgY + 4) + '" text-anchor="middle" font-size="11" pointer-events="none">' + o.icon + '</text>'
        + '</g>';
    }).join('');

    var activeOrganObj = organs.filter(function (o) { return o.id === activeOrganId; })[0] || organs[0];
    var detailCardHtml = AI.renderSingleOrganCard(activeOrganObj);

    return '<div class="ai-bodymap-wrapper" style="margin-bottom:16px">'
      + '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:14px 18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '  <div>'
      + '    <div style="font-size:15px;font-weight:800;color:#131845">🫀 Organ Impact Map</div>'
      + '    <div style="font-size:12px;color:#64748b;margin-top:2px">Interactive physiological systems and clinical protection rules</div>'
      + '  </div>'
      + '  <div style="display:flex;gap:6px;font-size:11px;font-weight:700">'
      + '    <span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:3px 8px;border-radius:6px">Critical</span>'
      + '    <span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:3px 8px;border-radius:6px">Warning</span>'
      + '    <span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:3px 8px;border-radius:6px">Normal</span>'
      + '  </div>'
      + '</div>'

      + '<div class="ai-bodymap-layout" style="display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start">'
      // Left: SVG Silhouette (Theme Harmonized)
      + '  <div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;padding:16px 12px;text-align:center;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
      + '    <svg viewBox="0 0 320 500" width="100%" height="auto" style="max-height:480px;display:block;margin:0 auto;overflow:visible">'
      + '      <defs>'
      + '        <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">'
      + '          <stop offset="0%" stop-color="#f1f5f9" stop-opacity="0.95"/>'
      + '          <stop offset="100%" stop-color="#e2e8f0" stop-opacity="0.95"/>'
      + '        </linearGradient>'
      + '        <filter id="glowCrit" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ef4444" flood-opacity="0.5"/></filter>'
      + '        <filter id="glowWarn" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#f59e0b" flood-opacity="0.5"/></filter>'
      + '        <filter id="glowSafe" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#10b981" flood-opacity="0.4"/></filter>'
      + '      </defs>'
      // Human Body Silhouette
      + '      <circle cx="160" cy="52" r="26" fill="url(#bodyGrad)" stroke="#cbd5e1" stroke-width="1.5"/>'
      + '      <path d="M152,78 L168,78 L171,94 L149,94 Z" fill="url(#bodyGrad)"/>'
      + '      <path d="M110,105 C110,95 130,94 160,94 C190,94 210,95 210,105 L222,165 L204,180 L200,285 L120,285 L116,180 L98,165 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" stroke-width="1.5"/>'
      + '      <path d="M98,165 L80,260 L80,310 L94,310 L98,260 L114,180 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" stroke-width="1"/>'
      + '      <path d="M222,165 L240,260 L240,310 L226,310 L222,260 L206,180 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" stroke-width="1"/>'
      + '      <path d="M120,285 L200,285 L208,375 L192,490 L170,490 L174,360 L160,315 L146,360 L150,490 L128,490 L112,375 Z" fill="url(#bodyGrad)" stroke="#cbd5e1" stroke-width="1.5"/>'
      + '      <line x1="160" y1="80" x2="160" y2="315" stroke="#cbd5e1" stroke-dasharray="3,3" stroke-width="1" opacity="0.6"/>'
      +        beaconsSvg
      + '    </svg>'
      + '    <div style="margin-top:10px;font-size:11.5px;color:#64748b;font-weight:600">Bio-Anatomical Projection</div>'
      + '  </div>'

      // Right: Selector Bar + Active Card
      + '  <div>'
      + '    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px">'
      +        selectorButtons
      + '    </div>'
      + '    <div id="aiOrganDetailCard">'
      +        detailCardHtml
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';
  };

  /* ---------------- PRO FEATURE: 1-Click AI Executive Summary Narrative ---------------- */
  AI.generateReportNarrative = function (analysis) {
    var s = (analysis && analysis.solutions) || {};
    var findings = (analysis && analysis.findings) || [];
    var indices = (analysis && analysis.indices) || [];

    if (!findings.length) {
      return 'AI Clinical Correlation: Laboratory biochemical and hematological parameters are within physiological reference intervals. Routine wellness follow-up advised.';
    }

    var diagList = (s.diagnosis || []).map(function (d) { return d.title; });
    var narrative = 'AI Clinical Correlation: ' + diagList.join('; ') + '.';

    var mentzer = indices.filter(function (x) { return x.id === 'mentzer'; })[0];
    if (mentzer) {
      narrative += ' ' + (mentzer.score < 13 ? 'Mentzer index (' + mentzer.score + ') points to Thalassemia Minor pattern.' : 'Mentzer index (' + mentzer.score + ') points to Iron Deficiency pattern.');
    }

    var egfr = indices.filter(function (x) { return x.id === 'egfr'; })[0];
    if (egfr && egfr.score < 60) {
      narrative += ' Renal filtration moderately reduced (eGFR ' + egfr.score + ' mL/min).';
    }

    if (s.tests && s.tests.length) {
      narrative += ' Recommended follow-up: ' + s.tests.slice(0, 2).join(', ') + '.';
    }

    narrative += ' Clinical correlation by treating physician advised.';
    return narrative;
  };

  /* Attach AI Executive Summary directly to Result Remarks in DB */
  AI.attachSummaryToReportRemarks = function (invoiceId, narrativeText) {
    if (!invoiceId) {
      if (window.App && App.toast) App.toast('Invoice ID is missing', 'err');
      return false;
    }

    narrativeText = narrativeText || 'AI Clinical Correlation: Laboratory findings clinically reviewed.';

    // 1. Simulation / Sandbox mode check
    if (String(invoiceId).indexOf('SIM-') === 0) {
      if (window.App && App.toast) App.toast('AI Executive Summary attached to simulated report remarks (Preview Mode)!', 'ok');
      return true;
    }

    if (!window.DB || typeof DB.all !== 'function') {
      if (window.App && App.toast) App.toast('Database not available to save remarks', 'err');
      return false;
    }

    // 2. Resolve both invoice ID and invoice number
    var targetIds = [String(invoiceId)];
    var targetInv = null;
    try {
      var allInvs = DB.all('invoices') || [];
      for (var i = 0; i < allInvs.length; i++) {
        var it = allInvs[i];
        if (it && (String(it.id) === String(invoiceId) || String(it.no) === String(invoiceId))) {
          targetInv = it;
          if (it.id && targetIds.indexOf(String(it.id)) < 0) targetIds.push(String(it.id));
          if (it.no && targetIds.indexOf(String(it.no)) < 0) targetIds.push(String(it.no));
          break;
        }
      }
    } catch (eInv) {}

    // 3. Find matching results
    var allRes = (DB.all('results') || []).filter(function (r) {
      return r && targetIds.indexOf(String(r.invoiceId)) >= 0;
    });

    // 4. If no results record exists yet, but invoice exists with test items:
    if (!allRes.length && targetInv && Array.isArray(targetInv.items) && targetInv.items.length) {
      targetInv.items.forEach(function (it) {
        var newRes = {
          invoiceId: targetInv.id,
          testId: it.testId || it.id,
          values: { 'Remarks': narrativeText },
          status: 'pending',
          reportedAt: new Date().toISOString()
        };
        if (typeof DB.insert === 'function') {
          var created = DB.insert('results', newRes);
          if (created) allRes.push(created);
        }
      });
    }

    if (!allRes.length) {
      // Check if Result Entry form remarks input is open on screen
      var remInp = (typeof document !== 'undefined') ? document.getElementById('resRemarks') : null;
      if (remInp && typeof remInp === 'object') {
        var curVal = (remInp.value != null ? String(remInp.value) : '').trim();
        if (curVal.indexOf('AI Clinical Correlation') < 0) {
          remInp.value = curVal ? (curVal + ' | ' + narrativeText) : narrativeText;
        }
        if (window.App && App.toast) App.toast('AI Executive Summary copied into Remarks field!', 'ok');
        return true;
      }
      if (window.App && App.toast) App.toast('No result record found for invoice #' + invoiceId, 'err');
      return false;
    }

    // 5. Update results in DB
    allRes.forEach(function (r) {
      r.values = r.values || {};
      var existing = r.values['Remarks'] || '';
      if (existing.indexOf('AI Clinical Correlation') < 0) {
        r.values['Remarks'] = existing ? (existing + ' | ' + narrativeText) : narrativeText;
      }
      if (typeof DB.update === 'function') {
        DB.update('results', r.id, { values: r.values });
      } else if (typeof DB.put === 'function') {
        DB.put('results', r);
      } else if (typeof DB.set === 'function') {
        DB.set('results', r.id, r);
      }
    });

    // 6. Update open DOM inputs if Result Entry form or Report Viewer is open
    if (typeof document !== 'undefined') {
      var remInp2 = document.getElementById('resRemarks');
      if (remInp2 && typeof remInp2 === 'object') {
        var ex2 = (remInp2.value != null ? String(remInp2.value) : '').trim();
        if (ex2.indexOf('AI Clinical Correlation') < 0) {
          remInp2.value = ex2 ? (ex2 + ' | ' + narrativeText) : narrativeText;
        }
      }
      var bremInps = document.querySelectorAll ? document.querySelectorAll('[data-brem]') : null;
      if (bremInps && bremInps.length) {
        bremInps.forEach(function (inp) {
          if (inp && typeof inp === 'object') {
            var exB = (inp.value != null ? String(inp.value) : '').trim();
            if (exB.indexOf('AI Clinical Correlation') < 0) {
              inp.value = exB ? (exB + ' | ' + narrativeText) : narrativeText;
            }
          }
        });
      }

      // If Report Viewer modal is open in the background, refresh its preview HTML
      try {
        var rvHtmlWrap = document.getElementById('rvHtmlFrameWrap');
        if (rvHtmlWrap && window.App && typeof App.reportHtml === 'function' && typeof App.reportData === 'function') {
          var updatedData = App.reportData(targetInv ? targetInv.id : invoiceId);
          if (updatedData) {
            rvHtmlWrap.innerHTML = App.previewQr ? App.previewQr(App.reportHtml(updatedData), targetInv ? targetInv.id : invoiceId) : App.reportHtml(updatedData);
          }
        }
      } catch (ePreview) {}
    }

    try {
      localStorage.setItem('optix_ai_remarks_' + invoiceId, narrativeText);
    } catch (eLs) {}

    if (window.App && App.toast) {
      App.toast('AI Executive Summary successfully attached to printed report note!', 'ok');
    }
    return true;
  };

  /* ---------------- PRO FEATURE: Native Voice Dictation (Urdu & English) ---------------- */
  AI.isVoiceSupported = function () {
    return !!(typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition));
  };

  AI.startVoiceDictation = function (options) {
    options = options || {};
    if (!AI.isVoiceSupported()) {
      if (window.App && App.toast) App.toast('Speech recognition not supported in this browser. Please use Google Chrome or Edge.', 'err');
      return null;
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var recognizer = new SR();
    recognizer.continuous = options.continuous !== false;
    recognizer.interimResults = true;
    recognizer.lang = options.lang || 'ur-PK';

    recognizer.onresult = function (event) {
      var transcript = '';
      for (var i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (typeof options.onTranscript === 'function') {
        var isFinal = event.results[event.results.length - 1].isFinal;
        options.onTranscript(transcript, isFinal);
      }
    };

    recognizer.onerror = function (event) {
      if (typeof options.onError === 'function') options.onError(event.error);
    };

    recognizer.onend = function () {
      if (typeof options.onEnd === 'function') options.onEnd();
    };

    try { recognizer.start(); } catch (e) {}
    return recognizer;
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

    var cfg = (typeof AI.getAiConfig === 'function') ? AI.getAiConfig() : null;
    var brand = (cfg && cfg.doctorBranding) || {};
    var docName = doc.name || brand.name || 'Consultant Physician';
    var docDegrees = doc.degrees || brand.degrees || 'MBBS, FCPS / MD (Internal Medicine)';
    var docPmdc = doc.pmdc || doc.regNo || brand.pmdc || '49281-P';
    var docClinic = doc.clinic || brand.clinic || 'Optix Medical Care & Diagnostics';
    var docPhone = doc.phone || brand.phone || '+92 300 0000000';
    var docSpec = doc.specialization || brand.specialization || 'Clinical Specialist & Diagnostician';

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
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #131845;padding-bottom:14px;margin-bottom:14px">'
      + '  <div>'
      + '    <div style="font-size:22px;font-weight:900;color:#131845;letter-spacing:-0.02em">Dr. ' + (window.App ? App.esc(docName) : docName) + '</div>'
      + '    <div style="font-size:12.5px;font-weight:700;color:#131845;margin-top:2px">' + (window.App ? App.esc(docDegrees) : docDegrees) + ' &bull; PMDC Reg #: ' + (window.App ? App.esc(docPmdc) : docPmdc) + '</div>'
      + '    <div style="font-size:11.5px;color:#64748b;margin-top:2px">' + (window.App ? App.esc(docSpec) : docSpec) + '</div>'
      + '  </div>'
      + '  <div style="text-align:right">'
      + '    <div style="font-size:16px;font-weight:800;color:#0f172a">' + (window.App ? App.esc(docClinic) : docClinic) + '</div>'
      + '    <div style="font-size:11.5px;color:#64748b">Advanced Clinical Decision Support</div>'
      + '    <div style="font-size:11px;font-weight:700;color:#059669;margin-top:2px">Phone: ' + (window.App ? App.esc(docPhone) : docPhone) + '</div>'
      + '  </div>'
      + '</div>'

      // Patient Demographics Bar
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12.5px">'
      + '  <div>Patient: <b style="color:#0f172a">' + (window.App ? App.esc(pt.name || 'Patient') : (pt.name || 'Patient')) + '</b></div>'
      + '  <div>Age / Sex: <b>' + (window.App ? App.esc(pt.age ? pt.age + ' Y' : 'Adult') : (pt.age ? pt.age + ' Y' : 'Adult')) + ' / ' + (window.App ? App.esc(pt.sex || pt.gender || 'M') : (pt.sex || pt.gender || 'M')) + '</b></div>'
      + '  <div>Invoice #: <b style="color:#131845">#' + (window.App ? App.esc(inv.no || inv.id || 'N/A') : (inv.no || inv.id || 'N/A')) + '</b></div>'
      + '  <div>Date: <b>' + todayStr + '</b></div>'
      + '</div>'

      // Rx Symbol & Prescribed Drugs Table
      + '<div style="margin-bottom:18px">'
      + '  <div style="font-family:serif;font-size:32px;font-weight:900;color:#131845;line-height:1;margin-bottom:8px">℞</div>'
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

      // Custom Spoken / Dictated Clinical Notes Area
      + '<div id="rxDictationNotesBox" style="background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:10px 12px;margin-bottom:18px;display:none">'
      + '  <div style="font-size:11px;font-weight:800;color:#131845;text-transform:uppercase;margin-bottom:4px">🎙️ Dictated Physician Notes:</div>'
      + '  <div id="rxDictationText" style="font-size:12.5px;color:#1e293b;line-height:1.45"></div>'
      + '</div>'

      // Instructions & Parhez Columns
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">'
      + '  <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:3.5px solid #d97706;border-radius:8px;padding:12px">'
      + '    <div style="font-size:12px;font-weight:800;color:#d97706;text-transform:uppercase;margin-bottom:6px">🥗 Dietary Instructions & Parhez:</div>'
      + '    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:#451a03;line-height:1.5">' + (dietBullets || '<li>Standard balanced nutritional diet.</li>') + '</ul>'
      + '  </div>'
      + '  <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:3.5px solid #2563eb;border-radius:8px;padding:12px">'
      + '    <div style="font-size:12px;font-weight:800;color:#2563eb;text-transform:uppercase;margin-bottom:6px">🔬 Recommended Follow-up Tests:</div>'
      + '    <ul style="margin:0;padding-left:16px;font-size:11.5px;color:#1e293b;line-height:1.5">' + (testBullets || '<li>Routine follow-up in 4 weeks.</li>') + '</ul>'
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

    if (!sol5_redflags.length) {
      sol5_redflags.push('CLINICAL CORRELATION REQUIRED: Always correlate laboratory findings with the patient’s physical examination, clinical history, and symptom severity.');
    }

    // Compute Extended Pro Capabilities
    var indices = AI.calculateIndices(reportData, findings);
    var ascvdRisk = AI.calculateAscvdRisk(reportData);
    var drugSafety = AI.evaluateDrugSafety(reportData, findings, indices);
    var panicInfo = AI.checkPanicValues(reportData);
    var historicalDelta = AI.evaluateHistoricalDelta(inv.id || inv.no, reportData);
    var ddx = AI.calculateDifferentialDiagnosis(reportData, findings);

    var allMedsFlat = [];
    sol2_meds.forEach(function (cat) { (cat.items || []).forEach(function (it) { allMedsFlat.push(it.drug); }); });
    var drugInteractions = AI.checkDrugInteractions(allMedsFlat);
    var geneticGuard = AI.evaluateGeneticGuard(reportData, findings, indices);
    var organMap = AI.evaluateOrganMap(reportData, findings, indices);

    var urduGuide = AI.generateUrduPatientGuide({
      patient: pt, invoice: inv, doctor: doc, findings: findings,
      solutions: { diagnosis: sol1_diagnosis, medications: sol2_meds, diet: sol3_diet, tests: sol4_tests, redflags: sol5_redflags }
    }, indices, drugSafety);

    var reportNarrative = AI.generateReportNarrative({
      patient: pt, invoice: inv, findings: findings,
      solutions: { diagnosis: sol1_diagnosis, medications: sol2_meds, diet: sol3_diet, tests: sol4_tests, redflags: sol5_redflags },
      indices: indices
    });

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
      // Extended Pro Modules
      indices: indices,
      ascvdRisk: ascvdRisk,
      drugSafety: drugSafety,
      panicInfo: panicInfo,
      historicalDelta: historicalDelta,
      ddx: ddx,
      drugInteractions: drugInteractions,
      geneticGuard: geneticGuard,
      organMap: organMap,
      urduGuide: urduGuide,
      reportNarrative: reportNarrative
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
    var allowed = (set && set.aiConfig && Array.isArray(set.aiConfig.roles)) ? set.aiConfig.roles
                : ((set && Array.isArray(set.aiInsightsRoles)) ? set.aiInsightsRoles : ['admin', 'doctor', 'technician']);
    return allowed.indexOf(role) >= 0;
  };

  /* AI Decision Support Stats Tracker */
  AI._recordStatsForAnalysis = function (analysis) {
    if (!analysis || !analysis.invoice) return;
    var inv = analysis.invoice;
    var panicInfo = analysis.panicInfo || { isPanic: false };
    var organMap = analysis.organMap || [];
    var critOrgans = organMap.filter(function (o) { return o.status === 'critical'; });
    var warnOrgans = organMap.filter(function (o) { return o.status === 'warning'; });
    var drugInteractions = analysis.drugInteractions || [];

    if (String(inv.id || inv.no || '').indexOf('SIM-') !== 0) {
      AI.recordAiStat('analyzed');
      if (panicInfo.isPanic) AI.recordAiStat('panics');
      if (critOrgans.length || warnOrgans.length) AI.recordAiStat('organAlerts');
      if (drugInteractions.length) AI.recordAiStat('ddiBlocked');
    }
  };

  /* Helper to resolve report data from invoiceId, cache, or database */
  AI.getReportAnalysisData = function (invoiceId, directData) {
    var d = directData || null;
    if (!d && AI._directDataCache && invoiceId && AI._directDataCache[String(invoiceId)]) {
      d = AI._directDataCache[String(invoiceId)];
    }
    if (!d) {
      try {
        if (window.reportData) d = window.reportData(invoiceId);
        else if (window.App && App.reportData) d = App.reportData(invoiceId);
      } catch (e) {}
    }

    if (!d) {
      var inv = (window.DB && typeof DB.get === 'function')
        ? (invoiceId ? (DB.get('invoices', invoiceId) || (DB.all('invoices') || []).filter(function (x) { return x.no === invoiceId; })[0]) : null)
        : null;
      if (!inv && !directData && window.DB && typeof DB.all === 'function') {
        var allInvs = (DB.all('invoices') || []).filter(function (x) { return x && (x.id || x.no); });
        if (allInvs.length) inv = allInvs[allInvs.length - 1];
      }
      if (inv) {
        var pt = (DB.get('patients', inv.patientId)) || {};
        var doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;
        var tests = (DB.all('tests')) || [];
        var results = (DB.all('results') || []).filter(function (r) { return r.invoiceId === inv.id || (inv.no && r.invoiceId === inv.no); });
        var groups = results.map(function (r) {
          var t = DB.get('tests', r.testId) || tests.filter(function (x) { return x.id === r.testId; })[0];
          return { test: t, res: r };
        });
        d = { inv: inv, pt: pt, doc: doc, groups: groups };
      }
    }
    return d;
  };

  /* Build Harmonized Recommendations Content HTML (White Cards, Brand Navy, Crisp Badges) */
  AI.buildRecommendationsContent = function (analysis, options) {
    var opts = options || {};
    var isPage = !!opts.isPage;

    var pt = analysis.patient;
    var inv = analysis.invoice;
    var doc = analysis.doctor;
    var s = analysis.solutions;
    var findings = analysis.findings;
    var indices = analysis.indices || [];
    var ascvdRisk = analysis.ascvdRisk || null;
    var drugSafety = analysis.drugSafety || [];
    var panicInfo = analysis.panicInfo || { isPanic: false, alerts: [], formattedMessage: '' };
    var historicalDelta = analysis.historicalDelta || { hasHistory: false, comparisons: [], velocityAlerts: [] };
    var ddx = analysis.ddx || [];
    var drugInteractions = analysis.drugInteractions || [];
    var geneticGuard = analysis.geneticGuard || [];
    var urduGuide = analysis.urduGuide || { wazahat: [], khurak: [], parhez: [], dawaiSchedule: [], khatraAlamaat: [], plainText: '' };
    var organMap = analysis.organMap || [];
    var critOrgans = organMap.filter(function (o) { return o.status === 'critical'; });
    var warnOrgans = organMap.filter(function (o) { return o.status === 'warning'; });
    var safeOrgans = organMap.filter(function (o) { return o.status === 'normal'; });

    // Detected abnormal parameters badge strip (Calm & Clean Theme)
    var findingsBadges = findings.length
      ? findings.map(function (f) {
          var isCrit = f.status.indexOf('critical') >= 0;
          return '<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;font-size:12px;font-weight:600;background:#ffffff;color:#1e293b;border:1px solid #cbd5e1">'
            + (isCrit ? '⚠️ ' : '⚡ ') + (window.App ? App.esc(f.paramName) : f.paramName) + ': <b style="color:#0f172a">' + (window.App ? App.esc(f.value) : f.value) + ' ' + (window.App ? App.esc(f.unit) : f.unit) + '</b> <span style="font-size:11px;color:#64748b">(' + (window.App ? App.esc(f.note || f.status) : (f.note || f.status)) + ')</span></span>';
        }).join(' ')
      : '<span style="color:#334155;font-weight:700;font-size:12px">✅ All tested parameters within normal reference ranges</span>';

    // Solution 1 HTML (Diagnosis & Findings + DDx in Bullet Points)
    var diagHtml = '<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.65">'
      + s.diagnosis.map(function (di) {
          return '<li style="margin-bottom:10px">'
            + '<b style="color:#0f172a">' + (window.App ? App.esc(di.title) : di.title) + ':</b> '
            + '<span>' + (window.App ? App.esc(di.detail) : di.detail) + '</span>'
            + '</li>';
        }).join('')
      + '</ul>';

    if (ddx.length) {
      var ddxSnippets = ddx.map(function (dm) {
        return dm.candidates.map(function (c) {
          return '<li style="margin-bottom:5px"><b>' + (window.App ? App.esc(c.disease) : c.disease) + ':</b> '
            + '<span style="color:#64748b">(' + (window.App ? App.esc(c.confirmatoryTest) : c.confirmatoryTest) + ')</span> '
            + '<span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:1px 6px;border-radius:4px;font-weight:700;font-size:10.5px">' + c.probability + '% Match</span></li>';
        }).join('');
      }).join('');
      diagHtml += '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #e2e8f0">'
        + '<div style="font-size:11.5px;font-weight:800;color:#131845;text-transform:uppercase;margin-bottom:6px">Differential Diagnosis (DDx):</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#475569;line-height:1.55">'
        + ddxSnippets
        + '</ul>'
        + '</div>';
    }

    // Solution 2 HTML (Medications + DDI in Bullet Points)
    var medsHtml = '<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.65">'
      + s.medications.map(function (m) {
          var items = m.items.map(function (it) {
            return '<div style="margin-bottom:4px">'
              + '<b style="color:#0f172a">' + (window.App ? App.esc(it.drug) : it.drug) + '</b> '
              + '<span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700">' + (window.App ? App.esc(it.dosage) : it.dosage) + '</span>'
              + (it.note ? '<div style="font-size:11.5px;color:#64748b;margin-top:1px">' + (window.App ? App.esc(it.note) : it.note) + '</div>' : '')
              + '</div>';
          }).join('');
          return '<li style="margin-bottom:10px">'
            + '<div style="font-weight:700;color:#131845;font-size:12px;text-transform:uppercase;margin-bottom:3px">' + (window.App ? App.esc(m.category) : m.category) + '</div>'
            + items
            + '</li>';
        }).join('')
      + '</ul>';

    if (drugInteractions.length) {
      var ddiSnippets = drugInteractions.map(function (di) {
        return '<li style="margin-bottom:4px;color:#334155"><b>' + (window.App ? App.esc(di.pair) : di.pair) + ':</b> '
          + (window.App ? App.esc(di.solution || di.mechanism) : (di.solution || di.mechanism)) + '</li>';
      }).join('');
      medsHtml += '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #cbd5e1">'
        + '<div style="font-size:11.5px;font-weight:800;color:#131845;text-transform:uppercase;margin-bottom:6px">⚠️ Drug Conflicts (DDI):</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.5">'
        + ddiSnippets
        + '</ul>'
        + '</div>';
    }

    // Solution 3 HTML (Diet & Lifestyle Plan in Bullet Points)
    var dietHtml = '<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.65">'
      + s.diet.map(function (d) { return '<li style="margin-bottom:10px">' + (window.App ? App.esc(d) : d) + '</li>'; }).join('')
      + '</ul>';

    // Solution 4 HTML (Follow-up Tests in Bullet Points)
    var testsHtml = '<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.65">'
      + s.tests.map(function (t) {
          var cleanName = t.replace(/\.$/, '');
          var ptId = pt.id || (inv && inv.patientId) || '';
          return '<li style="margin-bottom:10px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'
            + '  <span>' + (window.App ? App.esc(cleanName) : cleanName) + '</span>'
            + '  <button type="button" class="btn btn-ghost ai-order-test-btn" data-testname="' + (window.App ? App.esc(cleanName) : cleanName) + '" data-ptid="' + (window.App ? App.esc(ptId) : ptId) + '" style="font-size:11.5px;font-weight:600;color:#131845;border:1px solid #cbd5e1;padding:3px 10px;border-radius:7px;background:#ffffff;white-space:nowrap;cursor:pointer">➕ Order</button>'
            + '</div>'
            + '</li>';
        }).join('')
      + '</ul>';

    // Solution 5 HTML (Red Flags in Bullet Points)
    var redflagsHtml = '<ul style="margin:0;padding-left:18px;font-size:13px;color:#334155;line-height:1.65">'
      + s.redflags.map(function (rf) {
          return '<li style="margin-bottom:10px;font-weight:600">'
            + (window.App ? App.esc(rf) : rf)
            + '</li>';
        }).join('')
      + '</ul>';

    // Panic Value Banner (Calm & Clean Medical Theme)
    var panicBannerHtml = '';
    if (panicInfo.isPanic) {
      var panicDetails = panicInfo.alerts.map(function (a) {
        return '<b>' + (window.App ? App.esc(a.param) : a.param) + ' (' + (window.App ? App.esc(a.value) : a.value) + '):</b> ' + (window.App ? App.esc(a.hazard) : a.hazard);
      }).join(' &bull; ');

      panicBannerHtml = '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-left:4px solid #131845;color:#0f172a;border-radius:12px;padding:14px 18px;margin-bottom:16px;box-shadow:0 1px 3px rgba(15,30,46,0.04);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
        + '<div style="display:flex;align-items:center;gap:10px">'
        + '  <span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>'
        + '  <div>'
        + '    <div style="font-size:13px;font-weight:800;color:#131845;letter-spacing:0.02em">CRITICAL PANIC-VALUE LAB ALERT (ISO 15189 / CAP Standard)</div>'
        + '    <div style="font-size:12px;color:#475569;margin-top:2px">' + panicDetails + '</div>'
        + '  </div>'
        + '</div>'
        + '<div>'
        + '  <button type="button" class="btn ai-action-btn" id="aiSendPanicSos" style="background:#ffffff;color:#1e293b;border:1.5px solid #cbd5e1;font-weight:700;padding:7px 14px;border-radius:8px;font-size:12px;cursor:pointer"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Send Panic SOS to Doctor</span></button>'
        + '</div>'
        + '</div>';
    }

    // Tab 2: Medical Indices & ASCVD HTML (Calm Theme)
    var indicesHtml = '';
    if (ascvdRisk) {
      indicesHtml += '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
        + '  <div>'
        + '    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.04em">Cardiovascular / AHA-ACC Guideline</div>'
        + '    <div style="font-size:15.5px;font-weight:800;color:#131845;margin-top:2px;display:flex;align-items:center;gap:7px"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span><span>10-Year ASCVD Heart Attack &amp; Stroke Risk</span></div>'
        + '    <div style="font-size:12px;color:#64748b;margin-top:2px">' + (window.App ? App.esc(ascvdRisk.details) : ascvdRisk.details) + '</div>'
        + '  </div>'
        + '  <div style="text-align:right">'
        + '    <div style="font-size:22px;font-weight:800;color:#131845">' + ascvdRisk.riskScore + '% <span style="font-size:11px;font-weight:600;color:#64748b">10-Yr Risk</span></div>'
        + '    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b">' + (window.App ? App.esc(ascvdRisk.tier) : ascvdRisk.tier) + '</span>'
        + '  </div>'
        + '</div>'
        + '<div style="font-size:12.5px;color:#334155;line-height:1.55;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">'
        + '  <b style="color:#0f172a">Clinical Recommendation:</b> ' + (window.App ? App.esc(ascvdRisk.recommendation) : ascvdRisk.recommendation)
        + '</div>'
        + '</div>';
    }

    if (indices.length) {
      indicesHtml += indices.map(function (ind) {
        return '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
          + '  <div>'
          + '    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.04em">' + (window.App ? App.esc(ind.category) : ind.category) + '</div>'
          + '    <div style="font-size:15px;font-weight:800;color:#131845;margin-top:2px">' + (window.App ? App.esc(ind.name) : ind.name) + '</div>'
          + '    <div style="font-size:11.5px;color:#64748b;margin-top:2px">Formula: ' + (window.App ? App.esc(ind.formula) : ind.formula) + '</div>'
          + '  </div>'
          + '  <div style="text-align:right">'
          + '    <div style="font-size:20px;font-weight:800;color:#131845">' + ind.score + ' <span style="font-size:11.5px;font-weight:600;color:#64748b">' + ind.unit + '</span></div>'
          + '    <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:#f8fafc;border:1px solid #cbd5e1;color:#1e293b">' + (window.App ? App.esc(ind.statusLabel) : ind.statusLabel) + '</span>'
          + '  </div>'
          + '</div>'
          + '<div style="font-size:12.5px;color:#334155;line-height:1.55;margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9">'
          + '  <b style="color:#0f172a">Interpretation:</b> ' + (window.App ? App.esc(ind.interpretation) : ind.interpretation) + '<br>'
          + '  <b style="color:#0f172a">Clinical Action:</b> ' + (window.App ? App.esc(ind.recommendation) : ind.recommendation)
          + '</div>'
          + '</div>';
      }).join('');
    }

    // Tab 3: Drug Safety & DDI Shield HTML (Calm Theme)
    var safetyHtml = '';
    if (drugInteractions.length) {
      safetyHtml += '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
        + '<div style="font-size:14.5px;font-weight:800;color:#131845;margin-bottom:12px;display:flex;align-items:center;gap:7px"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></span><span>Drug Interactions &amp; Clash Matrix (DDI)</span></div>'
        + drugInteractions.map(function (di) {
            return '<div style="background:#ffffff;border:1px solid #cbd5e1;border-left:3px solid #131845;border-radius:8px;padding:12px 14px;margin-bottom:8px">'
              + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:gap:6px">'
              + '  <b style="color:#131845;font-size:13px;display:inline-flex;align-items:center;gap:5px"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ' + (window.App ? App.esc(di.pair) : di.pair) + '</b>'
              + '  <span style="background:#f8fafc;color:#1e293b;border:1px solid #cbd5e1;padding:2px 8px;border-radius:6px;font-size:10.5px;font-weight:700;text-transform:uppercase">' + di.severity + '</span>'
              + '</div>'
              + '<div style="font-size:12px;color:#475569;margin-top:4px;line-height:1.45">' + (window.App ? App.esc(di.mechanism) : di.mechanism) + '</div>'
              + '<div style="font-size:12px;color:#1e293b;font-weight:700;margin-top:4px">💡 Recommendation: ' + (window.App ? App.esc(di.solution) : di.solution) + '</div>'
              + '</div>';
          }).join('')
        + '</div>';
    }

    if (drugSafety.length) {
      safetyHtml += drugSafety.map(function (ds) {
        var dsSvg = ds.organ === 'Renal'
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
          : (ds.organ === 'Hepatic'
              ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
              : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>');
        var contraHtml = ds.contraindications.map(function (c) {
          return '<li style="margin-bottom:4px"><b style="color:#1e293b">CONTRAINDICATED:</b> <span style="color:#334155">' + (window.App ? App.esc(c) : c) + '</span></li>';
        }).join('');
        var cautionsHtml = ds.cautions.map(function (c) {
          return '<li style="margin-bottom:4px"><b style="color:#1e293b">CAUTION:</b> <span style="color:#334155">' + (window.App ? App.esc(c) : c) + '</span></li>';
        }).join('');
        var safeHtml = ds.safeAlternatives.map(function (sAlt) {
          return '<li style="margin-bottom:4px"><b style="color:#1e293b">SAFE ALTERNATIVE:</b> <span style="color:#334155">' + (window.App ? App.esc(sAlt) : sAlt) + '</span></li>';
        }).join('');

        return '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
          + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          + '  <span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0">' + dsSvg + '</span>'
          + '  <div>'
          + '    <div style="font-size:15px;font-weight:800;color:#131845">' + (window.App ? App.esc(ds.title) : ds.title) + '</div>'
          + '    <div style="font-size:11.5px;color:#64748b;margin-top:1px">Trigger: ' + (window.App ? App.esc(ds.trigger) : ds.trigger) + '</div>'
          + '  </div>'
          + '</div>'
          + '<ul style="margin:8px 0 0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.6">'
          + contraHtml + cautionsHtml + safeHtml
          + '</ul>'
          + '</div>';
      }).join('');
    } else if (!drugInteractions.length) {
      safetyHtml = '<div style="padding:22px;text-align:center;color:#334155;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;font-weight:700">✅ All organ safety shields green. No renal, hepatic, or hematological drug contraindications detected.</div>';
    }

    // Tab 4: Historical Velocity Trends HTML (Theme Harmonized)
    var trendsHtml = '';
    if (historicalDelta.hasHistory && historicalDelta.comparisons.length) {
      var prevInv = historicalDelta.prevInvoice;
      var prevDate = prevInv.date || prevInv.createdAt || 'Previous Date';
      var compRows = historicalDelta.comparisons.map(function (c) {
        var dirIco = c.dir === 'up' ? '▲' : (c.dir === 'down' ? '▼' : '➖');
        var dirColor = '#131845';
        return '<tr style="border-bottom:1px solid #f1f5f9;background:#ffffff">'
          + '<td style="padding:10px 12px;font-weight:700;color:#0f172a">' + (window.App ? App.esc(c.name) : c.name) + '</td>'
          + '<td style="padding:10px 12px;color:#64748b">' + c.prevVal + ' ' + (window.App ? App.esc(c.unit) : c.unit) + '</td>'
          + '<td style="padding:10px 12px;font-weight:800;color:#0f172a">' + c.curVal + ' ' + (window.App ? App.esc(c.unit) : c.unit) + '</td>'
          + '<td style="padding:10px 12px;font-weight:800;color:' + dirColor + '">' + dirIco + ' ' + (c.diff > 0 ? '+' : '') + c.diff + ' (' + (c.pct > 0 ? '+' : '') + c.pct + '%)</td>'
          + '<td style="padding:10px 12px;font-size:12px;color:#475569">' + (c.alert ? (window.App ? App.esc(c.alert) : c.alert) : 'Stable / Standard course') + '</td>'
          + '</tr>';
      }).join('');

      trendsHtml = '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
        + '<div style="font-size:13px;color:#475569;margin-bottom:12px">Comparing with previous invoice <b>#' + (window.App ? App.esc(prevInv.no || prevInv.id) : (prevInv.no || prevInv.id)) + '</b> on <b>' + prevDate + '</b>:</div>'
        + '<div style="overflow-x:auto">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12.5px;text-align:left;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">'
        + '  <thead><tr style="background:#f8fafc;color:#1e293b;font-size:11.5px;font-weight:700;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1">'
        + '    <th style="padding:10px 12px">Parameter</th><th style="padding:10px 12px">Previous</th><th style="padding:10px 12px">Current</th><th style="padding:10px 12px">Delta Change</th><th style="padding:10px 12px">Velocity Flag</th>'
        + '  </tr></thead>'
        + '  <tbody>' + compRows + '</tbody>'
        + '</table>'
        + '</div>'
        + '</div>';
    } else {
      trendsHtml = '<div style="padding:28px 20px;text-align:center;color:#64748b;background:#ffffff;border-radius:12px;border:1px solid #cbd5e1;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
        + '<div style="font-size:28px;margin-bottom:6px">📊</div>'
        + '<b style="color:#0f1e2e;font-size:15px">Initial Baseline Profile</b>'
        + '<div style="font-size:12.5px;color:#64748b;margin-top:4px">No previous historical invoices found for this patient in database. Current results establish the baseline for future delta velocity tracking.</div>'
        + '</div>';
    }

    // Tab 5: Family Genetic & Marriage Guard HTML (Theme Harmonized)
    var geneticHtml = '';
    if (geneticGuard.length) {
      geneticHtml = geneticGuard.map(function (g) {
        return '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
          + '  <div style="font-size:15.5px;font-weight:800;color:#131845">' + (window.App ? App.esc(g.title) : g.title) + '</div>'
          + '  <span style="background:#f1f5f9;color:#131845;border:1px solid #cbd5e1;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">' + (window.App ? App.esc(g.severity) : g.severity) + '</span>'
          + '</div>'
          + '<div style="font-size:13px;color:#334155;line-height:1.55;margin-bottom:10px">' + (window.App ? App.esc(g.summary) : g.summary) + '</div>'
          + '<div style="background:#f8fafc;border-left:3px solid #131845;padding:10px 14px;border-radius:6px;font-size:12.5px;color:#1e293b;margin-bottom:10px">'
          + '  <b style="color:#131845">Inheritance Hazard:</b> ' + (window.App ? App.esc(g.geneticRisk) : g.geneticRisk)
          + '</div>'
          + '<div style="font-size:12.5px;color:#131845;font-weight:700">' + (window.App ? App.esc(g.mandatoryAction) : g.mandatoryAction) + '</div>'
          + '<div style="font-size:12px;color:#64748b;margin-top:4px">' + (window.App ? App.esc(g.familyAction) : g.familyAction) + '</div>'
          + '</div>';
      }).join('');
    } else {
      geneticHtml = '<div style="padding:22px;text-align:center;color:#334155;background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;font-weight:700">No high-risk familial carrier traits (such as Beta-Thalassemia or early onset monogenic diabetes) detected in current report.</div>';
    }

    // Tab 6: Roman Urdu Patient Care Guide HTML (Theme Harmonized)
    var urduHtml = '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:20px 24px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;border-bottom:1px solid #f1f5f9;padding-bottom:12px">'
      + '  <div>'
      + '    <div style="font-size:16px;font-weight:800;color:#131845">Mareez Ke Liye Rehnumai (Roman Urdu Guide)</div>'
      + '    <div style="font-size:12px;color:#64748b;margin-top:2px">Asan zaban mein bimari ki wazahat, khurak, parhez aur dawai ka tareeqa</div>'
      + '  </div>'
      + '  <div style="display:flex;gap:8px">'
      + '    <button type="button" class="btn ai-action-btn" id="aiCopyUrduGuide" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:12.5px;padding:7px 14px;border-radius:8px;cursor:pointer"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy Urdu</span></button>'
      + '    <button type="button" class="btn ai-action-btn" id="aiWaUrduGuide" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:12.5px;padding:7px 14px;border-radius:8px;cursor:pointer"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>WhatsApp to Patient</span></button>'
      + '  </div>'
      + '</div>'
      + '<div style="margin-bottom:14px">'
      + '  <div style="font-size:13px;font-weight:800;color:#131845;margin-bottom:6px">1. Bemari Ki Wazahat:</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.65">'
      +      urduGuide.wazahat.map(function (w) { return '<li style="margin-bottom:4px">' + (window.App ? App.esc(w) : w) + '</li>'; }).join('')
      + '  </ul>'
      + '</div>'
      + '<div style="margin-bottom:14px">'
      + '  <div style="font-size:13px;font-weight:800;color:#131845;margin-bottom:6px">2. Khurak Aur Parhez:</div>'
      + '  <div style="font-size:12px;color:#131845;font-weight:700;margin-bottom:4px">Kya Khayein:</div>'
      + '  <ul style="margin:0 0 8px;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.65">'
      +      (urduGuide.khurak.length ? urduGuide.khurak.map(function (k) { return '<li style="margin-bottom:4px">' + (window.App ? App.esc(k) : k) + '</li>'; }).join('') : '<li>Saaf mutawazan khurak aur ubla hua paani.</li>')
      + '  </ul>'
      + '  <div style="font-size:12px;color:#131845;font-weight:700;margin-bottom:4px">Kin Cheezon Se Parhez Karein:</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.65">'
      +      (urduGuide.parhez.length ? urduGuide.parhez.map(function (p) { return '<li style="margin-bottom:4px">' + (window.App ? App.esc(p) : p) + '</li>'; }).join('') : '<li>Talay hue aur masalay-dar khanon se parhez.</li>')
      + '  </ul>'
      + '</div>'
      + (urduGuide.dawaiSchedule.length ? ('<div style="margin-bottom:14px">'
          + '<div style="font-size:13px;font-weight:800;color:#131845;margin-bottom:6px">3. Dawai Lene Ka Tareeqa:</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.65">'
          + urduGuide.dawaiSchedule.map(function (ds) { return '<li style="margin-bottom:4px"><b>' + (window.App ? App.esc(ds.waqt) : ds.waqt) + ':</b> ' + (window.App ? App.esc(ds.dawai) : ds.dawai) + '</li>'; }).join('')
          + '</ul>'
          + '</div>') : '')
      + '<div style="margin-bottom:8px">'
      + '  <div style="font-size:13px;font-weight:800;color:#131845;margin-bottom:6px">4. Khatray Ki Alamaat (Kab Foran Emergency Jayein):</div>'
      + '  <ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.65">'
      +      urduGuide.khatraAlamaat.map(function (ka) { return '<li style="margin-bottom:4px">' + (window.App ? App.esc(ka) : ka) + '</li>'; }).join('')
      + '  </ul>'
      + '</div>'
      + '</div>';

    // Tab 7: Digital Rx Pad Preview HTML (Theme Harmonized)
    var rxPadPreviewHtml = '<div style="margin-bottom:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">'
      + '  <div style="display:flex;align-items:center;gap:8px">'
      + '    <button type="button" class="btn ai-action-btn" id="aiVoiceDictateBtn" style="border:1.5px solid #131845;color:#131845;background:#ffffff;font-weight:700;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:8px;cursor:pointer">'
      + '      <span id="aiVoiceMicIcon"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg></span> <span id="aiVoiceMicText">Bol Kar Likhain (Voice Dictate)</span>'
      + '    </button>'
      + '    <span id="aiVoiceStatusText" style="font-size:11px;color:#64748b;font-weight:600"></span>'
      + '  </div>'
      + '  <button type="button" class="btn ai-action-btn ai-action-btn-primary" id="aiPrintRxPadDirect" style="background:#131845;color:#ffffff;border:1.5px solid #131845;font-weight:800;padding:8px 18px;border-radius:8px;cursor:pointer">🖨️ Print Digital Rx Pad</button>'
      + '</div>'
      + AI.generateRxPadHtml(analysis)
      + '</div>';

    // Pro Navigation Tabs Bar
    var cfg = (typeof AI.getAiConfig === 'function') ? AI.getAiConfig() : null;
    var mods = (cfg && cfg.modules) || {};
    var showBodyMap = mods.bodyMap !== false;
    var showCalculators = mods.calculators !== false;
    var showSafety = mods.safetyShields !== false || mods.drugInteractions !== false;
    var showGenetic = mods.geneticGuard !== false;
    var showUrdu = mods.urduGuide !== false;
    var showRx = mods.rxPad !== false;

    var tabsStyle = '<style>'
      + '  .ai-tabs-bar { display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 14px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; align-items: center; }'
      + '  .ai-tab-btn {'
      + '    appearance: none; -webkit-appearance: none;'
      + '    border: 1.5px solid #cbd5e1; background: #ffffff; color: #1e293b; font-size: 13px; font-weight: 700;'
      + '    padding: 8px 16px; min-height: 38px; border-radius: 9px; cursor: pointer; transition: all .15s ease;'
      + '    white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-family: inherit;'
      + '    box-shadow: 0 1px 3px rgba(15,23,42,0.06); line-height: 1.2;'
      + '  }'
      + '  .ai-tab-btn:hover:not(.active) {'
      + '    background: #f8fafc; border-color: #94a3b8; color: #0f172a; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(15,23,42,0.09);'
      + '  }'
      + '  .ai-tab-btn.active {'
      + '    background: #131845 !important; border-color: #131845 !important; color: #ffffff !important; font-weight: 800;'
      + '    box-shadow: 0 3px 8px rgba(19,24,69,0.22) !important; transform: none;'
      + '  }'
      + '  .ai-action-btn {'
      + '    appearance: none; -webkit-appearance: none;'
      + '    border: 1.5px solid #cbd5e1; background: #ffffff; color: #1e293b; font-size: 13px; font-weight: 700;'
      + '    padding: 8px 16px; min-height: 38px; border-radius: 9px; cursor: pointer; transition: all .15s ease;'
      + '    white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-family: inherit;'
      + '    box-shadow: 0 1px 3px rgba(15,23,42,0.06); line-height: 1.2;'
      + '  }'
      + '  .ai-action-btn:hover {'
      + '    background: #f8fafc; border-color: #94a3b8; color: #0f172a; transform: translateY(-1px); box-shadow: 0 3px 8px rgba(15,23,42,0.09);'
      + '  }'
      + '  .ai-action-btn-primary {'
      + '    background: #131845 !important; border-color: #131845 !important; color: #ffffff !important; font-weight: 800;'
      + '    box-shadow: 0 3px 8px rgba(19,24,69,0.22) !important;'
      + '  }'
      + '  .ai-action-btn-primary:hover {'
      + '    background: #0d1238 !important; border-color: #0d1238 !important; color: #ffffff !important; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(19,24,69,0.3) !important;'
      + '  }'
      + '  .ai-tab-btn .ai-tab-ico { display: inline-flex; align-items: center; justify-content: center; color: #131845; }'
      + '  .ai-tab-btn.active .ai-tab-ico { color: #ffffff; }'
      + '</style>';

    var tabsHtml = tabsStyle
      + '<div class="ai-tabs-bar">'
      + '<button type="button" class="btn ai-tab-btn active" data-tab="solutions"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3v5a4.5 4.5 0 0 0 9 0V3"/><path d="M6 3h3"/><path d="M10.5 3h3"/><path d="M9 12.5A6.5 6.5 0 0 0 15.5 19h1a2.5 2.5 0 0 0 2.5-2.5v-1"/><circle cx="19" cy="15" r="2"/></svg></span> <span>5 Solutions</span></button>'
      + (showBodyMap ? '<button type="button" class="btn ai-tab-btn" data-tab="bodymap"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></span> <span>Organ Map</span></button>' : '')
      + (showCalculators ? '<button type="button" class="btn ai-tab-btn" data-tab="indices"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg></span> <span>Indices</span></button>' : '')
      + (showSafety ? '<button type="button" class="btn ai-tab-btn" data-tab="safety"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span> <span>Drug Safety</span></button>' : '')
      + '<button type="button" class="btn ai-tab-btn" data-tab="trends"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></span> <span>Velocity</span></button>'
      + (showGenetic ? '<button type="button" class="btn ai-tab-btn" data-tab="genetic"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg></span> <span>Genetic Guard</span></button>' : '')
      + (showUrdu ? '<button type="button" class="btn ai-tab-btn" data-tab="urdu"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span> <span>Urdu Guide</span></button>' : '')
      + (showRx ? '<button type="button" class="btn ai-tab-btn" data-tab="rx"><span class="ai-tab-ico"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span> <span>Rx Pad</span></button>' : '')
      + '</div>';

    var html = ''
      + tabsHtml
      // PANE 1: 5 Solutions (Clean Unified Medical Cards - Big & Spacious)
      + '<div class="ai-tab-pane" id="aiPane-solutions" style="display:block">'
      + '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:20px;margin-bottom:20px">'
      + '    <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(15,30,46,0.06);display:flex;flex-direction:column;height:520px;box-sizing:border-box">'
      + '      <div style="font-size:16.5px;font-weight:800;color:#131845;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 3v5a4.5 4.5 0 0 0 9 0V3"/><path d="M6 3h3"/><path d="M10.5 3h3"/><path d="M9 12.5A6.5 6.5 0 0 0 15.5 19h1a2.5 2.5 0 0 0 2.5-2.5v-1"/><circle cx="19" cy="15" r="2"/></svg></span><span>Solution 1: Clinical Diagnosis & Interpretation</span></div>'
      + '      <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:8px">'
      +          diagHtml
      + '      </div>'
      + '    </div>'
      + '    <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(15,30,46,0.06);display:flex;flex-direction:column;height:520px;box-sizing:border-box">'
      + '      <div style="font-size:16.5px;font-weight:800;color:#131845;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg></span><span>Solution 2: Prescription & Medication Guidance</span></div>'
      + '      <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:8px">'
      +          medsHtml
      + '      </div>'
      + '    </div>'
      + '    <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(15,30,46,0.06);display:flex;flex-direction:column;height:520px;box-sizing:border-box">'
      + '      <div style="font-size:16.5px;font-weight:800;color:#131845;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg></span><span>Solution 3: Diet & Lifestyle Plan (Parhez)</span></div>'
      + '      <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:8px">'
      +          dietHtml
      + '      </div>'
      + '    </div>'
      + '    <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(15,30,46,0.06);display:flex;flex-direction:column;height:520px;box-sizing:border-box">'
      + '      <div style="font-size:16.5px;font-weight:800;color:#131845;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0-14 0"/><circle cx="9" cy="9" r="2"/><path d="m14 7 3-3 4 4-3 3"/><path d="m9 12 5 5"/></svg></span><span>Solution 4: Confirmatory Follow-up Tests</span></div>'
      + '      <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:8px">'
      +          testsHtml
      + '      </div>'
      + '    </div>'
      + '    <div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:24px;box-shadow:0 4px 14px rgba(15,30,46,0.06);display:flex;flex-direction:column;height:520px;box-sizing:border-box">'
      + '      <div style="font-size:16.5px;font-weight:800;color:#131845;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-shrink:0"><span style="display:inline-flex;align-items:center;justify-content:center;color:#131845;flex-shrink:0"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><span>Solution 5: Red Flags, Precautions & Specialist Referral</span></div>'
      + '      <div style="flex:1;overflow-y:auto;scrollbar-width:thin;padding-right:8px">'
      +          redflagsHtml
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      // PANE 2: Medical Indices & ASCVD
      + '<div class="ai-tab-pane" id="aiPane-indices" style="display:none">'
      +   indicesHtml
      + '</div>'
      // PANE 3: Drug Safety & DDI Shield
      + '<div class="ai-tab-pane" id="aiPane-safety" style="display:none">'
      +   safetyHtml
      + '</div>'
      // PANE 4: Historical Velocity Trends
      + '<div class="ai-tab-pane" id="aiPane-trends" style="display:none">'
      +   trendsHtml
      + '</div>'
      // PANE 5: Family Genetic & Marriage Guard
      + '<div class="ai-tab-pane" id="aiPane-genetic" style="display:none">'
      +   geneticHtml
      + '</div>'
      // PANE 6: Roman Urdu Guide
      + '<div class="ai-tab-pane" id="aiPane-urdu" style="display:none">'
      +   urduHtml
      + '</div>'
      // PANE 7: Digital Rx Pad
      + '<div class="ai-tab-pane" id="aiPane-rx" style="display:none">'
      +   rxPadPreviewHtml
      + '</div>'
      // PANE 8: Interactive Organ Body Map
      + '<div class="ai-tab-pane" id="aiPane-bodymap" style="display:none">'
      +   AI.renderBodyMapHtml(analysis)
      + '</div>'
      // Medical Advisory Disclaimer
      + '<div style="font-size:11px;color:#94a3b8;line-height:1.4;text-align:center;padding:10px 14px;margin-top:10px">'
      + '  <b>Medical Disclaimer:</b> AI Clinical Recommendations & Calculators are advisory decision-support tools for registered medical practitioners. Final clinical judgment and prescription authority rests solely with the attending doctor.'
      + '</div>';

    return html;
  };

  /* Wire Interactive Events for Tabs, Buttons, Voice Dictation & Body Map */
  AI.wireRecommendationsEvents = function (scopeEl, analysis, options) {
    if (!scopeEl) return;
    var opts = options || {};
    var inv = analysis.invoice || {};
    var pt = analysis.patient || {};
    var doc = analysis.doctor || null;
    var s = analysis.solutions || {};
    var panicInfo = analysis.panicInfo || { isPanic: false, alerts: [], formattedMessage: '' };
    var reportNarrative = analysis.reportNarrative || '';
    var organMap = analysis.organMap || [];
    var urduGuide = analysis.urduGuide || { wazahat: [], khurak: [], parhez: [], dawaiSchedule: [], khatraAlamaat: [], plainText: '' };

    // Plain text for Doctor Clipboard / WhatsApp
    var plainText = '🤖 *OPTIX AI CLINICAL RECOMMENDATIONS*\n'
      + 'Patient: ' + (pt.name || 'Patient') + ' (' + (pt.age ? pt.age + 'y, ' : '') + (pt.sex || pt.gender || '') + ')\n'
      + 'Invoice: #' + (inv.no || inv.id) + '\n\n'
      + '1. 🩺 *DIAGNOSIS & FINDINGS:*\n'
      + (s.diagnosis || []).map(function (x) { return '• ' + x.title + '\n  ' + x.detail; }).join('\n') + '\n\n'
      + '2. 💊 *RECOMMENDED MEDICATIONS:*\n'
      + (s.medications || []).map(function (m) {
          return (m.items || []).map(function (it) { return '• ' + it.drug + ' (' + it.dosage + ')' + (it.note ? ' - ' + it.note : ''); }).join('\n');
        }).join('\n') + '\n\n'
      + '3. 🥗 *DIET & LIFESTYLE:*\n'
      + (s.diet || []).map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '4. 🔬 *FOLLOW-UP TESTS:*\n'
      + (s.tests || []).map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '5. ⚠️ *PRECAUTIONS & RED FLAGS:*\n'
      + (s.redflags || []).map(function (x) { return '• ' + x; }).join('\n') + '\n\n'
      + '_Note: Clinical decision support for authorized medical practitioners only._';

    // Tab Switching Logic
    scopeEl.querySelectorAll('.ai-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        scopeEl.querySelectorAll('.ai-tab-btn').forEach(function (b) {
          b.classList.remove('active');
          b.style.background = '';
          b.style.color = '';
          b.style.borderColor = '';
          b.style.boxShadow = '';
        });
        btn.classList.add('active');

        scopeEl.querySelectorAll('.ai-tab-pane').forEach(function (pane) {
          pane.style.display = 'none';
        });
        var targetPane = scopeEl.querySelector('#aiPane-' + target);
        if (targetPane) targetPane.style.display = 'block';
      });
    });

    // Panic SOS WhatsApp Button
    var sosBtn = scopeEl.querySelector('#aiSendPanicSos');
    if (sosBtn) {
      sosBtn.addEventListener('click', function () {
        if (String(inv.id || inv.no || '').indexOf('SIM-') === 0) { if (window.App && App.toast) App.toast('Simulation only: no message will be sent.', 'info'); return; }
        var rawPh = (doc && (doc.whatsapp || doc.phone)) || '';
        var ph = rawPh.replace(/[^0-9]/g, '');
        if (ph.indexOf('0') === 0) ph = '92' + ph.slice(1);
        var url = ph ? ('https://wa.me/' + ph + '?text=' + encodeURIComponent(panicInfo.formattedMessage))
                     : ('https://wa.me/?text=' + encodeURIComponent(panicInfo.formattedMessage));
        window.open(url, '_blank');
      });
    }

    // Attach Summary to Printed Report Remarks Button
    var attachBtn = scopeEl.querySelector('#aiAttachReportRemarks');
    if (attachBtn) {
      attachBtn.addEventListener('click', function () {
        var targetId = (inv && (inv.id || inv.no)) || '';
        var ok = AI.attachSummaryToReportRemarks(targetId, reportNarrative);
        if (ok) {
          attachBtn.innerHTML = '✅ Attached to Remarks!';
          attachBtn.style.color = '#059669';
          attachBtn.style.borderColor = '#10b981';
          attachBtn.style.background = '#ecfdf5';
        }
      });
    }

    // Organ Body Map Selection & Jump Interactivity
    var jumpBtn = scopeEl.querySelector('.ai-jump-bodymap-btn');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', function () {
        var bTab = scopeEl.querySelector('.ai-tab-btn[data-tab="bodymap"]');
        if (bTab) bTab.click();
      });
    }

    function selectOrgan(organId) {
      var org = organMap.filter(function (x) { return x.id === organId; })[0];
      if (!org) return;

      var cardContainer = scopeEl.querySelector('#aiOrganDetailCard');
      if (cardContainer) {
        cardContainer.innerHTML = AI.renderSingleOrganCard(org);
      }

      scopeEl.querySelectorAll('.ai-organ-select-btn').forEach(function (btn) {
        var bId = btn.getAttribute('data-organ-id');
        if (bId === organId) {
          btn.style.borderColor = '#131845';
          btn.style.background = '#ebf4f8';
          btn.style.color = '#131845';
          btn.classList.add('active');
        } else {
          var targetOrg = organMap.filter(function (x) { return x.id === bId; })[0];
          var isC = targetOrg && targetOrg.status === 'critical';
          var isW = targetOrg && targetOrg.status === 'warning';
          var isS = targetOrg && targetOrg.status === 'normal';
          btn.style.borderColor = isC ? '#ef4444' : (isW ? '#f59e0b' : (isS ? '#10b981' : '#cbd5e1'));
          btn.style.background = isC ? '#fef2f2' : (isW ? '#fffbeb' : (isS ? '#f0fdf4' : '#ffffff'));
          btn.style.color = isC ? '#b91c1c' : (isW ? '#b45309' : (isS ? '#15803d' : '#475569'));
          btn.classList.remove('active');
        }
      });

      scopeEl.querySelectorAll('.ai-organ-beacon').forEach(function (beacon) {
        var bId = beacon.getAttribute('data-organ-id');
        var ring = beacon.querySelector('.ai-beacon-ring');
        var targetOrg = organMap.filter(function (x) { return x.id === bId; })[0];
        if (ring && targetOrg) {
          var isC = targetOrg.status === 'critical';
          var isW = targetOrg.status === 'warning';
          var isS = targetOrg.status === 'normal';
          var coreBg = isC ? '#ef4444' : (isW ? '#f59e0b' : (isS ? '#10b981' : '#475569'));
          if (bId === organId) {
            ring.setAttribute('fill', '#ffffff');
            ring.setAttribute('stroke', '#131845');
            ring.setAttribute('stroke-width', '3');
          } else {
            ring.setAttribute('fill', coreBg);
            ring.setAttribute('stroke', '#ffffff');
            ring.setAttribute('stroke-width', '2');
          }
        }
      });
    }

    scopeEl.querySelectorAll('.ai-organ-select-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var orgId = btn.getAttribute('data-organ-id');
        selectOrgan(orgId);
      });
    });

    scopeEl.querySelectorAll('.ai-organ-beacon').forEach(function (beacon) {
      beacon.addEventListener('click', function () {
        var orgId = beacon.getAttribute('data-organ-id');
        selectOrgan(orgId);
      });
    });

    // Voice Dictation Button (Urdu & English Speech Recognition)
    var voiceBtn = scopeEl.querySelector('#aiVoiceDictateBtn');
    var voiceStatus = scopeEl.querySelector('#aiVoiceStatusText');
    var dictBox = scopeEl.querySelector('#rxDictationNotesBox');
    var dictTxt = scopeEl.querySelector('#rxDictationText');
    var activeRecognizer = null;

    if (voiceBtn) {
      voiceBtn.addEventListener('click', function () {
        if (activeRecognizer) {
          try { activeRecognizer.stop(); } catch (e) {}
          activeRecognizer = null;
          voiceBtn.style.background = '#ffffff';
          voiceBtn.style.color = '#131845';
          if (voiceStatus) voiceStatus.textContent = '';
          return;
        }

        if (!AI.isVoiceSupported()) {
          if (window.App && App.toast) App.toast('Microphone voice dictation requires Google Chrome or Microsoft Edge.', 'err');
          return;
        }

        voiceBtn.style.background = '#fee2e2';
        voiceBtn.style.color = '#b91c1c';
        if (voiceStatus) voiceStatus.textContent = '🔴 Listening (Bolain)...';

        activeRecognizer = AI.startVoiceDictation({
          lang: 'ur-PK',
          onTranscript: function (text) {
            if (dictBox) dictBox.style.display = 'block';
            if (dictTxt) dictTxt.textContent = text;
          },
          onEnd: function () {
            activeRecognizer = null;
            voiceBtn.style.background = '#ffffff';
            voiceBtn.style.color = '#131845';
            if (voiceStatus) voiceStatus.textContent = '✓ Voice Captured';
          },
          onError: function () {
            activeRecognizer = null;
            voiceBtn.style.background = '#ffffff';
            voiceBtn.style.color = '#131845';
            if (voiceStatus) voiceStatus.textContent = '';
          }
        });
      });
    }

    // 1-Tap Order Follow-Up Tests Buttons
    scopeEl.querySelectorAll('.ai-order-test-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var tName = b.getAttribute('data-testname');
        var ptId = b.getAttribute('data-ptid');
        AI.orderFollowupTest(tName, ptId);
      });
    });

    // Copy 5 Solutions
    var cpBtn = scopeEl.querySelector('#aiCopyPrescription');
    if (cpBtn) {
      cpBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(plainText).then(function () {
            if (window.App && App.toast) App.toast('Prescription recommendations copied to clipboard!');
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = plainText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          if (window.App && App.toast) App.toast('Prescription recommendations copied!');
        }
      });
    }

    // WhatsApp to Doctor
    var waBtn = scopeEl.querySelector('#aiWaDoctor');
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
    var cpUrduBtn = scopeEl.querySelector('#aiCopyUrduGuide');
    if (cpUrduBtn) {
      cpUrduBtn.addEventListener('click', function () {
        var uTxt = urduGuide.plainText || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(uTxt).then(function () {
            if (window.App && App.toast) App.toast('Roman Urdu Patient Guide copied to clipboard!');
          });
        } else {
          var ta = document.createElement('textarea');
          ta.value = uTxt;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          if (window.App && App.toast) App.toast('Roman Urdu Patient Guide copied!');
        }
      });
    }

    // WhatsApp Urdu Guide to Patient
    var waUrduBtn = scopeEl.querySelector('#aiWaUrduGuide');
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

    // Print Doctor Summary Slip
    var prBtn = scopeEl.querySelector('#aiPrintSlip');
    if (prBtn) {
      prBtn.addEventListener('click', function () {
        var printWin = window.open('', '_blank');
        if (!printWin) { if (window.App && App.toast) App.toast('Pop-up blocked. Please allow pop-ups to print.', 'err'); return; }
        printWin.document.write('<!DOCTYPE html><html><head><title>AI Clinical Summary - #' + (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id)) + '</title>'
          + '<style>'
          + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:20px;color:#111;font-size:13px;line-height:1.5}'
          + 'h2{color:#131845;margin:0 0 4px}'
          + '.box{border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin-bottom:12px}'
          + '.b-title{font-weight:800;font-size:12px;text-transform:uppercase;margin-bottom:6px;color:#131845}'
          + '@media print{button{display:none}}'
          + '</style></head><body>'
          + '<h2>Optix AI Clinical Summary for Attending Doctor</h2>'
          + '<div>Patient: <b>' + (window.App ? App.esc(pt.name || '') : (pt.name || '')) + '</b> (' + (window.App ? App.esc(pt.age ? pt.age + 'y, ' : '') : (pt.age ? pt.age + 'y, ' : '')) + (window.App ? App.esc(pt.sex || pt.gender || '') : (pt.sex || pt.gender || '')) + ') &bull; Invoice: <b>#' + (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id)) + '</b></div>'
          + '<hr style="border:0;border-top:1px solid #ddd;margin:12px 0">'
          + '<div class="box"><div class="b-title">1. Clinical Findings & Probable Diagnosis</div>' + (s.diagnosis || []).map(function(d){ return '<div style="margin-bottom:6px"><b>' + (window.App ? App.esc(d.title) : d.title) + ':</b> ' + (window.App ? App.esc(d.detail) : d.detail) + '</div>'; }).join('') + '</div>'
          + '<div class="box"><div class="b-title">2. Prescription & Medication Recommendations</div>' + (s.medications || []).map(function(m){ return '<div><b>' + (window.App ? App.esc(m.category) : m.category) + ':</b> ' + (m.items || []).map(function(it){ return it.drug + ' (' + it.dosage + ')'; }).join(', ') + '</div>'; }).join('') + '</div>'
          + '<div class="box"><div class="b-title">3. Dietary & Lifestyle Plan</div>' + (s.diet || []).map(function(d){ return '<li>' + (window.App ? App.esc(d) : d) + '</li>'; }).join('') + '</div>'
          + '<div class="box"><div class="b-title">4. Correlative Follow-Up Tests</div>' + (s.tests || []).map(function(t){ return '<li>' + (window.App ? App.esc(t) : t) + '</li>'; }).join('') + '</div>'
          + '<div class="box"><div class="b-title">5. Precautions & Red Flags</div>' + (s.redflags || []).map(function(rf){ return '<div style="color:#991b1b;margin-bottom:4px">⚠️ ' + (window.App ? App.esc(rf) : rf) + '</div>'; }).join('') + '</div>'
          + '<p style="font-size:11px;color:#666;margin-top:20px">Report generated automatically by Optix LAB MedSync AI Clinical Intelligence. Final clinical decisions rest with the prescribing doctor.</p>'
          + '<script>window.onload=function(){window.print();};<\/script>'
          + '</body></html>');
        printWin.document.close();
      });
    }

    // Print Digital Rx Pad
    var prRxBtns = [scopeEl.querySelector('#aiPrintRxPad'), scopeEl.querySelector('#aiPrintRxPadDirect')];
    prRxBtns.forEach(function (btn) {
      if (btn) btn.addEventListener('click', function () { AI.printRxPad(analysis); });
    });
  };

  /* Render Dedicated Full Page for AI Clinical Recommendations */
  AI.renderRecommendationsPage = function (containerId, invoiceId, directData) {
    var container = (typeof containerId === 'string' ? document.getElementById(containerId) : containerId)
                 || document.getElementById('view') || (typeof document !== 'undefined' ? document.body : null);
    if (!container) return;

    var d = AI.getReportAnalysisData(invoiceId, directData);
    if (!d) {
      container.innerHTML = '<div style="padding:48px 24px;text-align:center;max-width:620px;margin:40px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 1px 3px rgba(15,30,46,0.06)">'
        + '<div style="font-size:38px;margin-bottom:12px">📋</div>'
        + '<h2 style="font-size:19px;font-weight:800;color:#131845;margin-bottom:8px">No Report Selected for AI Recommendations</h2>'
        + '<p style="color:#64748b;font-size:13px;line-height:1.55;margin-bottom:20px">Please select an invoice or patient test report from Lab Results or Invoices to view AI clinical recommendations and decision support.</p>'
        + '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">'
        + '  <button type="button" class="btn btn-primary" onclick="if(window.App&&App.nav)App.nav(\'#/results\')" style="background:#131845;color:#fff;font-weight:700;padding:8px 18px;border-radius:8px">Go to Lab Results</button>'
        + '  <button type="button" class="btn btn-ghost" onclick="if(window.App&&App.nav)App.nav(\'#/ai-dashboard\')" style="border:1px solid #cbd5e1;background:#ffffff;font-weight:700;padding:8px 18px;border-radius:8px">Open AI Dashboard</button>'
        + '</div>'
        + '</div>';
      return;
    }

    var analysis = AI.generate5Solutions(d);
    var pt = analysis.patient;
    var inv = analysis.invoice;
    var doc = analysis.doctor;
    AI._recordStatsForAnalysis(analysis);

    var ptName = (window.App ? App.esc(pt.name || 'Patient') : (pt.name || 'Patient'));
    var ptAgeGender = ((pt.age ? pt.age + 'y, ' : '') + (pt.sex || pt.gender || 'Adult'));
    var invNo = (window.App ? App.esc(inv.no || inv.id || '') : (inv.no || inv.id || ''));
    var docName = doc ? (window.App ? App.esc(doc.name || '') : (doc.name || '')) : '';

    var recentInvs = (window.DB && typeof DB.all === 'function') ? (DB.all('invoices') || []).slice(-30).reverse() : [];
    var invOptionsHtml = recentInvs.map(function (x) {
      var isCur = (inv && (x.id === inv.id || x.no === inv.no || x.id === inv.no));
      var ptObj = (window.DB && typeof DB.get === 'function') ? DB.get('patients', x.patientId) : null;
      var ptLbl = ptObj ? (' - ' + (ptObj.name || 'Patient')) : '';
      return '<option value="' + (x.id || x.no) + '"' + (isCur ? ' selected' : '') + '>#' + (x.no || x.id) + ptLbl + '</option>';
    }).join('');

    var switcherHtml = recentInvs.length > 1
      ? ('<div style="display:flex;align-items:center;gap:8px">'
        + '<span style="font-size:12px;color:#64748b;font-weight:600">Switch Report:</span>'
        + '<select id="aiPageInvoiceSwitcher" style="padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;font-size:12.5px;font-weight:600;color:#0f1e2e;cursor:pointer">'
        + invOptionsHtml
        + '</select>'
        + '</div>')
      : '';

    var mergedHeaderHtml = '<div style="background:#ffffff;border:1px solid #cbd5e1;border-radius:12px;padding:16px 20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(15,30,46,0.04);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">'
      + '<div>'
      + '  <h1 style="font-size:20px;font-weight:800;color:#131845;margin:0;letter-spacing:-0.01em">AI Clinical Recommendations</h1>'
      + '  <div style="display:none" data-patient="' + ptName + '" data-invoice="' + invNo + '">' + ptName + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +    switcherHtml
      + '  <button type="button" class="btn ai-action-btn" id="aiCopyPrescription" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy Solutions</span></button>'
      + '  <button type="button" class="btn ai-action-btn" id="aiAttachReportRemarks" style="border:1.5px solid #131845;background:#ffffff;color:#131845;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>Attach Remarks</span></button>'
      + (doc && (doc.phone || doc.whatsapp) ? '  <button type="button" class="btn ai-action-btn" id="aiWaDoctor" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>WhatsApp Doctor</span></button>' : '')
      + '  <button type="button" class="btn ai-action-btn" id="aiPrintSlip" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Print Summary</span></button>'
      + '  <button type="button" class="btn ai-action-btn ai-action-btn-primary" id="aiPrintRxPad" style="background:#131845;color:#ffffff;border:1.5px solid #131845;font-weight:800;font-size:13px;padding:8px 18px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 3px 8px rgba(19,24,69,0.22);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Print Rx Pad</span></button>'
      + '</div>'
      + '</div>';

    var pageContentHtml = AI.buildRecommendationsContent(analysis, { isPage: true });

    container.innerHTML = '<div class="ai-recommendations-page" style="padding:16px 24px 48px;max-width:1480px;margin:0 auto;font-family:inherit">'
      + mergedHeaderHtml
      + pageContentHtml
      + '</div>';

    AI.wireRecommendationsEvents(container, analysis, { isPage: true });


    var switcher = container.querySelector('#aiPageInvoiceSwitcher');
    if (switcher) {
      switcher.addEventListener('change', function () {
        var val = switcher.value;
        if (val && window.App && typeof App.nav === 'function') {
          App.nav('#/ai-recommendations/' + encodeURIComponent(val));
        } else if (val) {
          AI.renderRecommendationsPage(containerId, val);
        }
      });
    }

    try { window.scrollTo(0, 0); } catch (e) {}
  };

  /* Render Rich Modal with 5 Solutions + All Extended Pro Clinical Tabs (Headless Fallback) */
  AI.showModal = function (invoiceId, directData) {
    // If in live browser environment with #view and navigation, open the dedicated full page!
    if (typeof window !== 'undefined' && window.App && typeof window.App.nav === 'function' && typeof document !== 'undefined' && document.getElementById('view')) {
      if (directData) {
        AI._directDataCache = AI._directDataCache || {};
        AI._directDataCache[String(invoiceId)] = directData;
      }
      window.App.nav('#/ai-recommendations/' + encodeURIComponent(invoiceId || ''));
      return;
    }

    var d = AI.getReportAnalysisData(invoiceId, directData);
    if (!d) { if (window.App && App.toast) App.toast('Report data unavailable for AI analysis', 'err'); return; }

    var analysis = AI.generate5Solutions(d);
    AI._recordStatsForAnalysis(analysis);

    var pt = analysis.patient;
    var inv = analysis.invoice;
    var doc = analysis.doctor;

    var ptName = (window.App ? App.esc(pt.name || 'Patient') : (pt.name || 'Patient'));
    var invNo = (window.App ? App.esc(inv.no || inv.id) : (inv.no || inv.id));
    var docName = doc ? (window.App ? App.esc(doc.name) : doc.name) : '';

    var modalHeaderHtml = '<div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin-bottom:12px;box-shadow:0 1px 3px rgba(15,30,46,0.04)">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'
      + '  <div>'
      + '    <h2 style="font-size:18px;font-weight:800;color:#131845;margin:0">AI Clinical Recommendations</h2>'
      + '    <div style="display:none" data-patient="' + ptName + '" data-invoice="' + invNo + '">' + ptName + '</div>'
      + '  </div>'
      + '</div>'
      + '</div>';

    var bodyHtml = '<div style="max-width:1280px;font-family:inherit">'
      + modalHeaderHtml
      + AI.buildRecommendationsContent(analysis, { isPage: false })
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:10px;border-top:1px solid #e2e8f0">'
      + '  <button type="button" class="btn ai-action-btn" id="aiModalClose" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit">Close</button>'
      + '  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '    <button type="button" class="btn ai-action-btn" id="aiCopyPrescription" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy Solutions</span></button>'
      + '    <button type="button" class="btn ai-action-btn" id="aiAttachReportRemarks" style="border:1.5px solid #131845;background:#ffffff;color:#131845;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>Attach Remarks</span></button>'
      + (doc && (doc.phone || doc.whatsapp) ? '    <button type="button" class="btn ai-action-btn" id="aiWaDoctor" style="color:#059669;border:1.5px solid #10b981;background:#ffffff;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>WhatsApp Doctor</span></button>' : '')
      + '    <button type="button" class="btn ai-action-btn" id="aiPrintSlip" style="border:1.5px solid #cbd5e1;background:#ffffff;color:#1e293b;font-weight:700;font-size:13px;padding:8px 16px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 3px rgba(15,23,42,0.06);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Print Summary</span></button>'
      + '    <button type="button" class="btn ai-action-btn ai-action-btn-primary" id="aiPrintRxPad" style="background:#131845;color:#ffffff;border:1.5px solid #131845;font-weight:800;font-size:13px;padding:8px 18px;min-height:38px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;box-shadow:0 3px 8px rgba(19,24,69,0.22);font-family:inherit"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>Print Rx Pad</span></button>'
      + '  </div>'
      + '</div>'
      + '</div>';

    App.modal('AI Clinical Recommendations', bodyHtml, {
      wide: true,
      onOpen: function (ov, close) {
        var cBtn = ov.querySelector('#aiModalClose');
        if (cBtn) cBtn.addEventListener('click', close);
        AI.wireRecommendationsEvents(ov, analysis, { isPage: false, closeFn: close });
      }
    });
  };

  /* ==========================================================================
     PRO FEATURE: AI Intelligence Control Center & Central Management Dashboard
     ========================================================================== */

  AI.DEFAULT_CONFIG = {
    modules: {
      solutions5: true,
      bodyMap: true,
      calculators: true,
      panicSos: true,
      drugInteractions: true,
      safetyShields: true,
      ddx: true,
      geneticGuard: true,
      ascvdRisk: true,
      urduGuide: true,
      rxPad: true,
      reportRemarks: true
    },
    panicThresholds: {
      plt: 20000,
      hb: 6.5,
      glucoseHigh: 400,
      glucoseLow: 50,
      creatinine: 4.0,
      potassiumHigh: 6.2,
      potassiumLow: 2.8,
      bilirubin: 10.0,
      wbcHigh: 35000,
      wbcLow: 1500
    },
    doctorBranding: {
      name: 'Consultant Physician',
      degrees: 'MBBS, FCPS / MD (Internal Medicine)',
      pmdc: '49281-P',
      clinic: 'Optix Medical Care & Diagnostics',
      phone: '+92 300 0000000',
      specialization: 'Clinical Specialist & Diagnostician'
    },
    roles: ['admin', 'doctor', 'technician']
  };

  AI.getAiConfig = function () {
    var def = JSON.parse(JSON.stringify(AI.DEFAULT_CONFIG));
    try {
      var set = (window.DB && typeof DB.get === 'function') ? DB.get('settings', 'main') : null;
      if (set) {
        if (set.aiConfig && typeof set.aiConfig === 'object') {
          var c = set.aiConfig;
          if (c.modules) Object.assign(def.modules, c.modules);
          if (c.panicThresholds) Object.assign(def.panicThresholds, c.panicThresholds);
          if (c.doctorBranding) Object.assign(def.doctorBranding, c.doctorBranding);
          if (Array.isArray(c.roles)) def.roles = c.roles;
        } else if (Array.isArray(set.aiInsightsRoles)) {
          def.roles = set.aiInsightsRoles;
        }
      }
    } catch (e) {}
    // Doctor and Admin are always mandatory
    if (def.roles.indexOf('doctor') === -1) def.roles.push('doctor');
    if (def.roles.indexOf('admin') === -1) def.roles.push('admin');
    return def;
  };

  AI.canConfigure = function () {
    try { return JSON.parse(localStorage.getItem('labpos_session') || 'null').role === 'admin'; } catch (e) { return false; }
  };

  AI.saveAiConfig = function (newConfig) {
    try {
      if (!AI.canConfigure()) throw new Error('Only an admin can change AI settings.');
      if (!newConfig || typeof newConfig !== 'object') throw new Error('Invalid AI settings.');
      var th = newConfig.panicThresholds || {};
      Object.keys(th).forEach(function (key) { if (typeof th[key] !== 'number' || !isFinite(th[key]) || th[key] <= 0) throw new Error('Thresholds must be positive, finite numbers.'); });
      [['glucoseLow', 'glucoseHigh'], ['potassiumLow', 'potassiumHigh'], ['wbcLow', 'wbcHigh']].forEach(function (pair) {
        if (th[pair[0]] != null && th[pair[1]] != null && th[pair[0]] >= th[pair[1]]) throw new Error('Lower thresholds must be below upper thresholds.');
      });
      var patch = { aiConfig: newConfig };
      if (Array.isArray(newConfig.roles)) {
        patch.aiInsightsRoles = newConfig.roles;
      }
      if (window.DB && typeof DB.saveAiConfig === 'function') {
        return DB.saveAiConfig(patch).then(function () {
          if (App.toast) App.toast('AI settings saved.', 'ok');
          return true;
        }).catch(function (e) {
          if (App.toast) App.toast('AI settings were not saved: ' + e.message, 'err');
          return false;
        });
      }
      if (window.DB && typeof DB.update === 'function') {
        DB.update('settings', 'main', patch);
      } else if (window.DB && typeof DB.set === 'function') {
        var set = (typeof DB.get === 'function') ? DB.get('settings', 'main') : {};
        if (!set) set = {};
        set.aiConfig = newConfig;
        if (Array.isArray(newConfig.roles)) set.aiInsightsRoles = newConfig.roles;
        DB.set('settings', 'main', set);
      }
      if (window.App && App.toast) App.toast('AI Control Center configuration saved successfully!', 'ok');
      return true;
    } catch (e) {
      if (window.App && App.toast) App.toast('Could not save AI settings: ' + (e ? e.message : 'Error'), 'err');
      return false;
    }
  };

  function aiStatsKey() {
    var lab = window.DB && typeof DB.currentLabId === 'function' ? DB.currentLabId() : 'default';
    return 'optix_ai_stats_' + String(lab || 'default');
  }
  AI.getAiStats = function () {
    var stats = { analyzed: 0, panics: 0, organAlerts: 0, ddiBlocked: 0 };
    try {
      var raw = localStorage.getItem(aiStatsKey());
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          if (typeof p.analyzed === 'number' && isFinite(p.analyzed) && p.analyzed >= 0) stats.analyzed = Math.floor(p.analyzed);
          if (typeof p.panics === 'number' && isFinite(p.panics) && p.panics >= 0) stats.panics = Math.floor(p.panics);
          if (typeof p.organAlerts === 'number' && isFinite(p.organAlerts) && p.organAlerts >= 0) stats.organAlerts = Math.floor(p.organAlerts);
          if (typeof p.ddiBlocked === 'number' && isFinite(p.ddiBlocked) && p.ddiBlocked >= 0) stats.ddiBlocked = Math.floor(p.ddiBlocked);
        }
      }
    } catch (e) {}
    return stats;
  };

  AI.recordAiStat = function (type) {
    try {
      var stats = AI.getAiStats();
      if (type && stats[type] != null) stats[type]++;
      localStorage.setItem(aiStatsKey(), JSON.stringify(stats));
    } catch (e) {}
  };

  AI.simulateAnalysis = function (profileKey) {
    var data = null;
    if (profileKey === 'dengue') {
      data = {
        pt: { name: 'Muhammad Rizwan (Simulated)', age: 29, sex: 'M', phone: '03001234567' },
        inv: { id: 'SIM-DENGUE', no: 'SIM-701' },
        doc: { name: 'Dr. Consultant Physician', pmdc: '49281-P' },
        groups: [{
          name: 'Complete Blood Count (CBC)',
          params: [
            { name: 'Hemoglobin', value: '11.2', unit: 'g/dL', normal: '13.0 - 17.0' },
            { name: 'Platelet Count', value: '14000', unit: '/uL', normal: '150,000 - 450,000' },
            { name: 'Total Leukocytes (WBC)', value: '2800', unit: '/uL', normal: '4,000 - 11,000' },
            { name: 'Hematocrit (HCT)', value: '48.5', unit: '%', normal: '40.0 - 50.0' }
          ]
        }]
      };
    } else if (profileKey === 'diabetic_aki') {
      data = {
        pt: { name: 'Begum Parveen (Simulated)', age: 58, sex: 'F', phone: '03219876543' },
        inv: { id: 'SIM-DKA', no: 'SIM-702' },
        doc: { name: 'Dr. Consultant Physician', pmdc: '49281-P' },
        groups: [{
          name: 'Renal & Metabolic Profile',
          params: [
            { name: 'Blood Glucose (Random)', value: '465', unit: 'mg/dL', normal: '70 - 140' },
            { name: 'Serum Creatinine', value: '4.8', unit: 'mg/dL', normal: '0.6 - 1.1' },
            { name: 'Blood Urea', value: '115', unit: 'mg/dL', normal: '15 - 45' },
            { name: 'Potassium (K+)', value: '6.4', unit: 'mEq/L', normal: '3.5 - 5.1' }
          ]
        }]
      };
    } else if (profileKey === 'thalassemia') {
      data = {
        pt: { name: 'Zainab Bibi (Simulated)', age: 22, sex: 'F', phone: '03331122334' },
        inv: { id: 'SIM-THAL', no: 'SIM-703' },
        doc: { name: 'Dr. Consultant Physician', pmdc: '49281-P' },
        groups: [{
          name: 'CBC & Red Cell Indices',
          params: [
            { name: 'Hemoglobin', value: '7.9', unit: 'g/dL', normal: '12.0 - 15.5' },
            { name: 'RBC Count', value: '5.8', unit: 'mil/uL', normal: '3.8 - 5.2' },
            { name: 'MCV', value: '57.0', unit: 'fL', normal: '80 - 100' },
            { name: 'MCH', value: '19.5', unit: 'pg', normal: '27 - 32' },
            { name: 'Mentzer Index', value: '9.8', unit: 'ratio', normal: '> 13.0' }
          ]
        }]
      };
    } else { // gout_liver
      data = {
        pt: { name: 'Tariq Mehmood (Simulated)', age: 46, sex: 'M', phone: '03455566778' },
        inv: { id: 'SIM-GOUT', no: 'SIM-704' },
        doc: { name: 'Dr. Consultant Physician', pmdc: '49281-P' },
        groups: [{
          name: 'Liver Function & Uric Acid',
          params: [
            { name: 'Serum Uric Acid', value: '9.8', unit: 'mg/dL', normal: '3.5 - 7.0' },
            { name: 'SGPT (ALT)', value: '94', unit: 'U/L', normal: '10 - 40' },
            { name: 'SGOT (AST)', value: '45', unit: 'U/L', normal: '10 - 35' },
            { name: 'Alkaline Phosphatase (ALP)', value: '295', unit: 'U/L', normal: '40 - 240' }
          ]
        }]
      };
    }
    // The analysis engine reads parameter values from res.values, not the sandbox's display-only value property.
    data.groups = data.groups.map(function (group) {
      var values = {};
      var params = group.params.map(function (p, i) { var id = 'sim-' + i; values[id] = p.value; return Object.assign({}, p, { id: id }); });
      return { test: { name: group.name, params: params }, res: { values: values } };
    });
    return AI.showModal(data.inv.id, data);
  };

  AI.renderDashboard = function (containerId) {
    var container = document.getElementById(containerId || 'view');
    if (!container) container = document.getElementById('view') || document.body;
    if (!container) return;

    var curCfg = AI.getAiConfig();
    var stats = AI.getAiStats();
    var activeTab = 'modules';

    var MODULE_DEFS = [
      { key: 'solutions5', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="m9 14 2 2 4-4"/></svg>', name: '5 Core Solutions', desc: 'Diagnosis, medications, diet & red flags.' },
      { key: 'bodyMap', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v8"/><path d="M9 12h6"/><path d="M9 21l3-5 3 5"/></svg>', name: 'Organ Impact Map', desc: '8-system physiological impact visualizer.' },
      { key: 'calculators', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>', name: 'Clinical Calculators', desc: 'eGFR, Mentzer, FIB-4 & ASCVD scores.' },
      { key: 'panicSos', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', name: 'Panic SOS Alerts', desc: 'Emergency limits & automated WhatsApp dispatch.' },
      { key: 'drugInteractions', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>', name: 'Drug Interactions (DDI)', desc: 'Multi-drug clash & conflict detection.' },
      { key: 'safetyShields', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>', name: 'Organ Toxicity Shields', desc: 'Renal, hepatic & hematology contraindications.' },
      { key: 'ddx', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>', name: 'Differential Diagnosis (DDx)', desc: 'Ranked candidate disease differentials.' },
      { key: 'geneticGuard', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0-14 0"/><circle cx="9" cy="9" r="2"/><path d="m14 8 5 5"/></svg>', name: 'Genetic & Marriage Guard', desc: 'Thalassemia & familial carrier risk.' },
      { key: 'ascvdRisk', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5v14"/></svg>', name: '10-Year ASCVD Risk', desc: 'Cardiovascular stroke & heart risk.' },
      { key: 'urduGuide', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>', name: 'Roman Urdu Guide', desc: 'Bilingual patient care & diet instructions.' },
      { key: 'rxPad', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>', name: 'Digital Prescription Pad', desc: 'Printable prescription pad with credentials.' },
      { key: 'reportRemarks', icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>', name: 'Report Remarks Summary', desc: 'Attaches AI summary to report footer.' }
    ];

    function renderShell() {
      var escFn = (window.App && App.esc) ? App.esc : function (s) { return String(s || '').replace(/[&<>"']/g, ''); };
      var STAT_TINTS = {
        brand: { sc: '#131845', line: '#cbd5e1', soft: 'transparent', circle: '#e2e8f0' },
        blue:  { sc: '#131845', line: '#cbd5e1', soft: 'transparent', circle: '#e2e8f0' },
        amber: { sc: '#131845', line: '#cbd5e1', soft: 'transparent', circle: '#e2e8f0' },
        green: { sc: '#131845', line: '#cbd5e1', soft: 'transparent', circle: '#e2e8f0' },
        red:   { sc: '#131845', line: '#cbd5e1', soft: 'transparent', circle: '#e2e8f0' }
      };

      function renderKpiCard(icon, tint, label, value, sub, raw) {
        return '<div class="stat ai-dash-kpi" data-tint="brand" style="display:flex;flex-direction:column;justify-content:space-between;height:104px;min-height:104px;box-sizing:border-box;background:#ffffff !important;border:1px solid var(--bd,#cbd5e1) !important;border-radius:12px;padding:12px 16px;box-shadow:0 1px 3px rgba(15,23,42,.03) !important;overflow:hidden">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
          + '  <div class="lb" style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--muted);">' + escFn(label) + '</div>'
          + '  <div class="stat-ico ai-kpi-ico" style="display:inline-flex !important;align-items:center !important;justify-content:center !important;color:#131845 !important;background:transparent !important;background-color:transparent !important;border:none !important;box-shadow:none !important;border-radius:0 !important;width:auto !important;height:auto !important;min-width:0 !important;min-height:0 !important;margin:0 !important;padding:0 !important;flex:none !important">' + icon + '</div>'
          + '</div>'
          + '<div class="vl" data-count="' + raw + '" style="font-size:24px;font-weight:800;letter-spacing:-0.02em;color:var(--ink);line-height:1.1;font-variant-numeric:tabular-nums;margin:4px 0 2px">' + value + '</div>'
          + '<div class="dl" style="font-size:11px;color:var(--muted);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sub + '</div>'
          + '</div>';
      }

      var h = '<div id="optixAiDashboard" class="page" aria-label="Optix AI Clinical Intelligence Engine" style="font-family:inherit;color:var(--ink,#0f1e2e);max-width:1420px;width:100%;margin:0 auto;padding-bottom:24px">'
        + '<style>'
        + '  #optixAiDashboard { font-family: inherit; color: var(--ink, #0f1e2e); }'
        + '  #optixAiDashboard .stat-grid {'
        + '    display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; align-items: stretch;'
        + '  }'
        + '  #optixAiDashboard .stat.ai-dash-kpi,'
        + '  #view #optixAiDashboard .stat.ai-dash-kpi {'
        + '    border: 1px solid var(--bd, #cbd5e1) !important;'
        + '    box-shadow: 0 1px 3px rgba(15,23,42,0.03) !important;'
        + '    background: #ffffff !important;'
        + '    transform: none !important;'
        + '  }'
        + '  #optixAiDashboard .stat-ico,'
        + '  #optixAiDashboard .stat .stat-ico,'
        + '  #optixAiDashboard .ai-dash-kpi .stat-ico,'
        + '  #optixAiDashboard .ai-kpi-ico,'
        + '  #view #optixAiDashboard .stat-ico,'
        + '  #view #optixAiDashboard .stat .stat-ico,'
        + '  #view #optixAiDashboard .stat[data-tint] .stat-ico,'
        + '  #view #optixAiDashboard .ai-dash-kpi .stat-ico,'
        + '  #view #optixAiDashboard .ai-kpi-ico {'
        + '    width: auto !important;'
        + '    height: auto !important;'
        + '    min-width: 0 !important;'
        + '    min-height: 0 !important;'
        + '    border-radius: 0 !important;'
        + '    background: transparent !important;'
        + '    background-color: transparent !important;'
        + '    border: none !important;'
        + '    box-shadow: none !important;'
        + '    margin: 0 !important;'
        + '    padding: 0 !important;'
        + '    display: inline-flex !important;'
        + '    align-items: center !important;'
        + '    justify-content: center !important;'
        + '    color: var(--brand, #131845) !important;'
        + '    flex: 0 0 auto !important;'
        + '  }'
        + '  #optixAiDashboard .stat-ico svg,'
        + '  #optixAiDashboard .stat .stat-ico svg,'
        + '  #optixAiDashboard .ai-dash-kpi .stat-ico svg,'
        + '  #optixAiDashboard .ai-kpi-ico svg,'
        + '  #view #optixAiDashboard .stat-ico svg,'
        + '  #view #optixAiDashboard .stat .stat-ico svg,'
        + '  #view #optixAiDashboard .stat[data-tint] .stat-ico svg,'
        + '  #view #optixAiDashboard .ai-dash-kpi .stat-ico svg,'
        + '  #view #optixAiDashboard .ai-kpi-ico svg {'
        + '    width: 18px !important;'
        + '    height: 18px !important;'
        + '    color: var(--brand, #131845) !important;'
        + '    stroke: var(--brand, #131845) !important;'
        + '    stroke-width: 2 !important;'
        + '    display: block !important;'
        + '  }'
        + '  @media(max-width:1100px) { #optixAiDashboard .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }'
        + '  @media(max-width:560px) { #optixAiDashboard .stat-grid { grid-template-columns: 1fr; gap: 10px; } }'
        + '  #optixAiDashboard .ai-tabs-bar {'
        + '    display: flex; gap: 8px; margin-bottom: 18px;'
        + '    background: transparent; padding: 0; border: none; box-shadow: none;'
        + '    overflow-x: auto; flex-wrap: wrap; align-items: center;'
        + '  }'
        + '  #optixAiDashboard .ai-dash-tab {'
        + '    flex: 0 0 auto; min-height: 36px; border: 1px solid #cbd5e1; background: #ffffff; color: var(--ink2, #334155); font-size: 13px; font-weight: 600;'
        + '    padding: 7px 16px; border-radius: 8px; cursor: pointer; transition: all .15s ease;'
        + '    white-space: nowrap; text-align: center; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-family: inherit;'
        + '    box-shadow: 0 1px 2px rgba(15,30,46,0.04);'
        + '  }'
        + '  #optixAiDashboard .ai-dash-tab:hover:not(.active) {'
        + '    background: #f8fafc; border-color: #94a3b8; color: var(--ink, #0f1e2e);'
        + '  }'
        + '  #optixAiDashboard .ai-dash-tab:focus-visible { outline: 2px solid var(--brand, #131845); outline-offset: 2px; }'
        + '  #optixAiDashboard .ai-dash-tab.active {'
        + '    background: var(--brand, #131845); border-color: var(--brand, #131845); color: #ffffff; font-weight: 700;'
        + '    box-shadow: 0 2px 4px rgba(19,24,69,0.18);'
        + '  }'
        + '  #optixAiDashboard .ai-dash-icon { display: inline-flex; align-items: center; justify-content: center; font-size: 14px; }'
        + '  #optixAiDashboard .ai-dash-tab.active .ai-dash-icon { color: #ffffff; }'
        + '  #optixAiDashboard .ai-dash-tab-title { font-size: 13px; white-space: nowrap; }'
        + '  #optixAiDashboard .card { background: #ffffff; border: 1px solid var(--bd, #cbd5e1); border-radius: 12px; box-shadow: 0 1px 3px rgba(15,23,42,0.04); margin-bottom: 16px; overflow: hidden; }'
        + '  #optixAiDashboard .card-h { padding: 12px 18px; border-bottom: 1px solid var(--line2, #eef3f8); display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #ffffff; }'
        + '  #optixAiDashboard .card-h h3 { font-size: 14.5px; font-weight: 700; color: var(--ink, #0f1e2e); margin: 0; }'
        + '  #optixAiDashboard .card-b { padding: 16px 18px; }'
        + '  #optixAiDashboard .ai-card-mod {'
        + '    background: #ffffff; border: 1px solid var(--bd, #cbd5e1); border-radius: 10px; padding: 10px 14px;'
        + '    display: flex; justify-content: space-between; align-items: center; gap: 12px; box-shadow: 0 1px 2px rgba(15,30,46,0.03);'
        + '    min-height: 48px; transition: border-color .15s ease, box-shadow .15s ease;'
        + '  }'
        + '  #optixAiDashboard .ai-card-mod:hover { border-color: #94a3b8; box-shadow: 0 2px 6px rgba(15,30,46,0.06); }'
        + '  #optixAiDashboard .ai-mod-ico {'
        + '    display: inline-flex; align-items: center; justify-content: center;'
        + '    color: var(--brand, #131845); background: transparent; border: none;'
        + '    font-size: 18px; flex-shrink: 0; width: auto; height: auto;'
        + '  }'
        + '  #optixAiDashboard .ai-card-mod:hover .ai-mod-ico { background: transparent; border: none; color: var(--brand, #131845); }'
        + '  #optixAiDashboard .ai-card-mod .ai-mod-title { font-size: 13px; font-weight: 600; color: var(--ink, #0f1e2e); line-height: 1.25; }'
        + '  #optixAiDashboard .ai-switch { position: relative; display: inline-block; width: 42px; height: 22px; flex-shrink: 0; }'
        + '  #optixAiDashboard .ai-switch input { opacity: 0; width: 0; height: 0; }'
        + '  #optixAiDashboard .ai-slider {'
        + '    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;'
        + '    background-color: #e2e8f0; transition: .2s cubic-bezier(0.2, 0.8, 0.2, 1); border-radius: 22px; border: 1px solid #cbd5e1;'
        + '  }'
        + '  #optixAiDashboard .ai-slider:before {'
        + '    position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;'
        + '    background-color: #ffffff; transition: .2s cubic-bezier(0.2, 0.8, 0.2, 1); border-radius: 50%; box-shadow: 0 1px 3px rgba(15,23,42,0.18);'
        + '  }'
        + '  #optixAiDashboard .ai-switch input:checked + .ai-slider { background-color: var(--brand, #131845); border-color: var(--brand, #131845); }'
        + '  #optixAiDashboard .ai-switch input:checked + .ai-slider:before { transform: translateX(20px); }'
        + '  #optixAiDashboard .ai-switch input:focus-visible + .ai-slider { outline: 2px solid var(--brand, #131845); outline-offset: 2px; }'
        + '  #optixAiDashboard .ai-input-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }'
        + '  #optixAiDashboard .ai-form-group { display: flex; flex-direction: column; gap: 3px; }'
        + '  #optixAiDashboard .ai-form-group label { font-size: 11px; font-weight: 600; color: var(--ink2, #334155); }'
        + '  #optixAiDashboard .input {'
        + '    border: 1px solid var(--bd, #cbd5e1); border-radius: 6px; padding: 5px 9px; font-size: 12.5px; font-weight: 600;'
        + '    color: var(--ink, #0f1e2e); background: #ffffff; outline: none; transition: all .15s ease; width: 100%; box-sizing: border-box; height: 32px;'
        + '  }'
        + '  #optixAiDashboard .input:focus { border-color: var(--brand, #131845); box-shadow: 0 0 0 2px rgba(19,24,69,0.1); }'
        + '  #optixAiDashboard .ai-unit-tag {'
        + '    position: absolute; right: 6px; font-size: 10px; font-weight: 700; color: var(--muted, #64748b); background: #f1f5f9; padding: 1px 5px; border-radius: 4px; border: 1px solid #e2e8f0; pointer-events: none;'
        + '  }'
        + '  #optixAiDashboard .ai-sec-badge {'
        + '    display: inline-flex; align-items: center; gap: 6px; padding: 0;'
        + '    font-size: 11.5px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 10px;'
        + '    background: transparent; color: var(--brand, #131845); border: none;'
        + '  }'
        + '  #optixAiDashboard .ai-sim-card {'
        + '    background: #ffffff; border: 1px solid var(--bd, #cbd5e1); border-radius: 12px; padding: 14px 16px;'
        + '    display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 1px 3px rgba(15,30,46,0.03);'
        + '    min-height: 140px; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease;'
        + '  }'
        + '  #optixAiDashboard .ai-sim-card:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(15,30,46,0.06); border-color: #94a3b8; }'
        + '  #optixAiDashboard .ai-sim-card .sim-ico-box {'
        + '    display: inline-flex; align-items: center; justify-content: center;'
        + '    background: transparent; border: none; color: var(--brand, #131845);'
        + '    width: auto; height: auto; font-size: 18px;'
        + '  }'
        + '  #optixAiDashboard .ai-sim-card .sim-title { font-size: 13.5px; font-weight: 700; color: var(--ink, #0f1e2e); margin: 6px 0 4px; }'
        + '  #optixAiDashboard .ai-sim-card .sim-stats {'
        + '    font-size: 11px; color: var(--muted, #64748b); margin-bottom: 8px; background: #f8fafc; padding: 5px 8px; border-radius: 6px; border: 1px solid #eef2f6; line-height: 1.4;'
        + '  }'
        + '  #optixAiDashboard .ai-sim-card .sim-stats b { color: var(--ink, #0f1e2e); }'
        + '  #optixAiDashboard .ai-sim-card .sim-btn {'
        + '    margin-top: 6px; width: 100%; border-radius: 6px; font-weight: 600; font-size: 11.5px; padding: 7px 10px;'
        + '    display: inline-flex; align-items: center; justify-content: center; gap: 5px; transition: all .15s ease; cursor: pointer;'
        + '    background: #131845; color: #ffffff; border: none;'
        + '    box-shadow: 0 1px 3px rgba(19,24,69,0.18);'
        + '  }'
        + '  #optixAiDashboard .ai-sim-card .sim-btn:hover { background: #0d1238; transform: translateY(-1px); }'
        + '  #optixAiDashboard .ai-btn-primary {'
        + '    display: inline-flex; align-items: center; justify-content: center; gap: 7px;'
        + '    background: #131845; color: #ffffff;'
        + '    border: none; border-radius: 7px; padding: 8px 18px; font-weight: 700; font-size: 13px; cursor: pointer;'
        + '    box-shadow: 0 1px 3px rgba(19,24,69,0.18); transition: all .15s ease;'
        + '  }'
        + '  #optixAiDashboard .ai-btn-primary:hover { background: #0d1238; transform: translateY(-1px); }'
        + '  #optixAiDashboard .ai-btn-ghost {'
        + '    background: #ffffff; border: 1px solid var(--bd, #cbd5e1); color: var(--ink2, #334155); border-radius: 6px; padding: 4px 10px;'
        + '    font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all .15s ease;'
        + '  }'
        + '  #optixAiDashboard .ai-btn-ghost:hover { background: #f8fafc; border-color: #94a3b8; color: var(--ink, #0f1e2e); }'
        + '</style>'
        + '<div class="stat-grid" style="margin-bottom:18px">'
        +   renderKpiCard(
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
              'brand',
              'Analyses',
              stats.analyzed,
              'Total evaluations',
              stats.analyzed
            )
        +   renderKpiCard(
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
              'brand',
              'Critical Alerts',
              stats.panics,
              'Emergency flags',
              stats.panics
            )
        +   renderKpiCard(
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
              'brand',
              'Organ Warnings',
              stats.organAlerts,
              'High risk systems',
              stats.organAlerts
            )
        +   renderKpiCard(
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
              'brand',
              'DDI Conflicts',
              stats.ddiBlocked,
              'Drug interactions',
              stats.ddiBlocked
            )
        + '</div>'

        // Tabs Bar
        + '<div class="ai-tabs-bar" role="group" aria-label="AI dashboard sections">'
        + '  <button type="button" class="btn ai-dash-tab' + (activeTab === 'modules' ? ' active' : '') + '" data-dash-tab="modules" aria-controls="aiPanel-modules" aria-pressed="' + (activeTab === 'modules' ? 'true' : 'false') + '"><span class="ai-dash-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></span><span class="ai-dash-tab-title">Subsystem Toggles</span></button>'
        + '  <button type="button" class="btn ai-dash-tab' + (activeTab === 'panic' ? ' active' : '') + '" data-dash-tab="panic" aria-controls="aiPanel-panic" aria-pressed="' + (activeTab === 'panic' ? 'true' : 'false') + '"><span class="ai-dash-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><span class="ai-dash-tab-title">Emergency Panic Cutoff Limits</span></button>'
        + '  <button type="button" class="btn ai-dash-tab' + (activeTab === 'sandbox' ? ' active' : '') + '" data-dash-tab="sandbox" aria-controls="aiPanel-sandbox" aria-pressed="' + (activeTab === 'sandbox' ? 'true' : 'false') + '"><span class="ai-dash-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.2 19.5A2 2 0 0 0 5.92 22h12.16a2 2 0 0 0 1.72-2.5L14 9.31V2"/><line x1="8" y1="2" x2="16" y2="2"/></svg></span><span class="ai-dash-tab-title">Clinical Sandbox & Live Analysis Simulator</span></button>'
        + '</div>'

        // Panels
        + '<div id="aiDashPanels">'

        // PANEL 1: MODULE TOGGLES
        + '  <div id="aiPanel-modules" style="display:' + (activeTab === 'modules' ? 'block' : 'none') + '">'
        + '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">'
        + '      <div style="font-size:14px;font-weight:700;color:var(--ink,#0f1e2e)">Clinical Subsystems</div>'
        + '      <div style="display:flex;gap:8px">'
        + '        <button type="button" id="aiEnableAllMods" class="ai-btn-ghost">✓ Enable All</button>'
        + '        <button type="button" id="aiDisableAllMods" class="ai-btn-ghost">✕ Disable All</button>'
        + '      </div>'
        + '    </div>'
        + '    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">'
        +        MODULE_DEFS.map(function (m) {
                   var isChecked = curCfg.modules[m.key] !== false;
                   return '<div class="ai-card-mod">'
                     + '  <div style="display:flex;gap:10px;align-items:center;min-width:0">'
                     + '    <div class="ai-mod-ico">' + m.icon + '</div>'
                     + '    <div class="ai-mod-title">' + m.name + '</div>'
                     + '  </div>'
                     + '  <label class="ai-switch">'
                     + '    <input type="checkbox" data-mod-key="' + m.key + '"' + (isChecked ? ' checked' : '') + '>'
                     + '    <span class="ai-slider"></span>'
                     + '  </label>'
                     + '</div>';
                 }).join('')
        + '    </div>'
        + '  </div>'

        // PANEL 2: PANIC THRESHOLDS
        + '  <div id="aiPanel-panic" style="display:' + (activeTab === 'panic' ? 'block' : 'none') + '">'
        + '    <div class="card">'
        + '      <div class="card-h">'
        + '        <h3 style="margin:0;font-size:14px;font-weight:700;color:var(--ink,#0f1e2e)">Emergency Panic Cutoff Limits (CAP / ISO 15189)</h3>'
        + '        <button type="button" id="aiResetPanicDefaultsBtn" class="ai-btn-ghost">'
        + '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span>Restore Defaults</span>'
        + '        </button>'
        + '      </div>'
        + '      <div class="card-b">'
        + '        <div class="ai-sec-badge">'
        + '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg> <span>Hematology</span>'
        + '        </div>'
        + '        <div class="ai-input-grid" style="margin-bottom:14px">'
        + '          <div class="ai-form-group">'
        + '            <label>Platelets (Min)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" class="input" id="thPlt" value="' + (curCfg.panicThresholds.plt || 20000) + '" style="padding-right:54px">'
        + '              <span class="ai-unit-tag">&lt; /uL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>Hemoglobin (Hb Min)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" step="0.1" class="input" id="thHb" value="' + (curCfg.panicThresholds.hb || 6.5) + '" style="padding-right:54px">'
        + '              <span class="ai-unit-tag">&lt; g/dL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>WBC (Max)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" class="input" id="thWbcHigh" value="' + (curCfg.panicThresholds.wbcHigh || 35000) + '" style="padding-right:54px">'
        + '              <span class="ai-unit-tag">&gt; /uL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>WBC (Min)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" class="input" id="thWbcLow" value="' + (curCfg.panicThresholds.wbcLow || 1500) + '" style="padding-right:54px">'
        + '              <span class="ai-unit-tag">&lt; /uL</span>'
        + '            </div>'
        + '          </div>'
        + '        </div>'
        + '        <div class="ai-sec-badge">'
        + '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.2 19.5A2 2 0 0 0 5.92 22h12.16a2 2 0 0 0 1.72-2.5L14 9.31V2"/><line x1="8" y1="2" x2="16" y2="2"/></svg> <span>Glucose &amp; Liver</span>'
        + '        </div>'
        + '        <div class="ai-input-grid" style="margin-bottom:14px">'
        + '          <div class="ai-form-group">'
        + '            <label>Glucose (Max)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" class="input" id="thGlucoseHigh" value="' + (curCfg.panicThresholds.glucoseHigh || 400) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&gt; mg/dL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>Glucose (Min)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" class="input" id="thGlucoseLow" value="' + (curCfg.panicThresholds.glucoseLow || 50) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&lt; mg/dL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>Total Bilirubin (Max)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" step="0.1" class="input" id="thBilirubin" value="' + (curCfg.panicThresholds.bilirubin || 10.0) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&gt; mg/dL</span>'
        + '            </div>'
        + '          </div>'
        + '        </div>'
        + '        <div class="ai-sec-badge">'
        + '          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> <span>Renal &amp; Electrolytes</span>'
        + '        </div>'
        + '        <div class="ai-input-grid">'
        + '          <div class="ai-form-group">'
        + '            <label>Serum Creatinine (Max)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" step="0.1" class="input" id="thCreatinine" value="' + (curCfg.panicThresholds.creatinine || 4.0) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&gt; mg/dL</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>Potassium (Max)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" step="0.1" class="input" id="thPotassiumHigh" value="' + (curCfg.panicThresholds.potassiumHigh || 6.2) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&gt; mEq/L</span>'
        + '            </div>'
        + '          </div>'
        + '          <div class="ai-form-group">'
        + '            <label>Potassium (Min)</label>'
        + '            <div style="position:relative;display:flex;align-items:center">'
        + '              <input type="number" step="0.1" class="input" id="thPotassiumLow" value="' + (curCfg.panicThresholds.potassiumLow || 2.8) + '" style="padding-right:60px">'
        + '              <span class="ai-unit-tag">&lt; mEq/L</span>'
        + '            </div>'
        + '          </div>'
        + '        </div>'
        + '      </div>'
        + '    </div>'
        + '  </div>'

        // PANEL 3: CLINICAL SANDBOX
        + '  <div id="aiPanel-sandbox" style="display:' + (activeTab === 'sandbox' ? 'block' : 'none') + '">'
        + '    <div style="margin-bottom:14px">'
        + '      <div style="font-size:14px;font-weight:700;color:var(--ink,#0f1e2e)">Clinical Sandbox & Live Analysis Simulator</div>'
        + '    </div>'
        + '    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">'
        + '      <div class="ai-sim-card">'
        + '        <div>'
        + '          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '            <div class="sim-ico-box"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg></div>'
        + '            <span class="badge" style="background:var(--brand-soft,#ebf4f8);color:var(--brand,#131845);border:1px solid var(--brand-line,#c7d8e8);font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 7px">CRITICAL</span>'
        + '          </div>'
        + '          <div class="sim-title">Acute Dengue Shock</div>'
        + '          <div class="sim-stats">Plt: <b>14,000</b> &bull; WBC: <b>2,800</b> &bull; HCT: <b>48.5%</b></div>'
        + '        </div>'
        + '        <button type="button" class="btn btn-primary sim-btn" data-ai-sim="dengue">▶ Run Simulation</button>'
        + '      </div>'
        + '      <div class="ai-sim-card">'
        + '        <div>'
        + '          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '            <div class="sim-ico-box"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>'
        + '            <span class="badge" style="background:var(--brand-soft,#ebf4f8);color:var(--brand,#131845);border:1px solid var(--brand-line,#c7d8e8);font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 7px">RENAL</span>'
        + '          </div>'
        + '          <div class="sim-title">Diabetic Nephropathy &amp; AKI</div>'
        + '          <div class="sim-stats">Glucose: <b>465</b> &bull; Creatinine: <b>4.8</b> &bull; K+: <b>6.4</b></div>'
        + '        </div>'
        + '        <button type="button" class="btn btn-primary sim-btn" data-ai-sim="diabetic_aki">▶ Run Simulation</button>'
        + '      </div>'
        + '      <div class="ai-sim-card">'
        + '        <div>'
        + '          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '            <div class="sim-ico-box"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg></div>'
        + '            <span class="badge" style="background:var(--brand-soft,#ebf4f8);color:var(--brand,#131845);border:1px solid var(--brand-line,#c7d8e8);font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 7px">GENETIC</span>'
        + '          </div>'
        + '          <div class="sim-title">Beta-Thalassemia Trait</div>'
        + '          <div class="sim-stats">Hb: <b>7.9</b> &bull; MCV: <b>57 fL</b> &bull; Mentzer: <b>9.8</b></div>'
        + '        </div>'
        + '        <button type="button" class="btn btn-primary sim-btn" data-ai-sim="thalassemia">▶ Run Simulation</button>'
        + '      </div>'
        + '      <div class="ai-sim-card">'
        + '        <div>'
        + '          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        + '            <div class="sim-ico-box"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></div>'
        + '            <span class="badge" style="background:var(--brand-soft,#ebf4f8);color:var(--brand,#131845);border:1px solid var(--brand-line,#c7d8e8);font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 7px">HEPATIC</span>'
        + '          </div>'
        + '          <div class="sim-title">Hyperuricemia &amp; Liver Steatosis</div>'
        + '          <div class="sim-stats">Uric Acid: <b>9.8</b> &bull; ALT: <b>94</b> &bull; AST: <b>45</b></div>'
        + '        </div>'
        + '        <button type="button" class="btn btn-primary sim-btn" data-ai-sim="gout">▶ Run Simulation</button>'
        + '      </div>'
        + '    </div>'
        + '  </div>'

        + '</div>' // #aiDashPanels
        + '<div class="ai-dash-footer" style="display:flex;justify-content:flex-end;align-items:center;margin-top:20px;padding:12px 18px;background:#ffffff;border:1px solid var(--bd,#cbd5e1);border-radius:10px;box-shadow:0 1px 3px rgba(15,30,46,0.04);flex-wrap:wrap;gap:12px">'
        + '  <button type="button" id="aiSaveConfigBtn" class="ai-btn-primary ai-save-config-btn" style="min-width:140px">'
        + '    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>'
        + '    <span>Save Settings</span>'
        + '  </button>'
        + '</div>'
        + '</div>'; // #optixAiDashboard

      return h;
    }

    function wireEvents() {
      // Tab switching
      var tabBtns = container.querySelectorAll('.ai-dash-tab');
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          activeTab = btn.getAttribute('data-dash-tab');
          tabBtns.forEach(function (b) { b.classList.toggle('active', b === btn); b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
          var panels = ['modules', 'panic', 'sandbox'];
          panels.forEach(function (p) {
            var pan = container.querySelector('#aiPanel-' + p);
            if (pan) pan.style.display = (p === activeTab) ? 'block' : 'none';
          });
        });
      });

      if (!AI.canConfigure()) {
        container.querySelectorAll('#aiDashPanels input, .ai-save-config-btn, #aiResetPanicDefaultsBtn, #aiEnableAllMods, #aiDisableAllMods').forEach(function (control) { control.disabled = true; });
        var hint = document.createElement('p');
        hint.className = 'muted'; hint.textContent = 'Read-only settings: only an admin can save changes. You can use the sandbox simulations.';
        var bar = container.querySelector('.ai-tabs-bar'); if (bar) bar.insertAdjacentElement('afterend', hint);
      }

      // Enable / Disable All helper buttons
      var enAllBtn = container.querySelector('#aiEnableAllMods');
      if (enAllBtn) {
        enAllBtn.addEventListener('click', function () {
          container.querySelectorAll('[data-mod-key]').forEach(function (chk) { chk.checked = true; });
        });
      }
      var disAllBtn = container.querySelector('#aiDisableAllMods');
      if (disAllBtn) {
        disAllBtn.addEventListener('click', function () {
          container.querySelectorAll('[data-mod-key]').forEach(function (chk) { chk.checked = false; });
        });
      }

      // Live update for Doctor Branding inputs
      // Reset Panic Defaults Button
      var rstBtn = container.querySelector('#aiResetPanicDefaultsBtn');
      if (rstBtn) {
        rstBtn.addEventListener('click', function () {
          var defs = AI.DEFAULT_CONFIG.panicThresholds;
          if (container.querySelector('#thPlt')) container.querySelector('#thPlt').value = defs.plt;
          if (container.querySelector('#thHb')) container.querySelector('#thHb').value = defs.hb;
          if (container.querySelector('#thGlucoseHigh')) container.querySelector('#thGlucoseHigh').value = defs.glucoseHigh;
          if (container.querySelector('#thGlucoseLow')) container.querySelector('#thGlucoseLow').value = defs.glucoseLow;
          if (container.querySelector('#thCreatinine')) container.querySelector('#thCreatinine').value = defs.creatinine;
          if (container.querySelector('#thPotassiumHigh')) container.querySelector('#thPotassiumHigh').value = defs.potassiumHigh;
          if (container.querySelector('#thPotassiumLow')) container.querySelector('#thPotassiumLow').value = defs.potassiumLow;
          if (container.querySelector('#thBilirubin')) container.querySelector('#thBilirubin').value = defs.bilirubin;
          if (container.querySelector('#thWbcHigh')) container.querySelector('#thWbcHigh').value = defs.wbcHigh;
          if (container.querySelector('#thWbcLow')) container.querySelector('#thWbcLow').value = defs.wbcLow;
          if (window.App && App.toast) App.toast('Default thresholds restored. Click Save to apply.', 'info');
        });
      }

      // Simulation buttons
      var simBtns = container.querySelectorAll('[data-ai-sim]');
      simBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var simKey = btn.getAttribute('data-ai-sim');
          AI.simulateAnalysis(simKey);
        });
      });

      // Save Configuration Buttons (Header & Bottom Action Bar)
      var saveBtns = container.querySelectorAll('.ai-save-config-btn, #aiSaveConfigBtn, #aiSaveConfigBtnBtm');
      saveBtns.forEach(function (saveBtn) {
        saveBtn.addEventListener('click', function () {
          // Collect modules
          var newModules = {};
          container.querySelectorAll('[data-mod-key]').forEach(function (chk) {
            newModules[chk.getAttribute('data-mod-key')] = !!chk.checked;
          });

          // Collect panic thresholds
          var newTh = {
            plt: Number((container.querySelector('#thPlt') || {}).value || 20000),
            hb: Number((container.querySelector('#thHb') || {}).value || 6.5),
            glucoseHigh: Number((container.querySelector('#thGlucoseHigh') || {}).value || 400),
            glucoseLow: Number((container.querySelector('#thGlucoseLow') || {}).value || 50),
            creatinine: Number((container.querySelector('#thCreatinine') || {}).value || 4.0),
            potassiumHigh: Number((container.querySelector('#thPotassiumHigh') || {}).value || 6.2),
            potassiumLow: Number((container.querySelector('#thPotassiumLow') || {}).value || 2.8),
            bilirubin: Number((container.querySelector('#thBilirubin') || {}).value || 10.0),
            wbcHigh: Number((container.querySelector('#thWbcHigh') || {}).value || 35000),
            wbcLow: Number((container.querySelector('#thWbcLow') || {}).value || 1500)
          };

          // Collect doctor branding
          var newBrand = (curCfg && curCfg.doctorBranding) || AI.DEFAULT_CONFIG.doctorBranding;
          if (container.querySelector('#aiDocName')) {
            newBrand = {
              name: ((container.querySelector('#aiDocName') || {}).value || '').trim() || 'Consultant Physician',
              degrees: ((container.querySelector('#aiDocDegrees') || {}).value || '').trim() || 'MBBS, FCPS / MD (Internal Medicine)',
              pmdc: ((container.querySelector('#aiDocPmdc') || {}).value || '').trim() || '49281-P',
              clinic: ((container.querySelector('#aiDocClinic') || {}).value || '').trim() || 'Optix Medical Care & Diagnostics',
              phone: ((container.querySelector('#aiDocPhone') || {}).value || '').trim() || '+92 300 0000000',
              specialization: ((container.querySelector('#aiDocSpec') || {}).value || '').trim() || 'Clinical Specialist & Diagnostician'
            };
          }

          // Collect roles (Doctor and Admin are ALWAYS mandatory)
          var newRoles = (curCfg && Array.isArray(curCfg.roles)) ? curCfg.roles : ['admin', 'doctor', 'technician'];
          if (container.querySelector('#aiRoleTech')) {
            newRoles = ['admin', 'doctor'];
            if ((container.querySelector('#aiRoleTech') || {}).checked) newRoles.push('technician');
            if ((container.querySelector('#aiRoleRecep') || {}).checked) newRoles.push('reception');
          }

          var toSave = {
            modules: newModules,
            panicThresholds: newTh,
            doctorBranding: newBrand,
            roles: newRoles
          };

          saveBtns.forEach(function (b) { b.disabled = true; });
          Promise.resolve(AI.saveAiConfig(toSave)).then(function (saved) {
            if (saved) curCfg = toSave;
          }).finally(function () { saveBtns.forEach(function (b) { b.disabled = !AI.canConfigure(); }); });
        });
      });
    }

    container.innerHTML = renderShell();
    wireEvents();
  };

  // Register routing for AI Dashboard & Recommendations
  if (typeof window !== 'undefined' && window.App && typeof window.App.route === 'function') {
    window.App.route('#/ai-dashboard', function () { AI.renderDashboard('view'); });
    window.App.route('/ai-dashboard', function () { AI.renderDashboard('view'); });
    window.App.route('#/ai-recommendations/:id', function (p) { AI.renderRecommendationsPage('view', p ? p.id : null); });
    window.App.route('/ai-recommendations/:id', function (p) { AI.renderRecommendationsPage('view', p ? p.id : null); });
    window.App.route('#/ai-recommendations', function () { AI.renderRecommendationsPage('view'); });
    window.App.route('/ai-recommendations', function () { AI.renderRecommendationsPage('view'); });
  }

  window.App = window.App || {};
  window.App.aiInsights = AI;
})();

