# CLAUDE.md

이 저장소에서 일하는 Claude를 위한 안내다. 사람용 소개·설치·기능 설명은 [README.md](README.md)에 있다. 여기에는 코드만 읽어서는 알기 어려운 규칙과 **그 규칙이 있는 이유**를 적는다. 규칙 대부분은 ESLint나 테스트가 강제하므로, 막히면 우회하지 말고 이유를 읽은 뒤 허용된 길을 쓴다.

## 프로젝트 한눈에

아이(최대 10명)의 생년월일로 한국 예방접종 일정을 계산해 보여 주는 Expo SDK 58 앱이다. 주 대상은 iOS·Android이고 웹 빌드는 E2E 검증에 쓴다. Next.js 웹앱에서 AI 상담을 뺀 기능을 옮긴 이식판이라 AI·네트워크 코드는 의도적으로 없다. 모든 값은 기기(AsyncStorage)에만 저장한다.

## 명령을 돌리기 전에

- **Node 24로 실행한다.** `package.json`의 `engines`가 `>=24.3 <25`이고 Expo SDK 58은 Node 25를 지원하지 않는다. 기본 개발 머신의 `node`는 25라서 npm·npx 명령마다 앞에 `export PATH="$HOME/.local/node-v24/bin:$PATH" &&`를 붙인다(셸 상태가 다음 명령으로 이어지지 않는다). 다른 머신이면 `nvm use`(`.nvmrc` = 24.22.0).
- 패키지 매니저는 npm이다. Expo 관리 패키지는 `npx expo install`로 SDK에 맞는 버전을 받는다.

## 명령

| 목적        | 명령                 | 메모                                                                                                   |
| ----------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| 완료 판정   | `npm run verify`     | typecheck → lint(경고 0) → format:check → test:ci → export:web. 변경을 마쳤다고 말하기 전에 통과시킨다 |
| 단위 테스트 | `npm test -- <경로>` | `TZ=Asia/Seoul`이 고정된다. 맨 `npx jest`는 TZ 확인 테스트가 일부러 실패한다                           |
| 두 시간대   | `npm run test:ci`    | 서울(커버리지 포함) + 뉴욕. 날짜를 다루는 코드를 고쳤으면 이것까지 돌린다                              |
| E2E         | `npm run e2e`        | 8081에 Expo 웹 서버를 띄우고 Playwright를 돌린다. 다른 E2E 실행과 겹치지 않게 혼자 돌린다              |
| 타입        | `npm run typecheck`  | `expo customize tsconfig.json`으로 typed routes 타입을 만든 뒤 `tsc --noEmit`                          |
| 서식        | `npm run format`     | Prettier. `.md`도 대상이라 문서를 고쳐도 `format:check`에 걸린다                                       |

`npm run e2e`는 `CI=1`이라 이미 떠 있는 서버를 재사용하지 않는다. 사용자가 직접 띄운 `expo start`가 8081을 쓰고 있으면 그 프로세스를 끄지 말고 `env -u CI npx playwright test`로 그 서버를 재사용한다.

## 의존 방향

의존은 `app → components → contexts → hooks → lib·theme·i18n → types·data` 한 방향이다. 순수 레이어(`src/lib`·`src/theme`·`src/i18n`)는 React·RN·expo를 import하지 않는다. 예외는 AsyncStorage를 감싸는 `src/lib/storage.ts` 하나다. 이 경계 덕분에 일정 계산을 RN 없이 빠르게 테스트하고 `src/lib` 커버리지 임계 95%(실제 100%)를 지킨다.

## 코드 규칙과 이유

