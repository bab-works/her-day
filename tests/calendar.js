// 달력 확인 (가짜 기록, 오늘 = 2026-11-25 고정): 생리 막대(이어진 날 jl·jr), 그날 창에서 생리 날 켜고 끄기(늘리기·합치기·나누기·지우기+되돌리기),
// 네일 달력(다녀온 날·다음 예상, 눌러서 고치기·더하기), 오늘 화면 통합 달력과 그날 목록, 화면을 밀어서 메뉴 열고 닫기, 밖으로 나가는 요청 없음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.svg') ? 'image/svg+xml' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8815, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(() => {
    window.__cloud = { url: '' };
    if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
    localStorage.setItem('cyclePeriods', JSON.stringify([{ id: 'a', start: '2026-10-29', end: '2026-11-03' }]));
    localStorage.setItem('care_nail', JSON.stringify([{ id: 'n1', date: '2026-10-20', what: '젤네일', place: '샵', price: 50000, note: '' }, { id: 'n2', date: '2026-11-05', what: '케어', place: '', price: 0, note: '' }]));
  });
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8815/')) outside.push(q.url()); });
  await p.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await p.goto('http://localhost:8815/'); await p.waitForTimeout(300);
  const cls = (cal, d) => p.getAttribute(`#${cal} [data-d="${d}"]`, 'class');
  const ps = () => p.evaluate(() => JSON.parse(localStorage.getItem('cyclePeriods')).map(x => `${x.start}~${x.end || ''}`).sort());
  const day = async (d, on) => { await p.click(`#cycCal [data-d="${d}"]`); await p.waitForSelector('#daySheet[open]'); if (on != null) { assert.equal(await p.isChecked('#dayPer'), !on, d); await p.click('#dayPerRow label'); } };
  const done = async () => { await p.click('#dayDone'); await p.waitForTimeout(300); };

  // 생리 막대: 11/1~3은 이어진 막대 (1일 일요일은 왼쪽 끝 둥글게 없음 → 지난달에서 이어짐)
  await p.evaluate(() => setSection('cycle'));
  assert.match(await cls('cycCal', '2026-11-02'), /per.*jl.*jr|per jl jr/);
  assert.ok((await cls('cycCal', '2026-11-03')).includes('jl') && !(await cls('cycCal', '2026-11-03')).includes('jr'));
  // 예상보다 길었다: 끝 다음 날(11/4)을 켜면 같은 생리로 늘어남
  await day('2026-11-04', true); assert.deepEqual(await ps(), ['2026-10-29~2026-11-04']); assert.ok((await cls('cycCal', '2026-11-04')).includes('per'));
  assert.equal(await p.isVisible('#dayPerDel'), true); await done();
  // 앞날은 켤 수 없음(줄이 안 보임)
  await p.click('#cycCal [data-d="2026-11-27"]'); assert.equal(await p.isVisible('#dayPerRow'), false); await done();
  // 따로 시작: 11/22 → 새 기록, 11/24 → 새 기록, 사이 11/23을 켜면 하나로 합침
  await day('2026-11-22', true); await done(); await day('2026-11-24', true); await done();
  assert.equal((await ps()).length, 3);
  await day('2026-11-23', true); await done(); assert.deepEqual(await ps(), ['2026-10-29~2026-11-04', '2026-11-22~2026-11-24']);
  for (const d of ['2026-11-22', '2026-11-23', '2026-11-24']) assert.ok((await cls('cycCal', d)).includes('per'), d);
  // 가운데(11/1)를 끄면 둘로 나뉨, 끝(11/4)을 끄면 줄어듦
  await day('2026-11-01', false); await done(); await day('2026-11-04', false); await done();
  assert.deepEqual(await ps(), ['2026-10-29~2026-10-31', '2026-11-02~2026-11-03', '2026-11-22~2026-11-24']);
  // 그날 창에서 그 생리 기록 통째로 지우기 + 되돌리기
  await day('2026-11-23'); await p.click('#dayPerDel'); await p.waitForTimeout(300);
  assert.equal((await ps()).length, 2); assert.equal(await p.textContent('#toast button'), '되돌리기');
  await p.click('#toast button'); assert.equal((await ps()).length, 3);
  // 하루짜리를 끄면 기록이 사라짐
  await day('2026-11-02', false); await done(); await day('2026-11-03', false); await done();
  assert.deepEqual(await ps(), ['2026-10-29~2026-10-31', '2026-11-22~2026-11-24']);

  // 네일 달력: 다녀온 날 채움, 다음 관리 예상(11/5 + 16일 = 11/21) 테두리
  await p.evaluate(() => setSection('nail'));
  assert.ok((await cls('careCal', '2026-11-05')).includes('visit')); assert.ok((await cls('careCal', '2026-11-21')).includes('nextv'));
  await p.click('#careCal [data-d="2026-11-05"]'); await p.waitForSelector('#careSheet[open]'); assert.equal(await p.inputValue('#careWhat'), '케어'); await p.click('#careCancel'); await p.waitForTimeout(300);
  await p.click('#careCal [data-d="2026-11-12"]'); await p.waitForSelector('#careSheet[open]');
  assert.equal(await p.inputValue('#careDate'), '2026-11-12'); assert.match(await p.textContent('#careTitle'), /기록 추가/);
  await p.fill('#careWhat', '아트'); await p.click('#careSave'); await p.waitForTimeout(300);
  assert.ok((await cls('careCal', '2026-11-12')).includes('visit'));
  await p.click('#careCal [data-d="2026-11-30"]'); assert.equal(await p.textContent('#toast'), '앞으로의 날짜는 기록할 수 없어요');
  await p.click('#careNext'); assert.equal(await p.textContent('#careMonth'), '2026년 12월'); await p.click('#carePrev');

  // 오늘 화면 통합 달력: 생리 막대 + 네일 점, 날짜를 누르면 그날 목록 → 누르면 그 기록으로
  await p.evaluate(() => setSection('home'));
  assert.ok((await cls('homeCal', '2026-11-23')).includes('per'));
  assert.equal(await p.locator('#homeCal [data-d="2026-11-12"] .dot.s-nail').count(), 1);
  assert.match(await p.textContent('#homeLegend'), /네일/);
  await p.click('#homeCal [data-d="2026-11-12"]'); await p.waitForSelector('#homeDay[open]');
  assert.equal(await p.textContent('#hdTitle'), '11월 12일 목요일'); assert.match(await p.textContent('#hdList'), /네일 · 아트/);
  await p.click('#hdList li[data-k=nail]'); await p.waitForSelector('#careSheet[open]');
  assert.equal(await p.textContent('#appTitle'), '네일'); assert.equal(await p.inputValue('#careWhat'), '아트'); await p.click('#careCancel'); await p.waitForTimeout(300);
  await p.evaluate(() => setSection('home')); await p.click('#homeCal [data-d="2026-11-23"]');
  await p.click('#hdAdd [data-k=cycle]'); await p.waitForSelector('#daySheet[open]'); assert.equal(await p.textContent('#dayTitle'), '11월 23일 월요일'); await done();

  // 화면을 오른쪽으로 밀면 메뉴가 열리고, 왼쪽으로 밀면 닫힘
  const swipe = (x0, x1) => p.evaluate(([x0, x1]) => {
    const t = x => new Touch({ identifier: 1, target: document.body, clientX: x, clientY: 400 }), fire = (type, x) => document.body.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t(x)], changedTouches: [t(x)] }));
    fire('touchstart', x0); for (let i = 1; i <= 6; i++) fire('touchmove', x0 + (x1 - x0) * i / 6); fire('touchend', x1);
  }, [x0, x1]);
  await p.evaluate(() => setSection('cycle')); await swipe(20, 300); await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => $('#menu').open), true); assert.equal(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--p')), '1.000');
  await swipe(300, 20); await p.waitForTimeout(600); assert.equal(await p.evaluate(() => $('#menu').open), false);
  // 세로로 끌면 메뉴 안 열림
  await p.evaluate(() => { const t = y => new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: y }); document.body.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t(300)], changedTouches: [t(300)] })); document.body.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [t(200)], changedTouches: [t(200)] })); document.body.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [t(200)] })); });
  await p.waitForTimeout(300); assert.equal(await p.evaluate(() => $('#menu').open), false);

  assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll');
  assert.deepEqual(outside, [], 'nothing leaves the device');
  console.log('CALENDAR OK'); await b.close(); process.exit(0); });
