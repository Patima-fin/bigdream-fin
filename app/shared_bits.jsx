// BIGDREAM Financial Console — shared helpers
// ---------------------------------------------------------------------------
// เว็บนี้ตัดมาจาก BIO เหลือ 10 หน้า → หน้าที่ถูกตัดออก (page_home / page_cashflow /
// page_debt_ledger / page_interest_calc) เคยเป็นเจ้าของ helper บางตัวที่หน้าที่เหลือ
// ยังเรียกใช้อยู่. ไฟล์นี้ยกเฉพาะ helper เหล่านั้นมาไว้ที่เดียว — โค้ดเหมือนต้นฉบับ
// เป๊ะ ๆ (ยกเว้น hmState → React.useState) เพื่อให้ diff กับ BIO ตามง่ายตอนแก้บั๊กข้ามเว็บ
//
//  จาก page_home.jsx      → hpBankName, hpBankAcNo, HP_BANK_LOGO_DIR, HP_BANKS,
//                            hpBankBrand, HpBankLogo
//  จาก page_cashflow.jsx  → cfPvCatKey, cfVendorCat (+ cache), categorizePayable,
//                            resolvePvCategory, categorizeForecastEntry, buildPaidVchnoSet
//
//  ใช้โดย: page_bank_diary.jsx · page_data_extras.jsx · page_daily_balance.jsx
// ---------------------------------------------------------------------------

// ── defensive field accessors (seed shape ↔ synced UPPER shape) ───────────────
function hpBankName(a)  { return a.BANK_NAME || a.bankName || a.bank || a.Bank || '—'; }
function hpBankAcNo(a)  { return a.Bank_AC || a.accountNo || a.account_no || a.ACCOUNT_NO || ''; }

// ── Thai bank brand map (local logo file + brand color) ───────────────────────
// Logos are full app-icon PNGs in the repo folder "LOGO BANK/" (brand bg + white
// mark baked in). `color` is only used for the initials fallback (unknown bank).
const HP_BANK_LOGO_DIR = 'LOGO BANK/';
const HP_BANKS = {
  scb:   { file: 'ไทยพาณิช.png',     color: '#4e2e7f', match: /scb|ไทยพาณิช/i },
  kbank: { file: 'กสิกร.png',         color: '#138f2d', match: /kbank|kasikorn|กสิกร/i },
  ktb:   { file: 'กรุงไทย.png',        color: '#1ba5e1', match: /ktb|krung\s*thai|กรุงไทย/i },
  bbl:   { file: 'กรุงเทพ.png',        color: '#1e4598', match: /bbl|bangkok|กรุงเทพ/i },
  kkp:   { file: 'เกียรตินาคิน.png',   color: '#199cc5', match: /kkp?|kiatnakin|เกียรตินาคิน/i },
};
function hpBankBrand(name) {
  const s = String(name || '');
  for (const k in HP_BANKS) { if (HP_BANKS[k].match.test(s)) return HP_BANKS[k]; }
  return null;
}

// Bank logo tile — uses the local app-icon PNGs (LOGO BANK/<thai>.png), shown
// filling the rounded tile. Falls back to brand-colored initials when the bank
// has no supplied logo (or the file fails to load).
function HpBankLogo({ name }) {
  const [err, setErr] = React.useState(false);
  const brand = hpBankBrand(name);
  if (brand && brand.file && !err) {
    return (
      <div className="hp-bank-logo">
        <img className="hp-bank-logo-img" src={encodeURI(HP_BANK_LOGO_DIR + brand.file)} alt={name} loading="lazy" onError={() => setErr(true)} />
      </div>
    );
  }
  const bg = (brand && brand.color) || 'var(--ink-400)';
  const initials = String(name || '?').replace(/[^A-Za-z0-9ก-๙]/g, '').slice(0, 4).toUpperCase();
  return <div className="hp-bank-logo hp-bank-logo--fb" style={{ background: bg }}>{initials}</div>;
}

