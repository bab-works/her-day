// her-day: 주기 · 수면 · 약과 영양제 · 네일을 나만 보는 곳에 기록하는 앱
// 화면 모양·동작은 하트(bab-works/bab-zip)와 같은 규칙을 따름 (AGENTS.md)
// 기록은 이 기기의 localStorage에만 저장: 서버·시트로 보내지 않음 (건강 정보라서)
const $ = s => document.querySelector(s);
const APP_VERSION = 'herday-v1'; // sw.js의 CACHE와 같아야 함 (tests/version.js가 확인)
document.addEventListener('pointerdown', () => document.documentElement.classList.add('pointer-focus'), true);
document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) document.documentElement.classList.remove('pointer-focus'); }, true);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { $('#storageError').hidden = false; return false; } },
};
navigator.storage?.persist?.(); // 브라우저가 기록을 임의로 지우지 않게 요청
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 알림 문구 (화면 아래 잠깐)
let toastTimer = 0;
function toast(t, ms = 3500) {
  const el = $('#toast'), host = document.activeElement?.closest('dialog[open]') || document.body;
  host.append(el);
  if (el.showPopover) { el.popover = 'manual'; el.showPopover(); }
  el.textContent = t; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('show'); el.hidePopover?.(); }, ms);
}
// 브라우저 기본 confirm/prompt 대신 (테스트는 window.__askAuto로 자동 응답)
function ask(msg, { ok = '확인', danger = false, input = null, type = 'text' } = {}) {
  if (window.__askAuto) return Promise.resolve(window.__askAuto(msg, input != null)).then(v => input != null ? (v === true ? input : v) : !!v);
  return new Promise(done => {
    const d = $('#ask'), f = d.querySelector('form'), i = f.querySelector('input');
    $('#askMsg').textContent = msg; i.hidden = input == null; i.type = type; i.value = input ?? '';
    const yes = $('#askOk'); yes.textContent = ok; yes.classList.toggle('danger-fill', danger);
    let answered = false; const finish = v => { if (answered) return; answered = true; d.close(); done(v); };
    f.onsubmit = e => { e.preventDefault(); finish(input != null ? i.value : true); };
    $('#askNo').onclick = () => finish(input != null ? null : false);
    d.onclose = () => finish(input != null ? null : false);
    d.showModal(); if (input != null) setTimeout(() => { i.focus(); i.select(); }, 50);
  });
}

// ── 섹션(사이드 메뉴) ──
const SECTIONS = {
  home: { title: '오늘', desc: '' },
  cycle: { title: '주기', desc: '생리 · 배란일 · PMS 기록과 다음 주기 예상' },
  sleep: { title: '수면', desc: '잠든 시간 · 일어난 시간 · 잠의 질' },
  meds: { title: '약 · 영양제', desc: '먹을 약과 영양제, 오늘 먹었는지 체크' },
  nail: { title: '네일', desc: '시술 날짜 · 샵 · 디자인 사진 · 다음 관리일' },
};
let sec = 'home';
function setSection(k) {
  sec = SECTIONS[k] ? k : 'home'; store.set('sec', sec);
  $('#appTitle').textContent = SECTIONS[sec].title;
  $('#v-home').hidden = sec !== 'home'; $('#v-sec').hidden = sec === 'home';
  if (sec === 'home') renderHome(); else { $('#secHead').textContent = SECTIONS[sec].title; $('#secDesc').textContent = SECTIONS[sec].desc; }
  const v = $(sec === 'home' ? '#v-home' : '#v-sec'); v.classList.remove('enter'); v.offsetWidth; v.classList.add('enter');
  window.scrollTo(0, 0);
}
function renderHome() {
  const d = new Date();
  $('#dashDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  $('#homeCards').innerHTML = Object.entries(SECTIONS).filter(([k]) => k !== 'home').map(([k, s]) =>
    `<button type="button" class="card home-sec" data-sec="${k}"><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg><span><b>${esc(s.title)}</b><small>${esc(s.desc)}</small></span></button>`).join('');
}
$('#homeCards').addEventListener('click', e => { const k = e.target.closest('[data-sec]')?.dataset.sec; if (k) setSection(k); });

