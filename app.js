// her-day: 여성을 위한 종합 뷰티 · 건강 기록 앱 (주기 · 수면 · 약과 영양제 · 네일 · 피부 시술 · 미용실)
// 화면 모양·동작은 하트(bab-works/bab-zip)와 같은 규칙을 따름 (AGENTS.md)
// 기록은 localStorage에 두고, 로그인하면 본인 계정(Supabase, cloud.js)에도 저장해 다른 기기에서 이어 씀. 남은 볼 수 없음 (supabase.sql의 RLS)
const $ = s => document.querySelector(s);
const APP_VERSION = 'herday-v10'; // sw.js의 CACHE와 같아야 함 (tests/version.js가 확인)
document.addEventListener('pointerdown', () => document.documentElement.classList.add('pointer-focus'), true);
document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) document.documentElement.classList.remove('pointer-focus'); }, true);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); Cloud.changed(k); return true; } catch { $('#storageError').hidden = false; return false; } },
};
navigator.storage?.persist?.(); // 브라우저가 기록을 임의로 지우지 않게 요청
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 알림 문구 (화면 아래 잠깐). undo: 누르면 되돌리는 함수 → 「되돌리기」 단추 (하트와 같음)
let toastTimer = 0;
function toast(t, ms = 3500, undo) {
  const el = $('#toast'), host = document.activeElement?.closest('dialog[open]:not(.closing)') || document.body;
  host.append(el);
  if (el.showPopover) { el.popover = 'manual'; el.showPopover(); }
  el.textContent = t; el.classList.add('show'); el.classList.toggle('act', !!undo);
  if (undo) { const b = document.createElement('button'); b.type = 'button'; b.textContent = '되돌리기'; b.onclick = () => { el.classList.remove('show'); undo(); }; el.append(b); ms = Math.max(ms, 5000); }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.classList.remove('show'); el.hidePopover?.(); }, ms);
}
// 고른 것만 살짝 튀어오르게 (하트의 pop)
const bump = el => { if (!el || calm()) return; el.classList.remove('popped'); el.offsetWidth; el.classList.add('popped'); };

