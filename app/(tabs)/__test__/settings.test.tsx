import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import * as ReactNative from "react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { STORAGE_KEYS, type StorageKey } from "@/lib/storage";
import { darkTokens, lightTokens } from "@/theme/tokens";

import {
  fireLayout,
  flushRouterMacrotask,
  getTabButtons,
  hostWithProps,
  mockSystemScheme,
  openSettings,
  renderApp,
  restoreDefaultImplementationAfterEach,
  seedStorage,
  sharedHostFocus,
  TAB_NAMES_KO,
} from "../../../test-utils/render";

// 설정 화면(FR-08 테마, FR-09 언어, FR-10 아기 정보·초기화, FR-12 면책, 영속화 공통) 화면 수준 테스트.
// TDD 판정: AC-14.5, AC-18.3(화면). 거울([unit], 공식 판정 미사용): AC-11.1~11.4, 12.1, 14.1, 14.2, 14.4, 16.2(P10),
// 홈·일정 화면을 함께 관찰하는 AC-14.3·16.3(P11).
// renderApp은 실제 app/ 디렉터리를 renderRouter로 로드하므로 루트 레이아웃·LoadingGate·탭이 모두 포함된다(설계서 §9.5).
// 설정 화면 요소는 screen-settings 범위(within)에서 찾고, 하단 탭은 role button + 이름으로 전역 조회한다(P7 메모).

const THEME_NAMES_KO = ["시스템", "라이트", "다크"] as const;
const LOCALE_NAMES = ["한국어", "English", "日本語", "中文"] as const;
const TAB_NAMES_EN = ["Home", "Schedule", "Settings"] as const;
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
const DISCLAIMER_EN =
  "This information is for reference only. Please consult a pediatrician for accurate medical advice.";
const EMPTY_SCHEDULE_KO = "생년월일을 먼저 입력해주세요";
const RESET_CONFIRM_KO = "아기 생년월일 정보를 삭제할까요?";
/** 원본 웹앱의 "전체 초기화" 확인 문구 — 동작(생년월일만 삭제)과 맞지 않아 U-06에서 교체했다 */
const LEGACY_RESET_CONFIRM_KO = "모든 데이터를 초기화하시겠습니까?";

// jest 프리셋의 useColorScheme은 jest.fn(() => 'light')라 mockSystemScheme의 반환값 설정이
// restoreAllMocks로 되돌아가지 않는다. 기본 구현을 테스트마다 복원한다(P5 ThemeContext.test.tsx 패턴).
restoreDefaultImplementationAfterEach(jest.mocked(ReactNative.useColorScheme));

/** AsyncStorage mock 메서드의 호출 기록 중 첫 인자(저장 키)가 key인 호출 수 */
function countKeyCalls(
  calls: readonly (readonly unknown[])[],
  key: StorageKey
): number {
  return calls.filter((args) => args[0] === key).length;
}

describe("AC-11.1 [unit] 테마 옵션 초기 상태(라이트 OS, 저장값 없음)", () => {
  it("AC-11.1 [unit] /settings에 진입하면 테마 옵션 3개(시스템·라이트·다크)가 role radio이고 theme-option-system만 checked이며 screen-settings 배경은 라이트 background 토큰이다", async () => {
    mockSystemScheme("light");
    const { settings, container } = await openSettings();

    const radios = settings.getAllByRole("radio", {
      name: /^(시스템|라이트|다크)$/,
    });
    expect(radios).toHaveLength(3);
    THEME_NAMES_KO.forEach((name, index) => {
      expect(radios[index]).toHaveAccessibleName(name);
    });
    expect(settings.getByRole("radio", { name: "시스템" })).toBeChecked();
    expect(settings.getByRole("radio", { name: "라이트" })).not.toBeChecked();
    expect(settings.getByRole("radio", { name: "다크" })).not.toBeChecked();
    expect(settings.getByTestId("theme-option-system")).toBeChecked();
    expect(settings.getByTestId("theme-option-light")).not.toBeChecked();
    expect(settings.getByTestId("theme-option-dark")).not.toBeChecked();
    // role="radiogroup" 컨테이너는 네이티브에서 접근성 요소가 아니라(accessible 미지정) RNTL role 조회 대상이 아니다 — 웹 DOM role은 E2E가 본다
    expect(container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
  });
});

describe("AC-11.2 [unit] 다크 OS 초기 상태(저장값 없음)", () => {
  it("AC-11.2 [unit] 다크 OS·저장값 없음으로 /settings에 진입하면 theme-option-system이 checked이고 screen-settings 배경은 다크 background 토큰이다", async () => {
    mockSystemScheme("dark");
    const { settings, container } = await openSettings();

    expect(settings.getByRole("radio", { name: "시스템" })).toBeChecked();
    expect(settings.getByTestId("theme-option-system")).toBeChecked();
    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });
  });
});

