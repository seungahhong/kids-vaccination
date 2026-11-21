import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import * as ReactNative from "react-native";

import { STORAGE_KEYS, type StorageKey } from "@/lib/storage";
import { darkTokens, lightTokens } from "@/theme/tokens";

import {
  flushRouterMacrotask,
  getTabButtons,
  mockSystemScheme,
  openSettings,
  renderApp,
  restoreDefaultImplementationAfterEach,
  seedStorage,
  TAB_NAMES_KO,
} from "../../../test-utils/render";

// 설정 화면(FR-08 테마, FR-09 언어, FR-10 아기 정보·초기화, FR-12 면책, 영속화 공통) 화면 수준 테스트.
// TDD 판정: AC-14.5, AC-18.3(화면), AC-19.7. 거울([unit], 공식 판정 미사용): AC-11.1~11.4, 12.1, 14.1, 14.2, 14.4, 16.2(P10),
// 홈·일정 화면을 함께 관찰하는 AC-14.3·16.3(P11).
// renderApp은 실제 app/ 디렉터리를 renderRouter로 로드하므로 루트 레이아웃·LoadingGate·탭이 모두 포함된다(설계서 §9.5).
// 설정 화면 요소는 screen-settings 범위(within)에서 찾고, 하단 탭은 role button + 이름으로 전역 조회한다(P7 메모).

const THEME_NAMES_KO = ["라이트", "다크"] as const;
const LOCALE_NAMES = ["한국어", "English", "日本語", "中文"] as const;
const TAB_NAMES_EN = ["Home", "Schedule", "Settings"] as const;
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
const DISCLAIMER_EN =
  "This information is for reference only. Please consult a pediatrician for accurate medical advice.";
const EMPTY_SCHEDULE_KO = "생년월일을 먼저 입력해주세요";
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

// FR-08 테마(v1.5 U-24): "시스템"을 없애고 라이트로 합쳤다. 선택지는 라이트·다크 2개이고 기본값은 라이트이며 OS 색 모드는 따르지 않는다.
describe("AC-11.1 [unit] 테마 옵션 초기 상태(저장값 없음)", () => {
  it("AC-11.1 [unit] /settings에 진입하면 테마 옵션 2개(라이트·다크)가 role radio이고 theme-option-light만 checked이며 '시스템' 옵션은 없고 screen-settings 배경은 라이트 background 토큰이다", async () => {
    mockSystemScheme("light");
    const { settings, container } = await openSettings();

    const radios = settings.getAllByRole("radio", {
      name: /^(시스템|라이트|다크)$/,
    });
    expect(radios).toHaveLength(2);
    THEME_NAMES_KO.forEach((name, index) => {
      expect(radios[index]).toHaveAccessibleName(name);
    });
    expect(settings.getByRole("radio", { name: "라이트" })).toBeChecked();
    expect(settings.getByRole("radio", { name: "다크" })).not.toBeChecked();
    expect(settings.queryByTestId("theme-option-system")).toBeNull();
    expect(settings.getByTestId("theme-option-light")).toBeChecked();
    expect(settings.getByTestId("theme-option-dark")).not.toBeChecked();
    // role="radiogroup" 컨테이너는 네이티브에서 접근성 요소가 아니라(accessible 미지정) RNTL role 조회 대상이 아니다 — 웹 DOM role은 E2E가 본다
    expect(container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
  });
});

describe("AC-11.2 [unit] 다크 OS 초기 상태(저장값 없음)", () => {
  it("AC-11.2 [unit] 다크 OS·저장값 없음으로 /settings에 진입해도 theme-option-light가 checked이고 screen-settings 배경은 라이트 background 토큰이다(OS 색 모드를 따르지 않음, U-24)", async () => {
    mockSystemScheme("dark");
    const { settings, container } = await openSettings();

    expect(settings.getByRole("radio", { name: "라이트" })).toBeChecked();
    expect(settings.getByTestId("theme-option-light")).toBeChecked();
    expect(container).toHaveStyle({ backgroundColor: lightTokens.background });
  });
});

describe("AC-11.3 [unit] 다크 고정과 유지", () => {
  it("AC-11.3 [unit] '다크'를 누르면 배경이 다크 background, 저장값 'dark', theme-option-dark checked이고, 다시 렌더(새로고침)해도 유지된다", async () => {
    mockSystemScheme("light");
    const first = await openSettings();
    expect(first.container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });

    await fireEvent.press(first.settings.getByRole("radio", { name: "다크" }));

    expect(first.container).toHaveStyle({
      backgroundColor: darkTokens.background,
    });
    expect(first.settings.getByRole("radio", { name: "다크" })).toBeChecked();
    expect(first.settings.getByTestId("theme-option-dark")).toBeChecked();
    expect(first.settings.getByTestId("theme-option-light")).not.toBeChecked();
    await flushRouterMacrotask();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEYS.theme,
      "dark"
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");

    // 새로고침: 언마운트 뒤 같은 저장소로 다시 렌더한다
    await first.app.unmount();
    const second = await openSettings();

    expect(second.container).toHaveStyle({
      backgroundColor: darkTokens.background,
    });
    expect(second.settings.getByRole("radio", { name: "다크" })).toBeChecked();
    expect(second.settings.getByTestId("theme-option-dark")).toBeChecked();
  });
});

