// 뼈대 확인: 오늘 화면·섹션 카드, 사이드 메뉴로 이동, 테마 5종, 설정·Face ID 스위치, 390px 가로 넘침 없음, 기록을 밖으로 보내지 않음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8810, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(() => { window.__cloud = { url: '' }; }); // 서버 없이(기기 모드)
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8810/')) outside.push(q.url()); });
  await p.goto('http://localhost:8810/'); await p.waitForTimeout(500);
  assert.equal(await p.textContent('#appTitle'), '오늘');
  assert.deepEqual(await p.$$eval('#homeCards [data-sec]', l => l.map(x => x.dataset.sec)), ['cycle', 'sleep', 'meds', 'nail']);
  assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll at phone width');
  await p.screenshot({ path: require('os').tmpdir() + '/herday-home.png' });
  // 메뉴 → 수면
  await p.click('#menuBtn'); await p.waitForSelector('#menu[open]'); await p.waitForTimeout(450);
  assert.equal(await p.locator('#menuList [data-sec]').count(), 5);
  await p.click('#menuList [data-sec=sleep]'); await p.waitForTimeout(600);
  assert.equal(await p.textContent('#appTitle'), '수면'); assert.equal(await p.locator('#menu[open]').count(), 0);
  // 오늘 카드 → 주기
  await p.evaluate(() => setSection('home')); await p.click('#homeCards [data-sec=cycle]'); assert.equal(await p.textContent('#appTitle'), '주기');
  // 설정 → 테마 5종, 바꾸면 기억
  await p.click('#openSettings'); await p.waitForSelector('#prefs[open]'); assert.equal(await p.locator('#lockOn').count(), 1);
  await p.click('#prefTheme'); assert.equal(await p.locator('#skinList [data-skin]').count(), 5);
  for (const k of ['clay', 'ios', 'cuberto', 'linear']) { await p.click(`#skinList [data-skin=${k}]`); assert.equal(await p.evaluate(() => document.documentElement.dataset.skin), k); }
  await p.click('#themeClose'); await p.click('#prefsClose');
  await p.evaluate(() => setSection('home')); await p.waitForTimeout(300); await p.screenshot({ path: require('os').tmpdir() + '/herday-linear.png' });
  await p.reload(); await p.waitForTimeout(400); assert.equal(await p.evaluate(() => document.documentElement.dataset.skin), 'linear');
  assert.deepEqual(outside, [], 'nothing leaves the device');
  console.log('SMOKE OK'); await b.close(); process.exit(0); });