- **날짜 문자열을 `new Date(str)`·`Date.parse`로 파싱하지 않는다.** `'YYYY-MM-DD'`는 UTC로 파싱되어 미국 시간대에서 하루가 밀린다(원본 앱의 실제 결함). `src/lib/date.ts`의 `parseIsoDate`·`isoDateToDate`·`startOfDay`를 쓴다. 월 덧셈은 `addMonthsClamped`(1/31 + 1개월 = 2/29, `setMonth`는 3/2로 넘침), 일 덧셈은 ms가 아니라 `addDays`(DST 전환일 보호). ESLint가 인자 1개짜리 `new Date(x)`를 막는다.
- **"오늘"은 주입받는다.** `src/lib`은 `new Date()`를 부르지 않고 `now`를 인자로 받는다. 화면은 `useToday()`(ClockContext)를 쓰고 `useMemo` 의존성에는 Date 객체 대신 `toIsoDate(today)` 문자열을 둔다. 그래야 테스트·E2E가 시계를 고정할 수 있고, 같은 날에는 일정을 다시 계산하지 않는다.
- **날짜 표시는 `src/lib/format.ts`만 쓴다.** `toLocaleDateString`·`Intl`은 Hermes·브라우저마다 ICU 결과가 달라 4개 언어 표기를 고정할 수 없다. ESLint는 `toLocaleDateString`만 막고 `Intl`은 막지 않으므로 `Intl`은 스스로 피한다.
- **화면은 AsyncStorage를 직접 만지지 않는다.** Context 함수(`setLocale`·`setPreference`·`addChild`·`selectChild`·`removeChild`·`toggleCompleted`)만 쓴다. 저장값은 codec을 거치고, 손상된 값은 "없음"으로 읽고 덮어쓰지 않는다. 테마·언어는 원시 문자열이다.
- **아이 목록은 키 하나(`vaccination-app-children`)의 버전이 붙은 JSON이다(U-29, 원시 문자열 규칙의 유일한 예외).** 형식은 `src/lib/children.ts`가 정하고 `decodeChildren`이 모든 필드를 검사한다. 접종 완료 기록은 아이마다 그 안에 있다. 아이가 0명이 되면 키 자체를 지운다. 예전 `vaccination-app-birthdate`·`vaccination-app-completed`는 새 키가 없을 때만 아이 1명으로 옮기고 지운다(`src/lib/storage.ts`의 `loadChildren`·`commitChildrenMigration`). 그래서 테스트·E2E가 예전 생년월일 키를 시드해도 아이 1명(이름표 = 생년월일)으로 열린다. 화면 이름표는 `childLabel`(이름, 없으면 생년월일)만 쓴다. 이름이 있는 아이의 "생년월일: …" 줄은 `childBirthdateNote`로 정한다(U-33). 이름이 없으면 이름표가 이미 생년월일이라 줄을 두지 않는다.
- **색 hex는 `src/theme/tokens.ts`에만 둔다.** 컴포넌트는 `useTheme().tokens`에서 색을 가져오고, `StyleSheet`에는 레이아웃만 둔다. 텍스트/배경 조합은 `CONTRAST_PAIRS`에 등록된 것만 쓴다. 테스트가 두 테마 모두에서 등록 쌍의 대비 ≥ 4.5:1을 확인하기 때문이다. 새 조합이 필요하면 쌍을 등록하고 대비 테스트를 통과시킨다.
- **접근성은 `role` + `aria-*` props로 표현한다.** `accessibilityRole`·`accessibilityState`는 ESLint 오류다. react-native-web 0.21이 `accessibilityState`를 DOM에 반영하지 않아 웹 E2E와 보조기기가 상태를 읽지 못한다. 화면 제목은 `role="heading"`(웹 `<h1>`), 섹션 제목은 `aria-level={2}`이다.
- **`Alert`·`fetch`·`XMLHttpRequest`는 쓰지 않는다.** 확인은 앱 안 UI로 한다(웹에서 `Alert`이 동작하지 않음). 앱은 네트워크 요청 0건이 요구사항이고 `src/__test__/no-ai.test.ts`·`e2e/no-ai.spec.ts`가 지킨다.
- **타입 우회 금지:** `any`, `@ts-ignore`·`@ts-nocheck`·`@ts-expect-error`(타입 테스트 `src/types/__test__/` 제외), `as unknown as`. `IsoDate`는 브랜드 타입이라 `date.ts`의 함수로만 만든다.
- **플랫폼 분기는 파일 세 개로 한다:** `X.types.ts`(공통 계약) + `X.ts(x)`(네이티브) + `X.web.ts(x)`(웹). Metro가 웹 번들에서 `.web`을 고르고, 두 구현이 같은 타입을 따르므로 tsc가 둘 다 검사한다. 커버리지에서는 `.web.tsx`(컴포넌트)만 빠지고 E2E가 검증한다. `.web.ts`(훅)는 커버리지 대상이라 jest 테스트가 필요하다.
- **테마는 라이트·다크 2개이고 OS 색 모드를 따르지 않는다(U-24).** `ThemeContext`는 `useColorScheme`을 읽지 않고 저장값이 없거나 예전 `'system'`이면 라이트다. 그래서 다크 화면을 테스트하려면 `emulateMedia`·`mockSystemScheme`이 아니라 저장값 `vaccination-app-theme = 'dark'`를 시드하거나 헤더 테마 스위치를 누른다. 같은 이유로 `app.json`의 `userInterfaceStyle`은 `"light"`이고, OS 색 모드를 따르는 네이티브 부품(iOS 날짜 휠 `themeVariant`, 키보드 `keyboardAppearance`)에는 `useTheme().scheme`을 직접 넘긴다.
- **생년월일 피커는 선택지를 앱이 만든다(U-32).** 웹 `<input type="date">`와 Android 시스템 날짜 대화상자는 브라우저·기기 언어로만 표시되어 앱 언어를 따르지 못한다. 그래서 웹은 연·월·일 `<select>` 3개(`birthdate-year`·`-month`·`-day`, 묶음 `birthdate-input`), Android는 아래 시트 안의 연·월·일 radio 열(`birthdate-option-{part}-{값}`)이다. iOS만 spinner에 `locale` prop을 준다. 선택지와 범위 맞추기는 `src/lib/dateParts.ts`, 표기는 `format.ts`의 `formatYearPart`·`formatMonthPart`·`formatDayPart`가 맡는다. 웹 `<option>`은 글자를 `label` 속성에 둔다. 자식 텍스트로 두면 jest의 RN 렌더러가 "Text strings must be rendered within a <Text>"로 거부한다.
- **앱은 넓은 창에서도 768px 열 안에 그려진다(U-31).** `app/_layout.tsx`의 `app-frame`(maxWidth `MAX_CONTENT_WIDTH`)이 헤더·본문·탭 바를 감싼다. 그래서 `useWindowDimensions`의 창 너비가 앱 열 너비보다 클 수 있다.
- **아이 추가 폼(`AddChildForm`)은 아이가 없을 때 홈에, 있을 때는 헤더 "아이 추가" 메뉴에만 있다(U-30).** 그래서 아이가 저장된 상태에서 홈의 `birthdate-input`·`birthdate-submit`을 찾는 테스트는 헤더 메뉴(`header-add-panel`) 안에서 찾는다.
- **모든 탭 화면 맨 위에는 `Screen`이 붙이는 `AppHeader`가 있다(FR-15).** 스크롤 밖에 고정되고 SafeArea top 패딩도 헤더가 받는다. 헤더의 테마 스위치·언어 버튼이 화면 본문보다 먼저 Tab 정지점이 되고, 언어 메뉴는 설정과 같은 `LanguageSelector`를 `testIDPrefix="header-locale-option"`으로 쓰고, 헤더 안이 아니라 헤더의 형제 층(`header-language-overlay`, 절대 위치·zIndex)으로 본문 위에 덮인다. 헤더 밖으로 튀어나온 자식은 Android가 터치를 받지 않기 때문이다. 웹에서 Tab에 걸리면 안 되는 `Pressable`은 `focusable={false}`만으로는 부족하고 `tabIndex={-1}`도 준다(RNW).
- **카드가 다른 구역으로 옮겨 가면 다시 마운트되어 포커스가 사라진다.** 일정 화면은 토글 전에 `focusTargetAfterToggle`로 다음 카드를 정해 두고 커밋 뒤 그 체크박스로 포커스를 옮긴다. 구역 규칙(`sectionSchedule`)을 바꾸면 이 함수의 테스트도 함께 본다. 웹 `role="checkbox"`·`"switch"`는 RNW가 Space를 처리하지 않으므로 `useToggleKeys`를 붙인다.
- **탭 화면은 언마운트되지 않는다.** 선택된 아이가 바뀔 때 화면 state를 처음으로 돌리려면 effect 대신 `key`를 바꾼다(`ScheduleBody` 참고). 이때 포커스를 가진 컨트롤(아이 칩)은 key 밖에 둔다. 웹에서는 떠난 탭이 DOM에 남으므로 `useBlurInert`가 `inert`를 붙인다.
- **웹 키보드·화면 낭독기 보강(리뷰 R4).** 헤더 메뉴와 아이 삭제 확인은 `useDismiss`(웹만: Escape, 메뉴 밖으로 나간 포커스)로 닫는다. 헤더는 `banner`, 본문은 `main`, 헤더 메뉴 상자는 이름 붙은 `region`이다. 문서 제목은 보이는 화면이 정하고(`useScreenDocument`, 홈은 앱 이름만), 포커스를 가진 컨트롤이 사라지며 화면이 바뀌는 동작(아이 추가 제출 등)은 이동 전에 `requestTitleFocus("screen-…")`를 불러 대상 화면 제목(h1)으로 포커스를 보낸다. `e2e/axe.spec.ts`가 화면 상태별로 axe(WCAG 2.1 AA + best-practice)를 돌린다. 하단 탭 바만 `region` 규칙에서 빠진다(expo-router 내부 View라 role을 줄 수 없음).
- **네이티브 화면 낭독기 포커스 이동은 대상의 `onLayout`에서 한다.** `useEffect` 시점에는 새 네이티브 뷰가 아직 없어 이동이 조용히 실패한다(Android 에뮬레이터에서 확인한 결함 V-01). 테스트는 `test-utils/render.tsx`의 `fireLayout`으로 그 시점을 연다.

