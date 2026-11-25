// 주기 화면 확인 (가짜 기록, 오늘 = 2026-11-25로 고정): 생리 시작·끝, 잘못된 날짜 막기, 예상 문구, 달력 색, 그날 기록(양·증상·메모), 고치기·지우기, 오늘 카드, 밖으로 나가는 요청 없음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert'), os = require('os');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8811, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8811/')) outside.push(q.url()); });
  await p.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await p.goto('http://localhost:8811/'); await p.waitForTimeout(300);
  const answer = v => p.evaluate(v => { window.__askAuto = () => v; }, v);
  const text = s => p.textContent(s), toast = () => p.textContent('#toast');
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('cyclePeriods') || '[]'));

  // 오늘 카드: 기록 없을 때
  assert.equal(await text('#homeCards [data-sec=cycle] small'), '생리 시작일을 기록해 보세요');
  await p.click('#homeCards [data-sec=cycle]'); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#v-cycle'), true); assert.equal(await p.isVisible('#v-sec'), false);
  assert.ok((await text('#v-cycle')).includes('예상은 참고용이에요. 의학적 판단이나 피임 수단이 아니에요'));
  assert.equal(await p.isVisible('#cycFew'), true);
  assert.equal(await text('#cycMonth'), '2026년 11월');
  assert.equal(await p.locator('#cycCal [data-d]').count(), 30);
  assert.ok((await text('#cycList')).includes('아직 기록이 없어요'));
  // 끝을 먼저 누르면 안내
  await p.click('#cycEnd'); assert.ok((await toast()).includes('먼저'));

  // 기록 1번: 평균 28일로 계산 + 「기록이 쌓이면」 안내
  await answer('2026-10-28'); await p.click('#cycStart'); // 지난달 날짜를 고르면 그 달 달력으로
  assert.equal(await text('#cycMonth'), '2026년 10월');
  await answer('2026-11-01'); await p.click('#cycEnd');
  assert.equal((await stored())[0].end, '2026-11-01');
  assert.equal(await p.isVisible('#cycFew'), true);
  assert.ok((await text('#cycFacts')).includes('11월 25일')); // 10-28 + 28일
  assert.equal(await text('#cycNow'), '오늘이 생리 예정일이에요');

  // 잘못된 날짜는 막음: 앞으로의 날, 겹치는 날, 끝 < 시작, 14일 넘게
  await answer('2026-11-30'); await p.click('#cycStart'); assert.ok((await toast()).includes('앞으로의 날짜'));
  await answer('2026-10-30'); await p.click('#cycStart'); assert.ok((await toast()).includes('겹쳐요'));
  await answer('2026-10-20'); await p.click('#cycEnd'); assert.ok((await toast()).includes('앞이에요'));
  await answer('2026-11-20'); await p.click('#cycEnd'); assert.ok((await toast()).includes('14일 안'));
  assert.equal((await stored()).length, 1); assert.equal((await stored())[0].end, '2026-11-01');

  // 기록 2번: 평균 주기 26일, 생리 3일째
  await answer('2026-11-23'); await p.click('#cycStart');
  assert.equal(await text('#cycMonth'), '2026년 11월');
  assert.equal(await text('#cycNow'), '생리 3일째');
  assert.equal(await p.isVisible('#cycFew'), false);
  const facts = await text('#cycFacts');
  assert.ok(facts.includes('26일') && facts.includes('12월 19일') && facts.includes('12월 5일'), facts);
  // 달력 색: 생리(끝 안 눌러도 오늘까지), 다음 달 예상
  for (const d of ['2026-11-23', '2026-11-25']) assert.ok((await p.getAttribute(`[data-d="${d}"]`, 'class')).includes('per'), d);
  assert.ok(!(await p.getAttribute('[data-d="2026-11-26"]', 'class')).includes('per'));
  assert.ok((await p.getAttribute('[data-d="2026-11-25"]', 'class')).includes('today'));
  await p.click('#cycNext'); assert.equal(await text('#cycMonth'), '2026년 12월');
  assert.ok((await p.getAttribute('[data-d="2026-12-05"]', 'class')).includes('ovu'));
  assert.ok((await p.getAttribute('[data-d="2026-12-01"]', 'class')).includes('fert'));
  assert.ok((await p.getAttribute('[data-d="2026-12-19"]', 'class')).includes('pred'));
  await p.click('#cycNext'); await p.click('#cycPrev'); await p.click('#cycPrev'); assert.equal(await text('#cycMonth'), '2026년 11월');
  // 연도 넘김
  for (let i = 0; i < 2; i++) await p.click('#cycNext'); assert.equal(await text('#cycMonth'), '2027년 1월');
  assert.equal(await p.locator('#cycCal [data-d]').count(), 31);
  for (let i = 0; i < 2; i++) await p.click('#cycPrev');

  // 그날 기록: 양 · 증상 여러 개 · 직접 입력 · 메모
  await p.click('[data-d="2026-11-24"]'); await p.waitForSelector('#daySheet[open]');
  assert.equal(await text('#dayTitle'), '11월 24일 화요일'); assert.equal(await text('#dayInfo'), '생리 기간');
  assert.equal(await p.locator('#daySym [data-sym]').count(), 10);
  await p.click('#dayFlow label:nth-child(2)'); await p.click('[data-sym="복통"]'); await p.click('[data-sym="두통"]'); await p.click('[data-sym="두통"]');
  await answer('어지러움'); await p.click('#daySym [data-add]');
  assert.equal(await p.getAttribute('[data-sym="어지러움"]', 'aria-pressed'), 'true');
  await p.fill('#dayNote', '가짜 메모');
  await p.screenshot({ path: os.tmpdir() + '/herday-cycle-day.png' });
  await p.click('#daySave');
  let day = await p.evaluate(() => JSON.parse(localStorage.getItem('cycleDays'))['2026-11-24']);
  assert.deepEqual(day, { flow: '보통', sym: ['복통', '어지러움'], note: '가짜 메모' });
  assert.equal(await p.locator('[data-d="2026-11-24"] .mk').count(), 1);
  // 다시 열면 그대로, 양을 다시 누르면 선택 풀림, 직접 입력한 증상은 다른 날에도 보임
  await p.click('[data-d="2026-11-24"]');
  assert.equal(await p.isChecked('#dayFlow input[value="보통"]'), true); assert.equal(await p.inputValue('#dayNote'), '가짜 메모');
  await p.click('#dayFlow label:nth-child(2)'); assert.equal(await p.isChecked('#dayFlow input[value="보통"]'), false);
  await p.click('#dayClose');
  await p.click('[data-d="2026-11-10"]'); assert.equal(await p.locator('[data-sym="어지러움"]').count(), 1);
  assert.equal(await p.getAttribute('[data-sym="어지러움"]', 'aria-pressed'), 'false');
  await p.click('#daySave'); // 빈 기록은 남기지 않음
  assert.equal(await p.evaluate(() => '2026-11-10' in JSON.parse(localStorage.getItem('cycleDays'))), false);

  // 지난 기록: 최근 것이 위, 고치기
  assert.equal(await p.locator('#cycList li[data-id]').count(), 2);
  assert.ok((await text('#cycList li:first-child')).includes('생리 중'));
  assert.ok((await text('#cycList li:last-child')).includes('주기 26일'));
  await p.click('#cycList li:last-child'); await p.waitForSelector('#perSheet[open]');
  assert.equal(await p.inputValue('#perStart'), '2026-10-28');
  await p.fill('#perEnd', '2026-11-02'); await p.click('#perSave');
  assert.equal((await stored()).find(x => x.start === '2026-10-28').end, '2026-11-02');
  assert.ok((await text('#cycList li:last-child')).includes('6일'));
  // 지우기: 확인에서 취소하면 그대로, 확인하면 지움
  await p.click('#cycList li:first-child');
  let asked = ''; await p.exposeFunction('__note', m => { asked = m; });
  await p.evaluate(() => { window.__askAuto = m => (window.__note(m), false); }); await p.click('#perDel');
  assert.equal((await stored()).length, 2); assert.ok(asked.includes('지울까요'));
  await answer(true); await p.click('#perDel');
  assert.equal((await stored()).length, 1); assert.equal(await p.locator('#perSheet[open]').count(), 0);
  // 다시 생리 시작
  await answer('2026-11-23'); await p.click('#cycStart');

  // 오늘 카드
  await p.evaluate(() => setSection('home'));
  assert.equal(await text('#homeCards [data-sec=cycle] small'), '생리 3일째');
  assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll');

  // 테마 5종에서 가로 넘침 없음 + 스크린샷(메인·리니어)
  await p.evaluate(() => { $('#toast').classList.remove('show'); $('#toast').hidePopover?.(); });
  await p.evaluate(() => setSection('cycle'));
  for (const k of ['main', 'clay', 'ios', 'cuberto', 'linear']) {
    await p.evaluate(k => setSkin(k), k); await p.waitForTimeout(150);
    assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll ' + k);
    if (k === 'main' || k === 'linear') await p.screenshot({ path: `${os.tmpdir()}/herday-cycle-${k}.png`, fullPage: true });
  }
  await p.click('[data-d="2026-11-24"]'); await p.waitForTimeout(500); await p.screenshot({ path: os.tmpdir() + '/herday-cycle-day-linear.png' });
  await p.click('#dayClose'); await p.evaluate(() => { setSkin('main'); setSection('home'); }); await p.waitForTimeout(600);
  await p.screenshot({ path: os.tmpdir() + '/herday-cycle-home.png' });

  assert.deepEqual(outside, [], 'nothing leaves the device');
  console.log('CYCLE UI OK'); await b.close(); process.exit(0); });
