// 로그인 · 클라우드 저장 (Supabase, 라이브러리 없이 fetch로)
// 주소·공개 키(anon/publishable)는 비밀이 아님. 「각자 자기 기록만」 규칙(RLS)은 서버 쪽 supabase.sql에 있음
// 기록은 사람마다 한 줄(herday 표의 data)에 통째로 저장. 마지막에 올린 쪽이 이김
const SUPA_URL = 'https://utkbghjzddwkvgnacwyn.supabase.co';
const SUPA_KEY = 'sb_publishable_4MHAZLRgpoPgL-EepOSAgw__MxXQUfn'; // 공개 키(publishable). secret 키는 절대 넣지 않음
const Cloud = (() => {
  const C = window.__cloud || { url: SUPA_URL, key: SUPA_KEY }; // 테스트는 window.__cloud로 바꿔 씀
  const SYNC = ['cyclePeriods', 'cycleDays', 'cycleSyms', 'care_nail', 'care_skin', 'care_hair', 'careGap', 'interests']; // 기록과 관심 항목만 올림. 테마·잠금·보던 화면은 기기마다
  const ls = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const KO = { invalid_credentials: '이메일이나 비밀번호가 맞지 않아요', user_already_exists: '이미 가입한 이메일이에요', email_exists: '이미 가입한 이메일이에요',
    weak_password: '비밀번호를 6자 이상으로 해 주세요', email_not_confirmed: '메일함에서 인증 링크를 먼저 눌러 주세요', validation_failed: '이메일 주소를 확인해 주세요',
    email_address_invalid: '이메일 주소를 확인해 주세요', over_email_send_rate_limit: '잠시 뒤에 다시 해 주세요', over_request_rate_limit: '잠시 뒤에 다시 해 주세요',
    same_password: '지금과 다른 비밀번호로 해 주세요', session_not_found: '다시 로그인해 주세요' };

  async function call(path, { method = 'GET', body, auth, headers = {} } = {}) {
    let r;
    try {
      r = await fetch(C.url + path, { method, headers: { apikey: C.key, 'Content-Type': 'application/json', ...(auth && { Authorization: 'Bearer ' + auth }), ...headers },
        body: body && JSON.stringify(body) });
    } catch { throw Object.assign(new Error('인터넷 연결을 확인해 주세요'), { offline: true }); }
    const t = await r.text(), j = t ? JSON.parse(t) : null;
    if (!r.ok) throw Object.assign(new Error(KO[j?.error_code || j?.code] || (j?.error === 'invalid_grant' ? KO.invalid_credentials : '잠시 뒤에 다시 해 주세요')), { status: r.status });
    return j;
  }
  const keep = j => ls.set('auth', { access: j.access_token, refresh: j.refresh_token, exp: Date.now() / 1e3 + (j.expires_in || 3600), id: j.user.id, email: j.user.email });
  async function token() { // 만료 1분 전이면 새로 받음. 못 받으면(계정이 사라짐 등) 로그아웃 상태로
    const a = ls.get('auth'); if (!a) return null;
    if (a.exp - 60 > Date.now() / 1e3) return a.access;
    try { keep(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: a.refresh } })); return ls.get('auth').access; }
    catch (e) { if (!e.offline) ls.set('auth', null); throw e; }
  }

  // 로그인 전부터 이 기기에 있던 기록(주인 없음)을 계정 기록과 합침: id 있는 목록은 id로, 글 목록은 중복 없이, 날짜별 기록은 계정 쪽 우선
  function merge(a = {}, b = {}) {
    const out = { ...a, ...b };
    for (const k of Object.keys(a)) if (k in b) {
      const x = a[k], y = b[k];
      if (Array.isArray(x) && Array.isArray(y)) out[k] = x.every(v => v?.id) ? [...x.filter(v => !y.some(w => w?.id === v.id)), ...y] : [...new Set([...x, ...y])];
      else if (x && y && typeof x === 'object' && typeof y === 'object') out[k] = { ...x, ...y };
    }
    return out;
  }
  const local = () => Object.fromEntries(SYNC.map(k => [k, ls.get(k)]).filter(([, v]) => v != null));
  const has = d => Object.values(d).some(v => (Array.isArray(v) ? v.length : Object.keys(v || {}).length));

  async function push() {
    const a = ls.get('auth'), t = await token(); if (!t) return;
    await call('/rest/v1/herday', { method: 'POST', auth: t, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { user_id: a.id, data: local(), updated_at: new Date().toISOString() } });
    ls.set('dirty', null);
  }
  let timer = 0;
  // store.set 뒤에 부름: 기록이 바뀌면 잠깐 모았다가 올림. 못 올리면 dirty로 남겨 다음에 다시
  function changed(k) {
    if (!SYNC.includes(k) || !ls.get('auth')) return;
    ls.set('dirty', true); clearTimeout(timer); timer = setTimeout(() => push().catch(() => {}), 800);
  }
  // 열 때·새로고침 때: 이 기기에서 못 올린 게 있으면 올리고, 아니면 계정 기록을 받아 옴. 주인 없는 옛 기록은 합쳐서 올림
  async function sync() {
    const a = ls.get('auth'), t = a && await token(); if (!t) return false;
    if (ls.get('owner') === a.id && ls.get('dirty')) { await push(); return false; }
    const row = (await call('/rest/v1/herday?select=data', { auth: t }))?.[0];
    const mine = local(), legacy = ls.get('owner') == null && has(mine); // 다른 계정이 남긴 기록이면 합치지 않고 버림
    const data = legacy ? merge(mine, row?.data) : row?.data || {};
    SYNC.forEach(k => ls.set(k, data[k] ?? null)); ls.set('owner', a.id);
    if (legacy || !row) await push();
    return true;
  }

  async function signIn(email, password) { keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })); }
  async function signUp(email, password) { // 메일 인증을 켜 둔 서버면 세션 없이 돌아옴 → false
    const j = await call('/auth/v1/signup', { method: 'POST', body: { email, password } });
    if (!j?.access_token) return false; keep(j); return true;
  }
  // 비밀번호 찾기: 가입한 메일로 링크를 보냄(없는 메일이어도 같은 답이라 가입 여부가 드러나지 않음). 링크는 이 앱 주소로 돌아옴
  async function forgot(email) { await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(location.origin + location.pathname), { method: 'POST', body: { email } }); }
  // 메일 링크로 열렸을 때: 주소 # 뒤 토큰으로 로그인하고 주소에서 지움. 'recovery'(비밀번호 재설정) · 'expired'(만료·잘못된 링크) · null
  async function fromLink() {
    const h = new URLSearchParams(location.hash.slice(1)); if (!h.has('access_token') && !h.has('error')) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (!h.has('access_token')) return 'expired';
    const user = await call('/auth/v1/user', { auth: h.get('access_token') });
    keep({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: +h.get('expires_in') || 3600, user });
    return h.get('type');
  }
  async function setPassword(password) { await call('/auth/v1/user', { method: 'PUT', auth: await token(), body: { password } }); }
  // 로그아웃: 다음 사람이 이 기기로 로그인해도 기록이 섞이거나 보이지 않게 기기의 기록을 지움 (계정에는 남음)
  async function signOut() {
    clearTimeout(timer);
    const t = await token().catch(() => null); if (t) call('/auth/v1/logout', { method: 'POST', auth: t }).catch(() => {});
    ['auth', 'owner', 'dirty', ...SYNC].forEach(k => ls.set(k, null));
  }
  return { on: !!C.url, user: () => ls.get('auth'), dirty: () => !!ls.get('dirty'), signIn, signUp, signOut, forgot, fromLink, setPassword, sync, push, changed, merge, SYNC };
})();
