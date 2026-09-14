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

// ── ภาษีหัก ณ ที่จ่าย (WHT) บนใบแจ้งหนี้ขาย ─────────────────────────────────
// balance ที่เก็บในระบบ = ยอดเต็ม "รวม VAT 7% แล้ว" · ลูกค้าหัก WHT จากยอดก่อน VAT
//   ยอดก่อน VAT  = balance / 1.07
//   WHT          = balance / 1.07 × rate
//   คาดรับสุทธิ  = balance − WHT = balance × (1.07 − rate) / 1.07
// BIO ฝัง rate = 1% ไว้ตายตัว (106/107) เพราะเป็นงานรับเหมา — BIGDREAM เป็นค่าบริการ
// หัก 3% จึงย้ายมาอ่านจาก WTP_CONFIG.WHT_RATE (default 0.01 = พฤติกรรมเดิมของ BIO)
function ivWhtRate() {
  const r = Number((window.WTP_CONFIG || {}).WHT_RATE);
  return (r >= 0 && r < 1) ? r : 0.01;
}
// ตัวคูณแปลง balance → ยอดหลังหัก WHT   (เดิมคือค่าคงที่ 106/107)
function ivNetFactor() { return (1.07 - ivWhtRate()) / 1.07; }
// WHT เป็นบาท จาก balance   (เดิมคือ balance / 107)
function ivWhtOf(balance) { return (Number(balance) || 0) * ivWhtRate() / 1.07; }

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

// ── ผังหมวดรายจ่ายกลาง 8 หมวด (ใช้ทุกหน้า: Bank Daily · DATA PV · DATA AP) ────
// 2026-09-14 เปลี่ยนจาก 4 หมวดเดิม (ดำเนินงาน/โครงการ/การเงิน/เบ็ดเตล็ด) เป็นชุดนี้
// ⚠️ นี่คือ "แหล่งความจริงที่เดียว" — หน้าไหนจะโชว์ตัวเลือกหมวด ให้ map จาก CF_CATS
//    ห้าม hardcode <option> รายหมวดซ้ำอีก ไม่งั้นแต่ละหน้าจะเพี้ยนไปคนละทาง
// ⚠️ ค่าที่เคยบันทึกไว้เป็นเลข 1-4 (payables.cf_category / forecastEntries.CATEGORY /
//    override cf.pvCat.*) จะถูกอ่านตามผังใหม่ = ความหมายเปลี่ยน — ไม่ได้ทำตัวแปลงให้
//    (ของเดิม 3 "การเงิน" ควรเป็น 6 · 4 "เบ็ดเตล็ด/เงินเดือน" ควรเป็น 7 → ไล่เลือกใหม่เอง)
const CF_CATS = [
  { code: 1, name: 'เจ้าหนี้การค้า',              hint: 'ค่าสินค้า/บริการตามใบแจ้งหนี้เจ้าหนี้' },
  { code: 2, name: 'เงินมัดจำ/เงินเบิกล่วงหน้า',  hint: 'เงินมัดจำ เงินประกัน และเงินเบิกล่วงหน้า' },
  { code: 3, name: 'ค่าใช้จ่ายประจำ',             hint: 'ค่าใช้จ่ายที่มีทุกงวด เช่น ค่าเช่า สาธารณูปโภค ภาษี ประกันสังคม' },
  { code: 4, name: 'เงินสำรองจ่าย',               hint: 'เงินที่สำรอง/ทดรองจ่ายไปก่อนแล้วมาเคลียร์' },
  { code: 5, name: 'เงินสดย่อย',                  hint: 'เงินสดย่อยในมือ' },
  { code: 6, name: 'เงินกู้ยืมและดอกเบี้ย',        hint: 'เงินกู้ยืม ลีสซิ่ง และดอกเบี้ย' },
  { code: 7, name: 'เงินเดือนและค่าที่ปรึกษา',     hint: 'เงินเดือน ค่าจ้าง และค่าที่ปรึกษา' },
  { code: 8, name: 'ประมาณการเงินสำรองจ่าย',      hint: 'ประมาณการเงินสำรองจ่ายที่ยังไม่มีเอกสาร' },
];
const CF_CAT_ORDER    = CF_CATS.map(c => c.code);
const CF_CAT_NAME     = CF_CATS.reduce((m, c) => { m[c.code] = c.name; return m; }, {});
const CF_CAT_HINT     = CF_CATS.reduce((m, c) => { m[c.code] = c.hint; return m; }, {});
const CF_CAT_MAX      = CF_CATS.length;
const CF_CAT_FALLBACK = 1;                 // ไม่เข้ากฎไหนเลย = เจ้าหนี้การค้า (เอกสารส่วนใหญ่เป็นแบบนี้)
function cfCatLabel(code) { return CF_CAT_NAME[parseInt(code, 10)] || ''; }
function cfCatValid(code) { const n = parseInt(code, 10); return (n >= 1 && n <= CF_CAT_MAX) ? n : 0; }