// 창 닫기: 내려가는 애니메이션이 끝난 뒤 실제로 닫음 (하트와 같음). 확인 창·메뉴는 각자 방식
const realClose = HTMLDialogElement.prototype.close, realShow = HTMLDialogElement.prototype.showModal;
const closeNow = d => { clearTimeout(d._closeT); d.classList.remove('closing'); realClose.call(d); };
HTMLDialogElement.prototype.close = function (rv) {
  if (this.classList.contains('closing')) return;
  if (!this.open || calm() || this.id === 'ask' || this.id === 'menu') return realClose.call(this, rv);
  this.classList.add('closing');
  this._closeT = setTimeout(() => { this.classList.remove('closing'); realClose.call(this, rv); }, parseFloat(getComputedStyle(this).animationDuration) * 1000 || 0);
};
// 닫히는 중에 다시 열면 바로 닫고 새로 엶. 입력이 있는 창(data-confirm)은 연 순간의 값을 기억
const formSnap = d => JSON.stringify([...d.querySelectorAll('input, textarea')].map(i => (i.type === 'checkbox' || i.type === 'radio' ? i.checked : i.value)));
HTMLDialogElement.prototype.showModal = function () {
  if (this.classList.contains('closing')) closeNow(this);
  realShow.call(this); if (this.hasAttribute('data-confirm')) this.dataset.snap = formSnap(this);
};
const dirty = d => d.hasAttribute('data-confirm') && d.dataset.snap !== formSnap(d);
// 끌기·바깥 탭·ESC로 닫을 때: 바꾼 내용이 있으면 먼저 물어봄
async function dismiss(d) {
  if (dirty(d) && !(await ask('저장하지 않고 닫을까요?', { ok: '닫기', danger: true }))) return;
  d.close();
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
  sleep: { title: '수면', desc: '잠든 시간 · 일어난 시간 · 잠의 질', soon: true }, // soon: 아직 화면이 없음 → 어디에도 안 보임
  meds: { title: '약 · 영양제', desc: '먹을 약과 영양제, 오늘 먹었는지 체크', soon: true },
  nail: { title: '네일', desc: '시술 날짜 · 샵 · 다음 관리일' },
  skin: { title: '피부 시술', desc: '피부과 · 관리 날짜와 다음 시술일' },
  hair: { title: '미용실', desc: '커트 · 염색 · 펌 날짜와 다음 방문일' },
};
// 관심 항목: 고른 섹션만 오늘 화면·메뉴에 보임. 고른 적 없으면(null) 전부
const INTERESTS = Object.keys(SECTIONS).filter(k => k !== 'home' && !SECTIONS[k].soon);
function shown() { const i = store.get('interests', null); return Array.isArray(i) ? INTERESTS.filter(k => i.includes(k)) : INTERESTS; }
let sec = 'home';
function setSection(k) {
  sec = shown().includes(k) ? k : 'home'; store.set('sec', sec);
  $('#appTitle').textContent = SECTIONS[sec].title;
  const care = !!CARE[sec];
  $('#v-home').hidden = sec !== 'home'; $('#v-cycle').hidden = sec !== 'cycle'; $('#v-care').hidden = !care;
  if (sec === 'home') renderHome(); else if (sec === 'cycle') renderCycle(); else renderCare();
  const v = $(care ? '#v-care' : '#v-' + sec); v.classList.remove('enter'); v.offsetWidth; v.classList.add('enter');
  window.scrollTo(0, 0);
}
// 오늘 화면: 맨 위 「지금 챙길 것」(가장 급한 것 2개 + 바로 하기) · 섹션 타일 2열 · 맨 아래 「항목 편집」
function urgent() {
  const out = [];
  for (const k of shown()) {
    if (k === 'cycle') {
      const s = Cycle.stats(periods()); if (!s.last) continue;
      if (s.inPeriod) out.push({ k, rank: -100, now: cycleNow(), act: '생리 끝났어요', go: 'cycEnd' });
      else if (s.daysToNext <= 3) out.push({ k, rank: s.daysToNext, now: cycleNow(), late: s.daysToNext < 0, act: '생리 시작했어요', go: 'cycStart' });
    } else if (CARE[k] && visits(k).length) {
      const s = careStats(k); if (s.left <= 3) out.push({ k, rank: s.left, now: careNow(k), late: s.left < 0, act: '다녀왔어요', go: 'care' });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 2);
}
// 타일용 짧은 상태 (한 줄)
function shortNow(k) {
  if (k === 'cycle') {
    const s = Cycle.stats(periods()); if (!s.last) return ['기록 없음'];
    if (s.inPeriod) return [`생리 ${s.inPeriod}일째`];
    return s.daysToNext > 0 ? [`생리 ${s.daysToNext}일 후`] : s.daysToNext === 0 ? ['오늘 생리 예정', 1] : [`예정일 ${-s.daysToNext}일 지남`, 1];
  }
  if (!visits(k).length) return ['기록 없음'];
  const s = careStats(k);
  return s.left > 0 ? [`관리 ${s.left}일 후`] : s.left === 0 ? ['오늘 관리 예정', 1] : [`예정일 ${-s.left}일 지남`, 1];
}
// 오늘 화면 달력: 관심 항목 전부를 한 장에. 생리는 막대, 관리는 섹션 색 점(다음 예상은 빈 점)
function homeMarks(ym) {
  const on = shown(), mk = on.includes('cycle') ? monthMarks(ym) : {}, care = on.filter(k => CARE[k]).map(k => [k, careMarks(k)]);
  return { mk, care };
}
function renderHomeCal() {
  if (!homeYM) homeYM = ymOf(Cycle.today());
  const { mk, care } = homeMarks(homeYM);
  $('#homeMonth').textContent = monthCal($('#homeCal'), homeYM, d => {
    const dots = care.filter(([, c]) => c.v[d] || c.next === d).map(([k, c]) => `<i class="dot s-${k}${c.v[d] ? '' : ' next'}"></i>`).join('');
    const label = [PER_NAME[mk[d]], ...care.filter(([, c]) => c.v[d]).map(([k]) => SECTIONS[k].title), ...care.filter(([, c]) => !c.v[d] && c.next === d).map(([k]) => SECTIONS[k].title + ' 예상')].filter(Boolean).join(', ');
    return { k: perFam(mk[d]), cls: mk[d], label, inner: dots ? `<span class="dots">${dots}</span>` : '' };
  });
  $('#homeLegend').innerHTML = [shown().includes('cycle') && '<span><i class="per"></i>생리</span><span><i class="pred"></i>예상 생리</span>',
    ...shown().filter(k => CARE[k]).map(k => `<span><i class="dot s-${k}"></i>${esc(SECTIONS[k].title)}</span>`)].filter(Boolean).join('') + (shown().some(k => CARE[k]) ? '<span><i class="dot next"></i>다음 관리 예상</span>' : '');
}
$('#homePrev').addEventListener('click', () => { homeYM = ymMove(homeYM, -1); renderHomeCal(); });
$('#homeNext').addEventListener('click', () => { homeYM = ymMove(homeYM, 1); renderHomeCal(); });
// 날짜를 누르면 그날 있었던 일 + 바로 기록하기
let hdKey = null;
$('#homeCal').addEventListener('click', e => {
  const d = e.target.closest('[data-d]')?.dataset.d; if (!d) return;
  const { mk, care } = homeMarks(ymOf(d)), t = Cycle.today(), dd = days()[d], rows = [];
  hdKey = d;
  if (mk[d]) rows.push(['cycle', PER_NAME[mk[d]] + (mk[d] === 'per' ? '' : ' (참고용)'), dd?.sym?.join(' · ') || '']);
  else if (dd) rows.push(['cycle', '그날 기록', dd.sym?.join(' · ') || dd.note || '']);
  care.forEach(([k, c]) => { (c.v[d] || []).forEach(x => rows.push([k, `${SECTIONS[k].title} · ${x.what || '다녀옴'}`, [x.place, +x.price ? won(+x.price) : ''].filter(Boolean).join(' · '), x.id])); if (!c.v[d] && c.next === d) rows.push([k, `${SECTIONS[k].title} 다음 관리 예상`, '참고용']); });
  $('#hdTitle').textContent = mdw(d);
  $('#hdList').innerHTML = rows.map(([k, a, b, id]) => `<li data-k="${k}" ${id ? `data-id="${esc(id)}"` : ''}><div><span>${esc(a)}</span>${b ? `<small>${esc(b)}</small>` : ''}</div><span class="chev" aria-hidden="true">›</span></li>`).join('') || '<li class="empty">이날은 기록이 없어요</li>';
  $('#hdAdd').innerHTML = d > t ? '' : shown().map(k => `<button type="button" class="chip-btn" data-k="${k}"><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg>${k === 'cycle' ? '주기 기록' : esc(SECTIONS[k].title) + ' 기록'}</button>`).join('');
  $('#hdAddLabel').hidden = d > t;
  $('#homeDay').showModal();
});
// 그날 목록·버튼 → 해당 섹션으로 가서 바로 그 기록을 열기
function hdGo(k, id) {
  closeNow($('#homeDay')); setSection(k);
  if (k === 'cycle') { calYM = ymOf(hdKey); renderCycle(); openDay(hdKey); }
  else { careYM = ymOf(hdKey); renderCareCal(); const x = visits(k).find(q => q.id === id); if (x) openCare(x); else if (hdKey <= Cycle.today()) openCare(null, hdKey); }
}
$('#hdList').addEventListener('click', e => { const li = e.target.closest('[data-k]'); if (li) hdGo(li.dataset.k, li.dataset.id); });
$('#hdAdd').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) hdGo(b.dataset.k); });
$('#hdClose').addEventListener('click', () => $('#homeDay').close());
function renderHome() {
  renderHomeCal();
  const d = new Date(), u = urgent();
  $('#dashDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  $('#homeNow').hidden = !u.length;
  $('#homeNowList').innerHTML = u.map(x => `<li><button type="button" class="now-go" data-sec="${x.k}"><svg class="i" aria-hidden="true"><use href="#i-s-${x.k}"/></svg><span><small>${esc(SECTIONS[x.k].title)}</small><b class="${x.late ? 'late' : ''}">${esc(x.now)}</b></span></button><button type="button" class="primary now-act" data-act="${x.go}" data-k="${x.k}">${x.act}</button></li>`).join('');
  $('#homeCards').innerHTML = shown().map(k => {
    const [now, late] = shortNow(k);
    return `<button type="button" class="card home-sec" data-sec="${k}"><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg><b>${esc(SECTIONS[k].title)}</b><small class="${late ? 'late' : ''}">${esc(now)}</small></button>`;
  }).join('');
}
$('#v-home').addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) { const { act, k } = a.dataset; if (act === 'care') { setSection(k); openCare(); } else markPeriod(act === 'cycEnd' ? 'end' : 'start', Cycle.today()); return; }
  const b = e.target.closest('[data-sec]'); if (b) setSection(b.dataset.sec);
});
$('#homeEdit').addEventListener('click', () => openInterests());

