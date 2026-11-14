import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";

import { STORAGE_KEYS } from "@/lib/storage";
import { lightTokens } from "@/theme/tokens";

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
    expect(home.getByText("일정 확인하기")).toBeOnTheScreen();
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
      settings.getByRole("button", { name: "생년월일 삭제" })
    ).toBeOnTheScreen();
    expect(textsContainingAi()).toHaveLength(0);
    expect(getTabButtons(TAB_NAMES_KO)).toHaveLength(3);
  });
});

// 지원 테스트: 루트 LoadingGate(설계서 §6.1·§10.3). 세 키의 하이드레이션이 모두 끝나기 전에는 Slot 대신 loading-gate만 렌더한다(P-07).
describe("G-5 LoadingGate 하이드레이션 게이트", () => {
  it("G-5 세 키 중 하나라도 하이드레이션 전이면 loading-gate만 렌더하고, 모두 끝나면 Slot(홈)을 렌더한다", async () => {
    const storage = deferStorage([
      STORAGE_KEYS.theme,
      STORAGE_KEYS.locale,
      STORAGE_KEYS.birthdate,
    ]);
    await renderApp({ initialUrl: "/" });

    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(screen.queryByTestId("screen-home")).toBeNull();

    await storage.resolve(STORAGE_KEYS.theme, null);
    await storage.resolve(STORAGE_KEYS.locale, null);
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(screen.queryByTestId("screen-home")).toBeNull();

    await storage.resolve(STORAGE_KEYS.birthdate, null);
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
    expect(screen.queryByTestId("loading-gate")).toBeNull();
    expect(screen).toHavePathname("/");
  });
});

// AC-18.2 (영속화 공통 · US-18): 읽기 실패는 readValue가 null로 흡수하고 isReady=true로 끝나므로 게이트가 열리고 기본값으로 렌더된다(설계서 §6.1 오류 행).
describe("AC-18.2 저장소 읽기 실패 복원력", () => {
  it("AC-18.2 AsyncStorage.getItem이 모든 키에서 reject해도 예외 없이 홈이 렌더되고, 생년월일 없음(바로가기 0)·테마 system(라이트 토큰 배경)·기기 감지 언어(ko → '홈' 라벨)다", async () => {
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
    // 선호 system × OS light(jest useColorScheme mock) → 라이트 토큰 배경
    expect(home).toHaveStyle({ backgroundColor: lightTokens.background });
    expect(
      screen.getByRole("button", { name: "홈", selected: true })
    ).toBeOnTheScreen();
    expect(error).not.toHaveBeenCalled();
    // 세 키의 읽기 실패는 [storage] get 경고로만 보고된다(reportStorageError, __DEV__)
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(warn).toHaveBeenCalledWith(
        "[storage]",
        "get",
        key,
        expect.any(Error)
      );
    }
  });
});
