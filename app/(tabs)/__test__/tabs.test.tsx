import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@/lib/storage";
import { lightTokens, MAX_CONTENT_WIDTH } from "@/theme/tokens";

import {
  deferStorage,
  getTabButtons,
  renderApp,
  seedStorage,
  TAB_NAMES_KO,
} from "../../../test-utils/render";

// FR-11 하단 탭(US-15) 거울 테스트(AC-15.1~15.4 [unit]), FR-13 거울 AC-17.1 [unit](P11) + 영속화 공통 AC-18.2.
// renderApp은 실제 app/ 디렉터리를 renderRouter로 로드하므로 루트 레이아웃·게이트·탭이 모두 포함된다(설계서 §9.5).
// 라우터 없이 렌더하던 P7 지원 테스트(G-5 Screen·Disclaimer·renderWithProviders)는 대상 옆으로 옮겼다(리뷰 R3-02, U-08):
// src/components/common/__test__/{Screen,Disclaimer}.test.tsx, test-utils/__test__/render.test.tsx. 루트 LoadingGate 테스트는
// renderApp으로 루트 레이아웃(게이트 → Slot·경로)을 보므로 여기에 남는다.
// jest iOS 프리셋에서 하단 탭의 host role은 button이고 접근 이름은 tabBarAccessibilityLabel이다(R-10 실측).
// 웹 role="tab"·aria-selected·색 판정은 e2e/navigation.spec.ts가 한다. 거울 테스트는 공식 판정에 쓰지 않는다.

describe("AC-15.1 [unit] 하단 탭 3개와 초기 활성 상태", () => {
  it("AC-15.1 [unit] '/'에 진입하면 탭 버튼이 홈·접종 일정·설정 순으로 3개이고 홈 탭만 selected다", async () => {
    await renderApp({ initialUrl: "/" });
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();

    const tabs = getTabButtons(TAB_NAMES_KO);
    expect(tabs).toHaveLength(3);
    TAB_NAMES_KO.forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
    expect(screen.getByRole("button", { name: "홈" })).toBeSelected();
    expect(
      screen.getByRole("button", { name: "접종 일정" })
    ).not.toBeSelected();
    expect(screen.getByRole("button", { name: "설정" })).not.toBeSelected();
  });
});

describe("AC-15.2 [unit] 접종 일정 탭 전환과 활성·비활성 색", () => {
  it("AC-15.2 [unit] 접종 일정 탭을 누르면 경로가 /schedule이 되고 그 탭만 selected이며 활성 라벨 색은 tabActive, 비활성 라벨 색은 tabInactive다", async () => {
    await renderApp({ initialUrl: "/" });
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "접종 일정" }));

    expect(screen).toHavePathname("/schedule");
    expect(await screen.findByTestId("screen-schedule")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "접종 일정" })).toBeSelected();
    expect(screen.getByRole("button", { name: "홈" })).not.toBeSelected();
    expect(screen.getByRole("button", { name: "설정" })).not.toBeSelected();

    // 라이트 테마(jest useColorScheme mock = light) 토큰: tabActive #0f766e, tabInactive #78716c(PRD AC-15.2 색 기대값)
    expect(screen.getByText("접종 일정")).toHaveStyle({
      color: lightTokens.tabActive,
    });
    expect(screen.getByText("홈")).toHaveStyle({
      color: lightTokens.tabInactive,
    });
  });
});

describe("AC-15.3 [unit] 연속 탭 전환", () => {
  it("AC-15.3 [unit] /schedule에서 설정 탭, 이어서 홈 탭을 누르면 경로가 /settings, /가 되고 각 시점의 활성 탭이 selected다", async () => {
    await renderApp({ initialUrl: "/schedule" });
    expect(await screen.findByTestId("screen-schedule")).toBeOnTheScreen();
    expect(screen).toHavePathname("/schedule");
    expect(screen.getByRole("button", { name: "접종 일정" })).toBeSelected();

    await fireEvent.press(screen.getByRole("button", { name: "설정" }));
    expect(screen).toHavePathname("/settings");
    expect(await screen.findByTestId("screen-settings")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "설정" })).toBeSelected();
    expect(
      screen.getByRole("button", { name: "접종 일정" })
    ).not.toBeSelected();
    expect(screen.getByRole("button", { name: "홈" })).not.toBeSelected();

    await fireEvent.press(screen.getByRole("button", { name: "홈" }));
    expect(screen).toHavePathname("/");
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "홈" })).toBeSelected();
    expect(screen.getByRole("button", { name: "설정" })).not.toBeSelected();
    expect(
      screen.getByRole("button", { name: "접종 일정" })
    ).not.toBeSelected();
  });
});

