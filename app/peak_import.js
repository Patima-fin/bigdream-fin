/* =====================================================================
 * peak_import.js — อ่าน "ไฟล์ดิบ" ที่โหลดจาก PEAK ได้ตรง ๆ
 * =====================================================================
 * BIGDREAM ใช้โปรแกรมบัญชี PEAK (BIO ใช้ EXPRESS) รายงานที่ PEAK ส่งออกมา
 * ใช้กับตัวนำเข้าเดิมไม่ได้ เพราะ
 *   1. มีหัวรายงานคร่อมอยู่ ~11 บรรทัด (ชื่อรายงาน / ผู้ออกรายงาน / ช่วงวันที่ …)
 *      ตัวนำเข้าจึงอ่านบรรทัดแรกเป็นหัวคอลัมน์ → ไม่ตรงสักช่อง
 *   2. หัวคอลัมน์เป็นภาษาไทยของ PEAK ("เลขที่เอกสาร", "ต้องชำระ") ไม่ใช่ชื่อฟิลด์ของแอป
 *   3. รายงานสมุดรายวันเป็น double-entry — 1 ใบจ่ายกระจายเป็นหลายบรรทัด
 *      ต้องยุบเป็นรายเอกสารก่อน ถึงจะเป็น 1 PV = 1 แถว
 *
 * ไฟล์นี้แปลง sheet ของ PEAK → TSV ที่มีหัวคอลัมน์ตรงกับฟิลด์ของแอป แล้วส่งกลับ
 * ให้ตัวนำเข้าเดิมทำงานต่อตามปกติ (diff/preview/commit ไม่ต้องแก้)
 *
 * รองรับ 3 รายงาน:
 *   รายงานใบแจ้งหนี้      → หน้าใบแจ้งหนี้คงค้าง   (target 'iv')
 *   รายงานบันทึกรายจ่าย   → หน้า DATA AP           (target 'ap')
 *   รายงานสมุดรายวัน      → หน้า DATA PV           (target 'pv')
 *
 * ★ ไฟล์ที่ไม่ใช่ของ PEAK จะคืน null → ตัวนำเข้าเดิมทำงานเหมือนเดิมทุกประการ
 * ===================================================================== */