// 관심 항목 고르기 (가입 뒤 처음 한 번, 그 뒤엔 오늘 화면 「항목 편집」에서)
function openInterests() {
  const on = shown();
  $('#intList').innerHTML = INTERESTS.map(k => `<label class="set-row switch"><span class="set-grow">${esc(SECTIONS[k].title)}<small>${esc(SECTIONS[k].desc)}</small></span><input type="checkbox" value="${k}" ${on.includes(k) ? 'checked' : ''}><i aria-hidden="true"></i></label>`).join('');
  $('#intSheet').showModal();
}
$('#intSave').addEventListener('click', () => {
  const pick = [...document.querySelectorAll('#intList input:checked')].map(i => i.value);
  if (!pick.length) return toast('하나 이상 골라 주세요');
  store.set('interests', pick); $('#intSheet').close(); setSection(sec); toast('관심 항목을 저장했어요');
});
const askInterests = () => { if (store.get('interests', null) == null && !$('#intSheet').open) openInterests(); };

// ── 주기: 생리 기록 · 달력 · 예상 · PMS (계산은 cycle.js) ──
// 기록: cyclePeriods [{id, start, end}] · cycleDays {날짜: {flow, sym[], note}} · cycleSyms [직접 입력한 증상]
const SYMS = ['복통', '두통', '요통', '피로', '예민함', '우울', '식욕 증가', '붓기', '여드름', '가슴 통증'];
const periods = () => store.get('cyclePeriods', []), days = () => store.get('cycleDays', {});
const md = s => { const [, m, d] = s.split('-'); return `${+m}월 ${+d}일`; };
const mdw = s => `${md(s)} ${'일월화수목금토'[Cycle.weekday(s)]}요일`;
function cycleNow() {
  const s = Cycle.stats(periods());
  if (!s.last) return '생리 시작일을 기록해 보세요';
  if (s.inPeriod) return `생리 ${s.inPeriod}일째`;
  if (s.daysToNext > 0) return `다음 생리까지 ${s.daysToNext}일`;
  return s.daysToNext === 0 ? '오늘이 생리 예정일이에요' : `생리 예정일이 ${-s.daysToNext}일 지났어요`;
}
let calYM = null, careYM = null, homeYM = null; // 달력마다 보고 있는 [년, 월]
const ymOf = d => d.split('-').slice(0, 2).map(Number);
const ymMove = ([y, m], k) => (m + k < 1 ? [y - 1, 12] : m + k > 12 ? [y + 1, 1] : [y, m + k]);
// 달력 한 장 (주기·관리·오늘 화면이 같이 씀). cell(d) → {k: 이어 그릴 종류, cls, label, inner}
// 같은 종류(k)가 이어진 날은 막대처럼 붙여 그림(jl·jr). 주가 바뀌는 곳에선 끊음
function monthCal(el, [y, m], cell) {
  const t = Cycle.today(), first = `${y}-${String(m).padStart(2, '0')}-01`, n = Cycle.monthDays(y, m), c = {};
  for (let i = -1; i <= n; i++) { const d = Cycle.add(first, i); c[d] = cell(d) || {}; }
  el.innerHTML = '<span></span>'.repeat(Cycle.weekday(first)) + Array.from({ length: n }, (_, i) => {
    const d = Cycle.add(first, i), w = Cycle.weekday(d), { k, cls, label, inner } = c[d];
    const join = [k && w !== 0 && c[Cycle.add(d, -1)].k === k && 'jl', k && w !== 6 && c[Cycle.add(d, 1)].k === k && 'jr'];
    const all = [cls, ...join, d === t && 'today', w === 0 && 'sun', w === 6 && 'sat'].filter(Boolean).join(' ');
    return `<button type="button" data-d="${d}" class="${all}" aria-label="${md(d)}${d === t ? ' 오늘' : ''}${label ? ' ' + label : ''}"><span class="d">${i + 1}</span>${inner || ''}</button>`;
  }).join('');
  return `${y}년 ${m}월`;
}
const PER_NAME = { per: '생리', pred: '예상 생리', fert: '가임기', ovu: '배란 예상' };
const perFam = k => (k === 'ovu' ? 'fert' : k); // 배란 예상일도 가임기 막대에 이어서
function renderCycle() {
  const ps = periods(), dd = days(), t = Cycle.today(), s = Cycle.stats(ps, t);
  $('#cycNow').textContent = cycleNow();
  $('#cycGo span').textContent = s.inPeriod ? '생리 끝났어요' : '생리 시작했어요';
  $('#cycFacts').innerHTML = [s.next && ['다음 생리 예상', md(s.next)], s.next && ['배란 예상', md(s.ovulation)], ['평균 주기', s.cycle + '일'], ['평균 기간', s.len + '일']]
    .filter(Boolean).map(([k, v]) => `<li><small>${k}</small><b>${v}</b></li>`).join('');
  $('#cycFew').hidden = s.count >= 2 && !s.estimated;
  // 달력
  if (!calYM) calYM = ymOf(t);
  const mk = monthMarks(calYM);
  $('#cycMonth').textContent = monthCal($('#cycCal'), calYM, d => ({ k: perFam(mk[d]), cls: mk[d], label: [PER_NAME[mk[d]], dd[d] && '기록 있음'].filter(Boolean).join(' '), inner: dd[d] ? '<i class="mk"></i>' : '' }));
  // 지난 기록 (최근 것 위로)
  const asc = [...ps].sort((a, b) => (a.start < b.start ? -1 : 1));
  $('#cycList').innerHTML = asc.map((p, i) => {
    const nx = asc[i + 1], len = p.end ? Cycle.diff(p.start, p.end) + 1 : 0;
    const range = p.end ? `${md(p.start)} – ${md(p.end)}` : `${md(p.start)} –`;
    const sub = [p.end ? `${len}일` : Cycle.endOf(p, t) >= t ? '생리 중' : '끝난 날 기록 없음', nx && `주기 ${Cycle.diff(p.start, nx.start)}일`, p.start.slice(0, 4) !== t.slice(0, 4) && p.start.slice(0, 4) + '년'].filter(Boolean).join(' · ');
    return `<li data-id="${esc(p.id)}"><div><span>${range}</span><small>${sub}</small></div><span class="chev" aria-hidden="true">›</span></li>`;
  }).reverse().join('') || '<li class="empty">아직 기록이 없어요. 「생리 시작했어요」를 눌러 보세요</li>';
  renderTodaySym();
}
// 앞뒤 하루씩 넉넉히 (막대 잇기용)
const monthMarks = ([y, m]) => { const f = `${y}-${String(m).padStart(2, '0')}-01`; return Cycle.marks(periods(), Cycle.add(f, -1), Cycle.add(f, Cycle.monthDays(y, m))); };
$('#cycPrev').addEventListener('click', () => { calYM = ymMove(calYM, -1); renderCycle(); });
$('#cycNext').addEventListener('click', () => { calYM = ymMove(calYM, 1); renderCycle(); });