// 사이드 메뉴: --p(열린 정도 0~1)로 하트와 같은 곡선으로 열고 닫음
const root = document.documentElement, menuP = p => root.style.setProperty('--p', p);
function openMenu() {
  $('#menuList').innerHTML = Object.entries(SECTIONS).map(([k, s]) =>
    `<button type="button" data-sec="${k}" ${k === sec ? 'aria-current="page"' : ''}><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg>${esc(s.title)}</button>`).join('');
  menuP(0); root.classList.add('menu-open'); $('#menu').showModal(); $('#menu').offsetWidth;
  requestAnimationFrame(() => menuP(1));
}
function closeMenu(then) {
  menuP(0); setTimeout(() => { $('#menu').close(); root.classList.remove('menu-open'); then?.(); }, 420);
}
$('#menuBtn').addEventListener('click', openMenu);
$('#menu').addEventListener('click', e => {
  if (e.target === $('#menu')) return closeMenu(); // 바깥(어두운 곳)을 누르면 닫힘
  const k = e.target.closest('[data-sec]')?.dataset.sec; if (k) closeMenu(() => setSection(k));
});
$('#menu').addEventListener('cancel', e => { e.preventDefault(); closeMenu(); });
$('#menuSettings').addEventListener('click', () => closeMenu(openPrefs));

// ── 테마 5가지 (하트와 같은 이름·색) ──
const SKINS = [['main', '메인 테마', '#f2f4f6', '#ffffff', '#3182f6', '10px', '0 1px 2px rgba(0,0,0,.06)'],
  ['clay', '클레이모피즘', '#fbefe5', '#fff7f0', '#ff7a3d', '12px', '3px 3px 6px rgba(214,160,125,.35), inset 1px 1px 2px #fff'],
  ['ios', 'iOS 27', 'linear-gradient(160deg,#dfe9ff,#f7e8ff 55%,#e3fbf3)', 'rgba(255,255,255,.6)', '#0a84ff', '12px', 'inset 0 1px 0 #fff, 0 2px 8px rgba(31,38,135,.12)'],
  ['cuberto', '쿠베르토', '#f4f4f2', '#ffffff', '#0b0b0b', '14px', '0 8px 14px -8px rgba(20,20,40,.35)'],
  ['linear', '리니어', '#0d0e10', '#17181b', '#5e6ad2', '4px', 'inset 0 0 0 1px rgba(255,255,255,.08)']];
const skin = () => store.get('skin', 'main');
function setSkin(k) {
  store.set('skin', k); root.dataset.skin = k;
  const tc = { clay: '#fbefe5', linear: '#0d0e10', cuberto: '#f4f4f2', ios: '#eef1f7' }[k];
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', tc || (m.media.includes('dark') ? '#101013' : '#f2f4f6')));
  renderSkins(); $('#prefThemeVal').textContent = (SKINS.find(x => x[0] === k) || SKINS[0])[1];
}
function renderSkins() {
  $('#skinList').innerHTML = SKINS.map(([k, n, bg, card, acc, r, sh], i) => `<button type="button" role="radio" data-skin="${k}" aria-checked="${skin() === k}">
    <span class="skin-prev" style="--pb:${bg};--pc:${card};--pa:${acc};--pr:${r};--ps:${sh}" aria-hidden="true"><i></i><i></i><i></i><b></b></span>${i + 1}. ${n}</button>`).join('');
}
$('#skinList').addEventListener('click', e => { const k = e.target.closest('[data-skin]')?.dataset.skin; if (k) { setSkin(k); toast(`「${SKINS.find(x => x[0] === k)[1]}」로 바꿨어요`); } });
$('#prefTheme').addEventListener('click', () => $('#themeSheet').showModal());
$('#themeClose').addEventListener('click', () => $('#themeSheet').close());
function openPrefs() { $('#lockOn').checked = !!store.get('lockId'); $('#appVer').textContent = '앱 버전 ' + APP_VERSION.replace('herday-', ''); $('#prefs').showModal(); }
$('#openSettings').addEventListener('click', openPrefs);
$('#prefsClose').addEventListener('click', () => $('#prefs').close());