## 테스트 작성

- **위치:** 대상 파일 옆 `__test__/`(단수형)에 둔다. 라우트 화면 테스트는 `app/(tabs)/__test__/`에 둔다. Expo Router는 `app/` 아래 파일을 모두 라우트로 번들하므로 `metro.config.js`가 `__test__/`를 blockList로 막는다. 그래서 `app/`에서 `__test__/` 밖에 둔 `*.test.*` 파일은 실제 라우트가 되어 `expo export`를 깨뜨린다. 수동 mock은 `src/mocks/`에 두고 `jest.setup.ts`에서 연결한다. `public/`에는 테스트를 두지 않는다(`dist`로 그대로 복사됨). `test-utils/__test__/test-layout.test.ts`가 이 규칙을 검사한다.
- **RNTL 14는 비동기다.** `render`·`fireEvent`·`act`·`renderHook`·`rerender`를 모두 `await`한다.
- **포커스 대상 단언은 `describeHost`·`propsOf`(`test-utils/render.tsx`)로 문자열을 비교한다.** 호스트 객체를 `toEqual`·`toHaveBeenCalledWith(hostWithProps(...))`로 직접 비교하다 실패하면 jest가 React 내부 그래프를 diff하느라 몇 분씩 멈춘다(실측).
- **RNTL은 접근성 요소가 아닌 컨테이너를 role로 찾지 못한다.** `accessible`이 아닌 `role="radiogroup"` View가 그 예다. 이런 컨테이너는 testID로 찾고 `propsOf`로 `role`·`aria-label`을 확인한다. react-native 훅을 spy할 때는 `jest.requireActual("react-native")`에 건다. `import * as`는 CommonJS 모듈의 복사본이라 spy가 화면 코드에 닿지 않는다.
- **렌더 헬퍼(`test-utils/render.tsx`):** 컴포넌트는 `renderWithProviders(ui, { now })`, 라우트는 `renderApp({ initialUrl, now })`로 렌더한다. 기본 시각은 `FIXED_NOW`(로컬 2026-10-18 15:00)이다. `renderApp`은 fake timer를 켜므로 그 뒤에는 `flushMacrotask` 대신 `flushRouterMacrotask`를 쓴다. 저장값은 `seedStorage`로 넣고(`setItem` 호출 횟수 단언을 오염시키지 않음), 하이드레이션 경합은 `deferStorage`로 재현한다.
- **mock 복원은 `jest.setup.ts`가 한다.** `resetMocks`·`restoreMocks`를 jest 설정에 켜지 않는다. Jest 30에서는 이 옵션이 수동 mock 구현까지 지운다.
- **날짜 단언**은 `toIsoDate(d) === "YYYY-MM-DD"`처럼 문자열로 비교하고, 서울·뉴욕 두 시간대에서 모두 통과해야 한다.
- **E2E 스펙 작성 규칙**은 `e2e/CLAUDE.md`에 있다. `e2e/` 아래 파일을 다룰 때 자동으로 읽힌다.