describe("AC-11.3 [unit] 다크 OS에서 라이트 고정과 유지", () => {
  it("AC-11.3 [unit] 다크 OS에서 '라이트'를 누르면 배경이 라이트 background, 저장값 'light', theme-option-light checked이고, 다시 렌더(새로고침)해도 유지된다", async () => {
    mockSystemScheme("dark");
    const first = await openSettings();
    expect(first.container).toHaveStyle({
      backgroundColor: darkTokens.background,
    });

    await fireEvent.press(
      first.settings.getByRole("radio", { name: "라이트" })
    );

    expect(first.container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    expect(first.settings.getByRole("radio", { name: "라이트" })).toBeChecked();
    expect(first.settings.getByTestId("theme-option-light")).toBeChecked();
    expect(first.settings.getByTestId("theme-option-system")).not.toBeChecked();
    await flushRouterMacrotask();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.theme,
      "light"
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("light");

    // 새로고침: 언마운트 뒤 같은 저장소로 다시 렌더한다
    await first.app.unmount();
    const second = await openSettings();

    expect(second.container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    expect(
      second.settings.getByRole("radio", { name: "라이트" })
    ).toBeChecked();
    expect(second.settings.getByTestId("theme-option-light")).toBeChecked();
  });
});

describe("AC-11.4 [unit] 다크 고정 뒤 시스템 복귀", () => {
  it("AC-11.4 [unit] 라이트 OS에서 '다크'를 누르면 배경이 다크 background·저장값 'dark'이고, 이어서 '시스템'을 누르면 배경이 라이트 background·저장값 'system'·theme-option-system checked다", async () => {
    mockSystemScheme("light");
    const { settings, container } = await openSettings();

    await fireEvent.press(settings.getByRole("radio", { name: "다크" }));

    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });
    expect(settings.getByTestId("theme-option-dark")).toBeChecked();
    await flushRouterMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");

    await fireEvent.press(settings.getByRole("radio", { name: "시스템" }));

    expect(container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    expect(settings.getByTestId("theme-option-system")).toBeChecked();
    expect(settings.getByTestId("theme-option-dark")).not.toBeChecked();
    await flushRouterMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("system");
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEYS.theme,
      "system"
    );
  });
});