// ── Face ID 잠금 (패스키): 화면을 가리는 잠금. Face ID가 안 되면 아이폰이 기기 암호를 물어봄 ──
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))), unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const ss = { get: k => { try { return +sessionStorage.getItem(k) || 0; } catch { return 0; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
let unlocking = false, hiddenAt = 0;
const unlocked = () => { ss.set('unlockedAt', Date.now()); $('#lock').close(); };
async function unlock(auto) {
  if (unlocking) return; unlocking = true;
  try { await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: [{ type: 'public-key', id: unb64(store.get('lockId')) }], userVerification: 'required', timeout: 60000 } }); unlocked(); }
  catch { if (auto !== true) toast('Face ID를 확인하지 못했어요 · 다시 눌러 주세요'); }
  finally { unlocking = false; hiddenAt = 0; }
}
// 방금(2분 안) 풀었으면 새 버전으로 새로고침돼도 다시 잠그지 않음 (하트에서 겪은 두 번 묻기 방지)
const lockNow = () => { if (store.get('lockId') && !$('#lock').open && !unlocking && Date.now() - ss.get('unlockedAt') > 120e3) { $('#lock').showModal(); setTimeout(() => unlock(true), 150); } };
$('#lock').addEventListener('cancel', e => e.preventDefault());
$('#unlock').addEventListener('click', () => unlock());
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (!unlocking) hiddenAt = Date.now(); } else if (hiddenAt && Date.now() - hiddenAt > 60e3) lockNow(); });
$('#lockOn').addEventListener('change', async e => {
  if (!e.target.checked) { store.set('lockId', ''); return toast('Face ID 잠금을 껐어요'); }
  try {
    const c = await navigator.credentials.create({ publicKey: { challenge: rand(32), rp: { name: 'her-day' }, user: { id: rand(16), name: 'her-day', displayName: 'her-day' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 60000,
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' } } });
    store.set('lockId', b64(c.rawId)); ss.set('unlockedAt', Date.now()); toast('다음부터 앱을 열 때 Face ID로 잠금을 풀어요');
  } catch { e.target.checked = false; toast('이 기기에서는 Face ID 잠금을 켤 수 없어요'); }
});

// ── 당겨서 새로고침 (맨 위에서 70px 넘게 끌었다 놓기). 화면 전체가 튕기는 건 CSS overscroll-behavior로 막음 ──
{
  let y0 = null, pull = 0;
  const el = $('#ptr'), off = t => document.querySelector('dialog[open]') || t.closest('input, textarea, select') || window.scrollY > 0;
  document.addEventListener('touchstart', e => { y0 = e.touches.length === 1 && !off(e.target) ? e.touches[0].clientY : null; pull = 0; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return;
    pull = Math.max(0, Math.min(110, (e.touches[0].clientY - y0) * .5));
    el.style.setProperty('--pull', pull + 'px'); el.classList.toggle('on', pull > 8); el.classList.toggle('ready', pull > 70);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    const go = pull > 70; pull = 0; el.classList.remove('on', 'ready'); el.style.setProperty('--pull', '0px');
    if (go) refresh();
  });
}
// 기록이 기기 안에 있어서 「새로고침」 = 새 버전 확인 + 화면 다시 그리기
function refresh() { checkVersion(); setSection(sec); toast('새로 불러왔어요', 1500); }
$('#reload').addEventListener('click', refresh);

// ── 새 버전 확인: 배포된 sw.js의 버전과 지금 화면의 버전을 비교해서 다르면 새로고침 ──
async function checkVersion() {
  try {
    const live = (await (await fetch('sw.js', { cache: 'no-store' })).text()).match(/herday-v\d+/)?.[0];
    if (live && live !== APP_VERSION && !document.querySelector('dialog[open]')) location.reload();
  } catch {}
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js');
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
}

// ── 시작 ──
setSkin(skin());
setSection(store.get('sec', 'home'));
lockNow();
