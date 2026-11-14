import type { Locale } from "@/types";

// 로케일 순수 모듈(설계서 §5.4). 기기 로케일은 expo-localization을 직접 읽지 않고 languageCode만 가진 목록으로 받는다.

export const LOCALES: readonly Locale[] = ["ko", "en", "ja", "zh"];
export const DEFAULT_LOCALE: Locale = "ko";

export type LocaleOption = {
  readonly code: Locale;
  readonly flag: string;
  readonly nativeName: string;
};

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "ko", flag: "🇰🇷", nativeName: "한국어" },
  { code: "en", flag: "🇺🇸", nativeName: "English" },
  { code: "ja", flag: "🇯🇵", nativeName: "日本語" },
  { code: "zh", flag: "🇨🇳", nativeName: "中文" },
];

/** expo-localization Locale의 부분 집합(languageCode만 사용, P-04) */
export type DeviceLocaleLike = { readonly languageCode: string | null };

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && LOCALES.some((locale) => locale === value)
  );
}

/** 기기 첫 로케일의 languageCode가 지원 언어면 그것, 아니면(미지원·null·빈 배열) ko */
export function detectLocale(devices: readonly DeviceLocaleLike[]): Locale {
  const code = devices[0]?.languageCode;
  return isLocale(code) ? code : DEFAULT_LOCALE;
}

/** 저장값이 유효하면 저장값, 아니면 기기 감지(AC-13.4). 감지값은 호출자가 저장하지 않는다(P-03) */
export function resolveInitialLocale(
  stored: string | null,
  devices: readonly DeviceLocaleLike[]
): Locale {
  return isLocale(stored) ? stored : detectLocale(devices);
}

const LANGUAGE_TAGS = {
  ko: "ko-KR",
  en: "en-US",
  ja: "ja-JP",
  zh: "zh-CN",
} as const satisfies Readonly<Record<Locale, string>>;

/** iOS DateTimePicker locale prop용 언어 태그 */
export function toLanguageTag(locale: Locale): (typeof LANGUAGE_TAGS)[Locale] {
  return LANGUAGE_TAGS[locale];
}
