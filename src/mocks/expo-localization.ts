import type { Locale } from "expo-localization";

// 수동 mock(U-09: src/mocks/에 두고 jest.setup.ts의 jest.mock이 모든 테스트에 연결, 설계서 §9.3). 패키지 자체 mock(en-US)을 덮어써 기기 로케일 기본값을 ko-KR로 둔다(AC-18.2 전제).
// 테스트별 변경: jest.mocked(getLocales).mockReturnValue([...]). 다음 테스트 전에 jest.setup.ts가 기본 구현을 복원한다.
const KO_KR: Locale = {
  languageTag: "ko-KR",
  languageCode: "ko",
  languageScriptCode: null,
  regionCode: "KR",
  languageRegionCode: "KR",
  currencyCode: "KRW",
  currencySymbol: "₩",
  languageCurrencyCode: "KRW",
  languageCurrencySymbol: "₩",
  decimalSeparator: ".",
  digitGroupingSeparator: ",",
  textDirection: "ltr",
  measurementSystem: "metric",
  temperatureUnit: "celsius",
};

export const getLocales = jest.fn((): [Locale, ...Locale[]] => [KO_KR]);
export const useLocales = jest.fn((): [Locale, ...Locale[]] => [KO_KR]);