// 새 기록·고친 기록 확인 (틀리면 알림 후 false)
function periodOk(p, all = periods()) {
  const t = Cycle.today(), ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(p.start) || (p.end && !ok(p.end))) return toast('날짜를 골라 주세요'), false;
  if (p.start > t || (p.end && p.end > t)) return toast('앞으로의 날짜는 기록할 수 없어요'), false;
  if (p.end && p.end < p.start) return toast('끝난 날이 시작한 날보다 앞이에요'), false;
  if (p.end && Cycle.diff(p.start, p.end) >= Cycle.OPEN_MAX) return toast(`시작한 날부터 ${Cycle.OPEN_MAX}일 안의 날짜를 골라 주세요`), false;
  if (Cycle.overlaps(all, p, t)) return toast('이미 기록한 생리 기간과 겹쳐요'), false;
  return true;
}
const savePeriods = ps => store.set('cyclePeriods', ps);
// 생리 시작·끝: 상태에 따라 버튼 하나 (생리 중이면 「끝났어요」). 누르면 오늘로 바로 기록, 「다른 날」은 달력에서 고름
const periodState = () => (Cycle.stats(periods()).inPeriod ? 'end' : 'start');
function markPeriod(kind, d) {
  const before = periods(), last = [...before].sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  let p;
  if (kind === 'end') { if (!last) return toast('먼저 생리 시작을 기록해 주세요'); p = { ...last, end: d }; }
  else p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: d, end: null };
  if (!periodOk(p)) return;
  savePeriods(kind === 'end' ? before.map(q => (q.id === p.id ? p : q)) : [...before, p]);
  if (kind === 'start') calYM = ymOf(d);
  setSection(sec);
  toast(`${md(d)} 생리 ${kind === 'end' ? '끝' : '시작'}을 기록했어요`, 5000, () => { savePeriods(before); setSection(sec); });
}
$('#cycGo').addEventListener('click', () => markPeriod(periodState(), Cycle.today()));
$('#cycOther').addEventListener('click', () => { const i = $('#cycOtherDate'); i.value = Cycle.today(); openCal(i); });
$('#cycOtherDate').addEventListener('change', e => markPeriod(periodState(), e.target.value));
// 지난 기록 고치기·지우기
let editId = null;
$('#cycList').addEventListener('click', e => {
  const p = periods().find(q => q.id === e.target.closest('[data-id]')?.dataset.id); if (!p) return;
  editId = p.id; $('#perStart').value = p.start; $('#perEnd').value = p.end || ''; $('#perSheet').showModal();
});
$('#perCancel').addEventListener('click', () => $('#perSheet').close());
$('#perSave').addEventListener('click', () => {
  const p = { id: editId, start: $('#perStart').value, end: $('#perEnd').value || null };
  if (!periodOk(p)) return;
  savePeriods(periods().map(q => (q.id === editId ? p : q))); $('#perSheet').close(); renderCycle(); toast('고쳤어요');
});
// 지우기는 묻지 않고 바로, 대신 「되돌리기」 (하트와 같음)
$('#perDel').addEventListener('click', () => {
  const before = periods(); if (!before.some(q => q.id === editId)) return;
  savePeriods(before.filter(q => q.id !== editId)); closeNow($('#perSheet')); renderCycle();
  toast('지웠어요', 5000, () => { savePeriods(before); renderCycle(); });
});

// 날짜를 누르면 그날 기록: 생리 양(다시 누르면 선택 풀림) · PMS 증상(여러 개) · 메모. 누르는 즉시 저장
let dayKey = null, daySym = [];
const allSyms = (...more) => [...new Set([...SYMS, ...store.get('cycleSyms', []), ...more.flat()])];
const symChips = (list, on, extra = () => '') => list.map(x => `<button type="button" data-sym="${esc(x)}" aria-pressed="${on.includes(x)}">${esc(x)}${extra(x)}</button>`).join('')
  + '<button type="button" class="add" data-add="1"><span><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg> 직접 입력</span></button>';
function renderSyms(hit) {
  $('#daySym').innerHTML = symChips(allSyms(daySym), daySym);
  if (hit) bump($('#daySym').querySelector(`[data-sym="${CSS.escape(hit)}"]`));
}
function saveDay() {
  const all = days(), flow = $('#dayFlow input:checked')?.value || '', note = $('#dayNote').value.trim();
  if (flow || daySym.length || note) all[dayKey] = { flow, sym: daySym, note }; else delete all[dayKey];
  store.set('cycleDays', all); renderCycle();
}
function dayHead() {
  const d = dayKey, k = Cycle.marks(periods(), d, d)[d], p = perOf(d);
  $('#dayInfo').textContent = { per: '생리 기간', pred: '생리 예상일 (참고용)', fert: '가임기 예상 (참고용)', ovu: '배란 예상일 (참고용)' }[k] || '';
  $('#dayPer').checked = !!p; $('#dayPerRow').hidden = d > Cycle.today(); $('#dayPerDel').hidden = !p;
}
function openDay(d) {
  const r = days()[d] || {};
  dayKey = d; daySym = [...(r.sym || [])];
  $('#dayTitle').textContent = mdw(d); dayHead();
  $('#dayFlow').querySelectorAll('input').forEach(i => { i.checked = i.value === r.flow; });
  $('#dayNote').value = r.note || ''; renderSyms(); $('#daySheet').showModal();
}
$('#cycCal').addEventListener('click', e => { const d = e.target.closest('[data-d]')?.dataset.d; if (d) openDay(d); });
// 생리 기간: 날짜 하나씩 넣고 빼기. 앞뒤로 이어진 날이면 같은 생리로 늘림(사이 하루를 채우면 두 기록을 합침), 가운데를 빼면 둘로 나눔
const perOf = d => periods().find(p => p.start <= d && d <= Cycle.endOf(p, Cycle.today()));
function perToggle(d, on) {
  const t = Cycle.today(), before = periods(), end = p => Cycle.endOf(p, t), nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let ps = before.map(p => ({ ...p }));
  if (on) {
    if (perOf(d)) return;
    const prev = ps.find(p => Cycle.add(end(p), 1) === d), next = ps.find(p => Cycle.add(p.start, -1) === d);
    if (prev && next) { prev.end = next.end; ps = ps.filter(p => p !== next); }
    else if (prev) prev.end = d;
    else if (next) next.start = d;
    else ps.push({ id: nid(), start: d, end: d === t ? null : d }); // 오늘 시작이면 「생리 중」
    const changed = prev || next || ps.at(-1);
    if (!periodOk(changed, ps)) return false;
  } else {
    const p = ps.find(q => q.start <= d && d <= end(q)); if (!p) return;
    const e = end(p);
    if (p.start === d && e === d) ps = ps.filter(q => q !== p);
    else if (p.start === d) p.start = Cycle.add(d, 1);
    else if (e === d) p.end = Cycle.add(d, -1);
    else { ps.push({ id: nid(), start: Cycle.add(d, 1), end: p.end }); p.end = Cycle.add(d, -1); }
  }
  savePeriods(ps); renderCycle(); return true;
}
$('#dayPer').addEventListener('change', e => { if (perToggle(dayKey, e.target.checked) === false) e.target.checked = !e.target.checked; dayHead(); });
$('#dayPerDel').addEventListener('click', () => {
  const p = perOf(dayKey), before = periods(); if (!p) return;
  savePeriods(before.filter(q => q.id !== p.id)); closeNow($('#daySheet')); renderCycle();
  toast(`${md(p.start)}에 시작한 생리 기록을 지웠어요`, 5000, () => { savePeriods(before); renderCycle(); });
});
{ let was = false; // 고른 양을 다시 누르면 선택 풀기
  $('#dayFlow').addEventListener('pointerdown', e => { was = !!e.target.closest('label')?.querySelector('input')?.checked; });
  $('#dayFlow').addEventListener('click', e => { if (!e.target.matches('input')) return; if (was) { e.target.checked = false; was = false; } saveDay(); }); }
