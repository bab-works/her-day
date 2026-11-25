# AGENTS.md — her-day 작업 안내

AI 코딩 도우미(Codex, Claude 등)가 이 저장소를 고칠 때 먼저 읽는 문서. 사용자와는 **한국어**로, 쉬운 말로 이야기한다.

## 1. 이 앱은

- **her-day** — 여성 중심의 개인 관리 웹 앱(PWA). 휴대폰 홈 화면에 설치해 쓴다.
- 섹션: 오늘(home) · 주기(cycle: 생리·배란일·PMS) · 수면(sleep) · 약·영양제(meds) · 네일(nail).
- 주소: https://bab-works.github.io/her-day/ (GitHub Pages, `main`이 그대로 배포됨)
- 형제 앱 **하트**(bab-works/bab-zip)에서 화면 뼈대와 디자인을 그대로 가져왔다. 두 앱은 코드·데이터를 공유하지 않는다.

## 2. 가장 중요한 규칙: 건강 기록은 본인만

- 기록(주기·증상·수면·약·네일 등)은 기기의 localStorage에 두고, 로그인하면 **본인 계정(Supabase)**에도 저장해 다른 기기에서 이어 쓴다(2026-11 사용자 결정으로 「기기에만」 규칙을 바꿈).
- 밖으로 나가는 요청은 **이 Supabase 서버로만**(`cloud.js`). 구글 시트·분석 도구·다른 외부 API로 보내지 않는다. `tests/cloud.js`가 확인한다.
- 서버의 `herday` 표는 RLS로 **로그인한 본인 줄만** 읽고 쓴다(`supabase.sql`). 표·규칙을 바꿀 땐 이 파일을 고치고 사용자에게 SQL Editor에서 다시 실행해 달라고 한다. 앱에는 공개 키(anon/publishable)만 넣는다. `service_role`·secret 키는 절대 저장소에 넣지 않는다.
- 로그아웃하면 기기의 기록을 지운다(다음 사람과 섞이지 않게). 로그인 전 기기에 있던 기록(주인 없음)만 처음 로그인한 계정으로 합친다.
- 친구 공유·태그·공개 같은 기능을 넣지 않는다. 다른 사람이 볼 수 있는 경로를 만들지 않는다.
- 저장소는 **공개**다. 실제 기록·개인정보를 코드·테스트·커밋 메시지에 넣지 않는다. 테스트는 가짜 데이터·가짜 서버만.
- 주기·배란일 예측은 참고용이라고 화면에 분명히 쓴다(의학적 판단이나 피임 수단이 아님).