describe("AC-12.1 [unit] 언어 옵션과 English 전환", () => {
  it("AC-12.1 [unit] 언어 옵션 4개(한국어·English·日本語·中文)가 radio이고 locale-option-ko만 checked이며, 'English'를 누르면 탭 라벨 Home·Schedule·Settings, 제목 'Settings', 저장값 'en', locale-option-en checked이고 다시 렌더해도 영어 탭이다", async () => {
    const first = await openSettings();

    const radios = first.settings.getAllByRole("radio", {
      name: /^(한국어|English|日本語|中文)$/,
    });
    expect(radios).toHaveLength(4);
    LOCALE_NAMES.forEach((name, index) => {
      expect(radios[index]).toHaveAccessibleName(name);
    });
    expect(first.settings.getByRole("radio", { name: "한국어" })).toBeChecked();
    expect(first.settings.getByTestId("locale-option-ko")).toBeChecked();
    for (const code of ["en", "ja", "zh"]) {
      expect(
        first.settings.getByTestId(`locale-option-${code}`)
      ).not.toBeChecked();
    }
    expect(getTabButtons(TAB_NAMES_KO)).toHaveLength(3);
    expect(
      first.settings.getByRole("heading", { name: "설정" })
    ).toBeOnTheScreen();

    await fireEvent.press(
      first.settings.getByRole("radio", { name: "English" })
    );

    const tabs = getTabButtons(TAB_NAMES_EN);
    expect(tabs).toHaveLength(3);
    TAB_NAMES_EN.forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
    expect(
      first.settings.getByRole("heading", { name: "Settings" })
    ).toBeOnTheScreen();
    expect(
      first.settings.getByRole("radio", { name: "English" })
    ).toBeChecked();
    expect(first.settings.getByTestId("locale-option-en")).toBeChecked();
    expect(first.settings.getByTestId("locale-option-ko")).not.toBeChecked();
    await flushRouterMacrotask();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.locale,
      "en"
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe("en");

    // 새로고침: 언마운트 뒤 같은 저장소로 다시 렌더한다
    await first.app.unmount();
    const second = await openSettings();

    const reloadedTabs = getTabButtons(TAB_NAMES_EN);
    expect(reloadedTabs).toHaveLength(3);
    expect(
      second.settings.getByRole("heading", { name: "Settings" })
    ).toBeOnTheScreen();
    expect(second.settings.getByTestId("locale-option-en")).toBeChecked();
  });
});

describe("AC-14.1 [unit] 설정 생년월일 표시", () => {
  it("AC-14.1 [unit] (a) 저장값 생년월일 '2024-01-31'로 /settings에 진입하면 settings-birthdate 텍스트가 '생년월일: 2024-01-31'이다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();

    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: 2024-01-31$/
    );
  });

  it("AC-14.1 [unit] (b) 저장값이 없으면 settings-birthdate 텍스트가 '생년월일: -'다", async () => {
    const { settings } = await openSettings();

    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: -$/
    );
  });
});

describe("AC-14.2 [unit] 초기화 확인 UI와 취소", () => {
  it("AC-14.2 [unit] 저장값 생년월일 '2024-01-31'에서 '생년월일 삭제'(reset-button)를 누르면 확인 문구와 '확인'(reset-confirm)·'취소'(reset-cancel) 버튼이 보이고 원본 문구는 0개이며, '취소'를 누르면 확인 UI가 0개가 되고 생년월일 표시·저장값 '2024-01-31'이 유지된다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();
    const resetButton = settings.getByRole("button", { name: "생년월일 삭제" });
    expect(resetButton).toBe(settings.getByTestId("reset-button"));
    expect(settings.queryByText(RESET_CONFIRM_KO)).toBeNull();

    await fireEvent.press(resetButton);

    expect(settings.getByText(RESET_CONFIRM_KO)).toBeOnTheScreen();
    expect(
      settings.queryAllByText(LEGACY_RESET_CONFIRM_KO, { exact: false })
    ).toHaveLength(0);
    const confirm = settings.getByRole("button", { name: "확인" });
    const cancel = settings.getByRole("button", { name: "취소" });
    expect(confirm).toBe(settings.getByTestId("reset-confirm"));
    expect(cancel).toBe(settings.getByTestId("reset-cancel"));

    await fireEvent.press(cancel);

    expect(settings.queryByTestId("reset-confirm")).toBeNull();
    expect(settings.queryByTestId("reset-cancel")).toBeNull();
    expect(settings.queryByText(RESET_CONFIRM_KO)).toBeNull();
    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: 2024-01-31$/
    );
    await flushRouterMacrotask();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(
      "2024-01-31"
    );
  });
});

