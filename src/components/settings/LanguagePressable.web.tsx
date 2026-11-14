import type { ComponentProps, ComponentType, ReactElement } from "react";
import { Pressable } from "react-native";

import { toLanguageTag } from "@/lib/locale";

import type { LanguagePressableProps } from "./LanguagePressable.types";

// 언어 이름 항목의 웹 구현(리뷰 R1-16, WCAG 3.1.2): 항목 요소에 lang 속성을 단다. lang은 그 요소의 내용과
// aria-label 같은 텍스트 속성 모두에 적용되므로 접근 이름("English" 등)도 해당 언어로 읽힌다.
// jest 대상이 아니며(설계서 §9.1) e2e/review-r1-a11y.spec.ts가 검증한다.

/**
 * react-native-web의 Pressable(→ View)은 lang을 DOM 속성으로 그대로 넘기지만 RN 타입에는 lang이 없다.
 * 웹 파일에서만 props 타입을 넓힌다: 더 많은 props를 받는 타입으로의 대입이라 tsc가 매개변수 호환성으로 검사한다(단언 없음).
 */
const PressableWithLang: ComponentType<
  ComponentProps<typeof Pressable> & { readonly lang?: string }
> = Pressable;

/** 내용의 언어를 DOM lang 속성으로 알리는 Pressable */
export function LanguagePressable({
  language,
  ...props
}: LanguagePressableProps): ReactElement {
  return <PressableWithLang {...props} lang={toLanguageTag(language)} />;
}
