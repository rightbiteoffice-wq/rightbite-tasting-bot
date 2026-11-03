'use strict';

/* ============================================================
 *  แจ้งเตือนเปิดเครื่องลดความชื้น — ผลิตพิสตาชิโอ้ข้ามคืน
 * ------------------------------------------------------------
 *  หลักสำคัญ: ระบบยึด "วัน-เวลาที่เริ่มเดินเครื่องจริง" ไม่ใช่ "วันที่ในแผนผลิต"
 *  เพราะบางครั้งแผนเขียนว่าผลิตพรุ่งนี้ แต่หน้างานเริ่มผลิตข้ามคืนตั้งแต่คืนนี้
 *  → ตอนแจ้งรอบ บอทให้เลือก "คืนที่เริ่มผลิตจริง" + เวลาเริ่ม แล้วแสดงวันที่เต็ม
 *    พร้อมนับถอยหลัง ("อีก 5 ชม.") ให้ทุกคนเห็นและทักท้วงได้ทันทีถ้าวันผิด
 *
 *  ไทม์ไลน์ของ 1 รอบ
 *   1) ตอนแจ้งรอบ                → ส่งแจ้งล่วงหน้าทุกคน ทุกคนต้องกด "รับทราบ"
 *   2) เวลาเริ่มผลิต − 60 นาที     → เตือน "ถึงเวลาเปิดเครื่องลดความชื้น" ทุกคน
 *   3) ยังไม่มีคนลงชื่อเปิดเครื่อง  → เตือนทุกคนซ้ำทุก 15 นาที (เลยเวลาเริ่มผลิต = ข้อความด่วนขึ้น)
 *      ยังไม่กด "รับทราบ"          → เตือนเฉพาะคนนั้นซ้ำทุก 30 นาที
 *   4) มีคนลงชื่อเปิดเครื่อง + รับทราบครบทุกคน → ปิดรอบ ✅
 *      ผลิตจบแล้วแต่ยังไม่ครบ → ปิดอัตโนมัติหลังเวลาเริ่มผลิต 16 ชม.
 *      และแจ้งฝ่ายผลิตว่าใครยังไม่รับทราบ / ไม่มีคนลงชื่อเปิดเครื่อง
 *
 *  ทุกอย่างบันทึกลงชีต "ลดความชื้น" — เซิร์ฟเวอร์รีสตาร์ทก็เตือนต่อได้
 * ============================================================ */

const MIN  = 60 * 1000;
const HOUR = 60 * MIN;
const DAY  = 24 * HOUR;
const BKK_OFFSET = 7 * HOUR;   // Asia/Bangkok = UTC+7 (ไม่มี DST)
const SLACK = 30 * 1000;       // เผื่อ tick คลาดเคลื่อนเล็กน้อย

const SHEET   = 'ลดความชื้น';
const HEADERS = ['รหัสรอบ', 'แจ้งเมื่อ', 'แจ้งโดย', 'เริ่มผลิต', 'ต้องเปิดเครื่องก่อน', 'สถานะ',
  'คนเปิดเครื่อง', 'เวลาเปิดเครื่อง', 'รับทราบแล้ว', 'ยังไม่รับทราบ', 'เตือนด่วน (รอบ)', 'ข้อมูลระบบ (ห้ามแก้)'];

const DEFAULTS = {
  leadMin:              60,  // เปิดเครื่องก่อนเริ่มผลิตกี่นาที (= เวลาที่เริ่มเตือนด่วน)
  urgentEveryMin:       15,  // ถึงเวลาแล้วแต่ยังไม่มีคนลงชื่อเปิดเครื่อง → เตือนทุกคนทุกกี่นาที
  ackEveryMin:          30,  // ยังไม่กด "รับทราบ" → เตือนคนนั้นทุกกี่นาที
  autoCloseHours:       16,  // หลังเวลาเริ่มผลิตกี่ ชม. ถือว่าผลิตจบ → ปิดรอบอัตโนมัติ
  pastGraceHours:        3,  // แจ้งย้อนหลังได้ไม่เกินกี่ ชม. (เริ่มผลิตไปแล้วแต่ลืมแจ้ง)
  maxAheadDays:         14,  // แจ้งล่วงหน้าได้ไม่เกินกี่วัน
  duplicateWindowHours:  6,  // รอบที่เวลาเริ่มห่างกันไม่ถึงกี่ ชม. ถือว่าซ้ำ
  nightCutoffHour:       6,  // "คืนวันที่ X" เวลา 00:00–05:59 = เช้ามืดของวันถัดไป
  recipientSyncMin:     10,  // ดึงรายชื่อใหม่ทุกกี่นาที (คนลงทะเบียนเพิ่มระหว่างรอบก็ได้รับแจ้ง)
  tickSec:              60,
};

// ============================================================
//  เวลาไทย (คำนวณเองเพื่อไม่ขึ้นกับ timezone ของเซิร์ฟเวอร์)
// ============================================================
const WD  = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const pad = n => String(n).padStart(2, '0');

function bkk(ms) {
  const d = new Date(ms + BKK_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(),
           hh: d.getUTCHours(), mm: d.getUTCMinutes(), wd: d.getUTCDay() };
}
function bkkMs(y, m, d, hh = 0, mm = 0) { return Date.UTC(y, m - 1, d, hh, mm) - BKK_OFFSET; }
function sameDay(a, b) { const x = bkk(a), y = bkk(b); return x.y === y.y && x.m === y.m && x.d === y.d; }

