// 손맛 확인 (가짜 기록, 오늘 = 2026-11-25 고정, 작은 폰 375px): 시트 닫힘 애니메이션, 끌어서·바깥 탭·ESC로 닫기, 바꾼 내용 있으면 확인,
// 누르는 곳 44×44 이상(달력 날짜 칸은 높이만), 가로 넘침 없음, 밖으로 나가는 요청 없음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8814, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone SE'], hasTouch: false, isMobile: false }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(() => {
    window.__cloud = { url: '' };
    if (!localStorage.getItem('care_nail')) {
      localStorage.setItem('care_nail', JSON.stringify([{ id: 'n1', date: '2026-11-15', what: '케어', place: '', price: 30000, note: '' }]));
      localStorage.setItem('cyclePeriods', JSON.stringify([{ id: 'a', start: '2026-10-29', end: '2026-11-03' }]));
    }
  });
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8814/')) outside.push(q.url()); });
  await p.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await p.goto('http://localhost:8814/'); await p.waitForTimeout(300);
  const isOpen = id => p.evaluate(id => document.getElementById(id).open, id);
  let asked = 0; await p.exposeFunction('__asked', () => { asked++; });
  const answer = v => p.evaluate(v => { window.__askAuto = () => (window.__asked(), v); }, v);

  // 닫힘 애니메이션: 닫기를 누르면 잠깐 「closing」 상태로 남았다가 닫힘
  await p.evaluate(() => setSection('nail')); await p.click('#careAdd');
  await p.click('#careCancel');
  assert.equal(await p.evaluate(() => $('#careSheet').classList.contains('closing')), true);
  assert.equal(await isOpen('careSheet'), true); await p.waitForTimeout(350); assert.equal(await isOpen('careSheet'), false);

  // 바깥 탭: 바꾼 게 없으면 바로 닫힘
  await p.click('#careAdd'); await p.mouse.click(180, 20); await p.waitForTimeout(350); assert.equal(await isOpen('careSheet'), false);
  // 바꾼 게 있으면 물어봄: 취소 → 그대로, 닫기 → 닫힘
  await p.click('#careAdd'); await p.fill('#careWhat', '젤네일'); await answer(false);
  await p.mouse.click(180, 20); await p.waitForTimeout(350); assert.equal(asked, 1); assert.equal(await isOpen('careSheet'), true);
  await p.keyboard.press('Escape'); await p.waitForTimeout(350); assert.equal(asked, 2); assert.equal(await isOpen('careSheet'), true);
  await answer(true); await p.mouse.click(180, 20); await p.waitForTimeout(350); assert.equal(await isOpen('careSheet'), false);

  // 손잡이 끌기: 덜 끌면 제자리, 80px 넘게 끌면 닫힘 (바꾼 게 있으면 물어봄)
  const drag = async (id, dy) => {
    const g = await p.locator(`#${id} .sheet-grab`).boundingBox(), x = g.x + g.width / 2, y = g.y + g.height / 2;
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x, y + dy / 2); await p.mouse.move(x, y + dy); await p.mouse.up(); await p.waitForTimeout(400);
  };
  await p.click('#careAdd'); await p.waitForTimeout(350);
  await drag('careSheet', 40); assert.equal(await isOpen('careSheet'), true);
  await drag('careSheet', 160); assert.equal(await isOpen('careSheet'), false);
  asked = 0; await answer(false); await p.click('#careAdd'); await p.fill('#carePlace', '샵'); await p.waitForTimeout(350);
  await drag('careSheet', 160); assert.equal(asked, 1); assert.equal(await isOpen('careSheet'), true);
  await p.click('#careCancel'); await p.waitForTimeout(350);
  // 그날 기록 창은 바로 저장되니 묻지 않고 닫힘
  asked = 0; await p.evaluate(() => setSection('cycle')); await p.click('[data-d="2026-11-20"]'); await p.click('#daySym [data-sym="두통"]');
  await p.mouse.click(180, 20); await p.waitForTimeout(350); assert.equal(asked, 0); assert.equal(await isOpen('daySheet'), false);

  // 누르는 곳 44×44 이상 · 가로 넘침 없음: 화면마다, 창마다
  const tiny = () => p.evaluate(() => {
    const top = [...document.querySelectorAll('dialog[open]')].pop() || document;
    return [...top.querySelectorAll('button, a[href], input:not(.sr-only), select, textarea, label.set-row')].filter(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('[hidden]') || e.matches('.set-row input, .seg input')) return false;
      const day = e.closest('#cycCal, #cpGrid'); // 달력 날짜는 7칸이라 높이만
      return r.height < 43.5 || (!day && r.width < 43.5);
    }).map(e => `${e.id || e.className || e.tagName}:${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 10)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  });
  const check = async name => {
    await p.waitForTimeout(350);
    assert.deepEqual(await tiny(), [], name + ': 작은 버튼');
    if (name !== 'menu') assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), name + ': 가로 넘침'); // 메뉴는 본문을 옆으로 미는 게 정상
  };
  for (const s of ['home', 'cycle', 'nail']) { await p.evaluate(s => setSection(s), s); await check(s); }
  const sheets = [['cycle', '[data-d="2026-11-20"]', 'daySheet'], ['cycle', '#cycOther', 'calPick'], ['cycle', '#cycList li[data-id]', 'perSheet'],
    ['nail', '#careAdd', 'careSheet'], ['nail', '#careGap', 'gapSheet'], ['home', '#homeEdit', 'intSheet'], ['home', '#openSettings', 'prefs']];
  for (const [s, btn, id] of sheets) {
    await p.evaluate(s => setSection(s), s); await p.click(btn); await check(id);
    await p.evaluate(id => document.getElementById(id).close(), id); await p.waitForTimeout(350);
  }
  await p.click('#openSettings'); await p.click('#prefTheme'); await check('themeSheet'); await p.click('#themeClose'); await p.click('#prefsClose'); await p.waitForTimeout(350);
  await p.click('#menuBtn'); await check('menu'); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  await p.evaluate(() => showLogin()); await check('login');

  assert.deepEqual(outside, [], 'nothing leaves the device');
  console.log('UX OK'); await b.close(); process.exit(0); });
