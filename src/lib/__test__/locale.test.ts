import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import type { Locale as DeviceLocale } from "expo-localization";

import {
  DEFAULT_LOCALE,
  detectLocale,
  isLocale,
  LOCALE_OPTIONS,
  LOCALES,
  resolveInitialLocale,
  toLanguageTag,
} from "@/lib/locale";

/** expo-localization Locale 전체 필드를 채운 기기 로케일(설계서 §9.3의 KO_KR과 같은 형태) */
function deviceLocale(
  languageTag: string,
  languageCode: string | null,
  regionCode: string | null
): DeviceLocale {
  return {
    languageTag,
    languageCode,
    languageScriptCode: null,
    regionCode,
    languageRegionCode: regionCode,
    currencyCode: null,
    currencySymbol: null,
    languageCurrencyCode: null,
    languageCurrencySymbol: null,
    decimalSeparator: ".",
    digitGroupingSeparator: ",",
    textDirection: "ltr",
    measurementSystem: "metric",
    temperatureUnit: "celsius",
  };
}

const EN_US = deviceLocale("en-US", "en", "US");
const ZH_TW = deviceLocale("zh-TW", "zh", "TW");
const FR_FR = deviceLocale("fr-FR", "fr", "FR");
const NO_LANGUAGE = deviceLocale("und", null, null);

/** 네이티브 경로: expo-localization.getLocales mock이 이 목록을 돌려준다(비어 있지 않은 튜플 타입이라 단언) */
function mockDeviceLocales(list: DeviceLocale[]): void {
  jest
    .mocked(getLocales)
    .mockReturnValue(list as [DeviceLocale, ...DeviceLocale[]]);
}

// AC-13.4 (FR-09 · US-13): 저장값 → 기기 첫 로케일 → ko. 감지값은 저장하지 않는다(P-03).
describe("AC-13.4 초기 로케일 결정 resolveInitialLocale", () => {
  // [저장값, 기기 로케일 설명, 기대 로케일, 기기 로케일 목록]
  const cases: readonly (readonly [
    string | null,
    string,
    string,
    DeviceLocale[],
  ])[] = [
    [null, "[en-US]", "en", [EN_US]],
    [null, "[zh-TW(languageCode zh)]", "zh", [ZH_TW]],
    [null, "[fr-FR]", "ko", [FR_FR]],
    [null, "[fr-FR, en-US](첫 로케일만 사용, P-04)", "ko", [FR_FR, EN_US]],
    [null, "[]", "ko", []],
    [null, "[languageCode null]", "ko", [NO_LANGUAGE]],
    ["ja", "[en-US]", "ja", [EN_US]],
    ["fr", "[en-US](무효 저장값)", "en", [EN_US]],
  ];

  it.each(cases)(
    "AC-13.4 (저장값 %j, 기기 %s) → %s",
    (stored, _devicesLabel, expected, devices) => {
      mockDeviceLocales(devices);

      expect(resolveInitialLocale(stored, getLocales())).toBe(expected);
    }
  );

  it("AC-13.4 감지 경로에서는 AsyncStorage.setItem이 0회 호출된다", () => {
    mockDeviceLocales([EN_US]);

    expect(resolveInitialLocale(null, getLocales())).toBe("en");
    expect(resolveInitialLocale("fr", getLocales())).toBe("en");
    expect(detectLocale(getLocales())).toBe("en");
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(0);
  });
});

// 지원(G-5 · 설계서 §5.4): 가드·상수·언어 태그
describe("G-5 locale 가드와 상수", () => {
  it("G-5 LOCALES는 ko, en, ja, zh 순서이고 DEFAULT_LOCALE은 ko다", () => {
    expect(LOCALES).toEqual(["ko", "en", "ja", "zh"]);
    expect(DEFAULT_LOCALE).toBe("ko");
  });

  it.each(["ko", "en", "ja", "zh"])("G-5 isLocale(%j) → true", (value) => {
    expect(isLocale(value)).toBe(true);
  });

  it.each(["fr", "", null, undefined, 1, {}])(
    "G-5 isLocale(%j) → false",
    (value) => {
      expect(isLocale(value)).toBe(false);
    }
  );

  it("G-5 LOCALE_OPTIONS는 국기·자국어명을 가진 4개 옵션이다(LanguageSelector용)", () => {
    expect(LOCALE_OPTIONS).toEqual([
      { code: "ko", flag: "🇰🇷", nativeName: "한국어" },
      { code: "en", flag: "🇺🇸", nativeName: "English" },
      { code: "ja", flag: "🇯🇵", nativeName: "日本語" },
      { code: "zh", flag: "🇨🇳", nativeName: "中文" },
    ]);
  });

  it.each([
    ["ko", "ko-KR"],
    ["en", "en-US"],
    ["ja", "ja-JP"],
    ["zh", "zh-CN"],
  ] as const)("G-5 toLanguageTag(%s) → %s(iOS 피커 locale)", (locale, tag) => {
    expect(toLanguageTag(locale)).toBe(tag);
  });
});
