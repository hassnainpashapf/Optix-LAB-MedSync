// graph-config.js — Time-series graph configs + shared SVG line-chart renderer.
// ES5 only, no external libraries, works offline. Pure SVG (viewBox-based) so the
// same string can be injected into screen HTML and into printed report HTML.
var App = window.App || (window.App = {});

/* ---------------------------------------------------------------------------
 * TEST_GRAPH_CONFIG
 * Each entry describes one graphable time-series test:
 *   nameRe    — regex string, matched (case-insensitive) against test.name
 *   notRe     — optional regex string; when it matches test.name the entry
 *               is skipped (keeps broad patterns from catching look-alikes)
 *   title     — chart title
 *   unit      — y-axis unit
 *   refLo/refHi — shaded reference band (numbers or null to disable)
 *   analyteRe — optional regex string; when set, only params whose name matches
 *               it are used (for multi-analyte tests like OGTT with Insulin)
 *   x         — array of time slots: { label, re }
 *               label: display text on the x-axis
 *               re:    regex string matched (case-insensitive) against param names
 * Every entry below was verified against assets/js/test-catalog-5000.js:
 * the named test exists and has params matching the given slots.
 * ------------------------------------------------------------------------- */
var TEST_GRAPH_CONFIG = [
  // NOTE: specific entries first — "OGTT Extended" and "(0, 60, 120)" also match
  // the broad OGTT pattern below, so they must be tried earlier.
  {
    // "OGTT Extended (0, 30, 60, 90, 120, 180 min)"
    nameRe: "OGTT Extended",
    title: "Glucose (mg/dL) vs Time — Extended OGTT",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    x: [
      { label: "0 min",   re: "\\b0\\s*min|fasting" },
      { label: "30 min",  re: "\\b30\\s*min" },
      { label: "60 min",  re: "\\b60\\s*min|1\\s*hour" },
      { label: "90 min",  re: "\\b90\\s*min" },
      { label: "120 min", re: "\\b120\\s*min|2\\s*hour" },
      { label: "180 min", re: "\\b180\\s*min|3\\s*hour" }
    ]
  },
  {
    // "Glucose Tolerance Test (0, 60, 120 min)"
    nameRe: "Glucose Tolerance Test \\(0,\\s*60,\\s*120",
    title: "Glucose (mg/dL) vs Time",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    x: [
      { label: "0 min",   re: "\\b0\\s*min|fasting" },
      { label: "60 min",  re: "\\b60\\s*min|1\\s*hour" },
      { label: "120 min", re: "\\b120\\s*min|2\\s*hour" }
    ]
  },
  {
    // Covers: "Glucose Tolerance Test (75g OGTT)", "Oral Glucose Tolerance Test (75g)",
    // "Oral Glucose Tolerance Test (100g)", "Oral Glucose Tolerance Test - Pregnancy (100g)",
    // "OGTT - 75g Glucose Load", "Gestational OGTT (75g)", "OGTT Pregnancy (75g)",
    // "OGTT with Urine Glucose", "OGTT with Insulin Levels", "OGTT with C-Peptide Levels",
    // "Glucose Tolerance Test (Pediatric)", "Glucose Tolerance Test (Repeat)".
    // Param spellings seen: "Glucose Fasting (OGTT)" | "Glucose, Fasting".
    nameRe: "OGTT|Oral Glucose Tolerance|Glucose Tolerance Test",
    notRe: "Growth Hormone", // "Growth Hormone Suppression Test (OGTT)" has its own entry
    title: "Glucose (mg/dL) vs Time",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    analyteRe: "glucose",
    x: [
      { label: "Fasting",  re: "fasting" },
      { label: "30 min",   re: "30\\s*min" },
      { label: "1 Hour",   re: "1\\s*hour|\\b60\\s*min" },
      { label: "2 Hour",   re: "2\\s*hour|\\b120\\s*min" },
      { label: "3 Hour",   re: "3\\s*hour|\\b180\\s*min" }
    ]
  },
  {
    // "ACTH Stimulation Test (Synacthen)", "Synacthen (ACTH) Stimulation Test"
    // Params: "Cortisol Basal (ACTH Stim)" | "Cortisol (Basal)".
    nameRe: "ACTH Stimulation|Synacthen",
    title: "Cortisol (ug/dL) vs Time — ACTH Stimulation",
    unit: "ug/dL",
    refLo: 6.2,
    refHi: 19.4,
    x: [
      { label: "Basal",  re: "basal" },
      { label: "30 min", re: "30\\s*min" },
      { label: "60 min", re: "60\\s*min" }
    ]
  },
  {
    // "Growth Hormone Suppression Test (OGTT)"
    // Params: "GH (Basal)", "GH (60 min Post-Glucose)", "GH (120 min Post-Glucose)".
    nameRe: "Growth Hormone Suppression",
    title: "Growth Hormone (ng/mL) vs Time — Suppression",
    unit: "ng/mL",
    refLo: 0,
    refHi: 5,
    x: [
      { label: "Basal",   re: "basal" },
      { label: "60 min",  re: "60\\s*min" },
      { label: "120 min", re: "120\\s*min" }
    ]
  },
  {
    // "Blood Glucose Day Curve (7 Point)"
    // Params: "Glucose, Pre-Breakfast", "Glucose, 2 Hr Post-Breakfast", ..., "Glucose, Bedtime".
    nameRe: "Day Curve",
    title: "Blood Glucose (mg/dL) — Day Curve",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    x: [
      { label: "Pre-Breakfast",       re: "pre-?\\s*breakfast" },
      { label: "2 Hr Post-Breakfast", re: "2\\s*hr\\s*post-?\\s*breakfast" },
      { label: "Pre-Lunch",           re: "pre-?\\s*lunch" },
      { label: "2 Hr Post-Lunch",     re: "2\\s*hr\\s*post-?\\s*lunch" },
      { label: "Pre-Dinner",          re: "pre-?\\s*dinner" },
      { label: "2 Hr Post-Dinner",    re: "2\\s*hr\\s*post-?\\s*dinner" },
      { label: "Bedtime",             re: "bedtime" }
    ]
  },
  {
    // "Reactive Hypoglycemia Panel"
    // Params: "Glucose, Fasting", "Glucose, 2 Hour", "Glucose, 4 Hour" (+ non-series "Insulin").
    nameRe: "Reactive Hypoglycemia",
    title: "Glucose (mg/dL) vs Time — Hypoglycemia Panel",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    analyteRe: "glucose",
    x: [
      { label: "Fasting", re: "fasting" },
      { label: "2 Hour",  re: "2\\s*hour" },
      { label: "4 Hour",  re: "4\\s*hour" }
    ]
  },
  {
    // "Insulin Tolerance Test"
    // Params: "Glucose Basal (ITT)", "Glucose Nadir (ITT)", "Cortisol Peak (ITT)".
    nameRe: "Insulin Tolerance Test",
    title: "Glucose (mg/dL) vs Time — ITT",
    unit: "mg/dL",
    refLo: 70,
    refHi: 140,
    analyteRe: "glucose",
    x: [
      { label: "Basal", re: "basal" },
      { label: "Nadir", re: "nadir" }
    ]
  }
];

