# E2E 스펙을 쓸 때

이 폴더의 파일을 다룰 때만 읽히는 안내다. 공통 규칙과 실행 명령(`npm run e2e`)은 루트 `CLAUDE.md`에 있다.

- `test`는 `e2e/fixtures.ts`에서 import한다. 이 fixture가 시계(2026-10-18 10:00 KST)를 고정하고, `seed`(localStorage 1회 주입)와 `screenOf`를 준다.
- 떠난 탭 화면이 DOM에 남으므로 testID·텍스트 조회는 `screenOf("schedule")` 안으로 한정한다.
- 인수조건을 판정하는 테스트는 제목을 AC ID로 시작한다(`"AC-6.1 …"`). 충족률은 `test-results/e2e.json`을 이 접두어로 집계한다. 보조 테스트는 `G-6`·`R1-04`·`SEO` 같은 다른 접두어를 쓴다.
- 생년월일은 `.fill()` 대신 `e2e/fixtures.ts`의 `fillBirthdate(scope, "YYYY-MM-DD")`로 고른다(연 → 월 → 일 순서). 웹 입력이 연·월·일 `<select>` 3개이기 때문이다(U-32).