describe("AC-15.4 [unit] 저장 로케일에 따른 탭 라벨", () => {
  it("AC-15.4 [unit] 저장값 locale 'zh'로 '/'에 진입하면 탭 라벨이 순서대로 首页·接种日程·设置다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "zh" });
    await renderApp({ initialUrl: "/" });
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();

    const names = ["首页", "接种日程", "设置"] as const;
    const tabs = getTabButtons(names);
    expect(tabs).toHaveLength(3);
    names.forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
    expect(screen.queryByRole("button", { name: "홈" })).toBeNull();
  });
});

/** 떠난 화면까지 포함한 렌더 트리에서 문자열 "AI"(대소문자 구분)를 포함한 Text 요소(웹 document.body.innerText 판정의 거울) */
function textsContainingAi() {
  return screen.queryAllByText(/AI/, { includeHiddenElements: true });
}

// FR-13 US-17. 웹 innerText·role="tab" 판정은 e2e/no-ai.spec.ts가 한다. 여기서는 같은 이동 경로의 렌더 트리 텍스트를 본다.
describe("AC-17.1 [unit] 세 화면의 AI 문구 없음과 하단 탭 3개", () => {
  it("AC-17.1 [unit] 생년월일 2026-04-30으로 홈 → 일정(bcg-1 펼침) → 설정 순으로 이동하면 각 시점의 렌더 트리에 'AI' 텍스트가 0개이고 하단 탭(홈·접종 일정·설정)은 3개다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2026-04-30" });
    await renderApp({ initialUrl: "/" });
    const home = within(await screen.findByTestId("screen-home"));
    // 아이가 있으면 홈은 저장된 아이 목록이다(추가 폼은 헤더 메뉴, v1.7 U-30)
    expect(home.getByText("2026-04-30")).toBeOnTheScreen();
    expect(textsContainingAi()).toHaveLength(0);
    expect(getTabButtons(TAB_NAMES_KO)).toHaveLength(3);

    await fireEvent.press(screen.getByRole("button", { name: "접종 일정" }));
    expect(screen).toHavePathname("/schedule");
    const schedule = within(await screen.findByTestId("screen-schedule"));
    const bcg1 = within(schedule.getByTestId("schedule-card-bcg-1"));
    await fireEvent.press(bcg1.getByTestId("card-toggle"));
    expect(bcg1.getByTestId("card-toggle")).toBeExpanded();
    expect(
      bcg1.getByText("결핵을 예방하는 백신으로, 출생 후 4주 이내에 접종합니다.")
    ).toBeOnTheScreen();
    expect(textsContainingAi()).toHaveLength(0);
    expect(getTabButtons(TAB_NAMES_KO)).toHaveLength(3);

    await fireEvent.press(screen.getByRole("button", { name: "설정" }));
    expect(screen).toHavePathname("/settings");
    const settings = within(await screen.findByTestId("screen-settings"));
    expect(
      settings.getByRole("button", { name: "2026-04-30 삭제" })
    ).toBeOnTheScreen();
    expect(textsContainingAi()).toHaveLength(0);
    expect(getTabButtons(TAB_NAMES_KO)).toHaveLength(3);
  });
});

