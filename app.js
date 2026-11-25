// her-day: 여성을 위한 종합 뷰티 · 건강 기록 앱 (주기 · 수면 · 약과 영양제 · 네일 · 피부 시술 · 미용실)
// 화면 모양·동작은 하트(bab-works/bab-zip)와 같은 규칙을 따름 (AGENTS.md)
// 기록은 localStorage에 두고, 로그인하면 본인 계정(Supabase, cloud.js)에도 저장해 다른 기기에서 이어 씀. 남은 볼 수 없음 (supabase.sql의 RLS)
const $ = s => document.querySelector(s);
const APP_VERSION = 'herday-v8'; // sw.js의 CACHE와 같아야 함 (tests/version.js가 확인)
document.addEventListener('pointerdown', () => document.documentElement.classList.add('pointer-focus'), true);
document.addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey && !e.altKey) document.documentElement.classList.remove('pointer-focus'); }, true);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); Cloud.changed(k); return true; } catch { $('#storageError').hidden = false; return false; } },
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
  nail: { title: '네일', desc: '시술 날짜 · 샵 · 다음 관리일' },
  skin: { title: '피부 시술', desc: '피부과 · 관리 날짜와 다음 시술일' },
  hair: { title: '미용실', desc: '커트 · 염색 · 펌 날짜와 다음 방문일' },
};
// 관심 항목: 고른 섹션만 오늘 화면·메뉴에 보임. 고른 적 없으면(null) 전부
const INTERESTS = Object.keys(SECTIONS).filter(k => k !== 'home');
function shown() { const i = store.get('interests', null); return Array.isArray(i) ? INTERESTS.filter(k => i.includes(k)) : INTERESTS; }
let sec = 'home';
function setSection(k) {
  sec = shown().includes(k) ? k : 'home'; store.set('sec', sec);
  $('#appTitle').textContent = SECTIONS[sec].title;
  const care = !!CARE[sec], own = sec === 'home' || sec === 'cycle'; // 화면이 따로 있는 섹션
  $('#v-home').hidden = sec !== 'home'; $('#v-cycle').hidden = sec !== 'cycle'; $('#v-care').hidden = !care; $('#v-sec').hidden = own || care;
  if (sec === 'home') renderHome(); else if (sec === 'cycle') renderCycle(); else if (care) renderCare(); else { $('#secHead').textContent = SECTIONS[sec].title; $('#secDesc').textContent = SECTIONS[sec].desc; }
  const v = $(care ? '#v-care' : own ? '#v-' + sec : '#v-sec'); v.classList.remove('enter'); v.offsetWidth; v.classList.add('enter');
  window.scrollTo(0, 0);
}
function renderHome() {
  const d = new Date();
  $('#dashDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`;
  $('#homeCards').innerHTML = shown().map(k => {
    const s = SECTIONS[k], now = k === 'cycle' ? cycleNow() : CARE[k] && visits(k).length ? careNow(k) : '';
    return `<button type="button" class="card home-sec" data-sec="${k}"><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg><span><b>${esc(s.title)}</b>${now ? `<small class="now">${esc(now)}</small>` : `<small>${esc(s.desc)}</small>`}</span></button>`;
  }).join('') + '<button type="button" class="card home-sec home-add" data-add="1"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg><span><b>관심 항목 추가</b><small>보고 싶은 항목을 더 고를 수 있어요</small></span></button>';
}
$('#homeCards').addEventListener('click', e => { const b = e.target.closest('[data-sec], [data-add]'); if (b?.dataset.add) openInterests(); else if (b) setSection(b.dataset.sec); });

// 관심 항목 고르기 (가입 뒤 처음 한 번, 그 뒤엔 「관심 항목 추가」에서)
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
let calYM = null; // [년, 월]
function renderCycle() {
  const ps = periods(), dd = days(), t = Cycle.today(), s = Cycle.stats(ps, t);
  $('#cycNow').textContent = cycleNow();
  $('#cycFacts').innerHTML = [s.next && ['다음 생리 예상', md(s.next)], s.next && ['배란 예상', md(s.ovulation)], ['평균 주기', s.cycle + '일'], ['평균 기간', s.len + '일']]
    .filter(Boolean).map(([k, v]) => `<li><small>${k}</small><b>${v}</b></li>`).join('');
  $('#cycFew').hidden = s.count >= 2 && !s.estimated;
  // 달력
  if (!calYM) calYM = t.split('-').slice(0, 2).map(Number);
  const [y, m] = calYM, first = `${y}-${String(m).padStart(2, '0')}-01`, n = Cycle.monthDays(y, m), last = Cycle.add(first, n - 1);
  const mk = Cycle.marks(ps, first, last, t), name = { per: '생리', pred: '예상 생리', fert: '가임기', ovu: '배란 예상' };
  $('#cycMonth').textContent = `${y}년 ${m}월`;
  $('#cycCal').innerHTML = '<span></span>'.repeat(Cycle.weekday(first)) + Array.from({ length: n }, (_, i) => {
    const d = Cycle.add(first, i), w = Cycle.weekday(d), k = mk[d];
    const cls = [k, d === t && 'today', w === 0 && 'sun', w === 6 && 'sat'].filter(Boolean).join(' ');
    return `<button type="button" data-d="${d}" class="${cls}" aria-label="${md(d)}${k ? ' ' + name[k] : ''}${dd[d] ? ' 기록 있음' : ''}"><span class="d">${i + 1}</span>${dd[d] ? '<i class="mk"></i>' : ''}</button>`;
  }).join('');
  // 지난 기록 (최근 것 위로)
  const asc = [...ps].sort((a, b) => (a.start < b.start ? -1 : 1));
  $('#cycList').innerHTML = asc.map((p, i) => {
    const nx = asc[i + 1], len = p.end ? Cycle.diff(p.start, p.end) + 1 : 0;
    const range = p.end ? `${md(p.start)} – ${md(p.end)}` : `${md(p.start)} –`;
    const sub = [p.end ? `${len}일` : Cycle.endOf(p, t) >= t ? '생리 중' : '끝난 날 기록 없음', nx && `주기 ${Cycle.diff(p.start, nx.start)}일`, p.start.slice(0, 4) !== t.slice(0, 4) && p.start.slice(0, 4) + '년'].filter(Boolean).join(' · ');
    return `<li data-id="${esc(p.id)}"><div><span>${range}</span><small>${sub}</small></div><span class="chev" aria-hidden="true">›</span></li>`;
  }).reverse().join('') || '<li class="empty">아직 기록이 없어요. 「생리 시작」을 눌러 보세요</li>';
  renderTodaySym();
}
$('#cycPrev').addEventListener('click', () => { calYM = calYM[1] === 1 ? [calYM[0] - 1, 12] : [calYM[0], calYM[1] - 1]; renderCycle(); });
$('#cycNext').addEventListener('click', () => { calYM = calYM[1] === 12 ? [calYM[0] + 1, 1] : [calYM[0], calYM[1] + 1]; renderCycle(); });

// 새 기록·고친 기록 확인 (틀리면 알림 후 false)
function periodOk(p) {
  const t = Cycle.today(), ok = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!ok(p.start) || (p.end && !ok(p.end))) return toast('날짜를 골라 주세요'), false;
  if (p.start > t || (p.end && p.end > t)) return toast('앞으로의 날짜는 기록할 수 없어요'), false;
  if (p.end && p.end < p.start) return toast('끝난 날이 시작한 날보다 앞이에요'), false;
  if (p.end && Cycle.diff(p.start, p.end) >= Cycle.OPEN_MAX) return toast(`시작한 날부터 ${Cycle.OPEN_MAX}일 안의 날짜를 골라 주세요`), false;
  if (Cycle.overlaps(periods(), p, t)) return toast('이미 기록한 생리 기간과 겹쳐요'), false;
  return true;
}
const savePeriods = ps => store.set('cyclePeriods', ps);
$('#cycStart').addEventListener('click', async () => {
  const d = await ask('생리를 시작한 날을 골라 주세요', { ok: '기록하기', input: Cycle.today(), type: 'date' });
  if (!d) return;
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), start: d, end: null };
  if (!periodOk(p)) return;
  savePeriods([...periods(), p]); calYM = d.split('-').slice(0, 2).map(Number); renderCycle(); toast(`${md(d)} 생리 시작을 기록했어요`);
});
$('#cycEnd').addEventListener('click', async () => {
  const ps = periods(), p = [...ps].sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  if (!p) return toast('먼저 「생리 시작」을 기록해 주세요');
  const d = await ask(`${md(p.start)}에 시작한 생리가 끝난 날을 골라 주세요`, { ok: '기록하기', input: Cycle.today(), type: 'date' });
  if (!d || !periodOk({ ...p, end: d })) return;
  savePeriods(ps.map(q => (q.id === p.id ? { ...q, end: d } : q))); renderCycle(); toast(`${md(d)} 생리 끝을 기록했어요`);
});
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
$('#perDel').addEventListener('click', async () => {
  const p = periods().find(q => q.id === editId); if (!p) return;
  if (!(await ask(`${md(p.start)}에 시작한 생리 기록을 지울까요?`, { ok: '지우기', danger: true }))) return;
  savePeriods(periods().filter(q => q.id !== editId)); $('#perSheet').close(); renderCycle(); toast('지웠어요');
});