function fmtTime(ms)  { const p = bkk(ms); return `${pad(p.hh)}:${pad(p.mm)}`; }
function fmtDay(ms)   { const p = bkk(ms); return `${WD[p.wd]} ${p.d} ${MON[p.m - 1]}`; }
function fmtDT(ms)    { return `${fmtDay(ms)} ${fmtTime(ms)}`; }
function fmtShort(ms) { const p = bkk(ms); return `${WD[p.wd]} ${p.d}/${p.m}`; }
function fmtFull(ms)  { const p = bkk(ms); return `${pad(p.d)}/${pad(p.m)}/${p.y + 543} ${pad(p.hh)}:${pad(p.mm)}`; }
function fmtDur(ms) {
  let m = Math.round(Math.abs(ms) / MIN);
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60);   m -= h * 60;
  const out = [];
  if (d) out.push(`${d} วัน`);
  if (h) out.push(`${h} ชม.`);
  if (m || !out.length) out.push(`${m} นาที`);
  return out.join(' ');
}
function fmtRel(target, t) {
  return target >= t ? `อีก ${fmtDur(target - t)}` : `เริ่มไปแล้ว ${fmtDur(t - target)}`;
}

// "คืน" = วันที่ตามปฏิทินที่กะกลางคืนเริ่ม
function nightAt(t, addDays) {
  const p = bkk(t);
  const q = bkk(bkkMs(p.y, p.m, p.d, 12) + addDays * DAY);
  return { y: q.y, m: q.m, d: q.d };
}
const nightMs  = n => bkkMs(n.y, n.m, n.d, 12);
const nightTok = n => `${n.d}/${n.m}`;

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const q = bkk(bkkMs(y, m, d, 12));
  return q.y === y && q.m === m && q.d === d;
}

// "คืนนี้" / "พรุ่งนี้" / "มะรืน" / "3/11" / "3/11/2569"
function parseNight(raw, t) {
  const s = raw.trim();
  if (/^(คืน)?(วัน)?นี้$/.test(s))            return nightAt(t, 0);
  if (/^(คืน)?(วัน)?พรุ่งนี้$/.test(s))        return nightAt(t, 1);
  if (/^(คืน)?(วัน)?มะรืน(นี้)?$/.test(s))     return nightAt(t, 2);
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  let years;
  if (m[3]) {
    let y = +m[3];
    if (y < 100) y += y >= 50 ? 2500 : 2000;   // 69 → 2569, 26 → 2026
    if (y > 2400) y -= 543;                     // พ.ศ. → ค.ศ.
    years = [y];
  } else {
    const y0 = bkk(t).y;
    years = [y0 - 1, y0, y0 + 1];               // ไม่ระบุปี → เลือกปีที่ใกล้วันนี้ที่สุด
  }
  let best = null;
  for (const y of years) {
    if (!validDate(y, mo, d)) continue;
    const dist = Math.abs(bkkMs(y, mo, d, 12) - t);
    if (!best || dist < best.dist) best = { y, m: mo, d, dist };
  }
  return best ? { y: best.y, m: best.m, d: best.d } : null;
}

// "20:00" / "20.00" / "20" / "2ทุ่ม" / "ตี2" / "เที่ยงคืน" / "5โมงเย็น"
function parseTime(raw) {
  const s = raw.replace(/\s+/g, '').replace(/(น\.?|นาฬิกา)$/, '');
  let m;
  if (s === 'เที่ยงคืน') return { hh: 0, mm: 0 };
  if ((m = s.match(/^ตี([1-5])(ครึ่ง)?$/)))     return { hh: +m[1], mm: m[2] ? 30 : 0 };
  if ((m = s.match(/^([1-5])ทุ่ม(ครึ่ง)?$/)))   return { hh: 18 + +m[1], mm: m[2] ? 30 : 0 };
  if ((m = s.match(/^([1-6])โมงเย็น(ครึ่ง)?$/))) return { hh: 12 + +m[1], mm: m[2] ? 30 : 0 };
  if ((m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?$/))) {
    const hh = +m[1], mm = +(m[2] || 0);
    if (hh <= 23 && mm <= 59) return { hh, mm };
  }
  return null;
}

// ============================================================
//  LINE message builders
// ============================================================
const text = s => ({ type: 'text', text: String(s).slice(0, 5000) });
const lbl  = s => (s.length <= 20 ? s : s.slice(0, 20));          // LINE: label ≤ 20 ตัวอักษร
const quickReply = pairs => ({
  items: pairs.slice(0, 13).map(([label, msg]) => ({ type: 'action', action: { type: 'message', label: lbl(label), text: msg } })),
});
const postback = (label, data, displayText) => ({ type: 'postback', label: lbl(label), data, displayText });