describe("AC-14.3 [unit] 생년월일만 삭제(테마·언어 유지)와 홈·일정 반영", () => {
  it("AC-14.3 [unit] 라이트 OS에서 저장값 생년월일 '2024-01-31'·theme 'dark'·locale 'ko'로 '생년월일 삭제'→'확인'을 누르면 settings-birthdate가 '생년월일: -', 저장값 생년월일 null·theme 'dark'·locale 'ko', 배경은 다크 background로 유지되고 홈 탭의 existing-birthdate-shortcut 0개, 일정 탭은 '생년월일을 먼저 입력해주세요'다", async () => {
    mockSystemScheme("light");
    await seedStorage({
      [STORAGE_KEYS.birthdate]: "2024-01-31",
      [STORAGE_KEYS.theme]: "dark",
      [STORAGE_KEYS.locale]: "ko",
    });
    const { settings, container } = await openSettings();
    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });
    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: 2024-01-31$/
    );

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: -$/
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe("ko");
    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });

    await fireEvent.press(screen.getByRole("button", { name: "홈" }));
    expect(screen).toHavePathname("/");
    const home = within(await screen.findByTestId("screen-home"));
    // 홈이 완전히 렌더된 뒤(제출 버튼 표시) 숨김 요소까지 포함해 0개를 판정한다
    expect(home.getByTestId("birthdate-submit")).toBeOnTheScreen();
    expect(
      screen.queryAllByTestId("existing-birthdate-shortcut", {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);

    await fireEvent.press(screen.getByRole("button", { name: "접종 일정" }));
    expect(screen).toHavePathname("/schedule");
    const schedule = within(await screen.findByTestId("screen-schedule"));
    expect(schedule.getByText(EMPTY_SCHEDULE_KO)).toBeOnTheScreen();
  });
});

describe("AC-14.4 [unit] 저장값 없이 삭제 확인", () => {
  it("AC-14.4 [unit] 저장값 없이 '생년월일 삭제'→'확인'을 눌러도 settings-birthdate는 '생년월일: -'로 유지되고 확인 UI 0개, screen-settings가 계속 보이며 console.error가 0회다", async () => {
    const { settings } = await openSettings();
    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: -$/
    );
    // E2E의 pageerror·console error 기록에 대응: 누르기 직전부터 console.error를 기록한다(처리되지 않은 예외는 press가 throw해 테스트가 실패한다)
    const consoleError = jest.spyOn(console, "error");

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: -$/
    );
    expect(settings.queryByTestId("reset-confirm")).toBeNull();
    expect(settings.queryByTestId("reset-cancel")).toBeNull();
    expect(screen.getByTestId("screen-settings")).toBeOnTheScreen();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC-14.5 초기화는 앱 내 확인 후 생년월일만 삭제", () => {
  it("AC-14.5 저장값 생년월일 '2024-01-31'에서 초기화→확인을 수행하면 Alert.alert 0회, AsyncStorage.removeItem('vaccination-app-birthdate') 1회이고 locale·theme 키의 removeItem·setItem은 0회다", async () => {
    const alert = jest
      .spyOn(ReactNative.Alert, "alert")
      .mockImplementation(() => {});
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(alert).not.toHaveBeenCalled();
    const removeCalls = jest.mocked(AsyncStorage.removeItem).mock.calls;
    const setCalls = jest.mocked(AsyncStorage.setItem).mock.calls;
    expect(countKeyCalls(removeCalls, STORAGE_KEYS.birthdate)).toBe(1);
    for (const key of [STORAGE_KEYS.locale, STORAGE_KEYS.theme]) {
      expect(countKeyCalls(removeCalls, key)).toBe(0);
      expect(countKeyCalls(setCalls, key)).toBe(0);
    }
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
  });
});

describe("AC-16.2 [unit] 설정 화면 면책 문구", () => {
  it("AC-16.2 [unit] /settings에 진입하면 disclaimer가 1개이고 텍스트가 한국어 면책 문구다", async () => {
    const { settings } = await openSettings();

    const disclaimers = settings.getAllByTestId("disclaimer");
    expect(disclaimers).toHaveLength(1);
    expect(disclaimers[0]).toHaveTextContent(DISCLAIMER_KO);
  });
});