// กฎจับหมวดจากข้อความ — เรียงจาก "เฉพาะเจาะจง" ไป "กว้าง" ห้ามสลับลำดับ
// ⚠️ หมวด 8 ต้องมาก่อนหมวด 4 เพราะ "ประมาณการเงินสำรองจ่าย" มีคำว่า "สำรองจ่าย" อยู่ด้วย
// ⚠️ หมวด 3 จับ "กองทุนสำรองเลี้ยงชีพ" ได้ เพราะหมวด 4 บังคับว่าต้องมีคำว่า "สำรองจ่าย" เท่านั้น
const CF_CAT_RULES = [
  { cat: 8, re: /ประมาณการ[^]{0,12}สำรองจ่าย|สำรองจ่าย[^]{0,12}ประมาณการ/ },
  { cat: 5, re: /เงินสดย่อย|petty\s*cash/i },
  { cat: 4, re: /สำรองจ่าย|ทดรองจ่าย|เคลียร์เงินสำรอง|reimburse/i },
  { cat: 2, re: /มัดจำ|เงินประกัน|ค้ำประกัน|ล่วงหน้า|advance|deposit|retention/i },
  { cat: 6, re: /เงินกู้|เงินยืม|ดอกเบี้ย|เงินต้น|ลีสซิ่ง|ลิสซิ่ง|ลีซ ?อิท|เช่าซื้อ|แคปปิตอล|loan|interest|leasing|capital/i },
  { cat: 7, re: /เงินเดือน|ค่าจ้าง|ค่าแรง|โบนัส|ค่าตอบแทน|ที่ปรึกษา|payroll|salary|consult|advisor/i },
  { cat: 3, re: /ค่าเช่า|ค่าน้ำ|ค่าไฟ|ค่าประปา|ค่าโทรศัพท์|อินเทอร์เน็ต|internet|ค่าส่วนกลาง|ค่าธรรมเนียม|ประกันสังคม|สรรพากร|ภ\.? ?ง\.? ?ด|ภ\.? ?พ\.? ?30|กองทุนสำรองเลี้ยงชีพ|ประกันภัย|ค่าบริการรายเดือน|rent|utilit/i },
];
// ข้อความ (ชื่อเจ้าหนี้ + คำอธิบาย + หมายเหตุ) → หมวด · ไม่เข้ากฎไหนเลยคืน 0
// ⚠️ ต้องคืน 0 ไม่ใช่ CF_CAT_FALLBACK — ผู้เรียกจะได้รู้ว่า "ยังไม่ชัด" แล้วลองข้อความชุดอื่นต่อได้
//    (เช่น bdRowCat มีทั้งชื่อเจ้าหนี้และหมายเหตุของ AP ซึ่งดีกว่าคำอธิบายใน forecast อย่างเดียว)
//    ใครต้องการคำตอบสุดท้ายให้ปิดท้ายเองด้วย || CF_CAT_FALLBACK
function cfCatFromText(text) {
  const t = String(text || '');
  for (let i = 0; i < CF_CAT_RULES.length; i++) { if (CF_CAT_RULES[i].re.test(t)) return CF_CAT_RULES[i].cat; }
  return 0;
}

// ── Per-PV manual category override (cf.pvCat.<PL_PV_No> = 1-8) ──────────────
const cfPvCatKey = (pvNo) => 'cf.pvCat.' + String(pvNo || '').trim();
// ── Vendor → หมวด mapping (เจ้าหนี้กลุ่มการเงิน/ลีสซิ่ง → หมวด 3) · แก้รายชื่อใน localStorage ได้
const CF_VENDOR_CAT_LS_KEY = 'bdh-cf-vendor-cat-v2';
const CF_VENDOR_CAT_DEFAULTS = [
  { frag: 'ลีซ อิท', cat: 6 }, { frag: 'ลีสซิ่ง', cat: 6 }, { frag: 'ลิสซิ่ง', cat: 6 },
  { frag: 'แคปปิตอล', cat: 6 }, { frag: 'capital', cat: 6 }, { frag: 'leasing', cat: 6 },
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
    if (e && e.frag && n.includes(String(e.frag).toLowerCase())) { const c = cfCatValid(e.cat); if (c) return c; }
  }
  return 0;
}
// ลำดับตัดสิน: หมวดที่เลือกเอง > ตาราง vendor > กฎคำสำคัญ · ไม่ชัดเลยคืน 0 (ให้ผู้เรียกตัดสิน)
function categorizePayable(ap) {
  const override = cfCatValid(ap.cf_category);
  if (override) return override;
  const vc = cfVendorCat(ap.cust_name || ap.vendor);
  if (vc) return vc;
  return cfCatFromText([ap.cust_name, ap.vendor, ap.remark, ap.docno, ap.refno, ap.vendor_group]
    .filter(Boolean).join(' '));
}
// จัดหมวดรายการจ่ายจริง (PV): override ราย PV > AP ที่ผูก > vendor mapping/กฎคำสำคัญ
function resolvePvCategory(pv, ap) {
  const pvNo = pv.PL_PV_No || '';
  if (pvNo && typeof WTPOverride !== 'undefined' && WTPOverride.has && WTPOverride.has(cfPvCatKey(pvNo))) {
    const ov = cfCatValid(WTPOverride.resolve(cfPvCatKey(pvNo), 0));
    if (ov) return ov;
  }
  if (ap) return categorizePayable(ap);
  const vc = cfVendorCat(pv.Payee);
  if (vc) return vc;
  return cfCatFromText(String(pv.Payee || '') + ' ' + String(pv.cc_remark || pv.Remark || ''));
}
function categorizeForecastEntry(fe) {
  const cat = cfCatValid(fe.CATEGORY || fe.category);
  if (cat) return cat;
  return cfCatFromText(String(fe.DESCRIPTION || fe.description || '') + ' ' +
                       String(fe.NOTE || fe.note || fe.remark || ''));
}
// เอกสารเจ้าหนี้ที่ถูก PV ตัดจ่ายแล้ว (AP_No + บิลย่อยใน settles[]) — pvSettledDocs อยู่ใน components.jsx
function buildPaidVchnoSet(pvVouchers) {
  const set = new Set();
  (pvVouchers || []).forEach(pv => pvSettledDocs(pv).forEach(d => set.add(d)));
  return set;
}
