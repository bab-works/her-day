// 주기 화면 확인 (가짜 기록, 오늘 = 2026-11-25로 고정): 생리 시작·끝(상태별 버튼 하나·다른 날·되돌리기), 잘못된 날짜 막기, 예상 문구, 달력 색·오늘, 그날 기록 즉시 저장, 고치기·지우기(되돌리기), 오늘 증상 칩, 오늘 화면, 밖으로 나가는 요청 없음
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert'), os = require('os');
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'text/html' }); r.end(b); }); }).listen(8811, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(() => { window.__cloud = { url: '' }; }); // 서버 없이(기기 모드)
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { if (!q.url().startsWith('http://localhost:8811/')) outside.push(q.url()); });
  await p.clock.setFixedTime(new Date('2026-11-25T10:00:00'));
  await p.goto('http://localhost:8811/'); await p.waitForTimeout(300);
  const answer = v => p.evaluate(v => { window.__askAuto = () => v; }, v);
  const text = s => p.textContent(s), toast = () => p.textContent('#toast');
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('cyclePeriods') || '[]'));

  // 달력 시트에서 날짜 고르기 (그 달까지 넘겨서)
  const pick = async d => {
    await p.waitForSelector('#calPick[open]');
    for (let i = 0; i < 24 && !(await p.locator(`#cpGrid [data-d="${d}"]`).count()); i++) {
      const [y, m] = (await text('#cpTitle')).match(/\d+/g).map(Number);
      await p.click(y * 12 + m > +d.slice(0, 4) * 12 + +d.slice(5, 7) ? '#cpPrev' : '#cpNext');
    }
    await p.click(`#cpGrid [data-d="${d}"]`); await p.waitForTimeout(300);
  };
  const other = async d => { await p.click('#cycOther'); await pick(d); };
  const days = () => p.evaluate(() => JSON.parse(localStorage.getItem('cycleDays') || '{}'));

  // 오늘 타일: 기록 없을 때
  assert.equal(await text('#homeCards [data-sec=cycle] small'), '기록 없음');
  assert.equal(await p.isVisible('#homeNow'), false); // 급한 게 없으면 「지금 챙길 것」 숨김
  await p.click('#homeCards [data-sec=cycle]'); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#v-cycle'), true);
  assert.ok((await text('#v-cycle')).includes('예상은 참고용이에요. 의학적 판단이나 피임 수단이 아니에요'));
  assert.equal(await p.isVisible('#cycFew'), true);
  assert.equal(await text('#cycMonth'), '2026년 11월');
  assert.equal(await p.locator('#cycCal [data-d]').count(), 30);
  assert.ok((await text('#cycList')).includes('아직 기록이 없어요'));
  assert.equal(await text('#cycGo'), '생리 시작했어요');

  // 기록 1번: 「다른 날」로 지난달 → 그 달 달력. 앞날은 고를 수 없음
  await p.click('#cycOther'); await p.waitForSelector('#calPick[open]');
  assert.equal(await p.isDisabled('#cpGrid [data-d="2026-11-26"]'), true);
  assert.equal(await p.getAttribute('#cpGrid [data-d="2026-11-25"]', 'aria-label'), '11월 25일 오늘');
  await pick('2026-10-28');
  assert.equal(await text('#cycMonth'), '2026년 10월');
  assert.ok((await toast()).includes('10월 28일 생리 시작'));
  // 끝난 날은 지난 기록 고치기에서 (달력 시트)
  await p.click('#cycList li[data-id]'); await p.waitForSelector('#perSheet[open]');
  assert.equal(await text('#perSheet .dbtn'), '10월 28일 수요일');
  await p.click('#perEnd + .dbtn'); await pick('2026-11-01'); await p.click('#perSave');
  assert.equal((await stored())[0].end, '2026-11-01');
  assert.equal(await p.isVisible('#cycFew'), true);
  assert.ok((await text('#cycFacts')).includes('11월 25일')); // 10-28 + 28일
  assert.equal(await text('#cycNow'), '오늘이 생리 예정일이에요');

  // 잘못된 날짜는 막음: 겹치는 날, 끝 < 시작, 14일 넘게
  await other('2026-10-30'); assert.ok((await toast()).includes('겹쳐요'));
  await p.click('#cycList li[data-id]'); await p.click('#perEnd + .dbtn'); await pick('2026-10-20'); await p.click('#perSave'); assert.ok((await toast()).includes('앞이에요'));
  await p.click('#perEnd + .dbtn'); await pick('2026-11-20'); await p.click('#perSave'); assert.ok((await toast()).includes('14일 안'));
  await p.click('#perCancel'); await p.waitForTimeout(300);
  assert.equal((await stored()).length, 1); assert.equal((await stored())[0].end, '2026-11-01');

  // 기록 2번: 평균 주기 26일, 생리 3일째 → 버튼은 「생리 끝났어요」
  await other('2026-11-23');
  assert.equal(await text('#cycMonth'), '2026년 11월');
  assert.equal(await text('#cycNow'), '생리 3일째'); assert.equal(await text('#cycGo'), '생리 끝났어요');
  assert.equal(await p.isVisible('#cycFew'), false);
  const facts = await text('#cycFacts');
  assert.ok(facts.includes('26일') && facts.includes('12월 19일') && facts.includes('12월 5일'), facts);
  // 달력 색: 생리(끝 안 눌러도 오늘까지), 다음 달 예상, 오늘 표시
  for (const d of ['2026-11-23', '2026-11-25']) assert.ok((await p.getAttribute(`#cycCal [data-d="${d}"]`, 'class')).includes('per'), d);
  assert.ok(!(await p.getAttribute('#cycCal [data-d="2026-11-26"]', 'class')).includes('per'));
  assert.ok((await p.getAttribute('#cycCal [data-d="2026-11-25"]', 'class')).includes('today'));
  assert.ok((await p.getAttribute('#cycCal [data-d="2026-11-25"]', 'aria-label')).includes('오늘'));
  await p.click('#cycNext'); assert.equal(await text('#cycMonth'), '2026년 12월');
  assert.ok((await p.getAttribute('#cycCal [data-d="2026-12-05"]', 'class')).includes('ovu'));
  assert.ok((await p.getAttribute('#cycCal [data-d="2026-12-01"]', 'class')).includes('fert'));
  assert.ok((await p.getAttribute('#cycCal [data-d="2026-12-19"]', 'class')).includes('pred'));
  await p.click('#cycNext'); await p.click('#cycPrev'); await p.click('#cycPrev'); assert.equal(await text('#cycMonth'), '2026년 11월');
  for (let i = 0; i < 2; i++) await p.click('#cycNext'); assert.equal(await text('#cycMonth'), '2027년 1월');
  assert.equal(await p.locator('#cycCal [data-d]').count(), 31);
  for (let i = 0; i < 2; i++) await p.click('#cycPrev');

  // 그날 기록: 누르는 즉시 저장 (양 · 증상 여러 개 · 직접 입력 · 메모)
  await p.click('#cycCal [data-d="2026-11-24"]'); await p.waitForSelector('#daySheet[open]');
  assert.equal(await text('#dayTitle'), '11월 24일 화요일'); assert.equal(await text('#dayInfo'), '생리 기간');
  assert.equal(await p.locator('#daySym [data-sym]').count(), 10);
  await p.click('#dayFlow label:nth-child(2)');
  assert.equal((await days())['2026-11-24'].flow, '보통');
  await p.click('#daySym [data-sym="복통"]'); await p.click('#daySym [data-sym="두통"]'); await p.click('#daySym [data-sym="두통"]');
  await answer('어지러움'); await p.click('#daySym [data-add]');
  assert.equal(await p.getAttribute('#daySym [data-sym="어지러움"]', 'aria-pressed'), 'true');
  assert.deepEqual((await days())['2026-11-24'].sym, ['복통', '어지러움']);
  assert.equal(await p.locator('#cycCal [data-d="2026-11-24"] .mk').count(), 1); // 달력 점도 바로
  await p.fill('#dayNote', '가짜 메모'); await p.waitForTimeout(650);
  assert.deepEqual((await days())['2026-11-24'], { flow: '보통', sym: ['복통', '어지러움'], note: '가짜 메모' });
  await p.screenshot({ path: os.tmpdir() + '/herday-cycle-day.png' });
  await p.click('#dayDone'); await p.waitForTimeout(300);
  // 다시 열면 그대로, 양을 다시 누르면 선택 풀림(바로 저장), 메모는 닫을 때도 저장
  await p.click('#cycCal [data-d="2026-11-24"]');
  assert.equal(await p.isChecked('#dayFlow input[value="보통"]'), true); assert.equal(await p.inputValue('#dayNote'), '가짜 메모');
  await p.click('#dayFlow label:nth-child(2)'); assert.equal(await p.isChecked('#dayFlow input[value="보통"]'), false);
  assert.equal((await days())['2026-11-24'].flow, '');
  await p.fill('#dayNote', '가짜 메모 2'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  assert.equal((await days())['2026-11-24'].note, '가짜 메모 2');
  await p.click('#cycCal [data-d="2026-11-10"]'); assert.equal(await p.locator('#daySym [data-sym="어지러움"]').count(), 1);
  assert.equal(await p.getAttribute('#daySym [data-sym="어지러움"]', 'aria-pressed'), 'false');
  await p.click('#dayDone'); await p.waitForTimeout(300); // 빈 기록은 남기지 않음
  assert.equal('2026-11-10' in (await days()), false);

  // 지난 기록: 최근 것이 위, 고치기
  assert.equal(await p.locator('#cycList li[data-id]').count(), 2);
  assert.ok((await text('#cycList li:first-child')).includes('생리 중'));
  assert.ok((await text('#cycList li:last-child')).includes('주기 26일'));
  await p.click('#cycList li:last-child'); await p.waitForSelector('#perSheet[open]');
  assert.equal(await p.inputValue('#perStart'), '2026-10-28');
  await p.click('#perEnd + .dbtn'); await pick('2026-11-02'); await p.click('#perSave');
  assert.equal((await stored()).find(x => x.start === '2026-10-28').end, '2026-11-02');
  assert.ok((await text('#cycList li:last-child')).includes('6일'));
  // 지우기: 묻지 않고 지우고 「되돌리기」로 원래대로
  await p.waitForTimeout(300); await p.click('#cycList li:first-child'); await p.click('#perDel');
  assert.equal((await stored()).length, 1); assert.equal(await p.locator('#perSheet[open]').count(), 0);
  assert.equal(await text('#toast button'), '되돌리기'); await p.click('#toast button');
  assert.equal((await stored()).length, 2); assert.equal(await text('#cycNow'), '생리 3일째');
  await p.click('#cycList li:first-child'); await p.click('#perDel'); assert.equal((await stored()).length, 1);
  // 「생리 시작했어요」는 오늘로 바로 + 되돌리기
  await p.click('#cycGo'); assert.equal((await stored()).length, 2); assert.equal(await text('#cycNow'), '생리 1일째');
  await p.click('#toast button'); assert.equal((await stored()).length, 1);
  await other('2026-11-23');

  // 화면 아래 「오늘 증상」: 그날 기록 창과 같은 칩, 고른 것에만 최근 7일
  assert.equal(await p.locator('#cycSym [data-sym]').count(), 11); // 기본 10 + 직접 입력한 1
  assert.equal(await p.locator('#cycSym small').count(), 0);
  await p.click('#cycSym [data-sym="복통"]');
  assert.equal(await p.getAttribute('#cycSym [data-sym="복통"]', 'aria-pressed'), 'true');
  assert.equal(await text('#cycSym [data-sym="복통"] small'), '최근 7일 중 2일'); // 어제 + 오늘
  await p.click('#cycSym [data-sym="복통"]'); await p.click('#cycSym [data-sym="두통"]'); await p.click('#cycSym [data-sym="피로"]');
  assert.deepEqual((await days())['2026-11-25'].sym, ['두통', '피로']);
  assert.equal(await p.locator('#cycCal [data-d="2026-11-25"] .mk').count(), 1);
  await p.click('#cycSym [data-sym="피로"]');
  await answer('손발 저림'); await p.click('#cycSym [data-add]');
  assert.equal(await p.getAttribute('#cycSym [data-sym="손발 저림"]', 'aria-pressed'), 'true');
  assert.deepEqual((await days())['2026-11-25'].sym, ['두통', '손발 저림']);
  // 그날 기록 창에도 같은 내용
  await p.click('#cycCal [data-d="2026-11-25"]'); assert.equal(await p.getAttribute('#daySym [data-sym="두통"]', 'aria-pressed'), 'true'); await p.click('#dayDone'); await p.waitForTimeout(300);
  // 다 풀면 오늘 기록이 사라짐
  await p.click('#cycSym [data-sym="두통"]'); await p.click('#cycSym [data-sym="손발 저림"]');
  assert.equal('2026-11-25' in (await days()), false);
  await p.click('#cycSym [data-sym="두통"]');

  // 오늘 화면: 타일 + 「지금 챙길 것」(생리 중 → 바로 「생리 끝났어요」)
  await p.evaluate(() => setSection('home'));
  assert.equal(await text('#homeCards [data-sec=cycle] small'), '생리 3일째');
  assert.equal(await p.isVisible('#homeNow'), true); assert.equal(await text('#homeNowList .now-act'), '생리 끝났어요');
  await p.click('#homeNowList .now-act'); assert.equal((await stored()).find(x => x.start === '2026-11-23').end, '2026-11-25');
  await p.click('#toast button'); assert.equal((await stored()).find(x => x.start === '2026-11-23').end, null);
  assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll');

  // 테마 5종에서 가로 넘침 없음 + 스크린샷(메인·리니어)
  await p.evaluate(() => { $('#toast').classList.remove('show'); $('#toast').hidePopover?.(); });
  await p.evaluate(() => setSection('cycle'));
  for (const k of ['main', 'clay', 'ios', 'cuberto', 'linear']) {
    await p.evaluate(k => setSkin(k), k); await p.waitForTimeout(150);
    assert.ok(await p.$eval('body', b => b.scrollWidth <= innerWidth), 'no sideways scroll ' + k);
    if (k === 'main' || k === 'linear') await p.screenshot({ path: `${os.tmpdir()}/herday-cycle-${k}.png`, fullPage: true });
    if (k === 'clay') await p.screenshot({ path: `${os.tmpdir()}/herday-cycle-clay.png`, fullPage: true });
  }
  await p.click('#cycCal [data-d="2026-11-24"]'); await p.waitForTimeout(500); await p.screenshot({ path: os.tmpdir() + '/herday-cycle-day-linear.png' });
  await p.click('#dayDone'); await p.evaluate(() => { setSkin('main'); setSection('home'); }); await p.waitForTimeout(600);
  await p.screenshot({ path: os.tmpdir() + '/herday-cycle-home.png' });

  assert.deepEqual(outside, [], 'nothing leaves the device');
  console.log('CYCLE UI OK'); await b.close(); process.exit(0); });