// ── หมวดรายจ่าย 1-4 (ใช้ในหน้า Bank Daily / DATA PV / DATA AP) ────────────────
//   1 = ดำเนินงาน · 2 = โครงการ · 3 = การเงิน/ดอกเบี้ย · 4 = เบ็ดเตล็ด/เงินเดือน
// ── Per-PV manual category override (cf.pvCat.<PL_PV_No> = 1-4) ──────────────
const cfPvCatKey = (pvNo) => 'cf.pvCat.' + String(pvNo || '').trim();
// ── Vendor → หมวด mapping (เจ้าหนี้กลุ่มการเงิน/ลีสซิ่ง → หมวด 3) · แก้รายชื่อใน localStorage ได้
const CF_VENDOR_CAT_LS_KEY = 'bdh-cf-vendor-cat';
const CF_VENDOR_CAT_DEFAULTS = [
  { frag: 'ลีซ อิท', cat: 3 }, { frag: 'ลีสซิ่ง', cat: 3 }, { frag: 'ลิสซิ่ง', cat: 3 },
  { frag: 'แคปปิตอล', cat: 3 }, { frag: 'capital', cat: 3 }, { frag: 'leasing', cat: 3 },
];
let _cfVendorCatCache = null;
function cfLoadVendorCat() {
  if (_cfVendorCatCache) return _cfVendorCatCache;
  try { const v = JSON.parse(localStorage.getItem(CF_VENDOR_CAT_LS_KEY) || 'null'); _cfVendorCatCache = Array.isArray(v) ? v : CF_VENDOR_CAT_DEFAULTS.slice(); }
  catch (_) { _cfVendorCatCache = CF_VENDOR_CAT_DEFAULTS.slice(); }
  return _cfVendorCatCache;
}
function cfSaveVendorCat(list) { _cfVendorCatCache = Array.isArray(list) ? list : []; try { localStorage.setItem(CF_VENDOR_CAT_LS_KEY, JSON.stringify(_cfVendorCatCache)); } catch (_) {} }
function cfVendorCat(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return 0;
  const list = cfLoadVendorCat();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e && e.frag && n.includes(String(e.frag).toLowerCase())) { const c = parseInt(e.cat, 10); if (c >= 1 && c <= 4) return c; }
  }
  return 0;
}
function categorizePayable(ap) {
  // Layer 1: manual override
  const override = parseInt(ap.cf_category || '0', 10);
  if (override >= 1 && override <= 4) return override;
  // Layer 1.5: vendor → หมวด mapping (เจ้าหนี้กลุ่มการเงิน/ลีสซิ่ง เช่น ลีซ อิท → หมวด 3)
  const vc = cfVendorCat(ap.cust_name || ap.vendor);
  if (vc) return vc;
  // Layer 2: finance-cost keyword match (cat 3)
  const text = (
    String(ap.cust_name || '') + ' ' +
    String(ap.remark || '') + ' ' +
    String(ap.docno || '') + ' ' +
    String(ap.refno || '') + ' ' +
    String(ap.vendor_group || '')
  ).toLowerCase();
  if (/ดอกเบี้ย|interest|ค่าธรรมเนียม|bank fee|wht|withhold|หัก ?ณ ?ที่จ่าย|ค่าบริการ ?ธนาคาร/i.test(text)) {
    return 3;
  }
  // Layer 3: project (cat 2)
  if (ap.jobcode || ap.jobname) return 2;
  // Layer 4: default — operating
  return 1;
}
// จัดหมวดรายการจ่ายจริง (PV): override ราย PV > AP ที่ผูก > vendor mapping/keyword บนชื่อผู้รับเงิน
function resolvePvCategory(pv, ap) {
  const pvNo = pv.PL_PV_No || '';
  if (pvNo && typeof WTPOverride !== 'undefined' && WTPOverride.has && WTPOverride.has(cfPvCatKey(pvNo))) {
    const ov = parseInt(WTPOverride.resolve(cfPvCatKey(pvNo), 0), 10);
    if (ov >= 1 && ov <= 4) return ov;
  }
  if (ap) return categorizePayable(ap);
  const vc = cfVendorCat(pv.Payee);
  if (vc) return vc;
  const text = (String(pv.Payee || '') + ' ' + String(pv.cc_remark || pv.Remark || '')).toLowerCase();
  if (/ดอกเบี้ย|interest|ค่าธรรมเนียม|bank fee|wht|leasing|ลีสซิ่ง/i.test(text)) return 3;
  return 1;
}
function categorizeForecastEntry(fe) {
  // Explicit CATEGORY field wins (1-4)
  const cat = parseInt(fe.CATEGORY || fe.category || '0', 10);
  if (cat >= 1 && cat <= 4) return cat;
  // Fallback heuristics on description
  const desc = String(fe.DESCRIPTION || fe.description || '').toLowerCase();
  if (/เงินเดือน|salary|payroll|เบ็ดเตล็ด|misc|petty|รับรอง/i.test(desc)) return 4;
  if (/ดอกเบี้ย|interest|ค่าธรรมเนียม|bank fee/i.test(desc))                return 3;
  return 1;
}
// เอกสารเจ้าหนี้ที่ถูก PV ตัดจ่ายแล้ว (AP_No + บิลย่อยใน settles[]) — pvSettledDocs อยู่ใน components.jsx
function buildPaidVchnoSet(pvVouchers) {
  const set = new Set();
  (pvVouchers || []).forEach(pv => pvSettledDocs(pv).forEach(d => set.add(d)));
  return set;
}
