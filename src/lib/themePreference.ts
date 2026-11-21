import type { ThemePreference } from "@/types";

// 테마 선호 순수 모듈(설계서 §5.4a, AD-21). themeCodec·ThemeContext·ThemeSelector(옵션 순서)·헤더 테마 스위치가 쓴다.
// v1.5(U-24): "시스템"(OS 색 모드 따르기)을 없애고 라이트로 합쳤다. 선택지는 라이트·다크 2개이고 기본값은 라이트다.
// 예전 저장값 'system'은 이제 유효한 선호가 아니므로 코덱이 "값 없음"으로 읽어 기본값 라이트가 된다(덮어쓰지 않음, AC-18.4 규칙).

export const THEME_PREFERENCES: readonly ThemePreference[] = ["light", "dark"];

/** 저장값이 없거나 손상됐을 때(예전 'system' 포함)의 테마 */
export const DEFAULT_THEME: ThemePreference = "light";

export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    THEME_PREFERENCES.some((preference) => preference === value)
  );
}

/** 헤더 테마 스위치가 고를 반대 테마(라이트 ↔ 다크) */
export function oppositeTheme(preference: ThemePreference): ThemePreference {
  return preference === "dark" ? "light" : "dark";
}