// 지원 테스트: 루트 LoadingGate(설계서 §6.1·§10.3). 네 키(테마·언어·생년월일·접종 완료 FR-14)의 하이드레이션이 모두 끝나기 전에는
// Slot 대신 loading-gate만 렌더한다(P-07).
describe("G-5 LoadingGate 하이드레이션 게이트", () => {
  it("G-5 네 키 중 하나라도 하이드레이션 전이면 loading-gate만 렌더하고, 모두 끝나면 Slot(홈)을 렌더한다", async () => {
    const storage = deferStorage([
      STORAGE_KEYS.theme,
      STORAGE_KEYS.locale,
      STORAGE_KEYS.birthdate,
      STORAGE_KEYS.completed,
    ]);
    await renderApp({ initialUrl: "/" });

    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(screen.queryByTestId("screen-home")).toBeNull();

    await storage.resolve(STORAGE_KEYS.theme, null);
    await storage.resolve(STORAGE_KEYS.locale, null);
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(screen.queryByTestId("screen-home")).toBeNull();

    await storage.resolve(STORAGE_KEYS.birthdate, null);
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(screen.queryByTestId("screen-home")).toBeNull();

    await storage.resolve(STORAGE_KEYS.completed, null);
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
    expect(screen.queryByTestId("loading-gate")).toBeNull();
    expect(screen).toHavePathname("/");
  });
});

// AC-18.2 (영속화 공통 · US-18): 읽기 실패는 readValue가 null로 흡수하고 isReady=true로 끝나므로 게이트가 열리고 기본값으로 렌더된다(설계서 §6.1 오류 행).
describe("AC-18.2 저장소 읽기 실패 복원력", () => {
  it("AC-18.2 AsyncStorage.getItem이 모든 키에서 reject해도 예외 없이 홈이 렌더되고, 생년월일 없음(바로가기 0)·테마 기본값 라이트(라이트 토큰 배경, U-24)·기기 감지 언어(ko → '홈' 라벨)다", async () => {
    jest
      .mocked(AsyncStorage.getItem)
      .mockRejectedValue(new Error("storage unavailable"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    await renderApp({ initialUrl: "/" });

    const home = await screen.findByTestId("screen-home");
    expect(home).toBeOnTheScreen();
    expect(screen.queryByTestId("loading-gate")).toBeNull();
    expect(screen.queryByTestId("existing-birthdate-shortcut")).toBeNull();
    // 테마 저장값을 읽지 못하면 기본값 라이트(U-24) → 라이트 토큰 배경
    expect(home).toHaveStyle({ backgroundColor: lightTokens.background });
    expect(
      screen.getByRole("button", { name: "홈", selected: true })
    ).toBeOnTheScreen();
    expect(error).not.toHaveBeenCalled();
    // 읽기 실패는 [storage] get 경고로만 보고된다(reportStorageError, __DEV__). 아이 목록 키 읽기가 실패하면 예전 생년월일·완료 키는
    // 읽지 않는다(있을지 모르는 새 데이터를 예전 값으로 덮어쓰지 않게, v1.7 U-29)
    for (const key of [
      STORAGE_KEYS.theme,
      STORAGE_KEYS.locale,
      STORAGE_KEYS.children,
    ]) {
      expect(warn).toHaveBeenCalledWith(
        "[storage]",
        "get",
        key,
        expect.any(Error)
      );
    }
    for (const legacy of [STORAGE_KEYS.birthdate, STORAGE_KEYS.completed]) {
      expect(warn).not.toHaveBeenCalledWith(
        "[storage]",
        "get",
        legacy,
        expect.any(Error)
      );
    }
  });
});

// FR-15 앱 헤더(US-20, U-23) 화면 수준 거울. 헤더는 Screen 맨 위에 붙어 세 탭 화면 모두에 있고, 설정 화면과 같은 Context를 쓴다.
describe("AC-20.1 [unit] 세 탭 화면의 헤더", () => {
  it("AC-20.1 [unit] 생년월일 2026-04-30으로 홈·일정·설정을 차례로 열면 화면마다 app-header 안에 테마 스위치와 언어 버튼이 1개씩 있다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2026-04-30" });
    await renderApp({ initialUrl: "/" });

    for (const [tab, testID] of [
      ["홈", "screen-home"],
      ["접종 일정", "screen-schedule"],
      ["설정", "screen-settings"],
    ] as const) {
      const [button] = getTabButtons([tab]);
      if (!button) throw new Error(`탭이 없다: ${tab}`);
      await fireEvent.press(button);
      const header = within(
        within(await screen.findByTestId(testID)).getByTestId("app-header")
      );
      expect(header.getAllByRole("switch", { name: "다크모드" })).toHaveLength(
        1
      );
      expect(
        header.getAllByRole("button", { name: "언어: 한국어" })
      ).toHaveLength(1);
    }
  });
});

