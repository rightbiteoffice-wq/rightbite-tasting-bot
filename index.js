const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = 'cRbj67xp/XAnqhUcOSykcYib52DolldWfm3eipUH+AwoGC/wicP0xEK0sAXz07+MQfxaHfFeE9uYbA+30vTqtzgSRkZ3xMJ8ItOr4U4f+nXJkRu/Ar9ETavDNV7oWWPBhvTLK46mNpQX+NQ/CR83IQdB04t89/1O/w1cDnyilFU=';
const TASTERS   = ['ดิว','แอน','อร','เอิน','ทดสอบ'];
const PRODUCERS = ['บอย','เก๋'];
const PASS_SCORE = 4;
const CRITERIA = [
  { key:'color',   label:'สี (Color)',           hint:'สีสม่ำเสมอ ตรงตามสูตร' },
  { key:'aroma',   label:'กลิ่น (Aroma)',         hint:'กลิ่นถั่วหอม ไม่เหม็นหืดหรือฉุน' },
  { key:'texture', label:'เนื้อสัมผัส (Texture)', hint:'เนียน ไม่แยกชั้น ไม่หนืดหรือเหลวเกิน' },
  { key:'taste',   label:'รสชาติ (Taste)',         hint:'รสชาติตรงตามสูตร ไม่มีรสผิดปกติ' },  
  { key:'overall', label:'Overall',                hint:'ประเมินรวมทั้งหมด' },
];

// In-memory storage
const state   = {}; // userId -> state
const config  = {}; // key -> value
const scores  = []; // array of score records

function today() {
  return new Date().toLocaleDateString('th-TH', { timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit' });
}

function getState(userId)       { return state[userId] || {}; }
function setState(userId, obj)  { state[userId] = obj; }
function getConfig(key)         { return config[key]; }
function setConfig(key, val)    { config[key] = val; }
function getSkus()              { return config.skus || []; }
function isProductionDay()      { return config.production_date === today(); }

function getTodayResult(sku) {
  const t = today();
  const rows = scores.filter(s => s.date === t && s.sku === sku);
  return { count: rows.length, rows, doneUsers: rows.map(r => r.userId) };
}

function saveScore(userId, name, sku, sc, avg, passed) {
  scores.push({ date: today(), sku, userId, name, ...sc, avg, passed });
}

async function replyMessage(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken, messages: [{ type:'text', text }]
  }, { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } });
}

async function pushMessage(userId, text) {
  await axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId, messages: [{ type:'text', text }]
  }, { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } });
}