describe("AC-11.4 [unit] 다크에서 라이트 복귀", () => {
  it("AC-11.4 [unit] 저장값 'dark'에서 '라이트'를 누르면 배경이 라이트 background·저장값 'light'·theme-option-light checked다", async () => {
    await seedStorage({ [STORAGE_KEYS.theme]: "dark" });
    const { settings, container } = await openSettings();
    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });

    await fireEvent.press(settings.getByRole("radio", { name: "라이트" }));

    expect(container).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    expect(settings.getByTestId("theme-option-light")).toBeChecked();
    expect(settings.getByTestId("theme-option-dark")).not.toBeChecked();
    await flushRouterMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("light");
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      STORAGE_KEYS.theme,
      "light"
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

// FR-10·FR-16(v1.7 U-28): "아기 정보"는 저장된 아이 목록과 아이별 삭제다(ChildrenSection). 예전 생년월일 키 시드는 하이드레이션에서
// 이름 없는 아이 1명(이름표 = 생년월일)으로 옮겨진다. 줄 안의 포커스·결과 고지는 src/components/settings/__test__/ChildrenSection.test.tsx.
const RESET_CHILD_CONFIRM_KO = "2024-01-31 정보를 삭제할까요?";

describe("AC-14.1 [unit] 설정 아기 정보 표시", () => {
  it("AC-14.1 [unit] (a) 예전 저장값 생년월일 '2024-01-31'로 /settings에 진입하면 아이 수가 '저장된 아이 1명 (최대 10명)'이고 이름표 '2024-01-31' 줄과 '2024-01-31 삭제' 버튼이 있다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();

    expect(settings.getByTestId("settings-children-count")).toHaveTextContent(
      "저장된 아이 1명 (최대 10명)"
    );
    expect(settings.getByTestId("child-row-label")).toHaveTextContent(
      "2024-01-31"
    );
    expect(
      settings.getByRole("button", { name: "2024-01-31 삭제" })
    ).toBeOnTheScreen();
  });

  it("AC-14.1 [unit] (b) 저장값이 없으면 아이 수가 '저장된 아이 0명 (최대 10명)'이고 아이 줄·삭제 버튼은 0개다", async () => {
    const { settings } = await openSettings();

    expect(settings.getByTestId("settings-children-count")).toHaveTextContent(
      "저장된 아이 0명 (최대 10명)"
    );
    expect(settings.queryAllByTestId("child-row")).toHaveLength(0);
    expect(settings.queryAllByTestId("child-delete")).toHaveLength(0);
  });
});

describe("AC-14.2 [unit] 삭제 확인 UI와 취소", () => {
  it("AC-14.2 [unit] '2024-01-31 삭제'를 누르면 확인 문구 '2024-01-31 정보를 삭제할까요?'와 확인·취소 버튼이 보이고 원본 문구는 0개이며, '취소'를 누르면 확인 UI가 0개가 되고 아이와 저장값이 그대로다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();
    await flushRouterMacrotask();
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.children);

    await fireEvent.press(
      settings.getByRole("button", { name: "2024-01-31 삭제" })
    );

    expect(settings.getByText(RESET_CHILD_CONFIRM_KO)).toBeOnTheScreen();
    expect(settings.getByRole("button", { name: "확인" })).toBe(
      settings.getByTestId("child-delete-confirm")
    );
    expect(settings.getByRole("button", { name: "취소" })).toBe(
      settings.getByTestId("child-delete-cancel")
    );
    expect(settings.queryAllByText(LEGACY_RESET_CONFIRM_KO)).toHaveLength(0);

    await fireEvent.press(settings.getByRole("button", { name: "취소" }));
    await flushRouterMacrotask();

    expect(settings.queryByTestId("child-delete-confirm")).toBeNull();
    expect(settings.getAllByTestId("child-row")).toHaveLength(1);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBe(stored);
  });
});