$('#daySym').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  let x = b.dataset.sym;
  if (b.dataset.add) { x = await addSym(); if (!x) return; if (!daySym.includes(x)) daySym.push(x); } else daySym = daySym.includes(x) ? daySym.filter(y => y !== x) : [...daySym, x];
  renderSyms(x); saveDay();
});
{ let t = 0; $('#dayNote').addEventListener('input', () => { clearTimeout(t); t = setTimeout(saveDay, 500); });
  $('#daySheet').addEventListener('close', () => { if (dayKey) { clearTimeout(t); saveDay(); } }); } // 닫을 때 남은 메모도 저장
$('#dayDone').addEventListener('click', () => $('#daySheet').close());
// 직접 입력한 증상은 목록에 남겨서 다른 날에도 고를 수 있게
async function addSym() {
  const v = (await ask('증상을 적어 주세요', { ok: '추가', input: '' }))?.trim().slice(0, 20); if (!v) return '';
  const mine = store.get('cycleSyms', []); if (!SYMS.includes(v) && !mine.includes(v)) store.set('cycleSyms', [...mine, v]);
  return v;
}
// 화면 아래 「오늘 증상」: 그날 기록 창과 같은 칩. 고른 증상에만 최근 7일 중 며칠
function renderTodaySym() {
  const dd = days(), t = Cycle.today(), on = dd[t]?.sym || [], week = Array.from({ length: 7 }, (_, i) => Cycle.add(t, i - 6));
  $('#cycSym').innerHTML = symChips(allSyms(on), on, x => (on.includes(x) ? `<small>최근 7일 중 ${week.filter(d => dd[d]?.sym?.includes(x)).length}일</small>` : ''));
}
function toggleTodaySym(x) {
  const all = days(), t = Cycle.today(), r = all[t] || { flow: '', sym: [], note: '' };
  r.sym = r.sym.includes(x) ? r.sym.filter(y => y !== x) : [...r.sym, x];
  if (r.flow || r.sym.length || r.note) all[t] = r; else delete all[t];
  store.set('cycleDays', all); renderCycle(); bump($('#cycSym').querySelector(`[data-sym="${CSS.escape(x)}"]`));
}
$('#cycSym').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.add) { const v = await addSym(); if (v && !days()[Cycle.today()]?.sym?.includes(v)) toggleTodaySym(v); } else toggleTodaySym(b.dataset.sym);
});

