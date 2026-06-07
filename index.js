const express = require('express');
const axios   = require('axios');
const { google } = require('googleapis');
const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN  = 'cRbj67xp/XAnqhUcOSykcYib52DolldWfm3eipUH+AwoGC/wicP0xEK0sAXz07+MQfxaHfFeE9uYbA+30vTqtzgSRkZ3xMJ8ItOr4U4f+nXJkRu/Ar9ETavDNV7oWWPBhvTLK46mNpQX+NQ/CR83IQdB04t89/1O/w1cDnyilFU=';
const SPREADSHEET_ID        = '1zBP9vpR5Uw2Xnrya7v2DbB5VtWfVvAp_gJm1ByMnMXg';
const SERVICE_ACCOUNT_EMAIL = 'rightbite-bot@rightbite-bot.iam.gserviceaccount.com';
const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3lrLxUw0sw7uo\n7idg9Tav14EtdoV0NpK0hKr7LULdUSB9G0PMOpHAUuSYeSWRSWhDUCwbSwSkhsJB\nVsodHevKZE/GLcnQaSK4tQUWIONr/2whfwTy3qzT7lpkh05Umc+EWSqzGZ9BeIcc\ncDdgi8nFbewOePZORpRv5a2UQKx8pUS++VXhnphFcykQbK5L2+q320z9Fy0QyFBg\nHyzcTQo3JBAw3qndG/Qqn/kuwrn2gu0f60InTITI+0GUNjcAbXesO9Z18RcHvN6C\nqTK7xLP671DBu4Ylb6tgRf09JJKHucy2VS4paWA4UxtYXWLTefmqazDhYHsp4Q1J\nsGS9QkYFAgMBAAECggEADC34wCQrjGvjMBwLS8Do4ws6htrFPsZSFEd1lRqrGXCv\nkEKLTGoZpPc63YIIA9apY/HWg0Gw/1NGDDym8FM9rdyFeFctpjXGDRf2oZcGpMcP\naZIk22dPcvNDVvECZCrHcXcoQIqIyLindLOzJiS6pZjwdK4CCoO0hvnnT/MRyREM\nXiUZoNeUKWj8McqVDvh2oM8BQziYtS5yIIXj0Fog5FKosOKXj2bfXytUREi/tLXN\nMJVzZFi/xCqO2E3lJnHZxedz8/sFjMqCrGhUnNAgTtbJXnJGqlqbkQ97T3jt4sFW\nu4J9WVtAybQAZs1esJt0tvm//4oigHPfQBRwOLlkLwKBgQDeUuDB56rY8mCcWTGj\n8mf4OckLSjvH2oFcsg39yQXLsjevqNrU4e2+KTirW9cytmQC4PYVlWTxYJ7ZkNZb\njMEIa2YJN4Oke7rSVvlikUUwF4GGUxi/Nl44E33eErpC/+oLet5qam9jy3NmkHiz\nanFdxAHk5p7j4Wh3le+UEuE7iwKBgQDTZcczIdTBtbUP1bbQmE5RMdBirX9XQD0K\nuTRJMaTjXb7fNXVgENAiW1SsGoRfDrraweh8phKNLmJpUQ/pK6TOfwJDtE58ESlN\nir+F6PXlWzbnBjavxs7DhhGrm1UzZQogCbABFBdZSpGvI9F7ItcXdqtNfkvADWH2\ng2vacJn2rwKBgCCDHjs9Fc8EIvy6TngbSvkR+kScZoGjgqd7onAqpZ5UQbB+kQHw\nyEO244Kru5y+74E8RMCDSG/EIXbPp4lb3B7PFezjIW08auW3smCnveZ6iYaLQGM2\nIDEzKIUBWBvUMPXc0gnd5sxBRG8LUZtrRYjg0SYYU8Qfgpd6Zb7Rw/5hAoGASzIY\n+Yc/Nuh7z3Yl4W1L7nXZukAc29xt2jKm9qJCFN5z1tIdPl68qnvyUoXcMDP9I3N2\nT2CDmNS3DN9Y2Yg8x3dGRu8MO/Wey4ZfOjLzxPH9RZBgQ4ZkZgh6oKBQXkfCokLP\n6JJM++YajEIhcbui5yW/KYGTUG1yO03kP39uROECgYEAj6QJLbQTOmgJDWrG9pMh\nTLtRWtUyMwierD/IEe7A7P6ncK0aIXI0qWq321MFFRP+A0Iji4duLBa7DXsJvOii\n0YEtSwuSrGv0nY8Ls+HV9wiTz92KMZZn5CvK8/pK7lTtL1jdMB5sMWR40vbnOfHr\nxyu1xYbhO7IpWJSmtdH/bAs=\n-----END PRIVATE KEY-----\n";

