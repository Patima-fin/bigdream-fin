/* =====================================================================
 * งบกระทบยอดกระแสเงินสด (#cf_coding) — BIGDREAM
 * ---------------------------------------------------------------------
 *  "โต๊ะทำงาน" ที่หยิบ **ใบสำคัญจ่ายทุกใบ** ที่นำเข้าไว้แล้ว มาจับคู่ "หมวด +
 *  ประเภทกิจกรรม" ทีละบรรทัด — ผลลัพธ์ = งบกระแสเงินสดที่ส่งออกเป็น Excel
 *  หรือดันขึ้นหน้า #cashflow_present ได้ตรง ๆ
 *
 *  ★ ต่างจาก BIOAXEL ตรงไหน (อ่านก่อนแก้)
 *    BIO ใช้ EXPRESS → ต้องไล่จับคู่บรรทัดธนาคาร ↔ ใบสำคัญจ่ายด้วย "เลขเช็ค" ซึ่งเขียน
 *    ไม่ตรงกันบ่อย ต้องมีตัวจับคู่แบบผ่อนปรน + เทียบยอดกันพลาด (~700 บรรทัด)
 *    BIGDREAM ใช้ PEAK ซึ่ง GL กับสมุดรายวันใช้ "เลขที่รายวัน" (PV-xxx / RV-xxx) ตัวเดียวกัน
 *    ⇒ join ตรง ๆ ด้วยเลขเอกสาร ไม่ต้องมีตัวจับคู่เลย
 *    ⇒ ใบสำคัญจ่ายก็ยังนำเข้าที่หน้า "ใบสำคัญจ่าย" ที่เดียว (sync ทั้งทีม ไม่เก็บซ้ำ 2 ก้อน)
 *      หน้านี้นำเข้าเฉพาะ GL ซึ่งไม่มีหน้าอื่นรับ
 *
 *  แหล่งข้อมูล 4 ชั้น:
 *    1) data.pvVouchers            = ใบสำคัญจ่ายจาก PEAK (เงินออกจริงจากบัญชี + WHT)
 *    2) cfCoding['gl:<acct>:<ym>'] = บรรทัดเดินบัญชีจาก "รายงานบัญชีแยกประเภท" ของ PEAK
 *                                    ★ แหล่งเดียวที่ให้ "เงินเข้า (RV)" + "ยอดยกมา"
 *                                      เพราะสมุด "จ่าย" ของ PEAK ไม่มีฝั่งรับเลย
 *                                    ★ เอามาเฉพาะบรรทัดที่เลขที่รายวันไม่มีใน PV
 *                                      (PV มี WHT/ยอดก่อนหักที่ GL ไม่มี → PV ชนะ)
 *    3) cfCoding.extra             = "รายการนอก PV" ที่คีย์เอง (เผื่อที่ไม่มีทั้ง PV และ GL)
 *    4) cfCoding.rules             = หมวดที่คนเคยยืนยัน (ระบบเรียนไว้ใช้เดือนถัดไป)
 *
 *  ⚠️ ใบที่ผู้บริหารสำรองจ่ายแทน (Net_Amount = 0 · Type_of_Pmt = "สำรองจ่ายแทน")
 *     **ไม่ใช่กระแสเงินสดของบริษัท** — ตัดออกจากตารางลงรหัสตั้งแต่ต้น แล้วบอกจำนวน
 *     ไว้ที่แถบเตือน ถ้าเอาเข้ามาด้วยยอดในงบจะเกินจริงเท่ากับยอดที่สำรองจ่าย
 *
 *  Self-contained: พึ่งแค่ window.React + window.XLSX + Modal/fmtNum (components.jsx)
 *  · prefix `cfc`/`Cfc` · localStorage `bdh-cfcode-v1`
 *  ข้อมูลส่วนกลาง sync ผ่าน Supabase ตาราง `cfCoding` (∈ SHEET_TABLES)
 *    - id 'master'  = ผังหมวด (แก้ได้ในแอป · seed จาก CFC_MASTER_SEED)
 *    - id 'rules'   = กฎที่เรียนรู้ { "doc:…"|"vendor:…"|"memo:…"|"text:…" : {cat,n,by,at} }
 *    - id 'extra'   = รายการนอก PV ที่คีย์เอง
 *    - id 'manual'  = ยอดเงินสดต้นงวดรายบัญชี (คีย์เอง — PEAK ไม่มียอดคงเหลือมาให้)
 *  ต้องรัน supabase/cf-coding.sql ครั้งเดียวก่อน (ไม่งั้น degrade เป็น local)
 * ===================================================================== */