// ── 네일 · 피부 시술 · 미용실: 다녀온 날 기록과 다음 관리일 (세 섹션이 같은 화면을 씀) ──
// 기록: care_<섹션> [{id, date, what, place, price, note}] · careGap {섹션: 직접 정한 관리 주기(일)}
const CARE = {
  nail: { gap: 21, what: '젤네일, 케어, 패디', place: '네일샵' },
  skin: { gap: 28, what: '레이저, 보톡스, 관리', place: '피부과 · 에스테틱' },
  hair: { gap: 42, what: '커트, 염색, 펌', place: '미용실' },
};
const visits = k => [...store.get('care_' + k, [])].sort((a, b) => (a.date < b.date ? 1 : -1)); // 최근 것 먼저
function careStats(k) {
  const v = visits(k), t = Cycle.today(), gaps = v.slice(0, 6).map((x, i) => v[i + 1] && Cycle.diff(v[i + 1].date, x.date)).filter(g => g > 0);
  const avg = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0, mine = store.get('careGap', {})[k];
  const gap = mine || avg || CARE[k].gap, last = v[0]?.date, next = last && Cycle.add(last, gap);
  return { v, t, gap, mine: !!mine, avg, last, next, left: next ? Cycle.diff(t, next) : 0 };
}
function careNow(k) {
  const s = careStats(k);
  if (!s.last) return '다녀온 날을 기록해 보세요';
  return s.left > 0 ? `다음 관리까지 ${s.left}일` : s.left === 0 ? '오늘이 관리 예정일이에요' : `관리 예정일이 ${-s.left}일 지났어요`;
}
const won = n => n.toLocaleString('ko-KR') + '원';
// 관리 달력: 다녀온 날은 섹션 색으로 채우고, 다음 관리 예상일은 테두리
const careMarks = k => { const s = careStats(k), v = {}; s.v.forEach(x => { (v[x.date] ||= []).push(x); }); return { v, next: s.next }; };
function renderCareCal() {
  const { v, next } = careMarks(sec);
  if (!careYM) careYM = ymOf(Cycle.today());
  $('#careMonth').textContent = monthCal($('#careCal'), careYM, d => ({ k: v[d] && 'visit', cls: v[d] ? 'visit' : d === next ? 'nextv' : '', label: v[d] ? '다녀온 날' : d === next ? '다음 관리 예상' : '' }));
  $('#v-care').dataset.sec = sec;
}
$('#carePrev').addEventListener('click', () => { careYM = ymMove(careYM, -1); renderCareCal(); });
$('#careNext').addEventListener('click', () => { careYM = ymMove(careYM, 1); renderCareCal(); });
$('#careCal').addEventListener('click', e => {
  const d = e.target.closest('[data-d]')?.dataset.d; if (!d) return;
  const x = careMarks(sec).v[d]?.[0];
  if (x) openCare(x); else if (d > Cycle.today()) toast('앞으로의 날짜는 기록할 수 없어요'); else openCare(null, d);
});
function renderCare() {
  renderCareCal();
  const s = careStats(sec), y = s.t.slice(0, 4), spent = s.v.filter(x => x.date.startsWith(y)).reduce((a, x) => a + (+x.price || 0), 0);
  $('#careNow').textContent = careNow(sec);
  $('#careFacts').innerHTML = [s.last && ['마지막 관리', md(s.last), `${Cycle.diff(s.last, s.t)}일 전`], s.next && ['다음 관리 예상', md(s.next)],
    ['관리 주기', `${s.gap}일`, s.mine ? '직접 정함' : s.avg ? '기록 평균' : ''], spent && ['올해 쓴 금액', won(spent)]]
    .filter(Boolean).map(([k, v, sub]) => `<li><small>${k}</small><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</li>`).join('');
  $('#careList').innerHTML = s.v.map((x, i) => {
    const sub = [x.place, +x.price ? won(+x.price) : '', s.v[i + 1] && `${Cycle.diff(s.v[i + 1].date, x.date)}일 만에`, x.date.slice(0, 4) !== y && x.date.slice(0, 4) + '년'].filter(Boolean).join(' · ');
    return `<li data-id="${esc(x.id)}"><div><span>${md(x.date)} · ${esc(x.what || SECTIONS[sec].title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="chev" aria-hidden="true">›</span></li>`;
  }).join('') || '<li class="empty">아직 기록이 없어요. 「기록 추가」를 눌러 보세요</li>';
}
let careId = null;
// 금액: 입력하면서 쉼표(80,000), 숫자만. 저장은 숫자
const digits = v => String(v ?? '').replace(/\D/g, '').slice(0, 9);
const comma = v => (digits(v) ? (+digits(v)).toLocaleString('ko-KR') : '');
$('#carePrice').addEventListener('input', e => { e.target.value = comma(e.target.value); });
function openCare(x, date) {
  careId = x?.id || null; const c = CARE[sec];
  $('#careTitle').textContent = `${SECTIONS[sec].title} ${x ? '기록 고치기' : '기록 추가'}`;
  $('#careDate').value = x?.date || date || Cycle.today(); $('#carePrice').value = comma(x?.price || '');
  $('#careWhat').value = x?.what || ''; $('#careWhat').placeholder = c.what;
  $('#carePlace').value = x?.place || ''; $('#carePlace').placeholder = c.place;
  $('#careNote').value = x?.note || ''; $('#careDel').hidden = !x; $('#careSheet').showModal();
}
$('#careAdd').addEventListener('click', () => openCare());
$('#careList').addEventListener('click', e => { const x = visits(sec).find(q => q.id === e.target.closest('[data-id]')?.dataset.id); if (x) openCare(x); });
$('#careCancel').addEventListener('click', () => $('#careSheet').close());
$('#careSave').addEventListener('click', () => {
  const date = $('#careDate').value, price = digits($('#carePrice').value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('날짜를 골라 주세요');
  if (date > Cycle.today()) return toast('앞으로의 날짜는 기록할 수 없어요');
  const x = { id: careId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, what: $('#careWhat').value.trim().slice(0, 30),
    place: $('#carePlace').value.trim().slice(0, 30), price: +price || 0, note: $('#careNote').value.trim() };
  const all = store.get('care_' + sec, []);
  store.set('care_' + sec, careId ? all.map(q => (q.id === careId ? x : q)) : [...all, x]);
  $('#careSheet').close(); renderCare(); bump($(`#careList [data-id="${CSS.escape(x.id)}"]`)); toast(careId ? '고쳤어요' : `${md(date)} 기록을 저장했어요`);
});
$('#careDel').addEventListener('click', () => {
  const k = 'care_' + sec, before = store.get(k, []);
  store.set(k, before.filter(q => q.id !== careId)); closeNow($('#careSheet')); renderCare();
  toast('지웠어요', 5000, () => { store.set(k, before); renderCare(); });
});
// 관리 주기: 기록으로 계산 / 직접 정하기
const gapMine = () => $('#gapMode input:checked')?.value === 'mine';
function gapShow() { $('#gapDays').hidden = !gapMine(); if (gapMine()) $('#gapIn').focus(); }
$('#careGap').addEventListener('click', () => {
  const s = careStats(sec);
  $('#gapAuto').textContent = `기록으로 계산 (지금 ${s.avg || CARE[sec].gap}일)`;
  $(`#gapMode input[value=${s.mine ? 'mine' : 'auto'}]`).checked = true;
  $('#gapIn').value = s.mine ? s.gap : ''; $('#gapSheet').showModal(); $('#gapDays').hidden = !s.mine;
});
$('#gapMode').addEventListener('change', gapShow);
$('#gapCancel').addEventListener('click', () => $('#gapSheet').close());
$('#gapSave').addEventListener('click', () => {
  const g = store.get('careGap', {}), n = +digits($('#gapIn').value);
  if (gapMine()) { if (!(n >= 1 && n <= 365)) return toast('1에서 365 사이로 적어 주세요'); g[sec] = n; } else delete g[sec];
  store.set('careGap', g); $('#gapSheet').close(); renderCare();
});

// 날짜 칸 (하트와 같음): 숨긴 input 옆 한 줄 버튼(11월 25일 수요일)을 누르면 달력 시트. input이 값의 원천
const valDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const fmtDay = v => (v.slice(0, 4) === Cycle.today().slice(0, 4) ? '' : v.slice(0, 4) + '년 ') + mdw(v);
function dateField(input, empty) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dbtn'; btn.setAttribute('aria-label', input.closest('label')?.firstChild.textContent.trim() + ' 선택');
  const show = v => { btn.textContent = v ? fmtDay(v) : empty; btn.classList.toggle('empty', !v); };
  Object.defineProperty(input, 'value', { configurable: true, get() { return valDesc.get.call(this); }, set(v) { valDesc.set.call(this, v); show(valDesc.get.call(this)); } });
  input.classList.add('sr-only'); input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
  input.after(btn); btn.addEventListener('click', () => openCal(input)); show(valDesc.get.call(input));
}
let cpInput = null, cpY = 0, cpM = 0;
function cpRender() {
  $('#cpTitle').textContent = `${cpY}년 ${cpM}월`;
  const first = `${cpY}-${String(cpM).padStart(2, '0')}-01`, sel = cpInput ? valDesc.get.call(cpInput) : '', t = Cycle.today();
  $('#cpGrid').innerHTML = '<span></span>'.repeat(Cycle.weekday(first)) + Array.from({ length: Cycle.monthDays(cpY, cpM) }, (_, i) => {
    const d = Cycle.add(first, i), w = Cycle.weekday(d);
    return `<button type="button" data-d="${d}" class="${[d === t && 'today', d > t && 'future', w === 0 && 'sun', w === 6 && 'sat'].filter(Boolean).join(' ')}" aria-pressed="${d === sel}" aria-label="${md(d)}${d === t ? ' 오늘' : ''}" ${d > t ? 'disabled' : ''}><span class="d">${i + 1}</span></button>`;
  }).join('');
  $('#cpClear').hidden = !cpInput?.hasAttribute('data-blank');
}
function openCal(input) {
  cpInput = input; const v = valDesc.get.call(input) || Cycle.today();
  cpY = +v.slice(0, 4); cpM = +v.slice(5, 7); cpRender(); $('#calPick').showModal();
}
const cpMove = k => { cpM += k; if (cpM < 1) { cpM = 12; cpY--; } if (cpM > 12) { cpM = 1; cpY++; } cpRender(); };
$('#cpPrev').addEventListener('click', () => cpMove(-1));
$('#cpNext').addEventListener('click', () => cpMove(1));
const cpPick = d => { cpInput.value = d; $('#calPick').close(); cpInput.dispatchEvent(new Event('change', { bubbles: true })); };
$('#cpGrid').addEventListener('click', e => { const d = e.target.closest('[data-d]')?.dataset.d; if (d && cpInput) cpPick(d); });
$('#cpClear').addEventListener('click', () => cpPick(''));
dateField($('#careDate'), '날짜를 고르세요'); dateField($('#perStart'), '날짜를 고르세요'); dateField($('#perEnd'), '아직 생리 중');