// 날짜를 누르면 그날 기록: 생리 양(다시 누르면 선택 풀림) · PMS 증상(여러 개) · 메모
let dayKey = null, daySym = [];
function renderSyms() {
  const all = [...new Set([...SYMS, ...store.get('cycleSyms', []), ...daySym])];
  $('#daySym').innerHTML = all.map(x => `<button type="button" data-sym="${esc(x)}" aria-pressed="${daySym.includes(x)}">${esc(x)}</button>`).join('')
    + '<button type="button" class="add" data-add="1"><span><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg> 직접 입력</span></button>';
}
$('#cycCal').addEventListener('click', e => {
  const d = e.target.closest('[data-d]')?.dataset.d; if (!d) return;
  const r = days()[d] || {}, k = Cycle.marks(periods(), d, d)[d];
  dayKey = d; daySym = [...(r.sym || [])];
  $('#dayTitle').textContent = mdw(d);
  $('#dayInfo').textContent = { per: '생리 기간', pred: '생리 예상일 (참고용)', fert: '가임기 예상 (참고용)', ovu: '배란 예상일 (참고용)' }[k] || '';
  $('#dayFlow').querySelectorAll('input').forEach(i => { i.checked = i.value === r.flow; });
  $('#dayNote').value = r.note || ''; renderSyms(); $('#daySheet').showModal();
});
{ let was = false; // 고른 양을 다시 누르면 선택 풀기
  $('#dayFlow').addEventListener('pointerdown', e => { was = !!e.target.closest('label')?.querySelector('input')?.checked; });
  $('#dayFlow').addEventListener('click', e => { if (e.target.matches('input') && was) { e.target.checked = false; was = false; } }); }