(function () {
  const { useState, useEffect, useMemo, useRef, Fragment } = React;

  const CFC_TABLE = 'cfCoding';
  const CFC_LS = 'bdh-cfcode-v1';        // ★ prefix bdh- เสมอ (origin เดียวกับ BIO ได้ → คีย์ห้ามชน)
  const CFC_COMPANY = 'บริษัท บิ๊ก ดรีม โฮลดิง จำกัด';

  /* สีชุด BIGDREAM (อ่อนกว่า BIO ~1.5 เฉด — ดู CLAUDE.md)
     ⚠️ btnBg ใช้เฉด 600 ไม่ใช่ 500: ตัวอักษรขาวบน --brand-500 ได้แค่ 3.14:1 อ่านไม่สบาย */
  const C = {
    primary: '#3ea45f', primaryD: '#22703c', btnBg: '#2d8b4d',
    ink: '#20342a', mut: '#688275', faint: '#a4b8ac',
    line: '#e0f0e7', soft: '#f3faf5', card: '#ffffff',
    pos: '#15875a', posBg: '#e6f7ef', neg: '#c0392b', negBg: '#fdecea',
    warn: '#8a6400', warnBg: '#fff7e0', info: '#1f6fb8', infoBg: '#eaf2ff',
    shadow: '0 8px 24px rgba(62,164,95,.10)',
  };

  /* ── ผังหมวด "ตั้งต้น" ──────────────────────────────────────────────────
   *  BIGDREAM ยังไม่เคยทำงบกระแสเงินสด ⇒ ไม่มีไฟล์เดิมให้ถอดผังหมวดออกมา
   *  ชุดนี้จึงเป็น "ผังกลางแบบมาตรฐาน" ให้เริ่มงานได้ทันที ไม่ใช่ผังจริงของบริษัท
   *  → ผู้ใช้แก้/เพิ่ม/ลบได้หมดที่ปุ่ม 🗂 จัดการหมวด (หรือส่งออก-แก้ใน Excel-นำเข้ากลับ)
   *  a = กิจกรรม (op ดำเนินงาน / inv ลงทุน / fin จัดหาเงิน / transfer ไม่นับ)
   *  ลำดับในชุดนี้ = ลำดับแถวของงบที่ส่งออก — ฝั่ง "รับ" ต้องมาก่อน "จ่าย" ในทุกกิจกรรม */
  const CFC_MASTER_SEED = [
    { a: 'op', g: 'รายรับจากการดำเนินงาน', items: [
      'รับชำระจากลูกค้า', 'รายได้ค่าบริการ', 'รายได้ค่าเช่า', 'รายได้อื่น',
      'รับคืนเงินทดรอง/เงินยืมพนักงาน', 'รับคืนภาษี (สรรพากร)',
    ] },
    { a: 'op', g: 'ต้นทุนสินค้าและงานบริการ', items: [
      'ค่าสินค้า/วัตถุดิบ', 'ค่าจ้างผู้รับเหมา/ผู้รับจ้างช่วง', 'ค่าขนส่งและค่าระวาง', 'ค่าบรรจุภัณฑ์',
    ] },
    { a: 'op', g: 'ค่าใช้จ่ายพนักงาน', items: [
      'เงินเดือนและค่าแรง', 'โบนัส/ค่าล่วงเวลา', 'สวัสดิการพนักงาน',
      'ประกันสังคม/กองทุนสำรองเลี้ยงชีพ', 'ค่าอบรมและพัฒนาบุคลากร',
    ] },
    { a: 'op', g: 'ค่าที่ปรึกษาและบริการวิชาชีพ', items: [
      'ค่าทำบัญชี', 'ค่าสอบบัญชี', 'ค่าที่ปรึกษากฎหมาย', 'ค่าที่ปรึกษาทางการเงิน', 'ค่าที่ปรึกษาอื่น',
    ] },
    { a: 'op', g: 'ค่าเช่าและสาธารณูปโภค', items: [
      'ค่าเช่าสำนักงาน', 'ค่าเช่าคลัง/โกดัง', 'ค่าส่วนกลาง/ค่าบริการพื้นที่',
      'ค่าไฟฟ้า', 'ค่าน้ำประปา', 'ค่าโทรศัพท์/อินเทอร์เน็ต',
    ] },
    { a: 'op', g: 'ค่าใช้จ่ายสำนักงาน', items: [
      'ค่าวัสดุสิ้นเปลืองสำนักงาน', 'ค่าซ่อมแซมและบำรุงรักษา', 'ค่าประกันภัย',
      'ค่าโปรแกรม/ระบบสารสนเทศ', 'ค่าไปรษณีย์/ขนส่งเอกสาร', 'ค่าใช้จ่ายเบ็ดเตล็ด',
    ] },
    { a: 'op', g: 'ค่าเดินทางและยานพาหนะ', items: [
      'ค่าน้ำมันเชื้อเพลิง', 'ค่าเดินทางและที่พัก', 'ค่าใช้จ่ายรถยนต์ (ต่อภาษี/ซ่อม)', 'ค่าทางด่วน/ที่จอดรถ',
    ] },
    { a: 'op', g: 'การตลาดและการรับรอง', items: [
      'ค่าโฆษณาและประชาสัมพันธ์', 'ค่ารับรองและของขวัญ', 'ค่าคอมมิชชั่น', 'ค่าจัดงาน/กิจกรรม',
    ] },
    { a: 'op', g: 'ภาษีและค่าธรรมเนียม', items: [
      'ภาษีเงินได้นิติบุคคล', 'ภาษีมูลค่าเพิ่ม (นำส่ง)', 'ภาษีหัก ณ ที่จ่าย (นำส่ง)',
      'ภาษีโรงเรือน/ป้าย/ที่ดิน', 'ค่าธรรมเนียมธนาคาร', 'ค่าธรรมเนียมราชการ',
    ] },
    { a: 'inv', g: 'เงินสดรับจากการลงทุน', items: [
      'รับเงินปันผล', 'ดอกเบี้ยรับ', 'ขายทรัพย์สิน/อุปกรณ์', 'รับคืนเงินประกัน/เงินมัดจำ',
    ] },
    { a: 'inv', g: 'ซื้อทรัพย์สินและเงินลงทุน', items: [
      'ซื้อที่ดินและอาคาร', 'ค่าตกแต่ง/ปรับปรุงอาคาร', 'ซื้อเครื่องจักรและอุปกรณ์',
      'ซื้ออุปกรณ์สำนักงาน/คอมพิวเตอร์', 'ซื้อยานพาหนะ', 'ซื้อโปรแกรม/สินทรัพย์ไม่มีตัวตน',
      'เงินลงทุนในบริษัทย่อย/ร่วม', 'เงินมัดจำและเงินประกัน',
    ] },
    { a: 'fin', g: 'เงินสดรับจากการจัดหาเงิน', items: [
      'รับเงินกู้ - สถาบันการเงิน', 'รับเงินกู้ - กรรมการ', 'รับเงินกู้ - บริษัทในเครือ',
      'รับเงินเพิ่มทุน', 'รับคืนเงินให้กู้ยืม',
    ] },
    { a: 'fin', g: 'ชำระคืนเงินกู้', items: [
      'ชำระคืนเงินกู้ - สถาบันการเงิน', 'ชำระคืนเงินกู้ - กรรมการ', 'ชำระคืนเงินกู้ - บริษัทในเครือ',
      'ชำระค่างวดเช่าซื้อ/ลีสซิ่ง',
    ] },
    { a: 'fin', g: 'ดอกเบี้ยจ่ายและเงินปันผล', items: [
      'ดอกเบี้ยจ่าย - สถาบันการเงิน', 'ดอกเบี้ยจ่าย - กรรมการ', 'ดอกเบี้ยจ่าย - บริษัทในเครือ',
      'จ่ายเงินปันผล',
    ] },
    { a: 'fin', g: 'เงินให้กู้ยืม', items: [
      'เงินให้กู้ยืมแก่กรรมการ', 'เงินให้กู้ยืมแก่บริษัทในเครือ',
    ] },
    // ไม่อยู่ในงบ (ไม่ใช่กิจกรรม) แต่ต้องมีให้เลือก เพราะรายการจริงมี
    { a: 'transfer', g: 'ไม่นับเป็นกิจกรรม', items: ['โอนเงินระหว่างบัญชี'] },
  ];

  const CFC_MONTH_TH = { 1: 'ม.ค.', 2: 'ก.พ.', 3: 'มี.ค.', 4: 'เม.ย.', 5: 'พ.ค.', 6: 'มิ.ย.', 7: 'ก.ค.', 8: 'ส.ค.', 9: 'ก.ย.', 10: 'ต.ค.', 11: 'พ.ย.', 12: 'ธ.ค.' };
  const CFC_ACT_TH = { op: 'กิจกรรมการดำเนินงาน', inv: 'กิจกรรมการลงทุน', fin: 'กิจกรรมการจัดหาเงิน', transfer: '' };
  const CFC_ACT_SHORT = { op: 'ดำเนินงาน', inv: 'ลงทุน', fin: 'จัดหาเงิน', transfer: 'โอน' };
  const CFC_ACT_COLOR = { op: C.primary, inv: '#7a5cd0', fin: '#c98a1e', transfer: C.mut };

  /* ══════════════ helpers ══════════════ */
  const cfcT = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const cfcNum = (v) => { if (typeof v === 'number') return isNaN(v) ? 0 : v; const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '').replace(/[฿\s]/g, '')); return isNaN(n) ? 0 : n; };
  const cfcNorm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[()\[\].,\-\/#'"]/g, '');
  const cfcMoney = (n) => (typeof fmtNum === 'function' ? fmtNum(n, 2) : Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const cfcDigits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
  const cfcPad2 = (n) => ('0' + n).slice(-2);
  const cfcUid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* คีย์ประจำบัญชี — เลขล้วนก่อน
     ⚠️ ต้อง fallback เป็นชื่อ: ถ้าอ่านเลขไม่ออก cfcDigits คืน '' เหมือนกันทุกบัญชี
        → ยุบรวมเป็นบัญชีเดียว ยอดต้นงวดมั่วข้ามบัญชี */
  const cfcAcctKey = (no, label) => cfcDigits(no) || cfcNorm(label) || '(ไม่ระบุบัญชี)';

  /* วันที่: PEAK ผ่าน peak_import มาเป็น ISO อยู่แล้ว · เผื่อ dd/mm/yyyy กับ Date/serial
     ★ ปี > 2400 = พ.ศ. → ลบ 543 (ไฟล์บางฉบับของ PEAK ตั้งปีปฏิทินไทย) */
  function cfcISO(v) {
    if (v == null || v === '') return '';
    if (v && typeof v.getFullYear === 'function' && !isNaN(v.getTime())) {
      return v.getFullYear() + '-' + cfcPad2(v.getMonth() + 1) + '-' + cfcPad2(v.getDate());
    }
    if (typeof v === 'number' && v > 100 && window.XLSX && XLSX.SSF) {
      try { const d = XLSX.SSF.parse_date_code(v); if (d && d.y) return (d.y > 2400 ? d.y - 543 : d.y) + '-' + cfcPad2(d.m) + '-' + cfcPad2(d.d); } catch (e) {}
      return '';
    }
    const s = cfcT(v);
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) { const y = +m[1]; return (y > 2400 ? y - 543 : y) + '-' + cfcPad2(+m[2]) + '-' + cfcPad2(+m[3]); }
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (m) { const y = +m[3]; return (y > 2400 ? y - 543 : y) + '-' + cfcPad2(+m[2]) + '-' + cfcPad2(+m[1]); }
    return '';
  }
  function cfcThaiDate(iso) {
    if (!iso) return '';
    const p = String(iso).split('-'); if (p.length < 3) return iso;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /* ฝั่งเงินของหมวด: 'in' = เงินเข้า · 'out' = เงินออก
     ★ ดูที่ "ชื่อหมวดขึ้นต้น" เป็นหลัก + ชื่อกลุ่มเฉพาะที่ชัดว่าเป็นฝั่งรับ
       ⚠️ ห้ามเอาคำว่า "ขาย" ลอย ๆ มาตัดสิน — "การตลาดและการรับรอง" เป็นฝั่งจ่ายทั้งกลุ่ม
     ค่าที่ผู้ใช้ตั้งเองรายหมวด (field flow) ชนะกติกาเดาเสมอ */
  const CFC_NAME_IN = /^(รายรับ|รายได้|รับ|เงินสดรับ|ดอกเบี้ยรับ|ขาย)/;
  const CFC_GRP_IN = /^(รายรับ|เงินสดรับ|เงินกู้รับเข้า)/;
  function cfcFlowOf(m) {
    if (!m) return 'out';
    if (m.flow === 'in' || m.flow === 'out') return m.flow;
    if (m.act === 'transfer') return 'both';
    return (CFC_NAME_IN.test(cfcT(m.name)) || CFC_GRP_IN.test(cfcT(m.group))) ? 'in' : 'out';
  }
  const CFC_FLOW_META = {
    in: { label: 'รับ', mark: '▲', color: '#15875a', bg: '#e6f7ef' },
    out: { label: 'จ่าย', mark: '▼', color: '#c0392b', bg: '#fdecea' },
    both: { label: 'โอน', mark: '↔', color: '#688275', bg: '#f1f8f4' },
  };

  /* คีย์คู่ค้า — ตัดคำนำหน้า/ท้ายที่ไม่ได้แยกตัวตน (บริษัท…จำกัด (มหาชน)/สำนักงานใหญ่/สาขา…)
     ⚠️ ห้ามตัดวงเล็บอื่นทิ้ง — ชื่อเดียวกันที่มีวงเล็บกำกับมักเป็นคนละเรื่อง (เช่น (ด.บ.) = ดอกเบี้ย)
        รวมกันเมื่อไรหมวดจะสลับกันเงียบ ๆ */
  function cfcVendorKey(name) {
    const s2 = cfcT(name)
      .replace(/^(บริษัท|บจก\.?|บมจ\.?|หจก\.?|หสม\.?|ห้างหุ้นส่วน(จำกัด|สามัญ)?|ร้าน|นาย|นาง|นางสาว|น\.ส\.|คุณ)\s*/, '')
      .replace(/\s*\((มหาชน|สำนักงานใหญ่|สาขา[^)]*)\)\s*$/, '')
      .replace(/\s*จำกัด\s*$/, '');
    return cfcNorm(s2);
  }

  /* ══════════════ เครื่องเสนอหมวด ══════════════
   * ชั้นการตัดสิน (บนสุดชนะ) — ทุกชั้นบอก "ทำไม" กลับไปเสมอ:
   *   1. กฎรายเอกสาร (คนเคยยืนยันใบนี้)                    → ยืนยันแล้ว
   *   2. ข้อความตรงกับที่เคยลงไว้เป๊ะ                        → มั่นใจ
   *   3. คำอธิบายรายการเดิม (≥2 ครั้ง)                       → มั่นใจ
   *   4. ผู้รับเงินคนเดิม (เคยลง ≥2 ครั้ง หมวดเดียว)        → มั่นใจ
   *   5. คำในรายการซ้ำของเดิมชัดเจน                          → มั่นใจ
   *   6. คล้ายของเดิมบ้าง                                     → ขอให้ยืนยัน
   *   7. ไม่เคยเจอ                                            → รายการใหม่
   * ★ เกณฑ์ตั้งไว้ "แน่นเกินไว้ก่อน" ตามที่พิสูจน์มาแล้วกับข้อมูลจริงของ BIO:
   *   ยอมทายน้อยลงแต่ถูก ~94% ดีกว่าทายเยอะแล้วถูก 24% (ผู้ใช้ต้องไล่แก้เอง)
   * ★ เดือนแรกของ BIGDREAM จะยังไม่มีกฎเลย ⇒ ทุกแถวขึ้น "รายการใหม่" เป็นเรื่องปกติ
   *   ใช้ปุ่ม "👥 ลงหมวดตามผู้รับเงิน" ลงทีเดียวทั้งคู่ค้าจะเร็วที่สุด                    */
  const cfcGrams = (s) => { const x = cfcNorm(s); const g = []; for (let i = 0; i < x.length - 2; i++) g.push(x.slice(i, i + 3)); return g; };
  /* ok(cat) = ตัวกรองฝั่งเงิน — คืนหมวดที่คะแนนสูงสุด "ในบรรดาที่ฝั่งเงินตรงกับแถวนี้"
     ★ ไม่มีตัวกรองนี้ = แถวเงินเข้าจะถูกเสนอหมวดฝั่งจ่าย (เจอจริงตอนทดสอบ: รายการ
       "รับชำระค่าสินค้า" ถูกเสนอ "ค่าโปรแกรม/ระบบสารสนเทศ" เพราะคำว่า "ค่า" ซ้ำกัน)
       ผังหมวดติดฝั่งเงินไว้ทุกตัวอยู่แล้ว ⇒ กรองทิ้งได้ฟรี ๆ ไม่ต้องเดา */
  const cfcTop = (o, ok) => {
    if (!o) return null;
    const e = Object.entries(o).sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < e.length; i++) if (!ok || ok(e[i][0])) return e[i];
    return null;
  };

  function cfcBuildEngine(rules, catAct, catFlow) {
    const byDoc = {}, byText = {}, byMemo = {}, byVendor = {}, gram = {}, gramN = {};
    Object.keys(rules || {}).forEach(k => {
      const r = rules[k]; if (!r || !r.cat) return;
      const i = k.indexOf(':'); if (i < 0) return;
      const kind = k.slice(0, i), key = k.slice(i + 1), n = Number(r.n) || 1;
      if (kind === 'doc') byDoc[key] = r;
      else if (kind === 'vendor') { (byVendor[key] = byVendor[key] || {})[r.cat] = ((byVendor[key] || {})[r.cat] || 0) + n; }
      else if (kind === 'memo') { (byMemo[key] = byMemo[key] || {})[r.cat] = ((byMemo[key] || {})[r.cat] || 0) + n; }
      else if (kind === 'text') {
        (byText[key] = byText[key] || {})[r.cat] = ((byText[key] || {})[r.cat] || 0) + n;
        new Set(cfcGrams(key)).forEach(g => { (gram[g] = gram[g] || {})[r.cat] = ((gram[g] || {})[r.cat] || 0) + n; gramN[g] = (gramN[g] || 0) + n; });
      }
    });
    const withAct = (cat, why, tier) => ({ cat, act: catAct[cat] || '', why, tier });
    return function predict(line) {
      // กฎรายเอกสาร = คนยืนยันเองมากับมือ → ใช้ตามนั้นเสมอ ไม่กรองฝั่งเงินทับ
      if (byDoc[line.docKey]) return withAct(byDoc[line.docKey].cat, 'ยืนยันไว้แล้วสำหรับใบนี้', 'locked');
      const dir = line.in > 0 ? 'in' : 'out';
      const ok = (c) => { const f = catFlow && catFlow[c]; return !f || f === 'both' || f === dir; };
      const text = line.matchText || '';
      const et = cfcTop(byText[cfcNorm(text)], ok);
      if (et) return withAct(et[0], 'ข้อความตรงกับที่เคยลงไว้ (' + et[1] + ' ครั้ง)', 'auto');
      // ★ คำอธิบายรายการชนะชื่อคู่ค้า — คู่ค้ารายเดียวจ่ายได้หลายเรื่อง
      const em = cfcTop(byMemo[cfcNorm(line.memo || '')], ok);
      if (em && em[1] >= 2) return withAct(em[0], 'คำอธิบายรายการเดิม (' + em[1] + ' ครั้ง)', 'auto');
      const vk = cfcVendorKey(line.payee);
      const bestV = vk.length > 3 ? cfcTop(byVendor[vk], ok) : null;
      const G = new Set(cfcGrams(text)); const sc = {}; let cover = 0;
      G.forEach(g => {
        const c = gram[g]; if (!c) return;
        const idf = 1 / Math.log(2 + gramN[g]); cover += idf;
        Object.entries(c).forEach(([k, n]) => { sc[k] = (sc[k] || 0) + idf * n / gramN[g]; });
      });
      const b = cfcTop(sc, ok);
      if (bestV) {
        // ★ กฎคู่ค้าเชื่อได้ ยกเว้นเนื้อรายการชี้ไปอีกหมวดอย่างหนักแน่น → ถอยมาถามคน ไม่เดาทับ
        const conflict = b && b[0] !== bestV[0] && b[1] >= 1.2;
        if (bestV[1] >= 2 && !conflict) return withAct(bestV[0], 'ผู้รับเงินรายเดิม เคยลงหมวดนี้ ' + bestV[1] + ' ครั้ง', 'auto');
        if (conflict) return withAct(b[0], 'ผู้รับเงินเคยลง "' + bestV[0] + '" แต่เนื้อรายการชี้ไปอีกหมวด — ขอให้ยืนยัน', 'ask');
        return withAct(bestV[0], 'ผู้รับเงินรายเดิม (เคยลงครั้งเดียว) — ขอให้ยืนยัน', 'ask');
      }
      if (b) {
        // ★ หาร share ด้วยผลรวมของ "หมวดที่ฝั่งเงินตรงกัน" เท่านั้น — เอาหมวดฝั่งตรงข้าม
        //   มาหารด้วยจะกดคะแนนตัวที่ถูกต้องจนตกเกณฑ์ไปเฉย ๆ
        const all = Object.keys(sc).filter(ok).reduce((a, k) => a + sc[k], 0);
        const share = b[1] / (all || 1);
        const cov = cover / (G.size || 1);       // สัดส่วนคำในรายการนี้ที่ "เคยเห็นมาก่อน"
        if (share >= 0.55 && cov >= 0.5 && b[1] >= 0.8) return withAct(b[0], 'คำในรายการซ้ำกับของเดิมชัดเจน', 'auto');
        /* ★ ต้องผ่าน cov ด้วย ห้ามดูแค่ share — ตอนเพิ่งเริ่มใช้ (คลังกฎมีหมวดเดียว) share = 1.00
             เสมอไม่ว่าจะซ้ำกันแค่คำว่า "จำกัด" ⇒ ยืนยันใบเดียว แล้วทุกแถวที่เหลือจะถูกเติมหมวดนั้น
             ให้หมดแบบผิด ๆ (เจอจริงตอนทดสอบ: ยืนยัน 1 ใบ → อีก 3 ใบที่ไม่เกี่ยวกันเลยขึ้นหมวดเดียวกัน)
             ไม่ถึงเกณฑ์ = ไม่เดา ปล่อยเป็น "รายการใหม่" ให้คนเลือกเอง ปลอดภัยกว่าเดาผิดเงียบ ๆ */
        if (share >= 0.35 && cov >= 0.3 && b[1] >= 0.35) return withAct(b[0], 'คล้ายรายการเดิม — ขอให้ยืนยัน', 'ask');
        return withAct('', 'ยังไม่เคยลงหมวดให้ผู้รับเงิน/รายการแบบนี้', 'new');
      }
      return withAct('', 'ยังไม่เคยลงหมวดให้ผู้รับเงิน/รายการแบบนี้', 'new');
    };
  }

  /* ══════════════ ผังหมวด ══════════════ */
  /* แทรกหมวดลงผังให้อยู่ "ถูกบล็อก" — ลำดับใน master = ลำดับแถวของงบที่ส่งออก
     1) กลุ่มเดิม → ต่อท้ายกลุ่มนั้น
     2) กลุ่มใหม่แต่มีของฝั่งเงินเดียวกันอยู่แล้ว → ต่อท้ายบล็อกฝั่งนั้น
     3) ยังไม่มีของฝั่งนี้ในกิจกรรมเลย → ★ ฝั่ง "รับ" ต้องขึ้นก่อนฝั่ง "จ่าย" เสมอ
   ★ ตัวเดียวที่ทุกทาง (เพิ่มเอง · แก้ไข · นำเข้าผัง) ต้องเรียก — อย่าก็อปสูตร */
  function cfcInsertCat(list, row) {
    let at = -1;
    list.forEach((m, i) => { if (m.act === row.act && m.group === row.group) at = i; });
    if (at < 0) list.forEach((m, i) => { if (m.act === row.act && cfcFlowOf(m) === cfcFlowOf(row)) at = i; });
    if (at >= 0) { list.splice(at + 1, 0, row); return list; }
    const first = list.findIndex(m => m.act === row.act);
    let last = -1; list.forEach((m, i) => { if (m.act === row.act) last = i; });
    if (first < 0) list.push(row);
    else list.splice(cfcFlowOf(row) === 'in' ? first : last + 1, 0, row);
    return list;
  }

  /* นับว่าแต่ละหมวดถูกใช้ในกฎที่เรียนไว้กี่ข้อ — ใช้เตือนก่อนลบ/ก่อนทับผัง */
  function cfcRuleCatCount(rules) {
    const o = {};
    Object.keys(rules || {}).forEach(k => { const c = rules[k] && rules[k].cat; if (c) o[c] = (o[c] || 0) + 1; });
    return o;
  }

  /* "โอนเงินระหว่างบัญชี" ต้องมีให้เลือกเสมอ แม้ผังที่นำเข้ามาจะไม่มี */
  function cfcWithExtraCats(list) {
    const out = (list || []).slice();
    const have = {}; out.forEach(m => { have[m.name] = 1; });
    CFC_MASTER_SEED.filter(g => g.a === 'transfer').forEach(g => g.items.forEach(n => {
      if (!have[n]) out.push({ name: n, act: g.a, group: g.g });
    }));
    return out;
  }
  const cfcSeedMaster = () => { const out = []; CFC_MASTER_SEED.forEach(g => g.items.forEach(n => out.push({ name: n, act: g.a, group: g.g }))); return out; };

  /* ── ผังหมวด ⇄ Excel (4 คอลัมน์) — "ไม่มีหมวดมาก่อนเลย" จึงต้องแก้เป็นชุดใน Excel ได้ ── */
  const CFC_CHART_HEAD = ['กิจกรรม', 'ฝั่งเงิน', 'กลุ่มในงบ', 'ชื่อหมวด'];
  const CFC_ACT_FROM_TH = { 'ดำเนินงาน': 'op', 'ลงทุน': 'inv', 'จัดหาเงิน': 'fin', 'จัดหาทุน': 'fin', 'ไม่นับเป็นกิจกรรม': 'transfer', 'โอน': 'transfer' };
  function cfcChartAoa(master) {
    const aoa = [CFC_CHART_HEAD.slice()];
    master.forEach(m => aoa.push([CFC_ACT_SHORT[m.act] || m.act, CFC_FLOW_META[cfcFlowOf(m)].label, m.group || '', m.name]));
    return aoa;
  }
  /* คืน { items, error } — อ่านหัวตารางตามชื่อ ไม่ยึดตำแหน่ง (ผู้ใช้แทรกคอลัมน์เองได้) */
  function cfcParseChartAoa(aoa) {
    let hr = -1, H = null;
    for (let i = 0; i < (aoa || []).length && i < 30; i++) {
      const row = (aoa[i] || []).map(c => cfcT(c));
      if (row.some(c => /^ชื่อหมวด$|^หมวด$/.test(c)) && row.some(c => /^กิจกรรม$/.test(c))) { hr = i; H = row; break; }
    }
    if (hr < 0) return { items: [], error: 'ไม่พบหัวตาราง — ต้องมีคอลัมน์ "กิจกรรม" และ "ชื่อหมวด" (ส่งออกผังหมวดออกมาดูรูปแบบได้)' };
    const at = re => H.findIndex(c => re.test(c));
    const cAct = at(/^กิจกรรม$/), cFlow = at(/^ฝั่งเงิน$/), cGrp = at(/^กลุ่ม/), cName = at(/^ชื่อหมวด$|^หมวด$/);
    const items = []; const seen = {};
    for (let i = hr + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const name = cfcT(cName >= 0 ? r[cName] : ''); if (!name) continue;
      if (seen[cfcNorm(name)]) continue; seen[cfcNorm(name)] = 1;
      const actTh = cfcT(cAct >= 0 ? r[cAct] : '');
      const act = CFC_ACT_FROM_TH[actTh] || (/^(op|inv|fin|transfer)$/.test(actTh) ? actTh : 'op');
      const flowTh = cfcT(cFlow >= 0 ? r[cFlow] : '');
      const flow = /รับ/.test(flowTh) ? 'in' : (/จ่าย/.test(flowTh) ? 'out' : undefined);
      const row = { name, act, group: cfcT(cGrp >= 0 ? r[cGrp] : '') || 'อื่น ๆ' };
      if (flow && act !== 'transfer') row.flow = flow;
      items.push(row);
    }
    if (!items.length) return { items: [], error: 'อ่านหัวตารางได้ แต่ไม่พบแถวที่มี "ชื่อหมวด"' };
    return { items: items, error: '' };
  }

  /* ══════════════ storage (Supabase blob + localStorage cache) ══════════════ */
  function cfcCanSync() {
    return !!(window.WTPData && WTPData.fetchSheetRows && WTPData.writeTable
      && window.WTP_CONFIG && WTP_CONFIG.BACKEND === 'supabase');
  }
  function cfcLoadLocal() { try { return JSON.parse(localStorage.getItem(CFC_LS) || 'null') || {}; } catch (e) { return {}; } }
  /* ⚠️ cache นี้เคย `catch (e) {}` เงียบ ๆ — พอข้อมูลโตเกินโควตา localStorage การเซฟจะล้มทุกครั้ง
     แบบไม่มีใครรู้ แล้ว "เปิดหน้าทีต้องรอโหลดจาก server ใหม่ทุกที" (อาการ: หน้านี้โหลดช้ามาก)
     ตอนนี้ถ้าไม่พอ จะตัดข้อมูลก้อนใหญ่ของเดือนเก่าสุดออกทีละชุดแล้วลองใหม่ */
  const cfcYmOfId = (id) => (String(id).match(/(\d{4}-\d{2})\s*$/) || ['', ''])[1];
  function cfcSaveLocal(o) {
    const keys = Object.keys(o);
    const heavy = keys.filter(k => /^(lines|ps|rows|txn):/.test(k) || cfcYmOfId(k))
      .sort((a, b) => (cfcYmOfId(a) < cfcYmOfId(b) ? -1 : cfcYmOfId(a) > cfcYmOfId(b) ? 1 : 0));
    const rank = {}; heavy.forEach((k, i) => { rank[k] = i; });
    let drop = 0;
    for (;;) {
      const keep = {};
      keys.forEach(k => { if (rank[k] == null || rank[k] >= drop) keep[k] = o[k]; });
      try { localStorage.setItem(CFC_LS, JSON.stringify(keep)); return; } catch (e) {
        if (drop >= heavy.length) {
          try { localStorage.removeItem(CFC_LS); } catch (_) {}
          console.warn('[cfc] ข้อมูลใหญ่เกิน localStorage — เก็บ cache ไม่ได้เลย หน้านี้จะต้องโหลดจาก server ทุกครั้ง');
          return;
        }
        drop += Math.max(1, Math.ceil(heavy.length / 4));
      }
    }
  }

  /* ══════════════ UI atoms ══════════════ */
  function CfcChip({ tone, children, title }) {
    const T = { ok: [C.posBg, C.pos], warn: [C.warnBg, C.warn], bad: [C.negBg, C.neg], info: [C.infoBg, C.info], mute: [C.soft, C.mut] }[tone || 'mute'];
    return <span title={title} style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: T[0], color: T[1], whiteSpace: 'nowrap' }}>{children}</span>;
  }

  /* ช่องกรอกจำนวนเงิน — แสดงคั่นหลักพันเหมือนตัวเลขอื่นในตาราง
     ⚠️ ใช้ <input type="number"> ไม่ได้ เบราว์เซอร์ไม่ยอมให้ค่ามีคอมมา
        จึงเป็น type=text + inputMode=decimal: โฟกัส = แก้เป็นเลขดิบ, ออกจากช่อง = จัดรูปให้ */
  function CfcMoneyInput({ value, placeholder, title, width, bad, onSave }) {
    const [txt, setTxt] = useState(value == null || value === '' ? '' : cfcMoney(value));
    const [hot, setHot] = useState(false);
    useEffect(() => { if (!hot) setTxt(value == null || value === '' ? '' : cfcMoney(value)); }, [value, hot]);
    return (
      <input type="text" inputMode="decimal" value={txt} placeholder={placeholder} title={title}
        onFocus={e => { setHot(true); setTxt(value == null || value === '' ? '' : String(value)); setTimeout(() => e.target.select(), 0); }}
        onChange={e => setTxt(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        onBlur={e => {
          setHot(false);
          const raw = String(e.target.value).trim();
          if (raw === '') { setTxt(''); onSave(null); return; }
          const n = cfcNum(raw); setTxt(cfcMoney(n)); onSave(n);
        }}
        style={{ width: width || 120, fontSize: 12, padding: '3px 7px', borderRadius: 8, textAlign: 'right',
          fontVariantNumeric: 'tabular-nums', color: C.ink,
          border: '1px solid ' + (bad ? C.neg : C.line), background: bad ? C.negBg : '#fff' }} />
    );
  }

  const CFC_TIER = {
    locked: { label: '✅ ยืนยันแล้ว', tone: 'ok' },
    auto: { label: '🤖 มั่นใจ', tone: 'info' },
    ask: { label: '❓ ขอให้ยืนยัน', tone: 'warn' },
    new: { label: '🆕 รายการใหม่', tone: 'bad' },
  };

  /* ★ เรียง "รับ" ขึ้นก่อน "จ่าย" ในแต่ละกิจกรรม + ป้าย ▲รับ/▼จ่าย นำหน้าชื่อกลุ่ม
       เลือกหมวดได้เร็วขึ้นมาก เพราะฝั่งเงินคือสิ่งแรกที่คนดูอยู่แล้ว */
  function cfcGroupMaster(master) {
    const by = {};
    master.forEach(m => { const k = m.act + '|' + cfcFlowOf(m) + '|' + m.group; (by[k] = by[k] || []).push(m); });
    const rank = { op: 0, inv: 1, fin: 2, transfer: 3 };
    return Object.entries(by).sort((a, b) => {
      const [aa, af] = a[0].split('|'), [ba, bf] = b[0].split('|');
      // ⚠️ rank.op = 0 → (rank[aa] || 9) กลายเป็น 9 ทำให้ "ดำเนินงาน" ตกไปท้ายสุด — ต้องเทียบ null
      const ra = rank[aa] == null ? 9 : rank[aa], rb = rank[ba] == null ? 9 : rank[ba];
      if (aa !== ba) return ra - rb;
      if (af !== bf) return af === 'in' ? -1 : 1;
      return 0;
    });
  }

  function CfcCatSelect({ value, master, onChange, disabled, width }) {
    const groups = useMemo(() => cfcGroupMaster(master), [master]);
    const cur = master.find(m => m.name === value);
    const fm = value ? CFC_FLOW_META[cfcFlowOf(cur || { name: value })] : null;
    /* ⚠️ ตารางแสดงได้หลายร้อยแถว × หมวด ~100 ตัว = <option> เป็นแสนโหนด — หน้าอืดตั้งแต่โหลด
       และอืดซ้ำทุกครั้งที่พิมพ์ค้นหา. จึงกางรายการหมวด "ตอนจะกดเลือกเท่านั้น"
       ★ ต้อง flushSync เพราะเบราว์เซอร์เปิด dropdown ทันทีหลังจบ mousedown — ถ้าปล่อยให้
         React อัปเดตทีหลัง ครั้งแรกจะเห็นแค่ตัวเลือกเดียว */
    const [ready, setReady] = useState(false);
    const wake = () => {
      if (ready) return;
      try { ReactDOM.flushSync(() => setReady(true)); } catch (e) { setReady(true); }
    };
    return (
      <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value)}
        onMouseDown={wake} onFocus={wake} onKeyDown={wake} onTouchStart={wake}
        style={{ width: width || 232, maxWidth: '100%', fontSize: 12, padding: '4px 6px', borderRadius: 8,
          border: '1px solid ' + (value ? (fm ? fm.color + '55' : C.line) : '#f0c9c9'),
          background: value ? (fm ? fm.bg : '#fff') : '#fff8f8',
          color: fm ? fm.color : C.ink, fontWeight: value ? 600 : 400 }}>
        <option value="">— ยังไม่ลงหมวด —</option>
        {/* ต้องมี option ของค่าปัจจุบันเสมอ ไม่งั้น <select> เด้งกลับเป็นค่าว่าง
            — ทั้งตอนยังไม่กาง และตอนค่านั้นเป็น "หมวดผี" ที่ไม่มีในผังแล้ว */}
        {value && (!ready || !cur) && <option value={value}>{value}</option>}
        {ready && groups.map(([k, items]) => {
          const [a, f, g] = k.split('|');
          const meta = CFC_FLOW_META[f] || CFC_FLOW_META.out;
          return (
            <optgroup key={k} label={meta.mark + ' ' + meta.label + ' · ' + (CFC_ACT_SHORT[a] || '') + ' · ' + g}>
              {items.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
            </optgroup>
          );
        })}
      </select>
    );
  }

  /* ── ฟอร์มหมวด (ใช้ร่วมกันทั้ง "เพิ่มใหม่" และ "แก้ไข") ──
     ★ กลุ่มในงบกรองด้วย กิจกรรม + ฝั่งเงิน (ผังจริงไม่มีกลุ่มไหนปนทั้งรับและจ่าย) */
  function CfcCatForm({ master, initial, submitLabel, onCancel, onSubmit }) {
    const [name, setName] = useState(initial ? initial.name : '');
    const [act, setAct] = useState(initial ? initial.act : 'op');
    const [flow, setFlow] = useState(initial ? cfcFlowOf(initial) : 'out');
    const [group, setGroup] = useState(initial ? initial.group : '');
    const [newGroup, setNewGroup] = useState('');
    const groups = useMemo(() => [...new Set(master.filter(m => m.act === act && cfcFlowOf(m) === flow).map(m => m.group))].filter(Boolean),
      [master, act, flow]);
    /* ⚠️ ต้องข้ามรอบแรก ไม่งั้นตอนเปิดฟอร์ม "แก้ไข" กลุ่มเดิมจะถูกรีเซ็ตทิ้งทันที */
    const first = useRef(true);
    useEffect(() => {
      if (first.current) { first.current = false; return; }
      setGroup(groups[0] || '__new'); setNewGroup('');
    }, [act, flow]);   // eslint-disable-line
    useEffect(() => { if (!initial && !group) setGroup(groups[0] || '__new'); }, []);   // eslint-disable-line

    const gFinal = group === '__new' ? cfcT(newGroup) : group;
    const fmSel = CFC_FLOW_META[flow] || CFC_FLOW_META.out;
    const dup = master.some(m => cfcNorm(m.name) === cfcNorm(name) && (!initial || m.name !== initial.name));
    const ok = cfcT(name) && gFinal && !dup;
    const lbl = { fontSize: 12, fontWeight: 700, color: C.mut, display: 'block', marginBottom: 4 };
    const inp = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 9, border: '1px solid ' + C.line };
    const send = () => ok && onSubmit({ name: cfcT(name), act, group: gFinal, flow });
    return (
      <div style={{ display: 'grid', gap: 13, padding: '4px 2px' }}>
        <div>
          <label style={lbl}>ชื่อหมวด</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} style={inp}
            placeholder="เช่น ค่าบริการคลาวด์" onKeyDown={e => { if (e.key === 'Enter') send(); }} />
          {dup && <div style={{ fontSize: 11.5, color: C.neg, marginTop: 4 }}>มีหมวดชื่อนี้อยู่แล้ว</div>}
        </div>
        <div>
          <label style={lbl}>เป็นเงินเข้าหรือเงินออก</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['in', 'out'].map(f => {
              const meta = CFC_FLOW_META[f];
              return (
                <button key={f} onClick={() => setFlow(f)} style={{
                  flex: 1, cursor: 'pointer', borderRadius: 10, padding: '8px 6px', fontSize: 13, fontWeight: 700,
                  border: '1px solid ' + (flow === f ? meta.color : C.line),
                  background: flow === f ? meta.color : '#fff', color: flow === f ? '#fff' : meta.color,
                }}>{meta.mark} {meta.label}</button>
              );
            })}
          </div>
        </div>
        <div>
          <label style={lbl}>อยู่ในกิจกรรมไหน</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['op', 'ดำเนินงาน'], ['inv', 'ลงทุน'], ['fin', 'จัดหาเงิน']].map(([k, t]) => (
              <button key={k} onClick={() => setAct(k)} style={{
                flex: 1, cursor: 'pointer', borderRadius: 10, padding: '8px 6px', fontSize: 13, fontWeight: 700,
                border: '1px solid ' + (act === k ? CFC_ACT_COLOR[k] : C.line),
                background: act === k ? CFC_ACT_COLOR[k] : '#fff', color: act === k ? '#fff' : C.ink,
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={lbl}>
            กลุ่มในงบ (หมวดจะไปต่อท้ายกลุ่มนี้)
            <span style={{ fontWeight: 600, color: fmSel.color, marginLeft: 6 }}>
              — เฉพาะ {fmSel.mark} {fmSel.label} · {CFC_ACT_SHORT[act] || ''}
            </span>
          </label>
          <select value={group} onChange={e => setGroup(e.target.value)}
            style={Object.assign({}, inp, { borderColor: fmSel.color + '55', background: fmSel.bg, color: fmSel.color, fontWeight: 600 })}>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
            <option value="__new">＋ สร้างกลุ่มใหม่…</option>
          </select>
          {!groups.length && <div style={{ fontSize: 11.5, color: C.warn, marginTop: 4 }}>
            ยังไม่มีกลุ่มฝั่ง “{fmSel.label}” ในกิจกรรม{CFC_ACT_SHORT[act] || ''} — ตั้งชื่อกลุ่มใหม่ได้เลย
          </div>}
          {group === '__new' && <input value={newGroup} onChange={e => setNewGroup(e.target.value)}
            placeholder="ชื่อกลุ่มใหม่ เช่น ค่าใช้จ่ายเทคโนโลยี" style={Object.assign({}, inp, { marginTop: 7 })} />}
        </div>
        <div style={{ fontSize: 11.5, color: C.mut, background: C.soft, borderRadius: 9, padding: '9px 12px', lineHeight: 1.7 }}>
          หมวดที่เพิ่ม/แก้ที่นี่ <strong>แชร์ให้ทั้งทีมทันที</strong> และมีผลกับงบที่ส่งออก/ดันขึ้นหน้า Executive Cash Flow ทันที
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!ok} onClick={send}>{submitLabel}</button>
        </div>
      </div>
    );
  }

  /* ── 🗂 จัดการหมวด — เพิ่ม / แก้ชื่อ / ลบ / นำเข้า-ส่งออกผังทั้งชุด ──
     ⚠️ ลำดับใน master = ลำดับแถวของงบที่ส่งออก ⇒ ทุกการเพิ่ม/ย้ายต้องผ่าน cfcInsertCat
     ⚠️ เปลี่ยนชื่อ/ลบ ต้องลากกฎที่เรียนไว้ตามไปด้วยเสมอ ไม่งั้นรายการที่เคยลงหมวดนี้
        กลายเป็น "หมวดผี" — ยอดไม่เข้าบรรทัดไหนในงบ และไม่ถูกนับว่ายังไม่ลงหมวด */
  function CfcCatManagerModal({ master, rules, onClose, onAdd, onEdit, onDelete, onExportChart, onImportChart }) {
    const [mode, setMode] = useState('list');     // list | add | edit
    const [target, setTarget] = useState(null);
    const [del, setDel] = useState(null);         // { row, n, moveTo }
    const [q, setQ] = useState('');
    const fileChart = useRef(null);
    const use = useMemo(() => cfcRuleCatCount(rules), [rules]);
    const groups = useMemo(() => cfcGroupMaster(master), [master]);
    const nq = cfcNorm(q);
    const hit = (m) => !nq || cfcNorm(m.name).indexOf(nq) >= 0 || cfcNorm(m.group).indexOf(nq) >= 0;
    const shown = groups.map(([k, items]) => [k, items.filter(hit)]).filter(([, items]) => items.length);
    const inp = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 9, border: '1px solid ' + C.line };

    if (mode === 'add' || mode === 'edit') {
      return (
        <Modal open wide title={mode === 'add' ? '➕ เพิ่มหมวดใหม่' : '✏️ แก้ไขหมวด'} onClose={onClose}>
          {mode === 'edit' && use[target.name] > 0 && (
            <div style={{ fontSize: 11.5, color: C.info, background: C.infoBg, borderRadius: 9, padding: '8px 12px', marginBottom: 11, lineHeight: 1.65 }}>
              หมวดนี้ถูกใช้ในกฎที่ระบบเรียนไว้ <strong>{use[target.name]} ข้อ</strong> — เปลี่ยนชื่อแล้วกฎพวกนี้จะย้ายตามให้อัตโนมัติ
            </div>
          )}
          <CfcCatForm master={master} initial={mode === 'edit' ? target : null}
            submitLabel={mode === 'add' ? 'เพิ่มหมวด' : 'บันทึกการแก้ไข'}
            onCancel={() => { setMode('list'); setTarget(null); }}
            onSubmit={(row) => { if (mode === 'add') onAdd(row); else onEdit(target.name, row); onClose(); }} />
        </Modal>
      );
    }

    return (
      <Modal open wide title="🗂 จัดการหมวดในงบกระแสเงินสด" onClose={onClose}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontSize: 11.5, color: C.mut }}>{master.length} หมวด · {Object.keys(rules).length} กฎที่เรียนไว้</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>ปิด</button>
            <button className="btn btn-primary" onClick={() => { setTarget(null); setMode('add'); }}>➕ เพิ่มหมวดใหม่</button>
          </span>
        </div>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={q} onChange={e => setQ(e.target.value)} style={Object.assign({}, inp, { flex: 1, minWidth: 200 })} placeholder="ค้นหาชื่อหมวด / กลุ่ม…" />
            <button className="btn" style={{ fontSize: 12 }} onClick={onExportChart} title="ส่งออกผังหมวดทั้งชุดเป็น Excel 4 คอลัมน์ — แก้เป็นชุดแล้วนำเข้ากลับได้">⬇️ ส่งออกผัง</button>
            <button className="btn" style={{ fontSize: 12 }} onClick={() => fileChart.current && fileChart.current.click()} title="นำเข้าผังหมวดจาก Excel — ทับผังเดิมทั้งชุด">📥 นำเข้าผัง</button>
            <input ref={fileChart} type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) { onImportChart(f); onClose(); } }} />
          </div>
          {del && (
            <div style={{ background: C.negBg, border: '1px solid #f3c8c2', borderRadius: 11, padding: '11px 13px', display: 'grid', gap: 9 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.neg }}>ลบหมวด “{del.row.name}” ?</div>
              {del.n > 0 ? (
                <>
                  <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.7 }}>
                    หมวดนี้ถูกใช้ในกฎที่เรียนไว้ <strong>{del.n} ข้อ</strong> — ต้องบอกก่อนว่าจะให้รายการพวกนั้นไปไหน
                    ไม่งั้นยอดจะหายจากงบแบบเงียบ ๆ
                  </div>
                  <select value={del.moveTo} onChange={e => setDel(Object.assign({}, del, { moveTo: e.target.value }))} style={inp}>
                    <option value="">— กลับเป็น “ยังไม่ลงหมวด” (ไปเลือกใหม่เอง) —</option>
                    {master.filter(m => m.name !== del.row.name).map(m => (
                      <option key={m.name} value={m.name}>{(CFC_FLOW_META[cfcFlowOf(m)] || {}).mark} {m.name}</option>
                    ))}
                  </select>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.mut }}>ยังไม่มีรายการไหนลงหมวดนี้ — ลบได้เลย</div>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => setDel(null)}>ยกเลิก</button>
                <button className="btn" style={{ background: C.neg, borderColor: C.neg, color: '#fff' }}
                  onClick={() => { onDelete(del.row.name, del.moveTo); onClose(); }}>ลบหมวด</button>
              </div>
            </div>
          )}
          <div style={{ maxHeight: 430, overflow: 'auto', border: '1px solid ' + C.line, borderRadius: 11 }}>
            {!shown.length && <div style={{ padding: 18, fontSize: 12.5, color: C.mut, textAlign: 'center' }}>ไม่พบหมวดที่ค้น</div>}
            {shown.map(([k, items]) => {
              const [a, f, g] = k.split('|');
              const meta = CFC_FLOW_META[f] || CFC_FLOW_META.out;
              return (
                <div key={k}>
                  <div style={{ position: 'sticky', top: 0, zIndex: 1, background: meta.bg, color: meta.color,
                    fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderBottom: '1px solid ' + C.line }}>
                    {meta.mark} {meta.label} · {CFC_ACT_SHORT[a] || ''} · {g}
                  </div>
                  {items.map(m => (
                    <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 11px', borderBottom: '1px solid ' + C.soft }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                        {use[m.name] > 0 && <div style={{ fontSize: 10.5, color: C.mut }}>ใช้ในกฎที่เรียนไว้ {use[m.name]} ข้อ</div>}
                      </div>
                      <button className="btn" style={{ padding: '3px 9px', fontSize: 11.5 }}
                        onClick={() => { setTarget(m); setMode('edit'); }}>✏️ แก้ไข</button>
                      <button className="btn" style={{ padding: '3px 9px', fontSize: 11.5, color: C.neg }}
                        onClick={() => setDel({ row: m, n: use[m.name] || 0, moveTo: '' })}>🗑</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: C.mut, background: C.soft, borderRadius: 9, padding: '9px 12px', lineHeight: 1.7 }}>
            ลำดับในรายการนี้ = <strong>ลำดับแถวในงบที่ส่งออก</strong> · จะแก้ทีละหมวดหรือส่งออกไปแก้เป็นชุดใน Excel แล้วนำเข้ากลับก็ได้<br />
            ⚠️ นำเข้าผัง = <strong>ทับผังเดิมทั้งชุด</strong> · หมวดที่หายไปแต่มีกฎอยู่ ระบบจะถามก่อนเสมอ
          </div>
        </div>
      </Modal>
    );
  }

  /* ── 👥 ลงหมวดตามผู้รับเงิน — ตัวช่วยหลักของ "เดือนแรกที่ยังไม่มีกฎเลย" ──
     PEAK ให้ชื่อผู้รับเงินสะอาดมาจากระบบบัญชี (1 ใบ = 1 คู่ค้า) ⇒ ลงหมวดทีละคู่ค้า
     เร็วกว่าทีละใบหลายเท่า และกฎ vendor ที่ได้จะทำให้เดือนถัดไปเสนอหมวดเองเกือบหมด */
  function CfcPayeeBulkModal({ groups, master, onClose, onApply }) {
    const [pick, setPick] = useState({});          // vendorKey → cat
    const [q, setQ] = useState('');
    const [onlyNew, setOnlyNew] = useState(true);
    const nq = cfcNorm(q);
    const shown = groups.filter(g => (!onlyNew || g.uncoded > 0) && (!nq || cfcNorm(g.payee).indexOf(nq) >= 0));
    const nPick = Object.keys(pick).filter(k => pick[k]).length;
    const nRows = shown.reduce((a, g) => a + (pick[g.key] ? g.rows.length : 0), 0);
    const inp = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 9, border: '1px solid ' + C.line };
    return (
      <Modal open wide title="👥 ลงหมวดตามผู้รับเงิน" onClose={onClose}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span style={{ fontSize: 11.5, color: C.mut }}>
            {nPick ? 'เลือกไว้ ' + nPick + ' ผู้รับเงิน · ' + nRows + ' รายการ' : 'ยังไม่ได้เลือกหมวดให้ใคร'}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={!nPick} onClick={() => onApply(pick)}>
              ลงหมวด {nRows ? nRows + ' รายการ' : ''}
            </button>
          </span>
        </div>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={q} onChange={e => setQ(e.target.value)} style={Object.assign({}, inp, { flex: 1, minWidth: 200 })} placeholder="ค้นหาชื่อผู้รับเงิน…" />
            <label style={{ fontSize: 12, color: C.mut, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} style={{ cursor: 'pointer' }} />
              เฉพาะที่ยังไม่ลงหมวด
            </label>
          </div>
          <div style={{ maxHeight: 440, overflow: 'auto', border: '1px solid ' + C.line, borderRadius: 11 }}>
            <table className="tbl tbl-compact" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>ผู้รับเงิน</th>
                  <th style={{ minWidth: 62, textAlign: 'right' }}>ใบ</th>
                  <th style={{ minWidth: 110, textAlign: 'right' }}>ยอดรวม</th>
                  <th style={{ minWidth: 250 }}>ลงหมวดให้ทั้งหมด</th>
                </tr>
              </thead>
              <tbody>
                {!shown.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: C.mut, padding: 22, fontSize: 13 }}>
                  {groups.length ? 'ไม่พบผู้รับเงินที่ค้น' : 'ยังไม่มีรายการในเดือนที่เลือก'}
                </td></tr>}
                {shown.map(g => (
                  <tr key={g.key}>
                    <td>
                      <div style={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>{g.payee || '(ไม่ระบุผู้รับเงิน)'}</div>
                      <div style={{ fontSize: 10.5, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }}>{g.sample}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {g.rows.length}
                      {g.uncoded > 0 && <div style={{ fontSize: 10, color: C.warn }}>ค้าง {g.uncoded}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: g.net < 0 ? C.neg : C.pos }}>{cfcMoney(Math.abs(g.net))}</td>
                    <td>
                      <CfcCatSelect value={pick[g.key] || ''} master={master} width={250}
                        onChange={v => setPick(p => Object.assign({}, p, { [g.key]: v }))} />
                      {g.curCats.length > 0 && <div style={{ fontSize: 10.5, color: C.mut, marginTop: 2 }}>ตอนนี้: {g.curCats.slice(0, 2).join(' · ')}{g.curCats.length > 2 ? ' …' : ''}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: C.mut, background: C.soft, borderRadius: 9, padding: '9px 12px', lineHeight: 1.7 }}>
            ลงหมวดที่นี่ = ยืนยันให้ <strong>ทุกใบของผู้รับเงินรายนั้นในเดือนที่กรองอยู่</strong> พร้อมจำไว้ว่า
            “คู่ค้ารายนี้ = หมวดนี้” ⇒ เดือนถัดไประบบจะเสนอหมวดให้เองตั้งแต่แรก<br />
            ⚠️ คู่ค้าที่จ่ายหลายเรื่อง (เช่น ทั้งค่าเช่าและค่าซ่อม) อย่าลงรวดเดียว — ไปเลือกทีละใบในตารางหลักแทน
          </div>
        </div>
      </Modal>
    );
  }

  /* ── ➕ รายการนอก PV — เงินรับ / ค่าธรรมเนียมที่ธนาคารหักเอง / โอนระหว่างบัญชี ──
     สมุด "จ่าย" ของ PEAK ไม่มีขารับ ⇒ ถ้าไม่มีทางคีย์ งบจะมีแต่ขาจ่ายตลอดกาล */
  function CfcExtraRowModal({ initial, accounts, onClose, onSave, onDelete }) {
    const [r, setR] = useState(() => Object.assign({
      id: '', iso: new Date().toISOString().slice(0, 10), docNo: '', payee: '', memo: '', acctRaw: '', dir: 'in', amount: 0,
    }, initial || {}));
    const set = (k, v) => setR(x => Object.assign({}, x, { [k]: v }));
    const lbl = { fontSize: 12, fontWeight: 700, color: C.mut, display: 'block', marginBottom: 4 };
    const inp = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 9, border: '1px solid ' + C.line };
    const ok = cfcISO(r.iso) && cfcNum(r.amount) > 0 && (cfcT(r.memo) || cfcT(r.payee));
    return (
      <Modal open wide title={initial && initial.id ? '✏️ แก้ไขรายการนอก PV' : '➕ เพิ่มรายการนอก PV'} onClose={onClose}
        footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
          <span>{initial && initial.id && <button className="btn" style={{ color: C.neg }} onClick={() => onDelete(initial.id)}>🗑 ลบรายการนี้</button>}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>ยกเลิก</button>
            <button className="btn btn-primary" disabled={!ok} onClick={() => onSave(r)}>บันทึก</button>
          </span>
        </div>}>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <div><label style={lbl}>วันที่</label>
            <input type="date" value={r.iso} onChange={e => set('iso', e.target.value)} style={inp} /></div>
          <div><label style={lbl}>เลขที่อ้างอิง (ถ้ามี)</label>
            <input value={r.docNo} onChange={e => set('docNo', e.target.value)} style={inp} placeholder="เช่น RV-2026-001 / Statement" /></div>
          <div><label style={lbl}>เงินเข้าหรือเงินออก</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['in', 'out'].map(f => {
                const meta = CFC_FLOW_META[f];
                return <button key={f} onClick={() => set('dir', f)} style={{
                  flex: 1, cursor: 'pointer', borderRadius: 10, padding: '8px 6px', fontSize: 13, fontWeight: 700,
                  border: '1px solid ' + (r.dir === f ? meta.color : C.line),
                  background: r.dir === f ? meta.color : '#fff', color: r.dir === f ? '#fff' : meta.color,
                }}>{meta.mark} {meta.label}</button>;
              })}
            </div></div>
          <div><label style={lbl}>จำนวนเงิน</label>
            <CfcMoneyInput value={r.amount} width="100%" placeholder="0.00" onSave={v => set('amount', v || 0)} /></div>
          <div><label style={lbl}>ผู้จ่าย / ผู้รับเงิน</label>
            <input value={r.payee} onChange={e => set('payee', e.target.value)} style={inp} placeholder="เช่น ธนาคารกรุงเทพ / บริษัท ก. จำกัด" /></div>
          <div><label style={lbl}>บัญชีธนาคาร</label>
            <input list="cfc-acct-list" value={r.acctRaw} onChange={e => set('acctRaw', e.target.value)} style={inp} placeholder="เลขที่บัญชี" />
            <datalist id="cfc-acct-list">{(accounts || []).map(a => <option key={a.no} value={a.no}>{a.label}</option>)}</datalist></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>คำอธิบายรายการ</label>
            <input value={r.memo} onChange={e => set('memo', e.target.value)} style={inp} placeholder="เช่น รับเงินกู้กรรมการ / ดอกเบี้ยรับ / ค่าธรรมเนียมโอนเงิน" /></div>
          <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: C.mut, background: C.soft, borderRadius: 9, padding: '9px 12px', lineHeight: 1.7 }}>
            รายการที่คีย์ที่นี่จะไปอยู่ในตารางลงรหัสเหมือนใบสำคัญจ่ายทุกประการ (เลือกหมวดในตารางหลัก) ·
            <strong>อย่าคีย์ซ้ำกับใบสำคัญจ่าย</strong> ที่นำเข้าจาก PEAK แล้ว — ยอดจะเบิ้ล
          </div>
        </div>
      </Modal>
    );
  }

  /* ══════════════ AOA ของงบ (ใช้ร่วมทั้งส่งออกไฟล์และดันขึ้นหน้า Cash Flow) ══════════════
     ★ สร้างที่เดียว จะได้ไม่มีสูตรสองชุดที่เพี้ยนจากกันทีหลัง */
  /* "ก.ค. 69" → "2026-07" — ใช้แกะคอลัมน์เดือนของงบที่เก็บไว้ (ตรงข้ามกับ monLabel) */
  function cfcYmOfMonthLabel(lb) {
    const s = cfcT(lb); let mo = 0;
    for (let k = 1; k <= 12; k++) { if (s.indexOf(CFC_MONTH_TH[k]) === 0) { mo = k; break; } }
    const y2 = (s.match(/(\d{2,4})\s*$/) || [])[1];
    if (!mo || !y2) return '';
    let y = Number(y2);
    y = y < 100 ? (y + 2500 - 543) : (y > 2400 ? y - 543 : y);
    return y + '-' + String(mo).padStart(2, '0');
  }
  /* ชื่อบรรทัดในงบเดิม → ชื่อหมวดที่ cfcSummaryAoa ใช้เป็นคีย์ */
  function cfcCanonRowLabel(l) {
    return cfcT(l)
      .replace(/^⚠\s*/, '')
      .replace(/\s*\(ไม่มีในผังหมวด — ต้องแก้\)$/, '')
      .replace(/^(โอนเงินระหว่างบัญชี)\s*\(.*\)$/, '$1');
  }
  /* ★ เดินแถวเงินสด (ต้นงวด → ปลายงวด) — ที่เดียวที่คิดสูตรนี้
     ⚠️ ปลายงวด ≠ ต้นงวด + "เงินสดสุทธิ" เฉย ๆ — "เงินสดสุทธิ" นับเฉพาะรายการที่ลงกิจกรรมแล้ว
        เงินที่ยังไม่เข้ากิจกรรม (โอนระหว่างบัญชี · ยังไม่ลงหมวด · หมวดผี) ก็กระทบเงินในบัญชีจริง
        ต้องบวกด้วย ไม่งั้นปลายงวดต่ำ/สูงกว่ายอดจริงแบบเงียบ ๆ */
  function cfcRunCashRows(aoa, months, keepSet, oldCol) {
    const kinds = aoa.kinds || [];
    const hdr = aoa.findIndex(r => cfcT(r[0]) === 'รายการ'); if (hdr < 0) return;
    const n = months.length;
    const rowOf = (re) => { for (let r = hdr + 1; r < aoa.length; r++) if (re.test(cfcT(aoa[r][0]))) return r; return -1; };
    const rNet = rowOf(/^เงินสดสุทธิ/), rBf = rowOf(/^เงินสดต้นงวด/), rBal = rowOf(/^เงินสดปลายงวด/);
    if (rNet < 0 || rBf < 0 || rBal < 0) return;
    const extraRows = [];
    for (let r = hdr + 1; r < aoa.length; r++) if (kinds[r] === 'nitem' || kinds[r] === 'nbad') extraRows.push(r);
    let run = cfcNum(aoa[rBf][1]);
    months.forEach((m, i) => {
      aoa[rBf][i + 1] = run;
      if (keepSet && keepSet.has(m) && oldCol && oldCol[m] != null) { run = cfcNum(aoa[rBal][i + 1]); return; }
      const ex = extraRows.reduce((a, r) => a + cfcNum(aoa[r][i + 1]), 0);
      run = run + cfcNum(aoa[rNet][i + 1]) + ex;
      aoa[rBal][i + 1] = run;
    });
    aoa[rBf][n + 1] = cfcNum(aoa[rBf][1]);
    aoa[rBal][n + 1] = run;
  }
  /* ★ ทับคอลัมน์ของ "เดือนที่ไม่ได้ส่ง" ด้วยตัวเลขเดิมของงบ — ทุกแถว ไม่ใช่แค่รายการย่อย
     ⚠️ ทับเฉพาะรายการย่อยไม่พอ: แถว "รวม…"/"เงินสดสุทธิ" ระบบคิดใหม่จากผังหมวดปัจจุบัน
        ถ้าไฟล์เดิมมีรายการย่อยที่ผังหมวดตอนนี้ไม่มี ผลบวกจะขาด แล้วยอดคงเหลือเลื่อนยาว */
  function cfcApplyOldColumns(aoa, months, keepSet, oldByLabel, oldCol) {
    const kinds = aoa.kinds || [];
    const hdr = aoa.findIndex(r => cfcT(r[0]) === 'รายการ');
    if (hdr < 0) return;
    const n = months.length;
    for (let r = hdr + 1; r < aoa.length; r++) {
      const lab = cfcCanonRowLabel(aoa[r][0]); if (!lab) continue;
      const src = oldByLabel[lab]; if (!src) continue;
      months.forEach((m, i) => { if (keepSet.has(m) && oldCol[m] != null) aoa[r][i + 1] = cfcNum(src[oldCol[m]]); });
    }
    for (let r = hdr + 1; r < aoa.length; r++) {
      if (kinds[r] === 'anet' && /^เงินสดต้นงวด/.test(cfcT(aoa[r][0]))) continue;
      if (kinds[r] === 'net' && /^เงินสดปลายงวด/.test(cfcT(aoa[r][0]))) continue;
      let s = 0, any = false;
      for (let i = 0; i < n; i++) { const v = aoa[r][i + 1]; if (v === '' || v == null) continue; any = true; s += cfcNum(v); }
      if (any) aoa[r][n + 1] = s;
    }
    cfcRunCashRows(aoa, months, keepSet, oldCol);
  }

  function cfcSummaryAoa(master, months, cell, monLabel, usedCats, opening) {
    /* kinds[i] = ชนิดของแถวที่ i — ใช้ตอนจัดสีในไฟล์ Excel เท่านั้น
       สร้างตรงจุดที่ push แถว จะได้ไม่ต้องมีตัวเดาชนิดจาก "ช่องว่างหน้าข้อความ" ซ้อนอีกชุด */
    const kinds = [];
    const push = (row, kind) => { aoa.push(row); kinds[aoa.length - 1] = kind; return row; };
    const val = (name) => months.map(m => cell[name + '|' + m] || 0);
    const sumRow = (names) => months.map(m => names.reduce((a, n) => a + (cell[n + '|' + m] || 0), 0));
    const withTotal = (arr) => arr.concat([arr.reduce((a, x) => a + x, 0)]);
    const aoa = [[CFC_COMPANY], ['งบกระแสเงินสด (รายเดือน)'],
      ['สำหรับงวด ' + (months.length ? monLabel(months[0]) + (months.length > 1 ? ' ถึง ' + monLabel(months[months.length - 1]) : '') : '')],
      [], ['รายการ'].concat(months.map(monLabel)).concat(['รวม'])];
    kinds[0] = 'co'; kinds[1] = 'title'; kinds[2] = 'period'; kinds[3] = 'gap'; kinds[4] = 'head';
    const SEC = { op: 'กระแสเงินสดจากกิจกรรมดำเนินงาน', inv: 'กระแสเงินสดจากกิจกรรมลงทุน', fin: 'กระแสเงินสดจากกิจกรรมจัดหาเงิน' };
    const actNet = {};
    ['op', 'inv', 'fin'].forEach(a => {
      const inAct = master.filter(m => m.act === a);
      if (!inAct.length) return;
      push([SEC[a]], 'sec');
      [...new Set(inAct.map(m => m.group))].forEach(g => {
        const items = inAct.filter(m => m.group === g).map(m => m.name);
        push(['   ' + g], 'grp');
        items.forEach(n => push(['      ' + n].concat(withTotal(val(n))), 'item'));
        push(['   รวม' + g].concat(withTotal(sumRow(items))), 'gsum');
      });
      actNet[a] = sumRow(inAct.map(m => m.name));
      push(['กระแสเงินสดสุทธิจาก' + SEC[a].replace('กระแสเงินสดจาก', '')].concat(withTotal(actNet[a])), 'anet');
      push([], 'gap');
    });
    const net = months.map((m, i) => ['op', 'inv', 'fin'].reduce((a, k) => a + ((actNet[k] || [])[i] || 0), 0));
    push(['เงินสดสุทธิ เพิ่มขึ้น (ลดลง)'].concat(withTotal(net)), 'net');
    /* ★ ต้นงวด/ปลายงวด — PEAK ไม่ส่งยอดคงเหลือมาให้ ต้องคีย์ต้นงวดเองที่หน้าจอ
       ไม่มีค่า = ไม่พิมพ์ 2 บรรทัดนี้เลย ดีกว่าพิมพ์ 0 แล้วคนอ่านนึกว่าเงินหมดบัญชี */
    if (opening != null) {
      /* ค่าตั้งต้น — ตัวเลขจริงมาจาก cfcRunCashRows() ท้ายฟังก์ชัน (ต้องรอให้บรรทัด
         "ไม่นับเป็นกิจกรรม" ถูก push ครบก่อน เพราะเงินพวกนั้นก็กระทบยอดในบัญชีจริง) */
      const openRow = months.map(() => 0), endRow = months.map(() => 0);
      openRow[0] = cfcNum(opening);
      push([], 'gap');
      push(['เงินสดต้นงวด'].concat(openRow).concat([cfcNum(opening)]), 'anet');
      push(['เงินสดปลายงวด'].concat(endRow).concat([0]), 'net');
    }
    push([], 'gap');
    push(['— รายการที่ไม่นับเป็นกิจกรรม (ไว้ตรวจ ไม่ต้องวางในงบ) —'], 'nsec');
    push(['   โอนเงินระหว่างบัญชี (ควรเป็น 0 เมื่อรวมทุกบัญชี)'].concat(withTotal(val('โอนเงินระหว่างบัญชี'))), 'nitem');
    push(['   (ยังไม่ลงหมวด)'].concat(withTotal(val('(ยังไม่ลงหมวด)'))), 'nitem');
    const known = new Set(master.map(m => m.name).concat(['โอนเงินระหว่างบัญชี', '(ยังไม่ลงหมวด)']));
    (usedCats || []).filter(c => !known.has(c))
      .forEach(n => push(['   ⚠ ' + n + ' (ไม่มีในผังหมวด — ต้องแก้)'].concat(withTotal(val(n))), 'nbad'));
    aoa.kinds = kinds;
    cfcRunCashRows(aoa, months);
    return aoa;
  }

  /* ════════ ตัวจัดสี/จัดตารางไฟล์ Excel ════════
     สีเดียวกับที่ใช้บนหน้าจอ: เขียว = รับ · แดง = จ่าย
     ⚠️ พื้นหัวตารางใช้เฉด 600 (2D8B4D) ไม่ใช่ 500 — ตัวอักษรขาวบน 500 อ่านไม่สบาย */
  const XS = {
    brand: '2D8B4D', brandD: '22703C', soft: 'F3FAF5', line: 'DCEBE2',
    ink: '20342A', mut: '688275', pos: '15875A', neg: 'C0392B',
    warnBg: 'FFF7E0', warnInk: '8A6400', zebra: 'F8FCFA',
  };
  const XS_FONT = 'Leelawadee UI';
  const xsB = (w) => ({ style: w || 'thin', color: { rgb: XS.line } });
  const xsBox = (w) => ({ top: xsB(w), bottom: xsB(w), left: xsB(w), right: xsB(w) });
  const XS_MONEY = '#,##0.00;[Red]-#,##0.00;"–"';
  /* ใส่ style ให้ทั้งแถว (กว้าง nCol ช่อง) — สร้างเซลล์ว่างให้ด้วย เพื่อให้พื้น/เส้นต่อกันไม่ขาด */
  function xsRow(ws, r, nCol, style, only) {
    for (let c = 0; c < nCol; c++) {
      const a = XLSX.utils.encode_cell({ r, c });
      if (!ws[a]) { if (only) continue; ws[a] = { t: 's', v: '' }; }
      ws[a].s = Object.assign({}, ws[a].s, typeof style === 'function' ? style(c) : style);
    }
  }
  function xsCell(ws, r, c, style) {
    const a = XLSX.utils.encode_cell({ r, c });
    if (ws[a]) ws[a].s = Object.assign({}, ws[a].s, style);
  }
  /* ตัวเลขในงบ: เขียว = เงินเข้า · แดง = เงินออก · 0 = ขีด (ตามที่ใช้บนหน้าจอ) */
  function xsMoney(ws, r, c, opt) {
    const a = XLSX.utils.encode_cell({ r, c }), cl = ws[a];
    if (!cl || typeof cl.v !== 'number') return;
    const o = opt || {};
    cl.s = Object.assign({}, cl.s, {
      numFmt: XS_MONEY,
      alignment: { horizontal: 'right', vertical: 'center' },
      font: Object.assign({ name: XS_FONT, sz: o.sz || 10.5, bold: !!o.bold },
        o.ink ? { color: { rgb: o.ink } } : { color: { rgb: cl.v > 0.004 ? XS.pos : (cl.v < -0.004 ? XS.neg : 'B4C6BB') } }),
    });
  }

  /* ── ชีต "งบกระแสเงินสด" — หน้าเดียวจบ พร้อมวางในไฟล์ CASH FLOW ──
     ⚠️ ใส่ได้แค่ "สี/เส้น/รูปแบบตัวเลข" ห้ามเพิ่ม-ลด-สลับแถวที่นี่: index แถวต้องตรงกับ AOA */
  function cfcStyleSummary(ws, aoa, nCol) {
    const kinds = aoa.kinds || [], n = aoa.length;
    const merges = [], rows = [];
    [0, 1, 2].forEach(r => merges.push({ s: { r, c: 0 }, e: { r, c: nCol - 1 } }));
    rows[0] = { hpt: 26 }; rows[1] = { hpt: 20 }; rows[2] = { hpt: 17 }; rows[3] = { hpt: 7 }; rows[4] = { hpt: 24 };
    xsRow(ws, 0, nCol, { font: { name: XS_FONT, sz: 15, bold: true, color: { rgb: XS.brandD } }, alignment: { horizontal: 'center', vertical: 'center' } });
    xsRow(ws, 1, nCol, { font: { name: XS_FONT, sz: 12.5, bold: true, color: { rgb: XS.ink } }, alignment: { horizontal: 'center', vertical: 'center' } });
    xsRow(ws, 2, nCol, { font: { name: XS_FONT, sz: 10, color: { rgb: XS.mut } }, alignment: { horizontal: 'center', vertical: 'center' } });
    xsRow(ws, 4, nCol, (c) => ({
      font: { name: XS_FONT, sz: 11, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: XS.brand } },
      alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center' },
      border: { top: xsB(), bottom: xsB('medium'), left: xsB(), right: xsB() },
    }));
    for (let r = 5; r < n; r++) {
      const k = kinds[r];
      if (!k || k === 'gap') { rows[r] = { hpt: 6 }; continue; }
      const label = { name: XS_FONT, sz: 10.5, color: { rgb: XS.ink } };
      if (k === 'sec') {
        merges.push({ s: { r, c: 0 }, e: { r, c: nCol - 1 } }); rows[r] = { hpt: 21 };
        xsRow(ws, r, nCol, { font: { name: XS_FONT, sz: 11.5, bold: true, color: { rgb: XS.brandD } },
          fill: { patternType: 'solid', fgColor: { rgb: 'DFF1E6' } },
          alignment: { horizontal: 'left', vertical: 'center' },
          border: { top: xsB('medium'), bottom: xsB() } });
      } else if (k === 'grp') {
        merges.push({ s: { r, c: 0 }, e: { r, c: nCol - 1 } });
        xsRow(ws, r, nCol, { font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: XS.mut } },
          fill: { patternType: 'solid', fgColor: { rgb: XS.soft } }, alignment: { vertical: 'center' } });
      } else if (k === 'item' || k === 'nitem') {
        xsRow(ws, r, nCol, { border: xsBox() }, true);
        xsCell(ws, r, 0, { font: label, alignment: { vertical: 'center' } });
        for (let c = 1; c < nCol; c++) xsMoney(ws, r, c, k === 'nitem' ? { ink: XS.mut } : {});
      } else if (k === 'gsum') {
        xsRow(ws, r, nCol, { fill: { patternType: 'solid', fgColor: { rgb: XS.soft } }, border: { top: xsB(), bottom: xsB() } });
        xsCell(ws, r, 0, { font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: XS.mut } }, alignment: { vertical: 'center' } });
        for (let c = 1; c < nCol; c++) xsMoney(ws, r, c, { bold: true });
      } else if (k === 'anet') {
        rows[r] = { hpt: 20 };
        xsRow(ws, r, nCol, { fill: { patternType: 'solid', fgColor: { rgb: 'D3EDDD' } }, border: { top: xsB('medium'), bottom: xsB('medium') } });
        xsCell(ws, r, 0, { font: { name: XS_FONT, sz: 11, bold: true, color: { rgb: XS.brandD } }, alignment: { vertical: 'center' } });
        for (let c = 1; c < nCol; c++) xsMoney(ws, r, c, { bold: true, sz: 11 });
      } else if (k === 'net') {
        rows[r] = { hpt: 24 };
        xsRow(ws, r, nCol, { fill: { patternType: 'solid', fgColor: { rgb: XS.brand } },
          border: { top: xsB('medium'), bottom: xsB('double') } });
        xsCell(ws, r, 0, { font: { name: XS_FONT, sz: 12, bold: true, color: { rgb: 'FFFFFF' } }, alignment: { vertical: 'center' } });
        for (let c = 1; c < nCol; c++) xsMoney(ws, r, c, { bold: true, sz: 12, ink: 'FFFFFF' });
      } else if (k === 'nsec') {
        merges.push({ s: { r, c: 0 }, e: { r, c: nCol - 1 } }); rows[r] = { hpt: 19 };
        xsRow(ws, r, nCol, { font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: XS.mut } }, alignment: { vertical: 'center' } });
      } else if (k === 'nbad') {
        xsRow(ws, r, nCol, { fill: { patternType: 'solid', fgColor: { rgb: XS.warnBg } }, border: xsBox() });
        xsCell(ws, r, 0, { font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: XS.warnInk } } });
        for (let c = 1; c < nCol; c++) xsMoney(ws, r, c, { bold: true, ink: XS.warnInk });
      }
    }
    ws['!merges'] = merges; ws['!rows'] = rows;
    ws['!freeze'] = { xSplit: 1, ySplit: 5 };
  }

  /* ── ชีต "รายละเอียดทุกรายการ" — หัวตารางอยู่แถว 1 เสมอ
        (ตัวอ่านของหน้า Executive Cash Flow พึ่งตำแหน่งนี้อยู่)
     ★ ไม่มีคอลัมน์ "ยอดคงเหลือ" โดยตั้งใจ — PEAK ไม่ส่งยอดคงเหลือรายบรรทัดมาให้
       ถ้าใส่คอลัมน์ว่างไว้ ตัวอ่านของหน้า Cash Flow จะคิดยอดต้นงวด = 0 − กระแสของแถวแรก
       (ติดลบเท่ายอดจ่ายใบแรก) แบบเงียบสนิท — ไม่มีคอลัมน์เลย = ตัวอ่านข้ามให้ถูกต้อง   */
  const CFC_DETAIL_HEAD = ['ลำดับ', 'บัญชีธนาคาร', 'เลขที่บัญชี', 'วันที่', 'เลขที่ PV', 'เลขที่ AP', 'ผู้รับเงิน',
    'ยอดถอน', 'ยอดฝาก', 'ประเภทการจ่าย', 'หมายเหตุ', 'หมวดเงินรับ-เงินจ่าย', 'ประเภทกิจกรรมทางการเงิน'];
  const CFC_XL_MONEY_COL = { 7: XS.neg, 8: XS.pos };
  const CFC_XL_CAT_COL = 11;
  function cfcStyleDetail(ws, aoa) {
    const n = aoa.length, nCol = CFC_DETAIL_HEAD.length, rows = [{ hpt: 26 }];
    xsRow(ws, 0, nCol, {
      font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: XS.brand } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: xsBox(),
    });
    for (let r = 1; r < n; r++) {
      const zebra = r % 2 === 0 ? { patternType: 'solid', fgColor: { rgb: XS.zebra } } : null;
      const noCat = !String((aoa[r] || [])[CFC_XL_CAT_COL] || '').trim();
      xsRow(ws, r, nCol, (c) => Object.assign(
        { font: { name: XS_FONT, sz: 10, color: { rgb: XS.ink } }, border: xsBox(),
          alignment: (c === 0 || c === 2 || c === 3 || c === 4 || c === 5)
            ? { horizontal: 'center', vertical: 'center' } : { vertical: 'center' } },
        zebra ? { fill: zebra } : null,
      ));
      Object.keys(CFC_XL_MONEY_COL).forEach(c => xsMoney(ws, r, +c, { ink: CFC_XL_MONEY_COL[c] }));
      /* แถวที่ยังไม่ลงหมวด = ไฮไลต์เหลืองที่ช่องหมวด จะได้ไล่เก็บได้เร็ว */
      if (noCat) xsCell(ws, r, CFC_XL_CAT_COL, { fill: { patternType: 'solid', fgColor: { rgb: XS.warnBg } },
        font: { name: XS_FONT, sz: 10, bold: true, color: { rgb: XS.warnInk } } });
      else xsCell(ws, r, CFC_XL_CAT_COL, { font: { name: XS_FONT, sz: 10, bold: true, color: { rgb: XS.brandD } } });
    }
    ws['!rows'] = rows;
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    if (n > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n - 1, c: nCol - 1 } }) };
  }

  /* ── ชีต "สรุปรายบัญชี" — หัวตารางอยู่แถวที่ 4 (index 3) ── */
  function cfcStyleCheck(ws, aoa, badCols) {
    const n = aoa.length, nCol = (aoa[3] || []).length, rows = [];
    rows[0] = { hpt: 19 };
    [0, 1].forEach(r => xsRow(ws, r, nCol, {
      font: { name: XS_FONT, sz: r ? 10 : 11.5, bold: !r, color: { rgb: r ? XS.mut : XS.brandD } },
    }, true));
    rows[3] = { hpt: 32 };
    xsRow(ws, 3, nCol, {
      font: { name: XS_FONT, sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: XS.brand } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: xsBox(),
    });
    for (let r = 4; r < n; r++) {
      if (!(aoa[r] || []).length) { rows[r] = { hpt: 6 }; continue; }
      const last = r === n - 1;
      xsRow(ws, r, nCol, (c) => Object.assign(
        { font: { name: XS_FONT, sz: 10, bold: last, color: { rgb: XS.ink } }, border: xsBox(),
          alignment: c === 2 ? { horizontal: 'center', vertical: 'center' } : { vertical: 'center' } },
        last ? { fill: { patternType: 'solid', fgColor: { rgb: XS.soft } },
          border: { top: xsB('medium'), bottom: xsB('medium'), left: xsB(), right: xsB() } } : null,
      ));
      for (let c = 3; c < nCol - 2; c++) xsMoney(ws, r, c, { ink: XS.ink, bold: last });
      /* ช่องที่ต้อง "ไปไล่หา" = แดงเข้มพื้นแดงจาง */
      (badCols || []).forEach(c => {
        const a = XLSX.utils.encode_cell({ r, c }), cl = ws[a];
        if (cl && typeof cl.v === 'number' && Math.abs(cl.v) > 0.02) {
          cl.s = Object.assign({}, cl.s, { fill: { patternType: 'solid', fgColor: { rgb: 'FDECEA' } },
            font: { name: XS_FONT, sz: 10, bold: true, color: { rgb: XS.neg } } });
        }
      });
    }
    ws['!rows'] = rows;
    ws['!freeze'] = { xSplit: 2, ySplit: 4 };
  }

  /* อ่าน workbook (ใช้กับ "นำเข้าผังหมวด" อย่างเดียว) */
  function cfcReadWorkbook(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      fr.onload = () => {
        try { resolve(XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: false })); }
        catch (e) { reject(e); }
      };
      fr.readAsArrayBuffer(file);
    });
  }
  const cfcAoa = (ws) => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true, defval: '' });

  /* ══════════════ หน้าหลัก ══════════════ */
  function CfCodingPage({ data, setData, toast }) {
    const canEdit = typeof WTPAuth !== 'undefined' && WTPAuth.can ? WTPAuth.can('canEdit') : true;
    const [store, setStore] = useState(() => cfcLoadLocal());
    /* 3 สถานะ ไม่ใช่ 2 — ตารางที่เพิ่งสร้างยังว่าง ถ้าใช้แค่ "มีข้อมูล/ไม่มี" จะขึ้นว่า
       "ข้อมูลในเครื่อง" ทั้งที่ต่อส่วนกลางได้แล้ว → คนเปิดครั้งแรกนึกว่ารัน SQL ไม่ติด
         local  = ไม่ได้ต่อส่วนกลาง (backend ไม่ใช่ supabase / อ่านไม่ผ่าน)
         ready  = อ่านตารางผ่านแล้ว แต่ยังไม่มีข้อมูล (ยังไม่พิสูจน์ว่าเขียนได้ — RLS ที่เปิด
                  แต่ไม่มี policy ก็คืน [] เงียบ ๆ เหมือนกัน จะรู้แน่ตอนบันทึกครั้งแรก)
         shared = มีข้อมูลส่วนกลางแล้ว / เพิ่งเขียนสำเร็จ */
    const [syncState, setSyncState] = useState('local');
    const [busy, setBusy] = useState('');
    const [ym, setYm] = useState('');
    const [acct, setAcct] = useState('');
    const [pushAsk, setPushAsk] = useState(false);   // หน้าต่างยืนยัน "จะดันเดือนไหน"
    const [tab, setTab] = useState('all');
    const [q, setQ] = useState('');
    const [catMgr, setCatMgr] = useState(false);
    const [bulk, setBulk] = useState(false);
    const [extraEdit, setExtraEdit] = useState(null);   // {} = เพิ่มใหม่ · {id,…} = แก้ไข
    const fileGl = useRef(null);

    /* ── โหลดจากส่วนกลาง ── */
    useEffect(() => {
      if (!cfcCanSync()) return;
      WTPData.fetchSheetRows(CFC_TABLE).then(rows => {
        const o = {};
        (rows || []).forEach(r => { const id = r.id || (r.data && r.data.id); const d = r.data || r; if (id) o[id] = d; });
        if (Object.keys(o).length) { setStore(o); cfcSaveLocal(o); setSyncState('shared'); }
        else setSyncState('ready');          // ตารางมีจริงแต่ยังว่าง — ไม่ใช่ "ในเครื่อง"
      }).catch(e => { setSyncState('local'); console.warn('[cfc] load', e && e.message); });
    }, []);

    /* ⚠️ เขียนเฉพาะ "แถวที่เปลี่ยน" — `writeTable` จะ selectAll ทั้งตารางแล้ว upsert ทุกแถว
       ⇒ ยืนยันหมวด 1 รายการ = ดาวน์โหลด+อัปโหลดข้อมูลทุกเดือนใหม่ทั้งชุด (หน้าค้างทุกคลิก)
       ทุกที่ที่เรียก persist สร้าง object ใหม่ให้ id ที่แก้ ⇒ เทียบด้วย identity พอ
       ยังไม่เคย sync (server ว่าง) → เขียนเต็มชุดครั้งแรกตามเดิม */
    const persist = (next) => {
      const prev = store;
      setStore(next); cfcSaveLocal(next);
      if (!cfcCanSync()) return Promise.resolve({ shared: false });
      const ok = () => { setSyncState('shared'); return { shared: true }; };
      const fail = e => { setSyncState('local'); console.warn('[cfc] save', e && e.message); return { shared: false, err: e }; };
      const rows = Object.keys(next).map(id => Object.assign({ id }, next[id]));
      if (syncState !== 'shared' || typeof WTPData.upsertSheetRows !== 'function') {
        return WTPData.writeTable(CFC_TABLE, rows, r => r.id).then(ok).catch(fail);
      }
      const dirty = rows.filter(r => next[r.id] !== prev[r.id]);
      const gone = Object.keys(prev).filter(id => !(id in next));
      if (!dirty.length && !gone.length) return Promise.resolve({ shared: true });
      return WTPData.upsertSheetRows(CFC_TABLE, dirty, r => r.id)
        .then(() => (gone.length ? WTPData.forceDeleteRows(CFC_TABLE, gone) : null))
        .then(ok).catch(fail);
    };

    /* ── ผังหมวด ── */
    const isSeedMaster = !(store.master && Array.isArray(store.master.items) && store.master.items.length);
    const master = useMemo(() => cfcWithExtraCats(isSeedMaster ? cfcSeedMaster() : store.master.items), [store.master, isSeedMaster]);
    const catAct = useMemo(() => { const o = {}; master.forEach(m => { o[m.name] = m.act; }); return o; }, [master]);
    const catFlow = useMemo(() => { const o = {}; master.forEach(m => { o[m.name] = cfcFlowOf(m); }); return o; }, [master]);
    const rules = useMemo(() => (store.rules && store.rules.map) || {}, [store.rules]);
    const engine = useMemo(() => cfcBuildEngine(rules, catAct, catFlow), [rules, catAct, catFlow]);
    const manualOpen = useMemo(() => (store.manual && store.manual.opening) || {}, [store.manual]);

    /* ── ทะเบียนบัญชีธนาคาร: ใช้ data.bankAccounts (ของจริงในระบบ) มาตั้งป้ายให้อ่านออก ──
       PEAK ฝังเลขบัญชีมาในคำอธิบาย (เช่น "218-2-925534") — เทียบ 4 ตัวท้ายกับทะเบียน
       ⚠️ ต้อง fallback เป็นข้อความดิบ ไม่งั้นบัญชีที่ยังไม่ได้ลงทะเบียนจะยุบรวมกันหมด */
    const acctOf = useMemo(() => {
      const cands = (data.bankAccounts || []).map(b => ({
        no: cfcDigits(b.accountNo), raw: cfcT(b.accountNo),
        label: cfcT(b.bankName) + (cfcDigits(b.accountNo) ? ' ···' + cfcDigits(b.accountNo).slice(-4) : ''),
      })).filter(b => b.no);
      return (txt) => {
        const d = cfcDigits(txt);
        if (d.length >= 4) {
          const hit = cands.find(c => c.no.slice(-4) === d.slice(-4));
          if (hit) return { no: hit.raw, label: hit.label };
        }
        const raw = cfcT(txt);
        return { no: raw, label: raw || '(ไม่ระบุบัญชี)' };
      };
    }, [data.bankAccounts]);

    /* ── รายการนอก PV ที่คีย์เอง ── */
    const extraRows = useMemo(() => (store.extra && Array.isArray(store.extra.rows) ? store.extra.rows : []), [store.extra]);

    /* ── บรรทัดเดินบัญชีจาก GL (รายงานบัญชีแยกประเภท ของ PEAK) ──
         id = 'gl:<acctKey>:<ym>' · ยอดยกมาติดอยู่กับบัคเก็ตของเดือนแรกในช่วงที่ส่งออก */
    const glBuckets = useMemo(() => {
      const out = [];
      Object.keys(store).forEach(id => {
        if (id.indexOf('gl:') !== 0) return;
        const b = store[id]; if (!b || !Array.isArray(b.lines)) return;
        out.push(Object.assign({ id }, b));
      });
      return out.sort((a, b) => (a.ym === b.ym ? String(a.acctKey).localeCompare(String(b.acctKey)) : (a.ym < b.ym ? -1 : 1)));
    }, [store]);

    /* ยอดยกมาที่ GL ประกาศ + ปลายงวดตาม GL รายบัญชี — ตัวตรวจว่าเราเก็บรายการครบไหม */
    const glAcct = useMemo(() => {
      const m = {};
      glBuckets.forEach(b => {
        const g = m[b.acctKey] || (m[b.acctKey] = { key: b.acctKey, acctNo: b.acctNo, bankName: b.bankName,
          alias: b.alias, code: b.acctCode, opening: null, openingYm: '', inSum: 0, outSum: 0, n: 0, yms: [] });
        if (b.opening != null && (!g.openingYm || b.ym < g.openingYm)) { g.opening = cfcNum(b.opening); g.openingYm = b.ym; }
        (b.lines || []).forEach(L => { g.inSum += cfcNum(L.in); g.outSum += cfcNum(L.out); g.n++; });
        if (g.yms.indexOf(b.ym) < 0) g.yms.push(b.ym);
      });
      Object.values(m).forEach(g => { g.yms.sort(); g.closing = (g.opening || 0) + g.inSum - g.outSum; });
      return m;
    }, [glBuckets]);

    /* docNo → บัญชีที่ GL บอก — ใช้เติมบัญชีให้แถว PV ที่ regex ดึง Bank_AC ไม่ออก */
    const glAcctByDoc = useMemo(() => {
      const m = {};
      glBuckets.forEach(b => (b.lines || []).forEach(L => {
        const k = cfcT(L.docNo).toUpperCase(); if (k) m[k] = b;
      }));
      return m;
    }, [glBuckets]);

    /* ── แถวลงรหัสทั้งหมด (ยังไม่กรองเดือน/บัญชี) ──
         (ก) ใบสำคัญจ่ายจาก PEAK — 1 ใบ = 1 แถว (peak_import ยุบ double-entry ให้แล้ว)
         (ข) บรรทัด GL ที่ "ไม่มีใน PV" — ขารับ (RV) / ค่าธรรมเนียมที่ธนาคารหักเอง / โอนระหว่างบัญชี
         (ค) รายการนอก PV ที่คีย์เอง — เผื่อรายการที่ไม่มีทั้งใน PV และ GL
       ★ ลำดับความสำคัญ: PV ชนะ GL เสมอเมื่อเลขที่รายวันตรงกัน — ใบ PV มี WHT/ยอดก่อนหัก
         ที่ GL ไม่มี · GL เอามาเฉพาะที่ PV ไม่ครอบคลุม (ไม่งั้นยอดเบิ้ล)              */
    const { allRows, noCash, glOnlyN, pvNotInGl } = useMemo(() => {
      const out = [], skip = [];
      const pvDocs = new Set();
      (data.pvVouchers || []).forEach(pv => { const k = cfcT(pv.PL_PV_No).toUpperCase(); if (k) pvDocs.add(k); });
      const glSeen = new Set();

      (data.pvVouchers || []).forEach((pv, i) => {
        const iso = cfcISO(pv.Pmt_Date); if (!iso) return;
        const amt = cfcNum(pv.Net_Amount);
        const docNo = cfcT(pv.PL_PV_No), apNo = cfcT(pv.AP_No);
        // ★ ใบที่ไม่มีเงินออกจากบัญชีบริษัท (ผู้บริหารสำรองจ่ายแทน) ไม่ใช่กระแสเงินสด
        if (!amt) { skip.push({ iso, docNo, payee: cfcT(pv.Payee), gross: cfcNum(pv.Amount), why: cfcT(pv.Type_of_Pmt) }); return; }
        // ★ บัญชีจาก GL ชนะ regex ที่งัดเลขบัญชีจากคำอธิบาย — GL บอกบัญชีมาตรง ๆ ในหัวบล็อก
        const gl = glAcctByDoc[docNo.toUpperCase()];
        if (gl) glSeen.add(docNo.toUpperCase());
        const acc = gl ? { no: gl.acctNo, label: gl.acctLabel } : acctOf(pv.Bank_AC);
        const memo = cfcT(pv.cc_remark || pv.Remark), payee = cfcT(pv.Payee);
        const row = {
          key: 'pv|' + docNo + '|' + apNo + '|' + i, src: 'pv', idx: i, iso,
          docKey: docNo + (apNo ? '|' + apNo : ''),
          docNo, apNo, payee, memo, note: [memo, payee].filter(Boolean).join(' / '),
          out: amt > 0 ? amt : 0, in: amt < 0 ? -amt : 0,
          wht: cfcNum(pv.WHT), gross: cfcNum(pv.Amount),
          acctNo: acc.no, acctLabel: acc.label, acctRaw: cfcT(pv.Bank_AC),
          payType: cfcT(pv.Type_of_Pmt), docSrc: cfcT(pv.Doc_Src), inGl: !!gl,
          matchText: [memo, payee].filter(Boolean).join(' '),
        };
        row.sug = engine(row);
        out.push(row);
      });

      let glOnly = 0;
      glBuckets.forEach(b => (b.lines || []).forEach((L, i) => {
        const docNo = cfcT(L.docNo);
        if (docNo && pvDocs.has(docNo.toUpperCase())) return;    // ใบเดียวกับ PV → ไม่เอามาซ้ำ
        const iso = cfcISO(L.iso); if (!iso) return;
        const inn = cfcNum(L.in), o = cfcNum(L.out);
        if (!inn && !o) return;
        const memo = cfcT(L.memo), payee = cfcT(L.payee);
        const row = {
          key: 'gl|' + b.id + '|' + docNo + '|' + i, src: 'gl', idx: 500000 + cfcNum(L.seq), iso,
          docKey: 'g:' + (docNo || (b.acctKey + ':' + iso + ':' + i)),
          docNo: docNo || '(ไม่มีเลขที่)', apNo: cfcT(L.ref), payee, memo,
          note: [memo, payee].filter(Boolean).join(' / '),
          out: o, in: inn, wht: 0, gross: inn || o,
          acctNo: b.acctNo, acctLabel: b.acctLabel, acctRaw: b.acctNo,
          payType: 'GL', docSrc: 'GL',
          matchText: [memo, payee].filter(Boolean).join(' '),
        };
        row.sug = engine(row);
        out.push(row); glOnly++;
      }));
      extraRows.forEach((e, i) => {
        const iso = cfcISO(e.iso); if (!iso) return;
        const acc = acctOf(e.acctRaw);
        const memo = cfcT(e.memo), payee = cfcT(e.payee), amt = Math.abs(cfcNum(e.amount));
        const row = {
          key: 'ex|' + e.id, src: 'extra', extraId: e.id, idx: 900000 + i, iso,
          docKey: 'x:' + e.id,
          docNo: cfcT(e.docNo) || '(คีย์เอง)', apNo: '', payee, memo,
          note: [memo, payee].filter(Boolean).join(' / '),
          out: e.dir === 'out' ? amt : 0, in: e.dir === 'out' ? 0 : amt,
          wht: 0, gross: amt,
          acctNo: acc.no, acctLabel: acc.label, acctRaw: cfcT(e.acctRaw),
          payType: 'คีย์เอง', docSrc: 'คีย์เอง',
          matchText: [memo, payee].filter(Boolean).join(' '),
        };
        row.sug = engine(row);
        out.push(row);
      });
      out.sort((a, b) => (a.iso !== b.iso ? (a.iso < b.iso ? -1 : 1)
        : (a.acctNo !== b.acctNo ? String(a.acctNo).localeCompare(String(b.acctNo))
        : (Number(a.idx || 0) - Number(b.idx || 0)))));
      /* ★ ใบ PV ที่ "มีเงินออกจริง" + อยู่ในช่วงวันที่ของ GL แต่ไม่โผล่ใน GL = ข้อมูลสองฝั่งไม่ตรงกัน
           BIGDREAM มีบัญชีธนาคารบัญชีเดียว ⇒ ไม่ใช่เรื่อง "จ่ายจากบัญชีอื่น" แต่มักเป็นใบที่ถูก
           ยกเลิก/แก้เลขใน PEAK หลังนำเข้า หรือไฟล์ GL เก่ากว่าข้อมูล PV — ต้องเห็นเป็นรายใบ
           ⚠️ ต้องกรองด้วยช่วงวันที่ของ GL ด้วย ไม่งั้น PV ปีก่อน (ที่ GL ไม่ได้ครอบ) จะถูกนับเป็น
              "หาย" ทั้งที่แค่ยังไม่ได้โหลด GL ปีนั้น */
      let glFrom = '', glTo = '';
      glBuckets.forEach(b => {
        const f = cfcISO(b.from) || (b.ym + '-01'), t = cfcISO(b.to) || (b.ym + '-31');
        if (!glFrom || f < glFrom) glFrom = f;
        if (!glTo || t > glTo) glTo = t;
      });
      const missing = glBuckets.length
        ? out.filter(r => r.src === 'pv' && !r.inGl && r.iso >= glFrom && r.iso <= glTo) : [];
      return { allRows: out, noCash: skip, glOnlyN: glOnly, pvNotInGl: missing };
    }, [data.pvVouchers, extraRows, glBuckets, glAcctByDoc, engine, acctOf]);

    const allYms = useMemo(() => [...new Set(allRows.map(r => String(r.iso).slice(0, 7)))].filter(Boolean).sort().reverse(), [allRows]);
    const allAccts = useMemo(() => {
      const m = {}; allRows.forEach(r => { const k = cfcAcctKey(r.acctNo, r.acctLabel); if (!m[k]) m[k] = { key: k, no: r.acctNo, label: r.acctLabel }; });
      return Object.values(m).sort((a, b) => String(a.label).localeCompare(String(b.label), 'th'));
    }, [allRows]);
    /* ★ ตั้งเดือนล่าสุดให้ "ครั้งแรกที่มีข้อมูล" เท่านั้น — ห้ามผูก ym ไว้ใน deps
         ไม่งั้นพอผู้ใช้เลือก "ทุกเดือน" (ym='') effect จะเด้งกลับไปเดือนล่าสุดทันที
         = ตัวเลือก "ทุกเดือน" กดไม่ติดตลอดกาล (และตัวเทียบยอดกับ GL ซึ่งทำงานเฉพาะ
         ตอนดูทุกเดือน ก็ไม่มีวันโผล่) */
    const ymInit = useRef(false);
    useEffect(() => { if (!ymInit.current && allYms.length) { ymInit.current = true; setYm(allYms[0]); } }, [allYms]);

    const rows = useMemo(() => allRows.filter(r =>
      (!ym || String(r.iso).slice(0, 7) === ym) &&
      (!acct || cfcAcctKey(r.acctNo, r.acctLabel) === acct)), [allRows, ym, acct]);

    const stat = useMemo(() => {
      const s = { n: rows.length, locked: 0, auto: 0, ask: 0, new: 0, inSum: 0, outSum: 0, orphan: 0, orphanNames: [] };
      const known = new Set(master.map(m => m.name));
      rows.forEach(r => {
        // หมวดที่เคยลงไว้ แต่ตอนนี้ไม่มีในผังแล้ว → ยอดจะหายจากงบ ต้องเตือน
        if (r.sug.cat && !known.has(r.sug.cat)) { s.orphan++; if (s.orphanNames.indexOf(r.sug.cat) < 0) s.orphanNames.push(r.sug.cat); }
        s[r.sug.tier]++; s.inSum += r.in; s.outSum += r.out;
      });
      return s;
    }, [rows, master]);

    /* ยอดตามกิจกรรม (เดือนที่กรองอยู่) */
    const actStat = useMemo(() => {
      const o = { op: 0, inv: 0, fin: 0, transfer: 0, none: 0 };
      rows.forEach(r => { const k = r.sug.cat ? (r.sug.act || 'transfer') : 'none'; o[k] = (o[k] || 0) + (r.in - r.out); });
      return o;
    }, [rows]);

    /* ── สรุปรายบัญชี ──
       ต้นงวดของ "เดือนที่เลือก" = ยอดที่คีย์ไว้ + กระแสสะสมของทุกเดือนก่อนหน้า
       (คีย์ต้นงวดครั้งเดียวที่เดือนแรกสุด แล้วเดือนถัด ๆ ไปคำนวณต่อให้เอง) */
    const acctSummary = useMemo(() => {
      const by = {};
      allAccts.forEach(a => { by[a.key] = { key: a.key, no: a.no, label: a.label, before: 0, inSum: 0, outSum: 0, n: 0, uncoded: 0 }; });
      allRows.forEach(r => {
        const k = cfcAcctKey(r.acctNo, r.acctLabel); const g = by[k]; if (!g) return;
        const m = String(r.iso).slice(0, 7);
        if (ym && m < ym) { g.before += r.in - r.out; return; }
        if (ym && m > ym) return;
        g.n++; g.inSum += r.in; g.outSum += r.out;
        if (!r.sug.cat) g.uncoded++;
      });
      const list = Object.values(by).filter(g => !acct || g.key === acct);
      list.forEach(g => {
        /* ★ ยอดยกมาจาก GL ชนะการคีย์มือ — GL คือสมุดบัญชีจริง คีย์เองไว้ใช้ตอนที่ยังไม่มี GL
             (ถ้ามีทั้งคู่แล้วไม่ตรงกัน = ต้องรู้ จึงโชว์ทั้งสองค่าแล้วขึ้นสีแดง) */
        const gl = glAcct[g.key];
        g.glOpen = gl && gl.opening != null ? gl.opening : null;
        g.manOpen = manualOpen[g.key];
        g.baseOpen = g.glOpen != null ? g.glOpen : (g.manOpen == null ? null : cfcNum(g.manOpen));
        g.openSrc = g.glOpen != null ? 'gl' : (g.manOpen == null ? '' : 'manual');
        g.openDiff = (g.glOpen != null && g.manOpen != null) ? (g.glOpen - cfcNum(g.manOpen)) : null;
        g.opening = (g.baseOpen == null ? 0 : g.baseOpen) + g.before;
        g.closing = g.opening + g.inSum - g.outSum;
        /* ปลายงวดตาม GL (ทั้งช่วงที่นำเข้า) — เทียบได้เฉพาะตอนดู "ทุกเดือน" ไม่กรองเดือน */
        g.glClosing = gl ? gl.closing : null;
        g.glDiff = (!ym && gl && g.baseOpen != null) ? (g.closing - gl.closing) : null;
      });
      const tot = list.reduce((a, g) => ({
        opening: a.opening + g.opening, inSum: a.inSum + g.inSum, outSum: a.outSum + g.outSum,
        closing: a.closing + g.closing, n: a.n + g.n, uncoded: a.uncoded + g.uncoded,
        keyed: a.keyed + (g.baseOpen == null ? 0 : 1),
        openBad: a.openBad + (g.openDiff != null && Math.abs(g.openDiff) > 0.02 ? 1 : 0),
        glBad: a.glBad + (g.glDiff != null && Math.abs(g.glDiff) > 0.02 ? 1 : 0),
        glOk: a.glOk + (g.glDiff != null && Math.abs(g.glDiff) <= 0.02 ? 1 : 0),
      }), { opening: 0, inSum: 0, outSum: 0, closing: 0, n: 0, uncoded: 0, keyed: 0, openBad: 0, glBad: 0, glOk: 0 });
      return { list, tot };
    }, [allRows, allAccts, ym, acct, manualOpen, glAcct]);

    /* ยอดเงินสดต้นงวดรวมของ "ขอบเขตที่กรองอยู่" — ใช้เป็นบรรทัดต้นงวด/ปลายงวดในงบที่ส่งออก
       ★ ต้องเป็นตัวเดียวกับที่ตาราง "สรุปรายบัญชี" โชว์ ไม่งั้นไฟล์กับหน้าจอไม่ตรงกัน
       ยังไม่คีย์สักบัญชี = null (ไม่พิมพ์บรรทัดต้นงวด/ปลายงวดเลย ดีกว่าพิมพ์ 0 ให้เข้าใจผิดว่าเงินหมด) */
    const openingForExport = acctSummary.tot.keyed ? acctSummary.tot.opening : null;

    const shown = useMemo(() => {
      const needle = cfcNorm(q);
      return rows.filter(r => {
        if (tab !== 'all' && r.sug.tier !== tab) return false;
        if (!needle) return true;
        return cfcNorm([r.docNo, r.apNo, r.note, r.payee, r.sug.cat, r.acctLabel].join(' ')).includes(needle);
      });
    }, [rows, tab, q]);

    /* กลุ่มตามผู้รับเงิน — ข้อมูลของ modal "ลงหมวดตามผู้รับเงิน" */
    const payeeGroups = useMemo(() => {
      const by = {};
      rows.forEach(r => {
        const k = cfcVendorKey(r.payee) || ('#' + cfcNorm(r.payee));
        const g = by[k] || (by[k] = { key: k, payee: r.payee, rows: [], net: 0, uncoded: 0, curCats: [], sample: '' });
        g.rows.push(r); g.net += r.in - r.out;
        if (!r.sug.cat) g.uncoded++;
        else if (g.curCats.indexOf(r.sug.cat) < 0) g.curCats.push(r.sug.cat);
        if (!g.sample && r.memo) g.sample = r.memo;
      });
      return Object.values(by).sort((a, b) => (b.uncoded - a.uncoded) || (Math.abs(b.net) - Math.abs(a.net)));
    }, [rows]);

    /* ── เขียนกฎ (= การยืนยันของคน) ── */
    function learn(nextRulesMap, msg) {
      const next = Object.assign({}, store, { rules: { map: nextRulesMap, at: new Date().toISOString() } });
      persist(next).then(r => toast && toast(msg + (r.shared ? ' · แชร์ทั้งทีมแล้ว' : ' · บันทึกในเครื่อง'), r.shared ? undefined : 'error'));
    }
    /* ชื่อคนที่ยืนยัน — อ่านจาก session เหมือน cfpCurrentUser() (WTPAuth ของ BIGDREAM
       ไม่มี currentUser() ให้เรียก มีแต่ role()/can()/canViewPage()) */
    const whoAmI = () => {
      try { const s = JSON.parse(localStorage.getItem('bdh-session') || 'null'); return s ? (s.displayName || s.username || '') : ''; }
      catch (e) { return ''; }
    };
    /* บวกกฎ 1 ข้อเข้า map (นับซ้ำเมื่อหมวดเดิม · รีเซ็ตเป็น 1 เมื่อเปลี่ยนหมวด) */
    function bump(map, key, cat, by, at) {
      const cur = map[key];
      map[key] = { cat, n: (cur && cur.cat === cat ? (Number(cur.n) || 1) : 0) + 1, by, at };
    }
    function applyCat(map, row, cat, by, at) {
      map['doc:' + row.docKey] = { cat, n: 1, by, at };
      const tk = cfcNorm(row.matchText); if (tk) bump(map, 'text:' + tk, cat, by, at);
      const mk = cfcNorm(row.memo || ''); if (mk.length > 3) bump(map, 'memo:' + mk, cat, by, at);
      const vk = cfcVendorKey(row.payee || ''); if (vk.length > 3) bump(map, 'vendor:' + vk, cat, by, at);
    }
    function confirmRow(row, cat) {
      if (!canEdit) return;
      const map = Object.assign({}, rules);
      /* เลือก "— ยังไม่ลงหมวด —" = ยกเลิกการยืนยันของใบนี้ ไม่ใช่ล็อกให้ว่าง
         ⇒ ระบบจะกลับไปเสนอหมวดจากกฎคู่ค้า/คำอธิบายเหมือนเดิม (บอกให้ตรงกับที่เกิดขึ้นจริง
         ไม่งั้นผู้ใช้กดล้างแล้วเห็นหมวดเด้งกลับมา จะนึกว่าระบบไม่ยอมบันทึก) */
      if (!cat) { delete map['doc:' + row.docKey]; learn(map, 'ยกเลิกการยืนยันของ ' + row.docNo + ' แล้ว — ระบบจะกลับไปเสนอหมวดเอง'); return; }
      applyCat(map, row, cat, whoAmI(), new Date().toISOString());
      learn(map, 'บันทึก "' + cat + '" + จำไว้ใช้ครั้งหน้าแล้ว');
    }
    function acceptAllAuto() {
      if (!canEdit) return;
      const cand = rows.filter(r => r.sug.tier === 'auto' && r.sug.cat);
      if (!cand.length) { toast && toast('ไม่มีรายการที่ระบบมั่นใจรออยู่'); return; }
      if (!confirm('ยืนยันหมวดที่ระบบเสนอ ' + cand.length + ' รายการ (เฉพาะที่ขึ้นว่า "มั่นใจ")?\nยืนยันแล้วระบบจะจำไว้ใช้กับเดือนถัดไป')) return;
      const map = Object.assign({}, rules), by = whoAmI(), at = new Date().toISOString();
      cand.forEach(r => applyCat(map, r, r.sug.cat, by, at));
      learn(map, 'ยืนยัน ' + cand.length + ' รายการแล้ว');
    }
    /* ลงหมวดทั้งคู่ค้า — ทางลัดของเดือนแรกที่ยังไม่มีกฎเลย */
    function applyPayeeBulk(pick) {
      if (!canEdit) return;
      const map = Object.assign({}, rules), by = whoAmI(), at = new Date().toISOString();
      let n = 0, v = 0;
      payeeGroups.forEach(g => {
        const cat = pick[g.key]; if (!cat) return;
        v++;
        g.rows.forEach(r => { applyCat(map, r, cat, by, at); n++; });
      });
      setBulk(false);
      if (!n) { toast && toast('ยังไม่ได้เลือกหมวดให้ผู้รับเงินคนไหน'); return; }
      learn(map, 'ลงหมวด ' + n + ' รายการ จาก ' + v + ' ผู้รับเงินแล้ว');
    }

    /* ── ผังหมวด: บันทึก / แก้ / ลบ ── */
    function persistMaster(items, msg, extra) {
      const at = new Date().toISOString();
      const next = Object.assign({}, store, { master: { items, at } }, extra || {});
      return persist(next).then(r => {
        toast && toast(msg + (r.shared ? ' · แชร์ทั้งทีม' : ' · บันทึกในเครื่อง'), r.shared ? undefined : 'error');
        return r;
      });
    }
    /* กฎที่เรียนไว้เก็บ "ชื่อหมวด" ตรง ๆ ⇒ เปลี่ยนชื่อ/ลบหมวด ต้องกวาดกฎตามทุกครั้ง
       ไม่งั้นรายการที่เคยลงหมวดนี้กลายเป็นหมวดผี — ยอดไม่เข้าบรรทัดไหนในงบ
       และไม่ถูกนับว่า "ยังไม่ลงหมวด" ด้วย (เงียบสนิท) */
    function remapRuleCat(from, to) {
      const map = {}; let n = 0;
      Object.keys(rules).forEach(k => {
        const v = rules[k];
        if (v && v.cat === from) { n++; if (to) map[k] = Object.assign({}, v, { cat: to }); return; }
        map[k] = v;
      });
      return { map, n };
    }
    function saveNewCat({ name, act, group, flow }) {
      persistMaster(cfcInsertCat(master.slice(), { name, act, group, flow }), 'เพิ่มหมวด "' + name + '" แล้ว');
    }
    function saveCatEdit(oldName, row) {
      const cur = master.find(m => m.name === oldName);
      if (!cur) return;
      const next = Object.assign({}, cur, row);
      const samePlace = cur.act === row.act && cur.group === row.group && cfcFlowOf(cur) === cfcFlowOf(next);
      /* ย้ายกิจกรรม/กลุ่ม/ฝั่งเงิน = ต้องเรียงตำแหน่งใหม่ · แก้แค่ชื่อ = แทนที่กับที่ (แถวในงบไม่ขยับ) */
      const items = samePlace
        ? master.map(m => (m.name === oldName ? next : m))
        : cfcInsertCat(master.filter(m => m.name !== oldName), next);
      const extra = {}; let moved = 0;
      if (row.name !== oldName) {
        const r = remapRuleCat(oldName, row.name);
        moved = r.n;
        if (moved) extra.rules = { map: r.map, at: new Date().toISOString() };
      }
      persistMaster(items, 'แก้หมวดเป็น "' + row.name + '" แล้ว' + (moved ? ' · ย้ายกฎที่เรียนไว้ ' + moved + ' ข้อ' : ''), extra);
    }
    function saveCatDelete(name, moveTo) {
      const items = master.filter(m => m.name !== name);
      const r = remapRuleCat(name, moveTo || '');
      const extra = r.n ? { rules: { map: r.map, at: new Date().toISOString() } } : null;
      const tail = !r.n ? ''
        : (moveTo ? ' · ย้ายกฎ ' + r.n + ' ข้อไป "' + moveTo + '"'
                  : ' · ล้างกฎ ' + r.n + ' ข้อ (รายการกลับเป็นยังไม่ลงหมวด)');
      persistMaster(items, 'ลบหมวด "' + name + '" แล้ว' + tail, extra);
    }
    function exportChart() {
      const wb = XLSX.utils.book_new();
      const aoa = cfcChartAoa(master);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 34 }, { wch: 44 }];
      xsRow(ws, 0, 4, { font: { name: XS_FONT, sz: 10.5, bold: true, color: { rgb: 'FFFFFF' } },
        fill: { patternType: 'solid', fgColor: { rgb: XS.brand } },
        alignment: { horizontal: 'center', vertical: 'center' }, border: xsBox() });
      for (let r = 1; r < aoa.length; r++) xsRow(ws, r, 4, { font: { name: XS_FONT, sz: 10, color: { rgb: XS.ink } }, border: xsBox() });
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, 'ผังหมวด');
      XLSX.writeFile(wb, 'BDH-ผังหมวดงบกระแสเงินสด.xlsx');
      toast && toast('ส่งออกผังหมวด ' + master.length + ' รายการ — แก้แล้วนำเข้ากลับได้เลย');
    }
    async function importChart(file) {
      setBusy('กำลังอ่านผังหมวด…');
      try {
        const wb = await cfcReadWorkbook(file);
        let best = null;
        wb.SheetNames.forEach(sn => {
          const p = cfcParseChartAoa(cfcAoa(wb.Sheets[sn]));
          if (!p.error && (!best || p.items.length > best.items.length)) best = p;
        });
        setBusy('');
        if (!best) { toast && toast('อ่านไม่ออก — ต้องมีคอลัมน์ "กิจกรรม" และ "ชื่อหมวด" (กด ⬇️ ส่งออกผัง เพื่อดูรูปแบบ)', 'error'); return; }
        /* หมวดเดิมที่ไฟล์ใหม่ไม่มี "และมีกฎลงไว้แล้ว" = ยอดจะหลุดจากงบ → ต้องถามก่อน */
        const keep = {}; best.items.forEach(m => { keep[cfcNorm(m.name)] = 1; });
        const used = cfcRuleCatCount(rules);
        const lost = master.filter(m => !keep[cfcNorm(m.name)] && used[m.name]);
        if (lost.length) {
          const list = lost.slice(0, 8).map(m => '• ' + m.name + ' (' + used[m.name] + ' กฎ)').join('\n');
          const more = lost.length > 8 ? '\n…และอีก ' + (lost.length - 8) + ' หมวด' : '';
          if (!confirm('ผังใหม่ไม่มี ' + lost.length + ' หมวดที่ใช้งานอยู่:\n' + list + more
            + '\n\nนำเข้าต่อ = หมวดพวกนี้หายจากผัง และยอดของรายการที่ลงหมวดไว้จะไม่เข้าบรรทัดไหนในงบ\nไปต่อไหม?')) return;
        }
        persistMaster(cfcWithExtraCats(best.items), 'นำเข้าผังหมวด ' + best.items.length + ' รายการแล้ว');
      } catch (e) { setBusy(''); toast && toast('อ่านไฟล์ไม่สำเร็จ: ' + (e && e.message || ''), 'error'); }
    }

    /* ── นำเข้า GL (รายงานบัญชีแยกประเภท ของ PEAK) ────────────────────────
       1 ไฟล์ = 1 บัญชีธนาคาร · เลือกหลายไฟล์พร้อมกันได้ (บัญชีละไฟล์)
       ★ นำเข้าซ้ำบัญชี+เดือนเดิม = ทับของเดิม ไม่บวกเพิ่ม ⇒ โหลด GL ใหม่ทุกเดือนได้เรื่อย ๆ
       ⚠️ ลบบัคเก็ตเดือนเก่าของ "บัญชีเดียวกันที่อยู่ในช่วงวันที่ของไฟล์" ก่อนเสมอ —
          ไม่งั้นรายการที่ถูกลบ/แก้ใน PEAK จะค้างอยู่ในระบบตลอดกาล */
    async function onGlFiles(files) {
      if (!files || !files.length) return;
      if (!window.PeakImport || !window.PeakImport.readGL) {
        toast && toast('ยังไม่ได้โหลด app/peak_import.js — ตรวจลำดับ <script> ใน index.html', 'error'); return;
      }
      setBusy('กำลังอ่านไฟล์ GL…');
      const next = Object.assign({}, store); const notes = [];
      try {
        for (const f of Array.from(files)) {
          const wb = await cfcReadWorkbook(f);
          let res = null;
          for (const sn of wb.SheetNames) {
            const r = window.PeakImport.readGL(wb.Sheets[sn]);
            if (r && r.ok && r.accounts.length) { res = r; break; }
            if (r && !r.ok && !res) res = r;
          }
          if (!res) { notes.push('❌ ' + f.name + ' — ไม่ใช่ไฟล์ของ PEAK'); continue; }
          if (!res.ok) { notes.push('❌ ' + f.name + ' — ' + res.message); continue; }
          res.accounts.forEach(a => {
            const key = cfcAcctKey(a.acctNo, a.alias || a.code);
            const acc = acctOf(a.acctNo);
            const label = (a.acctNo && acc.no ? acc.label : (cfcT(a.bankName) || a.alias || a.code)
              + (cfcDigits(a.acctNo) ? ' ···' + cfcDigits(a.acctNo).slice(-4) : ''));
            const byYm = {};
            a.lines.forEach(L => { const k = String(L.iso).slice(0, 7); if (k) (byYm[k] = byYm[k] || []).push(L); });
            const yms = Object.keys(byYm).sort();
            // ทิ้งบัคเก็ตเดิมของบัญชีนี้ที่อยู่ในช่วงวันที่ของไฟล์ (กันรายการที่ถูกลบใน PEAK ค้าง)
            const fromYm = String(a.from || (yms[0] || '')).slice(0, 7);
            const toYm = String(a.to || (yms[yms.length - 1] || '')).slice(0, 7);
            Object.keys(next).forEach(id => {
              if (id.indexOf('gl:' + key + ':') !== 0) return;
              const m = id.slice(('gl:' + key + ':').length);
              if (fromYm && toYm && m >= fromYm && m <= toYm) delete next[id];
            });
            yms.forEach(k => {
              next['gl:' + key + ':' + k] = {
                acctKey: key, acctCode: a.code, alias: a.alias, acctNo: a.acctNo,
                bankName: a.bankName, acctLabel: label, ym: k,
                // ยอดยกมาติดกับเดือนแรกของช่วงที่ส่งออกเท่านั้น
                opening: (k === yms[0] && a.opening != null) ? a.opening : null,
                from: a.from, to: a.to,
                lines: byYm[k], uploadedAt: new Date().toISOString(), file: f.name,
              };
            });
            const din = a.lines.reduce((s, L) => s + cfcNum(L.in), 0);
            const dout = a.lines.reduce((s, L) => s + cfcNum(L.out), 0);
            notes.push('✅ ' + f.name + ' — ' + label + ' (' + a.code + '/' + a.alias + '): '
              + a.lines.length + ' รายการ · ' + yms.join(', ')
              + (a.opening != null ? ' · ยอดยกมา ' + cfcMoney(a.opening) : ' · ไม่มียอดยกมาในไฟล์')
              + ' · รับ ' + cfcMoney(din) + ' / จ่าย ' + cfcMoney(dout)
              + ' · ปลายงวด ' + cfcMoney((a.opening || 0) + din - dout));
          });
          (res.skipped || []).forEach(a => notes.push('⏭ ข้ามบัญชี ' + a.code + ' ' + a.alias + ' — ไม่ใช่บัญชีเงินฝากธนาคาร'));
        }
        if (!notes.some(n => n[0] === '✅')) { setBusy(''); toast && toast(notes.join('\n') || 'ไม่มีอะไรให้นำเข้า', 'error'); return; }
        const r = await persist(next);
        setBusy('');
        toast && toast(notes.join('\n') + (r.shared ? '\nแชร์ทั้งทีมแล้ว' : '\nบันทึกในเครื่อง'),
          notes.some(n => n[0] === '❌') ? 'error' : undefined);
      } catch (e) { setBusy(''); toast && toast('อ่านไฟล์ไม่สำเร็จ: ' + (e && e.message || ''), 'error'); }
    }
    function clearGl() {
      if (!canEdit || !glBuckets.length) return;
      if (!confirm('ลบบรรทัด GL ที่นำเข้าไว้ทั้งหมด ' + glBuckets.length + ' ก้อน?\n'
        + 'หมวดที่ยืนยันไว้ยังอยู่ (เก็บแยกในกฎ) — นำเข้า GL ใหม่แล้วจะกลับมาเหมือนเดิม')) return;
      const next = Object.assign({}, store);
      glBuckets.forEach(b => { delete next[b.id]; });
      persist(next).then(r => toast && toast('ลบ GL ที่นำเข้าไว้แล้ว', r.shared ? undefined : 'error'));
    }

    /* ── รายการนอก PV + ยอดต้นงวด ── */
    function saveExtraRow(r) {
      if (!canEdit) return;
      const id = r.id || cfcUid();
      const row = { id, iso: cfcISO(r.iso), docNo: cfcT(r.docNo), payee: cfcT(r.payee), memo: cfcT(r.memo),
        acctRaw: cfcT(r.acctRaw), dir: r.dir === 'out' ? 'out' : 'in', amount: Math.abs(cfcNum(r.amount)) };
      const list = extraRows.filter(x => x.id !== id).concat([row]);
      const next = Object.assign({}, store, { extra: { rows: list, at: new Date().toISOString() } });
      setExtraEdit(null);
      persist(next).then(x => toast && toast((r.id ? 'แก้ไข' : 'เพิ่ม') + 'รายการนอก PV แล้ว' + (x.shared ? ' · แชร์ทั้งทีม' : ' · บันทึกในเครื่อง'), x.shared ? undefined : 'error'));
    }
    function deleteExtraRow(id) {
      if (!canEdit) return;
      const map = Object.assign({}, rules); delete map['doc:x:' + id];
      const next = Object.assign({}, store,
        { extra: { rows: extraRows.filter(x => x.id !== id), at: new Date().toISOString() } },
        { rules: { map, at: new Date().toISOString() } });
      setExtraEdit(null);
      persist(next).then(x => toast && toast('ลบรายการแล้ว' + (x.shared ? ' · แชร์ทั้งทีม' : ' · บันทึกในเครื่อง'), x.shared ? undefined : 'error'));
    }
    function saveOpening(key, value) {
      if (!canEdit) return;
      const cur = Object.assign({}, manualOpen);
      if (value == null || value === '') delete cur[key]; else cur[key] = value;
      const next = Object.assign({}, store, { manual: { opening: cur, at: new Date().toISOString() } });
      persist(next).then(r => toast && toast('บันทึกยอดต้นงวดแล้ว', r.shared ? undefined : 'error'));
    }

    /* ── สร้าง AOA ทั้ง 2 ชีตไว้ที่เดียว — ปุ่มส่งออกไฟล์กับปุ่มดันขึ้นหน้า Cash Flow ใช้ชุดเดียวกัน ── */
    function buildSheets() {
      const months = [...new Set(rows.map(r => String(r.iso).slice(0, 7)))].sort();
      // ★ กันข้อมูลเก่าที่ ym เป็นปี พ.ศ. ('2569-05') → ป้ายจะกลายเป็น "พ.ค. 612"
      const monLabel = (m) => {
        const p = String(m).split('-'); const y = Number(p[0]);
        return (CFC_MONTH_TH[+p[1]] || p[1]) + ' ' + ((y > 2400 ? y : y + 543) - 2500);
      };
      const stmAoa = [CFC_DETAIL_HEAD.slice()];
      rows.forEach((r, i) => stmAoa.push([
        i + 1, r.acctLabel || '', r.acctNo || '', cfcThaiDate(r.iso), r.docNo || '', r.apNo || '', r.payee || '',
        r.out || '', r.in || '', r.payType || '', r.memo || r.note || '',
        r.sug.cat || '', CFC_ACT_TH[r.sug.act] === undefined ? '' : CFC_ACT_TH[r.sug.act],
      ]));
      const cell = {}; let uncodedTot = 0;
      rows.forEach(r => {
        const m = String(r.iso).slice(0, 7), v = r.in - r.out;
        const k = (r.sug.cat || '(ยังไม่ลงหมวด)') + '|' + m;
        cell[k] = (cell[k] || 0) + v;
        if (!r.sug.cat) uncodedTot++;
      });
      const sumAoa = cfcSummaryAoa(master, months, cell, monLabel, [...new Set(rows.map(r => r.sug.cat).filter(Boolean))], openingForExport);
      return { months, monLabel, stmAoa, sumAoa, uncodedTot, cell };
    }

    /* ส่งขึ้นหน้า "Executive Cash Flow" ตรง ๆ — ไม่ต้องดาวน์โหลดแล้วอัปกลับ
       ★ ส่ง AOA ผ่านตัวอ่านของหน้านั้นเอง (cfpParseStm / cfpParseSummary) ⇒ ผลลัพธ์
         เหมือนกับอัปไฟล์มือเป๊ะ ไม่ต้องมีตัวแปลงชุดที่สอง */
    async function sendToCashflow() {
      if (!rows.length) { toast && toast('ยังไม่มีรายการให้ส่ง'); return; }
      if (typeof cfpParseStm !== 'function' || typeof cfpParseSummary !== 'function') {
        toast && toast('เปิดหน้า "Executive Cash Flow" สักครั้งก่อน แล้วลองใหม่', 'error'); return;
      }
      setPushAsk(false);
      setBusy('กำลังส่งขึ้นหน้า Cash Flow…');
      try {
        const built = buildSheets();
        const fresh = cfpParseStm(built.stmAoa);          // รายการของ "เดือนที่เลือก" (ผ่านตัวอ่านของหน้านั้น)
        const prev = (await WTPData.fetchSheetRows(CFP_TABLE).catch(() => []))[0];
        const old = (prev && (prev.data || prev)) || {};
        /* ★ แทนที่เฉพาะเดือนที่ส่ง — เดือนอื่นที่เคยดันไว้ต้องอยู่ครบ
           (ดันเดือนเดิมซ้ำ = ทับของเดิม ไม่บวกเพิ่ม จึงแก้แล้วดันใหม่ได้เรื่อย ๆ) */
        const sendMonths = new Set(built.months);
        /* ⚠️ ต้องยุบ พ.ศ. → ค.ศ. "ก่อน" กรองเดือน — ข้อมูลเก่าที่อัปไว้ก่อนแก้บั๊กเก็บ iso เป็นปี พ.ศ.
           ('2569-05-05') ⇒ เทียบกับเดือนที่กำลังส่ง ('2026-05') ไม่มีวันตรง ดันซ้ำเท่าไรก็ไม่ทับ
           ของเดิม กลายเป็น "เดือนเดียวกันมี 2 คอลัมน์ ยอดเบิ้ล" + ป้ายเดือนเป็น "612" */
        const rawOld = (old.stm && old.stm.txns) || [];
        const healed = (typeof cfpFixEraTxns === 'function' ? cfpFixEraTxns(rawOld) : rawOld)
          .map((t, i) => ({ row: t, wasBE: String(t.iso) !== String(rawOld[i] && rawOld[i].iso) }));
        /* ★ ล้างของซ้ำที่บั๊กเดิมทิ้งไว้: แถวปี พ.ศ. ที่ตรงกับแถวปี ค.ศ. ทุกอย่าง = รายการเดียวกัน
           ที่เคยถูกนับ 2 ครั้งเพราะปีคนละศักราช → ทิ้งฝั่ง พ.ศ. (ทิ้งเฉพาะแถวที่ถูกแปลงศักราช) */
        const dupKey = t => [t.account, String(t.iso).slice(0, 10), t.docNo || '',
          Math.round((t.flow || 0) * 100)].join('|');
        const ceKeys = new Set(); healed.forEach(h => { if (!h.wasBE) ceKeys.add(dupKey(h.row)); });
        let dupDropped = 0;
        const kept = healed.filter(h => {
          if (h.wasBE && ceKeys.has(dupKey(h.row))) { dupDropped++; return false; }
          return !sendMonths.has(String(h.row.iso).slice(0, 7));
        }).map(h => h.row);
        const allTxns = kept.concat(fresh.txns).sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
        /* ⚠️⚠️ กติกาหลักของปุ่มนี้: "ดันเดือนไหน แตะเฉพาะคอลัมน์เดือนนั้น"
           งบที่เก็บไว้อาจมาจากไฟล์ CASH FLOW ที่อัปเอง (ปรับด้วยมือมาแล้ว) ⇒ คิดงบใหม่จากรายการ
           ทั้งหมด = เดือนเก่าเปลี่ยนยกแผง ทั้งที่ผู้ใช้สั่งดันแค่เดือนเดียว */
        const oldSum = old.summary || null;
        const oldMonthCol = {};
        ((oldSum && oldSum.monthLabels) || []).forEach((lb, i) => {
          const y = cfcYmOfMonthLabel(lb); if (y) oldMonthCol[y] = i;
        });
        const oldRowVal = {}, oldRowAll = {};
        ((oldSum && oldSum.rows) || []).forEach(r => {
          const k = cfcCanonRowLabel(r.label);
          oldRowAll[k] = r.vals || [];
          if (r.type === 'leaf') oldRowVal[k] = r.vals || [];
        });
        /* ★ ยอดต้นงวดมาจากที่คีย์ไว้เท่านั้น — PEAK ไม่มียอดคงเหลือรายบรรทัด
             (ชีตรายละเอียดจึงไม่มีคอลัมน์ "ยอดคงเหลือ" ⇒ ตัวอ่านคืน openingByAcct ว่าง)
           ⚠️ อ่านจากทะเบียนบัญชี "ทั้งหมด" ไม่ใช่ acctSummary ที่ถูกตัวกรองบัญชีบนหน้าจอหั่นไว้
              — payload ที่ส่งขึ้นไปมีทุกเดือนทุกบัญชี ต้นงวดจึงต้องครบทุกบัญชีด้วย
           ★ ใช้ manOpen ดิบ (= ยอด ณ เดือนแรกสุดของทั้งชุด) ไม่ใช่ยอดต้นเดือนที่กรองอยู่
              เพราะ stm.txns ที่ส่งไปคือรายการ "ทุกเดือน" */
        /* ★ ที่มาของยอดต้นงวดต้องชุดเดียวกับตาราง "สรุปรายบัญชี" คือ GL ก่อน แล้วค่อยที่คีย์เอง
             (เคยอ่านเฉพาะที่คีย์เอง → พอยอดยกมามาจาก GL แล้ว payload ที่ดันขึ้นไปได้ต้นงวด 0
              หน้า Executive Cash Flow เลยโชว์เงินสดต้นงวด/ปลายงวดผิดแบบเงียบ ๆ) */
        const openingByAcct = {};
        allAccts.forEach(a => {
          const g = glAcct[a.key];
          const v = (g && g.opening != null) ? g.opening
            : (manualOpen[a.key] == null ? null : cfcNum(manualOpen[a.key]));
          if (v != null) openingByAcct[a.label] = v;
        });
        const opening = Object.keys(openingByAcct).length
          ? Object.keys(openingByAcct).reduce((a, k) => a + openingByAcct[k], 0) : 0;
        const stm = { txns: allTxns, opening, openingByAcct };
        // คอลัมน์เดือน = เดือนที่มีรายการ + เดือนที่งบเดิมมีอยู่ (เดือนเก่าห้ามหายไปเฉย ๆ)
        const allMonths = [...new Set(allTxns.map(t => String(t.iso).slice(0, 7))
          .concat(Object.keys(oldMonthCol)))].sort();
        /* ตัวอ่านตั้งชื่อแถวที่ไม่มีหมวดว่า "(ไม่ระบุหมวด)" แต่บรรทัดตรวจในงบชื่อ "(ยังไม่ลงหมวด)"
           ไม่แปลงชื่อ = บรรทัดตรวจโชว์ 0 ทั้งที่มีรายการค้างอยู่จริง */
        const catOf = c => (!c || c === '(ไม่ระบุหมวด)') ? '(ยังไม่ลงหมวด)' : c;
        const cell = {}; const keptMonths = [];
        allMonths.forEach(m => {
          if (!sendMonths.has(m) && oldMonthCol[m] != null) {
            keptMonths.push(m);                       // ★ ยกตัวเลขเดิมมาทั้งคอลัมน์ ห้ามคิดใหม่
            Object.keys(oldRowVal).forEach(lab => {
              const v = cfcNum(oldRowVal[lab][oldMonthCol[m]]);
              if (v) cell[lab + '|' + m] = v;
            });
            return;
          }
          allTxns.forEach(t => {
            if (String(t.iso).slice(0, 7) !== m) return;
            const k = catOf(t.category) + '|' + m;
            cell[k] = (cell[k] || 0) + (t.flow || 0);
          });
        });
        const usedCats = [...new Set(allTxns.map(t => catOf(t.category)).concat(Object.keys(oldRowVal)))];
        /* ต้นงวดของเดือนแรก: ไม่ได้ส่งเดือนแรก → ใช้ค่าเดิมของงบ */
        const oldBf = ((oldSum && oldSum.rows) || []).find(r => /เงินสดต้นงวด/.test(String(r.label)));
        const m0 = allMonths[0];
        let openTotal = Object.keys(openingByAcct).length ? opening : null;
        if (m0 && !sendMonths.has(m0) && oldBf && oldMonthCol[m0] != null) openTotal = cfcNum((oldBf.vals || [])[oldMonthCol[m0]]);
        const sumAoa = cfcSummaryAoa(master, allMonths, cell, built.monLabel, usedCats, openTotal);
        cfcApplyOldColumns(sumAoa, allMonths, new Set(keptMonths), oldRowAll, oldMonthCol);
        const summary = cfpParseSummary(sumAoa);
        const payload = Object.assign({}, old, {
          id: (typeof CFP_ROW_ID === 'string' ? CFP_ROW_ID : 'current'),
          uploadedAt: Date.now(),
          uploadedBy: (typeof cfpCurrentUser === 'function' ? cfpCurrentUser() : '') + ' (จากหน้างบกระทบยอดกระแสเงินสด)',
          stm, summary,
        });
        await WTPData.writeTable(CFP_TABLE, [payload], r => r.id);
        try { localStorage.setItem('bdh-cfpresent-v1', JSON.stringify(payload)); } catch (e) {}
        setBusy('');
        const replaced = ((old.stm && old.stm.txns) || []).length - kept.length;
        toast && toast('ส่งขึ้นหน้า Cash Flow แล้ว · เดือน ' + built.months.join(', ') + ' ' +
          (replaced ? '(แทนที่ของเดิม ' + replaced + ' รายการ)' : '(เพิ่มใหม่)') +
          ' · รวมทั้งหมด ' + allTxns.length + ' รายการ / ' + allMonths.length + ' เดือน' +
          (keptMonths.length ? ' · คงตัวเลขเดิมของอีก ' + keptMonths.length + ' เดือน (' + keptMonths.map(built.monLabel).join(', ') + ')' : '') +
          (dupDropped ? ' · ล้างรายการซ้ำจากข้อมูลเก่า (ปี พ.ศ.) ' + dupDropped + ' รายการ' : ''));
      } catch (e) { setBusy(''); toast && toast('ส่งไม่สำเร็จ: ' + (e && e.message || ''), 'error'); }
    }

    /* ส่งออก 3 ชีตในไฟล์เดียว
         1) งบกระแสเงินสด    = หมวด × เดือน เรียงตามผังทุกบรรทัด (วางในไฟล์ CASH FLOW ได้เลย)
         2) รายละเอียดทุกรายการ = ทุกใบที่ลงรหัสแล้ว
         3) สรุปรายบัญชี      = ต้นงวด + รับ − จ่าย = ปลายงวด ต่อบัญชี (ตรวจว่าครบไหม)  */
    function exportSheet() {
      if (!rows.length) { toast && toast('ยังไม่มีรายการให้ส่งออก'); return; }
      const { months, monLabel, stmAoa, sumAoa, uncodedTot } = buildSheets();
      const wb = XLSX.utils.book_new();
      const stamp = new Date().toLocaleString('th-TH-u-ca-gregory');
      const scope = (acct ? '1 บัญชี' : allAccts.length + ' บัญชี');

      const nCol = months.length + 2;
      sumAoa[2] = [String(sumAoa[2][0]) + ' · ' + rows.length + ' รายการ · ' + scope];
      const ws1 = XLSX.utils.aoa_to_sheet(sumAoa);
      ws1['!cols'] = [{ wch: 52 }].concat(months.map(() => ({ wch: 16 }))).concat([{ wch: 17 }]);
      cfcStyleSummary(ws1, sumAoa, nCol);
      XLSX.utils.book_append_sheet(wb, ws1, 'งบกระแสเงินสด');

      const ws2 = XLSX.utils.aoa_to_sheet(stmAoa);
      ws2['!cols'] = [{ wch: 6 }, { wch: 24 }, { wch: 16 }, { wch: 11 }, { wch: 15 }, { wch: 17 }, { wch: 34 },
        { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 46 }, { wch: 34 }, { wch: 22 }];
      cfcStyleDetail(ws2, stmAoa);
      XLSX.utils.book_append_sheet(wb, ws2, 'รายละเอียดทุกรายการ');

      const s3 = [['สรุปรายบัญชี — ยอดต้นงวด + รับ − จ่าย = ยอดปลายงวด'],
        ['ยอดต้นงวดมาจากที่คีย์ไว้ในหน้าจอ (PEAK ไม่ส่งยอดคงเหลือมาให้) · ' + scope + ' · '
          + (ym || 'ทุกเดือน') + ' · สร้าง ' + stamp], [],
        ['บัญชีธนาคาร', 'เลขที่บัญชี', 'เดือน', 'ยอดต้นงวด', 'รับ', 'จ่าย', 'ยอดปลายงวด', 'จำนวนรายการ', 'ยังไม่ลงหมวด']];
      acctSummary.list.forEach(g => s3.push([g.label || '', g.no || '', ym || 'ทุกเดือน',
        g.opening, g.inSum, g.outSum, g.closing, g.n, g.uncoded]));
      s3.push([]);
      s3.push(['รวมทุกบัญชี', '', '', acctSummary.tot.opening, acctSummary.tot.inSum, acctSummary.tot.outSum,
        acctSummary.tot.closing, acctSummary.tot.n, acctSummary.tot.uncoded]);
      const ws3 = XLSX.utils.aoa_to_sheet(s3);
      ws3['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 17 }, { wch: 16 }, { wch: 16 }, { wch: 17 }, { wch: 13 }, { wch: 13 }];
      cfcStyleCheck(ws3, s3, [8]);   // "ยังไม่ลงหมวด" ที่ไม่เป็นศูนย์ = ต้องไปไล่เก็บ
      XLSX.utils.book_append_sheet(wb, ws3, 'สรุปรายบัญชี');

      XLSX.writeFile(wb, 'BDH-งบกระแสเงินสด-' + (ym || 'ทุกเดือน') + '.xlsx');
      toast && toast('ส่งออก ' + rows.length + ' รายการ · ' + acctSummary.list.length + ' บัญชี · 3 ชีต'
        + (uncodedTot ? ' · ⚠️ ยังไม่ลงหมวด ' + uncodedTot + ' รายการ' : ''),
        uncodedTot ? 'error' : undefined);
    }

    /* ══════ render ══════ */
    const card = { background: C.card, border: '1px solid ' + C.line, borderRadius: 14, boxShadow: C.shadow };
    const btn = (primary) => ({
      cursor: 'pointer', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 600,
      border: '1px solid ' + (primary ? C.btnBg : C.line), background: primary ? C.btnBg : '#fff', color: primary ? '#fff' : C.primaryD,
    });
    const sel = { fontSize: 13, padding: '5px 8px', borderRadius: 8, border: '1px solid ' + C.line, color: C.ink };
    const noCashSum = noCash.reduce((a, x) => a + x.gross, 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* header */}
        <div style={Object.assign({}, card, { padding: '14px 18px' })}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>🧾 งบกระทบยอดกระแสเงินสด</div>
              <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>
                ลงหมวดให้<strong>ใบสำคัญจ่ายทุกใบ</strong>ที่นำเข้าจาก PEAK → ระบบเสนอหมวดให้ + จำที่ยืนยันไว้ใช้เดือนถัดไป
                {syncState === 'shared' ? ' · ข้อมูลส่วนกลาง (ทุกคนเห็น)'
                  : syncState === 'ready' ? ' · ต่อส่วนกลางแล้ว · ยังไม่มีข้อมูล'
                  : ' · ข้อมูลในเครื่อง (ยังไม่ได้ต่อส่วนกลาง)'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canEdit && <button style={btn()} onClick={() => fileGl.current && fileGl.current.click()}
                title={'โหลด "รายงานบัญชีแยกประเภท" ของบัญชีธนาคารจาก PEAK แล้วอัปได้เลย — บัญชีละไฟล์ เลือกหลายไฟล์พร้อมกันได้\n'
                  + 'เป็นแหล่งเดียวที่ให้รายการเงินเข้า (RV) + ยอดยกมา ซึ่งรายงานสมุดรายวันไม่มี'}>📥 นำเข้า GL</button>}
              {canEdit && <button style={btn()} title="เพิ่ม / แก้ชื่อ / ลบ หมวดในผังงบกระแสเงินสด" onClick={() => setCatMgr(true)}>🗂 จัดการหมวด</button>}
              {canEdit && <button style={btn()} title="ลงหมวดทีเดียวทั้งคู่ค้า — เร็วที่สุดตอนเริ่มเดือนแรก" onClick={() => setBulk(true)}>👥 ลงหมวดตามผู้รับเงิน</button>}
              {canEdit && <button style={btn()} title="เงินรับ / ค่าธรรมเนียมที่ธนาคารหักเอง / โอนระหว่างบัญชี — รายการที่ไม่มีในสมุดจ่ายของ PEAK"
                onClick={() => setExtraEdit({})}>➕ รายการนอก PV</button>}
              {canEdit && <button style={btn(true)} title="ส่งขึ้นหน้า Executive Cash Flow ทันที ไม่ต้องดาวน์โหลดแล้วอัปกลับ"
                onClick={() => setPushAsk(true)}>📤 ส่งขึ้นหน้า Cash Flow</button>}
              <button style={btn()} onClick={exportSheet}>⬇️ ส่งออกไฟล์ Excel</button>
            </div>
          </div>

          <input ref={fileGl} type="file" accept=".xls,.xlsx" multiple style={{ display: 'none' }}
            onChange={e => { onGlFiles(e.target.files); e.target.value = ''; }} />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <label style={{ fontSize: 12, color: C.mut }}>เดือน</label>
            <select value={ym} onChange={e => setYm(e.target.value)} style={sel}>
              <option value="">ทุกเดือน</option>
              {allYms.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <label style={{ fontSize: 12, color: C.mut }}>บัญชี</label>
            <select value={acct} onChange={e => setAcct(e.target.value)} style={sel}>
              <option value="">ทุกบัญชี</option>
              {allAccts.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา เลขที่ PV / AP / ผู้รับเงิน / หมายเหตุ…"
              style={Object.assign({}, sel, { flex: 1, minWidth: 220 })} />
            {busy && <span style={{ fontSize: 12, color: C.info }}>{busy}</span>}
          </div>
        </div>

        {/* ผังหมวดยังเป็นชุดตั้งต้น — ต้องบอกให้ชัด ไม่งั้นจะเผลอเอาชื่อหมวดกลาง ๆ ไปใช้จริง */}
        {isSeedMaster && (
          <div style={Object.assign({}, card, { padding: '11px 16px', borderColor: '#f0dcb0', background: C.warnBg, fontSize: 12.5, color: C.warn, lineHeight: 1.75 })}>
            📋 ตอนนี้ใช้ <strong>ผังหมวดตั้งต้นแบบมาตรฐาน</strong> ({master.length} หมวด) เพราะ BIGDREAM ยังไม่เคยทำงบกระแสเงินสดมาก่อน —
            ยังไม่ใช่ผังจริงของบริษัท กด <strong>🗂 จัดการหมวด</strong> เพื่อแก้ชื่อ/เพิ่ม/ลบให้ตรงกับงบที่จะใช้จริง
            (หรือกด “⬇️ ส่งออกผัง” ไปแก้เป็นชุดใน Excel แล้วนำเข้ากลับ) · ผังจะกลายเป็นของบริษัททันทีที่แก้ครั้งแรก
          </div>
        )}

        {/* KPI + ตัวกรองสถานะ */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['all', 'ทั้งหมด', stat.n, C.mut], ['locked', CFC_TIER.locked.label, stat.locked, C.pos],
            ['auto', CFC_TIER.auto.label, stat.auto, C.info], ['ask', CFC_TIER.ask.label, stat.ask, C.warn],
            ['new', CFC_TIER.new.label, stat.new, C.neg]].map(([k, label, n, col]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              cursor: 'pointer', border: '1px solid ' + (tab === k ? col : C.line), background: tab === k ? col : '#fff',
              color: tab === k ? '#fff' : C.ink, borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 700,
            }}>{label} <span style={{ opacity: .8 }}>{n}</span></button>
          ))}
          {canEdit && stat.auto > 0 && (
            <button onClick={acceptAllAuto} style={Object.assign({}, btn(true), { marginLeft: 'auto' })}>
              ✅ ยืนยันที่ระบบมั่นใจทั้งหมด ({stat.auto})
            </button>
          )}
        </div>

        {/* ── สรุปรายบัญชี + ยอดต้นงวดที่คีย์เอง ───────────────────────────────
             PEAK ไม่ส่ง "ยอดคงเหลือ" มากับรายงานสมุดรายวัน ⇒ ยอดต้นงวดต้องคีย์เอง
             ครั้งเดียวที่เดือนแรกสุด แล้วเดือนถัดไปคำนวณต่อจากกระแสให้เอง            */}
        {acctSummary.list.length > 0 && (
          <div style={Object.assign({}, card, { padding: 0, overflow: 'hidden' })}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'baseline', justifyContent: 'space-between', padding: '13px 18px 9px' }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.ink }}>🏦 สรุปรายบัญชี · {ym || 'ทุกเดือน'}</div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: C.mut }}>
                {[['ดำเนินงาน', actStat.op, CFC_ACT_COLOR.op], ['ลงทุน', actStat.inv, CFC_ACT_COLOR.inv],
                  ['จัดหาเงิน', actStat.fin, CFC_ACT_COLOR.fin], ['ยังไม่ลงหมวด', actStat.none, C.neg]].map(([lb, v, col]) => (
                  <span key={lb}>{lb} <strong style={{ color: col, fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>{cfcMoney(v)}</strong></span>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl tbl-compact" style={{ width: '100%', minWidth: 900, fontVariantNumeric: 'tabular-nums' }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 210 }}>บัญชี</th>
                    <th style={{ minWidth: 138, textAlign: 'right' }}>ยอดต้นงวด (คีย์เอง)</th>
                    <th style={{ minWidth: 112, textAlign: 'right' }}>รับ</th>
                    <th style={{ minWidth: 112, textAlign: 'right' }}>จ่าย</th>
                    <th style={{ minWidth: 122, textAlign: 'right' }}>ยอดปลายงวด</th>
                    <th style={{ minWidth: 140 }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {acctSummary.list.map(g => {
                    const openBad = g.openDiff != null && Math.abs(g.openDiff) > 0.02;
                    const glBad = g.glDiff != null && Math.abs(g.glDiff) > 0.02;
                    return (
                    <tr key={g.key}>
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{g.label}</div>
                        <div style={{ fontSize: 10.5, color: C.faint, fontFamily: 'ui-monospace,monospace' }}>{g.no || '—'}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {/* GL บอกยอดยกมามาแล้ว = ไม่ต้องคี้ย์ · ยังไม่มี GL ค่อยคีย์เอง */}
                        {g.glOpen != null
                          ? <React.Fragment>
                              <div style={{ fontVariantNumeric: 'tabular-nums' }}>{cfcMoney(g.glOpen)}</div>
                              <div style={{ fontSize: 10, color: C.pos }}>ยอดยกมาใน GL</div>
                            </React.Fragment>
                          : (canEdit
                            ? <CfcMoneyInput value={g.manOpen} placeholder="คีย์ต้นงวด" width={132}
                                title="ยอดคงเหลือจริงของบัญชีนี้ ณ ต้นเดือนแรกสุดที่มีข้อมูล — หรือนำเข้า GL แล้วระบบอ่านยอดยกมาให้เอง"
                                onSave={v => saveOpening(g.key, v)} />
                            : <span style={{ color: C.faint }}>{g.manOpen == null ? '—' : cfcMoney(g.manOpen)}</span>)}
                        {openBad && <div style={{ fontSize: 10, color: C.neg }} title={'ที่คีย์ไว้ ' + cfcMoney(g.manOpen)}>
                          ต่างจากที่คีย์ {cfcMoney(g.openDiff)}</div>}
                        {g.before !== 0 && <div style={{ fontSize: 10, color: C.faint }}>+ เดือนก่อน {cfcMoney(g.before)}</div>}
                      </td>
                      <td style={{ textAlign: 'right', color: g.inSum ? C.pos : C.faint }}>{g.inSum ? cfcMoney(g.inSum) : '—'}</td>
                      <td style={{ textAlign: 'right', color: g.outSum ? C.neg : C.faint }}>{g.outSum ? cfcMoney(g.outSum) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: g.closing < 0 ? C.neg : C.ink }}>
                        {g.baseOpen == null && !g.before ? <span style={{ color: C.faint, fontWeight: 400 }}>ยังไม่มีต้นงวด</span> : cfcMoney(g.closing)}
                        {glBad && <div style={{ fontSize: 10, color: C.neg, fontWeight: 400 }} title={'ปลายงวดตาม GL = ' + cfcMoney(g.glClosing)}>
                          GL ว่า {cfcMoney(g.glClosing)}</div>}
                      </td>
                      <td>
                        <CfcChip tone="mute">{g.n} รายการ</CfcChip>
                        {g.uncoded > 0 && <span style={{ marginLeft: 5 }}><CfcChip tone="warn">ยังไม่ลงหมวด {g.uncoded}</CfcChip></span>}
                        {glBad && <div style={{ marginTop: 3 }}><CfcChip tone="bad" title="ยอดที่คิดจากรายการในระบบ ไม่เท่ากับปลายงวดตามสมุดบัญชี — มีรายการขาด/เกิน">ไม่ตรง GL {cfcMoney(g.glDiff)}</CfcChip></div>}
                        {!glBad && g.glDiff != null && <div style={{ marginTop: 3 }}><CfcChip tone="ok">ตรงกับ GL</CfcChip></div>}
                      </td>
                    </tr>
                    );
                  })}
                  <tr style={{ fontWeight: 800, borderTop: '2px solid ' + C.line, background: C.soft }}>
                    <td>รวม {acctSummary.list.length} บัญชี</td>
                    <td style={{ textAlign: 'right' }}>{acctSummary.tot.keyed ? cfcMoney(acctSummary.tot.opening) : '—'}</td>
                    <td style={{ textAlign: 'right', color: C.pos }}>{cfcMoney(acctSummary.tot.inSum)}</td>
                    <td style={{ textAlign: 'right', color: C.neg }}>{cfcMoney(acctSummary.tot.outSum)}</td>
                    <td style={{ textAlign: 'right' }}>{acctSummary.tot.keyed ? cfcMoney(acctSummary.tot.closing) : '—'}</td>
                    <td style={{ fontWeight: 600, fontSize: 11.5, color: C.mut }}>
                      {acctSummary.tot.uncoded ? 'ยังไม่ลงหมวด ' + acctSummary.tot.uncoded + ' รายการ' : 'ลงหมวดครบทุกรายการ'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: '9px 18px 12px', fontSize: 11, color: C.faint, lineHeight: 1.75 }}>
              {glBuckets.length
                ? <React.Fragment>
                    ยอดต้นงวดอ่านมาจาก <strong style={{ color: C.mut }}>“ยอดยกมา” ใน GL</strong> ที่นำเข้าไว้ ({glBuckets.length} ก้อน · {glOnlyN} รายการที่ไม่มีใน PV) —
                    ปลายงวดที่คิดจากรายการในระบบต้องเท่ากับปลายงวดตาม GL ถ้าไม่เท่าแปลว่ามีรายการขาด/เกิน
                    {canEdit && <button onClick={clearGl} style={{ marginLeft: 8, cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 8, padding: '1px 8px', fontSize: 10.5 }}>ล้าง GL ที่นำเข้า</button>}
                  </React.Fragment>
                : <React.Fragment>
                    PEAK ไม่ส่ง “ยอดคงเหลือ” มากับรายงานสมุดรายวัน ⇒ กด <strong style={{ color: C.mut }}>📥 นำเข้า GL</strong> แล้วระบบอ่านยอดยกมาให้เอง
                    (หรือคีย์เองก็ได้ · ดูจาก statement ณ ต้นเดือนแรกสุดที่มีข้อมูล) เดือนถัด ๆ ไประบบยกยอดต่อให้เอง ·
                    ไม่มีต้นงวด = ยังลงหมวด/ส่งออกงบได้ตามปกติ แค่ไม่มีบรรทัด “เงินสดต้นงวด/ปลายงวด”
                  </React.Fragment>}
            </div>
          </div>
        )}

        {/* แถบเตือน */}
        {(noCash.length > 0 || stat.orphan > 0 || pvNotInGl.length > 0 || (!glBuckets.length && !extraRows.length && stat.inSum === 0 && rows.length > 0)) && (
          <div style={Object.assign({}, card, { padding: '10px 16px', borderColor: '#f0dcb0', background: C.warnBg, fontSize: 12.5, color: C.warn, lineHeight: 1.8 })}>
            {stat.orphan > 0 && <div>⚠️ <strong>{stat.orphan} รายการ</strong> ลงหมวดที่<strong>ไม่มีในผังแล้ว</strong> ({stat.orphanNames.slice(0, 3).join(' · ')}{stat.orphanNames.length > 3 ? ' และอีก ' + (stat.orphanNames.length - 3) : ''}) — ยอดจะไม่เข้าบรรทัดไหนในงบ ให้เพิ่มหมวดกลับหรือเลือกหมวดใหม่ให้รายการเหล่านี้</div>}
            {pvNotInGl.length > 0 && <div title={pvNotInGl.slice(0, 25).map(r => r.docNo + ' · ' + cfcThaiDate(r.iso) + ' · ' + cfcMoney(r.out || r.in) + ' · ' + r.payee).join('\n') + (pvNotInGl.length > 25 ? '\n…และอีก ' + (pvNotInGl.length - 25) + ' ใบ' : '')}>
              ⚠️ <strong>{pvNotInGl.length} ใบสำคัญจ่าย</strong> อยู่ในช่วงวันที่ของ GL แต่<strong>ไม่มีใน GL</strong>{' '}
              ({pvNotInGl.slice(0, 3).map(r => r.docNo).join(' · ')}{pvNotInGl.length > 3 ? ' …' : ''}) —
              มักเป็นใบที่ถูกยกเลิก/แก้เลขใน PEAK หลังนำเข้า หรือไฟล์ GL เก่ากว่าข้อมูล PV ·
              โหลด GL ใหม่ หรือลบใบนั้นที่หน้าใบสำคัญจ่าย (ยอดปลายงวดจะไม่ตรง GL จนกว่าจะเคลียร์) · ชี้เพื่อดูรายการ</div>}
            {noCash.length > 0 && <div>ℹ️ ตัด <strong>{noCash.length} ใบ</strong> ที่ไม่มีเงินออกจากบัญชีบริษัทออกจากตารางแล้ว (ผู้บริหารสำรองจ่ายแทน · ยอดตามใบรวม {cfcMoney(noCashSum)}) — ไม่ใช่กระแสเงินสด ถ้านับด้วยยอดในงบจะเกินจริง</div>}
            {!glBuckets.length && !extraRows.length && stat.inSum === 0 && rows.length > 0 &&
              <div>ℹ️ เดือนนี้<strong>ยังไม่มีรายการฝั่งรับเลย</strong> — สมุด “จ่าย” ของ PEAK มีแต่ขาจ่าย · กด <strong>📥 นำเข้า GL</strong> แล้วรายการเงินเข้า (RV) จะมาครบเอง ไม่งั้นงบจะติดลบทั้งเดือน</div>}
          </div>
        )}

        {/* ตาราง */}
        <div style={Object.assign({}, card, { padding: 0, overflow: 'hidden' })}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl tbl-compact" style={{ width: '100%', minWidth: 1180 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 86 }}>วันที่</th>
                  <th style={{ minWidth: 128 }}>เลขที่ PV / AP</th>
                  <th style={{ minWidth: 320 }}>รายการ</th>
                  <th style={{ minWidth: 104, textAlign: 'right' }}>จ่าย</th>
                  <th style={{ minWidth: 104, textAlign: 'right' }}>รับ</th>
                  <th style={{ minWidth: 244 }}>หมวด</th>
                  <th style={{ minWidth: 176 }}>ที่มาของหมวด</th>
                  <th style={{ minWidth: 58 }}></th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 600).map(r => {
                  const T = CFC_TIER[r.sug.tier];
                  return (
                    <tr key={r.key} style={{ background: r.sug.tier === 'new' ? '#fffafa' : (r.sug.tier === 'ask' ? '#fffdf4' : undefined) }}>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{cfcThaiDate(r.iso)}</td>
                      <td style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11.5 }}>
                        {r.docNo}
                        {r.apNo && <div style={{ color: C.primaryD, fontSize: 10.5 }}>← {r.apNo}</div>}
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, color: C.ink }}>{r.memo || '—'}</div>
                        <div style={{ fontSize: 11, color: C.mut }}>
                          {r.payee || ''}
                          {r.acctLabel && <span style={{ marginLeft: 6, color: C.faint }}>· {r.acctLabel}</span>}
                          {r.src === 'gl' && <span style={{ marginLeft: 6 }}><CfcChip tone="info" title={'มาจากรายงานบัญชีแยกประเภท — ไม่มีใบสำคัญจ่ายคู่กัน' + (r.apNo ? ' · อ้างอิง ' + r.apNo : '')}>จาก GL</CfcChip></span>}
                          {r.src === 'extra' && <span style={{ marginLeft: 6 }}><CfcChip tone="info" title="รายการที่คีย์เองในหน้านี้ (ไม่ได้มาจาก PEAK)">คีย์เอง</CfcChip></span>}
                          {r.wht > 0 && <span style={{ marginLeft: 6 }}><CfcChip tone="warn" title="ภาษีหัก ณ ที่จ่าย — ยังไม่ใช่เงินสดออก จะเป็นกระแสเงินสดตอนนำส่งสรรพากร">WHT {cfcMoney(r.wht)}</CfcChip></span>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.out ? C.neg : C.faint }}>{r.out ? cfcMoney(r.out) : '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: r.in ? C.pos : C.faint }}>{r.in ? cfcMoney(r.in) : '—'}</td>
                      <td>
                        <CfcCatSelect value={r.sug.cat} master={master} disabled={!canEdit} onChange={v => confirmRow(r, v)} />
                        {r.sug.cat && (() => {
                          const mm = master.find(x => x.name === r.sug.cat);
                          const fm = CFC_FLOW_META[cfcFlowOf(mm || { name: r.sug.cat })];
                          return (
                            <div style={{ fontSize: 10.5, marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                              <span style={{ color: fm.color, fontWeight: 700 }}>{fm.mark} {fm.label}</span>
                              <span style={{ color: CFC_ACT_COLOR[r.sug.act] || C.mut }}>{CFC_ACT_TH[r.sug.act] || '(ไม่นับเป็นกิจกรรม)'}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <CfcChip tone={T.tone}>{T.label}</CfcChip>
                        <div style={{ fontSize: 10.5, color: C.mut, marginTop: 2 }}>{r.sug.why}</div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {canEdit && r.sug.tier !== 'locked' && r.sug.cat &&
                          <button title="ยืนยันหมวดนี้ + จำไว้" onClick={() => confirmRow(r, r.sug.cat)}
                            style={{ cursor: 'pointer', border: '1px solid ' + C.pos, background: '#fff', color: C.pos, borderRadius: 8, padding: '3px 8px', fontSize: 12, fontWeight: 700 }}>✓</button>}
                        {canEdit && r.src === 'extra' &&
                          <button title="แก้ไข / ลบรายการที่คีย์เอง" onClick={() => setExtraEdit(extraRows.find(x => x.id === r.extraId) || {})}
                            style={{ cursor: 'pointer', border: '1px solid ' + C.line, background: '#fff', color: C.mut, borderRadius: 8, padding: '3px 8px', fontSize: 12, marginLeft: 4 }}>✏️</button>}
                      </td>
                    </tr>
                  );
                })}
                {!shown.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: C.mut, padding: 28, fontSize: 13 }}>
                  {allRows.length ? 'ไม่มีรายการตรงตัวกรอง'
                    : 'ยังไม่มีข้อมูล — นำเข้า "รายงานสมุดรายวัน" ที่หน้าใบสำคัญจ่าย (ขาจ่าย) แล้วกด 📥 นำเข้า GL ที่นี่ (ขารับ + ยอดยกมา)'}
                </td></tr>}
              </tbody>
            </table>
          </div>
          {shown.length > 600 && <div style={{ padding: '8px 14px', fontSize: 12, color: C.mut }}>แสดง 600 แถวแรกจาก {shown.length} — ใช้ตัวกรองเดือน/บัญชี/ค้นหาเพื่อดูให้แคบลง</div>}
        </div>

        <div style={{ fontSize: 11.5, color: C.faint, padding: '0 4px 6px' }}>
          ยอดรวมที่กรองอยู่: จ่าย {cfcMoney(stat.outSum)} · รับ {cfcMoney(stat.inSum)} · สุทธิ {cfcMoney(stat.inSum - stat.outSum)} ·
          กฎที่เรียนรู้ไว้ {Object.keys(rules).length} ข้อ · หมวดในผังงบ {master.length} รายการ
          {extraRows.length > 0 ? ' · รายการนอก PV ' + extraRows.length + ' รายการ' : ''}
        </div>

        {catMgr && <CfcCatManagerModal master={master} rules={rules} onClose={() => setCatMgr(false)}
          onAdd={saveNewCat} onEdit={saveCatEdit} onDelete={saveCatDelete}
          onExportChart={exportChart} onImportChart={importChart} />}
        {bulk && <CfcPayeeBulkModal groups={payeeGroups} master={master}
          onClose={() => setBulk(false)} onApply={applyPayeeBulk} />}
        {extraEdit && <CfcExtraRowModal initial={extraEdit} accounts={allAccts}
          onClose={() => setExtraEdit(null)} onSave={saveExtraRow} onDelete={deleteExtraRow} />}

        {/* ⚠️ ยืนยัน "จะดันเดือนไหน" ก่อนเสมอ — เคยดันผิดเดือนเพราะไม่ทันดูตัวกรองด้านบน
            เลือกเดือนในนี้ = เปลี่ยนตัวกรองของหน้าไปเลย ตัวเลขสรุปในกล่องจึงเป็นของเดือนนั้นจริง ๆ */}
        {pushAsk && (
          <Modal open title="📤 ส่งขึ้นหน้า Cash Flow" onClose={() => setPushAsk(false)}>
            <div style={{ display: 'grid', gap: 12, minWidth: 340 }}>
              <div style={{ fontSize: 13, color: C.mut }}>เลือกเดือนที่จะส่ง — เดือนอื่นที่เคยส่งไว้จะคงตัวเลขเดิมไว้ ไม่ถูกคิดใหม่</div>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>เดือนที่จะส่ง</span>
                <select value={ym} onChange={e => setYm(e.target.value)}
                  style={{ fontSize: 15, fontWeight: 700, padding: '9px 10px', borderRadius: 10, border: '2px solid ' + C.primary, color: C.primaryD }}>
                  <option value="">ทุกเดือน ({allYms.length} เดือน)</option>
                  {allYms.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <div style={{ background: C.soft, borderRadius: 10, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.9, color: C.ink }}>
                จะส่ง <strong>{rows.length}</strong> รายการ
                {acct ? <> · เฉพาะบัญชี <strong>{acct}</strong></> : <> · ทุกบัญชี</>}
                <br />ยังไม่ลงหมวด <strong style={{ color: stat.new ? C.neg : C.pos }}>{stat.new}</strong> รายการ
                {stat.new > 0 && <span style={{ color: C.neg }}> — ยอดพวกนี้จะไม่เข้าบรรทัดไหนในงบ</span>}
              </div>
              {acct && <div style={{ fontSize: 12, color: C.warn, background: C.warnBg, borderRadius: 8, padding: '8px 10px' }}>
                ⚠️ ตัวกรอง “บัญชี” เปิดอยู่ — จะส่งเฉพาะบัญชีนี้ ถ้าต้องการทั้งเดือนให้ปิดตัวกรองบัญชีก่อน
              </div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button style={btn()} onClick={() => setPushAsk(false)}>ยกเลิก</button>
                <button style={btn(true)} disabled={!rows.length} onClick={sendToCashflow}>
                  📤 ส่ง {ym ? 'เดือน ' + ym : 'ทุกเดือน'}
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  window.CfCodingPage = CfCodingPage;
  Object.assign(window, {
    cfcSummaryAoa, cfcFlowOf, cfcInsertCat, cfcRuleCatCount, cfcWithExtraCats, cfcSeedMaster,
    cfcStyleSummary, cfcStyleDetail, cfcStyleCheck, cfcBuildEngine, cfcChartAoa, cfcParseChartAoa,
    cfcLoadLocal, cfcAcctKey, cfcDigits, cfcVendorKey, cfcISO, CFC_MASTER_SEED, CFC_DETAIL_HEAD,
    cfcRunCashRows, cfcApplyOldColumns, cfcYmOfMonthLabel, cfcCanonRowLabel,
  });
})();
