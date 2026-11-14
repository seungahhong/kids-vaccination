import type { ReactElement } from "react";
import { Pressable } from "react-native";

import { toLanguageTag } from "@/lib/locale";

import type { LanguagePressableProps } from "./LanguagePressable.types";

// 언어 이름 항목의 네이티브 구현(리뷰 R1-16): iOS VoiceOver는 accessibilityLanguage(BCP 47)의 발음 규칙으로 이 항목의
// 접근 이름을 읽는다(Android는 무시). 웹 번들은 Metro가 같은 이름의 LanguagePressable.web.tsx를 고른다.

/** 내용의 언어를 화면 낭독기에 알리는 Pressable */
export function LanguagePressable({
  language,
  ...props
}: LanguagePressableProps): ReactElement {
  return (
    <Pressable {...props} accessibilityLanguage={toLanguageTag(language)} />
  );
}