const TASTERS    = ['ดิว','แอน','อร','เอิน','ทดสอบ'];
const PRODUCERS  = ['บอย','เก๋'];
const PASS_SCORE = 4;
const CRITERIA   = [
  { key:'color',   label:'สี (Color)',           hint:'สีสม่ำเสมอ ตรงตามสูตร ไม่มีจุดด่างหรือสีผิดปกติ' },
  { key:'aroma',   label:'กลิ่น (Aroma)',         hint:'กลิ่นถั่วหอม ไม่เหม็นหืดหรือฉุน' },
  { key:'texture', label:'เนื้อสัมผัส (Texture)', hint:'เนียน ไม่แยกชั้น ไม่แข็งหรือเหลวเกิน' },
  { key:'taste',   label:'รสชาติ (Taste)',         hint:'รสชาติตรงตามสูตร ไม่มีรสผิดปกติ' },
  { key:'overall', label:'Overall',                hint:'ประเมินรวมทั้งหมด' },
];

// In-memory session
const state  = {};
const config = {};
const scores = [];

// ============================================================
//  Google Sheets helpers
// ============================================================
async function getSheetsClient() {
  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL, null, PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheet(sheets, name, headers) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const exists = meta.data.sheets.some(s => s.properties.title === name);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: name } } }] }
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: `${name}!A1`,
      valueInputOption: 'RAW', requestBody: { values: [headers] }
    });
  }
}

async function saveUserToSheet(userId, name) {
  try {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets, '_users', ['userId','name']);
    const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '_users!A:B' });
    const rows = res.data.values || [];
    const idx  = rows.findIndex(r => r[0] === userId);
    if (idx === -1) {
      await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: '_users!A:B', valueInputOption: 'RAW', requestBody: { values: [[userId, name]] } });
    } else {
      await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: `_users!A${idx+1}:B${idx+1}`, valueInputOption: 'RAW', requestBody: { values: [[userId, name]] } });
    }
  } catch(e) { console.error('saveUserToSheet:', e.message); }
}

async function loadAllUsers() {
  try {
    const sheets = await getSheetsClient();
    const res  = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: '_users!A:B' });
    const rows = res.data.values || [];
    return rows.slice(1).map(r => ({ userId: r[0], name: r[1] }));
  } catch(e) { return []; }
}

async function saveScoreToSheet(userId, name, sku, sc, avg, passed, note) {
  try {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets, 'ผลการชิม', ['วันที่','SKU','userId','ชื่อ','สี','กลิ่น','เนื้อสัมผัส','รสชาติ','Overall','เฉลี่ย','ผล','หมายเหตุ']);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: 'ผลการชิม!A:L',
      valueInputOption: 'RAW',
      requestBody: { values: [[today(), sku, userId, name, sc.color, sc.aroma, sc.texture, sc.taste, sc.overall, avg.toFixed(1), passed?'ผ่าน':'ไม่ผ่าน', note||'']] }
    });
  } catch(e) { console.error('saveScoreToSheet:', e.message); }
}

