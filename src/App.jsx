import React, { useState, useMemo, useCallback } from "react";

/* ============================================================
   REPOSY — structured ultrasound reporting
   Deterministic sentence engine + optional AI layer.
   The AI never invents findings; it only drafts the impression
   or polishes wording from the structured data you selected.
   ============================================================ */

/* ---------- tiny helpers ---------- */
const j = (...p) =>
  p
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*\./g, ".")
    .trim();

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const num = (v) => (v === "" || v == null || isNaN(parseFloat(v)) ? null : parseFloat(v));
const fx = (v, d = 1) => (v == null ? null : Number(v.toFixed(d)));

const dims = (v, keys, unit = "cm") => {
  const d = keys.map((k) => num(v[k])).filter((x) => x != null);
  return d.length ? d.join(" × ") + " " + unit : null;
};
const ellipsoid = (a, b, c) => (a && b && c ? fx((a * b * c * 0.523), 1) : null);
const listAnd = (arr) => {
  const a = arr.filter(Boolean);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
};
const numWord = (n) =>
  ({ 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six" }[n] || String(n));


/* One explicit range per numeric field, keyed modality.section.field.
   Out-of-range values are flagged, never blocked. Lower bounds are
   paediatric-tolerant on organs that scale with age. */
const FIELD_RANGES = {
  "abdomen.liver.size": [4, 30], "abdomen.liver.pv": [2, 25],
  "abdomen.gb.wall": [0.5, 15], "abdomen.gb.calcsize": [1, 60],
  "abdomen.gb.polypsize": [1, 40], "abdomen.gb.cbd": [1, 25],
  "abdomen.panc.ductsize": [1, 15], "abdomen.spleen.size": [3, 25],
  "abdomen.rk.size1": [2, 12], "abdomen.rk.size2": [1, 10], "abdomen.rk.ct": [1, 25],
  "abdomen.rk.calcsize": [1, 60], "abdomen.rk.cystsize": [1, 150],
  "abdomen.lk.size1": [2, 12], "abdomen.lk.size2": [1, 10], "abdomen.lk.ct": [1, 25],
  "abdomen.lk.calcsize": [1, 60], "abdomen.lk.cystsize": [1, 150],
  "abdomen.ureter.calcsize": [1, 30],
  "abdomen.bladder.wall": [0.5, 20], "abdomen.bladder.calcsize": [1, 80],
  "abdomen.bladder.massSize": [1, 120],
  "abdomen.bladder.a": [1, 20], "abdomen.bladder.b": [1, 20], "abdomen.bladder.c": [1, 20],
  "abdomen.bladder.pa": [0, 20], "abdomen.bladder.pb": [0, 20], "abdomen.bladder.pc": [0, 20],
  "abdomen.prostate.a": [1, 12], "abdomen.prostate.b": [1, 12], "abdomen.prostate.c": [1, 12],
  "abdomen.misc.aortaSize": [0.5, 12], "abdomen.misc.nodeSize": [1, 80],
  "kub.rk.size1": [2, 12], "kub.rk.size2": [1, 10], "kub.rk.ct": [1, 25],
  "kub.rk.calcsize": [1, 60], "kub.rk.cystsize": [1, 150],
  "kub.lk.size1": [2, 12], "kub.lk.size2": [1, 10], "kub.lk.ct": [1, 25],
  "kub.lk.calcsize": [1, 60], "kub.lk.cystsize": [1, 150],
  "kub.ureter.calcsize": [1, 30],
  "kub.bladder.wall": [0.5, 20], "kub.bladder.calcsize": [1, 80], "kub.bladder.massSize": [1, 120],
  "kub.bladder.a": [1, 20], "kub.bladder.b": [1, 20], "kub.bladder.c": [1, 20],
  "kub.bladder.pa": [0, 20], "kub.bladder.pb": [0, 20], "kub.bladder.pc": [0, 20],
  "kub.prostate.a": [1, 12], "kub.prostate.b": [1, 12], "kub.prostate.c": [1, 12],
  "pelvis.uterus.a": [2, 20], "pelvis.uterus.b": [1, 15], "pelvis.uterus.c": [1, 15],
  "pelvis.endo.et": [0.5, 40], "pelvis.endo.polypSize": [1, 50],
  "pelvis.ro.a": [0.5, 15], "pelvis.ro.b": [0.5, 15], "pelvis.ro.c": [0.5, 15],
  "pelvis.ro.fol": [0, 60], "pelvis.ro.dom": [1, 40],
  "pelvis.lo.a": [0.5, 15], "pelvis.lo.b": [0.5, 15], "pelvis.lo.c": [0.5, 15],
  "pelvis.lo.fol": [0, 60], "pelvis.lo.dom": [1, 40],
  "soft.surround.collVol": [0, 2000], "soft.surround.nodeSize": [1, 80],
  "thyroid.gland.ra": [0.5, 12], "thyroid.gland.rb": [0.5, 12], "thyroid.gland.rc": [0.5, 12],
  "thyroid.gland.la": [0.5, 12], "thyroid.gland.lb": [0.5, 12], "thyroid.gland.lc": [0.5, 12],
  "thyroid.gland.isth": [0.5, 25],
  "thyroid.nodule.maxdim": [0.1, 15], "thyroid.nodes.size": [1, 60],
  "breast.bg.ductSize": [0.5, 20], "breast.ax.cortex": [0.5, 20],
  "scrotum.testes.ra": [0.5, 8], "scrotum.testes.rb": [0.5, 8], "scrotum.testes.rc": [0.5, 8],
  "scrotum.testes.la": [0.5, 8], "scrotum.testes.lb": [0.5, 8], "scrotum.testes.lc": [0.5, 8],
  "scrotum.epi.vein": [1, 12],
  "nsg.vent.rvent": [1, 40], "nsg.vent.lvent": [1, 40], "nsg.hem.ri": [0.3, 1.2],
  "venous.reflux.gsvT": [0, 20],
  "arterial.abi.rAbi": [0, 2], "arterial.abi.lAbi": [0, 2], "arterial.abi.aneurSize": [0.5, 15],
  "carotid.imt.rImt": [0.2, 3], "carotid.imt.lImt": [0.2, 3], "carotid.imt.plaqueTh": [0.5, 15],
  "carotid.vel.rCca": [5, 600], "carotid.vel.rIca": [5, 600], "carotid.vel.rEca": [5, 600],
  "carotid.vel.lCca": [5, 600], "carotid.vel.lIca": [5, 600], "carotid.vel.lEca": [5, 600],
  "rif.app.dia": [2, 25], "rif.app.wall": [0.5, 10], "rif.app.collVol": [0, 1000],
  "chest.pl.rVol": [0, 5000], "chest.pl.lVol": [0, 5000],
  "chest.pl.rSep": [1, 250], "chest.pl.lSep": [1, 250],
  "msk.joint.effDepth": [0.5, 60],
  "obs.type.fhr": [80, 220],
  "obs.early.msd": [1, 60], "obs.early.yolkSize": [1, 12],
  "obs.early.schVol": [0, 500], "obs.early.cxLen": [5, 60],
  "obs.crl.crl": [1, 95],
  "obs.nt.nt": [0.5, 12], "obs.nt.dvPi": [0, 3], "obs.nt.utPi": [0, 4],
  "obs.biom.bpd": [1, 12], "obs.biom.hc": [3, 40], "obs.biom.ac": [3, 45], "obs.biom.fl": [0.5, 10],
  "obs.worksheet.os": [0, 15],
  "obs.worksheet.q1": [0, 15], "obs.worksheet.q2": [0, 15],
  "obs.worksheet.q3": [0, 15], "obs.worksheet.q4": [0, 15],
  "obs.worksheet.sdp": [0, 20],
  "obs.anom.vent": [1, 30], "obs.anom.cm": [1, 20],
  "obs.dopp.uaPi": [0, 3], "obs.dopp.uaRi": [0, 1], "obs.dopp.uaSd": [1, 10],
  "obs.dopp.mcaPi": [0, 4], "obs.dopp.mcaPsv": [5, 120], "obs.dopp.cpr": [0, 5], "obs.dopp.utPi": [0, 4],
  "obs.bpp.obsMin": [1, 120],
  "obs.maternal.cxLen": [5, 60], "obs.maternal.adnexaSize": [1, 200],
  "obs.maternal.fibroidSize": [1, 200], "obs.maternal.scarTh": [0.5, 15],
  "lesion.dim": [0.1, 40], "lesion.count": [2, 30], "seg.psv": [0, 600],
};
const fieldRange = (fid) => FIELD_RANGES[fid] || null;

/* ---------- shared option banks ---------- */
const ECHO = ["anechoic", "hypoechoic", "isoechoic", "hyperechoic", "heteroechoic", "mixed echogenicity", "predominantly cystic", "predominantly solid"];
const MARGIN = ["well defined", "partly well defined", "ill defined", "poorly defined", "lobulated", "spiculated", "irregular"];
const SHAPE = ["oval", "round", "elongated", "lobulated", "irregular"];
const VASC = ["no internal vascularity", "minimal internal vascularity", "peripheral vascularity", "central vascularity", "peripheral and central vascularity", "marked internal vascularity"];
const YN = ["", "yes", "no"];

/* ============================================================
   LESION MODEL — reusable across every modality
   ============================================================ */
const blankLesion = () => ({
  count: "single",
  n: 2,
  echo: "hypoechoic",
  margin: "well defined",
  shape: "oval",
  contents: "",
  septa: "",
  calc: "",
  vasc: "",
  d1: "",
  d2: "",
  d3: "",
  site: "",
  planes: "",
  extras: {},
  similar: "",
  note: "",
});

function lesionSentence(L, cfg = {}) {
  const noun = cfg.noun || "lesion";
  const size = dims(L, ["d1", "d2", "d3"]);
  const article = /^[aeiou]/i.test(L.echo || "") ? "An" : "A";
  const lead =
    L.count === "multiple"
      ? `${numWord(L.n)} ${L.margin}, ${L.echo} ${noun}s are noted`
      : `${article} ${[L.margin, L.shape, L.echo].filter(Boolean).join(", ")} ${noun} is noted`;

  const s1 = j(
    lead,
    L.site ? `in the ${L.site}` : null,
    size ? (L.count === "multiple" ? `, the largest measuring ${size}` : `, measuring ${size}`) : null,
    L.planes ? `(${L.planes})` : null
  ) + ".";

  const feat = listAnd([
    L.contents || null,
    L.septa === "yes" ? "internal septations" : L.septa === "thick" ? "thick internal septations" : null,
    L.calc || null,
    L.vasc || null,
    ...Object.values(L.extras || {}).filter((x) => x && typeof x === "string"),
  ]);
  const s2 = feat ? `It shows ${feat}.` : null;
  const s3 = L.similar ? `${cap(L.similar)}` : null;
  const s4 = L.note ? cap(L.note.trim().replace(/\.?$/, ".")) : null;
  return [s1, s2, s3, s4].filter(Boolean).join(" ");
}

/* ============================================================
   SCORES
   ============================================================ */
const TIRADS = {
  comp: [["Cystic / almost completely cystic", 0], ["Spongiform", 0], ["Mixed cystic and solid", 1], ["Solid / almost completely solid", 2]],
  echo: [["Anechoic", 0], ["Hyperechoic or isoechoic", 1], ["Hypoechoic", 2], ["Very hypoechoic", 3]],
  shape: [["Wider-than-tall", 0], ["Taller-than-wide", 3]],
  margin: [["Smooth", 0], ["Ill-defined", 0], ["Lobulated or irregular", 2], ["Extra-thyroidal extension", 3]],
  foci: [["None or large comet-tail artifacts", 0], ["Macrocalcifications", 1], ["Peripheral rim calcifications", 2], ["Punctate echogenic foci", 3]],
};
function tiradsScore(e, sizeCm) {
  const g = (k) => (TIRADS[k].find((o) => o[0] === e[k]) || [null, 0])[1];
  const pts = g("comp") + g("echo") + g("shape") + g("margin") + g("foci");
  let lvl = "TR1", act = "No FNA. No follow-up.";
  if (pts >= 7) { lvl = "TR5"; act = "FNA if ≥1 cm; follow-up if ≥0.5 cm."; }
  else if (pts >= 4) { lvl = "TR4"; act = "FNA if ≥1.5 cm; follow-up if ≥1 cm."; }
  else if (pts === 3) { lvl = "TR3"; act = "FNA if ≥2.5 cm; follow-up if ≥1.5 cm."; }
  else if (pts === 2) { lvl = "TR2"; act = "No FNA."; }
  const s = num(sizeCm);
  let rec = act;
  if (s != null) {
    const th = { TR3: [2.5, 1.5], TR4: [1.5, 1.0], TR5: [1.0, 0.5] }[lvl];
    if (th) rec = s >= th[0] ? "FNA recommended." : s >= th[1] ? "Follow-up ultrasound recommended." : "No FNA or follow-up indicated by size criteria.";
    else rec = "No FNA indicated.";
  }
  return { pts, lvl, rec };
}

const BIRADS_TXT = {
  "0": "Incomplete — further imaging required.",
  "1": "Negative.",
  "2": "Benign finding.",
  "3": "Probably benign — short-interval follow-up at 6 months suggested (<2% malignancy risk).",
  "4A": "Low suspicion for malignancy — tissue diagnosis suggested.",
  "4B": "Moderate suspicion for malignancy — tissue diagnosis suggested.",
  "4C": "High suspicion for malignancy — tissue diagnosis suggested.",
  "5": "Highly suggestive of malignancy — appropriate action should be taken.",
  "6": "Known biopsy-proven malignancy.",
};

const ORADS_TXT = {
  "0": "Incomplete evaluation.",
  "1": "Normal premenopausal ovary.",
  "2": "Almost certainly benign (<1% risk).",
  "3": "Low risk of malignancy (1–<10%).",
  "4": "Intermediate risk of malignancy (10–<50%).",
  "5": "High risk of malignancy (≥50%).",
};

/* Hadlock EFW (BPD, HC, AC, FL in cm) -> grams */
function efwHadlock(bpd, hc, ac, fl) {
  if (!(hc && ac && fl)) return null;
  const log10w =
    1.326 - 0.00326 * ac * fl + 0.0107 * hc + 0.0438 * ac + 0.158 * fl;
  return Math.round(Math.pow(10, log10w));
}

/* ============================================================
   FIELD PRIMITIVES
   ============================================================ */
const F = {
  sel: (k, label, opts, extra = {}) => ({ k, label, type: "sel", opts, ...extra }),
  num: (k, label, unit, extra = {}) => ({ k, label, type: "num", unit, ...extra }),
  txt: (k, label, extra = {}) => ({ k, label, type: "txt", ...extra }),
  area: (k, label, extra = {}) => ({ k, label, type: "area", ...extra }),
  les: (k, label, extra = {}) => ({ k, label, type: "les", ...extra }),
  seg: (k, label, extra = {}) => ({ k, label, type: "seg", ...extra }),
  head: (label) => ({ type: "head", label }),
};

/* ============================================================
   MODALITY DEFINITIONS
   ============================================================ */

const HYDRO = ["", "no hydronephrosis", "mild hydronephrosis", "moderate hydronephrosis", "gross hydronephrosis", "mild hydroureteronephrosis", "moderate hydroureteronephrosis"];
const CORTECHO = ["", "normal cortical echogenicity", "grade I raised cortical echogenicity", "grade II raised cortical echogenicity", "grade III raised cortical echogenicity"];

const ABDOMEN = {
  id: "abdomen",
  name: "Abdomen and pelvis",
  group: "General",
  blurb: "Whole abdomen survey — liver to bladder, with pelvic organs.",
  sections: [
    {
      id: "liver",
      title: "Liver",
      normal: { size: "14.5", echo: "normal in echotexture", surface: "smooth", fatty: "", ihbr: "not dilated", pv: "10", lesion: [] },
      fields: [
        F.num("size", "Craniocaudal span", "cm"),
        F.sel("echo", "Echotexture", ["", "normal in echotexture", "coarse echotexture", "increased echogenicity", "heterogeneous echotexture", "nodular echotexture"]),
        F.sel("surface", "Surface", ["", "smooth", "nodular", "irregular"]),
        F.sel("fatty", "Fatty change", ["", "grade I fatty change", "grade II fatty change", "grade III fatty change"]),
        F.sel("ihbr", "Intrahepatic biliary radicles", ["", "not dilated", "mildly dilated", "dilated"]),
        F.num("pv", "Portal vein diameter", "mm"),
        F.sel("pvflow", "Portal flow", ["", "hepatopetal with normal phasicity", "hepatofugal", "portal vein thrombosis"]),
        F.les("lesion", "Focal hepatic lesion", { noun: "lesion", site: "liver" }),
      ],
      render: (v) => {
        const l = [];
        l.push(
          j(
            "Liver is",
            num(v.size) != null ? `normal in size (${v.size} cm)` : "normal in size",
            "and", v.echo || "normal in echotexture"
          ) + "."
        );
        if (v.fatty) l.push(`Features of ${v.fatty} are noted.`);
        if (v.surface && v.surface !== "smooth") l.push(`Liver surface appears ${v.surface}.`);
        l.push(v.ihbr === "not dilated" || !v.ihbr ? "Intrahepatic biliary radicles are not dilated." : `Intrahepatic biliary radicles are ${v.ihbr}.`);
        if (num(v.pv) != null) l.push(`Portal vein measures ${v.pv} mm at the porta${v.pvflow ? `, showing ${v.pvflow}` : ""}.`);
        else if (v.pvflow) l.push(`Portal venous flow is ${v.pvflow}.`);
        const les = (v.lesion || []).map((L) => lesionSentence(L, { noun: "lesion" }));
        if (les.length) l.push(...les);
        else l.push("No focal solid or cystic lesion is seen in the liver.");
        return l;
      },
    },
    {
      id: "gb",
      title: "Gallbladder and CBD",
      normal: { state: "well distended", wall: "2", calc: "no calculus", sludge: "no", polyp: "no", murphy: "negative", pericho: "no", cbd: "4" },
      fields: [
        F.sel("state", "Gallbladder", ["", "well distended", "partially distended", "physiologically contracted", "distended and tense", "contracted, thick-walled", "surgically absent"]),
        F.num("wall", "Wall thickness", "mm"),
        F.sel("calc", "Calculi", ["", "no calculus", "a single calculus", "multiple calculi", "layer of small calculi"]),
        F.num("calcsize", "Largest calculus", "mm"),
        F.sel("sludge", "Sludge", YN),
        F.sel("polyp", "Polyp", YN),
        F.num("polypsize", "Polyp size", "mm"),
        F.sel("pericho", "Pericholecystic fluid", YN),
        F.sel("murphy", "Sonographic Murphy sign", ["", "negative", "positive"]),
        F.num("cbd", "CBD diameter", "mm"),
        F.sel("cbdcalc", "CBD calculus", YN),
      ],
      render: (v) => {
        const l = [];
        if (v.state === "surgically absent") { l.push("Gallbladder is surgically absent."); }
        else {
          l.push(j("Gallbladder is", v.state || "well distended", num(v.wall) != null ? `with a wall thickness of ${v.wall} mm` : null) + ".");
          if (v.calc && v.calc !== "no calculus")
            l.push(j(cap(v.calc), "is seen within the lumen", num(v.calcsize) != null ? `, the largest measuring ${v.calcsize} mm` : null, ", showing posterior acoustic shadowing") + ".");
          else l.push("No calculus or sludge is seen within the lumen.");
          if (v.sludge === "yes") l.push("Echogenic sludge is noted within the lumen.");
          if (v.polyp === "yes") l.push(j("A non-shadowing polypoidal wall lesion is noted", num(v.polypsize) != null ? `measuring ${v.polypsize} mm` : null) + ".");
          if (v.pericho === "yes") l.push("Pericholecystic fluid is present.");
          if (v.murphy === "positive") l.push("Sonographic Murphy sign is positive.");
        }
        l.push(j("Common bile duct is", num(v.cbd) != null && num(v.cbd) > 6 ? `dilated, measuring ${v.cbd} mm` : num(v.cbd) != null ? `normal in calibre (${v.cbd} mm)` : "normal in calibre") + ".");
        if (v.cbdcalc === "yes") l.push("A calculus is seen within the distal common bile duct.");
        return l;
      },
    },
    {
      id: "panc",
      title: "Pancreas",
      normal: { vis: "adequately visualised", echo: "normal in size and echotexture", duct: "no", peri: "no" },
      fields: [
        F.sel("vis", "Visualisation", ["", "adequately visualised", "partially obscured by bowel gas", "not visualised due to overlying bowel gas"]),
        F.sel("echo", "Appearance", ["", "normal in size and echotexture", "bulky with hypoechoic echotexture", "atrophic", "hyperechoic (fatty replacement)", "coarse with calcifications"]),
        F.sel("duct", "Main pancreatic duct dilated", YN),
        F.num("ductsize", "Duct calibre", "mm"),
        F.sel("peri", "Peripancreatic collection", YN),
        F.les("lesion", "Pancreatic lesion", { noun: "lesion", site: "pancreas" }),
      ],
      render: (v) => {
        if (v.vis === "not visualised due to overlying bowel gas") return ["Pancreas could not be adequately assessed due to overlying bowel gas."];
        const l = [j("Pancreas is", v.echo || "normal in size and echotexture", v.vis === "partially obscured by bowel gas" ? "(partially obscured by bowel gas)" : null) + "."];
        l.push(v.duct === "yes" ? j("Main pancreatic duct is dilated", num(v.ductsize) != null ? `, measuring ${v.ductsize} mm` : null) + "." : "Main pancreatic duct is not dilated.");
        if (v.peri === "yes") l.push("Peripancreatic fluid collection is noted.");
        (v.lesion || []).forEach((L) => l.push(lesionSentence(L, { noun: "lesion" })));
        return l;
      },
    },
    {
      id: "spleen",
      title: "Spleen",
      normal: { size: "9.5", echo: "normal in echotexture" },
      fields: [
        F.num("size", "Longitudinal span", "cm"),
        F.sel("echo", "Echotexture", ["", "normal in echotexture", "heterogeneous echotexture"]),
        F.sel("splenic", "Splenic vein", ["", "normal in calibre", "dilated"]),
        F.les("lesion", "Splenic lesion", { noun: "lesion", site: "spleen" }),
      ],
      render: (v) => {
        const s = num(v.size);
        const l = [j("Spleen is", s != null ? (s > 12 ? `enlarged, measuring ${v.size} cm` : `normal in size (${v.size} cm)`) : "normal in size", "and", v.echo || "normal in echotexture") + "."];
        if (v.splenic === "dilated") l.push("Splenic vein is dilated at the hilum.");
        const les = (v.lesion || []).map((L) => lesionSentence(L, { noun: "lesion" }));
        l.push(...(les.length ? les : ["No focal splenic lesion is seen."]));
        return l;
      },
    },
    {
      id: "rk",
      title: "Right kidney",
      normal: { size1: "10.2", size2: "4.4", cmd: "maintained", echo: "normal cortical echogenicity", hydro: "no hydronephrosis", calc: "no", cyst: "no" },
      fields: [
        F.num("size1", "Length", "cm"), F.num("size2", "Width", "cm"),
        F.num("ct", "Cortical thickness", "mm"),
        F.sel("cmd", "Corticomedullary differentiation", ["", "maintained", "partially lost", "lost"]),
        F.sel("echo", "Cortical echogenicity", CORTECHO),
        F.sel("hydro", "Pelvicalyceal system", HYDRO),
        F.sel("calc", "Calculus", ["", "no", "single calculus", "multiple calculi"]),
        F.num("calcsize", "Largest calculus", "mm"),
        F.sel("calcsite", "Calculus site", ["", "upper calyx", "mid calyx", "lower calyx", "renal pelvis", "pelviureteric junction"]),
        F.sel("cyst", "Simple cyst", YN),
        F.num("cystsize", "Cyst size", "mm"),
        F.les("lesion", "Renal mass", { noun: "lesion", site: "right kidney" }),
      ],
      render: (v) => renalRender(v, "Right"),
    },
    {
      id: "lk",
      title: "Left kidney",
      normal: { size1: "10.5", size2: "4.5", cmd: "maintained", echo: "normal cortical echogenicity", hydro: "no hydronephrosis", calc: "no", cyst: "no" },
      fields: [
        F.num("size1", "Length", "cm"), F.num("size2", "Width", "cm"),
        F.num("ct", "Cortical thickness", "mm"),
        F.sel("cmd", "Corticomedullary differentiation", ["", "maintained", "partially lost", "lost"]),
        F.sel("echo", "Cortical echogenicity", CORTECHO),
        F.sel("hydro", "Pelvicalyceal system", HYDRO),
        F.sel("calc", "Calculus", ["", "no", "single calculus", "multiple calculi"]),
        F.num("calcsize", "Largest calculus", "mm"),
        F.sel("calcsite", "Calculus site", ["", "upper calyx", "mid calyx", "lower calyx", "renal pelvis", "pelviureteric junction"]),
        F.sel("cyst", "Simple cyst", YN),
        F.num("cystsize", "Cyst size", "mm"),
        F.les("lesion", "Renal mass", { noun: "lesion", site: "left kidney" }),
      ],
      render: (v) => renalRender(v, "Left"),
    },
    {
      id: "ureter",
      title: "Ureters",
      normal: { r: "not dilated", l: "not dilated" },
      fields: [
        F.sel("r", "Right ureter", ["", "not dilated", "dilated in upper third", "dilated up to the vesicoureteric junction", "dilated throughout"]),
        F.sel("l", "Left ureter", ["", "not dilated", "dilated in upper third", "dilated up to the vesicoureteric junction", "dilated throughout"]),
        F.sel("calc", "VUJ calculus", ["", "none", "right VUJ calculus", "left VUJ calculus"]),
        F.num("calcsize", "Calculus size", "mm"),
        F.sel("jet", "Ureteric jets", ["", "bilaterally demonstrable", "absent on the right", "absent on the left"]),
      ],
      render: (v) => {
        const l = [];
        if ((v.r || "not dilated") === "not dilated" && (v.l || "not dilated") === "not dilated") l.push("Both ureters are not dilated in their visualised course.");
        else l.push(j("Right ureter is", v.r || "not dilated", "and left ureter is", v.l || "not dilated") + ".");
        if (v.calc && v.calc !== "none") l.push(j("A", num(v.calcsize) != null ? `${v.calcsize} mm` : null, "calculus is impacted at the", v.calc.replace(" calculus", "")) + ".");
        if (v.jet && v.jet !== "bilaterally demonstrable") l.push(`Ureteric jet is ${v.jet}.`);
        return l;
      },
    },
    {
      id: "bladder",
      title: "Urinary bladder",
      normal: { state: "well distended", wall: "3", calc: "no", pvr: "" },
      fields: [
        F.sel("state", "Distension", ["", "well distended", "partially distended", "poorly distended", "catheterised"]),
        F.num("wall", "Wall thickness", "mm"),
        F.sel("walltype", "Wall outline", ["", "smooth", "trabeculated", "irregular"]),
        F.sel("calc", "Calculus", YN),
        F.num("calcsize", "Calculus size", "mm"),
        F.sel("mass", "Mural mass", YN),
        F.num("massSize", "Mass size", "mm"),
        F.head("Volumes (L × W × H in cm)"),
        F.num("a", "Pre-void L", "cm"), F.num("b", "Pre-void W", "cm"), F.num("c", "Pre-void H", "cm"),
        F.num("pa", "Post-void L", "cm"), F.num("pb", "Post-void W", "cm"), F.num("pc", "Post-void H", "cm"),
      ],
      render: (v) => {
        const l = [];
        const vol = ellipsoid(num(v.a), num(v.b), num(v.c));
        const pvr = ellipsoid(num(v.pa), num(v.pb), num(v.pc));
        l.push(j("Urinary bladder is", v.state || "well distended", vol ? `with a pre-void volume of ${vol} ml` : null, "with", v.walltype || "smooth", "outline", num(v.wall) != null ? `and wall thickness of ${v.wall} mm` : null) + ".");
        if (v.calc === "yes") l.push(j("A mobile echogenic calculus", num(v.calcsize) != null ? `measuring ${v.calcsize} mm` : null, "with posterior acoustic shadowing is seen within the lumen") + ".");
        else l.push("No calculus is seen within the lumen.");
        if (v.mass === "yes") l.push(j("A mural soft tissue lesion", num(v.massSize) != null ? `measuring ${v.massSize} mm` : null, "is noted projecting into the lumen") + ".");
        if (pvr != null) l.push(`Post-void residual urine volume is ${pvr} ml.`);
        return l;
      },
    },
    {
      id: "prostate",
      title: "Prostate / seminal vesicles",
      normal: { echo: "normal in echotexture", median: "no" },
      fields: [
        F.num("a", "Length", "cm"), F.num("b", "Width", "cm"), F.num("c", "Height", "cm"),
        F.sel("echo", "Echotexture", ["", "normal in echotexture", "heterogeneous echotexture", "with peripheral calcifications"]),
        F.sel("median", "Median lobe indentation", YN),
        F.sel("sv", "Seminal vesicles", ["", "normal", "distended", "asymmetric"]),
      ],
      when: (g) => g.sex !== "F",
      render: (v) => {
        const vol = ellipsoid(num(v.a), num(v.b), num(v.c));
        const l = [j("Prostate is", vol ? (vol > 30 ? `enlarged with a volume of ${vol} cc` : `normal in size, volume ${vol} cc`) : "normal in size", "and", v.echo || "normal in echotexture") + "."];
        if (v.median === "yes") l.push("Median lobe indents the bladder base.");
        if (v.sv && v.sv !== "normal") l.push(`Seminal vesicles are ${v.sv}.`);
        return l;
      },
    },
    {
      id: "misc",
      title: "Aorta, nodes and free fluid",
      normal: { aorta: "normal in calibre", ffluid: "no", nodes: "no", bowel: "no" },
      fields: [
        F.sel("aorta", "Abdominal aorta", ["", "normal in calibre", "ectatic", "aneurysmally dilated"]),
        F.num("aortaSize", "Aortic diameter", "cm"),
        F.sel("ivc", "IVC", ["", "normal in calibre with respiratory variation", "dilated with reduced collapsibility", "collapsed"]),
        F.sel("ffluid", "Free fluid", ["", "no", "minimal free fluid", "moderate free fluid", "gross ascites", "loculated collection"]),
        F.txt("ffluidSite", "Free fluid site (pelvis / Morison's pouch / perisplenic)"),
        F.sel("nodes", "Lymphadenopathy", ["", "no", "few sub-centimetric nodes", "enlarged nodes"]),
        F.txt("nodeSite", "Nodal station"),
        F.num("nodeSize", "Largest node", "mm"),
        F.sel("bowel", "Bowel", ["", "no", "dilated fluid-filled loops", "thickened bowel wall", "increased peristalsis", "absent peristalsis"]),
      ],
      render: (v) => {
        const l = [];
        l.push(j("Abdominal aorta is", v.aorta || "normal in calibre", num(v.aortaSize) != null ? `(${v.aortaSize} cm)` : null) + ".");
        if (v.ivc) l.push(`IVC is ${v.ivc}.`);
        if (v.ffluid && v.ffluid !== "no") l.push(j(cap(v.ffluid), "is noted", v.ffluidSite ? `in the ${v.ffluidSite}` : null) + ".");
        else l.push("No free fluid is seen in the peritoneal cavity.");
        if (v.nodes && v.nodes !== "no") l.push(j(cap(v.nodes), "are noted", v.nodeSite ? `in the ${v.nodeSite}` : null, num(v.nodeSize) != null ? `, the largest measuring ${v.nodeSize} mm in short axis` : null) + ".");
        else l.push("No significant abdominal or pelvic lymphadenopathy is seen.");
        if (v.bowel && v.bowel !== "no") l.push(`Bowel shows ${v.bowel}.`);
        return l;
      },
    },
  ],
};

function renalRender(v, side) {
  const l = [];
  const size = dims(v, ["size1", "size2"]);
  l.push(
    j(
      `${side} kidney measures`,
      size || "normal in size",
      "with",
      v.cmd === "maintained" || !v.cmd ? "maintained corticomedullary differentiation" : `${v.cmd} corticomedullary differentiation`,
      v.echo && v.echo !== "normal cortical echogenicity" ? `and ${v.echo}` : "and normal cortical echogenicity",
      num(v.ct) != null ? `(cortical thickness ${v.ct} mm)` : null
    ) + "."
  );
  l.push(v.hydro && v.hydro !== "no hydronephrosis" ? `There is ${v.hydro} on the ${side.toLowerCase()} side.` : `No ${side.toLowerCase()}-sided hydronephrosis is seen.`);
  if (v.calc && v.calc !== "no")
    l.push(j(cap(v.calc), num(v.calcsize) != null ? `measuring ${v.calcsize} mm` : null, v.calcsite ? `is seen in the ${v.calcsite}` : "is seen", ", with posterior acoustic shadowing") + ".");
  else l.push("No calculus is seen.");
  if (v.cyst === "yes") l.push(j("A simple cortical cyst", num(v.cystsize) != null ? `measuring ${v.cystsize} mm` : null, "is noted") + ".");
  (v.lesion || []).forEach((L) => l.push(lesionSentence(L, { noun: "lesion" })));
  return l;
}

/* ---------- KUB ---------- */
const KUB = {
  id: "kub",
  name: "KUB",
  group: "General",
  blurb: "Kidneys, ureters, bladder and prostate.",
  sections: [ABDOMEN.sections.find(s=>s.id==="rk"), ABDOMEN.sections.find(s=>s.id==="lk"), ABDOMEN.sections.find(s=>s.id==="ureter"), ABDOMEN.sections.find(s=>s.id==="bladder"), ABDOMEN.sections.find(s=>s.id==="prostate")],
};

/* ---------- Female pelvis ---------- */
const PELVIS = {
  id: "pelvis",
  name: "Pelvis (female)",
  group: "General",
  blurb: "Transabdominal or transvaginal — uterus, endometrium, ovaries, adnexa with O-RADS.",
  sections: [
    {
      id: "uterus",
      title: "Uterus and myometrium",
      normal: { pos: "anteverted, anteflexed", a: "7.6", b: "4.2", c: "3.8", myo: "homogeneous myometrial echotexture", fibroid: [] },
      fields: [
        F.sel("route", "Route", ["", "transabdominal", "transvaginal", "transabdominal and transvaginal"]),
        F.sel("pos", "Position", ["", "anteverted, anteflexed", "retroverted, retroflexed", "mid-position", "axial"]),
        F.num("a", "Length", "cm"), F.num("b", "Width", "cm"), F.num("c", "AP", "cm"),
        F.sel("myo", "Myometrium", ["", "homogeneous myometrial echotexture", "heterogeneous myometrial echotexture", "globular bulky uterus with asymmetric myometrial thickening", "with subendometrial echogenic striations"]),
        F.sel("adeno", "Adenomyosis features", ["", "none", "myometrial cysts and venetian-blind shadowing suggestive of adenomyosis", "focal adenomyoma"]),
        F.les("fibroid", "Fibroid", { noun: "fibroid", site: "myometrium", siteOpts: ["anterior wall", "posterior wall", "fundus", "right lateral wall", "left lateral wall", "lower uterine segment", "cervix"], extraSel: [["loc", "Location type", ["", "intramural", "submucosal", "subserosal", "broad ligament"]]] }),
      ],
      render: (v) => {
        const l = [];
        const size = dims(v, ["a", "b", "c"]);
        const vol = ellipsoid(num(v.a), num(v.b), num(v.c));
        l.push(j("Uterus is", v.pos || "anteverted, anteflexed", "and measures", size || "normal in size", vol ? `(volume ${vol} cc)` : null) + ".");
        l.push(j("Myometrium shows", v.myo || "homogeneous myometrial echotexture") + ".");
        if (v.adeno && v.adeno !== "none") l.push(cap(v.adeno) + ".");
        const f = (v.fibroid || []).map((L) => lesionSentence(L, { noun: "fibroid" }));
        l.push(...(f.length ? f : ["No myometrial fibroid is seen."]));
        return l;
      },
    },
    {
      id: "endo",
      title: "Endometrium and cervix",
      normal: { et: "7", pat: "trilaminar", cav: "empty", cx: "normal" },
      fields: [
        F.num("et", "Endometrial thickness", "mm"),
        F.sel("pat", "Pattern", ["", "trilaminar", "homogeneous and echogenic", "hypoechoic", "irregular", "heterogeneous"]),
        F.sel("cav", "Endometrial cavity", ["", "empty", "containing fluid", "containing echogenic contents", "containing a gestational sac", "containing an intrauterine contraceptive device in situ"]),
        F.sel("polyp", "Endometrial polyp", YN),
        F.num("polypSize", "Polyp size", "mm"),
        F.sel("cx", "Cervix", ["", "normal", "bulky", "with nabothian cysts", "with a mass lesion"]),
      ],
      render: (v) => {
        const l = [];
        l.push(j("Endometrium measures", num(v.et) != null ? `${v.et} mm` : "normal in thickness", "and is", v.pat || "homogeneous and echogenic") + ".");
        l.push(j("Endometrial cavity is", v.cav || "empty") + ".");
        if (v.polyp === "yes") l.push(j("A focal echogenic endometrial lesion", num(v.polypSize) != null ? `measuring ${v.polypSize} mm` : null, "suggestive of a polyp is noted") + ".");
        l.push(v.cx === "normal" || !v.cx ? "Cervix appears normal." : `Cervix is ${v.cx}.`);
        return l;
      },
    },
    {
      id: "ro",
      title: "Right ovary",
      normal: { a: "3.0", b: "2.0", c: "1.8", echo: "normal in echotexture", fol: "" },
      fields: [F.num("a", "L", "cm"), F.num("b", "W", "cm"), F.num("c", "AP", "cm"), F.sel("echo", "Echotexture", ["", "normal in echotexture", "bulky with peripherally arranged follicles", "heterogeneous"]), F.num("fol", "Follicle count", ""), F.num("dom", "Dominant follicle", "mm"), F.sel("cl", "Corpus luteum", YN)],
      render: (v) => ovaryRender(v, "Right"),
    },
    {
      id: "lo",
      title: "Left ovary",
      normal: { a: "3.1", b: "2.0", c: "1.7", echo: "normal in echotexture" },
      fields: [F.num("a", "L", "cm"), F.num("b", "W", "cm"), F.num("c", "AP", "cm"), F.sel("echo", "Echotexture", ["", "normal in echotexture", "bulky with peripherally arranged follicles", "heterogeneous"]), F.num("fol", "Follicle count", ""), F.num("dom", "Dominant follicle", "mm"), F.sel("cl", "Corpus luteum", YN)],
      render: (v) => ovaryRender(v, "Left"),
    },
    {
      id: "adnexa",
      title: "Adnexa, O-RADS and pouch of Douglas",
      normal: { pod: "no", mass: [] },
      score: "orads",
      fields: [
        F.les("mass", "Adnexal mass", { noun: "lesion", siteOpts: ["right adnexa", "left adnexa", "pouch of Douglas"] }),
        F.head("O-RADS descriptors"),
        F.sel("papil", "Papillary projections", ["", "none", "present (1–3)", "present (≥4)"]),
        F.sel("solid", "Solid component", ["", "none", "present, smooth", "present, irregular"]),
        F.sel("cs", "Colour score", ["", "1 — no flow", "2 — minimal flow", "3 — moderate flow", "4 — strong flow"]),
        F.sel("orads", "O-RADS assignment", ["", "0", "1", "2", "3", "4", "5"]),
        F.sel("pod", "Free fluid in pouch of Douglas", ["", "no", "minimal", "moderate", "gross"]),
        F.sel("tender", "Probe tenderness", ["", "absent", "present over the right adnexa", "present over the left adnexa", "present over both adnexa"]),
      ],
      render: (v) => {
        const l = [];
        const m = (v.mass || []).map((L) => lesionSentence(L, { noun: "lesion" }));
        l.push(...(m.length ? m : ["No adnexal mass is seen on either side."]));
        if (m.length) {
          const d = listAnd([
            v.papil && v.papil !== "none" ? `papillary projections ${v.papil.replace("present ", "")}` : null,
            v.solid && v.solid !== "none" ? `a solid component that is ${v.solid.replace("present, ", "")}` : null,
            v.cs ? `a colour score of ${v.cs}` : null,
          ]);
          if (d) l.push(`The lesion shows ${d}.`);
        }
        if (v.orads) l.push(`O-RADS ${v.orads} — ${ORADS_TXT[v.orads]}`);
        l.push(v.pod && v.pod !== "no" ? `${cap(v.pod)} free fluid is noted in the pouch of Douglas.` : "No free fluid is seen in the pouch of Douglas.");
        if (v.tender && v.tender !== "absent") l.push(`Probe tenderness is ${v.tender}.`);
        return l;
      },
    },
  ],
};

function ovaryRender(v, side) {
  const size = dims(v, ["a", "b", "c"]);
  const vol = ellipsoid(num(v.a), num(v.b), num(v.c));
  const l = [j(`${side} ovary measures`, size || "normal in size", vol ? `(volume ${vol} cc)` : null, "and is", v.echo || "normal in echotexture") + "."];
  if (num(v.fol) != null) l.push(`${numWord(num(v.fol)) === String(num(v.fol)) ? num(v.fol) : num(v.fol)} follicles are seen${num(v.dom) != null ? `, the dominant follicle measuring ${v.dom} mm` : ""}.`);
  else if (num(v.dom) != null) l.push(`A dominant follicle measuring ${v.dom} mm is seen.`);
  if (v.cl === "yes") l.push("A corpus luteum is identified.");
  return l;
}

/* ---------- Soft tissue ---------- */
const SOFT = {
  id: "soft",
  name: "Soft tissue / swelling",
  group: "Small parts",
  blurb: "Any superficial lump — the component-by-component builder from your example.",
  sections: [
    {
      id: "lump",
      title: "Lesion",
      normal: {},
      fields: [
        F.les("lesion", "Lesion", {
          noun: "lesion",
          siteFree: true,
          extraSel: [
            ["plane", "Tissue plane", ["", "subcutaneous plane", "dermal / subdermal plane", "intramuscular plane", "intermuscular plane", "subfascial plane", "involving skin and subcutaneous tissue"]],
            ["deep", "Deep extension", ["", "no evidence of deeper extension", "extension into the underlying muscle", "abutting but not infiltrating the underlying fascia", "infiltration of the underlying fascia and muscle"]],
            ["post", "Posterior acoustic feature", ["", "posterior acoustic enhancement", "posterior acoustic shadowing", "no posterior acoustic feature"]],
            ["mob", "Mobility / compressibility", ["", "compressible", "non-compressible", "freely mobile over deeper planes", "fixed to deeper planes"]],
            ["sinus", "Tract / sinus", ["", "a sinus tract reaching the skin surface", "no communicating tract"]],
          ],
        }),
      ],
      render: (v) => {
        const l = (v.lesion || []).map((L) => lesionSentence(L, { noun: "lesion" }));
        return l.length ? l : ["No focal soft tissue lesion is seen in the region scanned."];
      },
    },
    {
      id: "surround",
      title: "Surrounding tissue and add-ons",
      normal: { fat: "no", collection: "no", nodes: "no", tender: "absent" },
      fields: [
        F.sel("fat", "Surrounding fat", ["", "no", "echogenic inflamed fat", "oedematous subcutaneous tissue with cobblestoning"]),
        F.sel("collection", "Collection", ["", "no", "an anechoic collection", "a thick-walled collection with internal debris and mobile echoes"]),
        F.num("collVol", "Collection volume", "ml"),
        F.sel("air", "Internal echogenic foci with dirty shadowing (gas)", YN),
        F.sel("fb", "Foreign body", YN),
        F.sel("tender", "Probe tenderness", ["", "absent", "present over the lesion", "marked, over the lesion and surrounding tissue"]),
        F.sel("nodes", "Regional nodes", ["", "no", "reactive nodes with preserved hilum", "enlarged rounded nodes with loss of fatty hilum"]),
        F.txt("nodeSite", "Nodal station"),
        F.num("nodeSize", "Largest node", "mm"),
      ],
      render: (v) => {
        const l = [];
        if (v.fat && v.fat !== "no") l.push(`Surrounding tissue shows ${v.fat}.`);
        if (v.collection && v.collection !== "no") l.push(j(cap(v.collection.replace(/^an? /, "")).replace(/^/, v.collection.startsWith("an") ? "An " : "A "), "is noted in the region", num(v.collVol) != null ? `, approximate volume ${v.collVol} ml` : null) + ".");
        if (v.air === "yes") l.push("Internal echogenic foci with dirty posterior shadowing are noted, suggesting gas.");
        if (v.fb === "yes") l.push("A linear echogenic focus suggestive of a foreign body is identified.");
        if (v.tender && v.tender !== "absent") l.push(`Probe tenderness is ${v.tender}.`);
        if (v.nodes && v.nodes !== "no") l.push(j(cap(v.nodes), "are seen", v.nodeSite ? `in the ${v.nodeSite}` : null, num(v.nodeSize) != null ? `, the largest measuring ${v.nodeSize} mm` : null) + ".");
        else l.push("No enlarged regional lymph nodes are seen.");
        return l;
      },
    },
  ],
};

/* ---------- Thyroid ---------- */
const THYROID = {
  id: "thyroid",
  name: "Thyroid",
  group: "Small parts",
  blurb: "Gland survey with ACR TI-RADS scoring for each nodule.",
  sections: [
    {
      id: "gland",
      title: "Gland",
      normal: { echo: "normal in echotexture", isth: "2.5" },
      fields: [
        F.head("Right lobe (cm)"), F.num("ra", "L", "cm"), F.num("rb", "W", "cm"), F.num("rc", "AP", "cm"),
        F.head("Left lobe (cm)"), F.num("la", "L", "cm"), F.num("lb", "W", "cm"), F.num("lc", "AP", "cm"),
        F.num("isth", "Isthmus thickness", "mm"),
        F.sel("echo", "Parenchymal echotexture", ["", "normal in echotexture", "diffusely heterogeneous and hypoechoic", "coarse with micronodulation", "increased in echogenicity"]),
        F.sel("vasc", "Parenchymal vascularity", ["", "normal", "increased ('thyroid inferno')", "reduced"]),
      ],
      render: (v) => {
        const rv = ellipsoid(num(v.ra), num(v.rb), num(v.rc));
        const lv = ellipsoid(num(v.la), num(v.lb), num(v.lc));
        const l = [];
        l.push(j("Right lobe measures", dims(v, ["ra", "rb", "rc"]) || "normal in size", rv ? `(volume ${rv} cc)` : null, "and left lobe measures", dims(v, ["la", "lb", "lc"]) || "normal in size", lv ? `(volume ${lv} cc)` : null) + ".");
        if (num(v.isth) != null) l.push(`Isthmus measures ${v.isth} mm in thickness.`);
        l.push(j("Thyroid parenchyma is", v.echo || "normal in echotexture", v.vasc && v.vasc !== "normal" ? `with ${v.vasc} vascularity` : null) + ".");
        return l;
      },
    },
    {
      id: "nodule",
      title: "Nodule and TI-RADS",
      normal: {},
      fields: [
        F.les("nodule", "Nodule", { noun: "nodule", siteOpts: ["upper pole of the right lobe", "mid right lobe", "lower pole of the right lobe", "upper pole of the left lobe", "mid left lobe", "lower pole of the left lobe", "isthmus"] }),
        F.head("ACR TI-RADS"),
        F.sel("comp", "Composition", ["", ...TIRADS.comp.map((o) => o[0])]),
        F.sel("echo", "Echogenicity", ["", ...TIRADS.echo.map((o) => o[0])]),
        F.sel("shape", "Shape", ["", ...TIRADS.shape.map((o) => o[0])]),
        F.sel("margin", "Margin", ["", ...TIRADS.margin.map((o) => o[0])]),
        F.sel("foci", "Echogenic foci", ["", ...TIRADS.foci.map((o) => o[0])]),
        F.num("maxdim", "Maximum dimension for FNA threshold", "cm"),
      ],
      render: (v) => {
        const l = (v.nodule || []).map((L) => lesionSentence(L, { noun: "nodule" }));
        if (!l.length) l.push("No discrete thyroid nodule is seen.");
        if (v.comp || v.echo || v.margin || v.foci || v.shape) {
          const t = tiradsScore(v, v.maxdim);
          l.push(`ACR TI-RADS: ${t.pts} point${t.pts === 1 ? "" : "s"} — ${t.lvl}. ${t.rec}`);
        }
        return l;
      },
    },
    {
      id: "nodes",
      title: "Cervical nodes",
      normal: { nodes: "no" },
      fields: [
        F.sel("nodes", "Nodes", ["", "no", "few reactive nodes with preserved fatty hilum", "enlarged rounded nodes with loss of fatty hilum", "nodes with punctate calcification and cystic change"]),
        F.txt("level", "Level (II / III / IV / V / VI)"),
        F.num("size", "Largest short axis", "mm"),
      ],
      render: (v) =>
        v.nodes && v.nodes !== "no"
          ? [j(cap(v.nodes), "are seen", v.level ? `at level ${v.level}` : null, num(v.size) != null ? `, the largest measuring ${v.size} mm in short axis` : null) + "."]
          : ["No significant cervical lymphadenopathy is seen."],
    },
  ],
};

/* ---------- Breast ---------- */
const BREAST = {
  id: "breast",
  name: "Breast",
  group: "Small parts",
  blurb: "Lesion characterisation with BI-RADS assessment and axillary survey.",
  sections: [
    {
      id: "bg",
      title: "Background",
      normal: { side: "", bg: "fibroglandular", duct: "no" },
      fields: [
        F.sel("side", "Side", ["", "right breast", "left breast", "both breasts"]),
        F.sel("bg", "Parenchymal pattern", ["", "fibroglandular", "predominantly fatty", "heterogeneous fibroglandular", "dense fibroglandular"]),
        F.sel("duct", "Ductal ectasia", YN),
        F.num("ductSize", "Largest duct", "mm"),
      ],
      render: (v) => {
        const l = [j(cap(v.side || "Both breasts"), v.side === "both breasts" || !v.side ? "show" : "shows", v.bg || "fibroglandular", "parenchymal pattern") + "."];
        if (v.duct === "yes") l.push(j("Ductal ectasia is noted", num(v.ductSize) != null ? `, the largest duct measuring ${v.ductSize} mm` : null) + ".");
        return l;
      },
    },
    {
      id: "les",
      title: "Lesion and BI-RADS",
      normal: {},
      fields: [
        F.les("lesion", "Lesion", {
          noun: "lesion",
          siteFree: true,
          sitePlaceholder: "e.g. 10 o'clock position, 3 cm from nipple",
          extraSel: [
            ["orient", "Orientation", ["", "parallel to the skin surface", "not parallel to the skin surface"]],
            ["post", "Posterior features", ["", "posterior acoustic enhancement", "posterior acoustic shadowing", "no posterior features", "combined pattern"]],
            ["halo", "Echogenic halo", ["", "an echogenic halo", "no echogenic halo"]],
            ["skin", "Skin / chest wall", ["", "no skin or chest wall involvement", "skin thickening", "skin retraction", "chest wall involvement"]],
          ],
        }),
        F.sel("birads", "BI-RADS assessment", ["", "0", "1", "2", "3", "4A", "4B", "4C", "5", "6"]),
      ],
      render: (v) => {
        const l = (v.lesion || []).map((L) => lesionSentence(L, { noun: "lesion" }));
        if (!l.length) l.push("No discrete solid or cystic breast lesion is seen.");
        if (v.birads) l.push(`BI-RADS ${v.birads} — ${BIRADS_TXT[v.birads]}`);
        return l;
      },
    },
    {
      id: "ax",
      title: "Axilla",
      normal: { nodes: "no" },
      fields: [
        F.sel("nodes", "Axillary nodes", ["", "no", "nodes with preserved fatty hilum and cortical thickness under 3 mm", "nodes with cortical thickening", "rounded nodes with loss of fatty hilum"]),
        F.num("cortex", "Cortical thickness", "mm"),
      ],
      render: (v) =>
        v.nodes && v.nodes !== "no"
          ? [j("Axilla shows", v.nodes, num(v.cortex) != null ? `(cortical thickness ${v.cortex} mm)` : null) + "."]
          : ["No abnormal axillary lymph node is seen."],
    },
  ],
};

/* ---------- Scrotum ---------- */
const SCROTUM = {
  id: "scrotum",
  name: "Scrotum",
  group: "Small parts",
  blurb: "Testes, epididymis, hydrocele, varicocele grading and vascularity.",
  sections: [
    {
      id: "testes",
      title: "Testes",
      normal: { echo: "homogeneous echotexture", vasc: "symmetric and normal" },
      fields: [
        F.head("Right (cm)"), F.num("ra", "L", "cm"), F.num("rb", "W", "cm"), F.num("rc", "AP", "cm"),
        F.head("Left (cm)"), F.num("la", "L", "cm"), F.num("lb", "W", "cm"), F.num("lc", "AP", "cm"),
        F.sel("echo", "Echotexture", ["", "homogeneous echotexture", "heterogeneous echotexture", "with microlithiasis"]),
        F.sel("vasc", "Vascularity", ["", "symmetric and normal", "increased on the right", "increased on the left", "absent on the right", "absent on the left"]),
        F.sel("lie", "Lie", ["", "normal", "transverse lie on the right", "transverse lie on the left", "undescended on the right", "undescended on the left"]),
        F.les("lesion", "Testicular lesion", { noun: "lesion", siteOpts: ["right testis", "left testis"] }),
      ],
      render: (v) => {
        const rv = ellipsoid(num(v.ra), num(v.rb), num(v.rc));
        const lv = ellipsoid(num(v.la), num(v.lb), num(v.lc));
        const l = [j("Right testis measures", dims(v, ["ra", "rb", "rc"]) || "normal in size", rv ? `(volume ${rv} cc)` : null, "and left testis measures", dims(v, ["la", "lb", "lc"]) || "normal in size", lv ? `(volume ${lv} cc)` : null, "with", v.echo || "homogeneous echotexture") + "."];
        l.push(`Testicular vascularity on colour Doppler is ${v.vasc || "symmetric and normal"}.`);
        if (v.lie && v.lie !== "normal") l.push(`Testicular lie is abnormal: ${v.lie}.`);
        (v.lesion || []).forEach((L) => l.push(lesionSentence(L, { noun: "lesion" })));
        return l;
      },
    },
    {
      id: "epi",
      title: "Epididymis, hydrocele, varicocele",
      normal: { epi: "normal in size and echotexture", hydro: "no", varico: "no" },
      fields: [
        F.sel("epi", "Epididymis", ["", "normal in size and echotexture", "bulky and hypoechoic on the right with increased vascularity", "bulky and hypoechoic on the left with increased vascularity", "with a head cyst"]),
        F.sel("hydro", "Hydrocele", ["", "no", "minimal right hydrocele", "minimal left hydrocele", "moderate right hydrocele", "moderate left hydrocele", "gross hydrocele", "pyocele with internal septations"]),
        F.sel("varico", "Varicocele", ["", "no", "grade I varicocele", "grade II varicocele", "grade III varicocele"]),
        F.num("vein", "Largest vein calibre", "mm"),
        F.sel("side", "Varicocele side", ["", "right", "left", "bilateral"]),
        F.sel("valsalva", "Reflux on Valsalva", YN),
        F.sel("hernia", "Inguinal hernia", YN),
      ],
      render: (v) => {
        const l = [`Epididymis is ${v.epi || "normal in size and echotexture"}.`];
        l.push(v.hydro && v.hydro !== "no" ? `${cap(v.hydro)} is present.` : "No hydrocele is seen.");
        if (v.varico && v.varico !== "no")
          l.push(j(cap(v.varico), v.side ? `is noted on the ${v.side} side` : "is noted", num(v.vein) != null ? `, the largest vein measuring ${v.vein} mm` : null, v.valsalva === "yes" ? ", with reflux on Valsalva manoeuvre" : null) + ".");
        else l.push("No varicocele is seen.");
        if (v.hernia === "yes") l.push("An inguinoscrotal hernia containing bowel loops is noted.");
        return l;
      },
    },
  ],
};

/* ---------- Neonatal cranial ---------- */
const NSG = {
  id: "nsg",
  name: "Neonatal cranial (NSG)",
  group: "Paediatric",
  blurb: "Transfontanelle study — ventricles, haemorrhage grading, white matter, posterior fossa.",
  sections: [
    {
      id: "vent",
      title: "Ventricles and midline",
      normal: { vent: "normal in size and configuration", mid: "central", csp: "present" },
      fields: [
        F.sel("vent", "Lateral ventricles", ["", "normal in size and configuration", "mildly prominent", "dilated", "asymmetrically dilated"]),
        F.num("rvent", "Right ventricular width", "mm"),
        F.num("lvent", "Left ventricular width", "mm"),
        F.sel("third", "Third ventricle", ["", "normal", "dilated"]),
        F.sel("mid", "Midline", ["", "central", "shifted to the right", "shifted to the left"]),
        F.sel("csp", "Cavum septi pellucidi", ["", "present", "absent"]),
        F.sel("cc", "Corpus callosum", ["", "normal", "thinned", "not visualised"]),
      ],
      render: (v) => {
        const l = [j("Lateral ventricles are", v.vent || "normal in size and configuration", num(v.rvent) != null || num(v.lvent) != null ? `(right ${v.rvent || "-"} mm, left ${v.lvent || "-"} mm)` : null) + "."];
        if (v.third && v.third !== "normal") l.push(`Third ventricle is ${v.third}.`);
        l.push(j("Midline is", v.mid || "central", "and cavum septi pellucidi is", v.csp || "present") + ".");
        if (v.cc && v.cc !== "normal") l.push(`Corpus callosum is ${v.cc}.`);
        return l;
      },
    },
    {
      id: "hem",
      title: "Haemorrhage and white matter",
      normal: { ivh: "none", pvl: "none", gm: "normal" },
      fields: [
        F.sel("ivh", "Germinal matrix / IVH", ["", "none", "grade I — subependymal germinal matrix haemorrhage", "grade II — intraventricular haemorrhage without ventricular dilatation", "grade III — intraventricular haemorrhage with ventricular dilatation", "grade IV — periventricular haemorrhagic infarction"]),
        F.sel("side", "Side", ["", "right", "left", "bilateral"]),
        F.sel("pvl", "Periventricular echogenicity", ["", "none", "increased periventricular echogenicity", "periventricular cystic change suggestive of cystic PVL"]),
        F.sel("paren", "Parenchyma", ["", "normal in echotexture", "focal parenchymal echogenicity", "diffusely echogenic"]),
        F.sel("pf", "Posterior fossa", ["", "cerebellum and vermis appear normal", "cerebellar haemorrhage", "prominent cisterna magna"]),
        F.num("ri", "Anterior cerebral artery RI", ""),
        F.sel("edh", "Extra-axial spaces", ["", "normal", "prominent extra-axial spaces", "subdural collection"]),
      ],
      render: (v) => {
        const l = [];
        l.push(v.ivh && v.ivh !== "none" ? j(cap(v.ivh), v.side ? `is noted on the ${v.side} side` : "is noted") + "." : "No germinal matrix or intraventricular haemorrhage is seen.");
        l.push(v.pvl && v.pvl !== "none" ? cap(v.pvl) + " is noted." : "Periventricular white matter shows normal echogenicity.");
        if (v.paren) l.push(`Cerebral parenchyma is ${v.paren}.`);
        if (v.pf) l.push(cap(v.pf) + ".");
        if (num(v.ri) != null) l.push(`Resistive index in the anterior cerebral artery is ${v.ri}.`);
        if (v.edh && v.edh !== "normal") l.push(`Extra-axial spaces: ${v.edh}.`);
        return l;
      },
    },
  ],
};

/* ---------- Doppler: venous ---------- */
const VEN_SEGS = ["Common femoral vein", "Saphenofemoral junction", "Femoral vein (proximal)", "Femoral vein (mid)", "Femoral vein (distal)", "Popliteal vein", "Posterior tibial veins", "Peroneal veins", "Great saphenous vein", "Small saphenous vein"];
const VEN_SEGS_UL = ["Internal jugular vein", "Subclavian vein", "Axillary vein", "Brachial veins", "Basilic vein", "Cephalic vein", "Radial veins", "Ulnar veins"];

const VENOUS = {
  id: "venous",
  name: "Venous Doppler (limb)",
  group: "Doppler",
  blurb: "Segment-wise compressibility, augmentation and thrombus mapping.",
  sections: [
    {
      id: "setup",
      title: "Study",
      normal: { limb: "right lower limb" },
      fields: [F.sel("limb", "Limb", ["", "right lower limb", "left lower limb", "both lower limbs", "right upper limb", "left upper limb"]), F.sel("ind", "Indication", ["", "limb swelling", "pain", "suspected deep vein thrombosis", "varicose veins", "follow-up of known thrombosis"])],
      render: (v) => [j("Colour and spectral Doppler evaluation of the deep and superficial venous system of the", v.limb || "limb", "was performed") + "."],
    },
    {
      id: "seg",
      title: "Segments",
      normal: {},
      fields: [F.seg("segs", "Venous segments", { list: VEN_SEGS, listAlt: VEN_SEGS_UL, cols: [["comp", "Compressibility", ["fully compressible", "partially compressible", "non-compressible"]], ["flow", "Flow", ["phasic with normal augmentation", "continuous, loss of phasicity", "absent flow", "reduced augmentation"]], ["thr", "Thrombus", ["none", "acute hypoechoic thrombus", "subacute thrombus", "chronic echogenic thrombus with recanalisation"]]] })],
      render: (v) => {
        const rows = v.segs || {};
        const abn = Object.entries(rows).filter(([, r]) => r && ((r.comp && r.comp !== "fully compressible") || (r.thr && r.thr !== "none") || (r.flow && r.flow !== "phasic with normal augmentation")));
        if (!abn.length) return ["All the visualised deep and superficial venous segments are fully compressible and show phasic flow with normal response to distal augmentation.", "No evidence of deep vein thrombosis is seen."];
        const l = ["The remaining visualised venous segments are fully compressible with phasic flow and normal augmentation."];
        const out = abn.map(([name, r]) => j(name, "is", r.comp || "compressible", r.thr && r.thr !== "none" ? `and shows ${r.thr}` : null, r.flow && r.flow !== "phasic with normal augmentation" ? `with ${r.flow}` : null) + ".");
        return [...out, ...l];
      },
    },
    {
      id: "reflux",
      title: "Reflux and add-ons",
      normal: { gsv: "no", ssv: "no", perf: "no" },
      fields: [
        F.sel("gsv", "Great saphenous vein reflux", ["", "no", "reflux at the saphenofemoral junction", "reflux in the thigh segment", "reflux throughout"]),
        F.num("gsvT", "Reflux duration", "s"),
        F.sel("ssv", "Small saphenous vein reflux", ["", "no", "reflux at the saphenopopliteal junction", "reflux in the calf segment"]),
        F.sel("perf", "Incompetent perforators", ["", "no", "present"]),
        F.txt("perfSite", "Perforator site"),
        F.sel("baker", "Baker's cyst", YN),
        F.sel("edema", "Subcutaneous oedema", YN),
      ],
      render: (v) => {
        const l = [];
        if (v.gsv && v.gsv !== "no") l.push(j("Great saphenous vein shows", v.gsv, num(v.gsvT) != null ? `lasting ${v.gsvT} seconds` : null) + ".");
        if (v.ssv && v.ssv !== "no") l.push(`Small saphenous vein shows ${v.ssv}.`);
        if (v.perf === "present") l.push(j("Incompetent perforators are noted", v.perfSite ? `in the ${v.perfSite}` : null) + ".");
        if (!l.length) l.push("No saphenous or perforator incompetence is demonstrated.");
        if (v.baker === "yes") l.push("A Baker's cyst is noted in the popliteal fossa.");
        if (v.edema === "yes") l.push("Subcutaneous oedema is noted in the limb.");
        return l;
      },
    },
  ],
};

/* ---------- Doppler: arterial ---------- */
const ART_SEGS = ["Common femoral artery", "Profunda femoris artery", "Superficial femoral artery (proximal)", "Superficial femoral artery (mid)", "Superficial femoral artery (distal)", "Popliteal artery", "Anterior tibial artery", "Posterior tibial artery", "Peroneal artery", "Dorsalis pedis artery"];
const ART_SEGS_UL = ["Subclavian artery", "Axillary artery", "Brachial artery", "Radial artery", "Ulnar artery"];

const ARTERIAL = {
  id: "arterial",
  name: "Arterial Doppler (limb)",
  group: "Doppler",
  blurb: "Waveform, peak systolic velocity and stenosis mapping segment by segment.",
  sections: [
    {
      id: "setup",
      title: "Study",
      normal: { limb: "right lower limb" },
      fields: [F.sel("limb", "Limb", ["", "right lower limb", "left lower limb", "both lower limbs", "right upper limb", "left upper limb"]), F.sel("ind", "Indication", ["", "claudication", "rest pain", "non-healing ulcer", "cold limb", "pre-procedure mapping"])],
      render: (v) => [j("Colour and spectral Doppler evaluation of the arterial system of the", v.limb || "limb", "was performed") + "."],
    },
    {
      id: "seg",
      title: "Segments",
      normal: {},
      fields: [F.seg("segs", "Arterial segments", { list: ART_SEGS, listAlt: ART_SEGS_UL, num: ["psv"], cols: [["wave", "Waveform", ["triphasic", "biphasic", "monophasic", "damped monophasic", "no flow"]], ["plaque", "Plaque", ["none", "calcific plaque", "soft plaque", "mixed plaque", "occlusive thrombus"]], ["sten", "Stenosis", ["none", "under 50%", "50–69%", "70–99%", "complete occlusion"]]] })],
      render: (v) => {
        const rows = v.segs || {};
        const abn = Object.entries(rows).filter(([, r]) => r && ((r.wave && r.wave !== "triphasic") || (r.plaque && r.plaque !== "none") || (r.sten && r.sten !== "none")));
        if (!abn.length) return ["All the visualised arterial segments show triphasic flow with normal peak systolic velocities.", "No haemodynamically significant stenosis or occlusion is demonstrated."];
        const out = abn.map(([name, r]) => j(name, "shows", r.wave || "flow", r.psv ? `flow with a peak systolic velocity of ${r.psv} cm/s` : "flow", r.plaque && r.plaque !== "none" ? `, with ${r.plaque}` : null, r.sten && r.sten !== "none" ? `, causing ${r.sten === "complete occlusion" ? "complete occlusion" : `${r.sten} luminal narrowing`}` : null) + ".");
        return [...out, "The remaining visualised arterial segments show triphasic flow with normal velocities."];
      },
    },
    {
      id: "abi",
      title: "Indices",
      normal: {},
      fields: [F.num("rAbi", "Right ABI", ""), F.num("lAbi", "Left ABI", ""), F.sel("collat", "Collaterals", YN), F.sel("aneur", "Aneurysm", YN), F.num("aneurSize", "Aneurysm size", "cm"), F.txt("aneurSite", "Aneurysm site")],
      render: (v) => {
        const l = [];
        if (num(v.rAbi) != null || num(v.lAbi) != null) l.push(`Ankle-brachial index is ${v.rAbi || "-"} on the right and ${v.lAbi || "-"} on the left.`);
        if (v.collat === "yes") l.push("Collateral channels are seen bridging the diseased segment.");
        if (v.aneur === "yes") l.push(j("A fusiform aneurysmal dilatation", num(v.aneurSize) != null ? `measuring ${v.aneurSize} cm` : null, v.aneurSite ? `is noted in the ${v.aneurSite}` : "is noted") + ".");
        return l;
      },
    },
  ],
};

/* ---------- Carotid ---------- */
const CAROTID = {
  id: "carotid",
  name: "Carotid and vertebral Doppler",
  group: "Doppler",
  blurb: "Intima-media thickness, plaque characterisation, velocity criteria and vertebral flow direction.",
  sections: [
    {
      id: "imt",
      title: "IMT and plaque",
      normal: { rImt: "0.6", lImt: "0.6", plaque: "none" },
      fields: [
        F.num("rImt", "Right CCA IMT", "mm"), F.num("lImt", "Left CCA IMT", "mm"),
        F.sel("plaque", "Plaque", ["", "none", "calcific plaque", "soft plaque", "mixed plaque", "ulcerated plaque"]),
        F.txt("plaqueSite", "Plaque site"),
        F.num("plaqueTh", "Plaque thickness", "mm"),
        F.sel("sten", "Stenosis grade", ["", "none", "under 50%", "50–69%", "70–99%", "near occlusion", "complete occlusion"]),
      ],
      render: (v) => {
        const l = [j("Carotid intima-media thickness measures", num(v.rImt) != null ? `${v.rImt} mm on the right` : null, num(v.lImt) != null ? `and ${v.lImt} mm on the left` : null) + "."];
        if (v.plaque && v.plaque !== "none") l.push(j(cap(v.plaque), "is noted", v.plaqueSite ? `in the ${v.plaqueSite}` : null, num(v.plaqueTh) != null ? `, measuring ${v.plaqueTh} mm in thickness` : null, v.sten && v.sten !== "none" ? `, causing ${v.sten} luminal narrowing` : null) + ".");
        else l.push("No atherosclerotic plaque is seen in the visualised carotid system.");
        return l;
      },
    },
    {
      id: "vel",
      title: "Velocities and vertebrals",
      normal: {},
      fields: [
        F.num("rCca", "Right CCA PSV", "cm/s"), F.num("rIca", "Right ICA PSV", "cm/s"), F.num("rEca", "Right ECA PSV", "cm/s"),
        F.num("lCca", "Left CCA PSV", "cm/s"), F.num("lIca", "Left ICA PSV", "cm/s"), F.num("lEca", "Left ECA PSV", "cm/s"),
        F.sel("rVert", "Right vertebral flow", ["", "antegrade", "reversed", "to-and-fro", "not visualised"]),
        F.sel("lVert", "Left vertebral flow", ["", "antegrade", "reversed", "to-and-fro", "not visualised"]),
      ],
      render: (v) => {
        const l = [];
        const ratio = (ica, cca) => (num(ica) && num(cca) ? fx(num(ica) / num(cca), 2) : null);
        const rr = ratio(v.rIca, v.rCca), lr = ratio(v.lIca, v.lCca);
        if (num(v.rIca) != null || num(v.lIca) != null)
          l.push(j("Peak systolic velocity in the internal carotid artery is", num(v.rIca) != null ? `${v.rIca} cm/s on the right` : null, num(v.lIca) != null ? `and ${v.lIca} cm/s on the left` : null, rr || lr ? `(ICA/CCA ratio ${rr || "-"} on the right and ${lr || "-"} on the left)` : null) + ".");
        l.push(j("Vertebral arteries show", v.rVert || "antegrade", "flow on the right and", v.lVert || "antegrade", "flow on the left") + ".");
        return l;
      },
    },
  ],
};

/* ---------- Appendix / RIF ---------- */
const RIF = {
  id: "rif",
  name: "Appendix / right iliac fossa",
  group: "Focused",
  blurb: "Graded compression study for suspected appendicitis.",
  sections: [
    {
      id: "app",
      title: "Appendix",
      normal: { vis: "not visualised", tender: "absent" },
      fields: [
        F.sel("vis", "Visualisation", ["", "visualised", "not visualised"]),
        F.num("dia", "Maximum outer diameter", "mm"),
        F.num("wall", "Wall thickness", "mm"),
        F.sel("comp", "Compressibility", ["", "compressible", "non-compressible"]),
        F.sel("fecolith", "Appendicolith", YN),
        F.sel("vasc", "Wall vascularity", ["", "normal", "increased", "absent"]),
        F.sel("fat", "Periappendiceal fat", ["", "normal", "echogenic and inflamed"]),
        F.sel("fluid", "Periappendiceal fluid", YN),
        F.sel("tender", "Probe tenderness over McBurney's point", ["", "absent", "present", "marked"]),
        F.sel("nodes", "Mesenteric nodes", ["", "no", "enlarged mesenteric nodes"]),
        F.sel("coll", "Collection", YN),
        F.num("collVol", "Collection volume", "ml"),
      ],
      render: (v) => {
        const l = [];
        if (v.vis !== "visualised") {
          l.push("The appendix could not be visualised on graded compression sonography.");
        } else {
          l.push(j("The appendix is visualised in the right iliac fossa,", num(v.dia) != null ? `measuring ${v.dia} mm in maximum outer diameter` : null, num(v.wall) != null ? `with a wall thickness of ${v.wall} mm` : null) + ".");
          l.push(j("It is", v.comp || "compressible", v.vasc && v.vasc !== "normal" ? `and shows ${v.vasc} wall vascularity` : null) + ".");
          if (v.fecolith === "yes") l.push("An echogenic shadowing appendicolith is seen within the lumen.");
        }
        if (v.fat === "echogenic and inflamed") l.push("Periappendiceal fat is echogenic and inflamed.");
        if (v.fluid === "yes") l.push("Free fluid is noted in the right iliac fossa.");
        if (v.coll === "yes") l.push(j("A walled-off collection is noted in the right iliac fossa", num(v.collVol) != null ? `, approximate volume ${v.collVol} ml` : null) + ".");
        if (v.nodes && v.nodes !== "no") l.push("Enlarged mesenteric lymph nodes are seen in the right iliac fossa.");
        l.push(v.tender && v.tender !== "absent" ? `Probe tenderness over McBurney's point is ${v.tender}.` : "No probe tenderness is elicited over McBurney's point.");
        return l;
      },
    },
  ],
};

/* ---------- Chest ---------- */
const CHEST = {
  id: "chest",
  name: "Chest and pleura",
  group: "Focused",
  blurb: "Effusion quantification, septations, consolidation and lung sliding.",
  sections: [
    {
      id: "pl",
      title: "Pleural spaces",
      normal: { r: "no", l: "no", slide: "present bilaterally" },
      fields: [
        F.head("Effusion volume — Balik formula: volume (ml) = 20 × maximal pleural separation (mm), measured at the lung base, supine, end-expiration"),
        F.sel("r", "Right pleural effusion", ["", "no", "minimal", "mild", "moderate", "gross"]),
        F.num("rSep", "Right pleural separation", "mm", { derives: ["rVol", (x) => (num(x) == null ? "" : String(Math.round(num(x) * 20)))], hint: "Drives the volume beside it" }),
        F.num("rVol", "Right approximate volume", "ml", { hint: "Auto from separation — editable" }),
        F.sel("l", "Left pleural effusion", ["", "no", "minimal", "mild", "moderate", "gross"]),
        F.num("lSep", "Left pleural separation", "mm", { derives: ["lVol", (x) => (num(x) == null ? "" : String(Math.round(num(x) * 20)))], hint: "Drives the volume beside it" }),
        F.num("lVol", "Left approximate volume", "ml", { hint: "Auto from separation — editable" }),
        F.sel("sept", "Internal character", ["", "anechoic", "with internal echoes", "with fine septations", "with thick septations and loculations"]),
        F.sel("thick", "Pleural thickening", YN),
        F.sel("cons", "Lung parenchyma", ["", "no consolidation", "subpleural consolidation", "consolidation with air bronchograms"]),
        F.sel("blines", "B-lines", ["", "absent", "focal", "diffuse bilateral"]),
        F.sel("slide", "Lung sliding", ["", "present bilaterally", "absent on the right", "absent on the left"]),
      ],
      render: (v) => {
        const l = [];
        const side = (x, vol, sep, name) =>
          x && x !== "no"
            ? j(cap(x), `${name} pleural effusion is noted`,
                num(sep) != null ? `, with a maximal pleural separation of ${sep} mm` : null,
                num(vol) != null ? `, approximate volume ${vol} ml${num(sep) != null ? " (Balik formula)" : ""}` : null) + "."
            : null;
        const a = side(v.r, v.rVol, v.rSep, "right"), b = side(v.l, v.lVol, v.lSep, "left");
        if (a) l.push(a); if (b) l.push(b);
        if (!a && !b) l.push("No pleural effusion is seen on either side.");
        if ((a || b) && v.sept) l.push(`The effusion is ${v.sept}.`);
        if (v.thick === "yes") l.push("Pleural thickening is noted.");
        if (v.cons && v.cons !== "no consolidation") l.push(`${cap(v.cons)} is noted.`);
        if (v.blines && v.blines !== "absent") l.push(`${cap(v.blines)} B-lines are noted.`);
        if (v.slide && v.slide !== "present bilaterally") l.push(`Lung sliding is ${v.slide}.`);
        return l;
      },
    },
  ],
};

/* ---------- MSK ---------- */
const MSK = {
  id: "msk",
  name: "Musculoskeletal",
  group: "Focused",
  blurb: "Joint effusion, tendon and bursa assessment.",
  sections: [
    {
      id: "joint",
      title: "Joint and periarticular",
      normal: { eff: "no", syn: "no" },
      fields: [
        F.txt("region", "Region / joint"),
        F.sel("eff", "Joint effusion", ["", "no", "minimal", "moderate", "gross", "with internal echoes"]),
        F.num("effDepth", "Effusion depth", "mm"),
        F.sel("syn", "Synovium", ["", "no", "synovial thickening", "synovial thickening with increased vascularity"]),
        F.sel("tendon", "Tendon", ["", "normal in echotexture and continuity", "thickened and hypoechoic (tendinosis)", "partial thickness tear", "full thickness tear", "with peritendinous fluid"]),
        F.txt("tendonName", "Tendon name"),
        F.sel("bursa", "Bursa", ["", "normal", "distended with fluid", "distended with synovial thickening"]),
        F.txt("bursaName", "Bursa name"),
        F.sel("erosion", "Cortical erosion", YN),
        F.sel("calcif", "Calcification", YN),
      ],
      render: (v) => {
        const l = [];
        l.push(v.eff && v.eff !== "no" ? j(cap(v.eff), "joint effusion is noted", v.region ? `in the ${v.region}` : null, num(v.effDepth) != null ? `, maximum depth ${v.effDepth} mm` : null) + "." : j("No joint effusion is seen", v.region ? `in the ${v.region}` : null) + ".");
        if (v.syn && v.syn !== "no") l.push(`${cap(v.syn)} is noted.`);
        if (v.tendon) l.push(j("The", v.tendonName || "tendon", "is", v.tendon) + ".");
        if (v.bursa && v.bursa !== "normal") l.push(j("The", v.bursaName || "bursa", "is", v.bursa) + ".");
        if (v.erosion === "yes") l.push("Cortical irregularity and erosion are noted at the articular margin.");
        if (v.calcif === "yes") l.push("Echogenic calcific foci are noted within the soft tissue.");
        return l;
      },
    },
  ],
};

/* ---------- Obstetrics ---------- */
const OB_TYPES = ["Dating and viability", "NT / first trimester", "Anomaly scan", "Growth and wellbeing", "Biophysical profile"];
const isEarly = (s) => ["Dating and viability", "NT / first trimester"].includes((s.type || {}).kind);
const isLate = (s) => ["Anomaly scan", "Growth and wellbeing", "Biophysical profile"].includes((s.type || {}).kind);
const kindIs = (s, ...k) => k.includes((s.type || {}).kind);

const OBS = {
  id: "obs",
  name: "Obstetrics",
  group: "Obstetrics",
  blurb: "Pick the scan type first — the form then shows only the fields that scan needs.",
  sections: [
    {
      id: "type",
      title: "Scan type and dates",
      normal: { kind: "Growth and wellbeing", num: "single", cardiac: "present and regular" },
      fields: [
        F.sel("kind", "Scan type", ["", ...OB_TYPES]),
        F.sel("route", "Route", ["", "transabdominal", "transvaginal", "transabdominal and transvaginal"]),
        F.txt("lmp", "LMP (dd/mm/yyyy)"),
        F.txt("gaLmp", "GA by LMP (e.g. 32w 4d)"),
        F.sel("num", "Number of gestations", ["", "single", "twin", "triplet"]),
        F.sel("chor", "Chorionicity", ["", "dichorionic diamniotic", "monochorionic diamniotic", "monochorionic monoamniotic"], { when: (v) => v.num === "twin" || v.num === "triplet" }),
        F.sel("cardiac", "Cardiac activity", ["", "present and regular", "absent"]),
        F.num("fhr", "Fetal heart rate", "bpm"),
      ],
      render: (v) => {
        if (!v.kind) return [];
        const l = [];
        if (v.cardiac === "absent") l.push(j(cap(v.num || "single"), "intrauterine gestation is seen with no demonstrable fetal cardiac activity") + ".");
        else l.push(j(cap(v.num || "single"), "live intrauterine gestation is seen", v.chor ? `(${v.chor})` : null) + `. Fetal cardiac activity is ${v.cardiac || "present and regular"}${num(v.fhr) != null ? `, at ${v.fhr} bpm` : ""}.`);
        if (v.gaLmp) l.push(`Gestational age by last menstrual period is ${v.gaLmp}.`);
        return l;
      },
    },

    /* ---- EARLY: dating and viability ---- */
    {
      id: "early",
      title: "Gestational sac and early structures",
      when: isEarly,
      normal: { sac: "a single intrauterine gestational sac with a regular outline", yolk: "visualised and normal", sch: "no", cx: "closed, length normal" },
      fields: [
        F.sel("sac", "Gestational sac", ["", "a single intrauterine gestational sac with a regular outline", "a single intrauterine gestational sac with an irregular outline", "an intrauterine gestational sac low in the cavity", "no intrauterine gestational sac", "a pseudo-gestational sac"]),
        F.num("msd", "Mean sac diameter", "mm"),
        F.sel("yolk", "Yolk sac", ["", "visualised and normal", "visualised and enlarged", "not visualised", "calcified"]),
        F.num("yolkSize", "Yolk sac diameter", "mm"),
        F.sel("sch", "Subchorionic haemorrhage", ["", "no", "small subchorionic haemorrhage", "moderate subchorionic haemorrhage", "large subchorionic haemorrhage"]),
        F.num("schVol", "Approximate volume", "ml"),
        F.sel("cx", "Internal os and cervix", ["", "closed, length normal", "funnelling of the internal os", "open internal os"]),
        F.num("cxLen", "Cervical length", "mm"),
        F.sel("cl", "Corpus luteum", ["", "seen in the right ovary", "seen in the left ovary", "not identified"]),
      ],
      render: (v) => {
        const l = [];
        if (v.sac === "no intrauterine gestational sac") l.push("No intrauterine gestational sac is identified.");
        else l.push(j(cap((v.sac || "a single intrauterine gestational sac").replace(/^an? /, "")).replace(/^/, /^an/.test(v.sac || "a") ? "An " : "A "), "is seen", num(v.msd) != null ? `, with a mean sac diameter of ${v.msd} mm` : null) + ".");
        if (v.yolk) l.push(j("Yolk sac is", v.yolk, num(v.yolkSize) != null ? `(${v.yolkSize} mm)` : null) + ".");
        l.push(v.sch && v.sch !== "no" ? j(cap(v.sch), "is noted", num(v.schVol) != null ? `, approximate volume ${v.schVol} ml` : null) + "." : "No subchorionic haemorrhage is seen.");
        l.push(j("Cervix shows", v.cx || "closed, length normal", num(v.cxLen) != null ? `, measuring ${v.cxLen} mm` : null) + ".");
        if (v.cl && v.cl !== "not identified") l.push(`Corpus luteum is ${v.cl}.`);
        return l;
      },
    },
    {
      id: "crl",
      title: "Dating biometry",
      when: isEarly,
      normal: {},
      fields: [
        F.num("crl", "Crown-rump length", "mm"),
        F.txt("gaScan", "GA by scan (e.g. 9w 2d)"),
        F.txt("edd", "EDD by this scan"),
        F.sel("agree", "Correlation with LMP dates", ["", "corresponds with the menstrual dates", "does not correspond with the menstrual dates", "menstrual dates not available"]),
      ],
      render: (v) => {
        const l = [];
        if (num(v.crl) != null) l.push(j(`Crown-rump length measures ${v.crl} mm`, v.gaScan ? `, corresponding to a gestational age of ${v.gaScan}` : null) + ".");
        if (v.agree && v.agree !== "menstrual dates not available") l.push(`This ${v.agree}.`);
        if (v.edd) l.push(`Expected date of delivery by this scan is ${v.edd}.`);
        return l;
      },
    },

    /* ---- NT scan ---- */
    {
      id: "nt",
      title: "First trimester markers",
      when: (s) => kindIs(s, "NT / first trimester"),
      normal: { nb: "visualised", dv: "normal a-wave", tr: "absent" },
      fields: [
        F.num("nt", "Nuchal translucency", "mm"),
        F.sel("nb", "Nasal bone", ["", "visualised", "not visualised", "hypoplastic"]),
        F.sel("dv", "Ductus venosus", ["", "normal a-wave", "absent a-wave", "reversed a-wave"]),
        F.num("dvPi", "Ductus venosus PI", ""),
        F.sel("tr", "Tricuspid regurgitation", ["", "absent", "present"]),
        F.num("utPi", "Mean uterine artery PI", ""),
        F.sel("anat", "Early anatomy", ["", "cranium, abdominal wall, stomach, bladder and four limbs appear normal for gestation", "abnormal — see detail"]),
        F.area("anatDetail", "Detail if abnormal", { when: (v) => v.anat === "abnormal — see detail" }),
      ],
      render: (v) => {
        const l = [];
        if (num(v.nt) != null) l.push(`Nuchal translucency measures ${v.nt} mm.`);
        l.push(j("Nasal bone is", v.nb || "visualised") + ".");
        l.push(j("Ductus venosus shows a", v.dv || "normal a-wave", num(v.dvPi) != null ? `(PI ${v.dvPi})` : null) + `. Tricuspid regurgitation is ${v.tr || "absent"}.`);
        if (num(v.utPi) != null) l.push(`Mean uterine artery pulsatility index is ${v.utPi}.`);
        if (v.anat === "abnormal — see detail") { if (v.anatDetail) l.push(cap(v.anatDetail.trim().replace(/\.?$/, "."))); }
        else if (v.anat) l.push("On early anatomy survey, the cranium, anterior abdominal wall, stomach, urinary bladder and four limbs appear normal for the gestational age.");
        return l;
      },
    },

    /* ---- LATE: biometry ---- */
    {
      id: "biom",
      title: "Fetal biometry",
      when: isLate,
      normal: { percentile: "appropriate for gestational age" },
      fields: [
        F.num("bpd", "BPD", "cm"), F.num("hc", "HC", "cm"), F.num("ac", "AC", "cm"), F.num("fl", "FL", "cm"),
        F.txt("gaScan", "GA by scan (e.g. 32w 1d)"),
        F.txt("edd", "EDD by this scan"),
        F.sel("percentile", "EFW centile", ["", "appropriate for gestational age", "below the 10th centile", "below the 3rd centile", "above the 90th centile"]),
        F.sel("interval", "Interval growth", ["", "not applicable — first growth scan", "appropriate interval growth", "static interval growth"], { when: (v, s) => kindIs(s, "Growth and wellbeing") }),
      ],
      render: (v) => {
        const l = [];
        const b = [num(v.bpd) != null ? `BPD ${v.bpd} cm` : null, num(v.hc) != null ? `HC ${v.hc} cm` : null, num(v.ac) != null ? `AC ${v.ac} cm` : null, num(v.fl) != null ? `FL ${v.fl} cm` : null].filter(Boolean);
        if (b.length) l.push(j("Fetal biometry —", b.join(", "), v.gaScan ? `— corresponds to a gestational age of ${v.gaScan}` : null) + ".");
        const efw = efwHadlock(num(v.bpd), num(v.hc), num(v.ac), num(v.fl));
        if (efw) l.push(j(`Estimated fetal weight is ${efw} g (Hadlock)`, v.percentile ? `, ${v.percentile}` : null) + ".");
        if (v.interval && v.interval !== "not applicable — first growth scan") l.push(`There is ${v.interval} since the previous study.`);
        if (v.edd) l.push(`Expected date of delivery by this scan is ${v.edd}.`);
        return l;
      },
    },

    /* ---- worksheet ---- */
    {
      id: "worksheet",
      title: "Presentation, placenta and liquor",
      when: isLate,
      normal: { pres: "cephalic", spine: "to the maternal left", cord: "not seen around the neck", plac: "anterior", grade: "II", plMorph: "normal", liqMethod: "AFI", liquor: "adequate", cordIns: "central", vessels: "three" },
      fields: [
        F.sel("pres", "Presentation", ["", "cephalic", "breech", "transverse lie", "oblique lie", "variable"]),
        F.sel("spine", "Fetal spine", ["", "to the maternal left", "to the maternal right", "anterior", "posterior"]),
        F.sel("cord", "Cord around the neck", ["", "not seen around the neck", "a single loop around the neck", "two loops around the neck", "three loops around the neck"]),
        F.sel("plac", "Placental position", ["", "anterior", "posterior", "fundo-anterior", "fundo-posterior", "right lateral", "left lateral", "low-lying", "praevia — marginal", "praevia — complete"]),
        F.num("os", "Distance from internal os", "cm"),
        F.sel("grade", "Placental grade", ["", "0", "I", "II", "III"]),
        F.sel("plMorph", "Placental morphology", ["", "normal", "with retroplacental collection", "with hypoechoic lakes", "with loss of retroplacental clear space", "with suspected accreta features"]),
        F.head("Liquor"),
        F.sel("liqMethod", "Method", ["", "AFI", "SDP"]),
        F.num("q1", "Q1", "cm", { when: (v) => v.liqMethod === "AFI" }),
        F.num("q2", "Q2", "cm", { when: (v) => v.liqMethod === "AFI" }),
        F.num("q3", "Q3", "cm", { when: (v) => v.liqMethod === "AFI" }),
        F.num("q4", "Q4", "cm", { when: (v) => v.liqMethod === "AFI" }),
        F.num("sdp", "Single deepest pocket", "cm", { when: (v) => v.liqMethod !== "AFI" }),
        F.sel("liquor", "Interpretation", ["", "adequate", "reduced", "oligohydramnios", "polyhydramnios"]),
        F.sel("cordIns", "Cord insertion", ["", "central", "eccentric", "marginal", "velamentous"]),
        F.sel("vessels", "Cord vessels", ["", "three", "two"]),
      ],
      render: (v) => {
        const l = [];
        l.push(j("Fetus is in", v.pres || "cephalic", "presentation with the spine", v.spine || "to the maternal left") + ".");
        l.push(j("Umbilical cord is", v.cord || "not seen around the neck") + ".");
        l.push(j("Placenta is", v.plac || "anterior", "in position", v.grade ? `, grade ${v.grade} maturity` : null, num(v.os) != null ? `, ${v.os} cm from the internal os` : null, v.plMorph && v.plMorph !== "normal" ? `, ${v.plMorph}` : null) + ".");
        const afi = [num(v.q1), num(v.q2), num(v.q3), num(v.q4)].filter((x) => x != null);
        if (v.liqMethod === "AFI" && afi.length) l.push(j(`Amniotic fluid index is ${fx(afi.reduce((a, b) => a + b, 0), 1)} cm`, v.liquor ? `— liquor volume is ${v.liquor}` : null) + ".");
        else if (num(v.sdp) != null) l.push(j(`Single deepest vertical pocket measures ${v.sdp} cm`, v.liquor ? `— liquor volume is ${v.liquor}` : null) + ".");
        else if (v.liquor) l.push(`Liquor volume is ${v.liquor}.`);
        if (v.cordIns || v.vessels) l.push(j("Cord insertion is", v.cordIns || "central", v.vessels ? `, with ${v.vessels} vessels` : null) + ".");
        return l;
      },
    },

    /* ---- anatomy: anomaly scan only ---- */
    {
      id: "anom",
      title: "Anatomy survey",
      when: (s) => kindIs(s, "Anomaly scan"),
      normal: { skull: "normal", brain: "normal", face: "normal", spine: "normal", heart: "normal", lungs: "normal", diaph: "normal", abdo: "normal", gi: "normal", kidney: "normal", limbs: "normal", stomach: "visualised", bladder: "visualised", sex: "" },
      fields: [
        F.sel("skull", "Skull and calvarium", ["", "normal", "abnormal"]),
        F.sel("brain", "Intracranial structures", ["", "normal", "ventriculomegaly", "abnormal posterior fossa", "midline abnormality", "choroid plexus cyst"]),
        F.num("vent", "Atrial width", "mm"),
        F.num("cm", "Cisterna magna", "mm"),
        F.sel("face", "Face, lips and orbits", ["", "normal", "abnormal"]),
        F.sel("spine", "Spine", ["", "normal", "abnormal"]),
        F.sel("heart", "Four-chamber view and outflow tracts", ["", "normal", "abnormal"]),
        F.sel("lungs", "Lungs", ["", "normal", "abnormal"]),
        F.sel("diaph", "Diaphragm", ["", "normal", "abnormal"]),
        F.sel("abdo", "Anterior abdominal wall and cord insertion", ["", "normal", "abnormal"]),
        F.sel("stomach", "Stomach bubble", ["", "visualised", "not visualised"]),
        F.sel("gi", "Bowel", ["", "normal", "echogenic bowel", "dilated bowel loops"]),
        F.sel("kidney", "Kidneys", ["", "normal", "abnormal"]),
        F.sel("bladder", "Urinary bladder", ["", "visualised", "not visualised"]),
        F.sel("limbs", "Limbs", ["", "normal", "abnormal"]),
        F.sel("marker", "Soft markers", ["", "none", "echogenic intracardiac focus", "mild pyelectasis", "short femur", "single umbilical artery"]),
        F.area("abnormal", "Detail of any abnormal structure"),
      ],
      render: (v) => {
        const keys = [["skull", "skull and calvarium"], ["brain", "intracranial structures"], ["face", "face, lips and orbits"], ["spine", "spine"], ["heart", "cardiac four-chamber and outflow tract views"], ["lungs", "lungs"], ["diaph", "diaphragm"], ["abdo", "anterior abdominal wall and cord insertion"], ["gi", "bowel"], ["kidney", "kidneys"], ["limbs", "limbs"]];
        const abn = keys.filter(([k]) => v[k] && v[k] !== "normal");
        const l = [];
        if (!abn.length) l.push("Fetal anatomy survey is unremarkable — the skull, intracranial structures, face, spine, cardiac four-chamber and outflow tract views, lungs, diaphragm, anterior abdominal wall, bowel, kidneys and limbs appear normal for the gestational age.");
        else {
          abn.forEach(([k, name]) => l.push(`${cap(name)} — ${v[k]}.`));
          const norm = keys.filter(([k]) => !v[k] || v[k] === "normal").map(([, n]) => n);
          if (norm.length) l.push(`The ${listAnd(norm)} appear normal for the gestational age.`);
        }
        if (v.stomach === "not visualised") l.push("Fetal stomach bubble is not visualised.");
        if (v.bladder === "not visualised") l.push("Fetal urinary bladder is not visualised.");
        const m = [num(v.vent) != null ? `atrial width ${v.vent} mm` : null, num(v.cm) != null ? `cisterna magna ${v.cm} mm` : null].filter(Boolean);
        if (m.length) l.push(`Measured: ${m.join(", ")}.`);
        if (v.marker && v.marker !== "none") l.push(`A soft marker is noted — ${v.marker}.`);
        if (v.abnormal) l.push(cap(v.abnormal.trim().replace(/\.?$/, ".")));
        return l;
      },
    },

    /* ---- doppler ---- */
    {
      id: "dopp",
      title: "Doppler study",
      when: (s) => kindIs(s, "Anomaly scan", "Growth and wellbeing", "Biophysical profile"),
      normal: { uaEdf: "present and forward", utNotch: "absent bilaterally" },
      fields: [
        F.num("uaPi", "Umbilical artery PI", ""), F.num("uaRi", "Umbilical artery RI", ""), F.num("uaSd", "Umbilical artery S/D", ""),
        F.sel("uaEdf", "End-diastolic flow", ["", "present and forward", "reduced", "absent", "reversed"]),
        F.num("mcaPi", "MCA PI", ""), F.num("mcaPsv", "MCA PSV", "cm/s"), F.num("cpr", "Cerebroplacental ratio", ""),
        F.sel("utNotch", "Uterine artery diastolic notch", ["", "absent bilaterally", "present unilaterally", "present bilaterally"]),
        F.num("utPi", "Mean uterine artery PI", ""),
        F.sel("dv", "Ductus venosus", ["", "normal a-wave", "absent a-wave", "reversed a-wave"]),
      ],
      render: (v) => {
        const l = [];
        const u = [num(v.uaPi) != null ? `PI ${v.uaPi}` : null, num(v.uaRi) != null ? `RI ${v.uaRi}` : null, num(v.uaSd) != null ? `S/D ${v.uaSd}` : null].filter(Boolean);
        if (u.length || v.uaEdf) l.push(j("Umbilical artery Doppler —", u.join(", ") || null, v.uaEdf ? `with end-diastolic flow ${v.uaEdf}` : null) + ".");
        const m = [num(v.mcaPi) != null ? `PI ${v.mcaPi}` : null, num(v.mcaPsv) != null ? `PSV ${v.mcaPsv} cm/s` : null].filter(Boolean);
        if (m.length) l.push(j("Middle cerebral artery —", m.join(", "), num(v.cpr) != null ? `; cerebroplacental ratio ${v.cpr}` : null) + ".");
        if (v.utNotch || num(v.utPi) != null) l.push(j("Uterine artery diastolic notch is", v.utNotch || "absent bilaterally", num(v.utPi) != null ? `with a mean PI of ${v.utPi}` : null) + ".");
        if (v.dv) l.push(`Ductus venosus shows a ${v.dv}.`);
        return l;
      },
    },

    /* ---- BPP ---- */
    {
      id: "bpp",
      title: "Biophysical profile",
      when: (s) => kindIs(s, "Biophysical profile"),
      normal: { bmove: "2", btone: "2", bbreath: "2", bfluid: "2" },
      fields: [
        F.sel("bmove", "Gross body movements", ["", "2", "0"]),
        F.sel("btone", "Fetal tone", ["", "2", "0"]),
        F.sel("bbreath", "Breathing movements", ["", "2", "0"]),
        F.sel("bfluid", "Amniotic fluid volume", ["", "2", "0"]),
        F.num("obsMin", "Observation period", "min"),
      ],
      render: (v) => {
        const parts = [["bmove", "gross body movements"], ["btone", "fetal tone"], ["bbreath", "breathing movements"], ["bfluid", "amniotic fluid volume"]];
        const scored = parts.filter(([k]) => v[k]);
        if (!scored.length) return [];
        const total = scored.reduce((a, [k]) => a + parseInt(v[k]), 0);
        const failed = scored.filter(([k]) => v[k] === "0").map(([, n]) => n);
        const l = [j(`Biophysical profile score is ${total} out of ${scored.length * 2}`, num(v.obsMin) != null ? `over an observation period of ${v.obsMin} minutes` : null) + "."];
        if (failed.length) l.push(`Points were lost for ${listAnd(failed)}.`);
        return l;
      },
    },

    /* ---- maternal ---- */
    {
      id: "maternal",
      title: "Maternal structures",
      normal: { cx: "closed", adnexa: "no adnexal mass", fibroid: "no", ffluid: "no" },
      fields: [
        F.sel("cx", "Cervix", ["", "closed", "funnelling", "open"]),
        F.num("cxLen", "Cervical length", "mm"),
        F.sel("adnexa", "Adnexa", ["", "no adnexal mass", "right adnexal cyst", "left adnexal cyst", "bilateral adnexal cysts"]),
        F.num("adnexaSize", "Cyst size", "mm"),
        F.sel("fibroid", "Uterine fibroid", ["", "no", "present"]),
        F.num("fibroidSize", "Fibroid size", "mm"),
        F.txt("fibroidSite", "Fibroid site"),
        F.sel("scar", "Previous caesarean scar", ["", "not applicable", "intact, normal thickness", "thinned"]),
        F.num("scarTh", "Scar thickness", "mm"),
        F.sel("ffluid", "Free fluid", ["", "no", "minimal", "moderate"]),
      ],
      render: (v) => {
        const l = [];
        l.push(j("Cervix is", v.cx || "closed", num(v.cxLen) != null ? `and measures ${v.cxLen} mm in length` : null) + ".");
        l.push(v.adnexa && v.adnexa !== "no adnexal mass" ? j("A", v.adnexa, "is noted", num(v.adnexaSize) != null ? `, measuring ${v.adnexaSize} mm` : null) + "." : "No adnexal mass is seen on either side.");
        if (v.fibroid === "present") l.push(j("A uterine fibroid", num(v.fibroidSize) != null ? `measuring ${v.fibroidSize} mm` : null, v.fibroidSite ? `is noted in the ${v.fibroidSite}` : "is noted") + ".");
        if (v.scar && v.scar !== "not applicable") l.push(j("Previous caesarean section scar is", v.scar, num(v.scarTh) != null ? `, measuring ${v.scarTh} mm` : null) + ".");
        if (v.ffluid && v.ffluid !== "no") l.push(`${cap(v.ffluid)} free fluid is noted in the maternal peritoneal cavity.`);
        return l;
      },
    },
  ],
};

const MODALITIES = [ABDOMEN, KUB, PELVIS, OBS, SOFT, THYROID, BREAST, SCROTUM, NSG, VENOUS, ARTERIAL, CAROTID, RIF, CHEST, MSK];


/* Knowledge corner: findings are scanned for recognised entities, each
   becoming a chip that opens Radiopaedia. Nothing is copied here — their
   text is CC BY-NC-SA and belongs on their site, kept current by them. */
const KNOWLEDGE_TERMS = [
  ["fatty change|hepatic steatosis|fatty liver", "Hepatic steatosis"],
  ["cirrhosis|nodular echotexture|Liver surface appears nodular", "Cirrhosis", ["abdomen"]],
  ["hepatomegaly", "Hepatomegaly"],
  ["haemangioma|hemangioma", "Hepatic haemangioma"],
  ["portal vein thrombosis", "Portal vein thrombosis"],
  ["portal hypertension|hepatofugal", "Portal hypertension"],
  ["cholelithiasis|gallbladder.{0,30}calcul|calcul.{0,30}gallbladder", "Cholelithiasis"],
  ["cholecystitis|pericholecystic|Murphy sign is positive", "Acute cholecystitis"],
  ["gallbladder polyp|polypoidal wall lesion", "Gallbladder polyp"],
  ["choledocholithiasis|common bile duct.{0,40}calculus", "Choledocholithiasis"],
  ["biliary radicles are dilated", "Biliary obstruction"],
  ["pancreatitis|peripancreatic|bulky with hypoechoic", "Acute pancreatitis"],
  ["splenomegaly|Spleen is enlarged", "Splenomegaly"],
  ["hydronephrosis", "Hydronephrosis"],
  ["hydroureteronephrosis", "Hydroureteronephrosis"],
  ["renal calcul|nephrolithiasis|calculus is seen in the", "Nephrolithiasis"],
  ["vesicoureteric junction|VUJ calculus", "Vesicoureteric junction calculus"],
  ["raised cortical echogenicity", "Medical renal disease"],
  ["simple cortical cyst", "Simple renal cyst"],
  ["post-void residual", "Post-void residual volume"],
  ["prostate is enlarged|median lobe indents", "Benign prostatic hyperplasia"],
  ["trabeculated", "Bladder wall trabeculation", ["abdomen", "kub"]],
  ["adenomyosis|venetian-blind", "Adenomyosis"],
  ["fibroid|leiomyoma", "Uterine leiomyoma"],
  ["endometrial polyp", "Endometrial polyp"],
  ["peripherally arranged follicles|polycystic", "Polycystic ovary syndrome"],
  ["corpus luteum", "Corpus luteum"],
  ["O-RADS", "O-RADS"],
  ["haemorrhagic cyst|hemorrhagic cyst", "Haemorrhagic ovarian cyst"],
  ["endometrioma", "Endometrioma"],
  ["free fluid.{0,30}pouch of Douglas", "Free pelvic fluid"],
  ["oligohydramnios", "Oligohydramnios"],
  ["polyhydramnios", "Polyhydramnios"],
  ["praevia|previa", "Placenta praevia"],
  ["placental abruption|retroplacental collection", "Placental abruption"],
  ["accreta", "Placenta accreta spectrum"],
  ["nuchal translucency", "Nuchal translucency"],
  ["loops? around the neck", "Nuchal cord"],
  ["breech", "Breech presentation", ["obs"]],
  ["absent a-wave|reversed a-wave", "Ductus venosus Doppler"],
  ["end-diastolic flow (?:reduced|absent|reversed)", "Umbilical artery Doppler"],
  ["cerebroplacental ratio", "Cerebroplacental ratio"],
  ["below the (?:10th|3rd) centile", "Fetal growth restriction"],
  ["biophysical profile", "Biophysical profile"],
  ["subchorionic haemorrhage|subchorionic hemorrhage", "Subchorionic haemorrhage"],
  ["no demonstrable fetal cardiac activity", "Missed miscarriage"],
  ["ventriculomegaly", "Fetal ventriculomegaly"],
  ["echogenic intracardiac focus", "Echogenic intracardiac focus"],
  ["pyelectasis", "Fetal pyelectasis"],
  ["single umbilical artery|two vessels", "Single umbilical artery"],
  ["TI-RADS|TR[1-5]", "ACR TI-RADS"],
  ["thyroid inferno|diffusely heterogeneous and hypoechoic", "Thyroiditis"],
  ["multinodular", "Multinodular goitre"],
  ["loss of fatty hilum", "Pathological lymph node"],
  ["BI-RADS", "BI-RADS"],
  ["fibroadenoma", "Fibroadenoma"],
  ["ductal ectasia", "Mammary duct ectasia"],
  ["not parallel to the skin", "Breast ultrasound: taller-than-wide"],
  ["varicocele", "Varicocele"],
  ["hydrocele", "Hydrocele"],
  ["epididymo-orchitis|bulky and hypoechoic.{0,40}increased vascularity", "Epididymo-orchitis"],
  ["absent on the (?:right|left)|transverse lie on the", "Testicular torsion", ["scrotum"]],
  ["microlithiasis", "Testicular microlithiasis"],
  ["germinal matrix|intraventricular haemorrhage", "Germinal matrix haemorrhage", ["nsg"]],
  ["cystic PVL|periventricular cystic change", "Periventricular leukomalacia", ["nsg"]],
  ["cavum septi pellucidi", "Cavum septi pellucidi"],
  ["deep vein thrombosis|acute hypoechoic thrombus|non-compressible", "Deep vein thrombosis", ["venous"]],
  ["chronic echogenic thrombus|recanalisation", "Chronic deep vein thrombosis", ["venous"]],
  ["saphenous.{0,30}reflux|incompetent perforators", "Venous insufficiency", ["venous"]],
  ["Baker's cyst", "Baker cyst"],
  ["monophasic", "Peripheral arterial Doppler waveforms", ["arterial"]],
  ["complete occlusion", "Peripheral arterial disease", ["arterial"]],
  ["aneurysmal", "Arterial aneurysm", ["arterial", "abdomen"]],
  ["intima-media thickness", "Carotid intima-media thickness"],
  ["ulcerated plaque|calcific plaque|soft plaque", "Carotid atherosclerosis"],
  ["vertebral.{0,40}reversed|subclavian steal", "Subclavian steal syndrome"],
  ["appendicitis|appendicolith", "Acute appendicitis"],
  ["pleural effusion", "Pleural effusion"],
  ["consolidation|air bronchograms", "Lung consolidation", ["chest"]],
  ["B-lines", "Lung ultrasound B-lines"],
  ["pneumothorax|Lung sliding is absent", "Pneumothorax"],
  ["lipoma", "Lipoma"],
  ["haematoma|hematoma", "Haematoma"],
  ["vascular malformation|venous malformation", "Vascular malformation"],
  ["neurofibroma|schwannoma|nerve sheath", "Peripheral nerve sheath tumour"],
  ["sarcoma", "Soft tissue sarcoma"],
  ["pilomatricoma", "Pilomatricoma"],
  ["dermoid", "Dermoid cyst"],
  ["seroma", "Seroma"],
  ["abscess|thick-walled collection with internal debris", "Soft tissue abscess", ["soft", "rif", "msk"]],
  ["sebaceous|epidermoid", "Epidermoid cyst"],
  ["ganglion", "Ganglion cyst"],
  ["cobblestoning|oedematous subcutaneous", "Cellulitis"],
  ["sinus tract", "Sinus tract", ["soft"]],
  ["foreign body is identified", "Soft tissue foreign body", ["soft", "msk"]],
  ["tendinosis", "Tendinosis", ["msk"]],
  ["full thickness tear|partial thickness tear", "Tendon tear"],
  ["bursa.{0,30}distended|bursitis", "Bursitis"],
  ["synovial thickening", "Synovitis"],
  ["joint effusion", "Joint effusion"],
  ["ascites", "Ascites"],
  ["lymphadenopathy|enlarged rounded nodes", "Lymphadenopathy"],
];

const RADIOPAEDIA = (term) =>
  `https://radiopaedia.org/search?q=${encodeURIComponent(term)}&scope=articles`;

const DX_LEAD = /(?:differentials?\s+(?:diagnosis\s+)?(?:includes?|are|is)|possibilities include|consider(?:ations?)?(?: include)?|favou?rs?|suggestive of|suspicious for|likely represents|likely a|consistent with|in keeping with|features of|compatible with|may represent|represents|impression of)\s*:?\s*(?:a |an |the )?([a-z][a-z0-9 ,'()/-]{3,70}?)(?=\s+(?:or|versus|vs\.?|rather than)\s+|[.;]|$)/gi;
const DX_ALT = /\b(?:or|versus|vs\.?|rather than)\s+(?:a |an |the )?([a-z][a-z0-9 '()/-]{3,70}?)(?=\s+(?:or|versus)\s+|[.;,)]|$)/gi;
const DX_NOISE = /^(?:the|this|these|which|further|clinical|correlation|no |any |other|above|below|similar|same)\b/i;

function impressionDiagnoses(text) {
  if (!text) return [];
  const imp = text.split(/\bIMPRESSION\b/i)[1];
  if (!imp) return [];
  const body = imp.split(/\bADVICE\b/i)[0];
  const out = [];
  for (const re of [DX_LEAD, DX_ALT]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body))) {
      const t = m[1].trim().replace(/\s+/g, " ");
      if (t.length > 3 && !DX_NOISE.test(t) && !out.includes(t)) out.push(t);
    }
  }
  return out.slice(0, 6);
}

function knowledgeTopics(text, modId) {
  if (!text) return [];

  /* Diagnoses named in the impression come first and win: if the report
     says "chronic calcified haematoma", that is the useful chip, and the
     bare keyword "Haematoma" it contains is noise. */
  const dx = impressionDiagnoses(text).map((d) => d.charAt(0).toUpperCase() + d.slice(1));

  const keywords = [];
  for (const [pattern, label, mods] of KNOWLEDGE_TERMS) {
    if (mods && modId && !mods.includes(modId)) continue;
    if (new RegExp(pattern, "i").test(text) && !keywords.includes(label)) keywords.push(label);
  }

  const subsumed = (label) =>
    dx.some((d) => {
      const a = d.toLowerCase(), b = label.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });

  return [...dx, ...keywords.filter((k) => !subsumed(k))];
}

/* ============================================================
   AI LAYER — provider agnostic
   ============================================================ */
/* Ships with the bundle and is therefore visible to anyone who opens the app.
   Fine on a local machine; move it behind your own server before deploying. */
const DEFAULT_KEY = "";

const PROVIDERS = {
  glm: { label: "Zhipu GLM", url: "https://open.bigmodel.cn/api/paas/v4/chat/completions", model: "glm-4-plus", shape: "openai" },
  openai: { label: "OpenAI", url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o", shape: "openai" },
  anthropic: { label: "Anthropic", url: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-6", shape: "anthropic" },
  gemini: { label: "Google Gemini", url: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-2.0-flash", shape: "gemini" },
  custom: { label: "Custom / your backend proxy", url: "", model: "", shape: "openai" },
};

/* Strip anything identifier-shaped before it leaves the browser.
   The server scrubs again; this keeps it out of the request entirely. */
function scrubPHI(text) {
  return String(text)
    .replace(/\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g, "[number removed]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[number removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/\b(?:mr|mrs|ms|master|baby of|b\/o|w\/o|s\/o|d\/o)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/gi, "[name removed]")
    .replace(/\b(?:uhid|mrn|ip\s?no|op\s?no|reg\s?no|hosp\s?no)\.?[:\s#-]*[A-Za-z0-9/-]+/gi, "[id removed]");
}

async function callAI(cfg, system, user) {
  user = scrubPHI(user);
  const p = PROVIDERS[cfg.provider] || PROVIDERS.custom;
  const url = cfg.url || p.url;
  const model = cfg.model || p.model;
  let body, headers = { "Content-Type": "application/json" };

  if (p.shape === "anthropic") {
    headers["x-api-key"] = cfg.key;
    headers["anthropic-version"] = "2023-06-01";
    body = { model, max_tokens: 1200, system, messages: [{ role: "user", content: user }] };
  } else if (p.shape === "gemini") {
    body = { contents: [{ parts: [{ text: system + "\n\n" + user }] }] };
  } else {
    if (cfg.key) headers["Authorization"] = `Bearer ${cfg.key}`;
    body = { model, temperature: 0.2, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  }

  const finalUrl = p.shape === "gemini" ? `${url}/${model}:generateContent?key=${cfg.key}` : url;
  const r = await fetch(finalUrl, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const d = await r.json();
  if (d.content) return d.content.map((c) => c.text || "").join("\n");
  if (d.choices) return d.choices[0]?.message?.content || "";
  if (d.candidates) return d.candidates[0]?.content?.parts?.map((x) => x.text).join("\n") || "";
  return JSON.stringify(d);
}

const AI_SYSTEM = `You are assisting a radiologist with ultrasound reporting.
You will receive a FINDINGS block that was assembled from structured operator selections.
Rules you must not break:
1. Never invent, add, or imply any finding that is not in the FINDINGS block.
2. Never change a measurement, laterality, or grade.
3. Output only two sections: IMPRESSION (numbered, most significant first) and, if useful, ADVICE (one or two lines of correlation or next imaging step).
4. Use Indian radiology reporting conventions and British spelling.
5. If the findings are normal, say so plainly in one line. Do not pad.
6. Never state a definitive histological diagnosis on ultrasound alone; use "suggestive of", "likely represents", or "differential includes".`;

/* ============================================================
   UI
   ============================================================ */
const green = {
  ink: "text-emerald-950",
  sub: "text-emerald-700",
};

function Chip({ children, tone = "leaf" }) {
  const tones = {
    leaf: "bg-emerald-100 text-emerald-800 border-emerald-200",
    deep: "bg-emerald-800 text-white border-emerald-800",
    pale: "bg-lime-50 text-emerald-700 border-lime-200",
  };
  return <span className={`inline-block px-2 py-0.5 text-xs border rounded-sm ${tones[tone]}`}>{children}</span>;
}

function Select({ label, value, onChange, opts }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">{label}</span>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-950 shadow-sm hover:border-emerald-400 focus:outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/15 transition-colors"
      >
        {opts.map((o) => (
          <option key={o} value={o}>{o === "" ? "— select —" : o}</option>
        ))}
      </select>
    </label>
  );
}

function NumIn({ label, unit, value, onChange, fid, hint }) {
  const r = fieldRange(fid);
  const v = num(value);
  const out = r && v != null && (v < r[0] || v > r[1]);
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">{label}{unit ? ` (${unit})` : ""}</span>
      <input
        type="number" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
        aria-invalid={out || undefined}
        className={`w-full bg-white border-2 rounded-lg px-3 py-2 text-sm text-emerald-950 shadow-sm focus:outline-none focus:ring-4 transition-colors ${out ? "border-amber-500 bg-amber-50 hover:border-amber-600 focus:border-amber-600 focus:ring-amber-500/20" : "border-emerald-200 hover:border-emerald-400 focus:border-emerald-700 focus:ring-emerald-700/15"}`}
      />
      {out
        ? <span className="block text-[11px] font-medium text-amber-700 mt-1">Check this — expected {r[0]}–{r[1]}{unit ? ` ${unit}` : ""}</span>
        : hint && <span className="block text-[11px] text-emerald-600 mt-1">{hint}</span>}
    </label>
  );
}

function TextIn({ label, value, onChange, placeholder, area }) {
  const C = area ? "textarea" : "input";
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">{label}</span>
      <C
        value={value ?? ""} placeholder={placeholder} rows={area ? 3 : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-950 shadow-sm hover:border-emerald-400 focus:outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/15 transition-colors"
      />
    </label>
  );
}

/* --- lesion editor --- */
function LesionEditor({ cfg, list, onChange }) {
  const arr = list && list.length ? list : [blankLesion()];
  const upd = (i, patch) => onChange(arr.map((L, k) => (k === i ? { ...L, ...patch } : L)));
  const updExtra = (i, key, val) => onChange(arr.map((L, k) => (k === i ? { ...L, extras: { ...L.extras, [key]: val } } : L)));

  return (
    <div className="space-y-3">
      {arr.map((L, i) => (
        <div key={i} className="border border-emerald-300 rounded-sm bg-emerald-50/60">
          <div className="flex items-center justify-between px-3 py-2 bg-emerald-800 text-white">
            <span className="text-sm font-semibold">{cap(cfg.noun || "Lesion")} {i + 1}</span>
            <button onClick={() => onChange(arr.filter((_, k) => k !== i))} className="text-xs underline hover:no-underline">Remove</button>
          </div>
          <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select label="Number" value={L.count} onChange={(x) => upd(i, { count: x })} opts={["single", "multiple"]} />
            {L.count === "multiple" && <NumIn fid="lesion.count" label="How many" value={L.n} onChange={(x) => upd(i, { n: x })} />}
            <Select label="Margin" value={L.margin} onChange={(x) => upd(i, { margin: x })} opts={["", ...MARGIN]} />
            <Select label="Shape" value={L.shape} onChange={(x) => upd(i, { shape: x })} opts={["", ...SHAPE]} />
            <Select label="Echogenicity" value={L.echo} onChange={(x) => upd(i, { echo: x })} opts={["", ...ECHO]} />
            <Select label="Internal contents" value={L.contents} onChange={(x) => upd(i, { contents: x })} opts={["", "internal cystic spaces", "internal debris and low-level echoes", "internal echogenic foci", "an internal solid mural nodule", "internal fluid-fluid level", "no internal contents"]} />
            <Select label="Septations" value={L.septa} onChange={(x) => upd(i, { septa: x })} opts={["", "yes", "thick", "no"]} />
            <Select label="Calcification" value={L.calc} onChange={(x) => upd(i, { calc: x })} opts={["", "internal punctate calcification", "coarse internal calcification", "peripheral rim calcification", "no calcification"]} />
            <Select label="Vascularity" value={L.vasc} onChange={(x) => upd(i, { vasc: x })} opts={["", ...VASC]} />
            <NumIn fid="lesion.dim" label="Dimension 1" unit="cm" value={L.d1} onChange={(x) => upd(i, { d1: x })} />
            <NumIn fid="lesion.dim" label="Dimension 2" unit="cm" value={L.d2} onChange={(x) => upd(i, { d2: x })} />
            <NumIn fid="lesion.dim" label="Dimension 3" unit="cm" value={L.d3} onChange={(x) => upd(i, { d3: x })} />
            {cfg.siteOpts ? (
              <Select label="Site" value={L.site} onChange={(x) => upd(i, { site: x })} opts={["", ...cfg.siteOpts]} />
            ) : (
              <TextIn label="Site" placeholder={cfg.sitePlaceholder || "e.g. anterior aspect of right thigh"} value={L.site} onChange={(x) => upd(i, { site: x })} />
            )}
            {(cfg.extraSel || []).map(([k, lab, opts]) => (
              <Select key={k} label={lab} value={(L.extras || {})[k]} onChange={(x) => updExtra(i, k, x)} opts={opts} />
            ))}
            {L.count === "multiple" && (
              <div className="col-span-2 md:col-span-4">
                <TextIn label="Similar lesions sentence" placeholder="e.g. Similar lesions measuring 1.2 cm and 0.9 cm are noted in the vicinity." value={L.similar} onChange={(x) => upd(i, { similar: x })} />
              </div>
            )}
            <div className="col-span-2 md:col-span-4">
              <TextIn area label="Anything the dropdowns did not cover" placeholder="Type freely — this is appended verbatim to the lesion description." value={L.note} onChange={(x) => upd(i, { note: x })} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...arr, blankLesion()])} className="text-sm font-semibold px-4 py-2 border-2 border-dashed border-emerald-400 text-emerald-800 rounded-lg hover:bg-emerald-100 hover:border-emerald-600 transition-colors">
        Add {cfg.noun || "lesion"}
      </button>
    </div>
  );
}

/* --- doppler segment table --- */
const psvOut = (row, k) => {
  const v = num((row || {})[k]);
  const r = fieldRange("seg.psv");
  return v != null && (v < r[0] || v > r[1]);
};

function SegTable({ cfg, value, onChange, upper }) {
  const list = upper && cfg.listAlt ? cfg.listAlt : cfg.list;
  const rows = value || {};
  const set = (name, key, val) => onChange({ ...rows, [name]: { ...(rows[name] || {}), [key]: val } });
  return (
    <div className="overflow-x-auto border-2 border-emerald-200 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-emerald-800 text-white">
          <tr>
            <th className="text-left px-3 py-2">Segment</th>
            {cfg.cols.map(([k, lab]) => <th key={k} className="text-left px-3 py-2">{lab}</th>)}
            {(cfg.num || []).map((n) => <th key={n} className="text-left px-3 py-2">PSV (cm/s)</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((name, i) => (
            <tr key={name} className={i % 2 ? "bg-emerald-50" : "bg-white"}>
              <td className="px-3 py-1.5 text-emerald-900">{name}</td>
              {cfg.cols.map(([k, , opts]) => (
                <td key={k} className="px-2 py-1">
                  <select value={(rows[name] || {})[k] || ""} onChange={(e) => set(name, k, e.target.value)}
                    className="w-full bg-white border border-emerald-300 rounded-md px-1.5 py-1.5 text-xs focus:outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15">
                    <option value="">—</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </td>
              ))}
              {(cfg.num || []).map((n) => (
                <td key={n} className="px-2 py-1">
                  <input type="number" step="any" value={(rows[name] || {})[n] || ""} onChange={(e) => set(name, n, e.target.value)}
                    title={psvOut(rows[name], n) ? "Check this — expected 0–600 cm/s" : undefined}
                    className={`w-20 bg-white border rounded-md px-1.5 py-1.5 text-xs focus:outline-none focus:ring-2 ${psvOut(rows[name], n) ? "border-amber-500 bg-amber-50 focus:border-amber-600 focus:ring-amber-500/20" : "border-emerald-300 focus:border-emerald-700 focus:ring-emerald-700/15"}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function KnowledgeCorner({ text, custom, setCustom, modId }) {
  const [open, setOpen] = useState(false);
  const topics = useMemo(() => knowledgeTopics(text, modId), [text, modId]);
  const go = (t) => { if (t && t.trim()) window.open(RADIOPAEDIA(t.trim()), "_blank", "noopener"); };

  return (
    <div className="bg-white border-2 border-emerald-200 rounded-xl shadow-sm overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-emerald-100 hover:bg-emerald-200 transition-colors text-left">
        <span className="text-sm font-semibold text-emerald-900">Knowledge corner</span>
        {topics.length > 0 && (
          <span className="text-[11px] font-semibold bg-emerald-700 text-white rounded-full px-2 py-0.5">{topics.length}</span>
        )}
        <span className="ml-auto text-emerald-700 text-xs">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {topics.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">Found in this report</p>
              <div className="flex flex-wrap gap-2">
                {topics.map((t) => (
                  <button key={t} onClick={() => go(t)}
                    className="text-[13px] px-3 py-1.5 rounded-lg border-2 border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-700 hover:text-white hover:border-emerald-700 transition-colors">
                    {t}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[13px] text-emerald-700">Recognised findings will appear here as you fill the form.</p>
          )}

          <div className="pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 mb-1.5">Look up anything else</p>
            <div className="flex gap-2">
              <input value={custom} onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") go(custom); }}
                placeholder="e.g. focal nodular hyperplasia"
                className="flex-1 bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-950 focus:outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/15" />
              <button onClick={() => go(custom)} disabled={!custom || !custom.trim()}
                className="text-sm font-semibold px-4 py-2 bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-30 transition-colors">Open</button>
            </div>
          </div>

          <p className="text-[11px] text-emerald-600 leading-snug pt-1">
            Opens Radiopaedia in a new tab. Reference material by its authors, not part of this report.
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MAIN
   ============================================================ */
export default function App() {
  const [modId, setModId] = useState(null);
  const [state, setState] = useState({});
  const [enabled, setEnabled] = useState({});
  const [extra, setExtra] = useState("");
  const [impression, setImpression] = useState("");
  const [aiOut, setAiOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showCfg, setShowCfg] = useState(false);
  const [copied, setCopied] = useState(false);
  const [kcTerm, setKcTerm] = useState("");
  const [cfg, setCfg] = useState({ provider: "custom", url: "/api/ai", model: "glm-4.6", key: "" });

  const mod = MODALITIES.find((m) => m.id === modId);

  const open = (m) => {
    setModId(m.id);
    setState({});
    setEnabled(Object.fromEntries(m.sections.map((s) => [s.id, true])));
    setExtra(""); setImpression(""); setAiOut(""); setErr(""); setKcTerm("");
  };

  const setVal = useCallback((sec, k, v) => setState((s) => ({ ...s, [sec]: { ...(s[sec] || {}), [k]: v } })), []);

  const visible = useMemo(() => (mod ? mod.sections.filter((s) => !s.when || s.when(state)) : []), [mod, state]);

  const fillNormal = (sec) => setState((s) => ({ ...s, [sec.id]: { ...(sec.normal || {}) } }));

  /* Fill only the blanks in ONE section — whatever the operator already typed stays put. */
  const fillRestNormalSection = (sec) =>
    setState((s) => {
      const cur = s[sec.id] || {};
      const touched = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length)));
      return { ...s, [sec.id]: { ...(sec.normal || {}), ...touched } };
    });
  const fillAllNormal = () =>
    setState((s) => Object.fromEntries(visible.map((sec) => [sec.id, { ...(sec.normal || {}), ...(sec.id === "type" ? s.type || {} : {}) }])));

  /* Fill the normal template only where the operator has left things blank,
     so an already-described pathology and its section stay exactly as typed. */
  const fillRestNormal = () =>
    setState((s) => {
      const next = { ...s };
      visible.forEach((sec) => {
        const cur = s[sec.id] || {};
        const touched = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== "" && v != null && !(Array.isArray(v) && !v.length)));
        const hasPathology = Object.keys(touched).length > 0;
        next[sec.id] = hasPathology ? { ...(sec.normal || {}), ...touched } : { ...(sec.normal || {}) };
      });
      return next;
    });

  const findings = useMemo(() => {
    if (!mod) return "";
    const blocks = visible
      .filter((s) => enabled[s.id] !== false)
      .map((s) => {
        const v = state[s.id] || {};
        let lines = [];
        try { lines = s.render(v) || []; } catch { lines = []; }
        lines = lines.filter(Boolean);
        if (!lines.length) return null;
        return `${s.title.toUpperCase()}\n${lines.join(" ")}`;
      })
      .filter(Boolean);
    return blocks.join("\n\n") + (extra ? `\n\nADDITIONAL OBSERVATIONS\n${extra.trim()}` : "");
  }, [mod, visible, state, enabled, extra]);

  const fullReport = useMemo(() => {
    const imp = (aiOut || impression).trim();
    return findings + (imp ? `\n\n${imp.toUpperCase().startsWith("IMPRESSION") ? "" : "IMPRESSION\n"}${imp}` : "");
  }, [findings, impression, aiOut]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(fullReport); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setErr("Copy failed. Select the text in the report pane and copy manually."); }
  };

  const runAI = async () => {
    setBusy(true); setErr(""); setAiOut("");
    try {
      const out = await callAI(cfg, AI_SYSTEM, `Modality: ${mod.name}\n\nFINDINGS\n${findings}`);
      setAiOut(out.trim());
    } catch (e) {
      setErr(`The impression service is unavailable right now (${e.message}). The report above is complete — write the impression yourself, or try again shortly.`);
    } finally { setBusy(false); }
  };

  const groups = useMemo(() => ({
    "Soft tissue": MODALITIES.filter((m) => m.id === "soft"),
    "All other studies": MODALITIES.filter((m) => m.id !== "soft"),
  }), []);

  /* ---------- home ---------- */
  if (!mod) {
    return (
      <div className="min-h-screen bg-emerald-50/60">
        <header className="bg-emerald-950 text-white">
          <div className="max-w-5xl mx-auto px-6 py-10">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl tracking-tight font-semibold">Reposy-USG</h1>
              <Chip tone="pale">structured ultrasound reporting</Chip>
            </div>
            <p className="mt-3 text-emerald-200 max-w-xl text-sm leading-relaxed">
              Pick what you saw from the dropdowns. The report writes itself in standard reporting language, with the numbers you entered and nothing you did not select.
            </p>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          {Object.entries(groups).map(([g, list]) => (
            <section key={g} className="mb-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-700 mb-3 border-b-2 border-emerald-200 pb-2">{g}</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {list.map((m) => (
                  <button key={m.id} onClick={() => open(m)}
                    className={`group text-left rounded-xl transition-all focus:outline-none focus:ring-4 focus:ring-emerald-700/20 ${m.id === "soft" ? "sm:col-span-2 bg-emerald-800 border-2 border-emerald-800 p-7 shadow-lg hover:bg-emerald-900 hover:shadow-xl" : "bg-white border-2 border-emerald-200 p-5 shadow-sm hover:border-emerald-600 hover:shadow-md hover:-translate-y-0.5"}`}>
                    <div className={m.id === "soft" ? "text-white font-bold text-xl" : "text-emerald-950 font-semibold text-base group-hover:text-emerald-700 transition-colors"}>{m.name}</div>
                    <div className={m.id === "soft" ? "text-[14px] text-emerald-100 mt-2 leading-snug" : "text-[13px] text-emerald-700/90 mt-1.5 leading-snug"}>{m.blurb}</div>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <div className="border-t-2 border-emerald-200 pt-5 mt-2 space-y-3">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-900 mb-1">A drafting aid, not a diagnosis</p>
              <p className="text-[13px] text-amber-900/90 leading-relaxed">
                Reposy-USG assembles report text from what you select and can draft an impression using a language model.
                It does not interpret images and cannot examine a patient. Every finding, measurement and impression must be
                verified by the reporting radiologist before the report is signed or acted upon. Clinical responsibility
                rests entirely with the reporting doctor.
              </p>
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              Findings text only — paste it into your existing reporting system. Enter no patient names or identifiers:
              nothing you type is stored, but the text you enter is sent to a third-party model provider to draft the impression.
            </p>
          </div>
        </main>
      </div>
    );
  }

  /* ---------- form ---------- */
  const isUpper = /upper limb/.test((state.setup || {}).limb || "");

  return (
    <div className="min-h-screen bg-emerald-50/60">
      <header className="bg-emerald-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button onClick={() => setModId(null)} className="text-sm underline decoration-emerald-500 hover:no-underline">All studies</button>
          <span className="text-emerald-600">/</span>
          <h1 className="text-lg">{mod.name}</h1>
        </div>
        {showCfg && (
          <div className="bg-emerald-800 border-t border-emerald-700">
            <div className="max-w-7xl mx-auto px-4 py-4 grid sm:grid-cols-4 gap-3 text-emerald-950">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-200 mb-1.5">Provider</span>
                <select value={cfg.provider} onChange={(e) => setCfg({ ...cfg, provider: e.target.value, url: "", model: "" })}
                  className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600">
                  {Object.entries(PROVIDERS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-200 mb-1.5">Endpoint</span>
                <input value={cfg.url} placeholder={PROVIDERS[cfg.provider].url || "https://your-backend/ai"} onChange={(e) => setCfg({ ...cfg, url: e.target.value })}
                  className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-200 mb-1.5">Model</span>
                <input value={cfg.model} placeholder={PROVIDERS[cfg.provider].model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })}
                  className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-emerald-200 mb-1.5">API key</span>
                <input type="password" value={cfg.key} onChange={(e) => setCfg({ ...cfg, key: e.target.value })}
                  className="w-full bg-white border-2 border-emerald-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-600" />
              </label>
              <p className="sm:col-span-4 text-xs text-emerald-300">
                Keys typed here stay in this browser tab and are lost on refresh. For real deployment, point the endpoint at your own server and keep the key there.
              </p>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_26rem] gap-6 items-start">
        {/* form column */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={fillRestNormal} title="Keep everything you have typed, fill all remaining blanks with normals"
              className="text-sm font-semibold px-4 py-2 bg-emerald-700 text-white rounded-lg shadow-sm hover:bg-emerald-800 transition-colors">Rest all normal</button>
            <button onClick={fillAllNormal} title="Reset the whole study to normal"
              className="text-sm font-semibold px-4 py-2 bg-white text-emerald-800 border-2 border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors">Entire study normal</button>
          </div>
          {visible.map((sec) => {
            const v = state[sec.id] || {};
            const on = enabled[sec.id] !== false;
            return (
              <section key={sec.id} className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b-2 border-emerald-200 bg-gradient-to-r from-emerald-100 to-emerald-50">
                  <input type="checkbox" checked={on} onChange={(e) => setEnabled({ ...enabled, [sec.id]: e.target.checked })}
                    className="accent-emerald-700 w-4 h-4 cursor-pointer" aria-label={`Include ${sec.title}`} />
                  <h3 className="text-emerald-950 font-semibold">{sec.title}</h3>
                  {sec.normal && Object.keys(sec.normal).length > 0 && (
                    <span className="ml-auto flex gap-1.5">
                      <button onClick={() => fillRestNormalSection(sec)} title="Keep what you have typed here, fill the rest with normals"
                        className="text-xs px-2.5 py-1 rounded-md border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-700 hover:text-white transition-colors">Rest normal</button>
                      <button onClick={() => fillNormal(sec)} title="Reset this section entirely to normal"
                        className="text-xs px-2.5 py-1 rounded-md border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-100 transition-colors">All normal</button>
                    </span>
                  )}
                </div>
                {on && (
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {sec.fields.filter((f) => !f.when || f.when(v, state)).map((f, idx) => {
                      if (f.type === "head") return <div key={idx} className="col-span-2 md:col-span-4 text-[11px] font-bold uppercase tracking-widest text-emerald-700 border-b-2 border-emerald-200 pb-1.5 mt-2">{f.label}</div>;
                      if (f.type === "les") return (
                        <div key={f.k} className="col-span-2 md:col-span-4">
                          <LesionEditor cfg={f} list={v[f.k]} onChange={(x) => setVal(sec.id, f.k, x)} />
                        </div>
                      );
                      if (f.type === "seg") return (
                        <div key={f.k} className="col-span-2 md:col-span-4">
                          <SegTable cfg={f} value={v[f.k]} upper={isUpper} onChange={(x) => setVal(sec.id, f.k, x)} />
                        </div>
                      );
                      if (f.type === "area") return (
                        <div key={f.k} className="col-span-2 md:col-span-4">
                          <TextIn area label={f.label} value={v[f.k]} onChange={(x) => setVal(sec.id, f.k, x)} />
                        </div>
                      );
                      if (f.type === "num") return <NumIn key={f.k} fid={`${mod.id}.${sec.id}.${f.k}`} label={f.label} unit={f.unit} hint={f.hint} value={v[f.k]}
                        onChange={(x) => { setVal(sec.id, f.k, x); if (f.derives) setVal(sec.id, f.derives[0], f.derives[1](x)); }} />;
                      if (f.type === "txt") return <div key={f.k} className="col-span-2"><TextIn label={f.label} value={v[f.k]} onChange={(x) => setVal(sec.id, f.k, x)} /></div>;
                      return <Select key={f.k} label={f.label} value={v[f.k]} onChange={(x) => setVal(sec.id, f.k, x)} opts={f.opts} />;
                    })}
                  </div>
                )}
              </section>
            );
          })}

          <section className="bg-white border border-emerald-200 rounded-sm p-4">
            <TextIn area label="Anything else you saw that the form does not cover" placeholder="Typed here verbatim, appended at the end of the findings." value={extra} onChange={setExtra} />
          </section>
        </div>

        {/* report column */}
        <aside className="lg:sticky lg:top-24 space-y-3">
          <div className="bg-white border-2 border-emerald-200 rounded-xl shadow-md overflow-hidden">
            <div className="px-4 py-3 bg-emerald-900 text-white flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-wide">Report</h3>
              <button onClick={copy} className="ml-auto text-xs font-semibold px-3 py-1.5 bg-white text-emerald-900 rounded-lg hover:bg-emerald-100 transition-colors">
                {copied ? "Copied" : "Copy findings"}
              </button>
            </div>
            <pre className="p-4 text-[13px] leading-6 text-emerald-950 whitespace-pre-wrap max-h-[30rem] overflow-y-auto font-sans">{fullReport || "Selections will appear here as you fill the form."}</pre>
          </div>

          <KnowledgeCorner text={fullReport} modId={mod.id} custom={kcTerm} setCustom={setKcTerm} />

          <div className="bg-white border border-emerald-200 rounded-xl shadow-sm p-4 space-y-3">
            <TextIn area label="Impression (write it yourself)" value={impression} onChange={setImpression} placeholder="1. …" />
            <button onClick={runAI} disabled={busy || !findings}
              className="w-full text-sm px-3 py-2 bg-emerald-800 text-white rounded-sm hover:bg-emerald-900 disabled:opacity-40">
              {busy ? "Drafting impression…" : "Draft impression with AI"}
            </button>
            {aiOut && (
              <div className="border-2 border-emerald-200 rounded-lg overflow-hidden">
                <div className="px-3 py-1.5 bg-emerald-100 text-xs text-emerald-800 flex items-center gap-2">
                  AI draft — review before signing
                  <button onClick={() => setAiOut("")} className="ml-auto underline hover:no-underline">Discard</button>
                </div>
                <pre className="p-3 text-xs whitespace-pre-wrap text-emerald-950 font-sans">{aiOut}</pre>
              </div>
            )}
            {err && <p className="text-xs text-red-700 leading-snug">{err}</p>}
          </div>

          <p className="text-xs text-emerald-700 leading-snug">
            Generated from your selections alone — the AI drafts only the impression and cannot add a finding you did not select. Verify everything before signing.
          </p>
        </aside>
      </div>
    </div>
  );
}