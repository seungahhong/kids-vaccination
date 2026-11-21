import type { ColorScheme } from "@/types";

// 테마 토큰(설계서 §4.5, PRD §3.4). 하드코딩 색 hex는 이 파일에만 둔다(§7.3).
// 텍스트/배경 쌍은 CONTRAST_PAIRS에 등록된 조합만 컴포넌트에서 쓰고, 대비는 src/theme/__test__/tokens.test.ts가 두 테마에서 ≥ 4.5:1로 강제한다(G-6 (a)).

export const THEME_TOKEN_KEYS = [
  "background",
  "surface",
  "surfaceMuted",
  "border",
  "text",
  "textSecondary",
  "textPast",
  "primary",
  "onPrimary",
  "primarySoft",
  "onPrimarySoft",
  "tabActive",
  "tabInactive",
  "chipBackground",
  "chipText",
  "statusUpcoming",
  "statusSoon",
  "statusPast",
  "statusCompleted",
  "badgeUpcomingBackground",
  "badgeUpcomingText",
  "badgeSoonBackground",
  "badgeSoonText",
  "badgePastBackground",
  "badgePastText",
  "badgeNationalBackground",
  "badgeNationalText",
  "badgeOptionalBackground",
  "badgeOptionalText",
  "badgeCompletedBackground",
  "badgeCompletedText",
  "checkboxChecked",
  "onCheckboxChecked",
  "shadow",
  "danger",
  "onDanger",
  "dangerSurface",
  "dangerText",
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokens = Readonly<Record<ThemeTokenKey, string>>;

/** 키 누락·초과 모두 컴파일 오류(satisfies). 값은 설계서 §4.5 표 그대로 */
export const lightTokens = {
  background: "#fafaf9",
  surface: "#ffffff",
  surfaceMuted: "#f5f5f4",
  border: "#e7e5e4",
  text: "#1c1917",
  textSecondary: "#78716c",
  textPast: "#57534e",
  primary: "#0f766e",
  onPrimary: "#ffffff",
  primarySoft: "#f0fdfa",
  onPrimarySoft: "#0f766e",
  tabActive: "#0f766e",
  tabInactive: "#78716c",
  chipBackground: "#f5f5f4",
  chipText: "#44403c",
  statusUpcoming: "#14b8a6",
  statusSoon: "#f97316",
  statusPast: "#d6d3d1",
  statusCompleted: "#22c55e",
  badgeUpcomingBackground: "#f0fdfa",
  badgeUpcomingText: "#0f766e",
  badgeSoonBackground: "#fff7ed",
  badgeSoonText: "#c2410c",
  badgePastBackground: "#f5f5f4",
  badgePastText: "#57534e",
  badgeNationalBackground: "#eff6ff",
  badgeNationalText: "#1d4ed8",
  badgeOptionalBackground: "#f5f3ff",
  badgeOptionalText: "#6d28d9",
  badgeCompletedBackground: "#f0fdf4",
  badgeCompletedText: "#166534",
  checkboxChecked: "#0f766e",
  onCheckboxChecked: "#ffffff",
  shadow: "#1c1917",
  danger: "#dc2626",
  onDanger: "#ffffff",
  dangerSurface: "#fef2f2",
  dangerText: "#b91c1c",
} satisfies ThemeTokens;

export const darkTokens = {
  background: "#1c1917",
  surface: "#292524",
  surfaceMuted: "#231f1d",
  border: "#44403c",
  text: "#fafaf9",
  textSecondary: "#a8a29e",
  textPast: "#a8a29e",
  primary: "#0f766e",
  onPrimary: "#ffffff",
  primarySoft: "#134e4a",
  onPrimarySoft: "#99f6e4",
  tabActive: "#2dd4bf",
  tabInactive: "#a8a29e",
  chipBackground: "#292524",
  chipText: "#d6d3d1",
  statusUpcoming: "#14b8a6",
  statusSoon: "#f97316",
  statusPast: "#57534e",
  statusCompleted: "#22c55e",
  badgeUpcomingBackground: "#134e4a",
  badgeUpcomingText: "#99f6e4",
  badgeSoonBackground: "#7c2d12",
  badgeSoonText: "#fed7aa",
  badgePastBackground: "#44403c",
  badgePastText: "#e7e5e4",
  badgeNationalBackground: "#1e3a8a",
  badgeNationalText: "#bfdbfe",
  badgeOptionalBackground: "#4c1d95",
  badgeOptionalText: "#ddd6fe",
  badgeCompletedBackground: "#14532d",
  badgeCompletedText: "#bbf7d0",
  checkboxChecked: "#2dd4bf",
  onCheckboxChecked: "#1c1917",
  shadow: "#000000",
  danger: "#f87171",
  onDanger: "#1c1917",
  dangerSurface: "#450a0a",
  dangerText: "#fca5a5",
} satisfies ThemeTokens;

export const THEMES: Readonly<Record<ColorScheme, ThemeTokens>> = {
  light: lightTokens,
  dark: darkTokens,
};

/**
 * 컴포넌트가 써도 되는 텍스트/배경 조합(설계서 §4.5 실측 쌍). 두 테마 모두 ≥ 4.5:1을 테스트가 강제한다(G-6 (a)).
 * textSecondary/surfaceMuted(원본 stone-500 on stone-100 = 4.40)처럼 미달인 조합은 등록하지 않고 쓰지도 않는다.
 */
export const CONTRAST_PAIRS: readonly (readonly [
  fg: ThemeTokenKey,
  bg: ThemeTokenKey,
])[] = [
  ["text", "background"],
  ["text", "surface"],
  ["text", "surfaceMuted"],
  ["textSecondary", "background"],
  ["textSecondary", "surface"],
  ["textPast", "surfaceMuted"],
  ["onPrimary", "primary"],
  ["onPrimarySoft", "primarySoft"],
  ["tabActive", "surface"],
  ["tabInactive", "surface"],
  ["chipText", "chipBackground"],
  ["badgeUpcomingText", "badgeUpcomingBackground"],
  ["badgeSoonText", "badgeSoonBackground"],
  ["badgePastText", "badgePastBackground"],
  ["badgeNationalText", "badgeNationalBackground"],
  ["badgeOptionalText", "badgeOptionalBackground"],
  ["badgeCompletedText", "badgeCompletedBackground"],
  // 완료 체크박스의 체크 표시(비텍스트지만 텍스트와 같은 4.5:1로 묶어 둔다, U-22)
  ["onCheckboxChecked", "checkboxChecked"],
  ["danger", "background"],
  ["danger", "surface"],
  ["dangerText", "dangerSurface"],
  ["onDanger", "danger"],
];

/** 상호작용 요소 최소 터치 영역(pt), PRD §7.2 G-6 (d) */
export const MIN_TOUCH_TARGET = 44;

/**
 * 앱 칼럼 최대 너비(pt·CSS px). iPad 기본 해상도(768×1024)의 세로 너비를 "모바일 최대 너비"로 본다(v1.8 U-31).
 * 데스크톱 웹·큰 iPad 가로 화면에서는 헤더·본문·하단 탭 바가 이 너비의 가운데 칼럼에 머물고 더 늘어나지 않는다
 */
export const MAX_CONTENT_WIDTH = 768;

/** 생년월일 피커·테마/언어 옵션의 최소 높이(pt), 설계서 §5.8 */
export const MIN_CONTROL_HEIGHT = 48;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;