(function (root) {
  'use strict';

  var REPORTS = {
    'รายงานใบแจ้งหนี้':    'iv',
    'รายงานบันทึกรายจ่าย': 'ap',
    'รายงานสมุดรายวัน':    'pv',
  };
  var TARGET_LABEL = { iv: 'ใบแจ้งหนี้คงค้าง', ap: 'DATA AP (เจ้าหนี้คงค้าง)', pv: 'DATA PV (ใบสำคัญจ่าย)' };
  var REPORT_LABEL = { iv: 'รายงานใบแจ้งหนี้', ap: 'รายงานบันทึกรายจ่าย', pv: 'รายงานสมุดรายวัน' };

  function txt(v) { return String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim(); }
  function num(v) { return Number(String(v == null ? '' : v).replace(/,/g, '').trim()) || 0; }
  function fmt(n) { return (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }); }

  // "25/05/2026" → "2026-05-25" · serial number ของ Excel ก็รองรับ · อย่างอื่นคืนค่าเดิม
  function toISO(v) {
    var s = txt(v);
    if (!s) return '';
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d+(\.\d+)?$/.test(s) && root.XLSX && root.XLSX.SSF) {
      try {
        var dc = root.XLSX.SSF.parse_date_code(Number(s));
        if (dc && dc.y) return dc.y + '-' + ('0' + dc.m).slice(-2) + '-' + ('0' + dc.d).slice(-2);
      } catch (_) {}
    }
    return s;
  }

  // เลขบัญชีธนาคารที่ PEAK ฝังไว้ในคำอธิบาย เช่น "… - 218-2-925534 - BSV001 - …"
  function pickBankAc(s) {
    var m = String(s || '').match(/\b\d{3}-\d-\d{5,6}(?:-\d)?\b/);
    return m ? m[0] : '';
  }

  /* ── ตรวจว่าเป็นไฟล์ PEAK ไหม + หาบรรทัดหัวตาราง ─────────────────────── */
  function detect(aoa) {
    if (!aoa || !aoa.length) return null;
    var kind = null;
    for (var i = 0; i < Math.min(aoa.length, 12); i++) {
      var c0 = txt((aoa[i] || [])[0]);
      if (!/^ชื่อรายงาน/.test(c0)) continue;
      var name = c0.split(':').slice(1).join(':').trim();
      for (var key in REPORTS) { if (name.indexOf(key) === 0) { kind = REPORTS[key]; break; } }
      break;
    }
    if (!kind) return null;
    var headerRow = -1;
    for (var r = 0; r < Math.min(aoa.length, 30); r++) {
      if (txt((aoa[r] || [])[0]) === 'ลำดับที่') { headerRow = r; break; }
    }
    if (headerRow < 0) return null;
    return { kind: kind, headerRow: headerRow };
  }

  function colIndex(aoa, headerRow) {
    var idx = {};
    (aoa[headerRow] || []).forEach(function (h, i) { var k = txt(h); if (k && idx[k] == null) idx[k] = i; });
    return idx;
  }

  /* ── รายงานใบแจ้งหนี้ → ฟิลด์หน้าใบแจ้งหนี้คงค้าง ────────────────────── */
  var IV_STATUS = {
    'ชำระแล้ว': 'paid', 'ชำระเงินแล้ว': 'paid', 'รับชำระแล้ว': 'paid',
    'เกินเวลารับชำระ': 'tracking', 'รอรับชำระ': 'tracking', 'รอชำระ': 'tracking',
    'ชำระบางส่วน': 'tracking',
  };
  function buildIV(aoa, headerRow) {
    var idx = colIndex(aoa, headerRow);
    var g = function (row, name) { return idx[name] == null ? '' : txt(row[idx[name]]); };
    var cols = ['invno','jobno','projectname','invdate','balance','period','status','invtype','customer','contractref','producttype','remark','over_due'];
    var out = [];
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var no = g(row, 'เลขที่เอกสาร');
      if (!no) continue;                                    // แถวสรุป "รวม" ไม่มีเลขเอกสาร
      var st = g(row, 'สถานะ');
      if (/ยกเลิก/.test(st)) continue;                       // ใบที่ยกเลิกแล้ว ไม่ใช่ลูกหนี้คงค้าง
      out.push({
        invno: no,
        jobno: '',
        projectname: g(row, 'ชื่อสินค้า/บริการ'),
        invdate: toISO(g(row, 'วันที่ออก')),
        balance: num(g(row, 'ทั้งหมด')),                     // ยอดเต็มรวม VAT — แอปหัก WHT ตาม config.WHT_RATE
        period: '',
        status: IV_STATUS[st] || 'tracking',
        invtype: 'O',                                        // ใบแจ้งหนี้อื่น ๆ (ไม่ผูกโครงการ)
        customer: g(row, 'ชื่อลูกค้า'),
        contractref: g(row, 'อ้างอิง'),
        producttype: '',
        remark: [g(row, 'คำอธิบาย'),
                 'VAT ' + fmt(num(g(row, 'ยอด VAT'))),
                 'WHT ' + fmt(num(g(row, 'หัก ณ ที่จ่าย'))),
                 'ต้องชำระ ' + fmt(num(g(row, 'ต้องชำระ'))),
                 'ครบกำหนด ' + g(row, 'วันที่ครบกำหนด'),
                 st].filter(Boolean).join(' · '),
        over_due: '',
      });
    }
    return { cols: cols, rows: out };
  }

  /* ── รายงานบันทึกรายจ่าย → ฟิลด์หน้า DATA AP ────────────────────────── */
  function buildAP(aoa, headerRow) {
    var idx = colIndex(aoa, headerRow);
    var g = function (row, name) { return idx[name] == null ? '' : txt(row[idx[name]]); };
    var cols = ['vchno','vchdate','due2','cust_name','netpayment','Amount','VAT','Balance_Amount1','docno','dpt_code','remark'];
    var out = [];
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var no = g(row, 'เลขที่เอกสาร');
      if (!no) continue;
      var st = g(row, 'สถานะ');
      if (/ยกเลิก/.test(st)) continue;
      out.push({
        vchno: no,
        vchdate: toISO(g(row, 'วันที่ออก')),
        due2: toISO(g(row, 'วันที่ครบกำหนด')),
        cust_name: g(row, 'ผู้ขาย/ผู้ให้บริการ'),
        netpayment: num(g(row, 'ต้องชำระ')),                 // เงินที่ต้องจ่ายจริง (หลังหัก WHT)
        Amount: num(g(row, 'ทั้งหมด')),
        VAT: num(g(row, 'ยอด VAT')),
        Balance_Amount1: num(g(row, 'มูลค่ารอชำระ')),
        docno: g(row, 'เลขที่ใบกำกับภาษี'),
        dpt_code: '',
        remark: [g(row, 'ชื่อสินค้า/บริการ'), 'WHT ' + fmt(num(g(row, 'หัก ณ ที่จ่าย'))), st].filter(Boolean).join(' · '),
      });
    }
    return { cols: cols, rows: out };
  }

  /* ── รายงานสมุดรายวัน (double-entry) → 1 ใบจ่าย = 1 แถว DATA PV ─────── */
  //  Net_Amount = ยอดที่ "เครดิตบัญชีธนาคาร" (1113xx) = เงินออกจากบัญชีจริง
  //  WHT        = ยอดที่เครดิต ภ.ง.ด.ค้างจ่าย (2152xx)
  //  Amount     = ผลรวมเดบิตทั้งใบ (ยอดก่อนหัก)
  //  ใบที่ไม่มีเงินออกจากธนาคาร (ผู้บริหารสำรองจ่ายแทน) → Net_Amount 0 + ทำหมายเหตุไว้
  function buildPV(aoa, headerRow) {
    var idx = colIndex(aoa, headerRow);
    var g = function (row, name) { return idx[name] == null ? '' : txt(row[idx[name]]); };
    var cols = ['PL_PV_No','AP_No','Pmt_Date','Payee','Amount','WHT','Vat','Net_Amount','Bank_AC','Type_of_Pmt','Doc_Src','cc_remark'];
    var docs = {}, order = [], skippedBook = 0;
    for (var r = headerRow + 1; r < aoa.length; r++) {
      var row = aoa[r] || [];
      var no = g(row, 'เลขที่บันทึก');
      if (!no) continue;
      var book = g(row, 'ประเภทสมุด');
      if (book && book !== 'จ่าย') { skippedBook++; continue; }   // เอาเฉพาะสมุดจ่าย
      if (!docs[no]) {
        docs[no] = { no: no, date: g(row, 'วันที่บันทึก'), ref: g(row, 'อ้างอิง'),
                     payee: g(row, 'ชื่อลูกค้า'), desc: g(row, 'คำอธิบายบันทึกบัญชี'),
                     debit: 0, bank: 0, wht: 0, advance: 0, bankAc: '' };
        order.push(no);
      }
      var d = docs[no];
      var acct = g(row, 'เลขผังบัญชี'), dr = num(g(row, 'เดบิต')), cr = num(g(row, 'เครดิต'));
      d.debit += dr;
      if (/^1113/.test(acct)) { d.bank += cr - dr; if (!d.bankAc) d.bankAc = pickBankAc(g(row, 'คำอธิบาย')) || pickBankAc(d.desc); }
      if (/^2152/.test(acct)) d.wht += cr;                       // ภ.ง.ด.3 / ภ.ง.ด.53 ค้างจ่าย
      if (/^212203/.test(acct)) d.advance += cr;                 // สำรองจ่ายแทนกิจการ
    }
    var out = order.map(function (no) {
      var d = docs[no];
      var paid = d.bank > 0;
      return {
        PL_PV_No: d.no,
        AP_No: d.ref,                                            // EXP-xxx → หน้า AP จะรู้ว่าใบนี้จ่ายแล้ว
        Pmt_Date: toISO(d.date),
        Payee: d.payee,
        Amount: Math.round(d.debit * 100) / 100,
        WHT: Math.round(d.wht * 100) / 100,
        Vat: 0,
        Net_Amount: paid ? Math.round(d.bank * 100) / 100 : 0,
        Bank_AC: paid ? d.bankAc : '',
        Type_of_Pmt: paid ? 'Transfer Bank' : 'สำรองจ่ายแทน',
        Doc_Src: 'PEAK',
        cc_remark: (paid ? '' : '[สำรองจ่ายแทนกิจการ ' + fmt(d.advance) + ' — ไม่มีเงินออกจากบัญชีบริษัท] ') + d.desc,
      };
    });
    out.sort(function (a, b) { return String(a.Pmt_Date).localeCompare(String(b.Pmt_Date)); });
    return { cols: cols, rows: out, skippedBook: skippedBook };
  }

  var BUILDERS = { iv: buildIV, ap: buildAP, pv: buildPV };

  function toTSV(cols, rows) {
    var lines = [cols.join('\t')];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return r[c] == null ? '' : String(r[c]); }).join('\t'));
    });
    return lines.join('\n');
  }

  /* ── API หลัก ────────────────────────────────────────────────────────
   *  sheetToTSV(ws, target)  target = 'iv' | 'ap' | 'pv'
   *    null                         → ไม่ใช่ไฟล์ PEAK (ให้ตัวนำเข้าเดิมทำงานต่อ)
   *    { ok:false, message }        → เป็นไฟล์ PEAK แต่ผิดรายงาน / อ่านไม่ได้
   *    { ok:true, tsv, count, note} → แปลงสำเร็จ
   */
  function sheetToTSV(ws, target) {
    if (!root.XLSX || !ws) return null;
    var aoa;
    try { aoa = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }); }
    catch (_) { return null; }
    var det = detect(aoa);
    if (!det) return null;                                        // ไม่ใช่ PEAK → ปล่อยผ่าน
    if (det.kind !== target) {
      return { ok: false, message: 'ไฟล์นี้เป็น "' + REPORT_LABEL[det.kind] + '" ของ PEAK ' +
               'ซึ่งต้องนำเข้าที่หน้า ' + TARGET_LABEL[det.kind] + ' — หน้านี้รับ "' + REPORT_LABEL[target] + '"' };
    }
    var built = BUILDERS[target](aoa, det.headerRow);
    if (!built.rows.length) return { ok: false, message: 'อ่านไฟล์ PEAK ได้ แต่ไม่พบแถวข้อมูลที่ใช้ได้' };
    var note = 'อ่านไฟล์ PEAK (' + REPORT_LABEL[target] + ') ได้ ' + built.rows.length + ' รายการ';
    if (target === 'pv') note += ' จาก ' + (aoa.length - det.headerRow - 1) + ' บรรทัดบัญชี';
    if (built.skippedBook) note += ' · ข้ามสมุดที่ไม่ใช่ "จ่าย" ' + built.skippedBook + ' บรรทัด';
    return { ok: true, tsv: toTSV(built.cols, built.rows), count: built.rows.length, note: note };
  }

  root.PeakImport = { detect: detect, sheetToTSV: sheetToTSV, toISO: toISO };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).PeakImport;