## 자주 하는 변경

접종 데이터를 고치는 절차는 `src/data/CLAUDE.md`, 번역 키를 더하는 절차는 `src/i18n/CLAUDE.md`에 있다. 그 폴더의 파일을 다룰 때 자동으로 읽힌다.

**Tab 순서를 바꿀 때:** 화면마다 헤더 (아이 추가 →) 테마 스위치 → 언어 버튼 → 본문 순이고(일정 본문은 아이 칩 → 필터 → 카드), 일정 카드는 체크박스 → 토글 순으로 Tab이 멈춘다. `e2e/review-r1-a11y.spec.ts`(필터 다음 첫 정지점, 설정 본문 앞의 헤더)와 `e2e/review-r2-a11y.spec.ts`(R2-01 Tab 횟수 = 두 바퀴, 화면 첫 정지점, R2-05 첫 정지점)가 이 순서를 단언하므로 함께 고친다. Tab을 누르는 스펙은 이 밖에도 있다(`review-r3-a11y`·`review-r4-a11y`·`header.spec.ts`). `grep -l 'press("Tab")' e2e/*.spec.ts`로 찾는다. 짧은 화면 스크롤 테스트(`review-r1-home` R1-02)는 휠을 고정 헤더 아래에서 굴린다.

**상태 판정 기준을 바꿀 때:** "곧 접종" 창은 `src/lib/schedule.ts`의 `SOON_WINDOW_DAYS`(30)다. JSDoc과 README에도 같은 수치가 적혀 있다. `AC-5.2` 테스트는 고정 시각 + 30일이 뉴욕 DST 종료일(2026-11-01)을 지나는 경계를 검증한다. 창을 줄이면 이 테스트가 더는 DST를 거치지 않으므로, 그 테스트의 `now`를 다시 고른다.