async function getProfile(userId) {
  try {
    const res = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` }
    });
    return res.data;
  } catch(e) { return null; }
}

async function checkAndSummarize(sku) {
  const result = getTodayResult(sku);
  const { rows, count } = result;
  if (count < 2) return;

  let passCount = rows.filter(r => r.passed).length;
  let failCount = count - passCount;

  if (count === 2 && passCount !== 2 && failCount !== 2) {
    for (const uid of result.doneUsers) {
      await pushMessage(uid,
        `⚠️ SKU: ${sku}\n2 คนให้คะแนนไม่ตรงกันครับ\nต้องการคนที่ 3 ตัดสิน\nฝ่ายผลิตพิมพ์ "ชิมแทน บอย" หรือ "ชิมแทน เก๋" ได้เลยครับ`
      );
    }
    return;
  }

  if (count < 3 && !(passCount === 2 || failCount === 2)) return;

  const verdict = passCount >= 2 ? '✅ ผ่าน' : '❌ ไม่ผ่าน';
  let triggerX = false, triggerName = '';
  for (const c of CRITERIA) {
    const vals = rows.map(r => r[c.key] || 0);
    const max = Math.max(...vals), min = Math.min(...vals);
    if (max - min >= 2 && !triggerX) { triggerX = true; triggerName = rows[vals.indexOf(min)].name; }
  }

  const emergency = config.emergency_mode === 'true';
  let msg = `─────────────────\n📋 ผลชิม SKU: ${sku}\n${today()}${emergency?' ⚠️โหมดฉุกเฉิน':''}\n─────────────────\n`;
  rows.forEach(r => { msg += `${r.passed?'🟢':'🔴'} ${r.name}: ${r.avg.toFixed(1)}\n`; });
  msg += `─────────────────\nเสียง ${passCount}/${count} → ${verdict}`;
  if (count === 2) msg += '\n(ปิดผลด้วย 2 คนเห็นตรงกัน)';
  if (triggerX) msg += `\n\n⚠️ ${triggerName} คะแนนต่างจากคนอื่น ≥ 2\n→ นัดชิมถ้วย X ด้วยครับ`;

const allUsers = Object.keys(state).filter(uid => state[uid] && state[uid].name);
for (const uid of allUsers) await pushMessage(uid, msg);  config.emergency_mode = 'false';
}

async function handleFollow(event) {
  const profile = await getProfile(event.source.userId);
  const name = profile ? profile.displayName : 'คุณ';
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

  if (text.startsWith('เริ่มชิม')) {
    const skuRaw = text.replace('เริ่มชิม','').trim();
    if (!skuRaw) { await replyMessage(token,'กรุณาระบุ SKU ด้วยครับ\nเช่น: เริ่มชิม PB001'); return; }
    const skus = skuRaw.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    config.skus = skus;
    config.production_date = today();
    config.emergency_mode = 'false';
    scores.splice(0, scores.length, ...scores.filter(s => s.date !== today()));
    const skuList = skus.map((s,i)=>`${i+1}) ${s}`).join('\n');
    await replyMessage(token, `🥜 เปิดรอบชิมแล้วครับ\nSKU วันนี้ ${skus.length} รายการ\n${skuList}\n\nแจ้งผู้ชิมให้เข้ามากรอกคะแนนได้เลยครับ\nถ้ามีคนลา พิมพ์ "ชิมแทน บอย" หรือ "ชิมแทน เก๋"`);
    return;
  }

  if (text.startsWith('ชิมแทน')) {
    const subName = text.replace('ชิมแทน','').trim();
    const validSub = [...PRODUCERS,...TASTERS];
    if (!subName || !validSub.includes(subName)) { await replyMessage(token,`ระบุชื่อด้วยครับ เช่น: ชิมแทน บอย`); return; }
    setState(userId, { name:subName, step:0, skuIdx:st.skuIdx||0, scores:{}, isSub:true });
    config.emergency_mode = 'true';
    await replyMessage(token, `⚠️ โหมดฉุกเฉิน\n${subName} จะชิมแทนครับ\nพิมพ์ "พร้อม" เพื่อเริ่มชิมได้เลย`);
    return;
  }

  if (text === 'รีเซ็ต' || text === 'reset') {
    setState(userId, { name:st.name, step:0, skuIdx:0, scores:{} });
    await replyMessage(token,'รีเซ็ตแล้วครับ'); return;
  }

  if (text === 'สถานะ' || text === 'status') {
    const skus = getSkus();
    const cur  = skus[0] || '-';
    const res  = getTodayResult(cur);
    await replyMessage(token, `สถานะวันนี้\nSKU: ${cur}\nกรอกแล้ว ${res.count}/3 คน${config.emergency_mode==='true'?'\n⚠️ โหมดฉุกเฉิน':''}`);
    return;
  }

  if (!st.name) {
    const allNames = [...TASTERS,...PRODUCERS];
    const matched  = allNames.find(n => text === n);
    if (!matched) { await replyMessage(token,`ไม่พบชื่อในระบบครับ\nพิมพ์ชื่อของคุณ\n(${allNames.join(' / ')})`); return; }
    setState(userId, { name:matched, step:0, skuIdx:0, scores:{} });
    await replyMessage(token, `ลงทะเบียนสำเร็จครับ ${matched} 🎉\n${PRODUCERS.includes(matched)?'พิมพ์ "เริ่มชิม SKU" เพื่อเปิดรอบชิมครับ':'รอฝ่ายผลิตแจ้ง "เริ่มชิม SKU" นะครับ'}`);
    return;
  }

  if (!isProductionDay()) { await replyMessage(token,'ยังไม่มีการแจ้งเริ่มชิมวันนี้ครับ\nรอฝ่ายผลิตพิมพ์ "เริ่มชิม SKU" ก่อนนะครับ'); return; }

  const skuList  = getSkus();
  const skuIdx   = st.skuIdx || 0;
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
  if (step > 0) {
    const score = parseInt(text);
    if (isNaN(score) || score < 1 || score > 5) { await replyMessage(token,'กรุณาพิมพ์ตัวเลข 1-5 เท่านั้นครับ'); return; }
    st.scores[CRITERIA[step-1].key] = score;
  }

  if (step < CRITERIA.length) {
    const next = CRITERIA[step];
    setState(userId, { name:st.name, step:step+1, skuIdx, scores:st.scores, isSub:st.isSub });
    await replyMessage(token,
      (step===0 ? `🥜 ชิม SKU: ${currentSku}\n(${skuIdx+1}/${skuList.length})\n\n` : '') +
      `[${step+1}/${CRITERIA.length}] ${next.label}\n${next.hint}\n\nให้คะแนน 1-5\n1=แย่มาก  3=ปานกลาง  5=ดีมาก`
    );
    return;
  }

  const vals      = CRITERIA.map(c => st.scores[c.key] || 0);
  const avg       = vals.reduce((a,b)=>a+b,0) / vals.length;
  const passed    = vals.every(v => v >= PASS_SCORE);
  const failItems = CRITERIA.filter(c=>(st.scores[c.key]||0)<PASS_SCORE).map(c=>c.label);

  saveScore(userId, st.name, currentSku, st.scores, avg, passed);
  const nextSkuIdx = skuIdx + 1;
  setState(userId, { name:st.name, step:0, skuIdx:nextSkuIdx, scores:{} });

  let replyText = `✅ บันทึก ${currentSku} แล้วครับ ${st.name}\nคะแนนเฉลี่ย: ${avg.toFixed(1)}\n${passed?'🟢 ผ่านเกณฑ์':'🔴 ไม่ผ่าน: '+failItems.join(', ')}`;
  if (nextSkuIdx < skuList.length) replyText += `\n\nถัดไป: ${skuList[nextSkuIdx]}\nพิมพ์ "พร้อม" เพื่อเริ่มชิมครับ`;
  else replyText += '\n\nครบทุก SKU แล้วครับ 🙏\nรอผลรวมจากทีม';

  await replyMessage(token, replyText);
  await checkAndSummarize(currentSku);
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const events = req.body.events || [];
  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') await handleMessage(event);
    else if (event.type === 'follow') await handleFollow(event);
  }
});

app.get('/', (req, res) => res.send('Right Bite Tasting Bot is running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot running on port ${PORT}`));
