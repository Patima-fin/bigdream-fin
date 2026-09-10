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
    'รายงานใบแจ้งหนี้':      'iv',
    'รายงานบันทึกรายจ่าย':   'ap',
    'รายงานสมุดรายวัน':      'pv',
    'รายงานบัญชีแยกประเภท':  'gl',
  };
  var TARGET_LABEL = { iv: 'ลูกหนี้คงค้าง', ap: 'เจ้าหนี้คงค้าง', pv: 'ใบสำคัญจ่าย', gl: 'งบกระทบยอดกระแสเงินสด' };
  var REPORT_LABEL = { iv: 'รายงานใบแจ้งหนี้', ap: 'รายงานบันทึกรายจ่าย', pv: 'รายงานสมุดรายวัน', gl: 'รายงานบัญชีแยกประเภท' };

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

  /* หัวรายงานของ PEAK เป็นคู่ "ป้าย : " → "ค่า"
     ⚠️ อยู่คนละที่กันในแต่ละรายงาน — ใบแจ้งหนี้/รายจ่าย/สมุดรายวันวางไว้คอลัมน์ A
        แต่ "บัญชีแยกประเภท" วางไว้คอลัมน์ K-L (เพราะคอลัมน์ A เป็นหัวบล็อกบัญชี)
        ⇒ ต้องกวาดทุกคอลัมน์ ห้ามยึดคอลัมน์ A อย่างเดียว
     คืน { 'ชื่อรายงาน': '…', 'เลขที่บัญชี': '…', 'ช่วงวันที่': '…', … } */
  function readMeta(aoa, maxRow) {
    var meta = {};
    for (var i = 0; i < Math.min(aoa.length, maxRow || 14); i++) {
      var row = aoa[i] || [];
      for (var c = 0; c < row.length; c++) {
        var k = txt(row[c]);
        if (!k || k.indexOf(':') < 0) continue;
        var name = k.slice(0, k.indexOf(':')).trim();
        // ★ ป้ายหัวรายงานเป็นข้อความไทยล้วน — กันค่าที่มี ':' อยู่ในตัวเอง (เช่น
        //   "20260910 16:58:32") ถูกอ่านเป็นป้าย แล้วโผล่เป็นคีย์ขยะใน meta
        if (!name || name.length > 40 || /\d/.test(name)) continue;
        var val = k.slice(k.indexOf(':') + 1).trim() || txt(row[c + 1]);   // ค่าอยู่ในเซลล์เดียวกัน หรือช่องถัดไป
        if (val && meta[name] == null) meta[name] = val;
      }
    }
    return meta;
  }

  /* ── ตรวจว่าเป็นไฟล์ PEAK ไหม + หาบรรทัดหัวตาราง ─────────────────────── */
  function detect(aoa) {
    if (!aoa || !aoa.length) return null;
    var kind = null;
    var name = readMeta(aoa)['ชื่อรายงาน'] || '';
    for (var key in REPORTS) { if (name.indexOf(key) === 0) { kind = REPORTS[key]; break; } }
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
        // ★ ใช้ข้อความจากไฟล์ล้วน ๆ ไม่ประกอบเอง (VAT/WHT/ต้องชำระ แอปคำนวณเองได้จาก
        //   balance + config.WHT_RATE อยู่แล้ว ไม่ต้องยัดมาไว้ในหมายเหตุ)
        remark: [g(row, 'คำอธิบาย') || g(row, 'ชื่อสินค้า/บริการ'), g(row, 'หมายเหตุ')]
                  .filter(Boolean).join(' · '),
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
        // ★ ใช้ข้อความจากไฟล์ล้วน ๆ ไม่ประกอบเอง
        //   คอลัมน์ P "คำอธิบาย" คือช่องที่ PEAK ใส่รายละเอียดจริง (O "ชื่อสินค้า/บริการ"
        //   มักว่าง จึงใช้เป็นตัวสำรอง) · ต่อท้ายด้วย AE "หมายเหตุ" ถ้าผู้ใช้กรอกไว้
        remark: [g(row, 'คำอธิบาย') || g(row, 'ชื่อสินค้า/บริการ'), g(row, 'หมายเหตุ')]
                  .filter(Boolean).join(' · '),
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
        // ★ ใช้ "คำอธิบายบันทึกบัญชี" จากไฟล์ล้วน ๆ — ใบที่ไม่มีเงินออกดูได้จาก
        //   Type_of_Pmt = 'สำรองจ่ายแทน' อยู่แล้ว ไม่ต้องเติมข้อความเอง
        cc_remark: d.desc,
      };
    });
    out.sort(function (a, b) { return String(a.Pmt_Date).localeCompare(String(b.Pmt_Date)); });
    return { cols: cols, rows: out, skippedBook: skippedBook };
  }

  /* ══════════════════════════════════════════════════════════════════════
   * รายงานบัญชีแยกประเภท (GL) → บรรทัดเดินบัญชีธนาคาร
   * ----------------------------------------------------------------------
   *  ใช้กับหน้า "งบกระทบยอดกระแสเงินสด" — เป็นแหล่งเดียวที่ให้ของ 3 อย่างที่
   *  รายงานสมุดรายวัน (สมุด "จ่าย") ให้ไม่ได้:
   *    1) รายการ "เงินเข้า" (RV-xxx) — สมุดจ่ายไม่มีขารับเลย
   *    2) ยอดยกมา (ต้นงวด) ของบัญชี — PEAK ไม่ส่งมากับรายงานอื่น
   *    3) เลขบัญชีธนาคารที่แน่นอน (อยู่ในหัวบล็อก ไม่ต้องเดาจากคำอธิบาย)
   *
   *  โครงไฟล์ (1 ไฟล์ = 1 บัญชี แต่รองรับหลายบล็อกไว้ด้วย):
   *    A1                = "111301 - BSV001 (ธนาคาร - บัญชีออมทรัพย์ - ธ.ไทยพาณิชย์ … - 218-2-925534 …)"
   *    K/L               = หัวรายงาน (ชื่อรายงาน / ช่วงวันที่ / เลขที่บัญชี …)
   *    แถวหัวตาราง       = ลำดับที่ | เลขที่รายวัน | วันที่ออก | อ้างอิง | ผู้ติดต่อ | คำอธิบาย | เดบิต | เครดิต | คงเหลือ
   *    แถวแรกของข้อมูล   = "ยอดยกมา" (เดบิต − เครดิต = ยอดต้นงวด)
   *    แถวสุดท้าย        = "รวม"
   *  ★ เดบิต = เงินเข้าบัญชี · เครดิต = เงินออกจากบัญชี (ตรงข้ามกับมุมมองใบจ่าย)
   *  ⚠️ คอลัมน์ "คงเหลือ" ว่างทุกแถวในไฟล์จริง — อย่าไปพึ่ง ให้คิดจากยอดยกมาเอง
   * ══════════════════════════════════════════════════════════════════════ */
  var GL_BANK_PREFIX = /^1113/;      // ผังบัญชี PEAK: 1113xx = เงินฝากธนาคาร (ชุดเดียวกับ buildPV)

  // หัวบล็อกบัญชี: "111301 - BSV001 (…)"  → { code, alias, desc }
  function glAccountHead(v) {
    var m = txt(v).match(/^(\d{4,8})\s*-\s*([^\s(]+)\s*\((.*)\)\s*$/);
    return m ? { code: m[1], alias: m[2], desc: m[3] } : null;
  }

  /* คำอธิบายของ GL ซ้ำหัวบัญชี+เลขบัญชี+ชื่อบริษัททุกแถว → ตัดทิ้งให้เหลือเนื้อจริง
     (ปกติจะเหลือชื่อคู่ค้า ซึ่งตรงกับคอลัมน์ "ผู้ติดต่อ" — ถือว่าโอเค ไม่ไปเดาเพิ่ม) */
  function glMemo(desc, ctx) {
    var parts = txt(desc).split(/\s+-\s+/).map(txt).filter(Boolean);
    var keep = parts.filter(function (p, i) {
      if (p === 'ธนาคาร' || (i <= 2 && /^บัญชี/.test(p))) return false;   // "ธนาคาร - บัญชีออมทรัพย์"
      if (p === ctx.alias || p === ctx.company) return false;
      if (ctx.acctNo && p.indexOf(ctx.acctNo) >= 0) return false;         // เลขบัญชี (บางแถวมีชื่อบริษัทต่อท้าย)
      if (/^#/.test(p)) return false;                                     // "#EXP-xxxxx" ซ้ำกับคอลัมน์อ้างอิง
      return true;
    });
    return keep.join(' · ');
  }

  // "C00266 - กองทุนสํารองเลี้ยงชีพไทยพาณิชย์" → "กองทุนสํารองเลี้ยงชีพไทยพาณิชย์"
  function glContact(v) { return txt(v).replace(/^[A-Z]\d{3,}\s*-\s*/, ''); }

  /* คืน { accounts:[…], skipped:[…], error }
     accounts[i] = { code, alias, bankName, acctNo, company, from, to, opening, lines:[…] }
     lines[i]    = { seq, docNo, iso, ref, payee, memo, desc, in, out } */
  function parseGL(aoa) {
    var out = { accounts: [], skipped: [], error: '', meta: {} };
    if (!aoa || !aoa.length) { out.error = 'ไฟล์ว่าง'; return out; }
    out.meta = readMeta(aoa);
    var company = out.meta['ชื่อกิจการ'] || '';
    var period = (out.meta['ช่วงวันที่'] || '').split('-');
    var from = toISO(txt(period[0])), to = toISO(txt(period[1]));

    // จุดเริ่มของแต่ละบล็อกบัญชี (ไฟล์จริงมีบล็อกเดียว แต่รองรับหลายบล็อกไว้ก่อน)
    var heads = [];
    for (var r = 0; r < aoa.length; r++) {
      var h = glAccountHead((aoa[r] || [])[0]);
      if (h) heads.push({ row: r, head: h });
    }
    if (!heads.length) { out.error = 'ไม่พบหัวบล็อกบัญชี (เช่น "111301 - BSV001 (…)") ที่คอลัมน์แรก'; return out; }

    heads.forEach(function (blk, bi) {
      var end = bi + 1 < heads.length ? heads[bi + 1].row : aoa.length;
      var hr = -1;
      for (var r = blk.row; r < end && r < blk.row + 8; r++) {
        if (txt((aoa[r] || [])[0]) === 'ลำดับที่') { hr = r; break; }
      }
      if (hr < 0) return;
      var idx = colIndex(aoa, hr);
      var g = function (row, name) { return idx[name] == null ? '' : row[idx[name]]; };
      var acctNo = pickBankAc(blk.head.desc);
      // ชื่อธนาคารในหัวบล็อก: "… - ธ.ไทยพาณิชย์ ออมทรัพย์ - 218-2-925534 …"
      var bankName = '';
      blk.head.desc.split(/\s+-\s+/).forEach(function (p) { if (!bankName && /^(ธ\.|ธนาคาร\s)/.test(txt(p))) bankName = txt(p); });
      var acc = { code: blk.head.code, alias: blk.head.alias, desc: blk.head.desc,
                  bankName: bankName, acctNo: acctNo, company: company,
                  from: from, to: to, opening: null, lines: [] };

      // ★ รับเฉพาะบัญชีเงินฝากธนาคาร — GL ของบัญชีอื่น (ลูกหนี้/ค่าใช้จ่าย) ไม่ใช่กระแสเงินสด
      //   เอาเข้ามาเมื่อไหร่ยอดในงบจะกลายเป็นตัวเลขคนละเรื่องแบบเงียบ ๆ
      if (!GL_BANK_PREFIX.test(acc.code)) { out.skipped.push(acc); return; }

      for (var i = hr + 1; i < end; i++) {
        var row = aoa[i] || [];
        var descRaw = txt(g(row, 'คำอธิบาย'));
        var dr = num(g(row, 'เดบิต')), cr = num(g(row, 'เครดิต'));
        if (/^ยอดยกมา/.test(descRaw)) { acc.opening = dr - cr; continue; }
        if (/^(รวม|ยอดยกไป)/.test(descRaw)) break;
        var iso = toISO(g(row, 'วันที่ออก'));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
        if (!dr && !cr) continue;
        var payee = glContact(g(row, 'ผู้ติดต่อ'));
        acc.lines.push({
          seq: acc.lines.length,
          docNo: txt(g(row, 'เลขที่รายวัน')),
          iso: iso,
          ref: txt(g(row, 'อ้างอิง')),
          payee: payee,
          memo: glMemo(descRaw, acc) || payee,
          desc: descRaw,
          in: dr, out: cr,
        });
      }
      if (acc.lines.length || acc.opening != null) out.accounts.push(acc);
    });

    if (!out.accounts.length) {
      out.error = out.skipped.length
        ? 'ไฟล์นี้เป็นบัญชีแยกประเภทของ "' + out.skipped.map(function (a) { return a.code + ' ' + a.alias; }).join(', ')
          + '" ซึ่งไม่ใช่บัญชีเงินฝากธนาคาร (ต้องเป็นรหัส 1113xx) — หน้านี้รับเฉพาะ GL ของบัญชีธนาคาร'
        : 'อ่านหัวตารางได้ แต่ไม่พบแถวรายการเดินบัญชี';
    }
    return out;
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
    // GL ไม่มี builder แบบ TSV (ไม่ได้ป้อน DataCrudPage) — อ่านผ่าน PeakImport.readGL แทน
    if (!BUILDERS[target]) {
      return { ok: false, message: 'รายงาน "' + REPORT_LABEL[target] + '" ไม่ได้นำเข้าด้วยวิธีนี้ — ใช้ปุ่มนำเข้าที่หน้า ' + TARGET_LABEL[target] };
    }
    var built = BUILDERS[target](aoa, det.headerRow);
    if (!built.rows.length) return { ok: false, message: 'อ่านไฟล์ PEAK ได้ แต่ไม่พบแถวข้อมูลที่ใช้ได้' };
    var note = 'อ่านไฟล์ PEAK (' + REPORT_LABEL[target] + ') ได้ ' + built.rows.length + ' รายการ';
    if (target === 'pv') note += ' จาก ' + (aoa.length - det.headerRow - 1) + ' บรรทัดบัญชี';
    if (built.skippedBook) note += ' · ข้ามสมุดที่ไม่ใช่ "จ่าย" ' + built.skippedBook + ' บรรทัด';
    return { ok: true, tsv: toTSV(built.cols, built.rows), count: built.rows.length, note: note };
  }

  /* ── readGL(ws) — อ่าน sheet "รายงานบัญชีแยกประเภท" ให้หน้า #cf_coding ────
   *    null                                   → ไม่ใช่ไฟล์ PEAK
   *    { ok:false, message }                  → เป็น PEAK แต่คนละรายงาน / อ่านไม่ได้
   *    { ok:true, accounts, skipped, meta }   → อ่านได้                          */
  function readGL(ws) {
    if (!root.XLSX || !ws) return null;
    var aoa;
    try { aoa = root.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }); }
    catch (_) { return null; }
    var det = detect(aoa);
    if (!det) {
      // GL ไม่มีแถว "ลำดับที่" ในบางรุ่น → detect คืน null ทั้งที่เป็น GL จริง จึงเช็คหัวรายงานซ้ำ
      var name = readMeta(aoa)['ชื่อรายงาน'] || '';
      if (name.indexOf('รายงานบัญชีแยกประเภท') !== 0) return null;
    } else if (det.kind !== 'gl') {
      return { ok: false, message: 'ไฟล์นี้เป็น "' + REPORT_LABEL[det.kind] + '" ของ PEAK ' +
               'ซึ่งต้องนำเข้าที่หน้า ' + TARGET_LABEL[det.kind] + ' — หน้านี้รับ "' + REPORT_LABEL.gl + '"' };
    }
    var p = parseGL(aoa);
    if (p.error) return { ok: false, message: p.error };
    return { ok: true, accounts: p.accounts, skipped: p.skipped, meta: p.meta };
  }

  root.PeakImport = { detect: detect, sheetToTSV: sheetToTSV, toISO: toISO,
                      readGL: readGL, parseGL: parseGL, readMeta: readMeta };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).PeakImport;