async function saveSummaryToSheet(sku, rows, passCount, verdict, triggerX, triggerName, emergency) {
  try {
    const sheets = await getSheetsClient();
    await ensureSheet(sheets, 'สรุปรายวัน', ['วันที่','SKU','คน1','คะแนน1','หมายเหตุ1','คน2','คะแนน2','หมายเหตุ2','คน3','คะแนน3','หมายเหตุ3','เสียงผ่าน','ผล','trigger X','ชื่อที่ผิดแผก','โหมดฉุกเฉิน']);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID, range: 'สรุปรายวัน!A:P',
      valueInputOption: 'RAW',
      requestBody: { values: [[
        today(), sku,
        rows[0]?rows[0].name:'', rows[0]?rows[0].avg.toFixed(1):'', rows[0]?rows[0].note:'',
        rows[1]?rows[1].name:'', rows[1]?rows[1].avg.toFixed(1):'', rows[1]?rows[1].note:'',
        rows[2]?rows[2].name:'', rows[2]?rows[2].avg.toFixed(1):'', rows[2]?rows[2].note:'',
        passCount, verdict,
        triggerX?'ใช่':'ไม่', triggerName,
        emergency?'ใช่':'ไม่'
      ]] }
    });
  } catch(e) { console.error('saveSummaryToSheet:', e.message); }
}

// ============================================================
//  Helpers
// ============================================================
function today() {
  return new Date().toLocaleDateString('th-TH', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' });
}
function getState(uid)      { return state[uid] || {}; }
function setState(uid, obj) { state[uid] = obj; }
function getSkus()          { return config.skus || []; }
function isProductionDay()  { return config.production_date === today(); }

function getTodayResult(sku) {
  const t = today();
  const rows = scores.filter(s => s.date === t && s.sku === sku);
  return { count: rows.length, rows, doneUsers: rows.map(r => r.userId) };
}

function saveScore(userId, name, sku, sc, avg, passed, note) {
  scores.push({ date: today(), sku, userId, name, ...sc, avg, passed, note: note||'' });
}

// ============================================================
//  LINE API
// ============================================================
async function replyMessage(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: [{ type:'text', text }] },
    { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  ).catch(e => console.error('replyMessage:', e.message));
}

