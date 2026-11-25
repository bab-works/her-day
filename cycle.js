// 주기 계산만 모아 둔 곳 (화면 코드와 따로 둬서 tests/cycle.js가 node로 바로 확인)
// 날짜는 'YYYY-MM-DD' 글자로 저장하고, 계산은 UTC 날 수로 해서 시간대·서머타임에 흔들리지 않음
const Cycle = (() => {
  const DAY = 864e5, DEF_CYCLE = 28, DEF_LEN = 5, OPEN_MAX = 14;
  const num = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
  const str = n => new Date(n * DAY).toISOString().slice(0, 10);
  const add = (s, k) => str(num(s) + k);
  const diff = (a, b) => num(b) - num(a);
  const today = (d = new Date()) => str(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const weekday = s => new Date(num(s) * DAY).getUTCDay();
  const monthDays = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
  const sorted = ps => [...ps].sort((a, b) => (a.start < b.start ? -1 : 1));
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  // 「생리 끝」을 안 누른 기록은 오늘까지(최대 14일)로 봄
  const endOf = (p, t) => p.end || str(Math.min(num(t), num(p.start) + OPEN_MAX - 1));

  // 최근 6번의 주기·기간 평균. 15일 미만·60일 초과 간격은 빠뜨린 기록으로 보고 평균에서 뺌
  function stats(periods, t = today()) {
    const ps = sorted(periods).filter(p => p.start <= t);
    const gaps = ps.slice(1).map((p, i) => diff(ps[i].start, p.start)).filter(g => g >= 15 && g <= 60).slice(-6);
    const lens = ps.filter(p => p.end).map(p => diff(p.start, p.end) + 1).slice(-6);
    const s = { cycle: gaps.length ? avg(gaps) : DEF_CYCLE, len: lens.length ? avg(lens) : DEF_LEN, count: ps.length, estimated: !gaps.length };
    const last = ps.at(-1);
    if (!last) return s;
    s.last = last; s.next = add(last.start, s.cycle); s.ovulation = add(s.next, -14);
    s.inPeriod = t <= endOf(last, t) ? diff(last.start, t) + 1 : 0; // 생리 ○일째 (아니면 0)
    s.daysToNext = diff(t, s.next); // 음수면 예정일이 지남
    return s;
  }

  // from~to 사이 날짜별 표시: per(생리) > ovu(배란 예상) > fert(가임기) > pred(예상 생리)
  // 가임기 = 배란 예상일 5일 전 ~ 1일 뒤. 예상 생리는 오늘 이후만 표시
  function marks(periods, from, to, t = today()) {
    const m = {}, s = stats(periods, t);
    const put = (a, b, k) => { for (let n = Math.max(num(a), num(from)); n <= Math.min(num(b), num(to)); n++) m[str(n)] ??= k; };
    for (const p of periods) put(p.start, endOf(p, t), 'per');
    if (s.next) for (let st = s.next; add(st, -19) <= to; st = add(st, s.cycle)) {
      const ov = add(st, -14);
      if (ov > s.last.start) { put(ov, ov, 'ovu'); put(add(ov, -5), add(ov, 1), 'fert'); }
      put(st > t ? st : t, add(st, s.len - 1), 'pred');
    }
    return m;
  }

  // 기간이 다른 기록과 겹치는지 (고치는 중인 기록 자신은 빼고)
  const overlaps = (periods, p, t = today()) => periods.some(q => q.id !== p.id && p.start <= endOf(q, t) && q.start <= endOf(p, t));

  return { num, str, add, diff, today, weekday, monthDays, endOf, stats, marks, overlaps, DEF_CYCLE, OPEN_MAX };
})();
if (typeof module !== 'undefined') module.exports = Cycle;