## 3. 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 HTML + CSS(하트의 테마 5종·카드·입력칸·시트·메뉴 스타일 그대로) + SVG 아이콘(`<symbol id="i-…">`) |
| `app.js` | 앱 코드 전부(빌드 없음). `$()` = querySelector, `store` = localStorage, `ask()`, `toast()`, `setSection()`, 테마, Face ID 잠금, 당겨서 새로고침, 새 버전 확인 |
| `cloud.js` | 가입·로그인·비밀번호 찾기(Supabase Auth, 메일 링크는 앱 주소 # 뒤 토큰으로 돌아옴)와 기록 올리기·받기. 주소·공개 키는 맨 위 `SUPA_URL`·`SUPA_KEY`. 테스트는 `window.__cloud`로 가짜 서버를 씀 |
| `supabase.sql` | 서버 표와 「본인만」 규칙(RLS). Supabase SQL Editor에서 한 번 실행 |
| `sw.js` | 서비스 워커(오프라인 캐시) |
| `manifest.webmanifest`, `icon-*.png` | 홈 화면 설치 정보와 아이콘 |
| `tests/` | Playwright 테스트 (`bash tests/run.sh`) |

## 4. 고친 뒤 순서 (매번)

1. **버전 올리기**: `app.js`의 `APP_VERSION`과 `sw.js`의 `CACHE`를 같은 값으로 하나 올린다(`herday-vN`). `tests/version.js`가 확인한다.
2. **테스트**: `bash tests/run.sh` (전부 `… OK`). 새 기능은 `tests/`에 테스트를 더하고 `run.sh` 목록에 넣는다.
   - Playwright·크로미움 필요: `npm i -g playwright && npx playwright install chromium` (이미 있으면 생략)
   - `ask()`는 테스트에서 `window.__askAuto = (msg, isInput) => …`로 자동 응답한다.
3. **커밋하고 `main`에 푸시.** 사용자는 직접 커밋하지 않는다.

## 5. 디자인 규칙 (하트와 같게)

- 테마: `html[data-skin]`(main·clay·ios·cuberto·linear). 색은 CSS 변수(`--bg --glass --fg --muted --line --fill --accent --accent-soft --shadow`)만 쓴다. 새 화면도 이 변수로 만들어 모든 테마에서 어울리게.
- 카드 `.card`, 입력칸(둥근 12px·`--fill` 배경), 아래에서 올라오는 창 `dialog.sheet`, 설정 줄 `.set-row`처럼 **이미 있는 모양을 재사용**한다. 새 모양을 만들기 전에 하트에 비슷한 게 있는지 본다.
- 아이콘은 이모지 대신 SVG `<symbol>`(`<svg class="i"><use href="#i-…"/></svg>`), 하트와 같은 선 굵기(24 viewBox).
- 대화창은 브라우저 기본 alert/confirm 대신 `ask(msg, {ok, danger, input})`와 `toast(글)`.
- 화면은 폭 390px 기준. 글이 좁게 꺾이지 않게 `word-break:keep-all`.
- 「밤티」(촌스러움)를 싫어한다. 장식용 이모지·느낌표를 줄이고, 모든 테마에서 깨지지 않는지 스크린샷으로 확인한다.

### 하트에서 이미 겪은 함정
- CSS 클래스 이름 `.enter`는 모든 화면이 열릴 때 붙는 애니메이션이다. 다른 용도로 같은 이름을 쓰면 화면이 커졌다 작아진다.
- 클레이 테마는 `button`에 그림자를 강하게 준다. 카드처럼 쓰는 버튼은 `html[data-skin] .클래스 { box-shadow:… !important }`로 막는다.
- 두 줄짜리 스위치 줄은 알약 모양(border-radius:99px)으로 두면 찌그러진다. 입력칸과 같은 12px 모서리·같은 폭으로.
- 자동 초점(`tabindex="-1"`) 제목에 파란 테두리가 생기지 않게 `:focus-visible` 규칙에서 뺀다(이미 반영).
- 맨 위에서 당길 때 아이폰 기본 튕김이 하단 고정 바까지 끌어내린다 → `html { overscroll-behavior-y:none }` (이미 반영).
- 파일 위쪽 코드가 아래쪽 `let/const`를 먼저 부르면 오류(TDZ). 그럴 땐 함수 선언이나 `var`.
- iOS는 사파리와 홈 화면 앱의 저장 공간이 따로다. 사파리에서 쓴 기록은 홈 화면 앱에 없다 → 처음부터 홈 화면 앱으로 쓰게 안내.
- iOS는 `await` 뒤 클립보드 복사가 막힐 수 있다. 「복사하기」 버튼을 늘 같이 둔다.

## 6. 사용자가 좋아하는 방식

- 알아서 끝까지: 구현 → 테스트 → 커밋·푸시까지 하고, 결과를 쉬운 말로 짧게 알려준다.
- 휴대폰으로 많이 본다. 결과는 스크린샷으로 확인한다.
- 코드 파일을 보여줄 땐 내려받기보다 바로 보이게.
- 개인정보·비밀번호를 대화나 공개 저장소에 노출하지 않게 먼저 챙긴다.

## 7. 다음 할 일 (순서 제안)

1. 주기: 생리 시작·끝 기록, 달력 표시, 평균 주기로 다음 생리·배란 예상(참고용 문구), PMS 증상 체크
2. 약·영양제: 목록 + 오늘 먹었는지 체크(하트 습관 화면 방식 재사용)
3. 수면: 잠든·일어난 시간, 잠의 질, 주간 그래프
4. 네일: 시술 기록(날짜·샵·가격·사진은 기기 안에만), 다음 관리일 알림
5. 계정 지우기
