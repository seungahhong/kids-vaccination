# 번역 키를 더할 때

이 폴더의 파일을 다룰 때만 읽히는 안내다. 공통 규칙은 루트 `CLAUDE.md`에 있다.

`src/i18n/messages/ko.json`이 기준 카탈로그다. 4개 파일에 같은 키를 넣는다. 빠진 키는 `satisfies Catalogs`가 컴파일 오류로 잡고, 남는 키는 `src/i18n/__test__/messages.test.ts`의 키 집합 단언이 잡는다. 그래서 키를 더하면 그 테스트의 기대 키 목록과 개수도 함께 고친다.