// ============================================================
//  Factory
// ============================================================
function createDehumidifier(deps) {
  const {
    pushMessages, replyMessages, getSheetsClient, ensureSheet, loadAllUsers,
    spreadsheetId, producers = [], now = Date.now, options = {},
  } = deps;
  const opt  = { ...DEFAULTS, ...options };
  const LEAD = opt.leadMin * MIN;

  const runs = new Map();
  let loaded = false;
  let ticking = false;
  let sheetReady = false;
  let writeChain = Promise.resolve();

  const asMsgs = msgs => [].concat(msgs).map(m => (typeof m === 'string' ? text(m) : m));
  const reply  = (token, msgs) => replyMessages(token, asMsgs(msgs));
  const push   = (uid, msgs)   => pushMessages(uid, asMsgs(msgs));

  const activeRuns = () => [...runs.values()].filter(r => r.status === 'active').sort((a, b) => a.startAt - b.startAt);
  const pendingOf  = run => run.recipients.filter(r => !run.acks[r.userId]);
  const isUrgent   = (run, t) => run.status === 'active' && !run.machineOn && t >= run.alertAt;

  function startFromNight(night, time) {
    let ms = bkkMs(night.y, night.m, night.d, time.hh, time.mm);
    if (time.hh < opt.nightCutoffHour) ms += DAY;   // ตี1–ตี5 ของคืนนั้น = เช้ามืดวันถัดไป
    return ms;
  }
  function nextOccurrence(time, t) {
    const p = bkk(t);
    let ms = bkkMs(p.y, p.m, p.d, time.hh, time.mm);
    while (ms < t - opt.pastGraceHours * HOUR) ms += DAY;
    return ms;
  }

  // ---------- users ----------
  async function fetchUsers() {
    const users = await loadAllUsers();
    const seen = new Set(), out = [];
    for (const u of users || []) {
      if (!u || !u.userId || seen.has(u.userId)) continue;
      seen.add(u.userId);
      out.push({ userId: u.userId, name: u.name || '?' });
    }
    return out;
  }
  async function knownName(userId, st, run) {
    if (st && st.name) return st.name;
    for (const r of [run, ...runs.values()]) {
      const hit = r && r.recipients.find(p => p.userId === userId);
      if (hit) return hit.name;
    }
    const u = (await fetchUsers()).find(p => p.userId === userId);
    return u ? u.name : null;
  }
  function ensureRecipient(run, userId, name) {
    if (!run.recipients.some(r => r.userId === userId)) run.recipients.push({ userId, name });
  }

  // ---------- message content ----------
  function fmtAlert(run) { return sameDay(run.alertAt, run.startAt) ? fmtTime(run.alertAt) : fmtDT(run.alertAt); }
  function machineLine(run) {
    return run.machineOn
      ? `✅ เปิดแล้วโดย ${run.machineOn.name} (${fmtTime(run.machineOn.at)})`
      : `⏳ ยังไม่มีคนลงชื่อเปิด (ต้องเปิดก่อน ${fmtAlert(run)})`;
  }
  function buttons(run, { ack = true, on = !run.machineOn } = {}) {
    const actions = [];
    if (ack) actions.push(postback('✅ รับทราบ', `dh=ack&id=${run.id}`, 'รับทราบ ✅'));
    if (on)  actions.push(postback('✍️ เปิดเครื่องแล้ว', `dh=on&id=${run.id}`, 'ลงชื่อเปิดเครื่องลดความชื้น ✍️'));
    return {
      type: 'template',
      altText: `💨 ผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)} — กดรับทราบ / ลงชื่อเปิดเครื่องลดความชื้น`,
      template: {
        type: 'buttons',
        title: '💨 เครื่องลดความชื้น',
        text: `รอบผลิต ${fmtDT(run.startAt)}\nเปิดเครื่องก่อน ${fmtAlert(run)}`.slice(0, 60),
        actions,
      },
    };
  }
  function headsUpMsgs(run, t) {
    return [
      `🌙 แจ้งผลิตพิสตาชิโอ้ข้ามคืน\n` +
      `เริ่มผลิต: ${fmtDT(run.startAt)} (${fmtRel(run.startAt, t)})\n` +
      `💨 ต้องเปิดเครื่องลดความชื้นก่อน ${fmtAlert(run)}\n` +
      `แจ้งโดย: ${run.createdBy.name}\n\n` +
      `👉 ทุกคนกด "รับทราบ"\n` +
      `👉 คนที่เปิดเครื่อง กด "เปิดเครื่องแล้ว" เพื่อลงชื่อ\n` +
      `ระบบจะเตือนซ้ำจนกว่าจะครบครับ`,
      buttons(run),
    ];
  }
  function urgentMsgs(run, t, userId) {
    const late = t >= run.startAt;
    let s = late
      ? `🚨🚨 เลยเวลาเริ่มผลิตมา ${fmtDur(t - run.startAt)} แล้ว!\nยังไม่มีคนลงชื่อเปิดเครื่องลดความชื้น`
      : `🚨 ถึงเวลาเปิดเครื่องลดความชื้นแล้ว!\nยังไม่มีคนลงชื่อเปิดเครื่อง`;
    s += `\n\nผลิตพิสตาชิโอ้ข้ามคืน เริ่ม ${fmtDT(run.startAt)}`;
    if (!late) s += ` (${fmtRel(run.startAt, t)})`;
    s += `\n\n👉 ไปเปิดเครื่อง แล้วกด "เปิดเครื่องแล้ว" เพื่อลงชื่อ`;
    if (!run.acks[userId]) s += `\n👉 คุณยังไม่ได้กด "รับทราบ"`;
    s += `\n\n(เตือนครั้งที่ ${run.urgentRounds} • เตือนทุก ${opt.urgentEveryMin} นาทีจนกว่าจะมีคนลงชื่อ)`;
    return [s, buttons(run, { ack: !run.acks[userId], on: true })];
  }
  function ackReminderMsgs(run, t) {
    return [
      `🔔 คุณยังไม่ได้กด "รับทราบ"\n` +
      `ผลิตพิสตาชิโอ้ข้ามคืน เริ่ม ${fmtDT(run.startAt)} (${fmtRel(run.startAt, t)})\n` +
      `💨 เครื่องลดความชื้น: ${machineLine(run)}`,
      buttons(run, { ack: true }),
    ];
  }
  function statusText(t) {
    const act = activeRuns();
    if (!act.length) return 'ตอนนี้ไม่มีรอบผลิตพิสตาชิโอ้ข้ามคืนที่ต้องเตือนครับ\nแจ้งรอบใหม่ พิมพ์ "ข้ามคืน"';
    return act.map(run => {
      const acked = run.recipients.filter(r => run.acks[r.userId]).map(r => r.name);
      const pend  = pendingOf(run).map(r => r.name);
      return `💨 รอบผลิตข้ามคืน ${fmtDT(run.startAt)}\n(${fmtRel(run.startAt, t)})\n` +
        `เครื่องลดความชื้น: ${machineLine(run)}\n` +
        `รับทราบแล้ว ${acked.length}/${run.recipients.length}: ${acked.join(', ') || '-'}\n` +
        `ยังไม่รับทราบ: ${pend.join(', ') || '-'}`;
    }).join('\n─────────────────\n');
  }
  function statusLabel(run) {
    if (run.status === 'done')      return 'ครบ ✅';
    if (run.status === 'cancelled') return `ยกเลิก (${run.closeNote || ''})`;
    if (run.status === 'expired')   return 'ปิดอัตโนมัติ — ไม่ครบ ⚠️';
    return run.machineOn ? 'เปิดเครื่องแล้ว / รอรับทราบ' : 'รอเปิดเครื่อง';
  }

  // ---------- Google Sheets ----------
  function toRow(run) {
    const acked = run.recipients.filter(r => run.acks[r.userId]).map(r => `${r.name} ${fmtTime(run.acks[r.userId])}`);
    return [
      run.id, fmtFull(run.createdAt), run.createdBy.name, fmtFull(run.startAt), fmtFull(run.alertAt),
      statusLabel(run),
      run.machineOn ? run.machineOn.name : '', run.machineOn ? fmtFull(run.machineOn.at) : '',
      acked.join(', '), pendingOf(run).map(r => r.name).join(', '),
      run.urgentRounds, JSON.stringify(run),
    ];
  }
  async function writeRun(run) {
    const sheets = await getSheetsClient();
    if (!sheetReady) { await ensureSheet(sheets, SHEET, HEADERS); sheetReady = true; }
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET}!A:A` });
    const idx = (res.data.values || []).findIndex(r => r[0] === run.id);
    const row = toRow(run);   // สร้างแถวตอนเขียนจริง → ได้สถานะล่าสุดเสมอ
    if (idx === -1) {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range: `${SHEET}!A:L`, valueInputOption: 'RAW', requestBody: { values: [row] },
      });
    } else {
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${SHEET}!A${idx + 1}:L${idx + 1}`, valueInputOption: 'RAW', requestBody: { values: [row] },
      });
    }
  }
  // เขียนทีละรายการตามลำดับ กันแถวทับกันเวลาหลายคนกดพร้อมกัน
  function persist(run) {
    writeChain = writeChain.then(() => writeRun(run)).catch(e => console.error('dehumid persist:', e.message));
    return writeChain;
  }
  async function loadFromSheet() {
    try {
      const sheets = await getSheetsClient();
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET}!A:L` });
      for (const row of (res.data.values || []).slice(1)) {
        let run;
        try { run = JSON.parse(row[11] || ''); } catch (e) { continue; }
        if (run && run.id && run.status === 'active' && !runs.has(run.id)) runs.set(run.id, run);
      }
      loaded = true;
    } catch (e) {
      if (/Unable to parse range/i.test(e.message)) { loaded = true; return; }   // ยังไม่มีชีต = ยังไม่มีรอบ
      console.error('dehumid load:', e.message);
    }
  }
  async function ensureLoaded() { if (!loaded) await loadFromSheet(); }

  // ---------- actions ----------
  function completeIfReady(run, t) {
    if (run.status !== 'active' || !run.machineOn || pendingOf(run).length) return false;
    run.status = 'done';
    run.closedAt = t;
    return true;
  }
  async function notifyComplete(run, actorId) {
    if (run.createdBy.userId === actorId) return;
    await push(run.createdBy.userId,
      `✅ ครบแล้ว — รอบผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)}\n` +
      `💨 เปิดเครื่องลดความชื้นโดย ${run.machineOn.name} (${fmtTime(run.machineOn.at)})\n` +
      `👥 รับทราบครบ ${run.recipients.length} คน`);
  }

  async function createRun(ctx, startAt) {
    const t = now();
    const name = await knownName(ctx.userId, ctx.st);
    if (!name) return reply(ctx.token, 'กรุณาลงทะเบียนก่อนครับ — พิมพ์ชื่อของคุณ');
    if (startAt < t - opt.pastGraceHours * HOUR) {
      return reply(ctx.token,
        `❌ เวลาเริ่มผลิต ${fmtDT(startAt)} ผ่านมาแล้ว ${fmtDur(t - startAt)}\n\n` +
        `• ถ้าหมายถึงหลังเที่ยงคืน ให้เลือกคืนก่อนหน้า แล้วใส่เวลา ตี1–ตี5\n` +
        `• ถ้ากำลังจะเริ่มผลิตเลย พิมพ์ "ข้ามคืน ตอนนี้"`);
    }
    if (startAt > t + opt.maxAheadDays * DAY) {
      return reply(ctx.token, `❌ ${fmtDT(startAt)} ไกลเกิน ${opt.maxAheadDays} วันครับ ตรวจสอบวันที่อีกครั้ง`);
    }
    const dup = activeRuns().find(r => Math.abs(r.startAt - startAt) < opt.duplicateWindowHours * HOUR);
    if (dup) {
      return reply(ctx.token,
        `⚠️ มีรอบผลิตข้ามคืน ${fmtDT(dup.startAt)} อยู่แล้วครับ (แจ้งโดย ${dup.createdBy.name})\n` +
        `ถ้าเวลาเปลี่ยน พิมพ์ "ยกเลิกข้ามคืน" แล้วแจ้งใหม่\nดูสถานะ พิมพ์ "ลดความชื้น"`);
    }

    const users = await fetchUsers();
    const recipients = users.some(u => u.userId === ctx.userId) ? users : [...users, { userId: ctx.userId, name }];
    const run = {
      id: t.toString(36),
      startAt, alertAt: startAt - LEAD, createdAt: t,
      createdBy: { userId: ctx.userId, name },
      recipients,
      acks: { [ctx.userId]: t },     // คนแจ้งรอบ = รับทราบแล้ว
      machineOn: null,
      status: 'active', closedAt: null, closeNote: '',
      alertSentAt: null, urgentRounds: 0,
      lastPush: { [ctx.userId]: t }, lastRecipientSync: t,
    };
    const urgent = t >= run.alertAt;   // แจ้งช้า/เริ่มเลย → เตือนด่วนทันที
    if (urgent) { run.alertSentAt = t; run.urgentRounds = 1; }
    runs.set(run.id, run);

    const others = recipients.filter(r => r.userId !== ctx.userId);
    let s = `✅ แจ้งรอบผลิตพิสตาชิโอ้ข้ามคืนแล้ว\n` +
      `เริ่มผลิต: ${fmtDT(run.startAt)} (${fmtRel(run.startAt, t)})\n` +
      `💨 เปิดเครื่องลดความชื้นก่อน: ${fmtAlert(run)}\n\n`;
    s += urgent
      ? `🚨 ถึงเวลาเปิดเครื่องแล้ว — แจ้งด่วนทุกคน (${others.length} คน) แล้ว\nเปิดแล้วกด "เปิดเครื่องแล้ว" เพื่อลงชื่อ`
      : `ส่งแจ้งเตือนให้ทุกคน (${others.length} คน) แล้ว ทุกคนต้องกดรับทราบ\n` +
        `ถึง ${fmtAlert(run)} ถ้ายังไม่มีคนลงชื่อเปิดเครื่อง ระบบจะเตือนทุกคนซ้ำทุก ${opt.urgentEveryMin} นาที`;
    s += `\n\n⚠️ เช็กวันที่อีกครั้ง: ต้องเป็น "คืนที่เริ่มเดินเครื่องจริง"\n` +
         `ผิด → พิมพ์ "ยกเลิกข้ามคืน" แล้วแจ้งใหม่\nดูสถานะ → พิมพ์ "ลดความชื้น"`;
    await reply(ctx.token, [s, buttons(run, { ack: false })]);

    for (const r of others) {
      await push(r.userId, urgent ? urgentMsgs(run, t, r.userId) : headsUpMsgs(run, t));
      run.lastPush[r.userId] = t;
    }
    persist(run);
  }

  async function onCreate(ctx, argsRaw) {
    const t = now();
    const args = (argsRaw || '').trim();
    if (!args) {
      const n0 = nightAt(t, 0), n1 = nightAt(t, 1), n2 = nightAt(t, 2);
      return reply(ctx.token, {
        type: 'text',
        text: `🌙 แจ้งผลิตพิสตาชิโอ้ข้ามคืน\nเลือก "คืนที่เริ่มเดินเครื่องจริง" ครับ\n\n` +
          `⚠️ ดูวันที่เริ่มผลิตจริง ไม่ใช่วันที่ในแผน\n` +
          `เช่น แผนเขียนพรุ่งนี้ แต่จะเริ่มผลิตคืนนี้ → เลือก "คืนนี้"\n\n` +
          `ระบบจะเตือนเปิดเครื่องลดความชื้นก่อนเริ่มผลิต ${opt.leadMin} นาที\n\n` +
          `พิมพ์เองก็ได้ เช่น\nข้ามคืน คืนนี้ 20:00\nข้ามคืน ${nightTok(n1)} 2ทุ่ม\nข้ามคืน พรุ่งนี้ ตี2`,
        quickReply: quickReply([
          ['🚨 เริ่มผลิตตอนนี้', 'ข้ามคืน ตอนนี้'],
          [`คืนนี้ ${fmtShort(nightMs(n0))}`,   `ข้ามคืน ${nightTok(n0)}`],
          [`พรุ่งนี้ ${fmtShort(nightMs(n1))}`, `ข้ามคืน ${nightTok(n1)}`],
          [`มะรืน ${fmtShort(nightMs(n2))}`,    `ข้ามคืน ${nightTok(n2)}`],
        ]),
      });
    }
    if (/^(ตอนนี้|เดี๋ยวนี้|เริ่มเลย|now)$/i.test(args)) return createRun(ctx, t);

    const toks  = args.split(/\s+/);
    const night = parseNight(toks[0], t);
    if (night) {
      const rest = toks.slice(1).join('');
      if (!rest) return reply(ctx.token, timePicker(night, t));
      const time = parseTime(rest);
      if (!time) return reply(ctx.token, `ไม่เข้าใจเวลา "${rest}" ครับ\nตัวอย่าง: 20:00, 2ทุ่ม, ตี2, เที่ยงคืน`);
      return createRun(ctx, startFromNight(night, time));
    }
    const time = parseTime(args);
    if (time) return createRun(ctx, nextOccurrence(time, t));
    return reply(ctx.token,
      `ไม่เข้าใจครับ 🙏\nพิมพ์ "ข้ามคืน" แล้วกดเลือกจากปุ่ม\nหรือพิมพ์ เช่น\nข้ามคืน คืนนี้ 20:00\nข้ามคืน 5/11 ตี1`);
  }

  function timePicker(night, t) {
    const items = [];
    if (sameDay(nightMs(night), t)) items.push(['🚨 เริ่มผลิตตอนนี้', 'ข้ามคืน ตอนนี้']);
    const slots = [['17:00', 17], ['18:00', 18], ['19:00', 19], ['20:00', 20], ['21:00', 21], ['22:00', 22],
      ['23:00', 23], ['เที่ยงคืน', 0], ['ตี 1', 1], ['ตี 2', 2], ['ตี 3', 3], ['ตี 4', 4]];
    for (const [label, hh] of slots) {
      if (startFromNight(night, { hh, mm: 0 }) <= t) continue;
      items.push([label, `ข้ามคืน ${nightTok(night)} ${pad(hh)}:00`]);
    }
    const nm = nightMs(night);
    const msg = {
      type: 'text',
      text: `คืน ${fmtDay(nm)} เริ่มเดินเครื่องกี่โมงครับ?\n(เที่ยงคืน–ตี 5 = เช้ามืดของ ${fmtDay(nm + DAY)})\n\n` +
            `หรือพิมพ์เอง เช่น ข้ามคืน ${nightTok(night)} 19:30`,
    };
    if (items.length) msg.quickReply = quickReply(items);
    return msg;
  }

  async function doAck(run, userId, name, t) {
    ensureRecipient(run, userId, name);
    const already = !!run.acks[userId];
    if (!already) run.acks[userId] = t;
    return already;
  }

  async function onAckButton(run, userId, token) {
    const t = now();
    const name = await knownName(userId, null, run) || '?';
    const already = await doAck(run, userId, name, t);
    const done = completeIfReady(run, t);
    let s = already ? `รับทราบไปแล้วเมื่อ ${fmtTime(run.acks[userId])} ครับ` : `✅ บันทึกแล้ว: ${name} รับทราบ`;
    s += `\nรอบผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)}\n💨 เครื่องลดความชื้น: ${machineLine(run)}`;
    if (!run.machineOn) s += `\nถ้าคุณเป็นคนเปิดเครื่อง กด "เปิดเครื่องแล้ว" เพื่อลงชื่อ`;
    if (done) s += `\n\n🎉 ครบทุกคนแล้ว ปิดรอบเรียบร้อยครับ`;
    await reply(token, s);
    if (done) await notifyComplete(run, userId);
    if (!already || done) persist(run);
  }

  async function askConfirmOn(run, userId, token, st) {
    const t = now();
    const name = await knownName(userId, st, run);
    if (!name) return reply(token, 'กรุณาลงทะเบียนก่อนครับ — พิมพ์ชื่อของคุณ');
    if (run.machineOn) {
      const already = await doAck(run, userId, name, t);
      const done = completeIfReady(run, t);
      await reply(token, `เครื่องลดความชื้นเปิดแล้วโดย ${run.machineOn.name} (${fmtTime(run.machineOn.at)}) ครับ` +
        (already ? '' : '\n✅ บันทึกรับทราบของคุณแล้ว') + (done ? '\n\n🎉 ครบทุกคนแล้ว ปิดรอบเรียบร้อยครับ' : ''));
      if (done) await notifyComplete(run, userId);
      if (!already || done) persist(run);
      return;
    }
    return reply(token, {
      type: 'template',
      altText: 'ยืนยันลงชื่อเปิดเครื่องลดความชื้น',
      template: {
        type: 'confirm',
        text: `ยืนยันลงชื่อ ✍️\n"${name}" เปิดเครื่องลดความชื้นแล้ว\nรอบผลิตข้ามคืน ${fmtDT(run.startAt)}`,
        actions: [
          postback('ยืนยัน ✍️', `dh=on_ok&id=${run.id}`, 'ยืนยัน: เปิดเครื่องลดความชื้นแล้ว'),
          postback('ยังไม่ได้เปิด', `dh=on_no&id=${run.id}`, 'ยังไม่ได้เปิดเครื่อง'),
        ],
      },
    });
  }

  async function confirmOn(run, userId, token) {
    const t = now();
    const name = await knownName(userId, null, run);
    if (!name) return reply(token, 'กรุณาลงทะเบียนก่อนครับ — พิมพ์ชื่อของคุณ');
    if (run.machineOn) return askConfirmOn(run, userId, token);   // มีคนลงชื่อตัดหน้าไปแล้ว

    run.machineOn = { userId, name, at: t };
    await doAck(run, userId, name, t);
    const done = completeIfReady(run, t);
    const pend = pendingOf(run).map(r => r.name);
    await reply(token,
      `✍️ ลงชื่อเรียบร้อย\n${name} เปิดเครื่องลดความชื้น ${fmtTime(t)}\nรอบผลิตข้ามคืน ${fmtDT(run.startAt)}\nขอบคุณครับ 🙏` +
      (done ? '\n\n🎉 ครบทุกคนแล้ว ปิดรอบเรียบร้อยครับ' : `\n\nยังไม่รับทราบ: ${pend.join(', ')}`));

    for (const r of run.recipients) {
      if (r.userId === userId) continue;
      const needAck = !run.acks[r.userId];
      const msgs = [`✅ ${name} เปิดเครื่องลดความชื้นแล้ว (${fmtTime(t)})\nรอบผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)}` +
        (needAck ? `\n\n🔔 คุณยังไม่ได้กด "รับทราบ"` : '')];
      if (needAck) msgs.push(buttons(run, { ack: true, on: false }));
      await push(r.userId, msgs);
      run.lastPush[r.userId] = t;
    }
    if (done) await notifyComplete(run, userId);
    persist(run);
  }

  async function onCancel(ctx, id) {
    const t = now();
    const name = await knownName(ctx.userId, ctx.st);
    const act = activeRuns();
    if (!act.length) return reply(ctx.token, 'ตอนนี้ไม่มีรอบผลิตข้ามคืนที่ยกเลิกได้ครับ');
    const allowed = r => producers.includes(name) || r.createdBy.userId === ctx.userId;
    if (!id) {
      const mine = act.filter(allowed);
      if (!mine.length) return reply(ctx.token, `ยกเลิกได้เฉพาะฝ่ายผลิต (${producers.join(' / ')}) หรือคนที่แจ้งรอบครับ`);
      return reply(ctx.token, {
        type: 'text',
        text: 'เลือกรอบที่จะยกเลิกครับ\n' + mine.map(r => `• ${fmtDT(r.startAt)} (แจ้งโดย ${r.createdBy.name})`).join('\n'),
        quickReply: quickReply(mine.map(r => [`${fmtShort(r.startAt)} ${fmtTime(r.startAt)}`, `ยกเลิกข้ามคืน ${r.id}`])),
      });
    }
    const run = runs.get(id);
    if (!run || run.status !== 'active') return reply(ctx.token, 'ไม่พบรอบนี้ หรือรอบนี้ปิดไปแล้วครับ');
    if (!allowed(run)) return reply(ctx.token, `ยกเลิกได้เฉพาะฝ่ายผลิต (${producers.join(' / ')}) หรือคนที่แจ้งรอบครับ`);

    run.status = 'cancelled';
    run.closedAt = t;
    run.closeNote = `โดย ${name}`;
    await reply(ctx.token, `❌ ยกเลิกรอบผลิตข้ามคืน ${fmtDT(run.startAt)} แล้ว แจ้งทุกคนแล้วครับ\nถ้าเปลี่ยนวัน/เวลา พิมพ์ "ข้ามคืน" เพื่อแจ้งรอบใหม่`);
    for (const r of run.recipients) {
      if (r.userId === ctx.userId) continue;
      await push(r.userId, `❌ ยกเลิกรอบผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)}\nโดย ${name}\nรอบนี้ไม่ต้องกดรับทราบแล้วครับ`);
    }
    persist(run);
  }

  // ---------- entry points ----------
  const CREATE_RE = /^(?:แจ้ง)?\s*(?:ผลิต)?\s*(?:พิสตาชิโอ้?|pistachio)?\s*ข้ามคืน\s*(.*)$/i;
  const CANCEL_RE = /^ยกเลิก\s*(?:ผลิต)?\s*(?:พิสตาชิโอ้?|pistachio)?\s*ข้ามคืน\s*(\S*)$/i;

  // คืนค่า true ถ้าข้อความนี้เป็นคำสั่งของระบบลดความชื้น (จัดการแล้ว)
  async function handleText(event, st) {
    const msg = ((event.message && event.message.text) || '').trim();
    const ctx = { userId: event.source.userId, token: event.replyToken, st };
    let m;
    if ((m = msg.match(CANCEL_RE))) { await ensureLoaded(); await onCancel(ctx, m[1]); return true; }
    if ((m = msg.match(CREATE_RE))) { await ensureLoaded(); await onCreate(ctx, m[1]); return true; }

    if (/^(ลดความชื้น|สถานะข้ามคืน|สถานะลดความชื้น)$/.test(msg)) {
      await ensureLoaded();
      await reply(ctx.token, statusText(now()));
      return true;
    }
    if (/^รับทราบ(ครับ|ค่ะ|คะ|จ้า|จ้ะ)?$/.test(msg)) {
      await ensureLoaded();
      const act = activeRuns();
      if (!act.length) { await reply(ctx.token, 'ตอนนี้ไม่มีรอบผลิตข้ามคืนที่ต้องรับทราบครับ'); return true; }
      const name = await knownName(ctx.userId, st);
      if (!name) { await reply(ctx.token, 'กรุณาลงทะเบียนก่อนครับ — พิมพ์ชื่อของคุณ'); return true; }
      const t = now();
      const targets = act.filter(r => !r.acks[ctx.userId]);
      if (!targets.length) { await reply(ctx.token, `รับทราบครบทุกรอบแล้วครับ\n\n${statusText(t)}`); return true; }
      const done = [];
      for (const run of targets) {
        await doAck(run, ctx.userId, name, t);
        if (completeIfReady(run, t)) done.push(run);
      }
      await reply(ctx.token, `✅ บันทึกแล้ว: ${name} รับทราบ\n` +
        targets.map(r => `• รอบ ${fmtDT(r.startAt)}\n  💨 ${machineLine(r)}`).join('\n') +
        (done.length ? '\n\n🎉 ครบทุกคนแล้ว ปิดรอบเรียบร้อยครับ' : ''));
      for (const run of done) await notifyComplete(run, ctx.userId);
      targets.forEach(persist);
      return true;
    }
    if (/^เปิดเครื่อง(ลดความชื้น)?แล้ว(ครับ|ค่ะ|คะ)?$/.test(msg)) {
      await ensureLoaded();
      const act = activeRuns();
      if (!act.length) { await reply(ctx.token, 'ตอนนี้ไม่มีรอบผลิตข้ามคืนครับ'); return true; }
      await askConfirmOn(act.find(r => !r.machineOn) || act[0], ctx.userId, ctx.token, st);
      return true;
    }
    return false;
  }

  async function handlePostback(event) {
    const data = new URLSearchParams((event.postback && event.postback.data) || '');
    const action = data.get('dh');
    if (!action) return false;
    await ensureLoaded();
    const userId = event.source.userId, token = event.replyToken;
    const run = runs.get(data.get('id'));
    if (!run) { await reply(token, 'รอบนี้ปิดไปแล้วครับ'); return true; }
    if (run.status !== 'active') {
      await reply(token, `รอบผลิตข้ามคืน ${fmtDT(run.startAt)} ${statusLabel(run)} แล้วครับ`);
      return true;
    }
    if (action === 'ack')        await onAckButton(run, userId, token);
    else if (action === 'on')    await askConfirmOn(run, userId, token);
    else if (action === 'on_ok') await confirmOn(run, userId, token);
    else if (action === 'on_no') await reply(token, `ยังไม่ได้ลงชื่อครับ\nเปิดเครื่องแล้วกด "เปิดเครื่องแล้ว" อีกครั้ง (ต้องเปิดก่อน ${fmtAlert(run)})`);
    return true;
  }

  // เรียกทุก 1 นาที
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      await ensureLoaded();
      for (const run of activeRuns()) {
        const t = now();
        let changed = false;

        // 1) ผลิตจบแล้ว → ปิดรอบอัตโนมัติ แจ้งฝ่ายผลิตว่าใครขาด
        if (t >= run.startAt + opt.autoCloseHours * HOUR) {
          const ok = run.machineOn && !pendingOf(run).length;
          run.status = ok ? 'done' : 'expired';
          run.closedAt = t;
          if (!ok) {
            const msg = `⚠️ ปิดรอบอัตโนมัติ (ผลิตจบแล้ว)\nรอบผลิตพิสตาชิโอ้ข้ามคืน ${fmtDT(run.startAt)}\n` +
              `💨 เครื่องลดความชื้น: ${run.machineOn ? `เปิดโดย ${run.machineOn.name} (${fmtTime(run.machineOn.at)})` : '❌ ไม่มีคนลงชื่อเปิดเครื่อง'}\n` +
              `🔕 ไม่ได้กดรับทราบ: ${pendingOf(run).map(r => r.name).join(', ') || '-'}\n(บันทึกในชีต "${SHEET}" แล้ว)`;
            const to = run.recipients.filter(r => producers.includes(r.name) || r.userId === run.createdBy.userId);
            for (const r of to) await push(r.userId, msg);
          }
          persist(run);
          continue;
        }

        // 2) ถึงเวลาเปิดเครื่อง (เริ่มผลิต − lead) และยังไม่มีคนลงชื่อ → เตือนด่วนทุกคน
        if (isUrgent(run, t) && !run.alertSentAt) {
          run.alertSentAt = t;
          run.urgentRounds = 1;
          changed = true;
          for (const r of [...run.recipients]) {
            if (!isUrgent(run, t)) break;   // มีคนลงชื่อระหว่างส่ง
            await push(r.userId, urgentMsgs(run, t, r.userId));
            run.lastPush[r.userId] = t;
          }
        } else {
          // 3) เตือนซ้ำ
          let bumped = false;
          for (const r of [...run.recipients]) {
            if (run.status !== 'active') break;
            const last = run.lastPush[r.userId] || run.createdAt;
            if (isUrgent(run, t)) {
              if (t - last >= opt.urgentEveryMin * MIN - SLACK) {
                if (!bumped) { run.urgentRounds++; bumped = true; }
                await push(r.userId, urgentMsgs(run, t, r.userId));
                run.lastPush[r.userId] = t;
                changed = true;
              }
            } else if (!run.acks[r.userId] && t - last >= opt.ackEveryMin * MIN - SLACK) {
              await push(r.userId, ackReminderMsgs(run, t));
              run.lastPush[r.userId] = t;
              changed = true;
            }
          }
        }

        // 4) มีคนลงทะเบียนใหม่ระหว่างรอบ → ส่งแจ้งเตือนให้ด้วย ("ทุกคน" ต้องรับทราบ)
        if (run.status === 'active' && t - (run.lastRecipientSync || 0) >= opt.recipientSyncMin * MIN) {
          run.lastRecipientSync = t;
          for (const u of await fetchUsers()) {
            if (run.recipients.some(r => r.userId === u.userId)) continue;
            run.recipients.push(u);
            await push(u.userId, isUrgent(run, t) ? urgentMsgs(run, t, u.userId) : headsUpMsgs(run, t));
            run.lastPush[u.userId] = t;
            changed = true;
          }
        }

        if (changed) persist(run);
      }
    } finally {
      ticking = false;
    }
  }

  function start() {
    loadFromSheet().catch(() => {});
    return setInterval(() => { tick().catch(e => console.error('dehumid tick:', e.message)); }, opt.tickSec * 1000);
  }

  return { handleText, handlePostback, tick, start, flush: () => writeChain, _runs: runs };
}

module.exports = createDehumidifier;
module.exports._internal = { parseNight, parseTime, bkk, bkkMs, fmtDT, fmtDur, nightAt };
