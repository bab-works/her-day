// 네일·피부 시술·미용실 화면과 관심 항목 확인 (가짜 기록, 오늘 = 2026-11-25로 고정): 기록 추가·고치기·지우기, 다음 관리일, 관리 주기 직접 정하기, 관심 항목만 보이기·추가, 밖으로 나가는 요청 없음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert'), os = require('os');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8813, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(() => { window.__cloud = { url: '' }; });
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8813/')) outside.push(q.url()); });
  await p.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await p.goto('http://localhost:8813/'); await p.waitForTimeout(300);
  const text = s => p.textContent(s), tap = k => p.click(`#intList label:has(input[value=${k}])`), shot = n => p.screenshot({ path: os.tmpdir() + `/herday-${n}.png` });

  // 네일: 기록 없음 → 두 번 기록 → 평균 간격으로 다음 관리일
  await p.click('#homeCards [data-sec=nail]'); await p.waitForTimeout(300);
  assert.equal(await text('#careNow'), '다녀온 날을 기록해 보세요');
  for (const [d, what, price] of [['2026-10-20', '젤네일', '50000'], ['2026-11-15', '케어', '30000']]) {
    await p.click('#careAdd'); await p.fill('#careDate', d); await p.fill('#careWhat', what); await p.fill('#carePrice', price); await p.click('#careSave');
  }
  assert.equal(await text('#careNow'), '다음 관리까지 16일'); // 11/15 + 26일 = 12/11
  assert.match(await text('#careFacts'), /12월 11일/); assert.match(await text('#careFacts'), /26일 \(평균\)/); assert.match(await text('#careFacts'), /80,000원/);
  assert.match(await text('#careList li:first-child'), /11월 15일 · 케어/);
  await shot('nail');
  // 앞날은 막기
  await p.click('#careAdd'); await p.fill('#careDate', '2026-12-01'); await p.click('#careSave');
  assert.equal(await text('#toast'), '앞으로의 날짜는 기록할 수 없어요'); await p.click('#careCancel');
  // 관리 주기 직접 정하기
  await p.evaluate(() => { window.__askAuto = () => '21'; }); await p.click('#careGap');
  assert.equal(await text('#careNow'), '다음 관리까지 11일');
  // 고치기 · 지우기
  await p.click('#careList li:first-child'); await p.fill('#careWhat', '아트'); await p.click('#careSave');
  assert.match(await text('#careList li:first-child'), /아트/);
  await p.evaluate(() => { window.__askAuto = () => true; }); await p.click('#careList li:first-child'); await p.click('#careDel');
  assert.equal(await p.locator('#careList li[data-id]').count(), 1);
  // 미용실은 따로 저장
  await p.evaluate(() => setSection('hair')); await p.waitForTimeout(200);
  assert.equal(await text('#appTitle'), '미용실'); assert.equal(await p.locator('#careList li[data-id]').count(), 0);

  // 관심 항목: 네일 · 미용실만 → 오늘 카드·메뉴에 그것만, 「관심 항목 추가」로 피부 시술 더하기
  await p.evaluate(() => setSection('home')); await p.click('#homeCards [data-add]'); await p.waitForSelector('#intSheet[open]');
  for (const k of ['cycle', 'sleep', 'meds', 'skin']) await tap(k);
  await p.click('#intSave');
  assert.deepEqual(await p.$$eval('#homeCards [data-sec]', l => l.map(x => x.dataset.sec)), ['nail', 'hair']);
  assert.match(await text('#homeCards [data-sec=nail] small'), /관리 예정일이 15일 지났어요/);
  await shot('home-interests');
  await p.click('#homeCards [data-add]'); await tap('skin'); await p.click('#intSave');
  assert.deepEqual(await p.$$eval('#homeCards [data-sec]', l => l.map(x => x.dataset.sec)), ['nail', 'skin', 'hair']);
  await p.click('#menuBtn'); await p.waitForTimeout(450);
  assert.deepEqual(await p.$$eval('#menuList [data-sec]', l => l.map(x => x.dataset.sec)), ['home', 'nail', 'skin', 'hair']);
  await p.keyboard.press('Escape'); await p.waitForTimeout(450);
  // 안 고른 섹션으로는 못 감, 하나도 안 고르면 막기
  await p.evaluate(() => setSection('cycle')); assert.equal(await text('#appTitle'), '오늘');
  await p.click('#homeCards [data-add]'); for (const k of ['nail', 'skin', 'hair']) await tap(k);
  await p.click('#intSave'); assert.equal(await text('#toast'), '하나 이상 골라 주세요');
  for (const k of ['linear', 'clay']) { await p.evaluate(k => { document.documentElement.dataset.skin = k; }, k); await shot('interests-' + k); }
  assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll');
  assert.deepEqual(outside, []);
  console.log('CARE OK'); await b.close(); process.exit(0); });
