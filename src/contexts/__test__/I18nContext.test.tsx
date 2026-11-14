import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { getLocales } from "expo-localization";
import type { Locale as DeviceLocale } from "expo-localization";
import type { ReactNode } from "react";

import { I18nProvider, useI18n } from "@/contexts/I18nContext";
import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { STORAGE_KEYS } from "@/lib/storage";
import type { LocalizedText } from "@/types";

import {
  deferStorage,
  flushMacrotask,
  seedStorage,
} from "../../../test-utils/render";

// R1-12: I18nProvider가 문서 언어 동기화 훅에 넘기는 값을 기록한다. 네이티브 구현처럼 아무것도 하지 않는 jest.fn이라
// 이 파일의 다른 테스트 동작은 같다(문서에 실제로 반영되는지는 src/hooks/__test__/useDocumentLanguage.test.tsx와 E2E가 본다).
jest.mock("@/hooks/useDocumentLanguage", () => ({
  useDocumentLanguage: jest.fn(),
}));

function Wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

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

/** Provider 안에서 useI18n을 렌더하고 하이드레이션(isReady)까지 기다린다 */
async function renderI18n() {
  const rendered = await renderHook(() => useI18n(), { wrapper: Wrapper });
  await waitFor(() => expect(rendered.result.current.isReady).toBe(true));
  return rendered;
}

// AC-13.4 (FR-09 · US-13) Context 경로: 저장값 → 기기 첫 로케일(getLocales mock) → ko. 감지값은 저장하지 않는다(setItem 0회, P-03).
describe("AC-13.4 I18nProvider 초기 로케일 — 저장값 → 기기 첫 로케일 → ko", () => {
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
    "AC-13.4 (저장값 %j, 기기 %s) → useI18n().locale === %j, setItem 0회, 저장값 그대로",
    async (stored, _devicesLabel, expected, devices) => {
      if (stored !== null) await seedStorage({ [STORAGE_KEYS.locale]: stored });
      mockDeviceLocales(devices);

      const { result } = await renderI18n();

      expect(result.current.locale).toBe(expected);
      await flushMacrotask();
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe(stored);
    }
  );
});

// AC-18.4 (US-18) 언어: 손상 저장값 'fr'는 useI18n().locale이 기기 감지 결과(mock ko-KR → 'ko')이고 덮어쓰지 않는다(setItem 0회).
describe("AC-18.4 I18nProvider 하이드레이션 — 손상 저장값", () => {
  it("AC-18.4 저장값 'fr' → useI18n().locale === 'ko'(기기 mock ko-KR), isReady === true, setItem 0회, 저장값 'fr' 그대로", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "fr" });

    const { result } = await renderI18n();

    expect(result.current.locale).toBe("ko");
    expect(result.current.isReady).toBe(true);
    expect(getLocales).toHaveBeenCalled();
    await flushMacrotask();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe("fr");
  });
});

// AC-12.3 (US-12) Context 경로: 저장된 로케일에서 t('schedule.soon')은 "곧 접종" / "Coming Soon" / "もうすぐ" / "即将接种"이다.
describe("AC-12.3 useI18n().t — 로케일별 schedule.soon", () => {
  it.each([
    ["ko", "곧 접종"],
    ["en", "Coming Soon"],
    ["ja", "もうすぐ"],
    ["zh", "即将接种"],
  ] as const)(
    "AC-12.3 저장값 %s → t('schedule.soon') === %s",
    async (locale, expected) => {
      await seedStorage({ [STORAGE_KEYS.locale]: locale });

      const { result } = await renderI18n();

      expect(result.current.locale).toBe(locale);
      expect(result.current.t("schedule.soon")).toBe(expected);
    }
  );
});

const BCG_NAME: LocalizedText = {
  ko: "BCG(피내용)",
  en: "BCG (Intradermal)",
  ja: "BCG（皮内用）",
  zh: "卡介苗(皮内注射)",
};

