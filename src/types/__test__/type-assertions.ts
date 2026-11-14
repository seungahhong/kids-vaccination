// 타입 테스트(G-3, 설계서 §9.7). jest 대상이 아니고(testPathIgnorePatterns) `npm run typecheck`(typegen → tsc)만 검사한다.
// 각 `@ts-expect-error` 줄은 실제 타입 오류를 내야 한다 — 오류가 나지 않으면 tsc가 "Unused '@ts-expect-error' directive"로 실패한다.
// 아래 함수는 호출되지 않는다(타입 검사 전용). 양성 줄은 같은 API의 올바른 사용이 통과함을 보인다.
import { router } from "expo-router";

import type { BirthdateContextValue } from "@/contexts/BirthdateContext";
import type { I18nContextValue } from "@/contexts/I18nContext";
import { lightTokens } from "@/theme/tokens";
import type { IsoDate } from "@/types";

/** 번역 키는 ko.json 기반 2단계 dot-path 유니온(TranslationKey)만 받는다 */
export function translationKeyAssertions({ t }: I18nContextValue): string {
  const positive = t("common.home");
  // @ts-expect-error -- FR-13: 제거된 chat 네임스페이스의 키는 TranslationKey가 아니다
  const removedNamespace = t("chat.title");
  // @ts-expect-error -- 존재하지 않는 키는 컴파일 오류다
  const unknownKey = t("nonexistent.key");
  // @ts-expect-error -- 네임스페이스만으로는 leaf 키가 아니다(2단계 dot-path만 허용)
  const namespaceOnly = t("schedule");
  return positive + removedNamespace + unknownKey + namespaceOnly;
}

/** 테마 토큰은 THEME_TOKEN_KEYS 28키만 있다(lightTokens는 `satisfies ThemeTokens` 리터럴 객체) */
export function themeTokenAssertions(): string {
  const positive: string = lightTokens.tabActive;
  // @ts-expect-error -- 존재하지 않는 테마 토큰 키 접근은 컴파일 오류다
  const missing: string = lightTokens.nonexistent;
  return positive + missing;
}

/** typed routes(app.json experiments.typedRoutes): 생성된 href 유니온 밖의 경로는 거부된다 */
export function typedRoutesAssertions(): void {
  router.push("/");
  router.push("/schedule");
  router.push("/settings");
  // @ts-expect-error -- FR-13: /chat 경로는 없다. typed routes 생성이 누락되면 이 줄이 "Unused @ts-expect-error"로 실패해 누락도 검출된다
  router.push("/chat");
}

/** 생년월일은 브랜드 타입 IsoDate만 받는다(toIsoDate/isIsoDate/isSelectableBirthdate로만 만든다) */
export function birthdateAssertions(
  { setBirthdate }: BirthdateContextValue,
  iso: IsoDate
): void {
  setBirthdate(iso);
  // @ts-expect-error -- 브랜드 없는 문자열 리터럴은 IsoDate가 아니다
  setBirthdate("2024-01-31");
}
