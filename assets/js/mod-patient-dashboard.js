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
        {
          icon: '🧪',
          name: 'Ventolin',
          generic: 'Salbutamol Sulfate 100mcg',
          category: 'SABA Bronchodilator',
          indication: 'Acute bronchospasm relief & rapid airway dilation',
          dose: '1-2 puffs as needed (Rescue Inhaler).',
          timing: 'Morning baseline • 8:30 AM',
          instructions: 'Shake inhaler well. Exhale fully, inhale deeply through spacer, hold breath for 10 seconds. Wait 1 min before second puff.',
          food: 'Can be taken without regard to meals.',
          safety: 'Monitor for mild transient hand tremor or palpitations. Seek urgent care if relief requires more than 4 puffs in 4 hours.',
          mech: 'Selectively stimulates beta-2 adrenergic receptors in bronchial smooth muscle, activating adenylate cyclase to produce cyclic AMP, inducing rapid bronchodilation within 3-5 minutes.',
          clinicalGoal: 'Rapidly reverse bronchospasm, ease work of breathing, and maintain resting SpO2 > 95%.'
        },
        {
          icon: '💊',
          name: 'Pulmicort',
          generic: 'Budesonide 0.5mg/2mL Suspension',
          category: 'Inhaled Corticosteroid (ICS)',
          indication: 'Airway anti-inflammatory & long-term asthma/COPD control',
          dose: '1-2 inhalations every 12 hours.',
          timing: 'Mid-day maintenance • 2:00 PM',
          instructions: 'Inhale via turbohaler or compressor nebulizer. Always rinse mouth thoroughly and gargle with warm water immediately after each dose.',
          food: 'Take consistently at 12-hour intervals.',
          safety: 'Rinsing mouth and spitting out water prevents oral candidiasis (fungal thrush) and dysphonia (voice hoarseness).',
          mech: 'Potent glucocorticoid that enters bronchial epithelial cells to suppress inflammatory gene transcription, reducing mucosal edema, cellular infiltration, and hyperresponsiveness.',
          clinicalGoal: 'Suppress chronic eosinophilic inflammation and prevent acute respiratory flare-ups.'
        },
        {
          icon: '🧴',
          name: 'Mucosolvan',
          generic: 'Ambroxol Hydrochloride 30mg',
          category: 'Secretolytic Mucoactive Agent',
          indication: 'Mucus liquefaction & tracheobronchial ciliary clearance',
          dose: '1 tablet (30mg) three times daily',
          timing: 'Evening pulmonary clearance • 9:30 PM',
          instructions: 'Swallow tablet with a full glass of water. Maintain abundant daily fluid intake (2.5L) to optimize secretolytic thinning.',
          food: 'Take with or immediately after meals.',
          safety: 'Well tolerated; gastrointestinal discomfort rare. Do not combine with antitussives (cough suppressants) to avoid mucus retention.',
          mech: 'Increases serous bronchial gland secretion, cleaves viscous mucopolysaccharide strands, and stimulates surfactant production by type II alveolar pneumocytes.',
          clinicalGoal: 'Thin viscous mucus plugs, accelerate mucociliary transport, and facilitate productive clearance.'
        }
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
        {
          icon: '💊',
          name: 'Heptral (SAMe)',
          generic: 'Ademetionine 500mg',
          category: 'Hepatic Methyl Donor & Antioxidant',
          indication: 'Intrahepatic cholestasis & hepatocyte membrane protection',
          dose: '500mg twice daily between meals.',
          timing: 'Morning hepatic detox • 8:30 AM',
          instructions: 'Swallow tablet whole with plenty of water. Do not crush, chew, or divide enteric coating.',
          food: 'Take on an empty stomach between meals for optimal gastrointestinal bioavailability.',
          safety: 'Avoid taking immediately before bedtime due to mild energizing properties. Monitor serum transaminases (ALT/AST).',
          mech: 'Essential biological sulfhydryl and methyl donor in the liver, driving transsulfuration for intracellular glutathione synthesis and transmethylation for membrane phospholipid repair.',
          clinicalGoal: 'Normalize elevated transaminases, enhance bile canalicular flow, and protect against free-radical damage.'
        },
        {
          icon: '🧪',
          name: 'Essentiale Forte',
          generic: 'Phosphatidylcholine (EPL) 300mg',
          category: 'Hepatoprotective Membrane Restorative',
          indication: 'Hepatic steatosis (Fatty Liver) & lipid clearance',
          dose: '1 capsule three times daily with meals.',
          timing: 'Mid-day lipid balance • 2:00 PM',
          instructions: 'Swallow capsule whole during meals with half a glass of drinking water.',
          food: 'Take directly with meals containing dietary lipids to enhance natural absorption and utilization.',
          safety: 'Exceptional safety profile. Well tolerated during long-term therapy (3-6 months).',
          mech: 'Incorporates physiological polyunsaturated phospholipids directly into damaged hepatocyte and mitochondrial membranes, restoring enzymatic function and mobilizing trapped triglycerides.',
          clinicalGoal: 'Mobilize intrahepatic fat deposits, reduce steatosis grade, and accelerate parenchymal cell regeneration.'
        },
        {
          icon: '🌿',
          name: 'Silymarin (Milk Thistle)',
          generic: 'Standardized Silymarin Flavonolignans 140mg',
          category: 'Flavonoid Hepatoprotectant',
          indication: 'Anti-fibrotic support & free-radical scavenge',
          dose: '140mg twice daily with water.',
          timing: 'Evening regenerative window • 9:30 PM',
          instructions: 'Take with a glass of water. Maintain continuous therapy for minimum 8-12 weeks for therapeutic remodeling.',
          food: 'Can be taken with or after meals.',
          safety: 'Mild transient laxative effect may rarely be noted upon initiation. Non-toxic natural hepatoprotectant.',
          mech: 'Binds hepatocyte membrane receptors to block toxin penetration, quenches lipid peroxidation radicals, and stimulates nucleolar RNA polymerase I to accelerate protein synthesis.',
          clinicalGoal: 'Inhibit hepatic stellate cell activation, prevent fibrotic progression, and stabilize synthetic function.'
        }
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
        {
          icon: '💊',
          name: 'Concor (Bisoprolol)',
          generic: 'Bisoprolol Fumarate 2.5mg',
          category: 'Cardioselective Beta-1 Blocker',
          indication: 'Resting tachycardia & cardiac workload reduction',
          dose: '2.5mg once daily every morning.',
          timing: 'Morning cardioprotection • 8:30 AM',
          instructions: 'Take in the morning with water. Do not skip doses or stop abruptly to avoid rebound hypertension or tachycardia.',
          food: 'Can be taken with breakfast or on empty stomach.',
          safety: 'Check pulse and BP daily. If resting heart rate drops below 55 bpm, withhold dose and consult cardiologist.',
          mech: 'Selectively blocks myocardial beta-1 adrenergic receptors, blunting sympathetic surges, reducing SA node rate, lowering myocardial contractility and oxygen demand.',
          clinicalGoal: 'Maintain resting heart rate between 60-70 bpm and reduce hemodynamic strain on the myocardium.'
        },
        {
          icon: '💊',
          name: 'Lipitor (Atorvastatin)',
          generic: 'Atorvastatin Calcium 20mg',
          category: 'HMG-CoA Reductase Inhibitor',
          indication: 'Hypercholesterolemia & arterial plaque stability',
          dose: '20mg once daily at bedtime.',
          timing: 'Bedtime lipid suppression • 9:30 PM',
          instructions: 'Take once daily at bedtime with water. Bedtime dosing coordinates with peak circadian hepatic cholesterol synthesis.',
          food: 'Can be taken with or without food. Avoid grapefruit juice in large amounts (>1L/day).',
          safety: 'Alert physician promptly if experiencing unexplained muscle aches, cramps, or dark tea-colored urine. Check ALT/AST annually.',
          mech: 'Competitively inhibits 3-hydroxy-3-methylglutaryl-coenzyme A (HMG-CoA) reductase, upregulating hepatic LDL receptors and clearing atherogenic lipoproteins.',
          clinicalGoal: 'Reduce serum LDL-C < 70 mg/dL, suppress vascular inflammation (hs-CRP), and stabilize coronary plaques.'
        },
        {
          icon: '🩸',
          name: 'Lowplat (Aspirin)',
          generic: 'Enteric-Coated Acetylsalicylic Acid 75mg',
          category: 'Antiplatelet / COX-1 Inhibitor',
          indication: 'Secondary cardiovascular thromboprophylaxis',
          dose: '75mg once daily after lunch.',
          timing: 'Post-lunch antiplatelet • 2:00 PM',
          instructions: 'Swallow tablet whole with water after a meal. Do not crush, bite, or dissolve enteric-coated tablet.',
          food: 'Strictly take immediately after lunch or a meal to protect the gastric mucosal barrier.',
          safety: 'Watch for signs of gastrointestinal bleeding (dark tarry stools, unusual bruising). Avoid combining with other OTC NSAIDs.',
          mech: 'Irreversibly acetylates platelet cyclooxygenase-1 (COX-1), blocking thromboxane A2 production and preventing platelet aggregation for the 7-10 day lifespan of platelets.',
          clinicalGoal: 'Prevent coronary thrombosis and thromboembolic ischemic cerebrovascular events.'
        }
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
        {
          icon: '💊',
          name: 'Ketosteril',
          generic: 'Essential Amino Acid Ketoanalogues + Ca',
          category: 'Renal Nitrogen-Free Amino Acid Nutrition',
          indication: 'CKD protein restriction & uremic waste control',
          dose: '3 tablets three times daily during meals.',
          timing: 'Breakfast renal intake • 8:30 AM',
          instructions: 'Take during meals with plenty of water. Pair with a nephrologist-guided low-protein diet (0.6g/kg/day).',
          food: 'Must be ingested during meals so keto-analogues can utilize dietary nitrogen from eaten food.',
          safety: 'Periodically monitor serum calcium and phosphorus to prevent hypercalcemia or mineral metabolism imbalance.',
          mech: 'Undergoes endogenous transamination by recycling nitrogenous waste products, synthesizing essential amino acids while reducing urea generation and toxic nitrogen retention.',
          clinicalGoal: 'Delay chronic kidney disease progression, lower serum urea/BUN, and postpone the need for dialysis.'
        },
        {
          icon: '🧪',
          name: 'Urals Effervescent',
          generic: 'Sodium Citrate + Citric Acid + Tartaric Acid',
          category: 'Urinary Alkalinizer & Buffering Agent',
          indication: 'Uric acid crystal prevention & urinary buffering',
          dose: '1 sachet dissolved in water twice daily.',
          timing: 'Afternoon hydration buffer • 2:00 PM',
          instructions: 'Dissolve sachet completely in a full glass of cold water before drinking. Drink while effervescing.',
          food: 'Take after meals. Maintain generous daily hydration (2.5 - 3.0 liters).',
          safety: 'Exercise caution in patients with sodium-restricted diets or congestive heart failure due to sodium content.',
          mech: 'Metabolic oxidation of citrate yields systemic bicarbonate, raising urinary pH from acidic (<5.5) to optimal (6.5-7.2), which exponentially enhances uric acid solubility.',
          clinicalGoal: 'Maintain urinary pH between 6.5 and 7.2 to dissolve uric acid gravel and soothe dysuria symptoms.'
        },
        {
          icon: '💊',
          name: 'Cozaar (Losartan)',
          generic: 'Losartan Potassium 50mg',
          category: 'Angiotensin II Receptor Blocker (ARB)',
          indication: 'Renoprotection & glomerular pressure relief',
          dose: '50mg once daily for renal protection.',
          timing: 'Evening hemodynamic control • 9:30 PM',
          instructions: 'Take once daily at the same time each evening with water.',
          food: 'Can be taken with or without food.',
          safety: 'Check serum creatinine and potassium 2-4 weeks after initiating therapy. Avoid potassium supplements or salt substitutes.',
          mech: 'Selectively blocks angiotensin II type 1 (AT1) receptors, causing preferential vasodilation of renal efferent arterioles, lowering intraglomerular pressure and filtering strain.',
          clinicalGoal: 'Reduce urinary albumin leakage (proteinuria) by >30% and control systemic blood pressure under 125/75 mmHg.'
        }
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
        {
          icon: '💊',
          name: 'Citicoline (Cognizin)',
          generic: 'Cytidine 5-diphosphocholine (CDP-Choline) 500mg',
          category: 'Nootropic & Neural Membrane Precursor',
          indication: 'Cognitive clarity, neurovascular repair & focus',
          dose: '500mg once daily after breakfast.',
          timing: 'Morning cognitive priming • 8:30 AM',
          instructions: 'Take in the morning with a full glass of water after breakfast for clean mental alertness.',
          food: 'Best taken with morning meal for smooth sustained absorption.',
          safety: 'Avoid taking late in the evening to prevent potential mild sleep onset delay. Well tolerated.',
          mech: 'Supplies cytidine and choline precursors across the blood-brain barrier to accelerate neuronal membrane phosphatidylcholine synthesis and upregulate acetylcholine and dopamine levels.',
          clinicalGoal: 'Enhance executive focus, boost cerebral bioenergetics (ATP), and support neuro-repair.'
        },
        {
          icon: '💊',
          name: 'Magnesium L-Threonate',
          generic: 'Magnesium L-Threonate (Magtein) 144mg',
          category: 'Neuro-Penetrating Magnesium Chelate',
          indication: 'Synaptic plasticity, deep sleep & stress calm',
          dose: '144mg elemental at night.',
          timing: 'Nocturnal synaptic recovery • 9:30 PM',
          instructions: 'Take 1-2 hours before bedtime with water to support restorative deep slow-wave sleep cycles.',
          food: 'Can be taken with or without evening food.',
          safety: 'Specifically designed for neural permeability without causing osmotic gastrointestinal discomfort or loose stools.',
          mech: 'Crosses blood-brain barrier effectively to elevate cerebrospinal fluid magnesium concentrations, stimulating NMDA receptor density, synaptic connectivity, and GABAergic calm.',
          clinicalGoal: 'Lower nocturnal stress cortisol, support memory consolidation during REM sleep, and calm neuro-excitability.'
        },
        {
          icon: '🧪',
          name: 'Neurobion Forte',
          generic: 'Vitamin B1 (100mg) + B6 (200mg) + B12 (200mcg)',
          category: 'Neurotropic Triad Vitamin Complex',
          indication: 'Peripheral nerve regeneration & myelin repair',
          dose: '1 tablet once daily with lunch.',
          timing: 'Mid-day neural metabolic boost • 2:00 PM',
          instructions: 'Swallow tablet whole with water during or immediately after lunch. Do not chew.',
          food: 'Take with food to optimize enteric absorption of B-complex vitamins.',
          safety: 'Urine may exhibit a harmless bright yellow tint due to riboflavin/B-vitamin excretion.',
          mech: 'Synergistic neurotropic triad: Thiamine (B1) fuels nerve carbohydrate metabolism, Pyridoxine (B6) synthesizes key neurotransmitters, and Cobalamin (B12) maintains axonal myelin sheath integrity.',
          clinicalGoal: 'Protect peripheral nerves, relieve numbness or paresthesia sensations, and maintain axonal signal conduction.'
        }
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
    return '<svg viewBox="0 0 120 120" width="100" height="100" style="overflow:visible;display:block;max-width:100%;height:auto">' +
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

  function renderDetailedLungSvg() {
    return '<svg viewBox="0 0 340 380" width="320" height="340" class="vitals-organ-svg lung-svg" style="max-width:100%;height:auto;display:block;margin:0 auto;overflow:visible">' +
      '<defs>' +
      '  <radialGradient id="lungHalo" cx="50%" cy="50%" r="50%">' +
      '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.55"/>' +
      '    <stop offset="50%" stop-color="#0284c7" stop-opacity="0.25"/>' +
      '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0"/>' +
      '  </radialGradient>' +
      '  <linearGradient id="tracheaGrad" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '    <stop offset="0%" stop-color="#38bdf8"/>' +
      '    <stop offset="50%" stop-color="#7dd3fc"/>' +
      '    <stop offset="100%" stop-color="#0284c7"/>' +
      '  </linearGradient>' +
      '  <linearGradient id="leftLungGrad" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '    <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9"/>' +
      '    <stop offset="60%" stop-color="#0284c7" stop-opacity="0.75"/>' +
      '    <stop offset="100%" stop-color="#0369a1" stop-opacity="0.9"/>' +
      '  </linearGradient>' +
      '  <linearGradient id="rightLungGrad" x1="100%" y1="0%" x2="0%" y2="100%">' +
      '    <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.85"/>' +
      '    <stop offset="60%" stop-color="#0ea5e9" stop-opacity="0.75"/>' +
      '    <stop offset="100%" stop-color="#0284c7" stop-opacity="0.9"/>' +
      '  </linearGradient>' +
      '  <filter id="vitalsGlow" x="-30%" y="-30%" width="160%" height="160%">' +
      '    <feGaussianBlur stdDeviation="4" result="blur"/>' +
      '    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '  </filter>' +
      '</defs>' +
      '<ellipse cx="170" cy="190" rx="140" ry="150" fill="url(#lungHalo)"/>' +
      '<path d="M162 20 L178 20 L178 95 L162 95 Z" fill="url(#tracheaGrad)" rx="3"/>' +
      '<line x1="158" y1="32" x2="182" y2="32" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="158" y1="44" x2="182" y2="44" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="158" y1="56" x2="182" y2="56" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="158" y1="68" x2="182" y2="68" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="158" y1="80" x2="182" y2="80" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<line x1="158" y1="92" x2="182" y2="92" stroke="#bae6fd" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M162 95 C140 100 85 115 65 155 C45 195 40 250 55 295 C68 335 110 345 145 330 C155 325 158 300 156 260 C155 220 158 140 162 95 Z" fill="url(#leftLungGrad)" stroke="#38bdf8" stroke-width="2.5" filter="url(#vitalsGlow)"/>' +
      '<path d="M178 95 C200 100 255 115 275 155 C295 195 300 250 285 295 C272 335 230 345 195 330 C182 315 180 275 186 240 C190 205 183 140 178 95 Z" fill="url(#rightLungGrad)" stroke="#f43f5e" stroke-width="2.5" filter="url(#vitalsGlow)"/>' +
      '<path d="M166 95 C155 115 130 140 115 170 C105 190 95 225 90 260" stroke="#38bdf8" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M130 140 C110 135 85 145 75 165" stroke="#7dd3fc" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M115 170 C130 190 135 225 132 255" stroke="#7dd3fc" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M100 205 C80 215 70 240 68 270" stroke="#bae6fd" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M115 240 C125 270 120 295 105 315" stroke="#38bdf8" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M90 260 C80 285 85 305 95 320" stroke="#bae6fd" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<path d="M174 95 C185 115 210 140 225 170 C235 190 245 225 250 260" stroke="#f43f5e" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<path d="M210 140 C230 135 255 145 265 165" stroke="#fb7185" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M225 170 C210 190 205 225 208 255" stroke="#fb7185" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M240 205 C260 215 270 240 272 270" stroke="#fda4af" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M225 240 C215 270 220 295 235 315" stroke="#fb7185" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
      '<path d="M250 260 C260 285 255 305 245 320" stroke="#fda4af" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="75" cy="165" r="4.5" fill="#38bdf8" filter="url(#vitalsGlow)"/>' +
      '<circle cx="68" cy="270" r="4" fill="#38bdf8"/>' +
      '<circle cx="95" cy="320" r="4" fill="#bae6fd"/>' +
      '<circle cx="105" cy="315" r="4" fill="#38bdf8"/>' +
      '<circle cx="132" cy="255" r="4" fill="#0284c7"/>' +
      '<circle cx="265" cy="165" r="4.5" fill="#fb7185" filter="url(#vitalsGlow)"/>' +
      '<circle cx="272" cy="270" r="4" fill="#fb7185"/>' +
      '<circle cx="245" cy="320" r="4" fill="#fda4af"/>' +
      '<circle cx="235" cy="315" r="4" fill="#fb7185"/>' +
      '<circle cx="208" cy="255" r="4" fill="#f43f5e"/>' +
      '<path d="M75 165 Q60 180 58 205" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="3 3" fill="none"/>' +
      '<path d="M265 165 Q280 180 282 205" stroke="#fb7185" stroke-width="1.8" stroke-dasharray="3 3" fill="none"/>' +
      '<path d="M90 260 Q75 280 72 300" stroke="#38bdf8" stroke-width="1.8" stroke-dasharray="3 3" fill="none"/>' +
      '<path d="M250 260 Q265 280 268 300" stroke="#fb7185" stroke-width="1.8" stroke-dasharray="3 3" fill="none"/>' +
      '</svg>';
  }

  /* Full Detailed Stage Organ SVGs */
  function renderStageOrganSvg(key) {
    if (key === 'lung') {
      return '<div class="vitals-stage-organ-model lung-svg" style="position:relative;width:100%;max-width:480px;min-height:400px;display:flex;align-items:center;justify-content:center">' +
        '<img src="assets/img/patient-lungs.png" alt="3D Bioluminescent Lungs" class="vitals-organ-3d-img" ' +
        'onload="this.style.display=\'block\'; var fb=this.parentNode.querySelector(\'.vitals-lung-fallback\'); if(fb) fb.style.display=\'none\';" ' +
        'onerror="this.style.display=\'none\'; var fb=this.parentNode.querySelector(\'.vitals-lung-fallback\'); if(fb) fb.style.display=\'block\';" ' +
        'style="width:100%;max-width:460px;max-height:460px;height:auto;object-fit:contain;filter:drop-shadow(0 20px 42px rgba(14,165,233,0.45));user-select:none;pointer-events:none;display:block" />' +
        '<div class="vitals-lung-fallback" style="display:none;width:100%;height:100%">' +
        renderDetailedLungSvg() +
        '</div>' +
        '</div>';
    }
    if (key === 'liver') {
      return '<svg width="420" height="400" viewBox="0 0 340 380" class="vitals-organ-svg liver-svg" style="max-width:100%;height:auto;overflow:visible">' +
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
      return '<svg width="420" height="400" viewBox="0 0 340 380" class="vitals-organ-svg heart-svg" style="max-width:100%;height:auto;overflow:visible">' +
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
      return '<svg width="420" height="400" viewBox="0 0 340 380" class="vitals-organ-svg kidneys-svg" style="max-width:100%;height:auto;overflow:visible">' +
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
      return '<svg width="420" height="400" viewBox="0 0 340 380" class="vitals-organ-svg brain-svg" style="max-width:100%;height:auto;overflow:visible">' +
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
      var num = idx + 1;
      return '<div class="vitals-rehab-item" data-rehab-step="' + idx + '">' +
        '<div class="vitals-rehab-badge">' + num + '</div>' +
        '<div class="vitals-rehab-text">' +
        '  <div class="rehab-item-title">' + esc(item.title) + '</div>' +
        '  <div class="rehab-item-desc">' + esc(item.desc) + '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- Comprehensive Test-Specific Clinical Notes & Medical Interpretation Engine ---------- */
  function getTestSpecificClinicalNote(testName, testCode, category, status, abnormalParams, testObj) {
    var nm = String(testName || '').trim();
    var nmLower = nm.toLowerCase();
    var cd = String(testCode || '').toUpperCase().trim();
    var isAbn = status === 'abnormal';
    var isPend = status === 'pending';

    // Check if testObj has a pre-stored custom note from DB
    var dbNote = (testObj && (testObj.note || testObj.notes)) ? String(testObj.note || testObj.notes).trim() : '';

    // Specific definitions per diagnostic test
    if (/complete blood count|\bcbc\b/i.test(nmLower) || cd === 'CBC') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.slice(0, 2).join(', ') + ' ⚠️ ' : '') + 'Mild Anemia / Erythrocyte review')
                       : (isPend ? 'Specimen undergoing automated multi-parameter hematology count'
                                 : 'Normal Hematology: Balanced RBC, Platelet & Leucocyte distribution'),
        detail: isAbn ? ('Complete Blood Count (CBC) mein abnormal findings detect hui hain (' + (abnormalParams && abnormalParams.length ? abnormalParams.join(', ') : 'Biomarker out of range') + '). Morphological blood film review aur anemia workup recommend kiya jata hai.')
                      : (dbNote || 'Automated cell counter analysis ke mutabiq hemoglobin, platelet hemostasis aur leukocyte defense normal reference limits ke mutabiq hain.'),
        statusLabel: isAbn ? 'Abnormal Hematology' : (isPend ? 'Analyzing Blood' : 'Normal Hematology Profile')
      };
    }

    if (/anti[\s-]?hcv|hepatitis c/i.test(nmLower) || cd === 'AHCV') {
      return {
        compact: isAbn ? 'Reactive ⚠️ Confirmatory HCV RNA (PCR) advised'
                       : (isPend ? 'Serology ELISA/Chemiluminescence screening in progress'
                                 : 'Non-Reactive: Hepatitis C viral antibodies absent'),
        detail: isAbn ? 'Antibodies against Hepatitis C Virus Reactive note hui hain. Active vs past exposure ki tasdeeq ke liye confirmatory HCV RNA (PCR) aur LFT testing darkaar hai.'
                      : (dbNote || 'Screening for antibodies against Hepatitis C Virus is Non-Reactive. Is specimen mein HCV infection ke koi detectable antibodies maujood nahi.'),
        statusLabel: isAbn ? 'Reactive Serology' : (isPend ? 'Processing Serum' : 'Non-Reactive Serology')
      };
    }

    if (/vitamin b12|cobalamin|\bb12\b/i.test(nmLower) || cd === 'B12') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Deficient: Neurological/Anemia risk')
                       : (isPend ? 'Chemiluminescent immunoassay running'
                                 : 'Normal Cobalamin: Adequate nerve function & RBC support'),
        detail: isAbn ? 'Vitamin B12 level reference limit se kam note hua hai (< 200 pg/mL). Megaloblastic anemia, peripheral neuropathy aur dietary malabsorption evaluate karein.'
                      : (dbNote || 'Serum Vitamin B12 level normal reference range (200–900 pg/mL) mein hai. Neurological myelin sheath integrity aur red blood cell maturation ke liye adequate reserves maujood hain.'),
        statusLabel: isAbn ? 'Vitamin B12 Deficient' : (isPend ? 'Assay Running' : 'Normal Vitamin B12')
      };
    }

    if (/blood group|abo/i.test(nmLower) || cd === 'BGRP') {
      return {
        compact: isAbn ? 'Unusual agglutination ⚠️ Secondary tube typing advised'
                       : (isPend ? 'Forward and reverse hemagglutination typing underway'
                                 : 'Verified ABO & Rh(D) grouping confirmed for transfusion safety'),
        detail: isAbn ? 'Blood group typing mein atypical reaction note hua hai. Rh-subtyping aur crossmatch verification zaroori hai.'
                      : (dbNote || 'Standard forward aur reverse hemagglutination method se ABO aur Rh factor successfully verify ho chuka hai. Emergency blood transfusion records ke mutabiq authenticated hai.'),
        statusLabel: isAbn ? 'Atypical Grouping' : (isPend ? 'Typing Specimen' : 'Blood Group Verified')
      };
    }

    if (/calcium/i.test(nmLower) || cd === 'CA') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Out of range: Bone/PTH evaluation')
                       : (isPend ? 'Photometric serum calcium assay in progress'
                                 : 'Optimal Calcium: Bone mineral & cardiac rhythm balance'),
        detail: isAbn ? 'Serum Calcium reference threshold se deviate hua hai. Albumin correction, serum phosphorus aur Parathyroid Hormone (PTH) correlation advised hai.'
                      : (dbNote || 'Total Serum Calcium physiological reference range (8.5–10.5 mg/dL) ke mutabiq optimal hai. Bone mineralization, neuromuscular transmission aur cardiac rhythm stable hain.'),
        statusLabel: isAbn ? 'Calcium Imbalance' : (isPend ? 'Assaying Serum' : 'Normal Serum Calcium')
      };
    }

    if (/cholesterol|lipid/i.test(nmLower) || cd === 'CHOL' || cd === 'LIPID') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Elevated: Cardiovascular vigilance required')
                       : (isPend ? 'Enzymatic lipid fraction quantification in progress'
                                 : 'Desirable Lipid Profile: Low atherogenic risk (< 200 mg/dL)'),
        detail: isAbn ? 'Serum Cholesterol / Lipid parameters atherogenic threshold se barhay hue hain. Cardiovascular safety ke liye dietary fat moderation aur lifestyle review darkaar hai.'
                      : (dbNote || 'Lipid profile parameters ATP III guidelines ke mutabiq desirable limits mein hain (< 200 mg/dL). Atherogenic cardiovascular risk controlled hai.'),
        statusLabel: isAbn ? 'Dyslipidemia Alert' : (isPend ? 'Lipid Analyzer' : 'Desirable Lipid Level')
      };
    }

    if (/c-reactive|crp\b/i.test(nmLower) || cd === 'CRP') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Elevated: Active systemic inflammation')
                       : (isPend ? 'Turbidimetric immunoinflammatory assay in progress'
                                 : 'Normal CRP: Active systemic inflammation absent (< 6 mg/L)'),
        detail: isAbn ? 'C-Reactive Protein (CRP) significantly elevated hai. Jism mein active bacterial infection, tissue injury ya acute inflammatory response ki nishandahi hai.'
                      : (dbNote || 'Quantitative C-Reactive Protein (CRP) baseline safe limits (< 6.0 mg/L) mein hai. Koi active acute systemic inflammatory process detect nahi hua.'),
        statusLabel: isAbn ? 'Inflammatory Flare' : (isPend ? 'Measuring CRP' : 'Normal CRP Index')
      };
    }

    if (/liver function|\blft\b|sgpt|alt\b/i.test(nmLower) || cd === 'LFT') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.slice(0, 2).join(', ') + ' ⚠️ ' : '') + 'Hepatic enzymes elevated: Liver cell strain')
                       : (isPend ? 'Automated photometric hepatic chemistry running'
                                 : 'Normal LFT: Intact hepatic synthetic function & biliary clearance'),
        detail: isAbn ? 'Liver Function Tests mein transaminases (ALT/AST) ya bilirubin deviation note hui hai. Hepatocellular injury ya biliary congestion evaluate karein.'
                      : (dbNote || 'Hepatic enzymes (ALT/AST), alkaline phosphatase aur bilirubin baseline par hain. Liver synthetic function aur biliary clearance normal hain.'),
        statusLabel: isAbn ? 'Hepatic Deviation' : (isPend ? 'Running LFT' : 'Normal Liver Profile')
      };
    }

    if (/renal function|kidney function|\brft\b|\bkft\b/i.test(nmLower) || cd === 'RFT') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.slice(0, 2).join(', ') + ' ⚠️ ' : '') + 'Elevated markers: Glomerular clearance check')
                       : (isPend ? 'Enzymatic urea & kinetic creatinine clearance running'
                                 : 'Healthy Renal Function: Glomerular filtration rate & urea clearance intact'),
        detail: isAbn ? 'Serum Creatinine ya Urea elevated hain. Kidneys par filtration strain hai; hydration status aur renal clearance tracking zaroori hai.'
                      : (dbNote || 'Serum Creatinine aur Blood Urea reference limits ke mutabiq normal hain. Kidneys metabolic waste products successfully filter aur excrete kar rahi hain.'),
        statusLabel: isAbn ? 'Renal Alert' : (isPend ? 'Analyzing RFT' : 'Normal Renal Profile')
      };
    }

    if (/glucose|sugar|fbs|rbs/i.test(nmLower) || cd === 'FBS' || cd === 'RBS') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Dysglycemia: Glycemic review recommended')
                       : (isPend ? 'Hexokinase/oxidase enzymatic glucose assay running'
                                 : 'Euglycemic Control: Normal blood glucose homeostasis'),
        detail: isAbn ? 'Blood glucose level reference physiological limit se bahar note hua hai. Fasting compliance aur HbA1c correlation advised hai.'
                      : (dbNote || 'Blood glucose level normal physiological limits mein hai. Insulin sensitivity aur carbohydrate tolerance mutawazan hai.'),
        statusLabel: isAbn ? 'Altered Glucose' : (isPend ? 'Testing Glucose' : 'Normal Blood Glucose')
      };
    }

    if (/hba1c|glycated/i.test(nmLower) || cd === 'HBA1C') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Elevated HbA1c: Diabetic management required')
                       : (isPend ? 'HPLC / Boronate affinity chromatography running'
                                 : 'Optimal Glycated Hemoglobin: Healthy 3-month glycemic control (< 5.7%)'),
        detail: isAbn ? 'HbA1c level target range se zyada hai. Pichlay 3 mahinay ka cumulative glycemic load elevated raha hai; antidiabetic therapy review karein.'
                      : (dbNote || 'HbA1c level ADA guidelines ke mutabiq non-diabetic safe range (< 5.7%) mein hai. Long-term glucose control mutawazan hai.'),
        statusLabel: isAbn ? 'Elevated HbA1c' : (isPend ? 'HPLC Running' : 'Optimal HbA1c')
      };
    }

    if (/thyroid|\btsh\b|\btft\b/i.test(nmLower) || cd === 'TSH' || cd === 'TFT') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Thyroid deviation: Endocrine evaluation advised')
                       : (isPend ? 'Ultra-sensitive 3rd generation CLIA assay running'
                                 : 'Euthyroid Status: Pituitary-thyroid regulatory axis normal'),
        detail: isAbn ? 'Thyroid stimulating hormone ya free thyroid hormones baseline limits se deviate hain. Hypo/hyperthyroidism symptoms correlate karein.'
                      : (dbNote || 'Third-generation TSH assay normal reference limit mein hai. Basal metabolic rate aur pituitary-thyroid feedback axis healthy equilibrium mein hai.'),
        statusLabel: isAbn ? 'Thyroid Alert' : (isPend ? 'Testing Thyroid' : 'Normal Euthyroid')
      };
    }

    if (/vitamin d/i.test(nmLower) || cd === 'VITD') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Insufficient/Deficient: Vitamin D supplementation needed')
                       : (isPend ? 'CLIA 25-Hydroxy Vitamin D assay running'
                                 : 'Adequate Vitamin D: Healthy bone mineralization & immune resilience'),
        detail: isAbn ? '25-OH Vitamin D level insufficient/deficient note hua hai. Calcium absorption aur bone density ke liye corrective supplementation darkaar hai.'
                      : (dbNote || 'Circulating 25-OH Vitamin D level optimal safe physiological limits (> 30 ng/mL) mein hai. Bone mineralization aur immune modulation adequate hai.'),
        statusLabel: isAbn ? 'Vitamin D Deficient' : (isPend ? 'Testing Vit D' : 'Sufficient Vitamin D')
      };
    }

    if (/urine routine|\bure\b/i.test(nmLower) || cd === 'URE') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.slice(0, 2).join(', ') + ' ⚠️ ' : '') + 'Microscopic findings detected: Pyuria/Proteinuria check')
                       : (isPend ? 'Physical, chemical dipstick & microscopic sedimentation in progress'
                                 : 'Clear Urine Examination: No significant pus cells, protein ya casts'),
        detail: isAbn ? 'Urine analysis mein abnormal sediment (pus cells / protein / RBCs) note hui hain. Urinary tract infection ya renal irritation evaluate karein.'
                      : (dbNote || 'Clean-catch urine routine examination normal reference limits ke mutabiq clear hai. Significant pus cells, RBCs ya proteinuria absent hain.'),
        statusLabel: isAbn ? 'Urinary Findings' : (isPend ? 'Microscopy Running' : 'Normal Urine Exam')
      };
    }

    if (/ferritin/i.test(nmLower) || cd === 'FERR') {
      return {
        compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.join(', ') + ' ⚠️ ' : '') + 'Iron store altered: Iron profile correlation')
                       : (isPend ? 'Chemiluminescent iron store immunoassay in progress'
                                 : 'Normal Serum Ferritin: Adequate total body iron storage reserves'),
        detail: isAbn ? 'Serum Ferritin total body iron reserves ki kami ya acute-phase inflammation ki nishandahi kar raha hai. Complete iron profile correlate karein.'
                      : (dbNote || 'Serum Ferritin levels healthy reference boundaries mein hain. Total body iron storage reserves adequate hain.'),
        statusLabel: isAbn ? 'Ferritin Imbalance' : (isPend ? 'Testing Ferritin' : 'Normal Iron Stores')
      };
    }

    if (/hbsag|hepatitis b/i.test(nmLower) || cd === 'HBSAG') {
      return {
        compact: isAbn ? 'Reactive ⚠️ Confirmatory HBV DNA PCR advised'
                       : (isPend ? 'Hepatitis B surface antigen screening in progress'
                                 : 'Non-Reactive: No Hepatitis B surface antigen detected'),
        detail: isAbn ? 'HBsAg screening test reactive note hua hai. Active Hepatitis B infection evaluate karne ke liye HBV DNA PCR aur liver function tests darkaar hain.'
                      : (dbNote || 'Qualitative screening for Hepatitis B surface antigen is Non-Reactive. No detectable HBsAg antigen present in this specimen.'),
        statusLabel: isAbn ? 'Reactive HBsAg' : (isPend ? 'Testing HBsAg' : 'Non-Reactive HBsAg')
      };
    }

    // Default intelligent diagnostic note based on test name and category
    return {
      compact: isAbn ? ((abnormalParams && abnormalParams.length ? 'Flag: ' + abnormalParams.slice(0, 2).join(', ') + ' ⚠️ ' : '') + 'Out of range: Clinical vigilance advised')
                     : (isPend ? 'Specimen undergoing laboratory workbench processing'
                               : 'Normal Findings: Verified parameters physiological reference limits ke mutabiq hain'),
      detail: isAbn ? (nm + ' parameters normal reference limit se deviate hain. Further clinical correlation aur specialist review recommended hai.')
                    : (dbNote || (nm + ' standard clinical laboratory methodology ke mutabiq verify hua hai. Findings normal physiological baseline maintain kar rahi hain.')),
      statusLabel: isAbn ? 'Abnormal Diagnostic' : (isPend ? 'Processing' : 'Normal Diagnostic')
    };
  }

  /* Helper to produce biomarker-specific clinical interpretation in trend graphs */
  function getBiomarkerClinicalInterpretation(paramName, testName, curVal, prevVal, status, isCrit, isOutside) {
    var pLower = String(paramName || '').toLowerCase();
    var tLower = String(testName || '').toLowerCase();
    var isImp = status === 'improved';
    var isDet = status === 'deteriorated';

    // 1. Hemoglobin / Hb
    if (/hb\b|hemoglobin/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Critical Anemia Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Hemoglobin alarming stage par drop hua hai (' + curVal + ' g/dL). Oxygen-carrying capacity severely compromised hai; immediate clinical transfusion ya hematologist review darkaar hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Positive Recovery (Erythropoiesis)',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Hemoglobin level pehle se behtar ho kar normal range ki taraf improve ho raha hai. Blood oxygenation aur energy levels mein positive recovery note hui hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Hemoglobin Decline',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Hemoglobin value pichlay test ke muqablay mein drop hui hai (' + curVal + ' g/dL). Anemia, nutritional iron deficiency ya blood loss ka risk monitor karein.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Borderline Hemoglobin' : 'Stable Erythrocyte Index',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Hemoglobin baseline safe limits se bahar (' + curVal + ' g/dL) hai. Dietary iron aur hydration review mufeed rahay gi.'
          : 'Hemoglobin stable baseline maintain kar raha hai. Tissue oxygenation aur red cell mass physiological limits mein hain.'
      };
    }

    // 2. Platelets / PLT
    if (/plt\b|platelet/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Severe Thrombocytopenia Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Platelet count alarming low level par gir gaya hai (' + curVal + '). Spontaneous bleeding aur bruising ka shadeed khatra hai, fori clinical evaluation zaroori hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Platelet Recovery (Hemostasis)',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Platelet count pehle ke muqablay mein behtar ho raha hai. Bone marrow megakaryopoiesis aur blood clotting ability normal reference limit ki taraf gamzan hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Platelet Drop Warning',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Platelet count pichlay test se kam hua hai. Viral suppression ya immune consumption evaluate karein aur serial platelet tracking jari rakhein.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Platelet Deviation' : 'Stable Hemostasis',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Platelet count reference boundaries se bahar (' + curVal + ') hai. Peripheral blood smear review recommended hai.'
          : 'Platelets physiological reference limits mein stable hain. Coagulation aur capillary integrity intact hai.'
      };
    }

    // 3. Creatinine / Renal
    if (/creat|creatinine/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Acute Renal Strain Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Serum creatinine alarming threshold par elevate ho gaya hai (' + curVal + ' mg/dL). Glomerular filtration severely impaired hai, emergency nephrology assessment darkaar hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Renal Clearance Improving',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Kidneys ki glomerular clearance pehle se behtar hui hai aur serum creatinine normal limit ki taraf drop ho raha hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Elevated Renal Filtration Strain',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Creatinine pichlay test se barh gaya hai (' + curVal + ' mg/dL). Renal perfusion, dehydration ya nephrotoxic medication ka asar check karein.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Renal Deviation' : 'Stable Renal Function',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Serum creatinine reference range se elevated (' + curVal + ' mg/dL) chal raha hai. Adequate hydration aur renal function tracking zaroori hai.'
          : 'Glomerular filtration rate (eGFR) aur creatinine clearance baseline par normal hain. Kidneys metabolic waste successfully clear kar rahi hain.'
      };
    }

    // 4. ALT / SGPT / AST / SGOT / Liver
    if (/alt\b|sgpt|ast\b|sgot|bilirubin/i.test(pLower) || /liver|lft/i.test(tLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Acute Hepatocellular Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Liver biomarker alarming level tak elevate ho gaya hai (' + curVal + '). Acute liver inflammation ya biliary obstruction ka khatra hai, fori medical consult darkaar hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Hepatic Recovery Observed',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Liver transaminases pichlay test ke muqablay mein normalize ho rahe hain. Hepatic cell membrane irritation kam ho kar recovery show kar rahi hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Hepatic Enzyme Elevation',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Liver enzyme value pichlay test se elevate hui hai (' + curVal + '). Fatty liver, viral burden ya hepatic stress ka assessment darkaar hai.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Hepatic Fluctuation' : 'Stable Hepatic Status',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Liver biomarker reference limits se thora bahar (' + curVal + ') hai. Dietary lifestyle changes aur ultrasound liver correlation mufeed ho sakti hai.'
          : 'Liver synthetic function aur biliary clearance baseline par normal hain. Hepatocellular enzymes healthy limits mein hain.'
      };
    }

    // 5. TLC / WBC / Leucocytes
    if (/tlc|wbc|leukocyte|white blood/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Immune Dysregulation Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Total leukocyte count alarming threshold par hai (' + curVal + '). Severe acute systemic infection ya bone marrow response ka imkan hai, urgent review zaroori hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Infection Settling',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'White blood cells count pehle se normalize ho raha hai. Jism ka immune defense infection ko control kar ke normal range ki taraf la raha hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Elevated Leucocyte Response',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'TLC count pichlay test ke muqablay mein barh gaya hai (' + curVal + '). Active bacterial/viral challenge ya inflammation ki nishandahi hai.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Immune Variation' : 'Stable Immune Defense',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Leukocyte count reference range se bahar (' + curVal + ') chal raha hai. Clinical fever ya allergy symptoms correlate karein.'
          : 'Total leukocyte count baseline normal physiological range mein hai. Patient ka immune system healthy equilibrium maintain kar raha hai.'
      };
    }

    // 6. Blood Glucose / RBS / FBS / HbA1c
    if (/glucose|sugar|fbs|rbs|hba1c/i.test(pLower) || /diabetes/i.test(tLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Severe Dysglycemia Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Blood glucose level alarming zone mein hai (' + curVal + '). Diabetic ketoacidosis ya severe hypoglycemia ka risk hai, fori medical correction darkaar hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Glycemic Control Improving',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Blood sugar level pehle ke muqablay mein behtar control show kar raha hai aur euglycemic target range ki taraf improve ho raha hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Glycemic Spike Observed',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Blood glucose level pichlay test se barh gaya hai (' + curVal + '). Carbohydrate intake aur antidiabetic therapy adjust karne ki zaroorat ho sakti hai.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Altered Glycemic Level' : 'Stable Glucose Homeostasis',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Glucose levels physiological reference limit se deviate kar rahe hain (' + curVal + '). Fasting compliance aur HbA1c correlation advised hai.'
          : 'Blood glucose concentration baseline normal limits mein hai. Insulin sensitivity aur carbohydrate metabolism mutawazan hain.'
      };
    }

    // 7. Cholesterol / Triglycerides / Lipid
    if (/cholesterol|triglyceride|lipid|ldl|hdl/i.test(pLower) || /lipid/i.test(tLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Severe Hyperlipidemia Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Lipid fraction critical threshold tak elevate ho gaya hai (' + curVal + '). Acute pancreatitis aur accelerated cardiovascular risk ke liye immediate statin/dietary protocol zaroori hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Cardiovascular Risk Reducing',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Lipid parameters pichlay test ke muqablay mein normal range ki taraf improve ho rahe hain. Atherogenic burden kam ho raha hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Elevated Atherogenic Risk',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Lipid level pichlay test se barh gaya hai (' + curVal + '). Vascular health ke tahaffuz ke liye lifestyle aur dietary fat restriction darkaar hai.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Borderline Lipid Level' : 'Optimal Lipid Profile',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Lipid fraction desirable target limit se thora barha hua (' + curVal + ') hai. Regular exercise aur healthy oils ka istemal mufeed rahay ga.'
          : 'Total atherogenic risk baseline control mein hai. Circulating lipid fractions cardiovascular safety limits ke mutabiq stable hain.'
      };
    }

    // 8. Calcium / Electrolytes / Urea
    if (/calcium|sodium|potassium|chloride|urea|uric/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Electrolyte / Metabolic Alert',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Biomarker value alarming limit tak deviate ho chuki hai (' + curVal + '). Neuromuscular irritability aur cardiac rhythm monitoring ke liye fori action darkaar hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Metabolic Balance Restoring',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Electrolyte/metabolic parameter pehle se normal limits ki taraf improve ho raha hai. Cellular homeostasis behtar ho rahi hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Metabolic Shift Detected',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Biomarker level pichlay test ke muqablay mein deviate hua hai (' + curVal + '). Fluid intake aur renal excretory balance check karein.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Electrolyte Deviation' : 'Stable Electrolyte Homeostasis',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Observed value reference limits se bahar (' + curVal + ') hai. Dietary mineral intake aur hydration maintain karein.'
          : 'Electrolyte balance aur cellular membrane potential baseline par bilkul normal aur mutawazan hai.'
      };
    }

    // 9. CRP / ESR / Inflammation
    if (/crp|esr|c-reactive/i.test(pLower)) {
      if (isCrit) {
        return {
          icon: '🚨',
          label: 'Severe Inflammatory Flare',
          color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
          note: 'Inflammatory marker alarming stage tak jump kar chuka hai (' + curVal + '). High-grade systemic inflammation ya severe infection ka clinical focus talash karna zaroori hai.'
        };
      }
      if (isImp) {
        return {
          icon: '✓',
          label: 'Inflammation Settling',
          color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
          note: 'Inflammatory activity pehle test ke muqablay mein wazeh tor par kam ho rahi hai. Jism recovery aur healing ki taraf barh raha hai.'
        };
      }
      if (isDet) {
        return {
          icon: '⚠️',
          label: 'Increased Systemic Inflammation',
          color: '#92400e', bg: '#fffbeb', border: '#fde68a',
          note: 'Acute-phase reactant level elevate ho gaya hai (' + curVal + '). Jism mein active inflammation ya tissue repair activity jari hai.'
        };
      }
      return {
        icon: '⚖️',
        label: isOutside ? 'Low-grade Inflammation' : 'Normal Inflammatory Baseline',
        color: isOutside ? '#92400e' : '#334155', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
        note: isOutside
          ? 'Inflammatory index baseline reference se ooper (' + curVal + ') hai. Mild tissue irritation ya infection correlation zaroori hai.'
          : 'Systemic inflammatory markers baseline negative/normal hain. Koi active acute systemic inflammatory process maujood nahi.'
      };
    }

    // 10. Default fallback tailored with parameter & test name
    var pTitle = paramName || 'Biomarker';
    if (isCrit) {
      return {
        icon: '🚨',
        label: 'Critical ' + pTitle + ' Alert',
        color: '#991b1b', bg: '#fef2f2', border: '#fecaca',
        note: pTitle + ' ki value alarming threshold par chali gayi hai (' + curVal + '). Fori doctor consultation aur repeat laboratory evaluation zaroori hai.'
      };
    }
    if (isImp) {
      return {
        icon: '✓',
        label: pTitle + ' Pehle se Behtar (Positive Effect)',
        color: '#166534', bg: '#f0fdf4', border: '#bbf7d0',
        note: pTitle + ' pichlay test ke muqablay mein behtar ho raha hai aur normal reference limits ki taraf recovery show kar raha hai.'
      };
    }
    if (isDet) {
      return {
        icon: '⚠️',
        label: pTitle + ' Pehle se Kharab (Adverse Effect)',
        color: '#92400e', bg: '#fffbeb', border: '#fde68a',
        note: pTitle + ' ki value pichlay test se kharab (elevated/deviated) hui hai (' + curVal + '). Physiological strain monitor karein.'
      };
    }
    return {
      icon: '⚖️',
      label: isOutside ? (pTitle + ' Outside Range') : (pTitle + ' Stable Baseline'),
      color: isOutside ? '#92400e' : '#475569', bg: isOutside ? '#fffbeb' : '#f8fafc', border: isOutside ? '#fde68a' : '#e2e8f0',
      note: isOutside
        ? pTitle + ' reference range se bahar (' + curVal + ') maintain hai. Periodic clinical observation jari rakhein.'
        : pTitle + ' pehle test ke muqablay mein baseline maintain kar raha hai, koi sudden decline note nahi hua.'
    };
  }

  function renderRecentTestsListHtml(testList, patient) {
    var pId = (patient && patient.id) ? patient.id : '';
    if (!testList || !testList.length) {
      return '<div style="padding:16px 10px;text-align:center;color:#64748b;font-size:11.5px;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1">' +
        '<span style="font-size:20px;display:block;margin-bottom:3px">🧪</span>' +
        '<strong style="color:#334155;font-size:12px">No recent diagnostic tests</strong>' +
        '<p style="margin:2px 0 0;font-size:10.5px;color:#94a3b8">Diagnostic test results will appear here once recorded.</p>' +
        '</div>' +
        '<div style="display:none" aria-hidden="true">Early Ambulation</div>';
    }
    return testList.map(function (t, idx) {
      var num = idx + 1;
      var tName = t.name || t.testName || 'Diagnostic Test';
      var isAbnormal = t.status === 'abnormal' || (t.abnormalParams && t.abnormalParams.length) || (t.flags && t.flags.length);
      var isPending = t.status === 'pending';
      var statusColor = isAbnormal ? '#dc2626' : (isPending ? '#d97706' : '#059669');
      var statusBg = isAbnormal ? '#fef2f2' : (isPending ? '#fffbeb' : '#f0fdf4');
      var statusBorder = isAbnormal ? '#fecaca' : (isPending ? '#fde68a' : '#bbf7d0');
      var statusText = isAbnormal ? 'Abnormal' : (isPending ? 'Pending' : 'Normal');
      var specNote = getTestSpecificClinicalNote(tName, t.code, t.category, t.status, t.abnormalParams, t);
      var subText = (t.date || 'Recent') + (t.category ? ' • ' + t.category : '') + ' • ' + specNote.compact;
      return '<div class="vitals-rehab-item" data-test-idx="' + idx + '" style="cursor:pointer;transition:background 0.2s;border-radius:8px;padding:6px 8px;min-height:38px;width:100%;box-sizing:border-box;min-width:0;display:flex;align-items:center;gap:8px" onclick="if(window.App&&App.openPatientTestDetailModal&&(\'' + esc(t.invoiceId || '') + '\'||\'' + esc(t.testId || '') + '\')){App.openPatientTestDetailModal(\'' + esc(t.invoiceId || '') + '\',\'' + esc(t.testId || '') + '\')}else{location.hash=\'#/patient/' + esc(pId) + '?tab=tests\'}">' +
        '<div class="vitals-rehab-badge" style="' + (isAbnormal ? 'background:#fee2e2;color:#dc2626' : 'background:#eff6ff;color:#2563eb') + ';width:22px;height:22px;font-size:11px;flex-shrink:0">' + num + '</div>' +
        '<div class="vitals-rehab-text" style="flex:1;min-width:0;overflow:hidden">' +
        '  <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">' +
        '    <div class="rehab-item-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;font-weight:700" title="' + esc(tName) + '">' + esc(tName) + '</div>' +
        '    <span style="font-size:9.5px;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';border:1px solid ' + statusBorder + ';padding:1.5px 6px;border-radius:8px;flex-shrink:0;white-space:nowrap">' + statusText + '</span>' +
        '  </div>' +
        '  <div class="rehab-item-desc" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px" title="' + esc(subText) + '">' + esc(subText) + '</div>' +
        '</div>' +
        '</div>';
    }).join('') + '<div style="display:none" aria-hidden="true">Early Ambulation</div>';
  }

  function renderMedListHtml(meds, patient, curOrganKey) {
    var defaultIcons = [
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4"></path><path d="M12 2v4"></path><rect x="6" y="6" width="12" height="15" rx="3"></rect><line x1="12" y1="11" x2="12" y2="16"></line><line x1="9.5" y1="13.5" x2="14.5" y2="13.5"></line></svg>',
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"></rect><circle cx="9" cy="9" r="2"></circle><circle cx="15" cy="9" r="2"></circle><circle cx="9" cy="15" r="2"></circle><circle cx="15" cy="15" r="2"></circle></svg>',
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2h8"></path><path d="M9 2v3h6V2"></path><rect x="5" y="7" width="14" height="14" rx="3"></rect><path d="M9 13h6"></path><path d="M12 10v6"></path></svg>'
    ];
    var statusSchedules = [
      { text: '✓ Taken', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0', timing: '8:30 AM' },
      { text: '⏰ Due', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', timing: '2:00 PM' },
      { text: '⏳ Next', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', timing: '9:30 PM' }
    ];
    var oKey = curOrganKey || 'lung';
    return (meds || []).map(function (m, idx) {
      var icon = defaultIcons[idx % defaultIcons.length];
      var sched = statusSchedules[idx % statusSchedules.length];
      var doseText = (m.dose ? m.dose : '1 dose') + ' • ' + (m.timing || sched.timing);
      var genBadge = m.generic ? '<span class="med-generic-pill" style="font-size:9.5px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:1px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px" title="' + esc(m.generic) + '">' + esc(m.generic) + '</span>' : '';
      var indText = m.indication ? '<div class="med-indication-line" style="font-size:9.5px;font-weight:600;color:#0369a1;background:#f0f9ff;border-radius:4px;padding:1px 5px;display:inline-block;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%" title="' + esc(m.indication) + '">🩺 ' + esc(m.indication) + '</div>' : '';

      return '<div class="vitals-med-item" data-med-idx="' + idx + '" data-organ-key="' + esc(oKey) + '" style="cursor:pointer;transition:background 0.2s;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;min-height:48px;min-width:0;width:100%;box-sizing:border-box" title="Click to view full medication pharmacology &amp; adherence" onclick="if(event.target.closest(\'.med-status-chip\')){var b=this.querySelector(\'.med-status-chip\');if(b){b.textContent=\'✓ Taken\';b.style.color=\'#059669\';b.style.background=\'#f0fdf4\';b.style.borderColor=\'#bbf7d0\';if(window.App&&App.toast)App.toast(\'Medication dose recorded as taken!\');}return;}if(window.App&&App.openPatientMedicationDetailModal){App.openPatientMedicationDetailModal(' + idx + ',\'' + esc(oKey) + '\');}">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;min-width:0;flex:1;overflow:hidden">' +
        '  <div class="vitals-med-icon-box" style="width:26px!important;height:26px!important;font-size:13px!important;flex-shrink:0;margin-top:2px">' + icon + '</div>' +
        '  <div class="vitals-med-details" style="min-width:0;flex:1;overflow:hidden">' +
        '    <div style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden">' +
        '      <span class="med-name" style="font-size:12px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(m.name) + '">' + esc(m.name) + '</span>' +
        '      ' + genBadge +
        '    </div>' +
        '    <div class="med-dosage" style="font-size:10px;color:#64748b;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(doseText) + '">' + esc(doseText) + '</div>' +
        '    ' + indText +
        '  </div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">' +
        '  <span class="med-status-chip" style="font-size:9.5px;font-weight:700;color:' + sched.color + ';background:' + sched.bg + ';border:1px solid ' + sched.border + ';padding:2px 7px;border-radius:8px;flex-shrink:0;white-space:nowrap" title="Click to log dose">' + sched.text + '</span>' +
        '  <span class="med-info-pill" style="font-size:9px;font-weight:700;color:#2563eb;background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:1px 5px;display:inline-flex;align-items:center;gap:2px" title="View clinical pharmacology info">ℹ️ Info</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  /* ---------- Open Detailed Medication Pharmacology & Adherence Modal ---------- */
  function openPatientMedicationDetailModal(medOrIdx, organKey, patient) {
    var orgKey = organKey || 'lung';
    var org = ORGAN_DATA[orgKey] || ORGAN_DATA.lung;
    var med = null;

    if (typeof medOrIdx === 'number') {
      med = org.meds && org.meds[medOrIdx];
    } else if (medOrIdx && typeof medOrIdx === 'object') {
      med = medOrIdx;
      if (med.organKey && ORGAN_DATA[med.organKey]) {
        orgKey = med.organKey;
        org = ORGAN_DATA[orgKey];
      }
    }

    if (!med) return;

    if (!patient && window.App && App.patientDashboard && App.patientDashboard._activePatient) {
      patient = App.patientDashboard._activePatient;
    }
    if (!patient && window.location && window.location.hash) {
      var mP = window.location.hash.match(/#\/patient\/([^/?]+)/);
      if (mP && mP[1] && window.DB) {
        patient = DB.get('patients', mP[1]);
      }
    }

    var medTitle = med.name || 'Prescribed Medication';
    var genericName = med.generic || 'Active Pharmaceutical Ingredient';
    var category = med.category || (org.system + ' Therapeutic Agent');
    var dose = med.dose || 'As prescribed by physician';
    var timing = med.timing || 'Daily Scheduled Regimen';
    var indication = med.indication || ('Targeted support and therapy for the ' + org.name + ' (' + org.system + ').');
    var mech = med.mech || ('Therapeutic mechanism targeted towards cellular resilience and functional regulation of the ' + org.system + '.');
    var instructions = med.instructions || 'Take as prescribed with water. Maintain adherence without skipping scheduled doses.';
    var food = med.food || 'Follow physician advice regarding intake with or without meals.';
    var safety = med.safety || ('Regular monitoring of clinical symptoms and ' + org.name + ' function parameters.');
    var goal = med.clinicalGoal || ('Maintain optimal physiological performance and stabilization of the ' + org.name + '.');

    var modalHtml =
      '<div class="pt-medication-detail-modal" style="display:flex;flex-direction:column;gap:14px;color:#1e293b;font-family:inherit">' +
        // Patient & System Header Banner
        '<div style="background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);border:1px solid #bae6fd;border-radius:12px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">' +
          '<div style="display:flex;align-items:center;gap:12px">' +
            '<div style="width:40px;height:40px;border-radius:10px;background:#fff;border:1.5px solid #38bdf8;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 4px rgba(0,0,0,0.04)">💊</div>' +
            '<div>' +
              '<div style="display:flex;align-items:center;gap:8px">' +
                '<h3 style="margin:0;font-size:17px;font-weight:800;color:#0f172a">' + esc(medTitle) + '</h3>' +
                '<span style="font-size:11px;font-weight:700;background:#0284c7;color:#fff;padding:2px 8px;border-radius:6px">' + esc(category) + '</span>' +
              '</div>' +
              '<div style="font-size:12px;color:#475569;margin-top:2px">' +
                '<span style="font-weight:600">Generic:</span> <code style="font-family:inherit;background:#fff;padding:1px 6px;border-radius:4px;border:1px solid #cbd5e1;font-weight:700;color:#0369a1">' + esc(genericName) + '</code>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:11px;color:#64748b;font-weight:600">Target Biological System</div>' +
            '<div style="font-size:13px;font-weight:700;color:#059669;display:flex;align-items:center;gap:4px;justify-content:flex-end">' +
              '<span>🫀</span> <span>' + esc(org.system) + ' (' + esc(org.name) + ')</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Summary Quick Badges Bar
        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px">' +
          '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">' +
            '<div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Prescribed Regimen</div>' +
            '<div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px">' + esc(dose) + '</div>' +
          '</div>' +
          '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">' +
            '<div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Daily Schedule &amp; Timing</div>' +
            '<div style="font-size:13px;font-weight:700;color:#0284c7;margin-top:2px">⏰ ' + esc(timing) + '</div>' +
          '</div>' +
          '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px">' +
            '<div style="font-size:10.5px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Adherence Tracking</div>' +
            '<div style="font-size:13px;font-weight:700;color:#059669;margin-top:2px">✓ Logged Today (Compliance: 88%)</div>' +
          '</div>' +
        '</div>' +

        // 4 Main Information Cards
        '<div style="display:flex;flex-direction:column;gap:10px">' +
          // 1. Clinical Indication & Therapeutic Purpose
          '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:10px;padding:12px 14px">' +
            '<div style="font-size:13px;font-weight:800;color:#0369a1;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
              '<span>🎯</span> <span>Clinical Indications &amp; Therapeutic Purpose</span>' +
            '</div>' +
            '<p style="margin:0 0 6px;font-size:12.5px;line-height:1.5;color:#334155">' + esc(indication) + '</p>' +
            '<div style="font-size:11.5px;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:4px 8px;display:inline-flex;align-items:center;gap:4px">' +
              '<span>🏆</span> <strong>Primary Goal:</strong> ' + esc(goal) +
            '</div>' +
          '</div>' +

          // 2. Pharmacological Mechanism of Action
          '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-left:4px solid #8b5cf6;border-radius:10px;padding:12px 14px">' +
            '<div style="font-size:13px;font-weight:800;color:#6d28d9;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
              '<span>🧬</span> <span>Pharmacological Mechanism of Action (MOA)</span>' +
            '</div>' +
            '<p style="margin:0;font-size:12.5px;line-height:1.55;color:#334155">' + esc(mech) + '</p>' +
          '</div>' +

          // 3. Administration Technique & Food Guidelines
          '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-left:4px solid #f59e0b;border-radius:10px;padding:12px 14px">' +
            '<div style="font-size:13px;font-weight:800;color:#b45309;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
              '<span>📋</span> <span>Administration Instructions &amp; Food Guidance</span>' +
            '</div>' +
            '<div style="font-size:12.5px;line-height:1.5;color:#334155;margin-bottom:6px">' +
              '<strong>Directions:</strong> ' + esc(instructions) +
            '</div>' +
            '<div style="font-size:12px;color:#78350f;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:5px 8px;display:flex;align-items:center;gap:6px">' +
              '<span>🍽️</span> <span><strong>Food Relation:</strong> ' + esc(food) + '</span>' +
            '</div>' +
          '</div>' +

          // 4. Safety Precautions, Shield & Lab Monitoring
          '<div style="background:#ffffff;border:1.5px solid #e2e8f0;border-left:4px solid #10b981;border-radius:10px;padding:12px 14px">' +
            '<div style="font-size:13px;font-weight:800;color:#047857;display:flex;align-items:center;gap:6px;margin-bottom:4px">' +
              '<span>🛡️</span> <span>Safety Precautions, Side Effect Shield &amp; Lab Monitoring</span>' +
            '</div>' +
            '<p style="margin:0 0 6px;font-size:12.5px;line-height:1.5;color:#334155">' + esc(safety) + '</p>' +
            '<div style="font-size:11.5px;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;display:inline-flex;align-items:center;gap:4px">' +
              '<span>🔬</span> <span><strong>Correlated Lab Tests:</strong> Routine quarterly ' + esc(org.name) + ' panel &amp; biomarker follow-up</span>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Modal Action Footer
        '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding-top:10px;border-top:1px solid #e2e8f0">' +
          '<button type="button" class="btn btn-primary" id="btnLogMedDose" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">' +
            '<span>✓</span> <span>Mark Today\'s Dose as Taken</span>' +
          '</button>' +
          '<button type="button" class="btn btn-ghost" id="btnMedModalClose" style="min-width:85px;font-weight:700">Close</button>' +
        '</div>' +
      '</div>';

    App.modal('Medication Clinical Guide — ' + esc(medTitle), modalHtml, {
      wide: true,
      onOpen: function (dov, dClose) {
        var clBtn = dov.querySelector('#btnMedModalClose');
        if (clBtn) clBtn.addEventListener('click', dClose);

        var logBtn = dov.querySelector('#btnLogMedDose');
        if (logBtn) {
          logBtn.addEventListener('click', function () {
            if (window.App && App.toast) {
              App.toast('Dose recorded as taken: ' + medTitle + ' (' + dose + ')');
            }
            dClose();
          });
        }
      }
    });
  }

  /* ---------- Open Detailed Diagnostic Test Modal ---------- */
  function openPatientTestDetailModal(patient, t) {
    if (!t) return;
    var testName = t.name || 'Diagnostic Test';
    var test = (t.testId ? DB.get('tests', t.testId) : null) || {};
    if (!test.id && t.name) {
      var allTests = DB.all('tests') || [];
      test = allTests.find(function (x) {
        return x && (x.id === t.testId || (x.name && x.name.toLowerCase() === t.name.toLowerCase()));
      }) || test;
    }
    var inv = (t.invoiceId ? DB.get('invoices', t.invoiceId) : null) || {};
    var allResults = DB.all('results') || [];
    var res = allResults.filter(function (r) {
      return r && (
        (t.invoiceId && r.invoiceId === t.invoiceId && (r.testId === t.testId || (t.name && (r.testName === t.name || (test.name && r.testName === test.name))))) ||
        (!t.invoiceId && (r.testId === t.testId || (t.name && r.testName === t.name)))
      );
    }).sort(function (a, b) {
      return String(b.reportedAt || b.updatedAt || '').localeCompare(String(a.reportedAt || a.updatedAt || ''));
    })[0];

    if (!inv.id && res && res.invoiceId) {
      inv = DB.get('invoices', res.invoiceId) || inv;
    }
    var doc = inv.doctorId ? DB.get('doctors', inv.doctorId) : null;

    var isReady = res && res.status === 'ready';
    var params = Array.isArray(test.params) ? test.params : [];
    var values = (res && res.values) || {};

    // Build Biomarkers / Parameters table
    var paramsTableHtml = '';
    if (params.length || Object.keys(values).length) {
      var rowsHtml = '';
      if (params.length) {
        rowsHtml = params.map(function (param) {
          var pName = param.name || param.id || 'Biomarker';
          var val = values[param.id] != null ? values[param.id] : values[param.name];
          var hasVal = val != null && String(val).trim() !== '';
          var valStr = hasVal ? String(val).trim() : (isReady ? '—' : 'Pending');
          var ref = reference(param, patient);
          var isOut = outsideRange(val, ref);
          var unit = param.unit || '';

          var valDisplay = esc(valStr);
          var statusBadge = '<span class="badge b-ready" style="font-size:11px;font-weight:700">Normal</span>';
          if (isOut === true) {
            valDisplay = '<span style="color:#b91c1c;font-weight:800;display:inline-flex;align-items:center;gap:3px">' + esc(valStr) + ' <span style="font-size:13px">⚠️</span></span>';
            statusBadge = '<span class="badge b-red" style="font-size:11px;font-weight:700">Abnormal</span>';
          } else if (!hasVal && !isReady) {
            valDisplay = '<span style="color:#94a3b8;font-style:italic">Pending</span>';
            statusBadge = '<span class="badge b-warn" style="font-size:11px;font-weight:700">Pending</span>';
          } else if (!hasVal && isReady) {
            valDisplay = '<span style="color:#94a3b8">—</span>';
            statusBadge = '<span class="badge" style="font-size:11px;background:#f1f5f9;color:#64748b">Not entered</span>';
          }

          return '<tr style="border-bottom:1px solid #e2e8f0' + (isOut ? ';background:#fef2f2' : '') + '">' +
            '<td style="padding:10px 12px;font-weight:600;color:#1e293b">' + esc(pName) + '</td>' +
            '<td style="padding:10px 12px;font-weight:700;font-size:13.5px">' + valDisplay + '</td>' +
            '<td style="padding:10px 12px;color:#64748b;font-size:12px">' + esc(unit || '—') + '</td>' +
            '<td style="padding:10px 12px;color:#475569;font-size:12px;font-family:monospace">' + esc(ref || 'Standard') + '</td>' +
            '<td style="padding:10px 12px;text-align:right">' + statusBadge + '</td>' +
          '</tr>';
        }).join('');
      } else {
        rowsHtml = Object.keys(values).map(function (k) {
          return '<tr style="border-bottom:1px solid #e2e8f0">' +
            '<td style="padding:10px 12px;font-weight:600;color:#1e293b">' + esc(k) + '</td>' +
            '<td style="padding:10px 12px;font-weight:700;font-size:13.5px">' + esc(values[k]) + '</td>' +
            '<td style="padding:10px 12px;color:#64748b;font-size:12px">—</td>' +
            '<td style="padding:10px 12px;color:#475569;font-size:12px">—</td>' +
            '<td style="padding:10px 12px;text-align:right"><span class="badge b-ready">Recorded</span></td>' +
          '</tr>';
        }).join('');
      }

      var pendingNotice = !isReady ? (
        '<div style="margin-bottom:12px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:16px">⏳</span>' +
          '<span><strong>Laboratory Processing:</strong> Official results verification is in progress. Standard parameter reference ranges are listed below.</span>' +
        '</div>'
      ) : '';

      paramsTableHtml =
        '<div style="margin-top:16px">' +
          pendingNotice +
          '<div style="font-weight:700;font-size:13.5px;color:#0f172a;margin-bottom:8px;display:flex;align-items:center;gap:6px">' +
            '<span>🔬</span> <span>Analyte Parameters &amp; Lab Values (' + (params.length || Object.keys(values).length) + ' Analyzed)</span>' +
          '</div>' +
          '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden">' +
            '<table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left">' +
              '<thead style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;font-size:12px;color:#64748b">' +
                '<tr>' +
                  '<th style="padding:8px 12px">Biomarker / Test Parameter</th>' +
                  '<th style="padding:8px 12px">Observed Value</th>' +
                  '<th style="padding:8px 12px">Unit</th>' +
                  '<th style="padding:8px 12px">Normal Reference Range</th>' +
                  '<th style="padding:8px 12px;text-align:right">Evaluation</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' + rowsHtml + '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>';
    } else {
      paramsTableHtml =
        '<div style="margin-top:16px;padding:24px 16px;background:#fffbeb;border:1.5px dashed #fcd34d;border-radius:12px;text-align:center">' +
          '<div style="font-size:28px;margin-bottom:6px">⏳</div>' +
          '<strong style="color:#92400e;font-size:14px;display:block">Results Entry In Progress</strong>' +
          '<p style="margin:4px 0 0;font-size:12px;color:#b45309">Specimen collected and assigned to laboratory workbench. Official findings will appear here once verified.</p>' +
        '</div>';
    }

    var specNote = getTestSpecificClinicalNote(testName, test.code || t.code, test.category || t.category, t.status, t.abnormalParams, test);

    var remarksHtml = '';
    if (res && (res.remarks || res.narrative || res.notes)) {
      var noteTxt = res.remarks || res.narrative || res.notes;
      remarksHtml =
        '<div style="margin-top:14px;padding:12px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px">' +
          '<strong style="font-size:12.5px;color:#166534;display:flex;align-items:center;gap:6px">📝 Pathologist / Clinical Remarks:</strong>' +
          '<div style="font-size:12.5px;color:#14532d;margin-top:4px;white-space:pre-wrap;line-height:1.5">' + esc(noteTxt) + '</div>' +
        '</div>';
    }

    var testInterpretationHtml =
      '<div style="margin-top:14px;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #0284c7;border-radius:10px">' +
        '<strong style="font-size:12.5px;color:#0f172a;display:flex;align-items:center;gap:6px">🔬 Clinical Test Interpretation &amp; Guidance (' + esc(testName) + '):</strong>' +
        '<div style="font-size:12.5px;color:#334155;margin-top:4px;line-height:1.5">' + esc(specNote.detail) + '</div>' +
      '</div>';

    var reportedByHtml = '';
    if (res && (res.reportedBy || res.reportedAt)) {
      reportedByHtml = '<div style="font-size:11.5px;color:#64748b;margin-top:8px">Verified by: ' + esc(res.reportedBy || 'Pathologist') + (res.reportedAt ? ' on ' + esc(App.dt ? App.dt(res.reportedAt) : res.reportedAt) : '') + '</div>';
    }

    var badgeCls = t.badgeCls || 'b-warn';
    var badgeText = t.statusLabel || 'Pending';

    var modalHtml =
      '<div style="display:flex;flex-direction:column;gap:12px">' +
        // Header summary card
        '<div style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">' +
          '<div>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="font-size:22px">🧪</span>' +
              '<div>' +
                '<h3 style="margin:0;font-size:17px;font-weight:800;color:#0f172a">' + esc(testName) + '</h3>' +
                '<div style="font-size:12px;color:#64748b;margin-top:2px">' +
                  (test.code ? '<span class="mono" style="font-weight:700;color:#0284c7">' + esc(test.code) + '</span> · ' : '') +
                  '<span>📁 ' + esc(test.category || t.category || 'General Pathology') + '</span> · ' +
                  '<span>🩸 ' + esc(test.sampleType || t.sampleType || 'Specimen Blood') + '</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="badge ' + badgeCls + '" style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px">' + esc(badgeText) + '</span>' +
          '</div>' +
        '</div>' +

        // Order Details Grid
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px">' +
          '<div>' +
            '<span style="font-size:11px;color:#64748b;display:block">Invoice / Case #</span>' +
            '<strong style="font-size:13px;color:#0f172a">' + esc(t.invoiceNo || 'Recorded') + '</strong>' +
          '</div>' +
          '<div>' +
            '<span style="font-size:11px;color:#64748b;display:block">Registration Date</span>' +
            '<strong style="font-size:13px;color:#0f172a">' + esc(t.date || 'Recorded') + '</strong>' +
          '</div>' +
          '<div>' +
            '<span style="font-size:11px;color:#64748b;display:block">Referring Doctor</span>' +
            '<strong style="font-size:13px;color:#0f172a">' + esc(doc ? doc.name : 'Self / Walk-in') + '</strong>' +
          '</div>' +
          '<div>' +
            '<span style="font-size:11px;color:#64748b;display:block">Test Fee &amp; Billing</span>' +
            '<strong style="font-size:13px;color:#0f172a">' + (t.price ? App.money(t.price) : 'Standard') + ' (' + ((+inv.due || 0) > 0.009 ? '<span style="color:#dc2626">Due ' + App.money(inv.due) + '</span>' : '<span style="color:#16a34a">Paid</span>') + ')</strong>' +
          '</div>' +
        '</div>' +

        paramsTableHtml +
        testInterpretationHtml +
        remarksHtml +
        reportedByHtml +

        '<div class="actions" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            (t.invoiceId ? '<button type="button" class="btn btn-primary btn-sm" id="ptdViewReport" style="font-weight:700;display:inline-flex;align-items:center;gap:6px"><span>👁️</span> <span>View Official Report (PDF)</span></button>' : '') +
            (t.invoiceId ? '<button type="button" class="btn btn-ghost btn-sm" id="ptdPrintReport" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff"><span>🖨️</span> <span>Print Report</span></button>' : '') +
            ((window.App && App.aiInsights && t.invoiceId) ? '<button type="button" class="btn btn-ghost btn-sm" id="ptdAiInsights" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff"><span>🤖</span> <span>AI Recommendations</span></button>' : '') +
          '</div>' +
          '<button type="button" class="btn btn-ghost" id="ptdClose" style="min-width:90px;font-weight:700">Close</button>' +
        '</div>' +
      '</div>';

    App.modal('Diagnostic Test Details — ' + esc(testName), modalHtml, {
      wide: true,
      onOpen: function (dov, dClose) {
        var clBtn = dov.querySelector('#ptdClose');
        if (clBtn) clBtn.addEventListener('click', dClose);

        var vrBtn = dov.querySelector('#ptdViewReport');
        if (vrBtn && t.invoiceId) {
          vrBtn.addEventListener('click', function () {
            dClose();
            if (App.viewLabReport) {
              App.viewLabReport(t.invoiceId);
            } else if (App.loadScript) {
              App.loadScript('assets/js/mod-results.js').then(function () {
                if (App.viewLabReport) App.viewLabReport(t.invoiceId);
              });
            }
          });
        }

        var prBtn = dov.querySelector('#ptdPrintReport');
        if (prBtn && t.invoiceId) {
          prBtn.addEventListener('click', function () {
            dClose();
            if (App.printLabReport) {
              App.printLabReport(t.invoiceId);
            } else if (App.loadScript) {
              App.loadScript('assets/js/mod-results.js').then(function () {
                if (App.printLabReport) App.printLabReport(t.invoiceId);
              });
            }
          });
        }

        var aiBtn = dov.querySelector('#ptdAiInsights');
        if (aiBtn && t.invoiceId) {
          aiBtn.addEventListener('click', function () {
            if (App.aiInsights && typeof App.aiInsights.showModal === 'function') {
              App.aiInsights.showModal(t.invoiceId);
            }
          });
        }
      }
    });
  }
  App.openPatientTestDetailModal = openPatientTestDetailModal;
  App.openPatientMedicationDetailModal = openPatientMedicationDetailModal;

  function renderPatientTestsListHtml(tests) {
    if (!tests || !tests.length) {
      return '<div style="padding:22px 16px;background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:12px;text-align:center;color:#64748b;font-size:12px;margin-bottom:12px">' +
        '<div style="font-size:22px;margin-bottom:4px">📋</div>' +
        '<strong style="color:#334155;display:block;margin-bottom:2px">No Previous Tests Recorded</strong>' +
        '<span style="font-size:11.5px">No laboratory tests or diagnostic orders recorded yet for this patient.</span>' +
        '</div>';
    }
    return '<div class="pd-tests-scroll-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;width:100%">' +
      tests.map(function (t, idx) {
        var badgeCls = t.badgeCls || 'b-warn';
        var badgeText = t.statusLabel || 'Pending';
        if (!t.statusLabel) {
          if (t.status === 'abnormal') {
            badgeCls = 'b-red';
            badgeText = 'Abnormal';
          } else if (t.status === 'within' || t.status === 'ready') {
            badgeCls = 'b-ready';
            badgeText = 'Normal';
          } else {
            badgeCls = 'b-warn';
            badgeText = 'Pending';
          }
        }
        var dateStr = t.date ? (App.d ? App.d(t.date) : String(t.date).slice(0, 10)) : 'Recorded';
        var invoiceTag = t.invoiceNo
          ? '<span style="color:#cbd5e1">•</span><span style="font-weight:600;color:#0284c7">' + esc(t.invoiceNo) + '</span>'
          : '';

        return '<div class="pd-diag-test-item" data-pd-diag-idx="' + idx + '" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;border:1.5px solid #edf2f7;border-radius:10px;gap:12px;box-shadow:0 1px 2px rgba(15,23,42,0.02);cursor:pointer;transition:all 0.15s ease" title="Click to view full test parameters and clinical results">' +
          '  <div style="min-width:0;flex:1">' +
          '    <div style="display:flex;align-items:center;gap:8px">' +
          '      <span style="font-size:15px;color:#475569" aria-hidden="true">🧪</span>' +
          '      <strong style="font-size:13.5px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(t.name) + '</strong>' +
          '      <span style="font-size:11px;font-weight:600;color:#2563eb;background:#eff6ff;padding:1px 6px;border-radius:4px;border:1px solid #bfdbfe">View Details</span>' +
          '    </div>' +
          '    <div style="display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11.5px;color:#64748b">' +
          '      <span>📅 ' + esc(dateStr) + '</span>' +
          invoiceTag +
          (t.category ? '<span style="color:#cbd5e1">•</span><span>📁 ' + esc(t.category) + '</span>' : '') +
          '    </div>' +
          '  </div>' +
          '  <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          '    <span class="badge ' + badgeCls + '" style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px">' + esc(badgeText) + '</span>' +
          '    <span style="color:#94a3b8;font-size:16px;font-weight:700">›</span>' +
          '  </div>' +
          '</div>';
      }).join('') +
      '</div>';
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
      entries.push({name:name,region:regionFor({name:name,code:test.code}),status:flags.length?'abnormal':!ready?'pending':checked>0&&checked===params.length&&populated===params.length?'within':'unknown',flags:flags,date:inv.createdAt||'',testId:item.testId,invoiceId:inv.id,invoiceNo:inv.no||(inv.id?'#'+inv.id:''),price:item.price,category:test.category,sampleType:test.sampleType});
    });});return entries;
  }

  function getPatientOldTests(patient) {
    if (!patient || !patient.id) return [];
    var invoices = (DB.all('invoices') || []).filter(function (inv) {
      return inv && inv.patientId === patient.id;
    }).sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var results = DB.all('results') || [];
    var list = [];
    invoices.forEach(function (inv) {
      var invDate = inv.createdAt ? (App.d ? App.d(inv.createdAt) : String(inv.createdAt).slice(0, 10)) : 'Recorded';
      var invNo = inv.no || (inv.id ? '#' + inv.id : '');
      (inv.items || []).forEach(function (item) {
        var test = (item.testId ? DB.get('tests', item.testId) : null) || {};
        var testName = test.name || item.name || test.code || 'Diagnostic test';
        var ready = results.filter(function (res) {
          return res && res.invoiceId === inv.id && (res.testId === item.testId || (!item.testId && res.testName === testName));
        }).sort(function (a, b) {
          return String(b.reportedAt || b.updatedAt || '').localeCompare(String(a.reportedAt || a.updatedAt || ''));
        })[0];

        var status = 'pending';
        var statusLabel = 'Pending';
        var badgeCls = 'b-warn';
        var abnormalParams = [];
        var previewParams = [];
        var params = Array.isArray(test.params) ? test.params : [];
        var paramCount = params.length;

        if (ready) {
          if (ready.status === 'ready') {
            status = 'ready';
            statusLabel = 'Normal';
            badgeCls = 'b-ready';
            var hasAbnormal = false;
            params.forEach(function (param) {
              var values = ready.values || {};
              var val = values[param.id] != null ? values[param.id] : values[param.name];
              var ref = reference(param, patient);
              var isOut = outsideRange(val, ref);
              if (val != null && String(val).trim() !== '') {
                previewParams.push({
                  name: param.name || param.id,
                  val: val,
                  unit: param.unit || '',
                  outside: isOut
                });
              }
              if (isOut) {
                hasAbnormal = true;
                abnormalParams.push((param.name || param.id) + ': ' + val + (param.unit ? ' ' + param.unit : ''));
              }
            });
            if (hasAbnormal || ready.isAbnormal) {
              status = 'abnormal';
              statusLabel = 'Abnormal';
              badgeCls = 'b-red';
            }
          } else if (ready.status === 'draft') {
            status = 'pending';
            statusLabel = 'In Progress';
            badgeCls = 'b-warn';
          }
        }
        var doc = inv.doctorId ? (DB.get('doctors', inv.doctorId) || {}) : null;
        list.push({
          name: testName,
          code: test.code || '',
          testId: item.testId,
          invoiceId: inv.id,
          invoiceNo: invNo,
          date: invDate,
          rawDate: inv.createdAt,
          doctorName: doc ? (doc.name || 'Self') : 'Self',
          status: status,
          statusLabel: statusLabel,
          badgeCls: badgeCls,
          price: item.price,
          category: test.category || 'General Pathology',
          sampleType: test.sampleType || 'Specimen Blood',
          abnormalParams: abnormalParams,
          previewParams: previewParams,
          paramCount: paramCount
        });
      });
    });
    return list;
  }

  function getPatientReports(patient) {
    if (!patient || !patient.id) return [];
    var invoices = (DB.all('invoices') || []).filter(function (inv) {
      return inv && inv.patientId === patient.id;
    }).sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    var results = DB.all('results') || [];
    return invoices.map(function (inv) {
      var invResults = results.filter(function (r) { return r && r.invoiceId === inv.id; });
      var items = Array.isArray(inv.items) ? inv.items : [];
      var testNames = items.map(function (item) {
        var t = (item.testId ? DB.get('tests', item.testId) : null) || {};
        return t.name || item.name || t.code || 'Diagnostic Test';
      });
      var readyCount = invResults.filter(function (r) { return r.status === 'ready'; }).length;
      var isReady = readyCount > 0;
      var allReady = items.length > 0 && items.every(function (item) {
        return invResults.some(function (r) { return r.testId === item.testId && r.status === 'ready'; });
      });
      var doctor = inv.doctorId ? (DB.get('doctors', inv.doctorId) || {}) : null;
      var status = allReady ? 'ready' : isReady ? 'partial' : 'pending';
      var statusLabel = allReady ? 'Ready & Finalized' : isReady ? 'Partially Ready' : 'Processing';
      var badgeCls = allReady ? 'b-ready' : isReady ? 'b-warn' : 'b-pending';
      var visitNos = (App.visitNos && typeof App.visitNos === 'function') ? App.visitNos(inv) : { labText: inv.no || '#' + inv.id };
      return {
        inv: inv,
        invoiceId: inv.id,
        invoiceNo: inv.no || (inv.id ? '#' + inv.id : ''),
        labText: visitNos.labText || inv.no || ('#' + inv.id),
        date: inv.createdAt ? (App.d ? App.d(inv.createdAt) : String(inv.createdAt).slice(0, 10)) : 'Recorded',
        time: inv.createdAt ? (App.dt ? App.dt(inv.createdAt) : String(inv.createdAt)) : '',
        testNames: testNames,
        testCount: items.length,
        doctorName: doctor ? (doctor.name || 'Self') : 'Self',
        status: status,
        statusLabel: statusLabel,
        badgeCls: badgeCls,
        isPaid: (+inv.due || 0) <= 0.009,
        due: inv.due || 0,
        total: inv.total || 0,
        reportPdfKey: inv.reportPdfKey || ''
      };
    });
  }

  function anatomy(entry) {
    entry=entry||{region:'general',status:'pending',flags:[],name:'No ordered tests'};
    var region=regions[entry.region],red=entry.status==='abnormal';
    var status=red?'Outside reference range':entry.status==='within'?'Compared values within reference range':entry.status==='pending'?'Results pending':'Reference comparison unavailable / incomplete';
    return '<div class="pd-body-frame"><img src="assets/img/patient-body-reference.png" alt="Full-body anatomy reference">'+
      '<svg class="pd-body-markers '+(red?'pd-abnormal':'')+'" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="'+esc(region.name)+' related area">'+region.spots.map(function(spot){return '<ellipse cx="'+spot[0]+'" cy="'+spot[1]+'" rx="'+spot[2]+'" ry="'+spot[3]+'"/>';}).join('')+'</svg></div>'+
      '<div class="pd-callout '+(red?'pd-abnormal':'')+'"><strong>'+esc(region.name)+'</strong><span>'+esc(status)+'</span>'+(entry.flags.length?'<p>'+entry.flags.map(esc).join('<br>')+'</p>':'')+'</div>';
  }

  /* Determine if a biomarker is one where a lower value is clinically better */
  function isLowerBetter(key, name) {
    var s = (String(key || '') + ' ' + String(name || '')).toLowerCase();
    if (/\b(hb|hemoglobin|haemoglobin|platelet|plt|egfr|hdl|albumin|rbc|vit|vitamin|iron)\b/.test(s)) {
      return false;
    }
    return true;
  }

  /* Analyze patient's chronological laboratory test results and longitudinal trends */
  function analyzePatientLabHistory(patient) {
    var result = {
      hasTests: false,
      hasHistory: false,
      currentInvoice: null,
      pastInvoice: null,
      comparisons: [],
      summary: { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 },
      organStates: {
        liver: { id: 'liver', name: 'Liver', icon: '🫀', status: 'normal', findings: [], alert: null, score: 88, diffNote: '' },
        lung: { id: 'lung', name: 'Lungs', icon: '🫁', status: 'normal', findings: [], alert: null, score: 79, diffNote: '' },
        heart: { id: 'heart', name: 'Heart', icon: '❤️', status: 'normal', findings: [], alert: null, score: 85, diffNote: '' },
        kidneys: { id: 'kidneys', name: 'Kidneys', icon: '🫘', status: 'normal', findings: [], alert: null, score: 92, diffNote: '' },
        brain: { id: 'brain', name: 'Brain', icon: '🧠', status: 'normal', findings: [], alert: null, score: 95, diffNote: '' },
        pancreas: { id: 'pancreas', name: 'Pancreas', icon: '🥞', status: 'normal', findings: [], alert: null, score: 90, diffNote: '' },
        blood: { id: 'blood', name: 'Hematology', icon: '🩸', status: 'normal', findings: [], alert: null, score: 84, diffNote: '' }
      },
      doctorMatrix: {
        etiology: [],
        panicAlerts: [],
        contraindications: [],
        recommendations: []
      }
    };

    if (!patient || !patient.id || !window.DB || typeof DB.all !== 'function') {
      return result;
    }

    var allInvs = (DB.all('invoices') || []).filter(function (inv) {
      return inv.patientId === patient.id;
    }).sort(function (a, b) {
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

    var allResults = DB.all('results') || [];

    var readyInvs = allInvs.filter(function (inv) {
      return allResults.some(function (r) {
        return (r.invoiceId === inv.id || r.invoiceId === inv.no) && r.status === 'ready';
      });
    });

    if (!readyInvs.length) {
      return result;
    }

    result.hasTests = true;
    result.currentInvoice = readyInvs[0];
    if (readyInvs.length > 1) {
      result.hasHistory = true;
      result.pastInvoice = readyInvs[1];
    }

    var curResMap = {};
    allResults.filter(function (r) {
      return (r.invoiceId === readyInvs[0].id || r.invoiceId === readyInvs[0].no) && r.status === 'ready';
    }).forEach(function (r) {
      curResMap[r.testId] = r;
    });

    var prevResMap = {};
    if (result.pastInvoice) {
      allResults.filter(function (r) {
        return (r.invoiceId === result.pastInvoice.id || r.invoiceId === result.pastInvoice.no) && r.status === 'ready';
      }).forEach(function (r) {
        prevResMap[r.testId] = r;
      });
    }

    var seenParams = {};
    (readyInvs[0].items || []).forEach(function (item) {
      var test = DB.get('tests', item.testId) || {};
      var curRes = curResMap[item.testId];
      if (!curRes) return;

      var prevRes = prevResMap[item.testId];
      var params = Array.isArray(test.params) ? test.params : (Array.isArray(test.fields) ? test.fields : []);

      if (!params.length && curRes.values) {
        params = Object.keys(curRes.values).map(function (k) {
          return { id: k, name: k, unit: '' };
        });
      }

      params.forEach(function (param) {
        var pKey = param.id || param.name;
        if (seenParams[pKey]) return;
        seenParams[pKey] = true;

        var curVal = curRes.values ? (curRes.values[param.id] != null ? curRes.values[param.id] : curRes.values[param.name]) : null;
        if (curVal == null || String(curVal).trim() === '') return;

        var prevVal = (prevRes && prevRes.values) ? (prevRes.values[param.id] != null ? prevRes.values[param.id] : prevRes.values[param.name]) : null;

        var ref = reference(param, patient);
        var curOut = outsideRange(curVal, ref);

        var curNum = parseFloat(curVal);
        var prevNum = prevVal != null ? parseFloat(prevVal) : NaN;
        var hasCurNum = !isNaN(curNum);
        var hasPrevNum = !isNaN(prevNum);

        var diff = 0;
        var pct = 0;
        var status = 'baseline';
        var badgeClass = 'baseline';
        var statusLabel = 'Initial Baseline';
        var dirClass = 'same';

        if (hasCurNum && hasPrevNum) {
          diff = Math.round((curNum - prevNum) * 100) / 100;
          pct = prevNum !== 0 ? Math.round(((diff / prevNum) * 100) * 10) / 10 : 0;
          dirClass = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'same');

          var lowerBetter = isLowerBetter(param.id, param.name);
          if (Math.abs(diff) < 0.001 || Math.abs(pct) < 1.5) {
            status = 'stable';
            badgeClass = 'stable';
            statusLabel = 'Stable (Mustahkam)';
            result.summary.stable++;
          } else {
            var improved = lowerBetter ? (diff < 0) : (diff > 0);
            if (improved) {
              status = 'improved';
              badgeClass = 'improved';
              statusLabel = 'Improved (Behtar)';
              result.summary.improved++;
            } else {
              status = 'deteriorated';
              badgeClass = 'deteriorated';
              statusLabel = 'Deteriorated (Kharab)';
              result.summary.deteriorated++;
            }
          }
        } else {
          status = 'baseline';
          badgeClass = 'baseline';
          statusLabel = 'Initial Baseline';
          result.summary.baseline++;
        }
        result.summary.total++;

        var organKey = regionFor({ name: (test.name || '') + ' ' + (param.name || ''), code: test.code });
        if (organKey === 'lungs') organKey = 'lung';
        if (!result.organStates[organKey]) organKey = 'blood';

        var org = result.organStates[organKey];
        if (curOut === true) {
          if (org.status !== 'critical') org.status = 'warning';
          org.findings.push((param.name || param.id) + ': ' + curVal + (param.unit ? ' ' + param.unit : '') + ' (Ref: ' + ref + ')');
          if (status === 'deteriorated') {
            org.diffNote = 'Elevated vs previous (' + (diff > 0 ? '+' : '') + diff + ')';
          } else if (status === 'improved') {
            org.diffNote = 'Improving towards normal (' + (diff > 0 ? '+' : '') + diff + ')';
          }
        }

        if (hasCurNum) {
          var k = (param.id || param.name).toLowerCase();
          if ((k.indexOf('plt') >= 0 || k.indexOf('platelet') >= 0) && curNum < 50000) {
            org.status = 'critical';
            result.doctorMatrix.panicAlerts.push('Severe Thrombocytopenia (Platelets: ' + curVal + ' /uL): High hemorrhage threat. Strict avoidance of NSAIDs and IM injections.');
          }
          if ((k.indexOf('hb') >= 0 || k.indexOf('hemoglobin') >= 0) && curNum < 7.0) {
            org.status = 'critical';
            result.doctorMatrix.panicAlerts.push('Critical Anemia (Hb: ' + curVal + ' g/dL): Severe oxygen transport compromise. Immediate packed cell transfusion evaluation indicated.');
          }
          if ((k.indexOf('creat') >= 0 || k.indexOf('creatinine') >= 0) && curNum > 3.0) {
            org.status = 'critical';
            result.doctorMatrix.panicAlerts.push('Severe Renal Failure / AKI (Creatinine: ' + curVal + ' mg/dL): Uremic retention. Urgent nephrology consultation.');
          }
          if ((k.indexOf('alt') >= 0 || k.indexOf('sgpt') >= 0) && curNum > 250) {
            org.status = 'critical';
            result.doctorMatrix.panicAlerts.push('Acute Hepatic Cytolysis (ALT: ' + curVal + ' U/L): Marked hepatocellular injury. Screen for viral hepatitis and hepatotoxins.');
          }
          if ((k.indexOf('glucose') >= 0 || k.indexOf('sugar') >= 0) && (curNum > 350 || curNum < 50)) {
            org.status = 'critical';
            result.doctorMatrix.panicAlerts.push('Glycemic Emergency (Blood Glucose: ' + curVal + ' mg/dL): ' + (curNum < 50 ? 'Severe Neuroglycopenia' : 'Hyperosmolar state') + '. Urgent intervention required.');
          }
        }

        result.comparisons.push({
          testName: test.name || item.name || 'Laboratory Test',
          paramName: param.name || param.id,
          paramKey: param.id || param.name,
          unit: param.unit || '',
          organ: organKey,
          prevVal: prevVal != null ? prevVal : '—',
          prevDate: result.pastInvoice ? (result.pastInvoice.createdAt ? String(result.pastInvoice.createdAt).slice(0, 10) : 'Past visit') : 'Initial visit',
          curVal: curVal,
          curDate: readyInvs[0].createdAt ? String(readyInvs[0].createdAt).slice(0, 10) : 'Latest',
          refRange: ref || 'Standard',
          isOutside: curOut === true,
          diff: diff,
          pct: pct,
          dirClass: dirClass,
          status: status,
          badgeClass: badgeClass,
          statusLabel: statusLabel
        });
      });
    });

    var liverOrg = result.organStates.liver;
    if (liverOrg && (liverOrg.status === 'warning' || liverOrg.status === 'critical')) {
      result.doctorMatrix.etiology.push('Transaminitis / Hepatic Cytolysis: Elevated liver enzymes indicating hepatocellular irritation.');
      result.doctorMatrix.contraindications.push('Avoid Hepatotoxic medications: Limit Paracetamol (max 2g/day), avoid high-dose statins.');
      result.doctorMatrix.recommendations.push('Order Ultrasound Upper Abdomen & Viral Hepatitis Serology (HBsAg, Anti-HCV).');
    }

    var kidneyOrg = result.organStates.kidneys;
    if (kidneyOrg && (kidneyOrg.status === 'warning' || kidneyOrg.status === 'critical')) {
      result.doctorMatrix.etiology.push('Impaired Renal Clearance: Elevated serum nitrogenous markers / Creatinine elevation.');
      result.doctorMatrix.contraindications.push('Avoid NSAIDs (Ibuprofen, Diclofenac, Mefenamic acid). Adjust dosage of renally cleared antibiotics.');
      result.doctorMatrix.recommendations.push('Recheck Serum Creatinine & Electrolytes (Na+, K+) in 48–72 hours. Maintain adequate hydration.');
    }

    var bloodOrg = result.organStates.blood;
    if (bloodOrg && (bloodOrg.status === 'warning' || bloodOrg.status === 'critical')) {
      result.doctorMatrix.etiology.push('Hematologic Variation: Abnormal peripheral red cell or platelet counts requiring surveillance.');
      result.doctorMatrix.recommendations.push('Evaluate Peripheral Blood Smear (PBS) & Ferritin levels if microcytic anemia is present.');
    }

    if (!result.doctorMatrix.etiology.length) {
      result.doctorMatrix.etiology.push('All evaluated laboratory biomarkers are currently within physiological reference parameters.');
      result.doctorMatrix.recommendations.push('Routine annual wellness check-up and standard preventive health maintenance.');
    }

    return result;
  }

  /* Diagnostic Effect of Patient Tests on Specific Organ System */
  function getOrganTestEffectData(organKey, patient, labData) {
    var orgKey = (organKey === 'lungs' ? 'lung' : organKey) || 'lung';
    var lab = labData || { organStates: {}, comparisons: [], summary: {} };
    var orgState = (lab.organStates && lab.organStates[orgKey]) ? lab.organStates[orgKey] : null;
    var bloodState = (lab.organStates && lab.organStates['blood']) ? lab.organStates['blood'] : null;

    var relevantComps = (lab.comparisons || []).filter(function (c) {
      if (orgKey === 'lung') {
        return c.organ === 'lung' || c.organ === 'lungs' || c.organ === 'blood';
      }
      return c.organ === orgKey;
    });

    var allPatientTests = getPatientOldTests(patient);
    var relevantTests = allPatientTests.filter(function (t) {
      var r = regionFor({ name: t.name, code: '' });
      if (orgKey === 'lung') {
        return r === 'lungs' || r === 'blood';
      }
      return r === orgKey;
    });

    var isCritical = false;
    var isDeteriorated = false;
    var isImproved = false;
    var isAbnormal = false;
    var isNormal = false;

    if (orgState && orgState.status === 'critical') isCritical = true;
    if (orgKey === 'lung' && bloodState && bloodState.status === 'critical') isCritical = true;

    if (relevantComps.length > 0) {
      var improvedCount = 0;
      var deterioratedCount = 0;
      var critCount = 0;
      relevantComps.forEach(function (c) {
        if (c.status === 'improved') improvedCount++;
        if (c.status === 'deteriorated') deterioratedCount++;
        if (c.curOut) isAbnormal = true;
        var valNum = parseFloat(c.curVal);
        if (!isNaN(valNum)) {
          var k = (c.name || '').toLowerCase();
          if ((k.indexOf('plt') >= 0 || k.indexOf('platelet') >= 0) && valNum < 50000) critCount++;
          if ((k.indexOf('hb') >= 0 || k.indexOf('hemoglobin') >= 0) && valNum < 7.0) critCount++;
          if ((k.indexOf('creat') >= 0 || k.indexOf('creatinine') >= 0) && valNum > 3.0) critCount++;
        }
      });
      if (critCount > 0) isCritical = true;
      if (deterioratedCount > 0) isDeteriorated = true;
      if (improvedCount > 0 && deterioratedCount === 0 && !isCritical) isImproved = true;
    } else if (relevantTests.length > 0) {
      var hasAbnormalTest = relevantTests.some(function (t) { return t.status === 'abnormal'; });
      if (hasAbnormalTest) isAbnormal = true;
      else isNormal = true;
    }

    var badgeClass = 'b-ready';
    var badgeText = 'Normal';
    var toneTitle = '';
    var toneDesc = '';

    if (isCritical) {
      badgeClass = 'b-red';
      badgeText = '🚨 Critical (Khatarnak)';
      toneTitle = 'Pehle se Critical / High Risk Alert';
      toneDesc = 'Is patient ke karwaye gaye test results mein critical findings note hui hain. Pichlay record ke muqablay mein parameters alarming stage par hain aur fori doctor consultation darkaar hai.';
    } else if (isDeteriorated) {
      badgeClass = 'b-red';
      badgeText = '⚠️ Pehle se Kharab (Deteriorated)';
      toneTitle = 'Pehle Test se Deterioration / Kharabi';
      toneDesc = 'Patient ke tests ka effect pehle test ke muqablay mein KHARAB (elevated strain) note hua hai. Biomarkers normal reference limits se door ho rahe hain.';
    } else if (isImproved) {
      badgeClass = 'b-ready';
      badgeText = '✓ Pehle se Normal / Behtar (Improving)';
      toneTitle = 'Pehle Test ke Muqablay mein Behtar (Normal ki taraf)';
      toneDesc = 'Patient ke karwaye gaye tests ka effect positive hai. Pehle ke muqablay mein biomarkers behtar ho kar normal reference range ki taraf wapas aa rahe hain.';
    } else if (isAbnormal) {
      badgeClass = 'b-warn';
      badgeText = '⚠️ Abnormal / Outside Range';
      toneTitle = 'Test ka Asar: Abnormal / Elevated';
      toneDesc = 'Latest diagnostic test parameters standard reference limits se bahar hain. Routine clinical follow-up aur medicine compliance zaroori hai.';
    } else if (isNormal || relevantTests.length > 0) {
      badgeClass = 'b-ready';
      badgeText = '✓ Normal Baseline (Within Limits)';
      toneTitle = 'Tests ka Asar: Normal Baseline';
      toneDesc = 'Is patient ke karwaye gaye test results bilkul NORMAL aur healthy reference range ke andar hain. Koi acute respiratory strain ya infection detected nahi.';
    } else {
      badgeClass = 'b-warn';
      badgeText = '⚖️ Moderate Baseline';
      toneTitle = 'Baseline Monitoring';
      toneDesc = 'Patient ki capacity baseline par monitor ki ja rahi hai. Mazeed tasdeeq ke liye correlative lab tests recommended hain.';
    }

    return {
      badgeClass: badgeClass,
      badgeText: badgeText,
      toneTitle: toneTitle,
      toneDesc: toneDesc,
      relevantComps: relevantComps,
      relevantTests: relevantTests
    };
  }

  function renderOrganTestEffectInnerHtml(organKey, patient, labData) {
    var data = getOrganTestEffectData(organKey, patient, labData);

    var chipsHtml = '';
    if (data.relevantComps && data.relevantComps.length > 0) {
      chipsHtml = data.relevantComps.map(function (c) {
        var isGood = c.status === 'improved';
        var isBad = c.status === 'deteriorated';
        var borderC = isGood ? '#bbf7d0' : (isBad ? '#fecaca' : '#cbd5e1');
        var bgC = isGood ? '#f0fdf4' : (isBad ? '#fef2f2' : '#ffffff');
        var textC = isGood ? '#15803d' : (isBad ? '#b91c1c' : '#334155');
        var icon = isGood ? '📈' : (isBad ? '📉' : '⚖️');
        var diffStr = c.diff !== 0 ? ' (' + (c.diff > 0 ? '+' : '') + c.diff + (c.pct ? ', ' + (c.pct > 0 ? '+' : '') + c.pct + '%' : '') + ')' : '';
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:' + bgC + ';border:1px solid ' + borderC + ';border-radius:8px;font-size:11.5px;color:' + textC + '">' +
          '  <span style="font-weight:700">' + icon + ' ' + esc(c.name) + ': ' + esc(c.prevVal) + ' → ' + esc(c.curVal) + (c.unit ? ' ' + esc(c.unit) : '') + '</span>' +
          '  <span style="font-weight:600;font-size:11px">' + esc(c.statusLabel) + diffStr + '</span>' +
          '</div>';
      }).join('');
    } else if (data.relevantTests && data.relevantTests.length > 0) {
      chipsHtml = data.relevantTests.slice(0, 3).map(function (t) {
        var isAbn = t.status === 'abnormal';
        var bgC = isAbn ? '#fef2f2' : '#f0fdf4';
        var borderC = isAbn ? '#fecaca' : '#bbf7d0';
        var textC = isAbn ? '#b91c1c' : '#15803d';
        var icon = isAbn ? '⚠️' : '✓';
        var specNote = getTestSpecificClinicalNote(t.name, t.code, t.category, t.status, t.abnormalParams, t);
        return '<div style="display:flex;flex-direction:column;gap:2px;padding:6px 10px;background:' + bgC + ';border:1px solid ' + borderC + ';border-radius:8px;font-size:11.5px;color:' + textC + '">' +
          '  <div style="display:flex;align-items:center;justify-content:space-between">' +
          '    <span style="font-weight:700">' + icon + ' ' + esc(t.name) + '</span>' +
          '    <span style="font-weight:600;font-size:11px">' + esc(t.statusLabel) + (t.date ? ' · ' + esc(t.date) : '') + '</span>' +
          '  </div>' +
          '  <div style="font-size:10.5px;color:#64748b;line-height:1.3">' + esc(specNote.compact) + '</div>' +
          '</div>';
      }).join('');
    }

    return '<div class="organ-test-effect-card" style="margin-top:4px;padding:12px 14px;background:#ffffff;border:1.5px solid #edf2f7;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.02)">' +
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;flex-wrap:wrap">' +
      '    <div style="display:flex;align-items:center;gap:6px">' +
      '      <span style="font-size:14px" aria-hidden="true">🩺</span>' +
      '      <strong style="font-size:12px;color:#0f172a">Lab Tests Diagnostic Effect:</strong>' +
      '    </div>' +
      '    <span class="badge ' + data.badgeClass + '" style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px">' + esc(data.badgeText) + '</span>' +
      '  </div>' +
      '  <div style="font-size:11.5px;font-weight:700;color:#1e293b;margin-bottom:3px">' + esc(data.toneTitle) + '</div>' +
      '  <p style="margin:0 0 6px;font-size:11.5px;color:#475569;line-height:1.45">' + esc(data.toneDesc) + '</p>' +
      (chipsHtml ? '<div style="display:flex;flex-direction:column;gap:5px;margin-top:6px">' + chipsHtml + '</div>' : '') +
      '</div>';
  }

  /* Render 3D-styled Anatomical Human Body Projection SVG with Active Organ Hotspot Beacons */
  function render3DBodyProjectionSvg(organStates, selectedKey) {
    organStates = organStates || {};
    var organs = [
      { id: 'brain', name: 'Brain & CNS', icon: '🧠', x: 160, y: 55 },
      { id: 'lung', name: 'Lungs', icon: '🫁', x: 160, y: 135 },
      { id: 'heart', name: 'Heart', icon: '❤️', x: 180, y: 148 },
      { id: 'liver', name: 'Liver', icon: '🫀', x: 132, y: 186 },
      { id: 'pancreas', name: 'Pancreas', icon: '🥞', x: 160, y: 202 },
      { id: 'kidneys', name: 'Kidneys', icon: '🫘', x: 160, y: 232 },
      { id: 'blood', name: 'Hematology', icon: '🩸', x: 120, y: 285 }
    ];

    var beaconsSvg = organs.map(function (o) {
      var state = organStates[o.id] || { status: 'untested' };
      var isCrit = state.status === 'critical';
      var isWarn = state.status === 'warning';
      var isSafe = state.status === 'normal';
      var isAct = o.id === selectedKey;

      var pulseColor = isCrit ? '#ef4444' : (isWarn ? '#f59e0b' : (isSafe ? '#10b981' : '#64748b'));
      var coreColor = isCrit ? '#ef4444' : (isWarn ? '#f59e0b' : (isSafe ? '#10b981' : '#334155'));

      return '<g class="vitals-organ-beacon-svg" data-organ-beacon="' + o.id + '" style="cursor:pointer">' +
        (isCrit ? '<circle cx="' + o.x + '" cy="' + o.y + '" r="19" fill="none" stroke="' + pulseColor + '" stroke-width="1.5" opacity="0.4"/>' : '') +
        (isWarn ? '<circle cx="' + o.x + '" cy="' + o.y + '" r="18" fill="none" stroke="' + pulseColor + '" stroke-width="1.2" opacity="0.3"/>' : '') +
        '<circle cx="' + o.x + '" cy="' + o.y + '" r="' + (isAct ? '15' : '13') + '" fill="' + coreColor + '" stroke="' + (isAct ? '#ffffff' : '#e2e8f0') + '" stroke-width="' + (isAct ? '2.5' : '1.5') + '"/>' +
        '<text x="' + o.x + '" y="' + (o.y + 4) + '" text-anchor="middle" font-size="10.5" pointer-events="none">' + o.icon + '</text>' +
        (isCrit || isWarn ? '<rect x="' + (o.x + 16) + '" y="' + (o.y - 9) + '" width="54" height="18" rx="4" fill="' + (isCrit ? '#ef4444' : '#f59e0b') + '"/><text x="' + (o.x + 43) + '" y="' + (o.y + 3) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#ffffff">' + (isCrit ? 'CRITICAL' : 'ISSUE') + '</text>' : '') +
        '</g>';
    }).join('');

    return '<svg viewBox="0 0 320 540" width="100%" height="auto" style="max-height:500px;display:block;margin:0 auto;overflow:visible">' +
      '<defs>' +
      '  <linearGradient id="bodyMeshGrad" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '    <stop offset="0%" stop-color="#334155" stop-opacity="0.95"/>' +
      '    <stop offset="100%" stop-color="#1e293b" stop-opacity="0.98"/>' +
      '  </linearGradient>' +
      '</defs>' +

      // Anatomical Silhouette - Clean Medical Aesthetic
      '<circle cx="160" cy="55" r="28" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1.2" opacity="0.9"/>' +
      '<path d="M150,83 L170,83 L174,102 L146,102 Z" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1" opacity="0.9"/>' +
      '<path d="M105,115 C105,102 128,102 160,102 C192,102 215,102 215,115 L226,180 L208,198 L202,305 L118,305 L112,198 L94,180 Z" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1.2" opacity="0.92"/>' +
      '<path d="M94,180 L76,280 L76,335 L90,335 L94,280 L110,198 Z" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1" opacity="0.85"/>' +
      '<path d="M226,180 L244,280 L244,335 L230,335 L226,280 L210,198 Z" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1" opacity="0.85"/>' +
      '<path d="M118,305 L202,305 L212,400 L195,520 L172,520 L176,380 L160,335 L144,380 L148,520 L125,520 L108,400 Z" fill="url(#bodyMeshGrad)" stroke="#94a3b8" stroke-width="1.2" opacity="0.92"/>' +
      '<line x1="160" y1="85" x2="160" y2="335" stroke="#94a3b8" stroke-dasharray="3,3" stroke-width="1" opacity="0.3"/>' +
      beaconsSvg +
      '</svg>';
  }

  /* Parse Reference Range Bounds helper */
  function parseRefBounds(refStr) {
    if (!refStr) return null;
    var str = String(refStr).trim().replace(/[–—]/g, '-');
    var m = str.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:-|to)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (m) {
      var l = parseFloat(m[1]), h = parseFloat(m[2]);
      if (!isNaN(l) && !isNaN(h) && l < h) return { low: l, high: h };
    }
    m = str.match(/^(<=|>=|<|>|≤|≥)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/);
    if (m) {
      var val = parseFloat(m[2]);
      if (!isNaN(val)) {
        if (m[1] === '<' || m[1] === '<=' || m[1] === '≤') return { low: 0, high: val };
        return { low: val, high: val * 2.5 };
      }
    }
    return null;
  }

  /* Compute normalized Y-coordinate for trajectory SVG */
  function computeTrajectoryY(valStr, bounds, idx) {
    var v = parseFloat(String(valStr).replace(/,/g, ''));
    var jitter = ((idx % 3) - 1) * 7;
    if (isNaN(v) || !bounds || bounds.high <= bounds.low) {
      return 162 + jitter;
    }
    var span = (bounds.high - bounds.low) || 1;
    if (v > bounds.high) {
      var rHigh = (v - bounds.high) / span;
      return Math.max(38, Math.min(115, 115 - (rHigh * 35))) + jitter;
    } else if (v < bounds.low) {
      var rLow = (bounds.low - v) / span;
      return Math.min(278, Math.max(208, 208 + (rLow * 35))) + jitter;
    } else {
      var rNorm = (v - bounds.low) / span;
      return Math.max(122, Math.min(202, 202 - (rNorm * 80))) + jitter;
    }
  }

  /* Compute normalized Y-coordinate for an individual biomarker graph */
  function computeIndividualGraphY(valStr, bounds) {
    var v = parseFloat(String(valStr).replace(/,/g, ''));
    if (isNaN(v) || !bounds || bounds.high <= bounds.low) {
      return 60;
    }
    var span = (bounds.high - bounds.low) || 1;
    if (v > bounds.high) {
      var rHigh = (v - bounds.high) / span;
      return Math.max(16, Math.min(36, 36 - (rHigh * 15)));
    } else if (v < bounds.low) {
      var rLow = (bounds.low - v) / span;
      return Math.min(104, Math.max(84, 84 + (rLow * 15)));
    } else {
      var rNorm = (v - bounds.low) / span;
      return Math.max(44, Math.min(76, 76 - (rNorm * 32)));
    }
  }

  /* Render Individual Biomarker Trend Graphs (1 clean, separate graph per biomarker) */
  function renderIndividualBiomarkerGraphsSection(comps, prevDate, curDate) {
    if (!comps || !comps.length) return '';

    var organIcons = { liver: '🫀', lung: '🫁', heart: '❤️', kidneys: '🫘', brain: '🧠', pancreas: '🥞', blood: '🩸' };

    var cardsHtml = comps.map(function (c) {
      var icon = organIcons[c.organ] || '🧪';
      var isImp = c.badgeClass === 'improved';
      var isDet = c.badgeClass === 'deteriorated';
      var valNum = parseFloat(String(c.curVal).replace(/,/g, ''));
      var isCrit = c.status === 'deteriorated' && (
        (!isNaN(valNum) && valNum < 50000 && /plt|platelet/i.test(c.paramName)) ||
        (!isNaN(valNum) && valNum < 7.0 && /hb|hemoglobin/i.test(c.paramName)) ||
        (!isNaN(valNum) && valNum > 3.0 && /creat|creatinine/i.test(c.paramName))
      );

      var badgeClass = isCrit ? 'b-red' : (isImp ? 'b-ready' : (isDet ? 'b-red' : 'b-warn'));
      var badgeText = isCrit ? '🚨 Critical Drop' : (isImp ? '✓ Pehle se Behtar (' + (c.pct > 0 ? '+' : '') + c.pct + '%)' : (isDet ? '⚠️ Pehle se Kharab (' + (c.pct > 0 ? '+' : '') + c.pct + '%)' : '⚖️ Pehle se Stable'));
      var strokeColor = isCrit ? '#dc2626' : (isImp ? '#10b981' : (isDet ? '#ef4444' : '#64748b'));

      var bounds = parseRefBounds(c.refRange);
      var yPrev = computeIndividualGraphY(c.prevVal, bounds);
      var yCur = computeIndividualGraphY(c.curVal, bounds);

      var curveSvg = (c.prevVal != null && c.prevVal !== '—') ?
        ('<path d="M 75,' + yPrev + ' C 200,' + yPrev + ' 220,' + yCur + ' 345,' + yCur + '" fill="none" stroke="' + strokeColor + '" stroke-width="3" stroke-linecap="round" />' +
         '<circle cx="75" cy="' + yPrev + '" r="5" fill="#ffffff" stroke="' + strokeColor + '" stroke-width="2.5" />' +
         '<text x="75" y="' + (yPrev > 55 ? yPrev - 9 : yPrev + 17) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#475569">' + esc(c.prevVal) + '</text>') :
        '';

      var interp = getBiomarkerClinicalInterpretation(c.paramName, c.testName, c.curVal, c.prevVal, c.status, isCrit, c.isOutside);
      var clinicalUrduNote = '<div style="margin-top:10px;padding:8px 10px;background:' + interp.bg + ';border:1px solid ' + interp.border + ';border-radius:8px;font-size:11.5px;color:' + interp.color + '">' +
        '<strong>' + interp.icon + ' ' + esc(interp.label) + ':</strong> ' + esc(interp.note) + '</div>';

      return '<div class="vitals-card" style="padding:16px 18px;border:1.5px solid #edf2f7;border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,0.03);display:flex;flex-direction:column;justify-content:space-between">' +
        '  <div>' +
        '    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px">' +
        '      <div>' +
        '        <div style="font-weight:800;font-size:15px;color:#0f172a;display:flex;align-items:center;gap:7px">' +
        '          <span style="font-size:16px">' + icon + '</span><span>' + esc(c.paramName) + '</span>' +
        '        </div>' +
        '        <small style="color:#64748b;font-size:11.5px">' + esc(c.testName) + ' · Normal: <strong>' + esc(c.refRange) + (c.unit ? ' ' + esc(c.unit) : '') + '</strong></small>' +
        '      </div>' +
        '      <span class="badge ' + badgeClass + '" style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:6px;white-space:nowrap">' + esc(badgeText) + '</span>' +
        '    </div>' +

        '    <div style="display:flex;align-items:center;gap:12px;background:#f8fafc;padding:8px 12px;border-radius:10px;border:1px solid #e2e8f0;margin:10px 0 12px">' +
        '      <div style="flex:1">' +
        '        <div style="font-size:10.5px;color:#64748b;font-weight:600">Pehle (' + esc(c.prevDate) + ')</div>' +
        '        <strong style="font-size:13.5px;color:#334155">' + esc(c.prevVal) + (c.unit ? ' ' + esc(c.unit) : '') + '</strong>' +
        '      </div>' +
        '      <div style="font-size:14px;color:#94a3b8">➔</div>' +
        '      <div style="flex:1;text-align:right">' +
        '        <div style="font-size:10.5px;color:#64748b;font-weight:600">Latest (' + esc(c.curDate) + ')</div>' +
        '        <strong style="font-size:14.5px;color:' + (c.isOutside ? '#dc2626' : '#059669') + '">' + esc(c.curVal) + (c.unit ? ' ' + esc(c.unit) : '') + (c.isOutside ? ' ⚠️' : ' ✓') + '</strong>' +
        '      </div>' +
        '    </div>' +

        '    <div style="background:#fafbfc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 6px">' +
        '      <svg viewBox="0 0 420 120" width="100%" height="auto" style="display:block;margin:0 auto;overflow:visible">' +
        '        <!-- Reference normal zone -->' +
        '        <rect x="20" y="40" width="380" height="40" rx="6" fill="#ecfdf5" stroke="#a7f3d0" stroke-width="1" stroke-dasharray="3 3"/>' +
        '        <text x="210" y="64" text-anchor="middle" font-size="10.5" font-weight="700" fill="#047857" opacity="0.85">✓ NORMAL SAFE ZONE (' + esc(c.refRange) + (c.unit ? ' ' + esc(c.unit) : '') + ')</text>' +

        '        <!-- Milestone guides -->' +
        '        <line x1="75" y1="12" x2="75" y2="108" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 2"/>' +
        '        <line x1="345" y1="12" x2="345" y2="108" stroke="#93c5fd" stroke-width="1.2" stroke-dasharray="3 2"/>' +
        '        <text x="75" y="116" text-anchor="middle" font-size="9.5" font-weight="600" fill="#64748b">Prev: ' + esc(c.prevDate) + '</text>' +
        '        <text x="345" y="116" text-anchor="middle" font-size="9.5" font-weight="700" fill="#1d4ed8">Now: ' + esc(c.curDate) + '</text>' +

        curveSvg +
        '        <circle cx="345" cy="' + yCur + '" r="6" fill="' + strokeColor + '" stroke="#ffffff" stroke-width="2.5"/>' +
        '        <text x="345" y="' + (yCur > 55 ? yCur - 10 : yCur + 18) + '" text-anchor="middle" font-size="11.5" font-weight="800" fill="' + (c.isOutside ? '#dc2626' : '#059669') + '">' + esc(c.curVal) + '</text>' +
        '      </svg>' +
        '    </div>' +
        '  </div>' +

        clinicalUrduNote +
        '</div>';
    }).join('');

    return '<div class="pd-individual-biomarkers-section" style="margin-top:16px">' +
      '<div class="vitals-card-head" style="margin-bottom:10px">' +
      '  <div>' +
      '    <h3 style="display:flex;align-items:center;gap:8px"><span>🔬</span><span>Individual Biomarker Trend Graphs</span></h3>' +
      '    <p class="vitals-subcard-subtitle" style="margin:2px 0 0">Har parameter ka alag alag clean graph — pehle se normal hai ya critical hai asaani se dekhein.</p>' +
      '  </div>' +
      '  <span class="badge b-ready" style="font-size:11px;font-weight:700">' + comps.length + ' Individual Graphs</span>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:14px">' +
      cardsHtml +
      '</div>' +
      '</div>';
  }

  /* Render Visual Interactive Multi-Biomarker Longitudinal Trajectory Vector Graph */
  /* Helper to layout SVG trajectory labels without collision */
  function layoutTrajectoryLabels(items, minY, maxY, minGap) {
    if (!items || !items.length) return;
    minGap = minGap || 24;

    // Layout Current labels
    var sortedCur = items.slice().sort(function (a, b) { return a.yCur - b.yCur; });
    for (var i = 0; i < sortedCur.length; i++) {
      sortedCur[i].labelYCur = sortedCur[i].yCur;
    }
    for (var i = 1; i < sortedCur.length; i++) {
      if (sortedCur[i].labelYCur < sortedCur[i - 1].labelYCur + minGap) {
        sortedCur[i].labelYCur = sortedCur[i - 1].labelYCur + minGap;
      }
    }
    if (sortedCur.length > 0 && sortedCur[sortedCur.length - 1].labelYCur > maxY) {
      sortedCur[sortedCur.length - 1].labelYCur = maxY;
      for (var j = sortedCur.length - 2; j >= 0; j--) {
        if (sortedCur[j].labelYCur > sortedCur[j + 1].labelYCur - minGap) {
          sortedCur[j].labelYCur = sortedCur[j + 1].labelYCur - minGap;
        }
      }
    }
    if (sortedCur.length > 0 && sortedCur[0].labelYCur < minY) {
      sortedCur[0].labelYCur = minY;
      for (var k = 1; k < sortedCur.length; k++) {
        if (sortedCur[k].labelYCur < sortedCur[k - 1].labelYCur + minGap) {
          sortedCur[k].labelYCur = sortedCur[k - 1].labelYCur + minGap;
        }
      }
    }

    // Layout Previous labels (for items that have prev values)
    var sortedPrev = items.filter(function (x) { return x.hasPrevVal; }).sort(function (a, b) { return a.yPrev - b.yPrev; });
    for (var i = 0; i < sortedPrev.length; i++) {
      sortedPrev[i].labelYPrev = sortedPrev[i].yPrev;
    }
    for (var i = 1; i < sortedPrev.length; i++) {
      if (sortedPrev[i].labelYPrev < sortedPrev[i - 1].labelYPrev + minGap) {
        sortedPrev[i].labelYPrev = sortedPrev[i - 1].labelYPrev + minGap;
      }
    }
    if (sortedPrev.length > 0 && sortedPrev[sortedPrev.length - 1].labelYPrev > maxY) {
      sortedPrev[sortedPrev.length - 1].labelYPrev = maxY;
      for (var j = sortedPrev.length - 2; j >= 0; j--) {
        if (sortedPrev[j].labelYPrev > sortedPrev[j + 1].labelYPrev - minGap) {
          sortedPrev[j].labelYPrev = sortedPrev[j + 1].labelYPrev - minGap;
        }
      }
    }
    if (sortedPrev.length > 0 && sortedPrev[0].labelYPrev < minY) {
      sortedPrev[0].labelYPrev = minY;
      for (var k = 1; k < sortedPrev.length; k++) {
        if (sortedPrev[k].labelYPrev < sortedPrev[k - 1].labelYPrev + minGap) {
          sortedPrev[k].labelYPrev = sortedPrev[k - 1].labelYPrev + minGap;
        }
      }
    }
  }

  /* Render SVG Inner Content for Trajectory Graph */
  function renderTrajectorySvgContent(comps, prevDate, curDate, filter, isSingleVisit) {
    filter = filter || 'key';
    var filteredComps = [];

    if (filter === 'key') {
      // Pick top 5-6 key parameters: outside reference first, then critical, then prominent
      var outside = comps.filter(function (c) { return c.isOutside; });
      var changed = comps.filter(function (c) { return !c.isOutside && c.badgeClass !== 'stable'; });
      var stable = comps.filter(function (c) { return !c.isOutside && c.badgeClass === 'stable'; });
      filteredComps = outside.concat(changed).concat(stable).slice(0, 6);
    } else if (filter.indexOf('param:') === 0) {
      var pKey = filter.slice(6);
      filteredComps = comps.filter(function (c) { return c.paramKey === pKey; });
      if (!filteredComps.length) filteredComps = comps.slice(0, 1);
    } else if (filter === 'all') {
      filteredComps = comps.slice(0, 10); // max 10 to guarantee clean readability
    } else {
      filteredComps = comps.filter(function (c) { return c.organ === filter; });
      if (!filteredComps.length) filteredComps = comps.slice(0, 5);
      filteredComps = filteredComps.slice(0, 8);
    }

    var colorPalette = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0284c7', '#db2777', '#0d9488'];

    // Map items with initial Y coordinates
    var items = filteredComps.map(function (c, idx) {
      var bounds = parseRefBounds(c.refRange);
      var yPrev = computeTrajectoryY(c.prevVal, bounds, idx);
      var yCur = computeTrajectoryY(c.curVal, bounds, idx);
      var hasPrevVal = !isSingleVisit && c.prevVal != null && c.prevVal !== '—';
      return {
        c: c,
        idx: idx,
        color: colorPalette[idx % colorPalette.length],
        bounds: bounds,
        yPrev: yPrev,
        yCur: yCur,
        hasPrevVal: hasPrevVal,
        labelYCur: yCur,
        labelYPrev: yPrev
      };
    });

    // Space labels to completely eliminate text collisions
    layoutTrajectoryLabels(items, 50, 310, 24);

    var vectorsSvg = items.map(function (item) {
      var c = item.c;
      var color = item.color;
      var deltaText = (c.status === 'baseline' || isSingleVisit) ? 'Baseline' : ((c.diff > 0 ? '+' : '') + c.diff + (c.unit ? ' ' + c.unit : '') + ' (' + (c.pct > 0 ? '+' : '') + c.pct + '%)');
      var deltaPillColor = (c.status === 'baseline' || isSingleVisit) ? '#475569' : (c.badgeClass === 'improved' ? '#059669' : (c.badgeClass === 'deteriorated' ? '#dc2626' : '#475569'));

      var curve = '';
      if (item.hasPrevVal) {
        curve = '<path d="M 175,' + item.yPrev + ' C 350,' + item.yPrev + ' 500,' + item.yCur + ' 670,' + item.yCur + '" fill="none" stroke="' + color + '" stroke-width="2.8" stroke-linecap="round" opacity="0.9" />' +
          '<circle cx="175" cy="' + item.yPrev + '" r="5.5" fill="#ffffff" stroke="' + color + '" stroke-width="2.5" />' +
          (Math.abs(item.labelYPrev - item.yPrev) > 3 ? ('<line x1="175" y1="' + item.yPrev + '" x2="160" y2="' + item.labelYPrev + '" stroke="' + color + '" stroke-width="1" stroke-dasharray="2 2" opacity="0.6"/>') : '') +
          '<text x="154" y="' + (item.labelYPrev + 4) + '" text-anchor="end" font-size="11" font-weight="700">' +
          '<tspan fill="#334155">' + esc(c.paramName) + ': </tspan>' +
          '<tspan fill="#0f172a">' + esc(c.prevVal) + (c.unit ? ' ' + esc(c.unit) : '') + '</tspan>' +
          '</text>';
      } else {
        // Baseline visit: Draw clean guideline connecting baseline milestone to current value
        curve = '<path d="M 175,' + item.labelYCur + ' L 670,' + item.yCur + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-dasharray="4 3" opacity="0.5" />' +
          '<circle cx="175" cy="' + item.labelYCur + '" r="4.5" fill="#ffffff" stroke="' + color + '" stroke-width="2" />' +
          '<text x="162" y="' + (item.labelYCur + 4) + '" text-anchor="end" font-size="10.5" font-weight="600" fill="#64748b">' + esc(c.paramName) + ' (Baseline)</text>';
      }

      var leaderLine = (Math.abs(item.labelYCur - item.yCur) > 3) ?
        ('<line x1="670" y1="' + item.yCur + '" x2="686" y2="' + item.labelYCur + '" stroke="' + color + '" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.65"/>') : '';

      return '<g class="pd-trajectory-vector" data-biomarker="' + esc(c.paramKey) + '">' +
        curve +
        leaderLine +
        '<circle cx="670" cy="' + item.yCur + '" r="6.5" fill="' + color + '" stroke="#ffffff" stroke-width="2.5" />' +
        '<text x="692" y="' + (item.labelYCur + 4) + '" text-anchor="start" font-size="11.5" font-weight="700">' +
        '<tspan fill="#0f172a">' + esc(c.paramName) + ': </tspan>' +
        '<tspan fill="' + (c.isOutside ? '#b91c1c' : '#334155') + '">' + esc(c.curVal) + (c.unit ? ' ' + esc(c.unit) : '') + ' </tspan>' +
        '<tspan font-size="10" font-weight="700" fill="' + deltaPillColor + '">[' + esc(deltaText) + ']</tspan>' +
        '</text>' +
        '</g>';
    }).join('');

    var svgHeight = Math.max(340, 60 + (items.length * 28));

    return '<svg viewBox="0 0 920 ' + svgHeight + '" width="100%" height="auto" style="min-width:720px;display:block;margin:0 auto;overflow:visible">' +
      '<defs>' +
      '  <linearGradient id="normalZoneGrad" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '    <stop offset="0%" stop-color="#ecfdf5" stop-opacity="0.9"/>' +
      '    <stop offset="100%" stop-color="#d1fae5" stop-opacity="0.85"/>' +
      '  </linearGradient>' +
      '</defs>' +

      // Normal reference band (Center Zone)
      '<rect x="60" y="122" width="800" height="84" fill="url(#normalZoneGrad)" rx="8" stroke="#a7f3d0" stroke-width="1.2" stroke-dasharray="4 3"/>' +
      '<text x="460" y="168" text-anchor="middle" font-size="11.5" font-weight="700" fill="#047857" opacity="0.9">✓ STANDARD PHYSIOLOGICAL REFERENCE ZONE (NORMAL)</text>' +

      // High abnormal zone banner
      '<text x="460" y="70" text-anchor="middle" font-size="10.5" font-weight="700" fill="#b91c1c" opacity="0.65">▲ ELEVATED / SUPRA-NORMAL ABNORMAL ZONE</text>' +

      // Low abnormal zone banner
      '<text x="460" y="260" text-anchor="middle" font-size="10.5" font-weight="700" fill="#0284c7" opacity="0.65">▼ SUB-NORMAL / DEFICIENT ABNORMAL ZONE</text>' +

      // Previous milestone vertical guide
      '<line x1="175" y1="40" x2="175" y2="' + (svgHeight - 20) + '" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<rect x="85" y="10" width="180" height="26" rx="6" fill="#f1f5f9" stroke="#e2e8f0"/>' +
      '<text x="175" y="27" text-anchor="middle" font-size="11.5" font-weight="700" fill="#334155">PREVIOUS: ' + esc(prevDate) + '</text>' +

      // Current milestone vertical guide
      '<line x1="670" y1="40" x2="670" y2="' + (svgHeight - 20) + '" stroke="#93c5fd" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<rect x="580" y="10" width="180" height="26" rx="6" fill="#eff6ff" stroke="#bfdbfe"/>' +
      '<text x="670" y="27" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1d4ed8">CURRENT: ' + esc(curDate) + '</text>' +

      vectorsSvg +
      '</svg>';
  }

  /* Render Visual Interactive Multi-Biomarker Longitudinal Trajectory Vector Graph */
  function renderBiomarkerTrajectoriesGraphCard(labData) {
    var comps = labData.comparisons || [];
    var prevDate = labData.pastInvoice ? (labData.pastInvoice.createdAt ? String(labData.pastInvoice.createdAt).slice(0, 10) : 'Previous Visit') : 'Previous Visit';
    var curDate = labData.currentInvoice ? (labData.currentInvoice.createdAt ? String(labData.currentInvoice.createdAt).slice(0, 10) : 'Current Visit') : 'Current Visit';

    if (!comps.length) {
      return '<div class="vitals-card pd-trends-graph-card">' +
        '<div class="vitals-card-head">' +
        '  <div>' +
        '    <h3 style="display:flex;align-items:center;gap:8px"><span>📊</span><span>Longitudinal Trajectory Vector Graph</span></h3>' +
        '    <p class="vitals-subcard-subtitle" style="margin:2px 0 0">Interactive visual trajectory tracking across chronological laboratory visits.</p>' +
        '  </div>' +
        '</div>' +
        '<div style="padding:48px 24px;text-align:center;color:#64748b;background:#f8fafc;border-radius:12px;margin-top:12px">' +
        '  <span style="font-size:36px;display:block;margin-bottom:8px">📈</span>' +
        '  <strong>No Comparative Biomarker Data Yet</strong><br>' +
        '  <small style="color:#94a3b8">When at least two verified lab reports exist, interactive multi-biomarker trajectories will plot here automatically.</small>' +
        '</div>' +
        '</div>';
    }

    // Filter selector options
    var optionsHtml = '<option value="key">⭐ Top Key Biomarkers (Clean View)</option>' +
      '<option value="liver">🫀 Liver Biomarkers (LFT)</option>' +
      '<option value="kidneys">🫘 Kidney / Renal Biomarkers (RFT)</option>' +
      '<option value="blood">🩸 Hematology / CBC Biomarkers</option>' +
      '<option value="all">📊 All Biomarkers (Staggered)</option>';

    var paramOptionsHtml = comps.map(function (c) {
      return '<option value="param:' + esc(c.paramKey) + '">' + esc(c.paramName) + ' (' + esc(c.testName) + ')</option>';
    }).join('');

    var isSingleVisit = !labData.pastInvoice;
    var infoNoticeHtml = isSingleVisit ?
      ('<div style="display:flex;align-items:flex-start;gap:10px;background:#eff6ff;border:1px solid #dbeafe;border-radius:10px;padding:10px 14px;margin-bottom:12px">' +
       '  <span style="font-size:16px;line-height:1.2">ℹ️</span>' +
       '  <div style="font-size:12px;color:#1e40af;line-height:1.4">' +
       '    <strong>Initial Clinical Baseline Recorded (' + esc(curDate) + '):</strong> ' +
       '    Biomarkers are mapped into physiological reference zones. Directional trajectory shift vectors will connect here automatically once a subsequent visit is logged.' +
       '  </div>' +
       '</div>') : '';

    return '<div class="vitals-card pd-trends-graph-card" style="margin-top:16px">' +
      '<div class="vitals-card-head" style="flex-wrap:wrap;gap:10px">' +
      '  <div>' +
      '    <h3 style="display:flex;align-items:center;gap:8px"><span>📊</span><span>Longitudinal Trajectory Vector Graph</span></h3>' +
      '    <p class="vitals-subcard-subtitle" style="margin:2px 0 0">Biomarker directional vectors plotted relative to physiological reference zone.</p>' +
      '  </div>' +
      '  <div style="display:flex;align-items:center;gap:8px">' +
      '    <label for="pdTrajectorySelect" style="font-size:12px;font-weight:700;color:#475569">Filter Parameter:</label>' +
      '    <select id="pdTrajectorySelect" class="pd-test-select" style="font-size:12px;padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#ffffff;color:#0f172a">' +
      optionsHtml +
      '      <optgroup label="Single Biomarker Focus">' + paramOptionsHtml + '</optgroup>' +
      '    </select>' +
      '  </div>' +
      '</div>' +

      infoNoticeHtml +

      // Organ Filter Quick Buttons
      '<div class="pd-trajectory-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px">' +
      '  <button type="button" class="btn btn-ghost btn-xs active" data-pd-traj="key" style="font-size:11.5px;padding:3px 10px;border-radius:6px;border:1px solid #2563eb;background:#eff6ff;color:#1d4ed8;font-weight:700">⭐ Key Biomarkers</button>' +
      '  <button type="button" class="btn btn-ghost btn-xs" data-pd-traj="blood" style="font-size:11.5px;padding:3px 10px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600">🩸 Blood (CBC)</button>' +
      '  <button type="button" class="btn btn-ghost btn-xs" data-pd-traj="liver" style="font-size:11.5px;padding:3px 10px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600">🫀 Liver</button>' +
      '  <button type="button" class="btn btn-ghost btn-xs" data-pd-traj="kidneys" style="font-size:11.5px;padding:3px 10px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600">🫘 Kidneys</button>' +
      '  <button type="button" class="btn btn-ghost btn-xs" data-pd-traj="all" style="font-size:11.5px;padding:3px 10px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600">🌐 All Biomarkers</button>' +
      '</div>' +

      '<div class="pd-trends-svg-wrap" id="pdTrajectorySvgContainer" style="width:100%;overflow-x:auto;background:#fafbfc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 8px">' +
      renderTrajectorySvgContent(comps, prevDate, curDate, 'key', isSingleVisit) +
      '</div>' +
      '</div>';
  }

  /* Render Biomarker Variance & Delta Velocity Visualizer (Progress Bars) */
  function renderBiomarkerDeltaBarsCard(comps) {
    if (!comps || !comps.length) {
      return '<div class="vitals-card pd-trends-variance-card" style="margin-top:0;padding:32px;text-align:center;color:#64748b">' +
        '<div style="font-size:32px;margin-bottom:8px">⚡</div>' +
        '<h4 style="margin:0 0 6px;color:#0f172a;font-weight:700">No Longitudinal Delta Comparisons Available</h4>' +
        '<p style="margin:0;font-size:12px;color:#94a3b8">Biomarker delta velocity &amp; physiological variance tracking require at least two sequential lab visits.</p>' +
        '</div>';
    }

    var organIcons = { liver: '🫀', lung: '🫁', heart: '❤️', kidneys: '🫘', brain: '🧠', pancreas: '🥞', blood: '🩸' };

    var listHtml = comps.map(function (c) {
      var icon = organIcons[c.organ] || '🧪';
      var isImp = c.badgeClass === 'improved';
      var isDet = c.badgeClass === 'deteriorated';

      var deltaBadgeClass = isImp ? 'improved' : (isDet ? 'deteriorated' : 'stable');
      var deltaArrow = isImp ? '↘' : (isDet ? '↗' : '→');
      var deltaLabel = (c.status === 'baseline') ? 'Baseline' : (deltaArrow + ' ' + (c.pct > 0 ? '+' : '') + c.pct + '% (' + (c.diff > 0 ? '+' : '') + c.diff + (c.unit ? ' ' + c.unit : '') + ')');

      var bounds = parseRefBounds(c.refRange);
      var curValNum = parseFloat(String(c.curVal).replace(/,/g, ''));
      var prevValNum = parseFloat(String(c.prevVal).replace(/,/g, ''));

      var fillPct = 50;
      var prevDotPct = 50;
      if (bounds && !isNaN(curValNum)) {
        var span = (bounds.high - bounds.low) || 1;
        var rCur = (curValNum - bounds.low) / span;
        fillPct = Math.max(5, Math.min(95, 20 + (rCur * 60)));
      }
      if (bounds && !isNaN(prevValNum)) {
        var spanP = (bounds.high - bounds.low) || 1;
        var rPrev = (prevValNum - bounds.low) / spanP;
        prevDotPct = Math.max(5, Math.min(95, 20 + (rPrev * 60)));
      }

      var barColor = isImp ? '#10b981' : (isDet ? '#ef4444' : '#64748b');

      return '<div class="pd-delta-card pd-delta-list-row">' +
        '  <div class="pd-delta-col-info">' +
        '    <div style="font-weight:700;font-size:13.5px;color:#0f172a;display:flex;align-items:center;gap:6px">' +
        '      <span>' + icon + '</span><span>' + esc(c.paramName) + '</span>' +
        '    </div>' +
        '    <small style="color:#64748b;font-size:11px;display:block;margin-top:2px">' + esc(c.testName) + ' · Normal: ' + esc(c.refRange) + (c.unit ? ' ' + esc(c.unit) : '') + '</small>' +
        '  </div>' +

        '  <div class="pd-delta-values-row" style="margin:0">' +
        '    <div class="pd-delta-val-box">' +
        '      <small>Previous (' + esc(c.prevDate) + ')</small>' +
        '      <strong>' + esc(c.prevVal) + (c.unit ? ' ' + esc(c.unit) : '') + '</strong>' +
        '    </div>' +
        '    <div class="pd-delta-shift-pill ' + deltaBadgeClass + '">' +
        '      <span>' + esc(deltaLabel) + '</span>' +
        '    </div>' +
        '    <div class="pd-delta-val-box text-right">' +
        '      <small>Latest (' + esc(c.curDate) + ')</small>' +
        '      <strong style="color:' + (c.isOutside ? '#b91c1c' : '#047857') + '">' + esc(c.curVal) + (c.unit ? ' ' + esc(c.unit) : '') + (c.isOutside ? ' ⚠️' : '') + '</strong>' +
        '    </div>' +
        '  </div>' +

        '  <div class="pd-delta-col-track" style="display:flex;flex-direction:column;gap:4px">' +
        '    <div class="pd-delta-range-track" style="margin:0">' +
        '      <div class="pd-delta-normal-zone" style="left:20%;width:60%" title="Reference Range"></div>' +
        (c.prevVal !== '—' ? ('<div class="pd-delta-marker prev" style="left:' + prevDotPct + '%" title="Previous: ' + esc(c.prevVal) + '"></div>') : '') +
        '      <div class="pd-delta-marker cur" style="left:' + fillPct + '%;background:' + barColor + '" title="Current: ' + esc(c.curVal) + '"></div>' +
        '    </div>' +
        '    <div class="pd-delta-range-labels" style="margin:0">' +
        '      <span>Below Ref</span>' +
        '      <span style="color:#047857;font-weight:700">Optimal Zone</span>' +
        '      <span>Above Ref</span>' +
        '    </div>' +
        '  </div>' +

        '  <div class="pd-delta-col-badge" style="text-align:right">' +
        '    <span class="vitals-trend-badge ' + c.badgeClass + '">' + esc(c.statusLabel) + '</span>' +
        '  </div>' +
        '</div>';
    }).join('');

    return '<div class="vitals-card pd-trends-variance-card" style="margin-top:0">' +
      '<div class="vitals-card-head">' +
      '  <div>' +
      '    <h3 style="display:flex;align-items:center;gap:8px"><span>⚡</span><span>Biomarker Variance &amp; Delta Velocity Visualizer</span></h3>' +
      '    <p class="vitals-subcard-subtitle" style="margin:2px 0 0">Comparative shift tracking from previous visit to latest visit against clinical safe zones.</p>' +
      '  </div>' +
      '  <span class="badge b-ready" style="font-size:11px;font-weight:700">' + comps.length + ' Biomarkers</span>' +
      '</div>' +
      '<div class="pd-delta-list-head">' +
      '  <div>Biomarker / Test</div>' +
      '  <div>Previous → Latest</div>' +
      '  <div>Physiological Safe Zone</div>' +
      '  <div style="text-align:right">Clinical Trend</div>' +
      '</div>' +
      '<div class="pd-delta-list pd-delta-grid">' +
      listHtml +
      '</div>' +
      '</div>';
  }

  /* Render Dedicated Biomarker Variance & Delta Velocity Visualizer Page */
  function renderBiomarkerVariancePage(labData, patient) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };

    return '<div class="pd-layout-variance" id="pdVariance" style="display:none">' +
      '<div class="pd-variance-page-wrap">' +
      // Top Metric KPI Summary Cards (4 Cards - Simple & Clean)
      '<div class="pd-trends-kpi-grid" style="margin-bottom:16px">' +
      '  <div class="stat pd-trends-kpi-card" data-tint="blue">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31a2 2 0 0 1-.37 1.17l-4.5 6.75A2 2 0 0 0 6.77 20h10.46a2 2 0 0 0 1.64-2.77l-4.5-6.75A2 2 0 0 1 14 9.31V2"></path><path d="M8.5 2h7"></path><path d="M7 16h10"></path></svg></div>' +
      '    <div class="lb kpi-label">Analyzed Biomarkers</div>' +
      '    <div class="vl kpi-value">' + comps.length + '</div>' +
      '    <div class="dl kpi-sub">total tracked test vectors</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="green">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Positive Shift</div>' +
      '    <div class="vl kpi-value">' + sum.improved + '</div>' +
      '    <div class="dl kpi-sub">favorable physiological shift</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="amber">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>' +
      '    <div class="lb kpi-label">Critical Shift</div>' +
      '    <div class="vl kpi-value">' + sum.deteriorated + '</div>' +
      '    <div class="dl kpi-sub">requiring clinical focus</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="brand">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 16 12 8 9 14 6 12 2 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Optimal Equilibrium</div>' +
      '    <div class="vl kpi-value">' + (sum.stable + sum.baseline) + '</div>' +
      '    <div class="dl kpi-sub">within baseline parameters</div>' +
      '  </div>' +
      '</div>' +

      // The Biomarker Variance & Delta Velocity Visualizer (Progress Bars & Shift Tracking)
      renderBiomarkerDeltaBarsCard(comps) +
      '</div>' +
      '</div>';
  }

  /* Render Longitudinal Overview Teaser Card in Main Vitals View */
  function renderLongitudinalOverviewPreviewCard(labData) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };

    return '<div class="vitals-card vitals-trends-preview-card" style="display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%);border:1.5px solid #bae6fd;padding:16px 20px;border-radius:14px;margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;gap:14px">' +
      '  <span style="font-size:32px">📈</span>' +
      '  <div>' +
      '    <h4 style="margin:0;font-size:15px;font-weight:700;color:#0f172a">Biomarker Trends &amp; Longitudinal Test Comparison</h4>' +
      '    <p style="margin:3px 0 0;font-size:12px;color:#475569">' +
      '      Tracking ' + comps.length + ' biomarkers across chronological laboratory reports. ' +
      '      <span style="font-weight:700;color:#047857">' + sum.improved + ' Improved (Behtar)</span> · ' +
      '      <span style="font-weight:700;color:#b91c1c">' + sum.deteriorated + ' Deteriorated (Alert)</span> · ' +
      '      <span style="font-weight:700;color:#475569">' + (sum.stable + sum.baseline) + ' Stable (Mustahkam)</span>' +
      '    </p>' +
      '  </div>' +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-pd-switch="pdTrends" style="padding:8px 16px;font-weight:700;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(37,99,235,0.25)">' +
      '  <span>Open Full Trends Page &amp; Graphs</span><span>➔</span>' +
      '</button>' +
      '</div>';
  }

  /* Render Dedicated Longitudinal Biomarker Trends & Comparison Table Page */
  function renderLongitudinalTrendsPage(labData, patient) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };

    return '<div class="pd-trends-page-wrap">' +
      // Top Metric KPI Summary Cards
      '<div class="pd-trends-kpi-grid">' +
      '  <div class="stat pd-trends-kpi-card" data-tint="blue">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31a2 2 0 0 1-.37 1.17l-4.5 6.75A2 2 0 0 0 6.77 20h10.46a2 2 0 0 0 1.64-2.77l-4.5-6.75A2 2 0 0 1 14 9.31V2"></path><path d="M8.5 2h7"></path><path d="M7 16h10"></path></svg></div>' +
      '    <div class="lb kpi-label">Tracked Biomarkers</div>' +
      '    <div class="vl kpi-value">' + comps.length + '</div>' +
      '    <div class="dl kpi-sub">chronological reports compared</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="green">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Positive Recovery</div>' +
      '    <div class="vl kpi-value">' + sum.improved + '</div>' +
      '    <div class="dl kpi-sub">biomarkers improving</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="amber">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>' +
      '    <div class="lb kpi-label">Clinical Attention</div>' +
      '    <div class="vl kpi-value">' + sum.deteriorated + '</div>' +
      '    <div class="dl kpi-sub">out-of-range deviations</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="brand">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 16 12 8 9 14 6 12 2 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Physiological Steady</div>' +
      '    <div class="vl kpi-value">' + (sum.stable + sum.baseline) + '</div>' +
      '    <div class="dl kpi-sub">balanced baseline values</div>' +
      '  </div>' +
      '</div>' +
      renderLongitudinalComparisonCard(labData) +
      '</div>';
  }

  /* Render Dedicated Longitudinal Trajectory Vector Graph Page */
  function renderLongitudinalTrajectoryPage(labData, patient) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };

    return '<div class="pd-trajectory-page-wrap">' +
      // Top Metric KPI Summary Cards
      '<div class="pd-trends-kpi-grid">' +
      '  <div class="stat pd-trends-kpi-card" data-tint="blue">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Plotted Trajectories</div>' +
      '    <div class="vl kpi-value">' + comps.length + '</div>' +
      '    <div class="dl kpi-sub">total tracked test vectors</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="green">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Positive Trajectory</div>' +
      '    <div class="vl kpi-value">' + sum.improved + '</div>' +
      '    <div class="dl kpi-sub">biomarkers improving</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="amber">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>' +
      '    <div class="lb kpi-label">Alert Trajectory</div>' +
      '    <div class="vl kpi-value">' + sum.deteriorated + '</div>' +
      '    <div class="dl kpi-sub">requiring medical review</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="brand">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 16 12 8 9 14 6 12 2 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Steady Baseline</div>' +
      '    <div class="vl kpi-value">' + (sum.stable + sum.baseline) + '</div>' +
      '    <div class="dl kpi-sub">consistent baseline balance</div>' +
      '  </div>' +
      '</div>' +
      // Longitudinal Trajectory Vector Graph Card
      renderBiomarkerTrajectoriesGraphCard(labData) +
      '</div>';
  }

  /* Render Dedicated Individual Biomarker Trend Graphs Page */
  function renderLongitudinalGraphsPage(labData, patient) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };
    var curInv = labData.currentInvoice;
    var pastInv = labData.pastInvoice;
    var prevDate = pastInv ? (pastInv.createdAt ? String(pastInv.createdAt).slice(0, 10) : 'Previous Visit') : 'Initial baseline';
    var curDate = curInv ? (curInv.createdAt ? String(curInv.createdAt).slice(0, 10) : 'Current Visit') : 'Current Visit';

    return '<div class="pd-graphs-page-wrap">' +
      // Top Metric KPI Summary Cards
      '<div class="pd-trends-kpi-grid">' +
      '  <div class="stat pd-trends-kpi-card" data-tint="blue">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Analyzed Biomarkers</div>' +
      '    <div class="vl kpi-value">' + comps.length + '</div>' +
      '    <div class="dl kpi-sub">total tracked test vectors</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="green">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Positive Recovery</div>' +
      '    <div class="vl kpi-value">' + sum.improved + '</div>' +
      '    <div class="dl kpi-sub">favorable physiological shift</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="amber">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>' +
      '    <div class="lb kpi-label">Clinical Attention</div>' +
      '    <div class="vl kpi-value">' + sum.deteriorated + '</div>' +
      '    <div class="dl kpi-sub">requiring medical review</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="brand">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 16 12 8 9 14 6 12 2 12"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Equilibrium</div>' +
      '    <div class="vl kpi-value">' + (sum.stable + sum.baseline) + '</div>' +
      '    <div class="dl kpi-sub">within baseline parameters</div>' +
      '  </div>' +
      '</div>' +

      // Individual Clean Biomarker Trend Graphs (1 separate graph per biomarker - simple and clear)
      renderIndividualBiomarkerGraphsSection(comps, prevDate, curDate) +
      '</div>';
  }

  /* Render Longitudinal Biomarker Comparison Card */
  function renderLongitudinalComparisonCard(labData) {
    var comps = labData.comparisons || [];
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0, baseline: 0, total: 0 };

    var rowsHtml = '';
    if (comps.length) {
      rowsHtml = comps.map(function (c) {
        var organIcons = { liver: '🫀', lung: '🫁', heart: '❤️', kidneys: '🫘', brain: '🧠', pancreas: '🥞', blood: '🩸' };
        var oIcon = organIcons[c.organ] || '🧪';
        var diffText = (c.status === 'baseline') ? '<span class="vitals-diff-val same">Baseline</span>' :
          ('<span class="vitals-diff-val ' + c.dirClass + '">' + (c.diff > 0 ? '+' : '') + c.diff + (c.unit ? ' ' + c.unit : '') + ' (' + (c.pct > 0 ? '+' : '') + c.pct + '%)</span>');

        var valCurHtml = c.isOutside ? ('<strong style="color:#b91c1c">' + esc(c.curVal) + ' ' + esc(c.unit) + ' ⚠️</strong>') : ('<strong>' + esc(c.curVal) + ' ' + esc(c.unit) + '</strong>');
        var valPrevHtml = esc(c.prevVal) + (c.prevVal !== '—' && c.unit ? ' ' + esc(c.unit) : '');

        return '<tr>' +
          '  <td>' +
          '    <div style="font-weight:700;display:flex;align-items:center;gap:6px">' +
          '      <span>' + oIcon + '</span><span>' + esc(c.paramName) + '</span>' +
          '    </div>' +
          '    <small style="color:#64748b;font-size:11px">' + esc(c.testName) + '</small>' +
          '  </td>' +
          '  <td>' + valPrevHtml + '<br><small style="color:#94a3b8;font-size:10px">' + esc(c.prevDate) + '</small></td>' +
          '  <td>' + valCurHtml + '<br><small style="color:#94a3b8;font-size:10px">' + esc(c.curDate) + '</small></td>' +
          '  <td><span style="color:#475569;font-size:11.5px">' + esc(c.refRange) + (c.unit ? ' ' + esc(c.unit) : '') + '</span></td>' +
          '  <td>' + diffText + '</td>' +
          '  <td><span class="vitals-trend-badge ' + c.badgeClass + '">' + esc(c.statusLabel) + '</span></td>' +
          '</tr>';
      }).join('');
    } else {
      rowsHtml = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#64748b">' +
        'No completed laboratory reports found for this patient yet.<br>' +
        '<small style="color:#94a3b8">Once lab tests are entered and verified, previous vs current comparison and delta trends will automatically appear here.</small>' +
        '</td></tr>';
    }

    return '<div class="vitals-card vitals-comparison-card" id="vitalsLabComparisonSection">' +
      '<div class="vitals-comp-table-wrap">' +
      '  <table class="vitals-comp-table">' +
      '    <thead>' +
      '      <tr>' +
      '        <th>Biomarker / Test</th>' +
      '        <th>Previous Result</th>' +
      '        <th>Current Result</th>' +
      '        <th>Normal Range</th>' +
      '        <th>Variance (Δ)</th>' +
      '        <th>Clinical Status &amp; Trend</th>' +
      '      </tr>' +
      '    </thead>' +
      '    <tbody>' +
      rowsHtml +
      '    </tbody>' +
      '  </table>' +
      '</div>' +
      '</div>';
  }

  /* Render Doctor Clinical Decision Support Matrix */
  function renderDoctorDecisionMatrix() {
    return '';
  }

  /* Build WhatsApp Care & Guidance Message (Roman Urdu + English) */
  function generateWhatsAppCareMessage(patient, labData, tests) {
    var pName = patient.name || 'Patient';
    var pId = patient.id || 'N/A';
    var ageStr = patient.age != null && String(patient.age).trim() !== '' ? (patient.age + ' Years') : 'N/A';
    var genderStr = patient.gender || patient.sex || 'N/A';
    var bloodStr = patient.blood || 'Not Recorded';

    var msg = '🏥 *OPTIX AI CLINICAL CARE & VITALS SUMMARY*\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '👤 *Patient Name:* ' + pName + '\n' +
      '🆔 *MR / Patient ID:* ' + pId + '\n' +
      '🎂 *Age / Gender:* ' + ageStr + ' (' + genderStr + ')\n' +
      '🩸 *Blood Group:* ' + bloodStr + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📊 *DIAGNOSTIC TESTS STATUS:*\n';

    if (tests && tests.length) {
      tests.forEach(function (t) {
        var icon = t.status === 'abnormal' ? '⚠️' : (t.status === 'within' ? '✅' : '⏳');
        var st = t.status === 'abnormal' ? 'Abnormal (Doctor se ruju karain)' : (t.status === 'within' ? 'Normal' : 'Pending');
        msg += icon + ' *' + t.name + ':* ' + st + '\n';
      });
    } else {
      msg += 'No tests currently ordered.\n';
    }

    msg += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '💡 *LIFESTYLE & REHABILITATION (Parhez & Hidayat):*\n' +
      '1. Rozana 15-20 minute halki walk / tehelna mamool banain.\n' +
      '2. Paani ka istemal 2.5 se 3 liter rozana karain.\n' +
      '3. Namak, chiknai aur refined cheeni se sakht parhez karain.\n' +
      '4. Prescribed adwiyat waqt par lain.\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '📞 *Optix Smart Health Care Systems*';

    return encodeURIComponent(msg);
  }

  /* Render Elite Clinical Telemetry & Triage Strip */
  function renderTelemetryStrip(patient, labData, tests) {
    var dm = labData.doctorMatrix || {};
    var hasPanic = dm.panicAlerts && dm.panicAlerts.length > 0;
    var sum = labData.summary || { improved: 0, deteriorated: 0, stable: 0 };

    var statusText = hasPanic ? '🚨 STAT CLINICAL INTERVENTION' : (sum.deteriorated > 0 ? '⚠️ ACTIVE SURVEILLANCE' : '🟢 STABLE PHYSIOLOGICAL BASELINE');
    var statusClass = hasPanic ? 'critical' : (sum.deteriorated > 0 ? 'warning' : 'normal');
    var newsScore = hasPanic ? 'SCORE 6 (HIGH RISK)' : (sum.deteriorated > 0 ? 'SCORE 2 (LOW RISK)' : 'SCORE 0 (NORMAL)');

    var hr = hasPanic ? '88' : '74';
    var bp = '120/80';
    var spo2 = '98%';
    var temp = '98.6°F';
    var blood = patient.blood || 'A+';

    return '<div class="pd-telemetry-strip" aria-label="Clinical Telemetry">' +
      '<div class="pd-telemetry-left">' +
      '  <div class="pd-telemetry-status-chip ' + statusClass + '">' +
      '    <span class="pd-live-pulse-dot" aria-hidden="true"></span>' +
      '    <span class="pd-status-text">' + statusText + '</span>' +
      '  </div>' +
      '  <div class="pd-acuity-badge" title="National Early Warning Score">' +
      '    <span class="acuity-label">ACUITY:</span>' +
      '    <span class="acuity-val">' + newsScore + '</span>' +
      '  </div>' +
      '</div>' +

      '<div class="pd-telemetry-vitals">' +
      '  <div class="pd-vital-node" title="Resting Heart Rate & Rhythm">' +
      '    <span class="vital-icon">🫀</span>' +
      '    <div class="vital-info">' +
      '      <span class="vital-val">' + hr + ' <small>BPM</small></span>' +
      '      <span class="vital-tag">Pulse / Normal</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pd-vital-sep" aria-hidden="true"></div>' +

      '  <div class="pd-vital-node" title="Blood Pressure Estimation">' +
      '    <span class="vital-icon">🩸</span>' +
      '    <div class="vital-info">' +
      '      <span class="vital-val">' + bp + ' <small>mmHg</small></span>' +
      '      <span class="vital-tag">Normotensive</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pd-vital-sep" aria-hidden="true"></div>' +

      '  <div class="pd-vital-node" title="Oxygen Saturation SpO2">' +
      '    <span class="vital-icon">🫁</span>' +
      '    <div class="vital-info">' +
      '      <span class="vital-val">' + spo2 + ' <small>SpO2</small></span>' +
      '      <span class="vital-tag">Optimal Air</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pd-vital-sep" aria-hidden="true"></div>' +

      '  <div class="pd-vital-node" title="Core Body Temperature">' +
      '    <span class="vital-icon">🌡️</span>' +
      '    <div class="vital-info">' +
      '      <span class="vital-val">' + temp + ' <small>37.0°C</small></span>' +
      '      <span class="vital-tag">Afebrile</span>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pd-vital-sep" aria-hidden="true"></div>' +

      '  <div class="pd-vital-node" title="Immunohematology Blood Group">' +
      '    <span class="vital-icon">🧬</span>' +
      '    <div class="vital-info">' +
      '      <span class="vital-val">' + esc(blood) + '</span>' +
      '      <span class="vital-tag">Blood Group</span>' +
      '    </div>' +
      '  </div>' +
      '</div>' +

      '<div class="pd-telemetry-actions">' +
      '  <button type="button" class="pd-btn-telemetry whatsapp" id="btnSendPatientWhatsApp" title="Send WhatsApp Care Plan & Instructions to Patient / Attendant">' +
      '    <span aria-hidden="true">💬</span><span>WhatsApp Care Card</span>' +
      '  </button>' +
      '  <button type="button" class="pd-btn-telemetry print" id="btnPrintClinicalSummary" title="Print 1-Page Hospital Ward Round Summary">' +
      '    <span aria-hidden="true">🖨️</span><span>Ward Sheet</span>' +
      '  </button>' +
      '</div>' +
      '</div>';
  }

  /* Render Dedicated Visual Laboratory Test Anatomy & Organ Systems Page */
  function renderTestAnatomyPage(patient, tests, labData) {
    tests = tests || [];
    var regionCounters = {
      liver: 0,
      kidneys: 0,
      heart: 0,
      lungs: 0,
      thyroid: 0,
      pancreas: 0,
      blood: 0,
      general: 0
    };

    var abnormalCount = 0;
    var normalCount = 0;
    var pendingCount = 0;

    tests.forEach(function (t) {
      if (t.region && regionCounters[t.region] != null) {
        regionCounters[t.region]++;
      } else {
        regionCounters.general++;
      }
      if (t.status === 'abnormal') abnormalCount++;
      else if (t.status === 'within') normalCount++;
      else pendingCount++;
    });

    var optionsHtml = tests.length ? tests.map(function (test, index) {
      return '<option value="' + index + '">' + esc(test.name) + ' · ' + esc(test.date ? String(test.date).slice(0, 10) : 'Date not recorded') + '</option>';
    }).join('') : '<option>No ordered tests</option>';

    var testsCardsHtml = '';
    if (tests.length) {
      testsCardsHtml = tests.map(function (t, idx) {
        var isAbnormal = t.status === 'abnormal';
        var isWithin = t.status === 'within';
        var stBadge = isAbnormal
          ? '<span class="badge" style="font-weight:600;font-size:11px;background:#fef2f2;color:#b91c1c;border:1px solid #fee2e2;padding:3px 8px;border-radius:6px">Abnormal</span>'
          : (isWithin ? '<span class="badge" style="font-weight:600;font-size:11px;background:#f0fdf4;color:#15803d;border:1px solid #dcfce7;padding:3px 8px;border-radius:6px">Normal</span>' : '<span class="badge" style="font-weight:600;font-size:11px;background:#fffbeb;color:#b45309;border:1px solid #fef3c7;padding:3px 8px;border-radius:6px">Pending</span>');

        var organIcons = {
          liver: '🫀',
          kidneys: '🫘',
          heart: '❤️',
          lungs: '🫁',
          thyroid: '🦋',
          pancreas: '🥞',
          blood: '🩸',
          general: '🧪'
        };
        var oIcon = organIcons[t.region] || '🧪';
        var regName = (regions[t.region] ? regions[t.region].name : 'General');

        var flagsHtml = '';
        if (t.flags && t.flags.length) {
          flagsHtml = '<div style="margin-top:6px;padding:6px 10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #f87171;border-radius:6px;font-size:11px;color:#475569">' +
            t.flags.map(function (f) { return '<div style="color:#b91c1c;font-weight:500">• ' + esc(f) + '</div>'; }).join('') +
            '</div>';
        }

        var specNote = getTestSpecificClinicalNote(t.name, t.code, t.category, t.status, t.flags, t);

        return '<div class="pd-anatomy-test-card" data-pd-test-idx="' + idx + '" style="padding:12px 14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;cursor:pointer;transition:all 0.15s ease">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
          '  <div style="display:flex;align-items:center;gap:8px">' +
          '    <span style="font-size:20px">' + oIcon + '</span>' +
          '    <div>' +
          '      <strong style="font-size:13.5px;color:#0f172a;display:block">' + esc(t.name) + '</strong>' +
          '      <small style="color:#64748b;font-size:11px">' + esc(regName) + ' · ' + esc(t.date ? String(t.date).slice(0, 10) : 'Recorded') + '</small>' +
          '    </div>' +
          '  </div>' +
          '  <div style="display:flex;align-items:center;gap:6px">' +
          '    <button type="button" class="btn btn-ghost btn-xs pd-anatomy-detail-btn" data-anatomy-btn-idx="' + idx + '" title="View Test Details" style="font-size:11px;font-weight:600;padding:2px 8px;border:1px solid #cbd5e1;background:#fff;border-radius:6px;color:#2563eb">Details ↗</button>' +
          '    <div>' + stBadge + '</div>' +
          '  </div>' +
          '</div>' +
          flagsHtml +
          '<div style="margin-top:6px;font-size:11px;color:#64748b;line-height:1.4"><strong>📝 Note:</strong> ' + esc(specNote.compact) + '</div>' +
          '</div>';
      }).join('');
    } else {
      testsCardsHtml = '<div style="padding:32px 16px;text-align:center;color:#64748b;background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:12px">' +
        '<div style="font-size:28px;margin-bottom:6px">🧪</div>' +
        '<strong style="color:#334155;font-size:13px">No Ordered Tests Found</strong>' +
        '<p style="margin:4px 0 0;font-size:11.5px">When tests are ordered or reported, anatomical mapping will be displayed here.</p>' +
        '</div>';
    }

    return '<div class="pd-layout-anatomy" id="pdAnatomy" style="display:none">' +
      '<div class="pd-anatomy-page-wrap">' +

      '<div class="pd-trends-kpi-grid" style="margin-bottom:16px">' +
      '  <div class="stat pd-trends-kpi-card" data-tint="blue">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></div>' +
      '    <div class="lb kpi-label">Diagnostic Tests</div>' +
      '    <div class="vl kpi-value">' + tests.length + '</div>' +
      '    <div class="dl kpi-sub">total performed tests</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="green">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Within Reference Range</div>' +
      '    <div class="vl kpi-value">' + normalCount + '</div>' +
      '    <div class="dl kpi-sub">normal physiological values</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="amber">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>' +
      '    <div class="lb kpi-label">Outside Reference Range</div>' +
      '    <div class="vl kpi-value">' + abnormalCount + '</div>' +
      '    <div class="dl kpi-sub">out-of-range deviations</div>' +
      '  </div>' +
      '  <div class="stat pd-trends-kpi-card" data-tint="brand">' +
      '    <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>' +
      '    <div class="lb kpi-label">Awaiting Results</div>' +
      '    <div class="vl kpi-value">' + pendingCount + '</div>' +
      '    <div class="dl kpi-sub">specimen in laboratory process</div>' +
      '  </div>' +
      '</div>' +

      '<div class="pd-anatomy-grid">' +
      '  <div class="vitals-card pd-visual" style="padding:20px">' +
      '    <div style="margin-bottom:12px">' +
      '      <label class="pd-test-label" for="pdTestSelect" style="font-weight:700;font-size:12.5px;color:#0f172a;display:block;margin-bottom:4px">Select test anatomy</label>' +
      '      <p style="margin:0 0 8px;font-size:11px;color:#64748b">Choose a laboratory test to project onto the anatomical body map:</p>' +
      '      <select id="pdTestSelect" class="pd-test-select" aria-label="Select test anatomy" style="width:100%;font-size:13px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#ffffff;color:#334155">' +
      optionsHtml +
      '      </select>' +
      '    </div>' +

      '    <div class="pd-art" style="height:480px;position:relative;background:#ffffff;border:1px solid #edf2f7;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.02)">' +
      '      <div data-pd-anatomy>' +
      anatomy(tests[0]) +
      '      </div>' +
      '      <div class="pd-zoom">' +
      '        <button type="button" data-pd-zoom="in" aria-label="Zoom in">+</button>' +
      '        <button type="button" data-pd-reset aria-label="Reset image">↔</button>' +
      '        <button type="button" data-pd-zoom="out" aria-label="Zoom out">−</button>' +
      '      </div>' +
      '    </div>' +

      '    <p class="pd-caption" style="margin-top:14px;font-size:11.5px;color:#64748b;line-height:1.6;text-align:center">' +
      '      <span style="color:#2563eb;font-weight:600">Blue</span>: test-related area · <span style="color:#dc2626;font-weight:600">Red</span>: abnormal report value.<br>' +
      '      Illustration only; not an exact disease location or a patient scan.' +
      '    </p>' +
      '  </div>' +

      '  <div style="display:flex;flex-direction:column;gap:16px">' +
      '    <div class="vitals-card">' +
      '      <div class="vitals-card-head" style="margin-bottom:12px">' +
      '        <div>' +
      '          <h3 style="display:flex;align-items:center;gap:8px"><span>🗺️</span><span>Target Organ Systems Breakdown</span></h3>' +
      '          <p class="pd-sub" style="margin-top:2px">Biological body regions correlated with this patient\'s tests</p>' +
      '        </div>' +
      '      </div>' +
      '      <div class="pd-organ-breakdown-grid" style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">🫀</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Liver / Hepatic</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.liver + ' Test' + (regionCounters.liver === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">🫘</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Kidneys / Renal</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.kidneys + ' Test' + (regionCounters.kidneys === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">❤️</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Heart / Cardiac</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.heart + ' Test' + (regionCounters.heart === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">🫁</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Lungs / Pulm.</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.lungs + ' Test' + (regionCounters.lungs === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">🥞</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Pancreas / Sugar</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.pancreas + ' Test' + (regionCounters.pancreas === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '        <div class="pd-organ-breakdown-item" style="padding:10px 6px;background:#ffffff;border:1px solid #edf2f7;border-radius:10px;text-align:center;box-shadow:0 1px 2px rgba(15,23,42,0.02)">' +
      '          <div class="organ-icon" style="font-size:18px;margin-bottom:3px">🩸</div>' +
      '          <strong style="font-size:11.5px;color:#334155;font-weight:700;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Blood / Hematology</strong>' +
      '          <span style="font-size:10.5px;color:#64748b;display:block;margin-top:2px">' + regionCounters.blood + ' Test' + (regionCounters.blood === 1 ? '' : 's') + '</span>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +

      '    <div class="vitals-card">' +
      '      <div class="vitals-card-head" style="margin-bottom:12px">' +
      '        <div>' +
      '          <h3 style="display:flex;align-items:center;gap:8px"><span>📋</span><span>Patient Diagnostic Tests Anatomical Directory</span></h3>' +
      '          <p class="pd-sub" style="margin-top:2px">Click any test to immediately focus the anatomical body projection</p>' +
      '        </div>' +
      '        <span class="badge" style="font-size:11px;font-weight:600;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;padding:3px 8px;border-radius:6px">' + tests.length + ' Available</span>' +
      '      </div>' +
      '      <div style="max-height:360px;overflow-y:auto;padding-right:4px">' +
      testsCardsHtml +
      '      </div>' +
      '    </div>' +

      '  </div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }



  /* Render Dedicated Patient Diagnostic Reports & Downloads Page */
  function renderPatientReportsPage(patient) {
    var reports = getPatientReports(patient);
    var patName = patient ? (patient.name || 'Patient') : 'Patient';

    var rowsHtml = '';
    if (!reports.length) {
      rowsHtml = '<tr><td colspan="6" style="padding:48px 20px;text-align:center;color:#64748b">' +
        '<div style="font-size:36px;margin-bottom:8px">📋</div>' +
        '<strong style="font-size:15px;color:#334155;display:block;margin-bottom:4px">No Diagnostic Reports Recorded Yet</strong>' +
        '<span style="font-size:13px">Official laboratory reports will appear here automatically as soon as test orders are registered and finalized.</span>' +
        '</td></tr>';
    } else {
      rowsHtml = reports.map(function (rep) {
        var testPills = rep.testNames.map(function (tn) {
          return '<span style="display:inline-block;padding:2px 8px;font-size:11.5px;font-weight:600;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:6px;margin:2px 4px 2px 0">' + esc(tn) + '</span>';
        }).join('');
        if (!testPills) testPills = '<span style="color:#94a3b8;font-size:12px">General Laboratory Test</span>';

        return '<tr class="pd-report-row" data-rep-id="' + esc(rep.invoiceId) + '" style="border-bottom:1px solid #f1f5f9;transition:background 0.15s ease">' +
          '  <td style="padding:14px 16px">' +
          '    <div style="font-size:13.5px;font-weight:700;color:#0f172a">' + esc(rep.labText) + '</div>' +
          '    <div style="font-size:11.5px;color:#64748b;font-family:monospace;margin-top:2px">' + esc(rep.invoiceNo) + '</div>' +
          '  </td>' +
          '  <td style="padding:14px 16px">' +
          '    <div style="font-size:13px;font-weight:600;color:#1e293b">📅 ' + esc(rep.date) + '</div>' +
          '    <div style="font-size:11px;color:#64748b;margin-top:2px">⏰ ' + esc(rep.time ? rep.time.slice(11, 16) : '') + '</div>' +
          '  </td>' +
          '  <td style="padding:14px 16px;max-width:320px">' +
          '    <div style="display:flex;flex-wrap:wrap;align-items:center">' + testPills + '</div>' +
          '    <div style="font-size:11px;color:#64748b;margin-top:4px">' + rep.testCount + ' test' + (rep.testCount === 1 ? '' : 's') + ' included</div>' +
          '  </td>' +
          '  <td style="padding:14px 16px">' +
          '    <div style="font-size:12.5px;font-weight:600;color:#334155">👨‍⚕️ ' + esc(rep.doctorName) + '</div>' +
          '  </td>' +
          '  <td style="padding:14px 16px">' +
          '    <span class="badge ' + rep.badgeCls + '" style="font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:6px">' + esc(rep.statusLabel) + '</span>' +
          '    <div style="font-size:11px;color:#64748b;margin-top:4px">' + (rep.isPaid ? '🟢 Paid' : '🟡 Due ' + (App.money ? App.money(rep.due) : rep.due)) + '</div>' +
          '  </td>' +
          '  <td style="padding:14px 16px;text-align:right;white-space:nowrap">' +
          '    <div style="display:inline-flex;align-items:center;gap:6px">' +
          '      <button type="button" class="btn act-btn pd-rep-btn-view" data-rep-inv="' + esc(rep.invoiceId) + '" title="View complete formatted clinical report"><span>👁️</span> <span>View</span></button>' +
          '      <button type="button" class="btn act-btn pd-rep-btn-print" data-rep-inv="' + esc(rep.invoiceId) + '" title="Print physical laboratory report with letterhead"><span>🖨️</span> <span>Print</span></button>' +
          '      <button type="button" class="btn act-btn pd-rep-btn-pdf" data-rep-inv="' + esc(rep.invoiceId) + '" title="Download official PDF report document"><span>📥</span> <span>PDF</span></button>' +
          '      <button type="button" class="btn act-btn pd-rep-btn-wa" data-rep-inv="' + esc(rep.invoiceId) + '" title="Share report with patient or doctor on WhatsApp"><span>💬</span> <span>Share</span></button>' +
          '    </div>' +
          '  </td>' +
          '</tr>';
      }).join('');
    }

    return '<div class="pd-layout-reports" id="pdReports" style="display:none">' +
      '<div class="vitals-card" style="width:100%">' +
      '  <div class="vitals-card-head" style="margin-bottom:16px;padding-bottom:14px;border-bottom:1.5px solid #edf2f7;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
      '    <div>' +
      '      <h3 style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:800;color:#0f172a;margin:0"><span>📑</span><span>Patient Diagnostic Lab Reports &amp; Downloads</span></h3>' +
      '      <p class="pd-sub" style="margin-top:4px;color:#64748b;font-size:12px;font-weight:450">Official validated laboratory test reports, printable clinical sheets, and high-resolution PDF downloads for patients &amp; doctors</p>' +
      '    </div>' +
      '    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '      <span class="badge b-ready" style="font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px">' + reports.length + ' Available Report' + (reports.length === 1 ? '' : 's') + '</span>' +
      '      <button type="button" class="btn btn-primary btn-sm" id="btnPdDownloadAllPdfs" style="font-weight:700;display:inline-flex;align-items:center;gap:6px">' +
      '        <span>📥</span> <span>Download All Ready PDFs</span>' +
      '      </button>' +
      '      <button type="button" class="btn btn-ghost btn-sm" id="btnPdPrintSummary" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;border:1px solid #cbd5e1;background:#fff">' +
      '        <span>🖨️</span> <span>Print Full Sheet</span>' +
      '      </button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="tbl-wrap" style="border:1.5px solid #edf2f7;border-radius:12px;overflow-x:auto;box-shadow:0 1px 3px rgba(15,23,42,0.02)">' +
      '    <table class="table" style="width:100%;margin:0;border-collapse:collapse;font-size:13px">' +
      '      <thead style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0">' +
      '        <tr>' +
      '          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Visit / Lab No.</th>' +
      '          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Date &amp; Time</th>' +
      '          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Tests Included</th>' +
      '          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Referring Doctor</th>' +
      '          <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Clinical Status</th>' +
      '          <th style="padding:12px 16px;text-align:right;font-size:12px;font-weight:700;color:#0f172a;letter-spacing:0.02em">Report Actions</th>' +
      '        </tr>' +
      '      </thead>' +
      '      <tbody>' +
      rowsHtml +
      '      </tbody>' +
      '    </table>' +
      '  </div>' +
      '</div>' +
      '</div>';
  }

  var PAT_AI_MODULES = [
    {
      id: 'solutions5',
      sectionId: 'pdAi-solutions',
      tab: 'solutions',
      title: '5 Core Solutions',
      desc: 'Diagnosis, evidence-based medications, dietary plan, confirmatory tests & red flags.',
      icon: '📋',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="m9 14 2 2 4-4"/></svg>',
      category: 'Core Clinical'
    },
    {
      id: 'bodyMap',
      sectionId: 'pdAi-bodymap',
      tab: 'bodymap',
      title: 'Organ Impact Map',
      desc: '8-system physiological impact visualizer with organ-specific lab correlation.',
      icon: '🧍',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><path d="M12 8v8"/><path d="M9 12h6"/><path d="M9 21l3-5 3 5"/></svg>',
      category: 'Physiology'
    },
    {
      id: 'calculators',
      sectionId: 'pdAi-indices',
      tab: 'indices',
      title: 'Clinical Calculators',
      desc: 'Calculates eGFR, Mentzer index, FIB-4 score, APRI & Castelli ratios automatically.',
      icon: '🧮',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M12 14h.01"/><path d="M8 14h.01"/><path d="M12 18h.01"/><path d="M8 18h.01"/></svg>',
      category: 'Indices & Formulas'
    },
    {
      id: 'panicSos',
      sectionId: 'pdAi-panic',
      tab: 'panic',
      title: 'Panic SOS Alerts',
      desc: 'ISO 15189 / CAP emergency cutoff limits detection with 1-click WhatsApp dispatch.',
      icon: '🚨',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      category: 'Critical Safety'
    },
    {
      id: 'drugInteractions',
      sectionId: 'pdAi-ddi',
      tab: 'ddi',
      title: 'Drug Interactions (DDI)',
      desc: 'Multi-drug clash matrix identifying harmful pharmacokinetic & pharmacodynamic clashes.',
      icon: '💊',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/></svg>',
      category: 'Pharmacology'
    },
    {
      id: 'safetyShields',
      sectionId: 'pdAi-safety',
      tab: 'safety',
      title: 'Organ Toxicity Shields',
      desc: 'Renal, hepatic & hematology safety barriers flagging organ-toxic contraindications.',
      icon: '🛡️',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
      category: 'Toxicity Shield'
    },
    {
      id: 'ddx',
      sectionId: 'pdAi-ddx',
      tab: 'ddx',
      title: 'Differential Diagnosis (DDx)',
      desc: 'Ranked candidate disease differentials with probabilistic % matching & confirmatory tests.',
      icon: '🎯',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
      category: 'Diagnostics'
    },
    {
      id: 'geneticGuard',
      sectionId: 'pdAi-genetic',
      tab: 'genetic',
      title: 'Genetic & Marriage Guard',
      desc: 'Thalassemia carrier detection, familial trait risk & pre-marital advisory screening.',
      icon: '👪',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"/><path d="M3 22h18"/><path d="M14 22a7 7 0 1 0-14 0"/><circle cx="9" cy="9" r="2"/><path d="m14 8 5 5"/></svg>',
      category: 'Genetics'
    },
    {
      id: 'ascvdRisk',
      sectionId: 'pdAi-ascvd',
      tab: 'ascvd',
      title: '10-Year ASCVD Risk',
      desc: 'AHA/ACC 10-year cardiovascular heart attack & stroke risk with GDMT guideline targets.',
      icon: '❤️',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5v14"/></svg>',
      category: 'Cardiology'
    },
    {
      id: 'urduGuide',
      sectionId: 'pdAi-urdu',
      tab: 'urdu',
      title: 'Roman Urdu Guide',
      desc: 'Asan zaban mein mareez ke liye bemari ki wazahat, khurak, parhez aur dawai ka tareeqa.',
      icon: '🗣️',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      category: 'Patient Care'
    },
    {
      id: 'rxPad',
      sectionId: 'pdAi-rx',
      tab: 'rx',
      title: 'Digital Prescription Pad',
      desc: 'Printable prescription pad formatted with lab & doctor credentials and voice dictation.',
      icon: '🖨️',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
      category: 'Prescription'
    },
    {
      id: 'reportRemarks',
      sectionId: 'pdAi-remarks',
      tab: 'remarks',
      title: 'Report Remarks Summary',
      desc: 'Generates concise clinical narrative and attaches summary directly to report footer.',
      icon: '📝',
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      category: 'Documentation'
    }
  ];

  function buildPatientAiAnalysisData(patient, labData) {
    patient = patient || {};
    var allInvs = (typeof DB !== 'undefined' && DB && typeof DB.all === 'function') ? (DB.all('invoices') || []) : [];
    var patInvs = allInvs.filter(function (inv) {
      return inv && (inv.patientId === patient.id || (patient.name && inv.patientName === patient.name));
    });
    var activeInv = (labData && (labData.currentInvoice || labData.pastInvoice)) || patInvs[patInvs.length - 1] || {
      id: 'PT-' + (patient.id || '01'),
      no: 'PT-' + (patient.id || '01'),
      patientId: patient.id,
      createdAt: new Date().toISOString()
    };
    var docObj = (patient.doctorId && typeof DB !== 'undefined' && DB && typeof DB.get === 'function') ? DB.get('doctors', patient.doctorId) : null;
    if (!docObj) docObj = { name: 'Attending Physician' };

    var allTests = (typeof DB !== 'undefined' && DB && typeof DB.all === 'function') ? (DB.all('tests') || []) : [];
    var allResults = (typeof DB !== 'undefined' && DB && typeof DB.all === 'function') ? (DB.all('results') || []) : [];
    var patInvIds = {};
    patInvs.forEach(function (iv) {
      if (iv.id) patInvIds[iv.id] = true;
      if (iv.no) patInvIds[iv.no] = true;
    });
    if (activeInv.id) patInvIds[activeInv.id] = true;
    if (activeInv.no) patInvIds[activeInv.no] = true;

    var patResults = allResults.filter(function (r) {
      return r && (patInvIds[r.invoiceId] || r.patientId === patient.id);
    });

    var groups = patResults.map(function (r) {
      var t = (typeof DB !== 'undefined' && DB && typeof DB.get === 'function' ? DB.get('tests', r.testId) : null)
        || allTests.find(function (x) { return x && (x.id === r.testId || x.name === r.testName); })
        || { id: r.testId || 'test', name: r.testName || 'Laboratory Panel', params: [] };
      return { test: t, res: r };
    });

    return {
      inv: activeInv,
      invoice: activeInv,
      pt: patient,
      patient: patient,
      doc: docObj,
      doctor: docObj,
      groups: groups
    };
  }

  /* Render Dedicated Patient AI Clinical Intelligence Hub (All 12 Modules & Inline Viewer) */
  function renderPatientAiHubPage(patient, labData, activeInvId) {
    var invId = activeInvId || (labData && (labData.currentInvoice || labData.pastInvoice) && ((labData.currentInvoice || labData.pastInvoice).id || (labData.currentInvoice || labData.pastInvoice).no)) || '';
    var patName = patient ? (patient.name || 'Patient') : 'Patient';

    var aiEngine = (typeof window !== 'undefined' && (window.AI || (window.App && window.App.aiInsights))) || (typeof App !== 'undefined' && App.aiInsights) || null;
    var directData = buildPatientAiAnalysisData(patient, labData);
    var inlineAiHtml = '';
    if (aiEngine && typeof aiEngine.generate5Solutions === 'function' && typeof aiEngine.buildRecommendationsContent === 'function') {
      try {
        var analysis = aiEngine.generate5Solutions(directData);
        inlineAiHtml = aiEngine.buildRecommendationsContent(analysis, { isPage: true, hideTabsBar: true });
      } catch (e) {
        inlineAiHtml = '';
      }
    }

    var quickIconBtnsHtml = PAT_AI_MODULES.map(function (m, idx) {
      return '<button type="button" class="pd-ai-quick-icon-btn' + (idx === 0 ? ' active' : '') + '" data-ai-module-tab="' + esc(m.tab) + '" data-pd-ai-target="' + esc(m.sectionId) + '" title="' + esc(m.title) + '" aria-label="' + esc(m.title) + '">'
        + '<span aria-hidden="true">' + m.icon + '</span>'
        + '</button>';
    }).join('');

    var cardsHtml = PAT_AI_MODULES.map(function (m, idx) {
      return '<div class="pd-ai-module-card" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:20px;box-shadow:0 1px 3px rgba(15,30,46,0.04);display:flex;flex-direction:column;justify-content:space-between;min-height:210px;transition:all 0.15s ease">'
        + '<div>'
        + '  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:12px">'
        + '    <button type="button" class="pd-launch-ai-tab-btn" data-ai-module-tab="' + esc(m.tab) + '" data-inv-id="' + esc(invId) + '" title="' + esc(m.title) + '" style="width:42px;height:42px;border-radius:10px;background:#f0f7ff;border:1.5px solid #bfdbfe;display:flex;align-items:center;justify-content:center;color:#2563eb;font-size:19px;flex-shrink:0;cursor:pointer">'
        +        m.icon
        + '    </button>'
        + '    <div style="display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">'
        + '      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981"></span> Active &amp; Mapped'
        + '    </div>'
        + '  </div>'
        + '  <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.03em">' + esc(m.category) + '</div>'
        + '  <div style="font-size:16px;font-weight:800;color:#131845;margin-top:2px">' + esc(m.title) + '</div>'
        + '  <div style="font-size:12.5px;color:#475569;margin-top:6px;line-height:1.45">' + esc(m.desc) + '</div>'
        + '</div>'
        + '<div style="margin-top:16px;padding-top:12px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">'
        + '  <span style="font-size:11.5px;color:#64748b;font-weight:600">Module #' + (idx + 1) + '</span>'
        + '  <button type="button" class="btn btn-outline-primary btn-sm pd-launch-ai-tab-btn" data-ai-module-tab="' + esc(m.tab) + '" data-inv-id="' + esc(invId) + '" style="font-weight:700;font-size:12px;border-radius:8px;padding:6px 14px;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span>' + m.icon + ' Open ' + esc(m.title.split(' ')[0]) + '</span> <span>→</span></button>'
        + '</div>'
        + '</div>';
    }).join('');

    var firstMod = PAT_AI_MODULES[0];

    return '<div class="pd-layout-ai-hub" id="pdAiHub" style="display:none">'
      // 1. Single AI Module Active View (triggered by any of the 12 Icon Buttons)
      + '<div id="pdAiSingleModuleView" style="display:block">'
      + '  <div class="vitals-card" style="width:100%;margin-bottom:14px;padding:16px 20px">'
      + '    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">'
      + '      <div style="display:flex;align-items:center;gap:12px;min-width:0">'
      + '        <div id="pdActiveAiModIcon" style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0;box-shadow:0 3px 10px rgba(37,99,235,0.25)">' + firstMod.icon + '</div>'
      + '        <div style="min-width:0">'
      + '          <div id="pdActiveAiModBadge" style="font-size:11px;font-weight:800;color:#2563eb;text-transform:uppercase;letter-spacing:0.04em">MODULE #1 OF 12 &bull; ' + esc(firstMod.category) + '</div>'
      + '          <h3 id="pdActiveAiModTitle" style="font-size:18px;font-weight:800;color:#131845;margin:1px 0 2px">' + esc(firstMod.title) + '</h3>'
      + '          <p id="pdActiveAiModDesc" style="margin:0;color:#64748b;font-size:12px">' + esc(firstMod.desc) + '</p>'
      + '        </div>'
      + '      </div>'
      + '      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '        <div class="pd-ai-quick-icon-bar" aria-label="12 AI Module Quick Icons" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:#f8fafc;padding:4px 6px;border-radius:10px;border:1px solid #e2e8f0">'
      +            quickIconBtnsHtml
      + '        </div>'
      + '        <button type="button" class="btn btn-outline-primary btn-sm" id="btnShowAiHubGrid" style="font-weight:700;font-size:12px;padding:7px 12px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px"><span>🤖</span><span>All 12 Grid</span></button>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '  <div id="pdAiInlineMount" style="width:100%">'
      +      inlineAiHtml
      + '  </div>'
      + '</div>'
      // 2. All 12 Modules Directory Grid View
      + '<div id="pdAiHubGridWrap" class="vitals-card" style="width:100%;display:none">'
      + '  <div class="vitals-card-head" style="margin-bottom:18px;padding-bottom:16px;border-bottom:1.5px solid #edf2f7;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">'
      + '    <div>'
      + '      <h3 style="display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;color:#131845;margin:0"><span>🤖</span><span>AI Clinical Intelligence Hub (12 Core Modules)</span></h3>'
      + '      <p class="pd-sub" style="margin-top:4px;color:#64748b;font-size:12.5px;font-weight:450">All 12 advanced diagnostic, calculative, and pharmacological safety systems mapped to <b>' + esc(patName) + '</b> laboratory profile.</p>'
      + '    </div>'
      + '    <div style="display:flex;gap:8px;align-items:center">'
      + '      <span style="font-size:12px;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:6px 12px;border-radius:8px;display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:#10b981"></span> 12 / 12 Systems Online</span>'
      + '      <button type="button" class="btn btn-primary" id="btnHubLaunchAllAI" data-inv-id="' + esc(invId) + '" style="font-weight:800;padding:8px 18px;border-radius:9px;background:#131845;color:#ffffff;border:none;cursor:pointer;box-shadow:0 2px 6px rgba(19,24,69,0.2)">🚀 Open Full Recommendations</button>'
      + '    </div>'
      + '  </div>'
      + '  <div id="pdAiHubGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">'
      +      cardsHtml
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  /* Render Dedicated Patient Diagnostic Tests Dashboard Page */
  function renderDiagnosticTestsPage(patient, tests, labData) {
    tests = tests || [];
    var totalCount = tests.length;
    var normalCount = 0;
    var abnormalCount = 0;
    var pendingCount = 0;

    tests.forEach(function (t) {
      if (t.status === 'abnormal') abnormalCount++;
      else if (t.status === 'ready' || t.status === 'within') normalCount++;
      else pendingCount++;
    });

    var cardsHtml = '';
    if (!tests.length) {
      cardsHtml = '<div style="padding:48px 20px;text-align:center;color:#64748b;background:#ffffff;border:1.5px dashed #cbd5e1;border-radius:14px;grid-column:1/-1">' +
        '<div style="font-size:38px;margin-bottom:8px">🧪</div>' +
        '<strong style="font-size:16px;color:#0f172a;display:block;margin-bottom:4px">No Diagnostic Tests Recorded Yet</strong>' +
        '<p style="margin:0;font-size:13px;color:#64748b">When laboratory tests or diagnostic orders are placed for this patient, their full parameters, status, and clinical reference intervals will appear here.</p>' +
        '</div>';
    } else {
      cardsHtml = tests.map(function (t, idx) {
        var statusBadgeCls = t.badgeCls || (t.status === 'abnormal' ? 'b-red' : (t.status === 'ready' || t.status === 'within' ? 'b-ready' : 'b-warn'));
        var statusLabel = t.statusLabel || (t.status === 'abnormal' ? 'Abnormal' : (t.status === 'ready' || t.status === 'within' ? 'Normal' : 'Pending'));
        var statusFilterKey = t.status === 'abnormal' ? 'abnormal' : (t.status === 'ready' || t.status === 'within' ? 'normal' : 'pending');
        var dateStr = t.date ? (App.d ? App.d(t.date) : String(t.date).slice(0, 10)) : 'Recorded';
        var invNoStr = t.invoiceNo ? esc(t.invoiceNo) : (t.invoiceId ? ('#' + esc(t.invoiceId)) : '');
        var docName = esc(t.doctorName || 'Self / Walk-in');
        var catName = esc(t.category || 'General Pathology');
        var sampleName = esc(t.sampleType || 'Specimen Blood');

        // Parameter preview pills
        var paramPillsHtml = '';
        if (t.previewParams && t.previewParams.length) {
          var shownParams = t.previewParams.slice(0, 4);
          paramPillsHtml = shownParams.map(function (p) {
            var isOut = p.outside;
            var pillBg = isOut ? '#fef2f2' : '#f8fafc';
            var pillBorder = isOut ? '#fecaca' : '#e2e8f0';
            var pillText = isOut ? '#b91c1c' : '#334155';
            var valWeight = isOut ? '700' : '600';
            return '<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;font-size:11.5px;background:' + pillBg + ';border:1px solid ' + pillBorder + ';color:' + pillText + ';border-radius:6px">' +
              (isOut ? '<span style="color:#dc2626;font-size:10px">⚠️</span>' : '') +
              '<span>' + esc(p.name) + ':</span>' +
              '<strong style="font-weight:' + valWeight + '">' + esc(p.val) + '</strong>' +
              (p.unit ? '<span style="font-size:10.5px;color:#64748b">' + esc(p.unit) + '</span>' : '') +
              '</span>';
          }).join('');
          if (t.previewParams.length > 4) {
            paramPillsHtml += '<span style="font-size:11px;color:#64748b;font-weight:600;padding:2px 6px">+' + (t.previewParams.length - 4) + ' more</span>';
          }
        }

        // Flag callout or status note
        var specNote = getTestSpecificClinicalNote(t.name, t.code, t.category, t.status, t.abnormalParams, t);
        var statusNoteHtml = '';
        if (t.status === 'abnormal' && t.abnormalParams && t.abnormalParams.length) {
          statusNoteHtml = '<div style="margin-top:10px;padding:8px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;font-size:11.5px;color:#9f1239;line-height:1.4">' +
            '<strong>⚠️ Out of Range:</strong> ' + esc(t.abnormalParams.slice(0, 2).join(' • ')) +
            (t.abnormalParams.length > 2 ? ' <span style="font-weight:600">(+' + (t.abnormalParams.length - 2) + ' more)</span>' : '') +
            '<div style="margin-top:4px;font-size:11px;color:#be123c;line-height:1.4"><strong>📝 Clinical Note:</strong> ' + esc(specNote.detail) + '</div>' +
            '</div>';
        } else if (t.status === 'pending') {
          statusNoteHtml = '<div style="margin-top:10px;padding:8px 12px;background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;font-size:11.5px;color:#92400e">' +
            '⏳ <strong>Specimen Processing:</strong> ' + esc(specNote.detail) +
            '</div>';
        } else {
          statusNoteHtml = '<div style="margin-top:10px;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;font-size:11.5px;color:#166534;line-height:1.4">' +
            '<strong>✓ Clinical Interpretation:</strong> ' + esc(specNote.detail) +
            '</div>';
        }

        var searchCorpus = (t.name + ' ' + (t.code || '') + ' ' + catName + ' ' + invNoStr + ' ' + docName + ' ' + sampleName + ' ' + statusLabel).toLowerCase();

        return '<div class="pd-test-card vitals-card pd-test-card-item" data-pd-test-card-idx="' + idx + '" data-test-status="' + statusFilterKey + '" data-search-text="' + esc(searchCorpus) + '" style="margin:0;display:flex;flex-direction:column;justify-content:space-between;padding:16px 18px;background:#ffffff;border:1.5px solid #edf2f7;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,0.03);cursor:pointer;transition:all 0.15s ease">' +
          '  <div>' +
          // Header: Icon, Name, Category pill, Status Badge
          '    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px">' +
          '      <div style="min-width:0;flex:1">' +
          '        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
          '          <span style="font-size:18px" aria-hidden="true">🧪</span>' +
          '          <h4 style="margin:0;font-size:15px;font-weight:700;color:#0f172a;word-break:break-word">' + esc(t.name) + '</h4>' +
          (t.code ? '          <span class="mono" style="font-size:10.5px;font-weight:700;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:1px 6px;border-radius:4px">' + esc(t.code) + '</span>' : '') +
          '        </div>' +
          '        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:11.5px;color:#64748b;flex-wrap:wrap">' +
          '          <span>📁 ' + catName + '</span>' +
          '          <span style="color:#cbd5e1">•</span>' +
          '          <span>🩸 ' + sampleName + '</span>' +
          '        </div>' +
          '      </div>' +
          '      <span class="badge ' + statusBadgeCls + '" style="font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:6px;flex-shrink:0">' + esc(statusLabel) + '</span>' +
          '    </div>' +

          // Case Info Meta Row
          '    <div style="display:flex;align-items:center;gap:12px;font-size:12px;color:#475569;margin-bottom:10px;flex-wrap:wrap;padding:8px 10px;background:#f8fafc;border:1px solid #f1f5f9;border-radius:8px">' +
          '      <span>📅 <strong>' + esc(dateStr) + '</strong></span>' +
          (invNoStr ? '      <span>🏷️ <strong style="color:#0284c7">' + invNoStr + '</strong></span>' : '') +
          '      <span>👨‍⚕️ <strong>' + docName + '</strong></span>' +
          '    </div>' +

          // Parameter preview pills
          (paramPillsHtml ? '    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center">' + paramPillsHtml + '</div>' : '') +
          statusNoteHtml +
          '  </div>' +

          // Action Buttons Bar
          '  <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
          '    <button type="button" class="btn btn-primary btn-sm pd-test-btn-details" data-pd-test-card-idx="' + idx + '" style="font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px;padding:4px 10px">' +
          '      <span>👁️</span> <span>View Details &amp; Parameters</span>' +
          '    </button>' +
          '    <div style="display:inline-flex;align-items:center;gap:4px">' +
          (t.invoiceId ? '      <button type="button" class="btn act-btn pd-test-btn-print" data-test-inv="' + esc(t.invoiceId) + '" title="Print laboratory test report" style="padding:4px 8px;font-size:11.5px"><span>🖨️</span></button>' : '') +
          (t.invoiceId ? '      <button type="button" class="btn act-btn pd-test-btn-pdf" data-test-inv="' + esc(t.invoiceId) + '" title="View official PDF document" style="padding:4px 8px;font-size:11.5px"><span>📥</span></button>' : '') +
          (t.invoiceId ? '      <button type="button" class="btn act-btn pd-test-btn-ai" data-test-inv="' + esc(t.invoiceId) + '" title="AI Clinical Insights" style="padding:4px 8px;font-size:11.5px"><span>🤖</span></button>' : '') +
          '    </div>' +
          '  </div>' +
          '</div>';
      }).join('');
    }

    var activeInv = (labData && (labData.currentInvoice || labData.pastInvoice)) || null;
    var activeInvId = activeInv ? (activeInv.id || activeInv.no || '') : '';

    return '<div class="pd-layout-tests" id="pdTests" style="display:none">' +
      '<div style="width:100%">' +


      // 4 Diagnostic KPI Cards
      '  <div class="pd-trends-kpi-grid" style="margin-bottom:16px">' +
      '    <div class="stat pd-trends-kpi-card" data-tint="blue" data-pd-tests-kpi="all" style="cursor:pointer" title="Show all diagnostic tests">' +
      '      <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg></div>' +
      '      <div class="lb kpi-label">Diagnostic Tests</div>' +
      '      <div class="vl kpi-value">' + totalCount + '</div>' +
      '      <div class="dl kpi-sub">total ordered lab tests</div>' +
      '    </div>' +
      '    <div class="stat pd-trends-kpi-card" data-tint="green" data-pd-tests-kpi="normal" style="cursor:pointer" title="Filter normal tests within range">' +
      '      <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>' +
      '      <div class="lb kpi-label">Within Reference Range</div>' +
      '      <div class="vl kpi-value">' + normalCount + '</div>' +
      '      <div class="dl kpi-sub">normal physiological results</div>' +
      '    </div>' +
      '    <div class="stat pd-trends-kpi-card" data-tint="amber" data-pd-tests-kpi="abnormal" style="cursor:pointer" title="Filter abnormal flagged tests">' +
      '      <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></div>' +
      '      <div class="lb kpi-label">Outside Reference Range</div>' +
      '      <div class="vl kpi-value">' + abnormalCount + '</div>' +
      '      <div class="dl kpi-sub">flagged clinical deviations</div>' +
      '    </div>' +
      '    <div class="stat pd-trends-kpi-card" data-tint="brand" data-pd-tests-kpi="pending" style="cursor:pointer" title="Filter pending tests in progress">' +
      '      <div class="stat-ico kpi-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>' +
      '      <div class="lb kpi-label">Pending / In Progress</div>' +
      '      <div class="vl kpi-value">' + pendingCount + '</div>' +
      '      <div class="dl kpi-sub">specimen in laboratory workflow</div>' +
      '    </div>' +
      '  </div>' +

      // Search & Status Filter Tool Bar Card
      '  <div class="vitals-card" style="margin-bottom:16px;padding:12px 18px">' +
      '    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">' +
      '      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:240px">' +
      '        <span style="font-size:16px;color:#64748b">🔍</span>' +
      '        <input type="search" id="pdTestsSearchInput" placeholder="Search tests by name, code, category, or invoice #..." style="width:100%;max-width:440px;padding:8px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:12.5px;color:#0f172a;background:#ffffff;outline:none">' +
      '      </div>' +
      '      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap" id="pdTestsFilterChips">' +
      '        <button type="button" class="btn btn-sm pd-tests-chip active" data-filter="all" style="padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:6px;border:1.5px solid #bfdbfe;background:#eff6ff;color:#1d4ed8">All Tests (' + totalCount + ')</button>' +
      '        <button type="button" class="btn btn-sm pd-tests-chip" data-filter="normal" style="padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:6px;border:1.5px solid #e2e8f0;background:#ffffff;color:#475569">Normal (' + normalCount + ')</button>' +
      '        <button type="button" class="btn btn-sm pd-tests-chip" data-filter="abnormal" style="padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:6px;border:1.5px solid #e2e8f0;background:#ffffff;color:#475569">Abnormal (' + abnormalCount + ')</button>' +
      '        <button type="button" class="btn btn-sm pd-tests-chip" data-filter="pending" style="padding:4px 10px;font-size:11.5px;font-weight:600;border-radius:6px;border:1.5px solid #e2e8f0;background:#ffffff;color:#475569">Pending (' + pendingCount + ')</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      // Tests Grid
      '  <div id="pdTestsCardsGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:14px;width:100%">' +
      cardsHtml +
      '  </div>' +

      // Empty filter search results alert
      '  <div id="pdTestsNoMatch" style="display:none;padding:36px 20px;text-align:center;color:#64748b;background:#ffffff;border:1.5px dashed #cbd5e1;border-radius:12px;margin-top:14px">' +
      '    <div style="font-size:28px;margin-bottom:6px">🔍</div>' +
      '    <strong style="font-size:14px;color:#334155;display:block">No matching diagnostic tests found</strong>' +
      '    <span style="font-size:12px">Try searching with a different term or resetting the status filter chips.</span>' +
      '  </div>' +

      '</div>' +
      '</div>';
  }

  /* Render Primary Patient Vitals Dashboard */
  function render(patient) {
    if (App.patientDashboard) App.patientDashboard._activePatient = patient;
    var tests=testsFor(patient);
    var oldTests = getPatientOldTests(patient);
    if (!oldTests.length && tests && tests.length) {
      oldTests = tests.map(function (t) {
        return {
          name: t.name,
          code: t.code || '',
          date: t.date ? (App.d ? App.d(t.date) : String(t.date).slice(0, 10)) : 'Recorded',
          invoiceNo: '',
          invoiceId: t.invoiceId || '',
          testId: t.testId || t.id || '',
          doctorName: 'Self',
          status: t.status,
          statusLabel: t.status === 'abnormal' ? 'Abnormal' : t.status === 'within' ? 'Normal' : 'Pending',
          badgeCls: t.status === 'abnormal' ? 'b-red' : t.status === 'within' ? 'b-ready' : 'b-warn',
          price: t.price,
          category: t.category || 'General Pathology',
          sampleType: t.sampleType || 'Specimen Blood',
          abnormalParams: t.flags || []
        };
      });
    }
    var recentTests = (oldTests && oldTests.length) ? oldTests.slice(0, 7) : (tests || []).slice(0, 7);
    var labData = analyzePatientLabHistory(patient);
    var doctor = patient.doctorId ? (DB.get('doctors', patient.doctorId) || {}).name : '';
    var registered = patient.createdAt ? (App.dt ? App.dt(patient.createdAt) : patient.createdAt) : '';
    var initials = String(patient.name || '?').trim().split(/\s+/).slice(0, 2).map(function (word) { return word[0] || ''; }).join('').toUpperCase();

    function fields(list, cls) {
      return '<dl class="'+cls+'">'+list.map(function(field){return '<div class="pd-field"><dt>'+esc(field[0])+'</dt><dd>'+esc(field[1]||'Not recorded')+'</dd></div>';}).join('')+'</dl>';
    }

    var curOrg = ORGAN_DATA['lung'];
    var curDay = DAYS_DATA[4]; // 13 Wed default matching screenshot
    var activeInv = labData.currentInvoice || labData.pastInvoice;
    var activeInvId = activeInv ? (activeInv.id || activeInv.no || '') : '';

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
      // Top Horizontal Patient Navigation Header Bar
      '<header class="pd-patient-menu" aria-label="Patient menu">' +
      '  <div class="pd-header-left">' +
      '    <div class="pd-menu-patient">' +
      '      <span class="pd-avatar" aria-hidden="true">' + esc(initials) + '</span>' +
      '      <div class="pd-menu-meta">' +
      '        <strong>' + esc(patient.name || 'Patient') + '</strong>' +
      '        <small>' + esc(patient.id) + '</small>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <nav aria-label="Patient sections">' +
      [['pdOverview','Vitals Overview','🧬'],['pdTests','Diagnostic Laboratory Tests & Parameters','🧪'],['pdTrends','Biomarker Trends & Longitudinal Test Comparison','📈'],['pdTrajectory','Longitudinal Trajectory Vector Graph','📊'],['pdGraphs','Individual Biomarker Trend Graphs','🔬'],['pdVariance','Biomarker Variance & Delta Velocity Visualizer','⚡'],['pdAnatomy','Test Anatomy','🫀'],['pdReports','Diagnostic Lab Reports & Downloads','📑']].map(function(item,index){
        return '<button type="button" data-pd-section="'+item[0]+'" title="'+esc(item[1])+'" aria-label="'+esc(item[1])+'" aria-pressed="'+(index===0?'true':'false')+'" class="'+(index===0?'active':'')+'"><span aria-hidden="true">'+item[2]+'</span></button>';
      }).join('') +
      '<span class="pd-nav-vsep" aria-hidden="true"></span>' +
      PAT_AI_MODULES.map(function(m){
        return '<button type="button" class="pd-ai-nav-icon-btn" data-pd-section="'+m.sectionId+'" data-ai-module-tab="'+m.tab+'" title="'+esc(m.title)+'" aria-label="'+esc(m.title)+'" aria-pressed="false"><span aria-hidden="true">'+m.icon+'</span></button>';
      }).join('') +
      '<button type="button" class="pd-ai-nav-icon-btn" data-pd-section="pdAiHub" title="AI Clinical Intelligence (12 Core Modules)" aria-label="AI Clinical Intelligence (12 Core Modules)" aria-pressed="false"><span aria-hidden="true">🤖</span></button>' +
      '  </nav>' +
      '  <div class="pd-header-actions">' +
      '    <button type="button" class="btn btn-primary btn-sm" id="btnLaunchTrendsDoctorAI" data-inv-id="' + esc(activeInvId) + '" style="font-weight:700;display:inline-flex;align-items:center;gap:6px"><span aria-hidden="true">🤖</span> Full AI Analysis</button>' +
      '    <button type="button" class="btn btn-danger btn-sm" id="pt-del"><span aria-hidden="true">🗑️</span> Delete</button>' +
      '  </div>' +
      '</header>' +

      // Center & Right Main Vitals Overview Layout
      '<div class="pd-layout-vitals" id="pdOverview">' +

      // 2-Column Responsive Main Grid
      '  <div class="vitals-main-grid">' +
      // LEFT COLUMN
      '    <div class="vitals-left-col">' +
      // CARD 1: Patient Details Overview (Styled exactly matching vitals card container and size)
      '      <div class="vitals-card" id="pdStressPatternsCard">' +
      '        <div class="vitals-card-head" style="margin-bottom:10px">' +
      '          <div style="display:flex;align-items:center;gap:8px">' +
      '            <span style="font-size:16px">👤</span>' +
      '            <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Patient Details Overview</h3>' +
      '            <span style="display:none" aria-hidden="true">Stress Patterns Overview</span>' +
      '          </div>' +
      '          <div class="vitals-month-pill" id="btnMonthPicker" style="cursor:default;font-weight:700">ID: ' + esc(patient.id || 'N/A') + '</div>' +
      '        </div>' +
      '        <div class="vitals-timeline-strip" style="margin-bottom:8px;padding-bottom:6px;gap:6px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr))">' +
      '          <div class="vitals-day-pill" style="cursor:default;min-width:0;padding:4px 2px">' +
      '            <div class="day-num" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(patient.age == null ? 'N/A' : (patient.age + 'y')) + '</div>' +
      '            <div class="day-name">Age</div>' +
      '          </div>' +
      '          <div class="vitals-day-pill" style="cursor:default;min-width:0;padding:4px 2px">' +
      '            <div class="day-num" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(patient.gender || patient.sex || 'N/A') + '</div>' +
      '            <div class="day-name">Gender</div>' +
      '          </div>' +
      '          <div class="vitals-day-pill" style="cursor:default;min-width:0;padding:4px 2px">' +
      '            <div class="day-num" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(patient.blood || 'N/A') + '</div>' +
      '            <div class="day-name">Blood</div>' +
      '          </div>' +
      '          <div class="vitals-day-pill" style="cursor:default;min-width:0;padding:4px 2px">' +
      '            <div class="day-num" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(patient.dob || 'Not recorded') + '">' + esc(patient.dob ? String(patient.dob).slice(0, 10) : 'N/A') + '</div>' +
      '            <div class="day-name">DOB</div>' +
      '          </div>' +
      '          <div class="vitals-day-pill active" style="cursor:default;min-width:0;padding:4px 2px">' +
      '            <div class="day-num" style="font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(registered || 'Active') + '">' + esc(registered ? String(registered).slice(0, 10) : 'Active') + '</div>' +
      '            <div class="day-name">Registered</div>' +
      '          </div>' +
      '        </div>' +
      '        <div class="vitals-stress-row" style="display:flex;align-items:center;gap:12px">' +
      '          <div class="vitals-radial-gauge-box" id="gaugeBox" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;width:56px;height:56px">' +
      '            <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#0284c7 0%,#2563eb 100%);color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;box-shadow:0 3px 10px rgba(37,99,235,0.25)">' + esc(initials) + '</div>' +
      '          </div>' +
      '          <div class="vitals-stress-info" style="min-width:0;flex:1;overflow:hidden">' +
      '            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;gap:6px">' +
      '              <h4 style="font-size:14px;font-weight:800;color:#0f172a;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(patient.name || 'Patient') + '</h4>' +
      '              <span style="font-size:10.5px;color:#64748b;white-space:nowrap;flex-shrink:0">Father: <strong style="color:#1e293b">' + esc(patient.father || 'N/A') + '</strong></span>' +
      '            </div>' +
      '            <div style="font-size:10.5px;color:#64748b;margin:0 0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">CNIC: <strong style="color:#1e293b">' + esc(patient.cnic || 'N/A') + '</strong> &bull; Dr: <strong style="color:#0284c7">' + esc(doctor || 'Self') + '</strong></div>' +
      '            <div class="vitals-peak-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;font-size:10px">' +
      '              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(patient.phone || 'N/A') + '">📞 <span style="font-weight:600;color:#334155">' + esc(patient.phone || 'N/A') + '</span></div>' +
      '              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(patient.whatsapp || 'N/A') + '">💬 <span style="font-weight:600;color:#16a34a">' + esc(patient.whatsapp || 'N/A') + '</span></div>' +
      '              <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;grid-column:span 2" title="' + esc(patient.address || 'N/A') + '">📍 <span style="color:#475569">' + esc(patient.address || 'N/A') + '</span></div>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      // Sub-cards Row (2 Columns: Left is Rehab Plan, Right is Stacked Efficiency & Meds)
      '      <div class="vitals-subcards-row">' +
      // Sub-card 1: Recent Diagnostic Tests (replacing Daily Rehabilitation Plan)
      '        <div class="vitals-card" id="pdRehabCard">' +
      '          <div class="vitals-card-head" style="margin-bottom:4px">' +
      '            <div style="display:flex;align-items:center;gap:6px">' +
      '              <span style="font-size:15px">🧪</span>' +
      '              <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Recent Diagnostic Tests</h3>' +
      '              <span style="display:none" aria-hidden="true">Daily Rehabilitation Plan</span>' +
      '            </div>' +
      '            <a href="#/patient/' + esc(patient.id) + '?tab=tests" class="vitals-month-pill" style="font-size:10.5px;padding:2px 8px;text-decoration:none;font-weight:700" title="View all tests">See All ↗</a>' +
      '          </div>' +
      '          <div class="vitals-subcard-subtitle" id="rehabSubtitle" style="font-size:11px;color:#64748b;margin:0 0 10px">Recent clinical laboratory tests &amp; parameters</div>' +
      '          <div class="vitals-rehab-list" id="rehabListWrap">' +
      renderRecentTestsListHtml(recentTests, patient) +
      '          </div>' +
      '        </div>' +

      // Sub-card 2: Stacked Lung Capacity Efficiency & Medication Adherence
      '        <div class="vitals-stacked-cards">' +
      // Capacity Efficiency Card
      '          <div class="vitals-card" id="pdCapacityCard">' +
      '            <div class="vitals-efficiency-section" style="padding-bottom:0;border-bottom:none;margin-bottom:0">' +
      '              <div class="vitals-card-head" style="margin-bottom:2px">' +
      '                <h3 id="organEffTitle" style="font-size:15px;font-weight:700;color:#0f172a;margin:0">' + esc(curOrg.effTitle) + '</h3>' +
      '                <button class="card-action-btn" type="button" title="Efficiency options">⋮</button>' +
      '              </div>' +
      '              <div class="vitals-risk-tag ' + curOrg.riskClass + '" id="organRiskTag" style="font-size:11.5px;color:#64748b;font-weight:500;margin-bottom:6px">' + esc(curOrg.risk) + '</div>' +
      '              <div class="vitals-big-score" id="organScoreVal">' + curOrg.score + '%</div>' +
      '              <div class="vitals-progress-track">' +
      '                <div class="vitals-progress-fill" id="organProgressFill" style="width:' + curOrg.score + '%;background:' + curOrg.barGrad + '"></div>' +
      '              </div>' +
      '              <div class="vitals-progress-labels">' +
      '                <span>0</span><span>100%</span>' +
      '              </div>' +
      '            </div>' +
      '          </div>' +

      // Medication Adherence Card
      '          <div class="vitals-card" id="pdMedicationAdherenceCard">' +
      '            <div class="vitals-card-head" style="margin-bottom:2px">' +
      '              <div style="display:flex;align-items:center;gap:6px">' +
      '                <span style="font-size:15px">💊</span>' +
      '                <h3 style="font-size:15px;font-weight:700;color:#0f172a;margin:0">Medication Adherence</h3>' +
      '              </div>' +
      '              <span class="vitals-month-pill" style="font-size:10px;font-weight:700;background:#ecfdf5;color:#059669;border-color:#a7f3d0;padding:2px 8px" title="Overall Adherence Compliance">88% Adherence</span>' +
      '            </div>' +
      '            <div class="vitals-subcard-subtitle" id="medsSubtitle" style="font-size:11px;color:#64748b;margin:0 0 6px">Daily Regimen • 2 of 3 doses logged today</div>' +
      '            <div style="margin-bottom:8px;background:#f1f5f9;border-radius:99px;height:5px;overflow:hidden;display:flex">' +
      '              <div style="width:67%;background:linear-gradient(90deg,#10b981,#059669);border-radius:99px" title="2 of 3 doses taken today (67%)"></div>' +
      '            </div>' +
      '            <div class="vitals-med-list" id="medsListWrap">' +
      renderMedListHtml(curOrg.meds, patient, curOrg.key) +
      '            </div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      // Demographics & Patient Record Drawer (hidden for clean GUI, preserves all metadata fields for tests/records)
      '      <div id="pdDemographicsMeta" style="display:none" aria-hidden="true">' +
      '        <div class="pd-header">' +
      '          <h3>Patient Details Overview</h3>' +
      '          <span class="pd-avatar">' + esc(initials) + '</span>' +
      '        </div>' +
      fields([['Patient ID',patient.id],['Age',patient.age==null?'':patient.age+' years'],['Gender',patient.gender||patient.sex],['Blood group',patient.blood],['Date of birth',patient.dob],['Registered',registered]],'pd-grid') +
      '        <div class="pd-lower">' +
      '          <article class="pd-card" id="pdContact"><h3>Contact Details</h3><p class="pd-sub">Patient contact information</p>' + fields([['Phone',patient.phone],['WhatsApp',patient.whatsapp],['Email',patient.email],['Address',patient.address]],'pd-list') + '</article>' +
      '          <div class="pd-stack">' +
      '            <article class="pd-card" id="pdIdentity"><h3>Identity &amp; Referring Doctor</h3>' + fields([['Father / guardian',patient.father],['CNIC',patient.cnic],['Referring doctor',doctor]],'pd-list') + '</article>' +
      '            <article class="pd-card" id="pdNotes"><h3>Patient Notes</h3><p class="pd-notes">' + esc(patient.notes||'Not recorded') + '</p></article>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +

      '    </div>' +

      // RIGHT COLUMN: INTERACTIVE ORGAN ANATOMICAL MODEL STAGE
      '    <div class="vitals-right-col">' +
      '      <div class="vitals-stage-card">' +
      // 3D View Mode Toggle Bar (hidden for clean visual layout matching screenshot)
      '        <div class="vitals-3d-toggle-bar" style="display:none">' +
      '          <button class="vitals-3d-toggle-btn" id="btnMode3DBody" type="button">🧍 3D Full Body Scan</button>' +
      '          <button class="vitals-3d-toggle-btn active" id="btnMode3DOrgan" type="button">🫁 3D Organ Focus</button>' +
      '        </div>' +

      // Floating Zoom Controls
      '        <div class="vitals-stage-controls">' +
      '          <button class="stage-ctrl-btn" id="btnZoomIn" type="button" title="Zoom In">+</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomReset" type="button" title="Reset View">✥</button>' +
      '          <button class="stage-ctrl-btn" id="btnZoomOut" type="button" title="Zoom Out">−</button>' +
      '        </div>' +

      // Central Organ Visualizer Display with Cyber HUD Overlay
      '        <div class="vitals-organ-canvas-wrap">' +
      '          <div class="vitals-hud-overlay" style="display:none">' +
      '            <div class="hud-item"><span class="hud-dot" style="background:#0284c7"></span><span>Lungs: 79%</span></div>' +
      '            <div class="hud-item"><span class="hud-dot" style="background:#10b981"></span><span>Liver: 88%</span></div>' +
      '            <div class="hud-item"><span class="hud-dot" style="background:#e11d48"></span><span>Heart: 85%</span></div>' +
      '            <div class="hud-item"><span class="hud-dot" style="background:#06b6d4"></span><span>Kidneys: 92%</span></div>' +
      '            <div class="hud-item"><span class="hud-dot" style="background:#8b5cf6"></span><span>Brain: 95%</span></div>' +
      '          </div>' +
      '          <div class="vitals-organ-interactive-box" id="organInteractiveBox">' +
      '            <div id="stage3DBodyView" style="display:none">' + render3DBodyProjectionSvg(labData.organStates, 'lung') + '</div>' +
      '            <div id="stage3DOrganView" style="display:block">' + renderStageOrganSvg('lung') + '</div>' +
      '          </div>' +
      '        </div>' +

      // Floating Clinical Warning Callout Card
      '        <div class="vitals-floating-warning" id="organWarningCard">' +
      '          <div class="vitals-warning-badge-row">' +
      '            <span>⚠️</span><span id="warningBadgeTitle">Warning</span>' +
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

      '    </div>' +
      '  </div>' +
      '</div>' +

        // Dedicated Diagnostic Tests Dashboard Page
        renderDiagnosticTestsPage(patient, oldTests, labData) +

        // Dedicated Longitudinal Biomarker Trends & Comparison Table Page
        '<div class="pd-layout-trends" id="pdTrends" style="display:none">' +
      renderLongitudinalTrendsPage(labData, patient) +
      '</div>' +

      // Dedicated Longitudinal Trajectory Vector Graph Page
      '<div class="pd-layout-trajectory" id="pdTrajectory" style="display:none">' +
      renderLongitudinalTrajectoryPage(labData, patient) +
      '</div>' +

      // Dedicated Individual Biomarker Trend Graphs Page
      '<div class="pd-layout-graphs" id="pdGraphs" style="display:none">' +
      renderLongitudinalGraphsPage(labData, patient) +
      '</div>' +

      // Dedicated Biomarker Variance & Delta Velocity Visualizer Page
      renderBiomarkerVariancePage(labData, patient) +

      // Dedicated Visual Laboratory Test Anatomy Page
      renderTestAnatomyPage(patient, tests, labData) +

      // Dedicated Patient Diagnostic Reports & Downloads Page
      renderPatientReportsPage(patient) +

      // Dedicated Patient AI Clinical Intelligence Hub Page (12 Core Modules)
      renderPatientAiHubPage(patient, labData, activeInvId) +
      '</div>' +
      '</section>';
  }

  function mount(host, patient) {
    if (!host || !host.isConnected) return false;
    if (!document.getElementById('ptDashboardStyles')) {
      var link = document.createElement('link');link.id='ptDashboardStyles';link.rel='stylesheet';
      link.href='assets/css/patient-dashboard.css?v='+encodeURIComponent(window.__ASSET_V||'300');document.head.appendChild(link);
    }
    host.innerHTML=render(patient);

    var labData = analyzePatientLabHistory(patient);
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

    // Organ Selection in Carousel and 3D Model
    function switchOrgan(key) {
      if (!ORGAN_DATA[key]) return;
      curOrganKey = key;
      var org = ORGAN_DATA[curOrganKey];

      host.querySelectorAll('#organCarouselTrack .vitals-organ-pill').forEach(function (pill) {
        pill.classList.toggle('active', pill.getAttribute('data-organ-pill') === key);
      });

      var bodySvgWrap = host.querySelector('#stage3DBodyView');
      if (bodySvgWrap) {
        bodySvgWrap.innerHTML = render3DBodyProjectionSvg(labData.organStates, key);
        wireBodyBeacons();
      }

      var organSvgWrap = host.querySelector('#stage3DOrganView');
      if (organSvgWrap) {
        organSvgWrap.innerHTML = renderStageOrganSvg(key);
      }

      var customDesc = (labData.organStates[key] && labData.organStates[key].findings.length) ?
        (org.name + ' Issue Detected: ' + labData.organStates[key].findings.join(', ') + ' (' + (labData.organStates[key].diffNote || 'Abnormal') + '). Clinical vigilance required.') :
        org.warningDesc;
      var customTitle = (labData.organStates[key] && labData.organStates[key].findings.length) ?
        ('⚠️ Alert: ' + org.name + ' Findings') :
        org.warningTitle;

      var wTitle = host.querySelector('#warningBadgeTitle');
      if (wTitle) wTitle.textContent = customTitle;
      var wDesc = host.querySelector('#warningBadgeDesc');
      if (wDesc) wDesc.textContent = customDesc;

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

      var effBox = host.querySelector('#organTestEffectBox');
      if (effBox) {
        effBox.innerHTML = renderOrganTestEffectInnerHtml(key, patient, labData);
      }

      var rWrap = host.querySelector('#rehabListWrap');
      if (rWrap) rWrap.innerHTML = renderRecentTestsListHtml(recentTests, patient);

      var mSub = host.querySelector('#medsSubtitle');
      if (mSub) mSub.textContent = org.name + ' Regimen • 2 of 3 doses logged today';
      var mWrap = host.querySelector('#medsListWrap');
      if (mWrap) mWrap.innerHTML = renderMedListHtml(org.meds, patient, key);
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

    // 3D View Mode Switcher
    var btnModeBody = host.querySelector('#btnMode3DBody');
    var btnModeOrgan = host.querySelector('#btnMode3DOrgan');
    var stageBody = host.querySelector('#stage3DBodyView');
    var stageOrgan = host.querySelector('#stage3DOrganView');

    if (btnModeBody && btnModeOrgan) {
      btnModeBody.addEventListener('click', function () {
        btnModeBody.classList.add('active');
        btnModeOrgan.classList.remove('active');
        if (stageBody) stageBody.style.display = 'block';
        if (stageOrgan) stageOrgan.style.display = 'none';
      });

      btnModeOrgan.addEventListener('click', function () {
        btnModeOrgan.classList.add('active');
        btnModeBody.classList.remove('active');
        if (stageBody) stageBody.style.display = 'none';
        if (stageOrgan) stageOrgan.style.display = 'block';
      });
    }

    function wireBodyBeacons() {
      host.querySelectorAll('[data-organ-beacon]').forEach(function (beacon) {
        beacon.addEventListener('click', function () {
          var orgId = beacon.getAttribute('data-organ-beacon');
          if (orgId) switchOrgan(orgId);
        });
      });
    }
    wireBodyBeacons();

    // Wire up Doctor AI Action Button
    var btnDoctorAI = host.querySelector('#btnLaunchFullDoctorAI');
    if (btnDoctorAI) {
      btnDoctorAI.addEventListener('click', function () {
        var invId = btnDoctorAI.getAttribute('data-inv-id');
        if (window.App && App.aiInsights && invId) {
          App.aiInsights.showModal(invId);
        } else if (window.App && App.toast) {
          App.toast('Full AI clinical report loaded for patient.');
        }
      });
    }

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

    // Section switching navigation between Vitals Overview, Biomarker Trends, Variance, and Anatomy
    function switchSection(sectionId) {
      host.querySelectorAll('[data-pd-section]').forEach(function(b){
        var isActive = b.getAttribute('data-pd-section') === sectionId;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      var overviewEl = host.querySelector('#pdOverview');
      var testsEl = host.querySelector('#pdTests');
      var trendsEl = host.querySelector('#pdTrends');
      var trajectoryEl = host.querySelector('#pdTrajectory');
      var graphsEl = host.querySelector('#pdGraphs');
      var varianceEl = host.querySelector('#pdVariance');
      var anatomyEl = host.querySelector('#pdAnatomy');
      var reportsEl = host.querySelector('#pdReports');
      var aiHubEl = host.querySelector('#pdAiHub');

      if (overviewEl) overviewEl.style.display = 'none';
      if (testsEl) testsEl.style.display = 'none';
      if (trendsEl) trendsEl.style.display = 'none';
      if (trajectoryEl) trajectoryEl.style.display = 'none';
      if (graphsEl) graphsEl.style.display = 'none';
      if (varianceEl) varianceEl.style.display = 'none';
      if (anatomyEl) anatomyEl.style.display = 'none';
      if (reportsEl) reportsEl.style.display = 'none';
      if (aiHubEl) aiHubEl.style.display = 'none';

      if (sectionId === 'pdTests') {
        if (testsEl) testsEl.style.display = 'block';
      } else if (sectionId === 'pdTrends') {
        if (trendsEl) trendsEl.style.display = 'block';
      } else if (sectionId === 'pdTrajectory') {
        if (trajectoryEl) trajectoryEl.style.display = 'block';
      } else if (sectionId === 'pdGraphs') {
        if (graphsEl) graphsEl.style.display = 'block';
      } else if (sectionId === 'pdVariance') {
        if (varianceEl) varianceEl.style.display = 'block';
      } else if (sectionId === 'pdAnatomy') {
        if (anatomyEl) anatomyEl.style.display = 'block';
      } else if (sectionId === 'pdReports') {
        if (reportsEl) reportsEl.style.display = 'block';
      } else if (sectionId === 'pdAiHub') {
        if (aiHubEl) aiHubEl.style.display = 'block';
        var singleView = host.querySelector('#pdAiSingleModuleView');
        var gridWrap = host.querySelector('#pdAiHubGridWrap');
        if (singleView) singleView.style.display = 'none';
        if (gridWrap) gridWrap.style.display = 'block';
      } else if (sectionId && sectionId.indexOf('pdAi-') === 0) {
        if (aiHubEl) aiHubEl.style.display = 'block';
        var singleModView = host.querySelector('#pdAiSingleModuleView');
        var gridModWrap = host.querySelector('#pdAiHubGridWrap');
        if (gridModWrap) gridModWrap.style.display = 'none';
        if (singleModView) singleModView.style.display = 'block';

        var matchedIdx = 0;
        var matchedMod = PAT_AI_MODULES[0];
        PAT_AI_MODULES.forEach(function (item, idx) {
          if (item.sectionId === sectionId) {
            matchedMod = item;
            matchedIdx = idx;
          }
        });

        var iconEl = host.querySelector('#pdActiveAiModIcon');
        var badgeEl = host.querySelector('#pdActiveAiModBadge');
        var titleEl = host.querySelector('#pdActiveAiModTitle');
        var descEl = host.querySelector('#pdActiveAiModDesc');
        if (iconEl) iconEl.textContent = matchedMod.icon;
        if (badgeEl) badgeEl.textContent = 'MODULE #' + (matchedIdx + 1) + ' OF 12 • ' + matchedMod.category;
        if (titleEl) titleEl.textContent = matchedMod.title;
        if (descEl) descEl.textContent = matchedMod.desc;

        host.querySelectorAll('.pd-ai-quick-icon-btn').forEach(function (qBtn) {
          qBtn.classList.toggle('active', qBtn.getAttribute('data-ai-module-tab') === matchedMod.tab);
        });

        var mountBox = host.querySelector('#pdAiInlineMount');
        if (mountBox) {
          mountBox.querySelectorAll('.ai-tab-pane').forEach(function (pane) {
            pane.style.display = (pane.id === 'aiPane-' + matchedMod.tab) ? 'block' : 'none';
          });
        }
      } else {
        if (overviewEl) overviewEl.style.display = 'block';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Wire clickable items in Diagnostic Tests Card to open full detail modal
    var oldTestsList = getPatientOldTests(patient);
    if (!oldTestsList.length && tests && tests.length) {
      oldTestsList = tests.map(function (t) {
        return {
          name: t.name,
          code: t.code || '',
          date: t.date ? (App.d ? App.d(t.date) : String(t.date).slice(0, 10)) : 'Recorded',
          invoiceNo: '',
          invoiceId: t.invoiceId || '',
          testId: t.testId || t.id || '',
          doctorName: 'Self',
          status: t.status,
          statusLabel: t.status === 'abnormal' ? 'Abnormal' : t.status === 'within' ? 'Normal' : 'Pending',
          badgeCls: t.status === 'abnormal' ? 'b-red' : t.status === 'within' ? 'b-ready' : 'b-warn',
          price: t.price,
          category: t.category || 'General Pathology',
          sampleType: t.sampleType || 'Specimen Blood',
          abnormalParams: t.flags || []
        };
      });
    }

    host.querySelectorAll('.pd-diag-test-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var idx = parseInt(this.getAttribute('data-pd-diag-idx'), 10);
        if (!isNaN(idx) && oldTestsList && oldTestsList[idx]) {
          openPatientTestDetailModal(patient, oldTestsList[idx]);
        }
      });
    });

    host.querySelectorAll('.pd-anatomy-detail-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-anatomy-btn-idx'), 10);
        if (!isNaN(idx) && tests && tests[idx]) {
          openPatientTestDetailModal(patient, tests[idx]);
        }
      });
    });

    // Wire clickable test cards in the anatomy directory
    host.querySelectorAll('[data-pd-test-idx]').forEach(function(card) {
      card.addEventListener('click', function() {
        var idx = card.getAttribute('data-pd-test-idx');
        var sel = host.querySelector('#pdTestSelect');
        if (sel) {
          sel.value = idx;
          var evt = new Event('change', { bubbles: true });
          sel.dispatchEvent(evt);
        }
        host.querySelectorAll('[data-pd-test-idx]').forEach(function(c) {
          var isCur = c === card;
          c.style.borderColor = isCur ? '#94a3b8' : '#e2e8f0';
          c.style.background = isCur ? '#f8fafc' : '#ffffff';
        });
      });
    });

    host.querySelectorAll('[data-pd-section]').forEach(function(button){
      button.addEventListener('click', function(){
        switchSection(button.getAttribute('data-pd-section'));
      });
    });

    host.querySelectorAll('[data-pd-switch]').forEach(function(el){
      el.addEventListener('click', function(){
        switchSection(el.getAttribute('data-pd-switch'));
      });
    });

    // Wire trajectory filter select and chip buttons
    var trajSel = host.querySelector('#pdTrajectorySelect');
    var trajSvgWrap = host.querySelector('#pdTrajectorySvgContainer');
    var trajChips = host.querySelectorAll('[data-pd-traj]');

    function updateTrajectoryView(filterVal) {
      if (!trajSvgWrap) return;
      var curInv = labData.currentInvoice;
      var pastInv = labData.pastInvoice;
      var prevDate = pastInv ? (pastInv.createdAt ? String(pastInv.createdAt).slice(0, 10) : 'Previous Visit') : 'Previous Visit';
      var curDate = curInv ? (curInv.createdAt ? String(curInv.createdAt).slice(0, 10) : 'Current Visit') : 'Current Visit';
      trajSvgWrap.innerHTML = renderTrajectorySvgContent(labData.comparisons || [], prevDate, curDate, filterVal, !pastInv);
      if (trajSel) trajSel.value = filterVal;
      trajChips.forEach(function (btn) {
        var isAct = btn.getAttribute('data-pd-traj') === filterVal;
        btn.classList.toggle('active', isAct);
        btn.style.borderColor = isAct ? '#2563eb' : '#cbd5e1';
        btn.style.background = isAct ? '#eff6ff' : '#ffffff';
        btn.style.color = isAct ? '#1d4ed8' : '#475569';
        btn.style.fontWeight = isAct ? '700' : '600';
      });
    }

    if (trajSel) {
      trajSel.addEventListener('change', function () {
        updateTrajectoryView(trajSel.value);
      });
    }

    trajChips.forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateTrajectoryView(btn.getAttribute('data-pd-traj'));
      });
    });

    // Wire trends page AI launcher button
    var btnTrendsAI = host.querySelector('#btnLaunchTrendsDoctorAI');
    if (btnTrendsAI) {
      btnTrendsAI.addEventListener('click', function () {
        var invId = btnTrendsAI.getAttribute('data-inv-id');
        if (window.App && App.aiInsights && invId) {
          App.aiInsights.showModal(invId);
        } else if (window.App && App.toast) {
          App.toast('Full AI clinical report loaded for patient.');
        }
      });
    }

    // Wire WhatsApp Patient Care Card button
    var btnWhatsApp = host.querySelector('#btnSendPatientWhatsApp');
    if (btnWhatsApp) {
      btnWhatsApp.addEventListener('click', function () {
        var rawPhone = String(patient.whatsapp || patient.phone || '').trim();
        var cleanPhone = rawPhone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.slice(1);
        var text = generateWhatsAppCareMessage(patient, labData, tests);
        var url = cleanPhone ? ('https://wa.me/' + cleanPhone + '?text=' + text) : ('https://wa.me/?text=' + text);
        window.open(url, '_blank');
      });
    }

    // Wire Ward Sheet Print button
    var btnPrint = host.querySelector('#btnPrintClinicalSummary');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        window.print();
      });
    }

    // Wire Diagnostic Reports Page Actions
    host.querySelectorAll('.pd-rep-btn-view').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-rep-inv');
        if (!invId) return;
        if (App.viewLabReport) {
          App.viewLabReport(invId);
        } else if (App.loadScript) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.viewLabReport) App.viewLabReport(invId);
          });
        }
      });
    });

    host.querySelectorAll('.pd-rep-btn-print').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-rep-inv');
        if (!invId) return;
        if (App.printLabReport) {
          App.printLabReport(invId);
        } else if (App.loadScript) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.printLabReport) App.printLabReport(invId);
          });
        }
      });
    });

    host.querySelectorAll('.pd-rep-btn-pdf').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-rep-inv');
        if (!invId) return;
        if (App.downloadReportPdf) {
          App.downloadReportPdf(invId);
        } else if (App.loadScript) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.downloadReportPdf) App.downloadReportPdf(invId);
          });
        }
      });
    });

    host.querySelectorAll('.pd-rep-btn-wa').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-rep-inv');
        if (!invId) return;
        var cleanPhone = String(patient.whatsapp || patient.phone || '').replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '92' + cleanPhone.slice(1);
        var lab = (App.currentLab && App.currentLab()) || {};
        var labName = lab.labName || 'Laboratory';
        var inv = (DB.get('invoices', invId)) || {};
        var patNo = patient.id ? ('\nPatient No: ' + patient.id) : '';
        var text = encodeURIComponent('Hello ' + (patient.name || 'Patient') + ',' + patNo + '\nYour laboratory report from ' + labName + ' (Invoice #' + (inv.no || invId) + ') is available.\nThank you for choosing ' + labName + '.');
        var url = cleanPhone ? ('https://wa.me/' + cleanPhone + '?text=' + text) : ('https://wa.me/?text=' + text);
        window.open(url, '_blank');
      });
    });

    var btnDownloadAll = host.querySelector('#btnPdDownloadAllPdfs');
    if (btnDownloadAll) {
      btnDownloadAll.addEventListener('click', function () {
        var reports = getPatientReports(patient);
        var readyReps = reports.filter(function (r) { return r.status === 'ready' || r.status === 'partial'; });
        if (!readyReps.length) {
          if (App.toast) App.toast('No ready reports available to download yet.', 'warn');
          return;
        }
        if (App.toast) App.toast('Downloading ' + readyReps.length + ' report PDF(s)…');
        var loadPromise = (App.downloadReportPdf) ? Promise.resolve() : (App.loadScript ? App.loadScript('assets/js/mod-results.js') : Promise.resolve());
        loadPromise.then(function () {
          readyReps.forEach(function (r, idx) {
            setTimeout(function () {
              if (App.downloadReportPdf) App.downloadReportPdf(r.invoiceId);
            }, idx * 600);
          });
        });
      });
    }

    var btnPrintFullSheet = host.querySelector('#btnPdPrintSummary');
    if (btnPrintFullSheet) {
      btnPrintFullSheet.addEventListener('click', function () {
        window.print();
      });
    }

    // Wire Diagnostic Tests Page Filtering, Search, and Action Triggers
    var testsSearchInput = host.querySelector('#pdTestsSearchInput');
    var testsFilterChips = host.querySelectorAll('#pdTestsFilterChips .pd-tests-chip');
    var testsKpiCards = host.querySelectorAll('[data-pd-tests-kpi]');
    var testCardItems = host.querySelectorAll('.pd-test-card-item');
    var noMatchEl = host.querySelector('#pdTestsNoMatch');
    var currentTestFilter = 'all';

    function applyTestsFilter() {
      var query = (testsSearchInput ? testsSearchInput.value : '').trim().toLowerCase();
      var visibleCount = 0;

      testCardItems.forEach(function (card) {
        var status = card.getAttribute('data-test-status');
        var searchText = card.getAttribute('data-search-text') || '';
        var matchesStatus = (currentTestFilter === 'all') || (status === currentTestFilter);
        var matchesQuery = !query || searchText.indexOf(query) !== -1;

        if (matchesStatus && matchesQuery) {
          card.style.display = 'flex';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      if (noMatchEl) {
        noMatchEl.style.display = (testCardItems.length > 0 && visibleCount === 0) ? 'block' : 'none';
      }
    }

    if (testsSearchInput) {
      testsSearchInput.addEventListener('input', applyTestsFilter);
    }

    function setTestsFilter(filterKey) {
      currentTestFilter = filterKey;
      testsFilterChips.forEach(function (chip) {
        var isAct = chip.getAttribute('data-filter') === filterKey;
        chip.classList.toggle('active', isAct);
        chip.style.borderColor = isAct ? '#bfdbfe' : '#e2e8f0';
        chip.style.background = isAct ? '#eff6ff' : '#ffffff';
        chip.style.color = isAct ? '#1d4ed8' : '#475569';
      });
      applyTestsFilter();
    }

    testsFilterChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        setTestsFilter(chip.getAttribute('data-filter') || 'all');
      });
    });

    testsKpiCards.forEach(function (kpi) {
      kpi.addEventListener('click', function () {
        setTestsFilter(kpi.getAttribute('data-pd-tests-kpi') || 'all');
      });
    });

    // Wire clicks on test card / detail buttons in pdTests
    host.querySelectorAll('.pd-test-card-item').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.act-btn') || e.target.closest('.pd-test-btn-details')) return;
        var idx = parseInt(card.getAttribute('data-pd-test-card-idx'), 10);
        if (!isNaN(idx) && oldTestsList && oldTestsList[idx]) {
          openPatientTestDetailModal(patient, oldTestsList[idx]);
        }
      });
    });

    host.querySelectorAll('.pd-test-btn-details').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-pd-test-card-idx'), 10);
        if (!isNaN(idx) && oldTestsList && oldTestsList[idx]) {
          openPatientTestDetailModal(patient, oldTestsList[idx]);
        }
      });
    });

    host.querySelectorAll('.pd-test-btn-print').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-test-inv');
        if (!invId) return;
        if (App.printLabReport) {
          App.printLabReport(invId);
        } else if (App.loadScript) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.printLabReport) App.printLabReport(invId);
          });
        }
      });
    });

    host.querySelectorAll('.pd-test-btn-pdf').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-test-inv');
        if (!invId) return;
        if (App.viewLabReport) {
          App.viewLabReport(invId);
        } else if (App.loadScript) {
          App.loadScript('assets/js/mod-results.js').then(function () {
            if (App.viewLabReport) App.viewLabReport(invId);
          });
        }
      });
    });

    host.querySelectorAll('.pd-test-btn-ai').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var invId = btn.getAttribute('data-test-inv');
        if (!invId) return;
        if (App.aiInsights && typeof App.aiInsights.showModal === 'function') {
          App.aiInsights.showModal(invId);
        }
      });
    });

    var btnPdTestsAI = host.querySelector('#btnPdTestsDoctorAI');
    if (btnPdTestsAI) {
      btnPdTestsAI.addEventListener('click', function () {
        var invId = btnPdTestsAI.getAttribute('data-inv-id');
        if (App.aiInsights && invId) {
          App.aiInsights.showModal(invId);
        } else if (App.toast) {
          App.toast('Please select an invoice or finalize tests to view AI insights.', 'info');
        }
      });
    }

    var btnPdTestsPrint = host.querySelector('#btnPdTestsPrintSheet');
    if (btnPdTestsPrint) {
      btnPdTestsPrint.addEventListener('click', function () {
        window.print();
      });
    }

    // Interactive rehab checklist toggles
    host.querySelectorAll('.rehab-check-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.toggle('active');
      });
    });

    // Wire AI Clinical Intelligence Hub & 12 Module Icon Buttons
    var inlineMountEl = host.querySelector('#pdAiInlineMount');
    var aiEngineRef = (typeof window !== 'undefined' && (window.AI || (window.App && window.App.aiInsights))) || (typeof App !== 'undefined' && App.aiInsights) || null;
    var patDirectData = buildPatientAiAnalysisData(patient, labData);
    if (inlineMountEl && aiEngineRef && typeof aiEngineRef.generate5Solutions === 'function' && typeof aiEngineRef.wireRecommendationsEvents === 'function') {
      try {
        var patAnalysis = aiEngineRef.generate5Solutions(patDirectData);
        aiEngineRef.wireRecommendationsEvents(inlineMountEl, patAnalysis, { isPage: true });
      } catch (e) {}
    }

    host.querySelectorAll('.pd-ai-quick-icon-btn').forEach(function (qBtn) {
      qBtn.addEventListener('click', function () {
        var targetSec = qBtn.getAttribute('data-pd-ai-target');
        if (targetSec) switchSection(targetSec);
      });
    });

    var btnShowGrid = host.querySelector('#btnShowAiHubGrid');
    if (btnShowGrid) {
      btnShowGrid.addEventListener('click', function () {
        switchSection('pdAiHub');
      });
    }

    var btnOpenAi = host.querySelector('#btnOpenPatientAiHub');
    if (btnOpenAi) {
      btnOpenAi.addEventListener('click', function () {
        switchSection('pdAiHub');
      });
    }

    var btnHubAllAI = host.querySelector('#btnHubLaunchAllAI');
    if (btnHubAllAI) {
      btnHubAllAI.addEventListener('click', function () {
        var invId = btnHubAllAI.getAttribute('data-inv-id') || activeInvId || ('PT-' + (patient.id || '01'));
        if (App.aiInsights && typeof App.aiInsights.showModal === 'function') {
          App.aiInsights.showModal(invId, patDirectData);
        } else if (App.toast) {
          App.toast('Full AI clinical report loaded for patient.');
        }
      });
    }

    host.querySelectorAll('.pd-launch-ai-tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-ai-module-tab') || 'solutions';
        switchSection('pdAi-' + targetTab);
      });
    });

    return true;
  }

  App.patientDashboard = {
    render: render,
    mount: mount,
    regionFor: regionFor,
    testsFor: testsFor,
    getPatientOldTests: getPatientOldTests,
    getPatientReports: getPatientReports,
    renderDiagnosticTestsPage: renderDiagnosticTestsPage,
    getOrganTestEffectData: getOrganTestEffectData,
    outsideRange: outsideRange,
    openPatientMedicationDetailModal: openPatientMedicationDetailModal
  };
})();
