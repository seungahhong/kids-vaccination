import type { ComponentProps } from "react";
import type { Pressable } from "react-native";

import type { Locale } from "@/types";

// 언어 이름을 담은 선택 항목의 공통 props(리뷰 R1-16, WCAG 3.1.2 부분 언어). 네이티브(.tsx)와 웹(.web.tsx)이 같은 계약을
// 구현하므로 tsc가 두 파일을 같은 타입으로 검사한다(BirthdatePicker.types.ts와 같은 방식, 설계서 §7.1).
// language는 그 항목의 내용과 접근 이름(aria-label)이 쓰인 언어다. iOS는 accessibilityLanguage, 웹은 DOM lang 속성으로 알린다.
export type LanguagePressableProps = ComponentProps<typeof Pressable> & {
  /** 항목 내용(접근 이름 포함)의 언어 */
  readonly language: Locale;
};
