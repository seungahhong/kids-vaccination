# 아기 예방접종 일정 (kids-vaccination)

아기의 생년월일을 입력하면 한국 표준 예방접종 일정에 맞춰 백신별 접종 시기를 계산해 보여 주는 React Native(Expo) 앱입니다. 일정은 질병관리청 「2026년 국가예방접종 지침」과 대한소아과학회 권장 선택접종을 기준으로 하며, 현재 14종 41회차를 다룹니다.

- 대상 플랫폼: iOS · Android (Expo Go로 실행). 웹 빌드는 E2E 검증용입니다.
- 오프라인 앱입니다. 네트워크 요청이 없고 입력한 정보는 기기에만 저장됩니다.
- Next.js 웹앱으로 만든 원본에서 AI 상담 기능을 뺀 나머지 기능을 옮기고, 원본의 날짜 계산 결함 3건을 고쳤습니다.

> 이 앱의 정보는 참고용입니다. 정확한 접종 계획은 소아과 의사와 상담하세요.

## 주요 기능

| 화면      | 기능                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 홈        | 생년월일 입력. 네이티브는 DateTimePicker, 웹은 `<input type="date">`를 씁니다. 입력할 수 있는 범위는 (올해 − 9)년 1월 1일부터 오늘까지입니다. 이전에 입력한 생년월일이 있으면 바로가기 버튼을 보여 줍니다                                                                                                                         |
| 접종 일정 | 월령 그룹 타임라인을 보여 줍니다. 각 항목은 지남, 곧 접종(시작일이 30일 안), 예정 중 하나로 표시됩니다. 전체·예정·지남 필터가 있고, "전체"에서는 접종할 항목이 위에, 지난 접종이 아래에 나옵니다. 카드를 펼치면 상세 정보·부작용·참고사항을 볼 수 있고, 카드마다 필수/선택 배지가 붙습니다. 화면 위쪽에 의료 면책 문구가 있습니다 |
| 설정      | 테마(시스템·라이트·다크)와 언어(한국어·English·日本語·中文)를 고를 수 있습니다. 언어를 고르지 않으면 기기 언어를 따르고, 지원하지 않는 언어면 한국어로 보여 줍니다. 저장된 생년월일은 확인 단계를 거쳐 삭제합니다                                                                                                                 |

접근성도 갖췄습니다.

- 두 테마 모두 텍스트 대비가 4.5:1 이상입니다.
- 터치 영역은 44×44 이상입니다.
- 화면 낭독기가 제목 구조를 따라 탐색할 수 있습니다.
- 웹에서는 방향키로 라디오 그룹과 탭을 이동할 수 있습니다.

## 기술 스택

| 영역      | 사용 기술                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- |
| 런타임    | Expo SDK 58, React Native 0.88, React 19.3, Expo Router(typed routes), react-native-web 0.21 |
| 상태·저장 | React Context + AsyncStorage (원시 문자열 값)                                                |
| UI        | StyleSheet + 테마 토큰, lucide-react-native 아이콘                                           |
| 언어      | TypeScript 6 (strict, `any` 금지)                                                            |
| 테스트    | jest-expo(Jest 30) + React Native Testing Library 14, Playwright(Expo 웹 대상 E2E)           |
| 품질      | ESLint 9(flat config, eslint-config-expo), Prettier 3                                        |

## 시작하기

### 준비

- **Node.js 24** (`.nvmrc` = 24.22.0, `engines` = `>=24.3 <25`). Expo SDK 58은 Node 25를 지원하지 않습니다.
  ```bash
  nvm use            # 또는 Node 24 바이너리를 PATH 앞에 둡니다
  node -v            # v24.x 확인
  ```