async function pushMessage(userId, text) {
  await axios.post('https://api.line.me/v2/bot/message/push',
    { to: userId, messages: [{ type:'text', text }] },
    { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
  ).catch(e => console.error('pushMessage:', e.message));
}

async function getProfile(userId) {
  try {
    const res = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`,
      { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } });
    return res.data;
  } catch(e) { return null; }
}

// ============================================================
//  Summarize
// ============================================================
async function checkAndSummarize(sku) {
  const result = getTodayResult(sku);
  const { rows, count } = result;
  if (count < 2) return;

  const passCount = rows.filter(r => r.passed).length;
  const failCount = count - passCount;

  // 2 คน ไม่ตรงกัน
  if (count === 2 && passCount !== 2 && failCount !== 2) {
    for (const uid of result.doneUsers) {
      await pushMessage(uid,
        `⚠️ SKU: ${sku}\n2 คนให้คะแนนไม่ตรงกันครับ\nต้องการคนที่ 3 ตัดสิน\nฝ่ายผลิตพิมพ์ "ชิมแทน บอย" หรือ "ชิมแทน เก๋" ได้เลยครับ`
      );
    }
    return;
  }
  if (count < 3 && !(passCount === 2 || failCount === 2)) return;

  const verdict   = passCount >= 2 ? '✅ ผ่าน' : '❌ ไม่ผ่าน';
  let triggerX = false, triggerName = '';
  for (const c of CRITERIA) {
    const vals = rows.map(r => r[c.key] || 0);
    const max  = Math.max(...vals), min = Math.min(...vals);
    if (max - min >= 2 && !triggerX) { triggerX = true; triggerName = rows[vals.indexOf(min)].name; }
  }

  const emergency = config.emergency_mode === 'true';
  let msg = `─────────────────\n📋 ผลชิม SKU: ${sku}\n${today()}${emergency?' ⚠️โหมดฉุกเฉิน':''}\n─────────────────\n`;
  rows.forEach(r => {
    msg += `${r.passed?'🟢':'🔴'} ${r.name}: ${r.avg.toFixed(1)}`;
    if (r.note) msg += ` (${r.note})`;
    msg += '\n';
  });
  msg += `─────────────────\nเสียง ${passCount}/${count} → ${verdict}`;
  if (count === 2) msg += '\n(ปิดผลด้วย 2 คนเห็นตรงกัน)';

  // ผลการตัดสิน
  if (passCount >= 2) {
    msg += '\n\n✅ ผลิตได้เลยครับ';
  } else {
    msg += '\n\n❌ ไม่ผ่าน — หยุดการผลิตก่อนครับ\n\nขั้นตอนต่อไป\n1) หยุดสายการผลิตทันที\n2) นำถ้วย X มาชิมเทียบ\n3) โหวตใหม่อีกครั้ง\n4) ถ้ายังไม่ผ่าน → ประชุมหาสาเหตุและแก้ไขตามหน้างาน';
  }

  if (triggerX) msg += `\n\n⚠️ ${triggerName} คะแนนต่างจากคนอื่น ≥ 2\n→ นัดชิมถ้วย X ด้วยครับ`;

  await saveSummaryToSheet(sku, rows, passCount, verdict, triggerX, triggerName, emergency);

  const allUsers = await loadAllUsers();
  for (const u of allUsers) await pushMessage(u.userId, msg);
  config.emergency_mode = 'false';
}

// ============================================================
//  Message handler
// ============================================================
async function handleFollow(event) {
  const profile  = await getProfile(event.source.userId);
  const name     = profile ? profile.displayName : 'คุณ';
  const allNames = [...TASTERS, ...PRODUCERS];
  await replyMessage(event.replyToken,
    `สวัสดีครับ ${name} 👋\nนี่คือระบบชิมเนยถั่ว Right Bite Factory\n\nพิมพ์ชื่อของคุณเพื่อลงทะเบียนครับ\n(${allNames.join(' / ')})`
  );
}

async function handleMessage(event) {
  const userId = event.source.userId;
  const text   = event.message.text.trim();
  const token  = event.replyToken;
  const st     = getState(userId);

  // เริ่มชิม
  if (text.startsWith('เริ่มชิม')) {
    const skuRaw = text.replace('เริ่มชิม','').trim();
    if (!skuRaw) { await replyMessage(token,'กรุณาระบุ SKU ด้วยครับ\nเช่น: เริ่มชิม PB001\nหรือ: เริ่มชิม PB001, MT002'); return; }
    const skus = skuRaw.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    config.skus = skus;
    config.production_date = today();
    config.emergency_mode  = 'false';
    config.reminded_today  = false;
    scores.splice(0, scores.length, ...scores.filter(s => s.date !== today()));
    const skuList = skus.map((s,i)=>`${i+1}) ${s}`).join('\n');
    await replyMessage(token, `🥜 เปิดรอบชิมแล้วครับ\nSKU วันนี้ ${skus.length} รายการ\n${skuList}\n\nแจ้งผู้ชิมให้เข้ามากรอกคะแนนได้เลยครับ\nถ้ามีคนลา พิมพ์ "ชิมแทน บอย" หรือ "ชิมแทน เก๋"`);
    return;
  }

  // ชิมแทน
  if (text.startsWith('ชิมแทน')) {
    const subName  = text.replace('ชิมแทน','').trim();
    const validSub = [...PRODUCERS,...TASTERS];
    if (!subName || !validSub.includes(subName)) { await replyMessage(token,'ระบุชื่อด้วยครับ เช่น: ชิมแทน บอย'); return; }
    setState(userId, { name:subName, step:0, skuIdx:st.skuIdx||0, scores:{}, isSub:true });
    await saveUserToSheet(userId, subName);
    config.emergency_mode = 'true';
    await replyMessage(token, `⚠️ โหมดฉุกเฉิน\n${subName} จะชิมแทนครับ\nพิมพ์ "พร้อม" เพื่อเริ่มชิมได้เลย`);
    return;
  }

  // ผลวันนี้
  if (text === 'ผลวันนี้') {
    const skus = getSkus();
    if (!skus.length || !isProductionDay()) {
      await replyMessage(token, 'ยังไม่มีการเปิดรอบชิมวันนี้ครับ'); return;
    }
    let summary = `📋 สรุปผลวันนี้ ${today()}\n─────────────────\n`;
    for (const sku of skus) {
      const result = getTodayResult(sku);
      const passCount = result.rows.filter(r => r.passed).length;
      summary += `SKU: ${sku}\n`;
      if (result.count === 0) {
        summary += `ยังไม่มีใครกรอกครับ\n`;
      } else {
        result.rows.forEach(r => {
          summary += `${r.passed?'🟢':'🔴'} ${r.name}: ${r.avg.toFixed(1)}`;
          if (r.note) summary += ` (${r.note})`;
          summary += '\n';
        });
        if (result.count >= 2 && (passCount >= 2 || (result.count - passCount) >= 2)) {
          summary += `→ ${passCount >= 2 ? '✅ ผ่าน' : '❌ ไม่ผ่าน'}\n`;
        } else {
          summary += `→ รอผล (${result.count}/3 คน)\n`;
        }
      }
      summary += '─────────────────\n';
    }
    await replyMessage(token, summary.trim());
    return;
  }

  // รีเซ็ต
  if (text === 'รีเซ็ต' || text === 'reset') {
    setState(userId, { name:st.name, step:0, skuIdx:0, scores:{} });
    await replyMessage(token,'รีเซ็ตแล้วครับ'); return;
  }

  // สถานะ
  if (text === 'สถานะ' || text === 'status') {
    const skus = getSkus();
    const cur  = skus[0] || '-';
    const res  = getTodayResult(cur);
    await replyMessage(token, `สถานะวันนี้\nSKU: ${cur}\nกรอกแล้ว ${res.count}/3 คน${config.emergency_mode==='true'?'\n⚠️ โหมดฉุกเฉิน':''}`);
    return;
  }

  // ลงทะเบียน
  if (!st.name) {
    const allNames = [...TASTERS,...PRODUCERS];
    const matched  = allNames.find(n => text === n);
    if (!matched) { await replyMessage(token,`ไม่พบชื่อในระบบครับ\nพิมพ์ชื่อของคุณ\n(${allNames.join(' / ')})`); return; }
    setState(userId, { name:matched, step:0, skuIdx:0, scores:{} });
    await saveUserToSheet(userId, matched);
    await replyMessage(token, `ลงทะเบียนสำเร็จครับ ${matched} 🎉\n${PRODUCERS.includes(matched)?'พิมพ์ "เริ่มชิม SKU" เพื่อเปิดรอบชิมครับ':'รอฝ่ายผลิตแจ้ง "เริ่มชิม SKU" นะครับ'}`);
    return;
  }

  if (!isProductionDay()) {
    await replyMessage(token,'ยังไม่มีการแจ้งเริ่มชิมวันนี้ครับ\nรอฝ่ายผลิตพิมพ์ "เริ่มชิม SKU" ก่อนนะครับ'); return;
  }

  const skuList = getSkus();
  const skuIdx  = st.skuIdx || 0;
  if (skuIdx >= skuList.length) { await replyMessage(token,`คุณ${st.name} กรอกครบทุก SKU วันนี้แล้วครับ 🙏`); return; }

  const currentSku  = skuList[skuIdx];
  const todayResult = getTodayResult(currentSku);

  if (todayResult.doneUsers.includes(userId)) {
    const nextIdx = skuIdx + 1;
    if (nextIdx < skuList.length) {
      setState(userId, { name:st.name, step:0, skuIdx:nextIdx, scores:{} });
      await replyMessage(token, `กรอก ${currentSku} แล้วครับ\nถัดไป: ${skuList[nextIdx]}\nพิมพ์ "พร้อม" เพื่อเริ่มชิมครับ`);
    } else {
      await replyMessage(token,`คุณ${st.name} กรอกครบทุก SKU วันนี้แล้วครับ 🙏`);
    }
    return;
  }

  let step = st.step || 0;

  // รับหมายเหตุ (step === CRITERIA.length + 1)
  if (step === CRITERIA.length + 1) {
    const note = text === '-' ? '' : text;
    const sc   = st.scores;
    const vals = CRITERIA.map(c => sc[c.key] || 0);
    const avg  = vals.reduce((a,b)=>a+b,0) / vals.length;
    const passed    = vals.every(v => v >= PASS_SCORE);
    const failItems = CRITERIA.filter(c=>(sc[c.key]||0)<PASS_SCORE).map(c=>c.label);

    saveScore(userId, st.name, currentSku, sc, avg, passed, note);
    await saveScoreToSheet(userId, st.name, currentSku, sc, avg, passed, note);

    const nextSkuIdx = skuIdx + 1;
    setState(userId, { name:st.name, step:0, skuIdx:nextSkuIdx, scores:{} });

    let replyText = `✅ บันทึก ${currentSku} แล้วครับ ${st.name}\nคะแนนเฉลี่ย: ${avg.toFixed(1)}\n${passed?'🟢 ผ่านเกณฑ์':'🔴 ไม่ผ่าน: '+failItems.join(', ')}`;
    if (note) replyText += `\nหมายเหตุ: ${note}`;
    if (nextSkuIdx < skuList.length) replyText += `\n\nถัดไป: ${skuList[nextSkuIdx]}\nพิมพ์ "พร้อม" เพื่อเริ่มชิมครับ`;
    else replyText += '\n\nครบทุก SKU แล้วครับ 🙏\nรอผลรวมจากทีม';

    await replyMessage(token, replyText);
    await checkAndSummarize(currentSku);
    return;
  }

  // รับคะแนน
  if (step > 0) {
    const score = parseFloat(text.replace(',','.'));
    if (isNaN(score) || score < 1 || score > 5) {
      await replyMessage(token,'กรุณาพิมพ์ตัวเลข 1-5 เท่านั้นครับ\nเช่น 4 หรือ 3.5'); return;
    }
    st.scores[CRITERIA[step-1].key] = score;
  }

  // ถามข้อถัดไป
  if (step < CRITERIA.length) {
    const next = CRITERIA[step];
    setState(userId, { name:st.name, step:step+1, skuIdx, scores:st.scores, isSub:st.isSub });
    await replyMessage(token,
      (step===0 ? `🥜 ชิม SKU: ${currentSku}\n(${skuIdx+1}/${skuList.length})\n\n` : '') +
      `[${step+1}/${CRITERIA.length}] ${next.label}\n${next.hint}\n\nให้คะแนน 1-5\n1=แย่มาก  3=ปานกลาง  5=ดีมาก`
    );
    return;
  }

  // ครบ 5 ข้อ → ถามหมายเหตุ
  if (step === CRITERIA.length) {
    setState(userId, { name:st.name, step:step+1, skuIdx, scores:st.scores, isSub:st.isSub });
    await replyMessage(token,
      `มีหมายเหตุเพิ่มเติมไหมครับ?\nเช่น "กลิ่นฉุนผิดปกติ" หรือ "สีเข้มกว่าปกติ"\n\nถ้าไม่มี พิมพ์ -`
    );
    return;
  }
}

// ============================================================
//  Webhook
// ============================================================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') await handleMessage(event);
    else if (event.type === 'follow') await handleFollow(event);
  }
});

app.get('/', (req, res) => res.send('Right Bite Tasting Bot is running!'));

// ============================================================
//  แจ้งเตือน 10 โมงเช้าถ้ายังไม่เริ่มชิม
// ============================================================
async function checkMorningReminder() {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' });
  const hour = new Date(now).getHours();
  const min  = new Date(now).getMinutes();

  // ส่งแจ้งเตือนตอน 10:00 ถ้ายังไม่เปิดรอบชิมวันนี้
  if (hour === 10 && min < 5 && !isProductionDay() && !config.reminded_today) {
    config.reminded_today = true;
    const allUsers = await loadAllUsers();
    for (const u of allUsers) {
      await pushMessage(u.userId,
        '⏰ แจ้งเตือน\nยังไม่มีการเปิดรอบชิมวันนี้ครับ\nฝ่ายผลิตพิมพ์ "เริ่มชิม SKU" ได้เลยครับ'
      );
    }
  }
}

// เช็คทุก 5 นาที
setInterval(checkMorningReminder, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
