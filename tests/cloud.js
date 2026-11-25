// 로그인·클라우드 저장 확인 (가짜 Supabase 서버, 가짜 기록): 로그인 전엔 로그인 화면, 가입하면 옛 기록이 계정으로 옮겨짐,
// 새 기록이 올라감, 요청은 서버 주소로만·본인 토큰으로만, 로그아웃하면 기기 기록이 지워짐, 다른 계정으로 로그인하면 그 계정 기록만 보임
const { chromium, devices } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), assert = require('assert');
const API = 'https://test.supabase.co';
http.createServer((q, r) => { const f = path.join(__dirname, '..', q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); fs.readFile(f, (e, b) => { r.writeHead(e ? 404 : 200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : f.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); r.end(b); }); }).listen(8812, async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ ...devices['iPhone 13'] }), p = await ctx.newPage(), outside = [];
  await ctx.addInitScript(api => { window.__cloud = { url: api, key: 'test-key' }; }, API);
  p.on('pageerror', e => { console.error('ERR', e.message); process.exit(1); });
  p.on('request', q => { const u = q.url(); if (!u.startsWith('http://localhost:8812/') && !u.startsWith(API + '/')) outside.push(u); });
  // 가짜 서버: 사용자·줄(row)은 메모리에. 토큰 = 'tok-' + id. 본인 줄만 돌려줌(서버의 RLS 흉내)
  const users = { 'a@test.dev': { id: 'u-a', pw: 'secret1' }, 'b@test.dev': { id: 'u-b', pw: 'secret2' } }, rows = { 'u-b': { 'cyclePeriods': [{ id: 'pb', start: '2026-09-02', end: '2026-09-06' }] } }, posts = [], mails = [];
  const sess = (email, u) => ({ access_token: 'tok-' + u.id, refresh_token: 'ref-' + u.id, expires_in: 3600, user: { id: u.id, email } });
  await p.route(API + '/**', async route => {
    const q = route.request(), u = new URL(q.url()), h = q.headers(), body = q.postDataJSON?.() ?? null, who = (h.authorization || '').replace('Bearer tok-', '');
    assert.equal(h.apikey, 'test-key');
    const j = (s, o) => route.fulfill({ status: s, contentType: 'application/json', body: o == null ? '' : JSON.stringify(o) });
    if (u.pathname === '/auth/v1/signup') { if (users[body.email]) return j(422, { code: 422, error_code: 'user_already_exists', msg: 'exists' }); users[body.email] = { id: 'u-new', pw: body.password }; return j(200, sess(body.email, users[body.email])); }
    if (u.pathname === '/auth/v1/token') { const x = users[body.email]; return x && x.pw === body.password ? j(200, sess(body.email, x)) : j(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }); }
    if (u.pathname === '/auth/v1/logout') return j(204);
    if (u.pathname === '/auth/v1/recover') { mails.push([body.email, u.searchParams.get('redirect_to')]); return j(200, {}); }
    if (u.pathname === '/auth/v1/user') { const e = Object.keys(users).find(k => users[k].id === who); if (!e) return j(401, { code: 401, error_code: 'bad_jwt' });
      if (q.method() === 'PUT') { if (body.password === users[e].pw) return j(422, { error_code: 'same_password' }); users[e].pw = body.password; }
      return j(200, { id: who, email: e }); }
    if (u.pathname === '/rest/v1/herday') {
      assert.ok(who.startsWith('u-'), 'rest calls carry the user token');
      if (q.method() === 'GET') return j(200, rows[who] ? [{ data: rows[who] }] : []);
      assert.equal(body.user_id, who, 'writes only own row'); rows[who] = body.data; posts.push(who); return j(201);
    }
    return j(404, {});
  });
  const toast = () => p.textContent('#toast'), ls = k => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
  // 로그인 전부터 기기에 있던 기록 (가짜)
  await p.goto('http://localhost:8812/');
  await p.evaluate(() => { localStorage.setItem('cyclePeriods', JSON.stringify([{ id: 'old1', start: '2026-10-28', end: '2026-11-01' }])); localStorage.setItem('cycleSyms', '["어지러움"]'); });
  await p.reload(); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#login'), true, 'login screen first');
  await p.screenshot({ path: require('os').tmpdir() + '/herday-login.png' });

  // 틀린 비밀번호
  await p.fill('#loginEmail', 'a@test.dev'); await p.fill('#loginPw', 'wrongpw'); await p.click('#loginGo'); await p.waitForTimeout(200);
  assert.equal(await toast(), '이메일이나 비밀번호가 맞지 않아요'); assert.equal(await p.isVisible('#login'), true);
  // 이미 있는 이메일로 가입
  await p.click('#loginMode'); assert.equal(await p.textContent('#loginGo'), '가입하기');
  await p.fill('#loginPw', 'short'); await p.click('#loginGo'); assert.equal(await toast(), '비밀번호를 8자 이상으로 해 주세요');
  await p.fill('#loginPw', 'secret11'); await p.click('#loginGo'); await p.waitForTimeout(200);
  assert.equal(await toast(), '이미 가입한 이메일이에요');
  // 새로 가입 → 옛 기록이 계정으로
  await p.fill('#loginEmail', 'new@test.dev'); await p.fill('#loginPw', 'secret99'); await p.click('#loginGo'); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#login'), false); assert.equal(await toast(), '가입했어요');
  assert.deepEqual(rows['u-new'].cyclePeriods.map(x => x.id), ['old1'], 'old records moved into the account');
  assert.deepEqual(rows['u-new'].cycleSyms, ['어지러움']);
  assert.equal(await ls('owner'), 'u-new');
  // 새 기록 → 잠깐 뒤 올라감
  await p.evaluate(() => { window.__askAuto = () => '2026-11-20'; setSection('cycle'); }); await p.click('#cycStart'); await p.waitForTimeout(1100);
  assert.deepEqual(rows['u-new'].cyclePeriods.map(x => x.start), ['2026-10-28', '2026-11-20']);
  assert.equal(await ls('dirty'), null);
  // 설정에 계정 표시 → 로그아웃하면 기기 기록 지움
  await p.click('#openSettings'); assert.equal(await p.textContent('#acctEmail'), 'new@test.dev');
  await p.evaluate(() => { window.__askAuto = () => true; }); await p.click('#logout'); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#login'), true);
  for (const k of ['auth', 'owner', 'cyclePeriods', 'cycleSyms']) assert.equal(await ls(k), null, k + ' cleared on logout');
  // 다른 계정(b)으로 로그인 → b의 기록만, 앞 사람 기록은 안 섞임
  await p.click('#loginMode'); assert.equal(await p.textContent('#loginGo'), '로그인');
  await p.fill('#loginEmail', 'b@test.dev'); await p.fill('#loginPw', 'secret2'); await p.click('#loginGo'); await p.waitForTimeout(300);
  assert.deepEqual((await ls('cyclePeriods')).map(x => x.id), ['pb']);
  assert.deepEqual(rows['u-new'].cyclePeriods.length, 2, 'other account untouched');
  // 다시 열면 로그인 유지, 서버에서 받아 옴 (다른 기기에서 바뀐 기록)
  rows['u-b'].cyclePeriods.push({ id: 'pb2', start: '2026-10-01', end: '2026-10-05' });
  await p.reload(); await p.waitForTimeout(400);
  assert.equal(await p.isVisible('#login'), false);
  assert.deepEqual((await ls('cyclePeriods')).map(x => x.id), ['pb', 'pb2']);
  // 비밀번호 찾기: 메일 요청 → 메일 링크(#access_token…type=recovery)로 열면 그 계정으로 로그인 + 새 비밀번호(8자 미만은 다시)
  await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(300);
  await p.fill('#loginEmail', 'b@test.dev'); await p.evaluate(() => { window.__askAuto = (m, inp) => inp && true; }); await p.click('#loginForgot'); await p.waitForTimeout(200);
  assert.deepEqual(mails, [['b@test.dev', 'http://localhost:8812/']]); assert.ok((await toast()).includes('메일을 보냈어요'));
  await ctx.addInitScript(() => { const a = ['short', 'secret2', 'newpass99']; window.__askAuto = (m, inp) => inp ? a.shift() : true; });
  await p.goto('about:blank'); await p.goto('http://localhost:8812/#access_token=tok-u-b&refresh_token=ref-u-b&expires_in=3600&token_type=bearer&type=recovery'); await p.waitForTimeout(500);
  assert.equal(users['b@test.dev'].pw, 'newpass99', 'short and same passwords refused, then changed');
  assert.equal(await p.isVisible('#login'), false); assert.equal(await p.evaluate(() => location.hash), '', 'token removed from address');
  assert.deepEqual((await ls('cyclePeriods')).map(x => x.id), ['pb', 'pb2']);
  // 만료된 링크
  await p.evaluate(() => localStorage.clear()); await p.goto('about:blank'); await p.goto('http://localhost:8812/#error=access_denied&error_code=otp_expired'); await p.waitForTimeout(300);
  assert.ok((await toast()).includes('링크가 만료됐어요')); assert.equal(await p.isVisible('#login'), true);
  // 계정 기록과 기기 기록 합치기 (주인 없는 기록일 때만 쓰임)
  assert.deepEqual(await p.evaluate(() => Cloud.merge({ cyclePeriods: [{ id: 1, s: 'l' }, { id: 2 }], cycleDays: { a: 1, b: 1 }, cycleSyms: ['x'] }, { cyclePeriods: [{ id: 1, s: 'r' }], cycleDays: { b: 2 }, cycleSyms: ['x', 'y'] })),
    { cyclePeriods: [{ id: 2 }, { id: 1, s: 'r' }], cycleDays: { a: 1, b: 2 }, cycleSyms: ['x', 'y'] });
  assert.deepEqual(outside, [], 'requests go only to the app and its own server');
  console.log('CLOUD OK'); await b.close(); process.exit(0); });
