import type { ColorScheme, ThemePreference } from "@/types";

// 테마 선호 순수 모듈(설계서 §5.4a, AD-21). P4 themeCodec, P5 ThemeContext, P10 ThemeSelector(옵션 순서)가 쓴다.

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    THEME_PREFERENCES.some((preference) => preference === value)
  );
}

/** 선호가 system이면 OS 값(미확정 null/undefined는 light), 아니면 선호 그대로(AC-11.5) */
export function resolveColorScheme(
  preference: ThemePreference,
  system: ColorScheme | null | undefined
): ColorScheme {
  return preference === "system" ? (system ?? "light") : preference;
}