- iOS·Android 기기에서 실행하려면 [Expo Go](https://expo.dev/go) 앱을 설치합니다.

### 설치와 실행

```bash
npm install
npm start          # Expo 개발 서버. Expo Go로 QR 코드를 스캔합니다
npm run web        # 웹 실행 (http://localhost:8081)
```

E2E 테스트를 처음 돌리기 전에 Playwright 브라우저를 설치합니다.

```bash
npx playwright install chromium
```

## 스크립트

| 명령                              | 설명                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| `npm start`                       | Expo 개발 서버                                                          |
| `npm run web`                     | 웹 개발 서버(포트 8081)                                                 |
| `npm test`                        | jest 실행(`TZ=Asia/Seoul` 고정)                                         |
| `npm run test:ci`                 | 서울 시간대(커버리지 포함) + 뉴욕 시간대 두 번 실행                     |
| `npm run e2e`                     | Expo 웹 서버를 띄우고 Playwright E2E 실행                               |
| `npm run typecheck`               | typed routes 타입 생성 후 `tsc --noEmit`                                |
| `npm run lint`                    | ESLint(경고 0 허용)                                                     |
| `npm run format` / `format:check` | Prettier 적용 / 검사                                                    |
| `npm run export:web`              | 웹 정적 빌드(`dist/`)                                                   |
| `npm run verify`                  | typecheck → lint → format:check → test:ci → export:web 전체 품질 게이트 |

## 프로젝트 구조

```
app/
  _layout.tsx             Provider 트리(SafeArea → Theme → I18n → Birthdate) + 하이드레이션 게이트
  (tabs)/                 하단 탭: index(홈) · schedule(접종 일정) · settings(설정)
src/
  components/             화면 부품 (home · schedule · settings · common)
  contexts/               ThemeContext · I18nContext · BirthdateContext
  hooks/                  usePersistentState · useToday · 웹/네이티브 분기 훅
  lib/                    순수 로직: 날짜 · 일정 계산 · 표시 형식 · 데이터 검증 · 저장 어댑터
  theme/                  테마 토큰과 대비 계산
  i18n/                   번역 카탈로그(ko · en · ja · zh)
  data/vaccinations.json  접종 데이터
  types/                  도메인 타입
  mocks/                  jest 수동 mock
test-utils/               jest 렌더 헬퍼
e2e/                      Playwright 스펙
public/index.html         웹 HTML 템플릿(SEO 메타·JSON-LD)
```

의존 방향은 `app → components → contexts → hooks → lib·theme·i18n → types·data`입니다. 순수 레이어(`src/lib`·`src/theme`·`src/i18n`)는 React·React Native를 import하지 않으며, 이 규칙은 ESLint가 검사합니다.

## 테스트

- **단위·통합(jest):** 테스트는 대상 파일 옆 `__test__/` 폴더에 둡니다. 라우트 화면 테스트는 `app/(tabs)/__test__/`에 있습니다. 날짜 버그를 잡으려고 서울과 뉴욕 두 시간대에서 실행합니다. 커버리지 임계값은 `src/lib` 95%(네 지표 모두), 그 밖은 lines 80%입니다.
- **E2E(Playwright):** Expo 웹 빌드를 Chromium으로 검증합니다. 실행 조건은 다음과 같이 고정합니다.
  - 시계: 2026-10-18 10:00 KST
  - 시간대: Asia/Seoul
  - 로케일: ko-KR
  - 뷰포트: 390×844

  인수조건 테스트는 제목이 `AC-n.m`으로 시작하고, 결과는 `test-results/e2e.json`에 남습니다.

- **수동 확인:** 네이티브 날짜 피커와 실기기 화면은 자동 검증 범위 밖입니다. Expo Go로 직접 확인합니다.

## 접종 데이터

`src/data/vaccinations.json`에 백신별 회차, 권장 월령(`minMonths`~`maxMonths`), 4개 언어 설명, 분류가 들어 있습니다. 분류는 두 가지입니다.

- `national`: 국가예방접종, 필수
- `optional`: 기타예방접종, 선택

앱이 시작될 때 데이터 구조를 검증합니다.

인플루엔자 지원 연령이나 HPV 남아 지원 대상처럼 해마다 바뀌는 항목이 있으므로, 질병관리청 지침이 새로 나오면 데이터를 다시 확인합니다.

## 현재 상태 (2026-11-07)

- `npm run verify` 통과. jest 487건을 서울·뉴욕 두 시간대에서 실행했고, `src/lib` 커버리지는 100%입니다.
- E2E 인수조건은 모두 통과했습니다. 수동 확인 3건 중 Android 부분은 에뮬레이터에서 확인했습니다.
- 남은 일:
  - iOS 실기기 확인(네이티브 날짜 피커, 다크 모드 시각 확인, VoiceOver)
  - 배포 전 `app.json`의 번들 ID `com.example.kidsvaccination`을 실제 값으로 바꾸기
  - EAS 등 네이티브 배포 빌드 설정(아직 없음)
  - `npm audit`의 high 경고: Expo·Metro·Jest 도구 체인의 간접 의존성에서 나옵니다. 고치려면 SDK를 다운그레이드해야 해서 보류 중입니다
- 알려진 제한: 생년월일은 (올해 − 9)년 1월 1일 이후만 입력할 수 있습니다. 그보다 일찍 태어난 아이(2026년 기준 2016년 12월 31일 이전 출생)의 일정은 볼 수 없습니다.