// 지원(설계서 §5.7·§6.1·§6.3): isReady, setLocale 영속화(vaccination-app-locale), t·lt, 기기 로케일 1회 읽기, 참조 안정, Provider 밖 사용 금지.
describe("G-5 I18nContext 상태 — setLocale·t·lt·하이드레이션", () => {
  it("G-5 읽기 전에는 isReady=false이고 locale은 기기 감지값이다; 저장값이 도착하면 저장값으로 바뀐다", async () => {
    const storage = deferStorage([STORAGE_KEYS.locale]);
    mockDeviceLocales([EN_US]);

    const { result } = await renderHook(() => useI18n(), { wrapper: Wrapper });

    expect(result.current.isReady).toBe(false);
    expect(result.current.locale).toBe("en");

    await storage.resolve(STORAGE_KEYS.locale, "ja");

    expect(result.current.isReady).toBe(true);
    expect(result.current.locale).toBe("ja");
    expect(result.current.t("common.settings")).toBe("設定");
  });

  it("G-5 setLocale('en')은 locale·t를 즉시 바꾸고 vaccination-app-locale에 원시 문자열 'en'을 저장한다(setItem 1회)", async () => {
    const { result } = await renderI18n();
    expect(result.current.locale).toBe("ko");
    expect(result.current.t("common.settings")).toBe("설정");

    await act(async () => {
      result.current.setLocale("en");
    });

    expect(result.current.locale).toBe("en");
    expect(result.current.t("common.settings")).toBe("Settings");
    await flushMacrotask();
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "vaccination-app-locale",
      "en"
    );
    expect(await AsyncStorage.getItem("vaccination-app-locale")).toBe("en");
  });

  it("G-5 lt(LocalizedText)는 현재 로케일의 텍스트를 고른다(ko → zh 전환 반영)", async () => {
    const { result } = await renderI18n();

    expect(result.current.lt(BCG_NAME)).toBe("BCG(피내용)");

    await act(async () => {
      result.current.setLocale("zh");
    });

    expect(result.current.lt(BCG_NAME)).toBe("卡介苗(皮内注射)");
  });

  it("G-5 기기 로케일은 마운트 시 1회만 읽는다(getLocales 1회, 재렌더·setLocale 뒤에도 그대로)", async () => {
    const { result, rerender } = await renderI18n();

    await rerender(undefined);
    await act(async () => {
      result.current.setLocale("ja");
    });

    expect(result.current.locale).toBe("ja");
    expect(getLocales).toHaveBeenCalledTimes(1);
  });

  it("G-5 Context 값은 상태가 바뀌지 않으면 같은 참조이고 setLocale은 안정적이다(t·lt는 locale이 바뀔 때만 바뀐다)", async () => {
    const { result, rerender } = await renderI18n();
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
    expect(result.current.setLocale).toBe(first.setLocale);
    expect(result.current.t).toBe(first.t);
    expect(result.current.lt).toBe(first.lt);

    await act(async () => {
      result.current.setLocale("en");
    });

    expect(result.current.setLocale).toBe(first.setLocale);
    expect(result.current.t).not.toBe(first.t);
    expect(result.current.lt).not.toBe(first.lt);
  });

  it("G-5 useI18n을 I18nProvider 밖에서 쓰면 throw한다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(renderHook(() => useI18n())).rejects.toThrow(/I18nProvider/);
  });
});

// R1-12 (리뷰 라운드 1): 하이드레이션 전의 locale은 기기 감지값이다. 그때 문서 언어(<html lang>·제목)를 바꾸면 저장 언어가
// 다를 때 기기 언어 → 저장 언어로 두 번 바뀌며 깜빡인다. 그래서 isReady 전에는 null(문서를 건드리지 않음)을 넘긴다.
describe("R1-12 문서 언어 동기화는 하이드레이션 뒤에만", () => {
  /** 렌더마다 I18nProvider가 useDocumentLanguage에 넘긴 값(순서대로) */
  const syncedLocales = () =>
    jest.mocked(useDocumentLanguage).mock.calls.map(([locale]) => locale);

  beforeEach(() => {
    jest.mocked(useDocumentLanguage).mockClear();
  });

  it("R1-12 기기 en-US·저장값 ja를 읽는 동안에는 null만 넘기고, 읽은 뒤 ja를 넘긴다(기기 언어 en은 한 번도 넘기지 않는다)", async () => {
    const storage = deferStorage([STORAGE_KEYS.locale]);
    mockDeviceLocales([EN_US]);

    const { result } = await renderHook(() => useI18n(), { wrapper: Wrapper });

    expect(result.current.isReady).toBe(false);
    expect(result.current.locale).toBe("en");
    expect(syncedLocales().length).toBeGreaterThan(0);
    expect(new Set(syncedLocales())).toEqual(new Set([null]));

    await storage.resolve(STORAGE_KEYS.locale, "ja");

    expect(result.current.isReady).toBe(true);
    expect(syncedLocales().at(-1)).toBe("ja");
    expect(syncedLocales()).not.toContain("en");
  });

  it("R1-12 저장값이 없으면 하이드레이션 뒤 기기 언어(en)를 넘긴다", async () => {
    mockDeviceLocales([EN_US]);

    await renderI18n();

    expect(syncedLocales().at(-1)).toBe("en");
  });
});