describe("AC-14.3 [unit] 아이 삭제(테마·언어 유지)와 홈·일정 반영", () => {
  it("AC-14.3 [unit] 라이트 OS에서 저장값 생년월일 '2024-01-31'·theme 'dark'·locale 'ko'로 '2024-01-31 삭제'→'확인'을 누르면 아이 0명·저장 키 없음·theme 'dark'·locale 'ko'·다크 배경이 유지되고, 홈 탭은 아이 추가 폼(목록 없음), 일정 탭은 빈 상태 문구다", async () => {
    mockSystemScheme("light");
    await seedStorage({
      [STORAGE_KEYS.birthdate]: "2024-01-31",
      [STORAGE_KEYS.theme]: "dark",
      [STORAGE_KEYS.locale]: "ko",
    });
    const { settings, container } = await openSettings();

    await fireEvent.press(
      settings.getByRole("button", { name: "2024-01-31 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(settings.queryAllByTestId("child-row")).toHaveLength(0);
    expect(settings.getByTestId("settings-children-count")).toHaveTextContent(
      "저장된 아이 0명 (최대 10명)"
    );
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe("ko");
    expect(container).toHaveStyle({ backgroundColor: darkTokens.background });

    const [homeTab, scheduleTab] = getTabButtons(TAB_NAMES_KO);
    if (!homeTab || !scheduleTab) throw new Error("탭이 없다");
    await fireEvent.press(homeTab);
    const home = within(await screen.findByTestId("screen-home"));
    expect(home.getByTestId("home-add-child")).toBeOnTheScreen();
    expect(home.queryAllByTestId("child-shortcut")).toHaveLength(0);
    await fireEvent.press(scheduleTab);
    const schedule = within(await screen.findByTestId("screen-schedule"));
    expect(schedule.getByText(EMPTY_SCHEDULE_KO)).toBeOnTheScreen();
  });
});

describe("AC-14.4 [unit] 저장값 없이 설정 진입", () => {
  it("AC-14.4 [unit] 저장값 없이 /settings에 진입하면 지울 아이가 없어 삭제 버튼·확인 UI가 0개이고 screen-settings가 보이며 console.error가 0회다", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { settings } = await openSettings();

    expect(settings.queryAllByTestId("child-delete")).toHaveLength(0);
    expect(settings.queryByTestId("child-delete-confirm")).toBeNull();
    expect(screen.getByTestId("screen-settings")).toBeOnTheScreen();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("AC-14.5 삭제는 앱 내 확인 후 그 아이만 지운다", () => {
  it("AC-14.5 저장값 생년월일 '2024-01-31'에서 아이 삭제→확인을 수행하면 Alert.alert 0회, 마지막 아이라 AsyncStorage.removeItem('vaccination-app-children') 1회이고 locale·theme 키의 removeItem·setItem은 0회다", async () => {
    const alert = jest
      .spyOn(ReactNative.Alert, "alert")
      .mockImplementation(() => {});
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    const { settings } = await openSettings();
    await flushRouterMacrotask();
    jest.mocked(AsyncStorage.removeItem).mockClear();
    jest.mocked(AsyncStorage.setItem).mockClear();

    await fireEvent.press(
      settings.getByRole("button", { name: "2024-01-31 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(alert).not.toHaveBeenCalled();
    const removeCalls = jest.mocked(AsyncStorage.removeItem).mock.calls;
    const setCalls = jest.mocked(AsyncStorage.setItem).mock.calls;
    expect(countKeyCalls(removeCalls, STORAGE_KEYS.children)).toBe(1);
    for (const key of [STORAGE_KEYS.locale, STORAGE_KEYS.theme]) {
      expect(countKeyCalls(removeCalls, key)).toBe(0);
      expect(countKeyCalls(setCalls, key)).toBe(0);
    }
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBeNull();
  });
});

// AC-19.7 (FR-14 · v1.7 FR-16): 완료 기록은 아이 안에 있으므로 아이를 지우면 기록도 함께 지워진다. 예전 생년월일·완료 키는 이전 때 지워진다.
describe("AC-19.7 아이 삭제 시 접종 완료 기록도 삭제", () => {
  it("AC-19.7 예전 저장값 생년월일 '2026-04-30'·완료 '2026-04-30|hepb-3'(아이 1명으로 이전)에서 삭제→확인을 누르면 아이 목록 키가 없어지고 예전 완료 키도 남지 않는다", async () => {
    await seedStorage({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2026-04-30|hepb-3",
    });
    const { settings } = await openSettings();
    await flushRouterMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toContain(
      "hepb-3"
    );

    await fireEvent.press(
      settings.getByRole("button", { name: "2026-04-30 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "확인" }));
    await flushRouterMacrotask();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.completed)).toBeNull();
  });

  it("AC-19.7 '취소'를 누르면 완료 기록이 그대로다", async () => {
    await seedStorage({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2026-04-30|hepb-3",
    });
    const { settings } = await openSettings();
    await flushRouterMacrotask();

    await fireEvent.press(
      settings.getByRole("button", { name: "2026-04-30 삭제" })
    );
    await fireEvent.press(settings.getByRole("button", { name: "취소" }));
    await flushRouterMacrotask();

    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toContain(
      "hepb-3"
    );
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

// R1-03(초기화 확인 단계의 포커스): v1.7에서 아이별 삭제로 바뀌어 줄 단위 테스트로 옮겼다
// (src/components/settings/__test__/ChildrenSection.test.tsx의 R1-03·V-01·U-28·R2-06). 실제 브라우저 포커스는 e2e/review-r1-a11y.spec.ts.

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