/* ---------------------------------------------------------------------------
 * App.graphFor(test)
 * test: { name: string, params: [{ name, type, ... }] }
 * Returns { xLabels, params, unit, refLo, refHi, title } or null.
 *   xLabels — display labels for the x-axis (catalog slot order)
 *   params  — matched test param names (same order), used to read values
 * Matching: (a) explicit TEST_GRAPH_CONFIG entries by nameRe, in order;
 *           (b) fallback auto-detect: >=3 numeric params whose names look like
 *           time points (fasting/random/basal/nadir/peak/trough, N min/hr...).
 * ------------------------------------------------------------------------- */
App.graphFor = function (test) {
  if (!test || !test.name || !test.params) return null;
  var params = test.params;

  var i, j, entry, slotRe, analyteRe, xLabels, matched;
  for (i = 0; i < TEST_GRAPH_CONFIG.length; i++) {
    entry = TEST_GRAPH_CONFIG[i];
    if (!new RegExp(entry.nameRe, "i").test(test.name)) continue;
    if (entry.notRe && new RegExp(entry.notRe, "i").test(test.name)) continue;
    analyteRe = entry.analyteRe ? new RegExp(entry.analyteRe, "i") : null;
    xLabels = [];
    matched = [];
    for (j = 0; j < entry.x.length; j++) {
      slotRe = new RegExp(entry.x[j].re, "i");
      var hit = null;
      for (var k = 0; k < params.length; k++) {
        if (!params[k] || !params[k].name) continue;
        if (analyteRe && !analyteRe.test(params[k].name)) continue;
        if (slotRe.test(params[k].name)) { hit = params[k].name; break; }
      }
      if (hit) {
        xLabels.push(entry.x[j].label);
        matched.push(hit);
      }
    }
    if (matched.length >= 2) {
      return {
        xLabels: xLabels,
        params: matched,
        unit: entry.unit || "",
        refLo: (typeof entry.refLo === "number") ? entry.refLo : null,
        refHi: (typeof entry.refHi === "number") ? entry.refHi : null,
        title: entry.title || test.name
      };
    }
  }

  // (b) Fallback: auto-detect time-series params.
  var timeRe = /fasting|random|\bbasal\b|\bnadir\b|\bpeak\b|\btrough\b|\bpre-?|\bpost-?|\bbedtime\b|\b\d+\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/i;
  var series = [];
  for (i = 0; i < params.length; i++) {
    if (params[i] && params[i].type === "number" && params[i].name && timeRe.test(params[i].name)) {
      series.push(params[i].name);
    }
  }
  if (series.length >= 3) {
    var unit0 = "";
    for (i = 0; i < params.length; i++) {
      if (params[i] && params[i].name === series[0] && params[i].unit) { unit0 = params[i].unit; break; }
    }
    return {
      xLabels: series.slice(),
      params: series.slice(),
      unit: unit0,
      refLo: null,
      refHi: null,
      title: test.name + (unit0 ? " (" + unit0 + ")" : "") + " vs Time"
    };
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * App.renderGraphSvg(g, valsByParam)
 * PURE function — no DOM access. g is a config from App.graphFor;
 * valsByParam maps param name -> value string.
 * Returns a self-contained inline SVG string (viewBox-based, scales to width),
 * or "" when fewer than 2 points are plottable. Safe for screen and print.
 * ------------------------------------------------------------------------- */
App.renderGraphSvg = function (g, valsByParam) {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(n) {
    var s = (Math.round(n * 100) / 100).toString();
    return s;
  }
  if (!g || !g.xLabels || !g.params || !valsByParam) return "";

  // Collect plottable points in x order; skip non-numeric / missing values.
  var pts = [];
  for (var i = 0; i < g.params.length; i++) {
    var raw = valsByParam[g.params[i]];
    var v = parseFloat(raw);
    if (raw != null && String(raw).trim() !== "" && isFinite(v)) {
      pts.push({ label: g.xLabels[i] || "", x: i, y: v });
    }
  }
  if (pts.length < 2) return "";

  var W = 560, H = 340;
  var ML = 52, MR = 14, MT = 34, MB = 66; // margins
  var iw = W - ML - MR, ih = H - MT - MB;

  var lo = pts[0].y, hi = pts[0].y, n;
  for (n = 1; n < pts.length; n++) {
    if (pts[n].y < lo) lo = pts[n].y;
    if (pts[n].y > hi) hi = pts[n].y;
  }
  if (typeof g.refLo === "number") { if (g.refLo < lo) lo = g.refLo; }
  if (typeof g.refHi === "number") { if (g.refHi > hi) hi = g.refHi; }
  var span = hi - lo;
  if (span <= 0) span = Math.max(Math.abs(hi) * 0.2, 1);
  lo -= span * 0.12;
  hi += span * 0.18;

  function X(idx) { return ML + (iw * idx) / Math.max(g.params.length - 1, 1); }
  function Y(v) { return MT + ih - ((v - lo) / (hi - lo)) * ih; }

  var s = "";
  s += '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"';
  s += ' style="width:100%;max-width:520px;height:auto;display:block" role="img">';
  s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>';

  // Shaded reference band.
  if (typeof g.refLo === "number" && typeof g.refHi === "number" && g.refHi > g.refLo) {
    var ry = Y(g.refHi), rh = Y(g.refLo) - Y(g.refHi);
    s += '<rect x="' + ML + '" y="' + ry.toFixed(1) + '" width="' + iw + '" height="' + rh.toFixed(1) + '" fill="#dbeafe" opacity="0.55"/>';
  }

  // Horizontal gridlines + y-axis tick labels.
  var t, gy, gv;
  for (t = 0; t <= 4; t++) {
    gv = lo + ((hi - lo) * t) / 4;
    gy = Y(gv);
    s += '<line x1="' + ML + '" y1="' + gy.toFixed(1) + '" x2="' + (ML + iw) + '" y2="' + gy.toFixed(1) + '" stroke="#e5e7eb" stroke-width="1"/>';
    s += '<text x="' + (ML - 6) + '" y="' + (gy + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6b7280" font-family="sans-serif">' + esc(fmt(gv)) + "</text>";
  }

  // X-axis labels (rotate when long).
  var longest = 0, li;
  for (li = 0; li < pts.length; li++) {
    if (String(pts[li].label).length > longest) longest = String(pts[li].label).length;
  }
  var rot = longest > 8;
  for (li = 0; li < pts.length; li++) {
    var px = X(pts[li].x), py = MT + ih + 8;
    var lab = pts[li].label;
    if (lab.length > 16) lab = lab.slice(0, 15) + "…";
    if (rot) {
      s += '<text x="' + px.toFixed(1) + '" y="' + py + '" text-anchor="end" font-size="11" fill="#4b5563" font-family="sans-serif" transform="rotate(-30 ' + px.toFixed(1) + ' ' + py + ')">' + esc(lab) + "</text>";
    } else {
      s += '<text x="' + px.toFixed(1) + '" y="' + py + '" text-anchor="middle" font-size="11" fill="#4b5563" font-family="sans-serif">' + esc(lab) + "</text>";
    }
  }

  // Axes.
  s += '<line x1="' + ML + '" y1="' + MT + '" x2="' + ML + '" y2="' + (MT + ih) + '" stroke="#9ca3af" stroke-width="1"/>';
  s += '<line x1="' + ML + '" y1="' + (MT + ih) + '" x2="' + (ML + iw) + '" y2="' + (MT + ih) + '" stroke="#9ca3af" stroke-width="1"/>';

  // Polyline through points in x order.
  var d = "";
  for (n = 0; n < pts.length; n++) {
    d += (n === 0 ? "M" : "L") + X(pts[n].x).toFixed(1) + "," + Y(pts[n].y).toFixed(1) + " ";
  }
  s += '<path d="' + d + '" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';

  // Markers + value labels.
  for (n = 0; n < pts.length; n++) {
    var cx = X(pts[n].x).toFixed(1), cy = Y(pts[n].y).toFixed(1);
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="2"/>';
    s += '<text x="' + cx + '" y="' + (Y(pts[n].y) - 10).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="bold" fill="#1e3a8a" font-family="sans-serif">' + esc(fmt(pts[n].y)) + "</text>";
  }

  // Title.
  if (g.title) {
    s += '<text x="' + (W / 2) + '" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#111827" font-family="sans-serif">' + esc(g.title) + "</text>";
  }
  // Unit note.
  if (g.unit) {
    s += '<text x="' + (W / 2) + '" y="' + (H - 4) + '" text-anchor="middle" font-size="10" fill="#9ca3af" font-family="sans-serif">' + esc("Unit: " + g.unit) + "</text>";
  }

  s += "</svg>";
  return s;
};