describe("AC-20.2 [unit] 헤더와 설정 화면의 테마·언어 동기화", () => {
  it("AC-20.2 [unit] 설정 화면에서 헤더 테마 스위치를 누르면 설정의 '다크' radio가 checked가 되고, 설정에서 '라이트'를 누르면 헤더 스위치가 checked=false로 돌아온다", async () => {
    await renderApp({ initialUrl: "/settings" });
    const settings = within(await screen.findByTestId("screen-settings"));
    const themeSwitch = settings.getByTestId("header-theme-toggle");

    await fireEvent.press(themeSwitch);

    expect(themeSwitch).toBeChecked();
    expect(settings.getByTestId("theme-option-dark")).toBeChecked();

    await fireEvent.press(settings.getByRole("radio", { name: "라이트" }));

    expect(themeSwitch).not.toBeChecked();
    expect(settings.getByTestId("theme-option-light")).toBeChecked();
  });

  it("AC-20.3 [unit] 설정 화면에서 헤더 언어 목록의 English를 누르면 하단 탭이 Home·Schedule·Settings, 설정의 locale-option-en이 checked다", async () => {
    await renderApp({ initialUrl: "/settings" });
    const settings = within(await screen.findByTestId("screen-settings"));

    await fireEvent.press(settings.getByTestId("header-language-button"));
    await fireEvent.press(settings.getByTestId("header-locale-option-en"));

    expect(getTabButtons(["Home", "Schedule", "Settings"])).toHaveLength(3);
    expect(settings.getByTestId("locale-option-en")).toBeChecked();
    expect(settings.queryByTestId("header-language-panel")).toBeNull();
  });
});

// v1.8 U-31: 데스크톱처럼 창이 넓어도 앱은 iPad 세로 너비(MAX_CONTENT_WIDTH = 768) 이하의 가운데 열로 보인다.
// 루트 레이아웃이 app-backdrop(창 전체, 배경색) 안에 app-frame(maxWidth 768, 가운데 정렬)을 두고, 창이 그보다 넓을 때만
// 열 양옆에 경계선을 그린다. 창 너비는 useWindowDimensions를 바꿔 재현한다(실제 브라우저 너비 판정은 e2e/layout.spec.ts).
describe("U-31 넓은 창에서 앱 너비를 iPad 세로 너비(768)로 제한", () => {
  function mockWindowWidth(width: number): void {
    // import * as는 CommonJS인 react-native의 복사본을 만들어 spy가 레이아웃에 닿지 않으므로 실제 exports 객체를 받는다
    const reactNative =
      jest.requireActual<typeof import("react-native")>("react-native");
    jest
      .spyOn(reactNative, "useWindowDimensions")
      .mockReturnValue({ width, height: 800, scale: 1, fontScale: 1 });
  }

  it("U-31 창 너비 1280이면 app-frame이 maxWidth 768·width 100%이고 app-backdrop이 가운데 정렬하며 열 양옆에 border 토큰 색 경계선(1)이 있다", async () => {
    mockWindowWidth(1280);
    await renderApp({ initialUrl: "/" });
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();

    expect(screen.getByTestId("app-backdrop")).toHaveStyle({
      alignItems: "center",
      backgroundColor: lightTokens.background,
    });
    expect(screen.getByTestId("app-frame")).toHaveStyle({
      width: "100%",
      maxWidth: MAX_CONTENT_WIDTH,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: lightTokens.border,
    });
    expect(MAX_CONTENT_WIDTH).toBe(768);
  });

  it("U-31 창 너비가 768 이하(390·768)이면 app-frame은 창을 꽉 채우고 경계선이 없다", async () => {
    for (const width of [390, 768]) {
      mockWindowWidth(width);
      await renderApp({ initialUrl: "/" });
      expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();

      const frame = screen.getByTestId("app-frame");
      expect(frame).toHaveStyle({ maxWidth: MAX_CONTENT_WIDTH });
      expect(frame).not.toHaveStyle({ borderLeftWidth: 1 });
      screen.unmount();
    }
  });
});