// 사이드 메뉴: --p(열린 정도 0~1)로 하트와 같은 곡선으로 열고 닫음. 끄는 동안(pushing)엔 transition 없이 손가락을 따라감
const root = document.documentElement, MENU_MS = 420;
function menuP(p, dragging) {
  root.classList.toggle('pushing', !!dragging);
  root.style.setProperty('--mw', ($('#menu').offsetWidth || 300) + 'px');
  root.style.setProperty('--p', Math.min(1, Math.max(0, p)).toFixed(3));
}
function openMenu(dragging) {
  $('#menuList').innerHTML = ['home', ...shown()].map(k =>
    `<button type="button" data-sec="${k}" ${k === sec ? 'aria-current="page"' : ''}><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg>${esc(SECTIONS[k].title)}</button>`).join('');
  const u = Cloud.on && Cloud.user(); $('#menuSub').textContent = u?.email || ''; $('#menuSub').hidden = !u;
  menuP(0, true); root.classList.add('menu-open'); $('#menu').showModal();
  if (dragging === true) return;
  $('#menu').offsetWidth; requestAnimationFrame(() => menuP(1));
}
function closeMenu(then) {
  menuP(0); setTimeout(() => { $('#menu').close(); then?.(); }, MENU_MS);
}
$('#menu').addEventListener('close', () => root.classList.remove('menu-open', 'pushing'));
$('#menuBtn').addEventListener('click', () => openMenu());
$('#menu').addEventListener('click', e => {
  if (e.target === $('#menu')) return closeMenu(); // 바깥(어두운 곳)을 누르면 닫힘
  const k = e.target.closest('[data-sec]')?.dataset.sec; if (k) { setSection(k); closeMenu(); } // 닫히는 동안 화면은 이미 바뀜
});
$('#menu').addEventListener('cancel', e => { e.preventDefault(); closeMenu(); });
$('#menuSettings').addEventListener('click', () => closeMenu(openPrefs));
// 화면 어디서든 오른쪽으로 밀면 메뉴가 손가락을 따라 나오고, 열린 메뉴는 왼쪽으로 밀면 닫힘 (하트와 같음)
{
  const menu = $('#menu');
  const hScroll = el => { for (; el && el !== document.body; el = el.parentElement) if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true; return false; };
  let sw = null;
  document.addEventListener('touchstart', e => {
    sw = null;
    if (e.touches.length !== 1) return;
    const t = e.target, open = menu.open;
    if (!open && (document.querySelector('dialog[open]') || t.closest('input, textarea, select') || hScroll(t))) return;
    sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, open, on: false, p: open ? 1 : 0, v: 0, lx: e.touches[0].clientX, lt: Date.now() };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!sw) return;
    const x = e.touches[0].clientX, dx = x - sw.x, dy = e.touches[0].clientY - sw.y;
    if (!sw.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; } // 세로 스크롤이면 양보
      if (sw.open ? dx > -10 : dx < 10) return;
      sw.on = true; sw.x = x;
      if (!sw.open) { openMenu(true); document.activeElement?.blur(); }
      sw.w = menu.getBoundingClientRect().width || 300;
    }
    e.preventDefault();
    const now = Date.now();
    sw.v = (x - sw.lx) / Math.max(1, now - sw.lt); sw.lx = x; sw.lt = now;
    sw.p = Math.min(1, Math.max(0, (sw.open ? 1 : 0) + (x - sw.x) / sw.w));
    menuP(sw.p, true);
  }, { passive: false });
  const end = () => {
    if (!sw?.on) { sw = null; return; }
    const keep = Math.abs(sw.v) > 0.4 ? sw.v > 0 : sw.p > 0.5; // 빠르게 튕기면 방향대로
    sw = null; menuP(keep ? 1 : 0);
    if (!keep) setTimeout(() => { if (root.style.getPropertyValue('--p') === '0.000') closeNow(menu); }, MENU_MS);
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
}

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
function openPrefs() {
  const u = Cloud.on && Cloud.user(); $('#acctBox').hidden = !u;
  if (u) { $('#acctEmail').textContent = u.email; $('#acctSync').textContent = Cloud.dirty() ? '아직 올리지 못한 기록이 있어요' : '기록은 계정에 저장돼요'; }
  $('#lockOn').checked = !!store.get('lockId'); $('#appVer').textContent = '앱 버전 ' + APP_VERSION.replace('herday-', ''); $('#prefs').showModal(); }
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
// 「새로고침」 = 새 버전 확인 + 계정 기록 받아 오기 + 화면 다시 그리기
async function refresh() { checkVersion(); await pull(true); setSection(sec); toast(Cloud.dirty() ? '인터넷에 연결되면 기록을 올릴게요' : '새로 불러왔어요', 1500); }

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

