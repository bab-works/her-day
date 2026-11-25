// 주기 계산 확인 (가짜 날짜만): 날짜 넘김·윤년·월말, 평균 주기·기간, 다음 생리·배란 예상, 달력 표시
const C = require('../cycle.js'), assert = require('assert');
const P = (start, end = null, id = start) => ({ id, start, end });

// 날짜 더하기: 월말·연말·윤년
assert.equal(C.add('2026-01-31', 1), '2026-02-01');
assert.equal(C.add('2026-12-31', 1), '2027-01-01');
assert.equal(C.add('2028-02-28', 1), '2028-02-29'); // 윤년
assert.equal(C.add('2027-02-28', 1), '2027-03-01'); // 평년
assert.equal(C.add('2100-02-28', 1), '2100-03-01'); // 100으로 나뉘는 해는 평년
assert.equal(C.add('2000-02-28', 1), '2000-02-29'); // 400으로 나뉘면 윤년
assert.equal(C.add('2026-03-01', -1), '2026-02-28');
assert.equal(C.diff('2028-02-01', '2028-03-01'), 29);
assert.equal(C.diff('2026-02-01', '2026-03-01'), 28);
assert.equal(C.diff('2026-03-28', '2026-03-30'), 2); // 서머타임 바뀌는 주에도 하루는 하루
assert.equal(C.monthDays(2028, 2), 29); assert.equal(C.monthDays(2026, 2), 28); assert.equal(C.monthDays(2026, 4), 30); assert.equal(C.monthDays(2026, 12), 31);
assert.equal(C.weekday('2026-11-25'), 3); // 수요일
assert.equal(C.today(new Date(2026, 0, 31, 23, 59)), '2026-01-31'); // 밤 늦게도 그날

// 기록 없음 / 1번: 평균 28일로 계산하고 「추정」 표시
let s = C.stats([], '2026-11-25');
assert.equal(s.cycle, 28); assert.equal(s.estimated, true); assert.equal(s.next, undefined);
s = C.stats([P('2026-11-20', '2026-11-24')], '2026-11-25');
assert.equal(s.cycle, 28); assert.equal(s.estimated, true); assert.equal(s.len, 5);
assert.equal(s.next, '2026-12-18'); assert.equal(s.ovulation, '2026-12-04'); assert.equal(s.daysToNext, 23); assert.equal(s.inPeriod, 0);

// 여러 번: 평균 주기(반올림)·평균 기간, 순서가 섞여 있어도
const ps = [P('2026-10-03', '2026-10-07'), P('2026-08-08', '2026-08-13'), P('2026-09-05', '2026-09-09'), P('2026-10-31', '2026-11-04')];
s = C.stats(ps, '2026-11-10');
assert.equal(s.cycle, 28); // 28, 28, 28
assert.equal(s.len, 5); // 6,5,5,5 → 5.25 → 5
assert.equal(s.estimated, false); assert.equal(s.count, 4);
assert.equal(s.next, '2026-11-28'); assert.equal(s.ovulation, '2026-11-14'); assert.equal(s.daysToNext, 18);
s = C.stats([P('2026-01-01', '2026-01-05'), P('2026-01-31', '2026-02-04'), P('2026-03-02', '2026-03-06')], '2026-03-10');
assert.equal(s.cycle, 30); assert.equal(s.next, '2026-04-01'); // 월말 넘김

// 윤년 2월을 지나는 예상
s = C.stats([P('2028-01-20', '2028-01-24'), P('2028-02-17', '2028-02-21')], '2028-02-25');
assert.equal(s.cycle, 28); assert.equal(s.next, '2028-03-16'); assert.equal(s.ovulation, '2028-03-02');
// 연말을 지나는 예상
s = C.stats([P('2026-12-20', '2026-12-24')], '2026-12-25');
assert.equal(s.next, '2027-01-17');

// 빠뜨린 기록(60일 넘는 간격)은 평균에서 뺌
s = C.stats([P('2026-01-01'), P('2026-01-29'), P('2026-05-01'), P('2026-05-31')], '2026-06-10');
assert.equal(s.cycle, 29); // 28과 30만

// 생리 중: ○일째, 끝을 안 눌러도 14일까지만
s = C.stats([P('2026-10-31', '2026-11-04'), P('2026-11-23')], '2026-11-25');
assert.equal(s.inPeriod, 3);
s = C.stats([P('2026-11-01')], '2026-11-14'); assert.equal(s.inPeriod, 14);
s = C.stats([P('2026-11-01')], '2026-11-15'); assert.equal(s.inPeriod, 0);
// 끝난 날 당일까지 생리 중
s = C.stats([P('2026-11-20', '2026-11-24')], '2026-11-24'); assert.equal(s.inPeriod, 5);
// 예정일이 지나면 음수
s = C.stats([P('2026-10-01', '2026-10-05')], '2026-11-01'); assert.equal(s.daysToNext, -3);

// 달력 표시
let m = C.marks([P('2026-10-31', '2026-11-04')], '2026-11-01', '2026-12-31', '2026-11-10');
assert.equal(m['2026-10-31'], undefined); // 범위 밖은 없음
assert.equal(m['2026-11-01'], 'per'); assert.equal(m['2026-11-04'], 'per'); assert.equal(m['2026-11-05'], undefined);
assert.equal(m['2026-11-14'], 'ovu'); // 28일 주기: 다음 11-28, 배란 11-14
assert.equal(m['2026-11-09'], 'fert'); assert.equal(m['2026-11-15'], 'fert'); assert.equal(m['2026-11-16'], undefined);
assert.equal(m['2026-11-28'], 'pred'); assert.equal(m['2026-12-02'], 'pred'); assert.equal(m['2026-12-03'], undefined);
assert.equal(m['2026-12-12'], 'ovu'); assert.equal(m['2026-12-26'], 'pred'); // 그다음 주기도
// 생리 중(끝 안 누름)은 오늘까지만 칠함
m = C.marks([P('2026-11-23')], '2026-11-01', '2026-11-30', '2026-11-25');
assert.equal(m['2026-11-25'], 'per'); assert.equal(m['2026-11-26'], undefined);
// 예정일이 지났으면 지난 날은 예상 생리로 칠하지 않음
m = C.marks([P('2026-10-01', '2026-10-05')], '2026-10-01', '2026-11-30', '2026-10-30');
assert.equal(m['2026-10-29'], undefined); assert.equal(m['2026-10-30'], 'pred'); assert.equal(m['2026-11-02'], 'pred');

// 겹침 확인
const list = [P('2026-11-01', '2026-11-05', 'a')];
assert.equal(C.overlaps(list, P('2026-11-05', null, 'b'), '2026-11-25'), true);
assert.equal(C.overlaps(list, P('2026-11-06', null, 'b'), '2026-11-25'), false);
assert.equal(C.overlaps(list, P('2026-10-28', '2026-11-01', 'b'), '2026-11-25'), true);
assert.equal(C.overlaps(list, P('2026-11-02', '2026-11-04', 'a'), '2026-11-25'), false); // 자기 자신은 빼고

console.log('CYCLE OK');
