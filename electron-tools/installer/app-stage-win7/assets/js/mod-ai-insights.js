/* ============================================================
   Optix Medical Sync — AI Clinical Decision Support & Recommendations
   Analyzes lab report values, detects abnormalities, and generates
   5 structured clinical solutions for doctors:
     1. 🩺 Clinical Diagnosis & Pattern Interpretation
     2. 💊 Recommended Medications & Dosage Guidelines
     3. 🥗 Dietary & Lifestyle Management Plan
     4. 🔬 Recommended Confirmatory & Follow-up Tests
     5. ⚠️ Red Flags, Urgent Precautions & Specialist Referral
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
    if (s === 'mcv' || s.indexOf('meanovular') >= 0) return 'mcv';
    if (s.indexOf('fastingblood') >= 0 || s.indexOf('bloodsugarfast') >= 0 || s === 'fbs' || (s.indexOf('fasting') >= 0 && s.indexOf('glucose') >= 0)) return 'glucose_fasting';
    if (s.indexOf('randomblood') >= 0 || s.indexOf('bloodsugarran') >= 0 || s === 'rbs' || (s.indexOf('random') >= 0 && s.indexOf('glucose') >= 0)) return 'glucose_random';
    if (s.indexOf('glucose') >= 0 || s.indexOf('sugar') >= 0) return 'glucose_random';
    if (s.indexOf('hba1c') >= 0 || s.indexOf('glycated') >= 0) return 'hba1c';
    if (s === 'alt' || s === 'sgpt' || s.indexOf('alanine') >= 0) return 'alt';
    if (s === 'ast' || s === 'sgot' || s.indexOf('aspartate') >= 0) return 'ast';
    if (s.indexOf('totalbilirubin') >= 0 || s === 'bilirubintotal' || s === 'bilirubin') return 'bili_total';
    if (s.indexOf('alkaline') >= 0 || s === 'alp') return 'alp';
    if (s.indexOf('creatinine') >= 0) return 'creatinine';
    if (s.indexOf('urea') >= 0 || s === 'bun') return 'urea';
    if (s.indexOf('uricacid') >= 0) return 'uric_acid';
    if (s.indexOf('cholesterol') >= 0 && s.indexOf('total') >= 0) return 'cholesterol';
    if (s.indexOf('triglyceride') >= 0 || s === 'tg') return 'triglycerides';
    if (s === 'ldl' || s.indexOf('ldlchol') >= 0) return 'ldl';
    if (s === 'tsh' || s.indexOf('thyroidstim') >= 0) return 'tsh';
    if (s.indexOf('puscell') >= 0 || s.indexOf('wbcspus') >= 0) return 'urine_pus';
    return null;
  }

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

  /* Generate 5 structured clinical solutions */
  AI.generate5Solutions = function (reportData, findings) {
    findings = findings || AI.extractFindings(reportData);
    var pt = (reportData && (reportData.pt || reportData.pat || reportData.patient)) || {};
    var inv = (reportData && (reportData.inv || reportData.invoice)) || {};
    var doc = (reportData && (reportData.doc || reportData.doctor)) || null;

    // Keys presence flags
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
      var gVal = (has.hba1c && has.hba1c.value) || (has.glucose_fasting && has.glucose_fasting.value) || (has.glucose_random && has.glucose_random.value);
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
      }
    };
  };

  /* Role & Permission Access Check */
  AI.canAccess = function (role) {
    if (!role) {
      var s = null;
      try { s = JSON.parse(localStorage.getItem('labpos_session') || 'null'); } catch (e) {}
      role = (s && s.role) || 'admin';
    }
    // Doctors and Admins ALWAYS have access (Mandatory for doctors, full access for admin)
    if (role === 'doctor' || role === 'admin') return true;

    // Check admin-configured settings
    var set = null;
    try { set = (window.DB && typeof DB.get === 'function') ? DB.get('settings', 'main') : null; } catch (e) {}
    var allowed = (set && Array.isArray(set.aiInsightsRoles)) ? set.aiInsightsRoles : ['admin', 'doctor', 'technician'];
    return allowed.indexOf(role) >= 0;
  };

  /* Render Rich Modal with 5 Solutions */
  AI.showModal = function (invoiceId, directData) {
    var d = directData || null;
    if (!d) {
      try {
        if (window.reportData) d = window.reportData(invoiceId);
        else if (window.App && App.reportData) d = App.reportData(invoiceId);
      } catch (e) {}
    }

    // Fallback if reportData not globally exposed
    if (!d) {
      var inv = (window.DB && typeof DB.get === 'function')
        ? (DB.get('invoices', invoiceId) || (DB.all('invoices') || []).filter(function (x) { return x.no === invoiceId; })[0])
        : null;
      if (!inv && !directData) { App.toast('Invoice not found', 'err'); return; }
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

    if (!d) { App.toast('Report data unavailable for AI analysis', 'err'); return; }

    var analysis = AI.generate5Solutions(d);
    var pt = analysis.patient;
    var inv = analysis.invoice;
    var doc = analysis.doctor;
    var s = analysis.solutions;
    var findings = analysis.findings;

    // Badges HTML
    var findingsBadges = findings.length
      ? findings.map(function (f) {
          var isCrit = f.status.indexOf('critical') >= 0;
          var bg = isCrit ? '#fee2e2' : '#fef3c7';
          var color = isCrit ? '#b91c1c' : '#b45309';
          var border = isCrit ? '#fca5a5' : '#fde68a';
          return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;font-size:11.5px;font-weight:700;background:' + bg + ';color:' + color + ';border:1px solid ' + border + '">'
            + (isCrit ? '⚠️ ' : '⚡ ') + App.esc(f.paramName) + ': ' + App.esc(f.value) + ' ' + App.esc(f.unit) + ' (' + App.esc(f.note || f.status) + ')</span>';
        }).join(' ')
      : '<span style="color:#059669;font-weight:700;font-size:12px">✅ All tested parameters within normal reference ranges</span>';

    // Solution 1 HTML
    var diagHtml = s.diagnosis.map(function (di) {
      return '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(0,0,0,0.05)">'
        + '<div style="font-size:13.5px;font-weight:800;color:#1e293b;margin-bottom:2px">🩺 ' + App.esc(di.title) + '</div>'
        + '<div style="font-size:12.5px;color:#475569;line-height:1.45">' + App.esc(di.detail) + '</div>'
        + '</div>';
    }).join('');

    // Solution 2 HTML (Medications)
    var medsHtml = s.medications.map(function (m) {
      var items = m.items.map(function (it) {
        return '<div style="background:#fff;border:1px solid #e2e8f0;border-left:3.5px solid #10b981;border-radius:8px;padding:8px 12px;margin-bottom:6px">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'
          + '<b style="color:#0f172a;font-size:13px">' + App.esc(it.drug) + '</b>'
          + '<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">' + App.esc(it.dosage) + '</span>'
          + '</div>'
          + (it.note ? '<div style="font-size:11.5px;color:#64748b;margin-top:3px">' + App.esc(it.note) + '</div>' : '')
          + '</div>';
      }).join('');
      return '<div style="margin-bottom:8px">'
        + '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#059669;letter-spacing:0.04em;margin-bottom:6px">' + App.esc(m.category) + '</div>'
        + items
        + '</div>';
    }).join('');

    // Solution 3 HTML (Diet & Lifestyle)
    var dietHtml = '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.6">'
      + s.diet.map(function (d) { return '<li>' + App.esc(d) + '</li>'; }).join('')
      + '</ul>';

    // Solution 4 HTML (Follow-up Tests)
    var testsHtml = '<ul style="margin:0;padding-left:18px;font-size:12.5px;color:#334155;line-height:1.6">'
      + s.tests.map(function (t) { return '<li>' + App.esc(t) + '</li>'; }).join('')
      + '</ul>';

    // Solution 5 HTML (Red Flags)
    var redflagsHtml = s.redflags.map(function (rf) {
      return '<div style="background:#fff1f2;border:1px solid #fecdd3;border-left:4px solid #e11d48;border-radius:8px;padding:8px 12px;margin-bottom:6px;font-size:12px;font-weight:600;color:#9f1239;line-height:1.45">'
        + App.esc(rf) + '</div>';
    }).join('');

    // Formatted Plain Text for Clipboard / WhatsApp
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

    var modalHtml = '<div style="max-width:880px;font-family:inherit">'
      // Header Card
      + '<div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);color:#fff;border-radius:14px;padding:16px 20px;margin-bottom:14px;box-shadow:0 8px 24px rgba(79,70,229,0.22)">'
      + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">'
      + '    <div>'
      + '      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;opacity:0.85">Smart Medical Intelligence</div>'
      + '      <h2 style="font-size:20px;font-weight:800;margin:2px 0 4px">🤖 AI Doctor Recommendations (5 Solutions)</h2>'
      + '      <div style="font-size:13px;opacity:0.95">Patient: <b>' + App.esc(pt.name || 'Ali Raza') + '</b> &bull; Invoice: <b>#' + App.esc(inv.no || inv.id) + '</b>' + (doc ? ' &bull; Ref. Doctor: <b>' + App.esc(doc.name) + '</b>' : '') + '</div>'
      + '    </div>'
      + '    <div style="background:rgba(255,255,255,0.18);padding:6px 12px;border-radius:10px;font-size:11.5px;font-weight:700;backdrop-filter:blur(4px)">'
      + '      ⚡ Real-time Clinical Decision Support'
      + '    </div>'
      + '  </div>'
      + '</div>'

      // Detected Abnormalities Banner
      + '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;margin-bottom:14px">'
      + '  <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:0.05em;margin-bottom:6px">Detected Abnormal Lab Parameters</div>'
      + '  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">' + findingsBadges + '</div>'
      + '</div>'

      // 5 Solutions Grid
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px;margin-bottom:14px">'
      // Card 1: Diagnosis
      + '  <div style="background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;padding:14px">'
      + '    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#166534;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '      <span>🩺 Solution 1: Clinical Diagnosis & Interpretation</span>'
      + '    </div>'
      +      diagHtml
      + '  </div>'

      // Card 2: Medications
      + '  <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:14px">'
      + '    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#1e40af;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '      <span>💊 Solution 2: Prescription & Medication Guidance</span>'
      + '    </div>'
      +      medsHtml
      + '  </div>'

      // Card 3: Diet
      + '  <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:14px;padding:14px">'
      + '    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#92400e;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '      <span>🥗 Solution 3: Diet & Lifestyle Plan (Parhez)</span>'
      + '    </div>'
      +      dietHtml
      + '  </div>'

      // Card 4: Tests
      + '  <div style="background:#faf5ff;border:1.5px solid #e9d5ff;border-radius:14px;padding:14px">'
      + '    <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#6b21a8;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '      <span>🔬 Solution 4: Confirmatory Follow-up Tests</span>'
      + '    </div>'
      +      testsHtml
      + '  </div>'
      + '</div>'

      // Card 5: Red Flags Full Width
      + '<div style="background:#fff1f2;border:1.5px solid #fecdd3;border-radius:14px;padding:14px;margin-bottom:14px">'
      + '  <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#9f1239;letter-spacing:0.04em;margin-bottom:8px;display:flex;align-items:center;gap:6px">'
      + '    <span>⚠️ Solution 5: Red Flags, Precautions & Specialist Referral</span>'
      + '  </div>'
      +    redflagsHtml
      + '</div>'

      // Disclaimer
      + '<div style="font-size:11px;color:#64748b;line-height:1.4;background:#f8fafc;padding:8px 12px;border-radius:8px;margin-bottom:14px">'
      + '  <b>Medical Disclaimer:</b> AI Clinical Recommendations are advisory decision-support suggestions for registered medical doctors and lab consultants. Final clinical judgment and prescription authority rests solely with the treating physician.'
      + '</div>'

      // Actions Toolbar
      + '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap">'
      + '  <button type="button" class="btn btn-ghost" id="aiModalClose">Close</button>'
      + '  <button type="button" class="btn btn-ghost" id="aiCopyPrescription" style="border:1px solid #cbd5e1;font-weight:700">📋 Copy to Prescription</button>'
      + (doc && (doc.phone || doc.whatsapp)
          ? '  <button type="button" class="btn btn-ghost" id="aiWaDoctor" style="color:#059669;border:1px solid #a7f3d0;font-weight:700">💬 WhatsApp to Doctor</button>'
          : '')
      + '  <button type="button" class="btn btn-primary" id="aiPrintSlip" style="background:#4f46e5;font-weight:700">🖨️ Print Doctor Summary</button>'
      + '</div>'
      + '</div>';

    App.modal('AI Clinical Recommendations', modalHtml, {
      wide: true,
      onOpen: function (ov, close) {
        var cBtn = ov.querySelector('#aiModalClose');
        if (cBtn) cBtn.addEventListener('click', close);

        // Copy button
        var cpBtn = ov.querySelector('#aiCopyPrescription');
        if (cpBtn) {
          cpBtn.addEventListener('click', function () {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(plainText).then(function () {
                App.toast('Prescription recommendations copied to clipboard!');
              });
            } else {
              var ta = document.createElement('textarea');
              ta.value = plainText;
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              App.toast('Prescription recommendations copied!');
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

        // Print Doctor Summary
        var prBtn = ov.querySelector('#aiPrintSlip');
        if (prBtn) {
          prBtn.addEventListener('click', function () {
            var printWin = window.open('', '_blank');
            if (!printWin) { App.toast('Pop-up blocked. Please allow pop-ups to print.', 'err'); return; }
            printWin.document.write('<!DOCTYPE html><html><head><title>AI Clinical Summary - #' + App.esc(inv.no || inv.id) + '</title>'
              + '<style>'
              + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:20px;color:#111;font-size:13px;line-height:1.5}'
              + 'h2{color:#4338ca;margin:0 0 4px}'
              + '.box{border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:12px}'
              + '.b-title{font-weight:800;font-size:12px;text-transform:uppercase;margin-bottom:6px;color:#4338ca}'
              + '@media print{button{display:none}}'
              + '</style></head><body>'
              + '<h2>Optix AI Clinical Summary for Attending Doctor</h2>'
              + '<div>Patient: <b>' + App.esc(pt.name || '') + '</b> (' + App.esc(pt.age ? pt.age + 'y, ' : '') + App.esc(pt.sex || pt.gender || '') + ') &bull; Invoice: <b>#' + App.esc(inv.no || inv.id) + '</b></div>'
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
      }
    });
  };

  window.App = window.App || {};
  window.App.aiInsights = AI;
})();