// ── 로그인 · 클라우드 (cloud.js) ──
// 계정 기록을 받아 와서 화면을 다시 그림 (무언가 입력 중이면 화면은 그대로)
async function pull(quiet) {
  if (!Cloud.on || !Cloud.user()) return;
  try { if (await Cloud.sync() && !quiet && !document.querySelector('dialog[open]')) { setSection(sec); askInterests(); } }
  catch (e) { if (!Cloud.user()) showLogin(); }
}
let signUpMode = false;
const PW_MIN = 8;
// 새 비밀번호 정하기 (메일 링크로 왔을 때 · 설정에서). 취소하면 false
async function newPassword(msg) {
  for (;;) {
    const pw = await ask(msg, { ok: '바꾸기', input: '', type: 'password' }); if (pw == null) return false;
    if (pw.length < PW_MIN) { toast(`비밀번호를 ${PW_MIN}자 이상으로 해 주세요`); continue; }
    try { await Cloud.setPassword(pw); toast('비밀번호를 바꿨어요'); return true; } catch (e) { toast(e.message); }
  }
}
$('#loginForgot').addEventListener('click', async () => {
  const email = (await ask('가입한 이메일을 적어 주세요. 비밀번호를 새로 정하는 링크를 보내 드려요', { ok: '메일 보내기', input: $('#loginEmail').value.trim(), type: 'email' }))?.trim();
  if (!email) return;
  try { await Cloud.forgot(email); toast('메일을 보냈어요. 메일 속 링크를 이 기기에서 눌러 주세요', 6000); } catch (e) { toast(e.message); }
});
$('#pwChange').addEventListener('click', () => newPassword('새 비밀번호를 적어 주세요 (8자 이상)'));
function showLogin() {
  $('#loginPw').value = ''; if (!$('#login').open) $('#login').showModal();
}
$('#login').addEventListener('cancel', e => e.preventDefault());
$('#loginMode').addEventListener('click', () => {
  signUpMode = !signUpMode;
  $('#loginGo').textContent = signUpMode ? '가입하기' : '로그인';
  $('#loginTitle').textContent = signUpMode ? '가입하기' : 'her-day';
  $('#loginHint').textContent = signUpMode ? '비밀번호는 8자 이상' : '로그인하면 다른 기기에서도 기록을 볼 수 있어요';
  $('#loginMode').textContent = signUpMode ? '이미 계정이 있어요 · 로그인' : '처음이에요 · 가입하기';
  $('#loginPw').autocomplete = signUpMode ? 'new-password' : 'current-password';
  $('#loginPw').placeholder = signUpMode ? '비밀번호 (8자 이상)' : '비밀번호'; $('#loginForgot').hidden = signUpMode;
});
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim(), pw = $('#loginPw').value, go = $('#loginGo');
  if (signUpMode && pw.length < PW_MIN) return toast(`비밀번호를 ${PW_MIN}자 이상으로 해 주세요`);
  go.disabled = true;
  try {
    if (signUpMode && !(await Cloud.signUp(email, pw))) { toast('메일함에서 인증 링크를 누른 뒤 로그인해 주세요', 6000); $('#loginMode').click(); return; }
    if (!signUpMode) await Cloud.signIn(email, pw);
    await Cloud.sync(); $('#login').close(); setSection(sec); toast(signUpMode ? '가입했어요' : '로그인했어요'); askInterests();
  } catch (err) { toast(err.message); }
  finally { go.disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  let ok = true;
  if (Cloud.dirty()) ok = await Cloud.push().then(() => true, () => false);
  if (!(await ask(ok ? '로그아웃하면 이 기기에서는 기록이 지워져요. 계정에는 그대로 남아요.' : '아직 계정에 올리지 못한 기록이 있어요. 지금 로그아웃하면 그 기록은 사라져요.', { ok: '로그아웃', danger: true }))) return;
  await Cloud.signOut(); $('#prefs').close(); setSection('home'); showLogin();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });

// ── 시트: 손잡이·제목을 아래로 끌어 닫기, 바깥(어두운 곳) 탭, ESC (하트와 같음). 바꾼 내용이 있으면 먼저 물어봄 ──
document.querySelectorAll('dialog.sheet').forEach(d => {
  let y0 = null, dy = 0, dragging = false, t0 = 0;
  const reset = () => { d.style.transition = ''; d.style.transform = ''; d.style.animation = ''; };
  const begin = () => { dragging = true; d.style.animation = 'none'; d.style.transition = 'none'; };
  const move = y => { dy = Math.max(0, y - y0); d.style.transform = `translateY(${dy}px)`; };
  const finish = () => {
    if (!dragging) { y0 = null; return; }
    const fast = dy > 40 && dy / Math.max(1, Date.now() - t0) > 0.6, close = dy > 80 || fast; // 빠르게 튕기면 짧게 내려도 닫힘
    y0 = null; dragging = false; d.style.transition = 'transform .25s ease';
    if (close && !dirty(d)) { d.style.transform = 'translateY(100%)'; setTimeout(() => { closeNow(d); reset(); }, 230); }
    else { d.style.transform = ''; setTimeout(reset, 260); if (close) dismiss(d); }
  };
  const top = y => y - d.getBoundingClientRect().top < 96; // 손잡이·제목 영역
  d.addEventListener('touchstart', e => { y0 = e.touches.length === 1 && (top(e.touches[0].clientY) || d.scrollTop <= 0) ? e.touches[0].clientY : null; dy = 0; dragging = false; t0 = Date.now(); }, { passive: true });
  d.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const now = e.touches[0].clientY;
    if (!dragging) { if (now - y0 > 6 && d.scrollTop <= 0 && !e.target.closest('textarea')) begin(); else if (Math.abs(now - y0) > 6) { y0 = null; return; } else return; }
    e.preventDefault(); move(now);
  }, { passive: false });
  d.addEventListener('touchend', finish); d.addEventListener('touchcancel', finish);
  d.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || !top(e.clientY) || e.target.closest('button, input, select, textarea, a, label')) return;
    y0 = e.clientY; dy = 0; t0 = Date.now(); begin(); d.setPointerCapture(e.pointerId);
  });
  d.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && dragging) move(e.clientY); });
  d.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') finish(); });
  d.addEventListener('click', e => {
    const r = d.getBoundingClientRect();
    if (e.target === d && (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right)) dismiss(d);
  });
  d.addEventListener('cancel', e => { e.preventDefault(); dismiss(d); });
});

// ── 시작 ──
setSkin(skin());
setSection(store.get('sec', 'home'));
lockNow();
// 메일 링크(비밀번호 재설정)로 열렸으면 그 계정으로 로그인한 뒤 새 비밀번호를 물어봄
if (Cloud.on) Cloud.fromLink().catch(() => 'expired').then(async kind => {
  if (kind === 'expired') toast('링크가 만료됐어요. 「비밀번호를 잊었어요」를 다시 눌러 주세요', 6000);
  if (!Cloud.user()) return showLogin();
  await pull();
  if (kind === 'recovery') newPassword('새 비밀번호를 정해 주세요 (8자 이상)');
});