describe("AC-16.3 [unit] 영어 로케일의 일정·설정 면책 문구", () => {
  it("AC-16.3 [unit] 저장값 locale 'en'·생년월일 '2026-04-30'이면 일정 화면과 설정 화면의 disclaimer 텍스트가 모두 영어 면책 문구다", async () => {
    await seedStorage({
      [STORAGE_KEYS.locale]: "en",
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    await renderApp({ initialUrl: "/schedule" });
    const schedule = within(await screen.findByTestId("screen-schedule"));
    const scheduleDisclaimers = schedule.getAllByTestId("disclaimer");
    expect(scheduleDisclaimers).toHaveLength(1);
    expect(scheduleDisclaimers[0]).toHaveTextContent(DISCLAIMER_EN);

    await fireEvent.press(screen.getByRole("button", { name: "Settings" }));
    expect(screen).toHavePathname("/settings");
    const settings = within(await screen.findByTestId("screen-settings"));
    const settingsDisclaimers = settings.getAllByTestId("disclaimer");
    expect(settingsDisclaimers).toHaveLength(1);
    expect(settingsDisclaimers[0]).toHaveTextContent(DISCLAIMER_EN);
  });
});

// AC-18.3 화면 수준 판정(설계서 §9.9). 훅 수준 지원 테스트는 src/hooks/__test__/usePersistentState.test.tsx(P4).
// Jest 30은 테스트 중 처리되지 않은 Promise rejection이 생기면 그 테스트를 실패시키므로 "실패 없이 끝남"이 reject 미전파의 관찰 수단이다.
describe("AC-18.3 저장 실패에도 언어 전환 유지(화면)", () => {
  it("AC-18.3 setItem이 항상 reject하는 상태에서 'English'를 누르고 act·매크로태스크 1회(setTimeout 0)를 기다리면 제목이 'Settings'이고 console.error 0회, 인자에 'vaccination-app-locale'이 있는 console.warn이 1회 이상이며 테스트가 실패 없이 끝난다", async () => {
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValue(new Error("setItem always fails"));
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = jest
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const { settings } = await openSettings();

    await fireEvent.press(settings.getByRole("radio", { name: "English" }));
    await flushRouterMacrotask();

    expect(
      settings.getByRole("heading", { name: "Settings" })
    ).toBeOnTheScreen();
    expect(consoleError).not.toHaveBeenCalled();
    const localeWarnings = consoleWarn.mock.calls.filter((args) =>
      args.includes(STORAGE_KEYS.locale)
    );
    expect(localeWarnings.length).toBeGreaterThanOrEqual(1);
  });
});

// G-6 (c)(PRD §7.2): 표의 RNTL role 행 요소를 하나씩 getByRole(role, { name })으로 조회한다. 언어 옵션은 AC-12.1 거울이
// 정규식 묶음(getAllByRole)으로만 찾던 日本語·中文도 이름 그대로 찾고, 상태 열(checked)도 같은 조회로 확인한다(P12 보강).
describe("G-6 (c) 언어 옵션 role·접근 이름 조회", () => {
  it("G-6 (c) 언어 옵션 4개를 getByRole('radio', { name })으로 각각 찾으면 locale-option-{ko|en|ja|zh} 요소이고 한국어만 checked이며, '中文'을 누르면 中文만 checked다", async () => {
    const { settings } = await openSettings();

    expect(settings.getByRole("radio", { name: "한국어" })).toBe(
      settings.getByTestId("locale-option-ko")
    );
    expect(settings.getByRole("radio", { name: "English" })).toBe(
      settings.getByTestId("locale-option-en")
    );
    expect(settings.getByRole("radio", { name: "日本語" })).toBe(
      settings.getByTestId("locale-option-ja")
    );
    expect(settings.getByRole("radio", { name: "中文" })).toBe(
      settings.getByTestId("locale-option-zh")
    );
    expect(settings.getByRole("radio", { name: "한국어" })).toBeChecked();
    expect(settings.getByRole("radio", { name: "日本語" })).not.toBeChecked();
    expect(settings.getByRole("radio", { name: "中文" })).not.toBeChecked();

    await fireEvent.press(settings.getByRole("radio", { name: "中文" }));
    await flushRouterMacrotask();

    expect(settings.getByRole("radio", { name: "中文" })).toBeChecked();
    expect(settings.getByRole("radio", { name: "日本語" })).not.toBeChecked();
    expect(settings.getByRole("radio", { name: "한국어" })).not.toBeChecked();
  });
});

// ---------------------------------------------------------------------------
// 리뷰 라운드 1 회귀 테스트(그룹 B). 제목은 리뷰 ID(R1-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// 포커스 탐침 헬퍼(hostWithProps·sharedHostFocus)는 test-utils에 있다. R1-04 roving 훅 테스트 8건은
// 대상 훅 옆 src/hooks/__test__/useRovingFocus.test.tsx로 옮겼다(리뷰 R2-04, U-08).
// ---------------------------------------------------------------------------

// R1-03: 초기화 확인 단계를 열고 닫을 때 포커스가 사라지지 않고(웹에서 body로 떨어지지 않음) 확인 문구가 보조기기에 전달된다.
// 확인 상자는 확인 문구로 이름 붙은 role="group"이다. 열면 네이티브는 화면 낭독기 포커스(sendAccessibilityEvent 'focus')를
// 확인 문구로, 웹은 DOM 포커스를 확인 상자(tabIndex -1)로 옮기고, 닫으면(취소·확인) 둘 다 reset-button으로 돌려준다.
// V-01(Android 에뮬레이터 실측): 대상은 그 커밋에서 새로 마운트되는데, 커밋 직후(effect)에 보낸 포커스 이벤트는 네이티브 뷰가
// 붙기 전에 실행돼 버려졌다(RN "Unable to find viewState … for sendAccessibilityEvent"). 그래서 네이티브는 대상의 onLayout
// (네이티브 마운트·배치 뒤)에서 1회만 옮긴다. 테스트는 fireLayout으로 그 시점을 연다. 웹은 DOM이 커밋과 함께 붙으므로 그대로 둔다.
// 실제 브라우저의 document.activeElement는 e2e/review-r1-a11y.spec.ts가 본다.
describe("R1-03 초기화 확인 단계의 포커스 이동과 확인 문구 고지", () => {
  it("R1-03·V-01 '생년월일 삭제'를 누르면 확인 상자가 확인 문구(nativeID)로 이름 붙은 role group이고, 화면 낭독기 포커스는 확인 문구가 배치된 뒤(onLayout) 그리로 가며, '취소'·'확인' 뒤에는 reset-button이 배치된 뒤 돌아온다(첫 렌더·재배치에서는 옮기지 않음)", async () => {
    const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    sendEvent.mockClear();
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();
    await fireLayout(settings.getByTestId("reset-button"));
    expect(sendEvent).not.toHaveBeenCalled();

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );

    const question = settings.getByText(RESET_CONFIRM_KO);
    const questionId: unknown = question.props.nativeID;
    expect(typeof questionId).toBe("string");
    const box = question.parent;
    expect(box).not.toBeNull();
    expect(box).toHaveProp("role", "group");
    expect(box).toHaveProp("aria-labelledby", questionId);
    expect(box).toHaveAccessibleName(RESET_CONFIRM_KO);
    // 커밋 직후에는 확인 문구의 네이티브 뷰가 아직 없으므로 보내지 않는다(V-01)
    expect(sendEvent).not.toHaveBeenCalled();

    await fireLayout(question);
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(sendEvent).toHaveBeenLastCalledWith(
      hostWithProps({ nativeID: questionId }),
      "focus"
    );
    // 회전·글자 크기 변경 같은 재배치에서는 다시 옮기지 않는다
    await fireLayout(question);
    expect(sendEvent).toHaveBeenCalledTimes(1);

    await fireEvent.press(settings.getByRole("button", { name: "취소" }));
    expect(sendEvent).toHaveBeenCalledTimes(1);
    await fireLayout(settings.getByTestId("reset-button"));

    expect(sendEvent).toHaveBeenCalledTimes(2);
    expect(sendEvent).toHaveBeenLastCalledWith(
      hostWithProps({ testID: "reset-button" }),
      "focus"
    );

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );
    await fireLayout(settings.getByText(RESET_CONFIRM_KO));
    expect(sendEvent).toHaveBeenCalledTimes(3);
    expect(sendEvent).toHaveBeenLastCalledWith(
      hostWithProps({ nativeID: questionId }),
      "focus"
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(settings.getByTestId("settings-birthdate")).toHaveTextContent(
      /^생년월일: -$/
    );
    expect(sendEvent).toHaveBeenCalledTimes(3);
    await fireLayout(settings.getByTestId("reset-button"));
    expect(sendEvent).toHaveBeenCalledTimes(4);
    expect(sendEvent).toHaveBeenLastCalledWith(
      hostWithProps({ testID: "reset-button" }),
      "focus"
    );
  });

  it("R1-03 웹 분기(Platform.OS 'web')에서는 열 때 확인 상자(role group, tabIndex -1)에, 닫을 때 reset-button에 DOM 포커스(focus())를 커밋 직후 1회 주고, 이어지는 배치(onLayout)로는 다시 옮기지 않으며 화면 낭독기 이벤트는 보내지 않는다", async () => {
    const focus = await sharedHostFocus();
    const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    sendEvent.mockClear();
    const { settings } = await openSettings();
    // 플랫폼은 포커스를 옮기는 시점에 읽으므로 첫 렌더 뒤에 바꿔 웹 분기를 검증한다(설계서 §7.1의 replaceProperty 방식)
    jest.replaceProperty(Platform, "OS", "web");

    await fireEvent.press(
      settings.getByRole("button", { name: "생년월일 삭제" })
    );

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toEqual(
      hostWithProps({ role: "group", tabIndex: -1 })
    );
    await fireLayout(settings.getByText(RESET_CONFIRM_KO));
    expect(focus).toHaveBeenCalledTimes(1);

    await fireEvent.press(settings.getByRole("button", { name: "취소" }));

    expect(focus).toHaveBeenCalledTimes(2);
    expect(focus.mock.contexts[1]).toEqual(
      hostWithProps({ testID: "reset-button" })
    );
    await fireLayout(settings.getByTestId("reset-button"));
    expect(focus).toHaveBeenCalledTimes(2);
    expect(sendEvent).not.toHaveBeenCalled();
  });
});

// R1-09: 설정 섹션 제목(테마·언어·아기 정보)은 role heading + aria-level 2다(RNW <h2>). 화면 제목만 level 1(<h1>)이다.
describe("R1-09 설정 섹션 제목 heading", () => {
  it("R1-09 섹션 제목 테마·언어·아기 정보는 role heading + aria-level 2이고, 화면 제목 '설정'은 aria-level 없는(웹 h1) heading이며 heading은 모두 4개다", async () => {
    const { settings } = await openSettings();

    for (const name of ["테마", "언어", "아기 정보"]) {
      expect(settings.getByRole("heading", { name })).toHaveProp(
        "aria-level",
        2
      );
    }
    expect(settings.getByRole("heading", { name: "설정" })).not.toHaveProp(
      "aria-level"
    );
    expect(settings.getAllByRole("heading")).toHaveLength(4);
  });
});

// R1-16(WCAG 3.1.2 부분 언어): 언어 옵션 이름(한국어·English·日本語·中文)은 그 언어로 읽혀야 한다.
// iOS는 accessibilityLanguage(BCP 47), 웹은 lang 속성(e2e/review-r1-a11y.spec.ts)으로 알린다. 접근 이름은 G-6 표 그대로다.
describe("R1-16 언어 옵션 이름의 언어 표시", () => {
  it("R1-16 언어 옵션 locale-option-ko·en·ja·zh의 accessibilityLanguage가 ko-KR·en-US·ja-JP·zh-CN이고 접근 이름은 그대로다", async () => {
    const { settings } = await openSettings();
    const tags = [
      ["ko", "ko-KR", "한국어"],
      ["en", "en-US", "English"],
      ["ja", "ja-JP", "日本語"],
      ["zh", "zh-CN", "中文"],
    ] as const;

    for (const [code, tag, name] of tags) {
      const option = settings.getByTestId(`locale-option-${code}`);
      expect(option).toHaveProp("accessibilityLanguage", tag);
      expect(settings.getByRole("radio", { name })).toBe(option);
    }
  });
});