$('#daySym').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.add) { const v = await addSym(); if (!v) return; if (!daySym.includes(v)) daySym.push(v); } else { const x = b.dataset.sym; daySym = daySym.includes(x) ? daySym.filter(y => y !== x) : [...daySym, x]; }
  renderSyms();
});
// 직접 입력한 증상은 목록에 남겨서 다른 날에도 고를 수 있게
async function addSym() {
  const v = (await ask('증상을 적어 주세요', { ok: '추가', input: '' }))?.trim().slice(0, 20); if (!v) return '';
  const mine = store.get('cycleSyms', []); if (!SYMS.includes(v) && !mine.includes(v)) store.set('cycleSyms', [...mine, v]);
  return v;
}
// 화면 아래 「오늘 증상」: 하트 습관처럼 한 줄씩 동그라미를 눌러 오늘 기록, 최근 7일 점
function renderTodaySym() {
  const dd = days(), t = Cycle.today(), on = dd[t]?.sym || [], week = Array.from({ length: 7 }, (_, i) => Cycle.add(t, i - 6));
  $('#cycSym').innerHTML = [...new Set([...SYMS, ...store.get('cycleSyms', []), ...on])].map(x => {
    const n = week.filter(d => dd[d]?.sym?.includes(x)).length, done = on.includes(x);
    return `<li class="card${done ? ' done' : ''}" data-sym="${esc(x)}" style="--c:var(--accent)"><span class="hic" aria-hidden="true"><svg class="i"><use href="#i-pulse"/></svg></span>
      <div><span>${esc(x)}</span><small>${n ? `최근 7일 중 ${n}일` : '최근 7일 없음'}</small><small class="hdots" aria-hidden="true">${week.map(d => `<i class="${dd[d]?.sym?.includes(x) ? 'on' : ''}"></i>`).join('')}</small></div>
      <button type="button" class="hcheck" data-sym="${esc(x)}" aria-pressed="${done}" aria-label="오늘 ${esc(x)}"><svg class="i" aria-hidden="true"><use href="#i-check"/></svg></button></li>`;
  }).join('');
}
function toggleTodaySym(x) {
  const all = days(), t = Cycle.today(), r = all[t] || { flow: '', sym: [], note: '' };
  r.sym = r.sym.includes(x) ? r.sym.filter(y => y !== x) : [...r.sym, x];
  if (r.flow || r.sym.length || r.note) all[t] = r; else delete all[t];
  store.set('cycleDays', all); renderCycle();
}
$('#cycSym').addEventListener('click', e => { const x = e.target.closest('[data-sym]')?.dataset.sym; if (x != null) toggleTodaySym(x); });
$('#cycSymAdd').addEventListener('click', async () => { const v = await addSym(); if (v && !days()[Cycle.today()]?.sym?.includes(v)) toggleTodaySym(v); });
$('#dayClose').addEventListener('click', () => $('#daySheet').close());
$('#daySave').addEventListener('click', () => {
  const all = days(), flow = $('#dayFlow input:checked')?.value || '', note = $('#dayNote').value.trim();
  if (flow || daySym.length || note) all[dayKey] = { flow, sym: daySym, note }; else delete all[dayKey];
  store.set('cycleDays', all); $('#daySheet').close(); renderCycle(); toast(`${md(dayKey)} 기록을 저장했어요`);
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
function renderCare() {
  const s = careStats(sec), y = s.t.slice(0, 4), spent = s.v.filter(x => x.date.startsWith(y)).reduce((a, x) => a + (+x.price || 0), 0);
  $('#careNow').textContent = careNow(sec);
  $('#careFacts').innerHTML = [s.last && ['마지막 관리', `${md(s.last)} · ${Cycle.diff(s.last, s.t)}일 전`], s.next && ['다음 관리 예상', md(s.next)],
    ['관리 주기', `${s.gap}일${s.mine ? '' : s.avg ? ' (평균)' : ''}`], spent && ['올해 쓴 금액', won(spent)]]
    .filter(Boolean).map(([k, v]) => `<li><small>${k}</small><b>${v}</b></li>`).join('');
  $('#careList').innerHTML = s.v.map((x, i) => {
    const sub = [x.place, +x.price ? won(+x.price) : '', s.v[i + 1] && `${Cycle.diff(s.v[i + 1].date, x.date)}일 만에`, x.date.slice(0, 4) !== y && x.date.slice(0, 4) + '년'].filter(Boolean).join(' · ');
    return `<li data-id="${esc(x.id)}"><div><span>${md(x.date)} · ${esc(x.what || SECTIONS[sec].title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div><span class="chev" aria-hidden="true">›</span></li>`;
  }).join('') || '<li class="empty">아직 기록이 없어요. 「기록 추가」를 눌러 보세요</li>';
}
let careId = null;
function openCare(x) {
  careId = x?.id || null; const c = CARE[sec];
  $('#careTitle').textContent = `${SECTIONS[sec].title} ${x ? '기록 고치기' : '기록 추가'}`;
  $('#careDate').value = x?.date || Cycle.today(); $('#carePrice').value = x?.price || '';
  $('#careWhat').value = x?.what || ''; $('#careWhat').placeholder = c.what;
  $('#carePlace').value = x?.place || ''; $('#carePlace').placeholder = c.place;
  $('#careNote').value = x?.note || ''; $('#careDel').hidden = !x; $('#careSheet').showModal();
}
$('#careAdd').addEventListener('click', () => openCare());
$('#careList').addEventListener('click', e => { const x = visits(sec).find(q => q.id === e.target.closest('[data-id]')?.dataset.id); if (x) openCare(x); });
$('#careCancel').addEventListener('click', () => $('#careSheet').close());
$('#careSave').addEventListener('click', () => {
  const date = $('#careDate').value, price = $('#carePrice').value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast('날짜를 골라 주세요');
  if (date > Cycle.today()) return toast('앞으로의 날짜는 기록할 수 없어요');
  if (price && !(+price >= 0)) return toast('금액은 숫자로 적어 주세요');
  const x = { id: careId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date, what: $('#careWhat').value.trim().slice(0, 30),
    place: $('#carePlace').value.trim().slice(0, 30), price: price ? Math.round(+price) : 0, note: $('#careNote').value.trim() };
  const all = store.get('care_' + sec, []);
  store.set('care_' + sec, careId ? all.map(q => (q.id === careId ? x : q)) : [...all, x]);
  $('#careSheet').close(); renderCare(); toast(careId ? '고쳤어요' : `${md(date)} 기록을 저장했어요`);
});
$('#careDel').addEventListener('click', async () => {
  if (!(await ask('이 기록을 지울까요?', { ok: '지우기', danger: true }))) return;
  store.set('care_' + sec, store.get('care_' + sec, []).filter(q => q.id !== careId)); $('#careSheet').close(); renderCare(); toast('지웠어요');
});
$('#careGap').addEventListener('click', async () => {
  const s = careStats(sec), v = await ask('며칠마다 관리하세요? 비워 두면 기록으로 계산해요', { ok: '저장', input: s.mine ? String(s.gap) : '', type: 'number' });
  if (v == null) return;
  const n = Math.round(+v), g = store.get('careGap', {});
  if (v.trim() && !(n >= 1 && n <= 365)) return toast('1에서 365 사이로 적어 주세요');
  if (v.trim()) g[sec] = n; else delete g[sec];
  store.set('careGap', g); renderCare();
});

// 사이드 메뉴: --p(열린 정도 0~1)로 하트와 같은 곡선으로 열고 닫음
const root = document.documentElement, menuP = p => root.style.setProperty('--p', p);
function openMenu() {
  $('#menuList').innerHTML = ['home', ...shown()].map(k =>
    `<button type="button" data-sec="${k}" ${k === sec ? 'aria-current="page"' : ''}><svg class="i" aria-hidden="true"><use href="#i-s-${k}"/></svg>${esc(SECTIONS[k].title)}</button>`).join('');
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
function openPrefs() {
  const u = Cloud.on && Cloud.user(); $('#acctBox').hidden = !u;
  if (u) { $('#acctEmail').textContent = u.email; $('#acctSync').textContent = Cloud.dirty() ? '아직 올리지 못한 기록이 있어요' : '기록은 계정에 저장돼요'; }
  $('#lockOn').checked = !!store.get('lockId'); $('#appVer').textContent = '앱 버전 ' + APP_VERSION.replace('herday-', ''); $('#prefs').showModal(); }
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
// 「새로고침」 = 새 버전 확인 + 계정 기록 받아 오기 + 화면 다시 그리기
async function refresh() { checkVersion(); await pull(true); setSection(sec); toast(Cloud.dirty() ? '인터넷에 연결되면 기록을 올릴게요' : '새로 불러왔어요', 1500); }
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