**UI를 바꿀 때:** 터치 영역 44×44 이상, 렌더 대비, heading 구조를 E2E(`e2e/a11y.spec.ts`, `axe.spec.ts`, `review-r*-a11y.spec.ts`)가 검사한다. 단위 테스트만 보고 끝내지 말고 `npm run e2e`도 돌린다. 화면 구조도 테스트에 고정되어 있다. 예를 들어 설정 화면은 다음 값을 단언한다.

- heading 개수(`app/(tabs)/__test__/settings.test.tsx`)
- level-2 섹션 제목 목록(`e2e/review-r1-a11y.spec.ts`)

그래서 섹션을 더하거나 빼면 이 기대값도 함께 고친다.

**새 expo·네이티브 모듈을 쓸 때:** `src/lib`·`src/theme`·`src/i18n`에서는 import할 수 없으므로 hooks·contexts·components 쪽에서 쓴다. jest 프리셋의 기본 mock이 모자라면 `src/mocks/<패키지 이름>`에 수동 mock을 두고 `jest.setup.ts`에서 `jest.mock`으로 연결한다.

## 주석의 ID와 참고 문서

주석의 ID는 아래 계약 문서의 항목을 가리킨다.

| ID                     | 뜻                                    |
| ---------------------- | ------------------------------------- |
| `FR-n`·`US-n`·`AC-n.m` | PRD의 요구사항·사용자 스토리·인수조건 |
| `U-n`                  | 사용자 결정                           |
| `R1-03`                | 리뷰 라운드별 지적                    |
| `V-01`                 | 에뮬레이터에서 찾은 결함              |
| `G-n`                  | NFR 게이트                            |
| `설계서 §n`            | 설계서의 해당 절                      |

문서 위치:

- `.claude/plans/`: PRD `kids-vaccination-prd.md`(현재 버전은 문서 머리말에 있다), 설계서 `kids-vaccination-architecture.md`
- `.claude/reports/`: 최종 리포트, 에뮬레이터 증적, 리뷰 라운드 기록(`review/`)

두 폴더는 gitignore 대상이라 원래 개발 머신에만 있다. 문서가 없으면 각 파일 머리 주석에 같은 맥락이 요약되어 있다.

문서가 있으면 PRD §2.3(인수조건), §8.4(사용자 결정), 부록 E(개발 이후 변경 기록)부터 본다. 읽을 때 세 가지에 주의한다.

- AC 본문에는 옛 수치(카드 35개 등)가 남아 있다. 현재 기대값은 부록 E의 뒤 항목(데이터 수치는 E.8, 그 뒤의 기능 변경은 E.9 이후)과 실제 테스트가 우선한다.
- 문서에는 예전 경로 `__tests__`가 남아 있다. 경로와 구조는 현재 코드를 기준으로 판단한다.
- R4 리뷰 반영처럼 PRD에 없는 변경도 있다(`.claude/reports/review/`에만 기록). 문서와 코드가 다르면 코드와 테스트를 따른다.
