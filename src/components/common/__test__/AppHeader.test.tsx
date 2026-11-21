import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Platform, Text } from "react-native";

import { Screen } from "@/components/common/Screen";
import { STORAGE_KEYS } from "@/lib/storage";
import { darkTokens, lightTokens, MIN_TOUCH_TARGET } from "@/theme/tokens";

import {
  describeHost,
  fireLayout,
  flushMacrotask,
  hostWithProps,
  propsOf,
  renderWithProviders,
  seedStorage,
  sharedHostFocus,
} from "../../../../test-utils/render";

// 앱 헤더(FR-15, U-23) 컴포넌트 수준 테스트. 공식 판정은 e2e/header.spec.ts(AC-20.x)이고 여기는 거울([unit])이다.
// 헤더는 Screen 맨 위에 붙으므로 실제 화면처럼 Screen 안에서 렌더한다. 테마 스위치·언어 목록은 설정 화면과 같은 Context를 쓴다.

/**
 * Screen(헤더 포함)을 렌더하고 하이드레이션이 끝난 화면 범위 질의를 돌려준다. 언어 메뉴는 헤더 안이 아니라 헤더의 형제 덮개 층이라
 * (U-25) 화면 범위로 찾는다. 헤더 막대 자체만 볼 때는 within(app-header)를 쓴다
 */
async function renderHeader() {
  await renderWithProviders(
    <Screen testID="screen-home" scroll>
      <Text>본문</Text>
    </Screen>
  );
  return within(await screen.findByTestId("screen-home"));
}

describe("AC-20.1 [unit] 헤더 구성", () => {
  it("AC-20.1 [unit] 헤더에 앱 이름 '아기 예방접종 일정'(heading 아님), 테마 스위치(role switch, 이름 '다크모드', checked=false), 언어 버튼(role button, 이름 '언어: 한국어', expanded=false)이 있고 둘 다 44×44다", async () => {
    const header = await renderHeader();

    expect(header.getByTestId("header-app-name")).toHaveTextContent(
      "아기 예방접종 일정"
    );
    expect(header.queryAllByRole("heading")).toHaveLength(0);
    const themeSwitch = header.getByRole("switch", { name: "다크모드" });
    expect(themeSwitch).toBe(header.getByTestId("header-theme-toggle"));
    expect(themeSwitch).not.toBeChecked();
    const languageButton = header.getByRole("button", {
      name: "언어: 한국어",
      expanded: false,
    });
    expect(languageButton).toBe(header.getByTestId("header-language-button"));
    for (const control of [themeSwitch, languageButton]) {
      expect(control).toHaveStyle({
        width: MIN_TOUCH_TARGET,
        height: MIN_TOUCH_TARGET,
      });
    }
    expect(header.queryByTestId("header-language-panel")).toBeNull();
  });
});

describe("AC-20.2 [unit] 헤더 테마 스위치", () => {
  it("AC-20.2 [unit] 스위치를 누르면 checked=true·화면 배경이 다크 토큰·저장값 'dark'이고, 다시 누르면 라이트·저장값 'light'다", async () => {
    const header = await renderHeader();
    const themeSwitch = header.getByTestId("header-theme-toggle");

    await fireEvent.press(themeSwitch);

    expect(themeSwitch).toBeChecked();
    expect(screen.getByTestId("screen-home")).toHaveStyle({
      backgroundColor: darkTokens.background,
    });
    expect(screen.getByTestId("app-header")).toHaveStyle({
      backgroundColor: darkTokens.surface,
    });
    await flushMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");

    await fireEvent.press(themeSwitch);

    expect(themeSwitch).not.toBeChecked();
    expect(screen.getByTestId("screen-home")).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    await flushMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe("light");
  });

  it("AC-20.2 [unit] 저장값 'dark'면 스위치가 checked=true로 시작한다", async () => {
    await seedStorage({ [STORAGE_KEYS.theme]: "dark" });
    const header = await renderHeader();

    expect(header.getByRole("switch", { name: "다크모드" })).toBeChecked();
  });
});

describe("AC-20.3 [unit] 헤더 언어 목록", () => {
  it("AC-20.3 [unit] 언어 버튼을 누르면 expanded=true이고 메뉴에 언어 radio 4개(한국어 checked)가 뜨며, 다시 누르면 닫힌다", async () => {
    const header = await renderHeader();
    const languageButton = header.getByTestId("header-language-button");

    await fireEvent.press(languageButton);

    expect(languageButton).toBeExpanded();
    const panel = within(header.getByTestId("header-language-panel"));
    const radios = panel.getAllByRole("radio");
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      "한국어",
      "English",
      "日本語",
      "中文",
    ]);
    expect(panel.getByTestId("header-locale-option-ko")).toBeChecked();
    expect(panel.queryByTestId("locale-option-ko")).toBeNull();

    await fireEvent.press(languageButton);

    expect(languageButton).not.toBeExpanded();
    expect(header.queryByTestId("header-language-panel")).toBeNull();
  });

  it("AC-20.3 [unit] 목록에서 English를 누르면 언어가 바뀌어 앱 이름이 'Baby Vaccination Schedule'·버튼 이름이 'Language: English'가 되고, 목록이 닫히며 저장값은 'en'이다", async () => {
    const header = await renderHeader();
    await fireEvent.press(header.getByTestId("header-language-button"));

    await fireEvent.press(header.getByTestId("header-locale-option-en"));

    expect(header.getByTestId("header-app-name")).toHaveTextContent(
      "Baby Vaccination Schedule"
    );
    expect(
      header.getByRole("button", { name: "Language: English", expanded: false })
    ).toBe(header.getByTestId("header-language-button"));
    expect(header.queryByTestId("header-language-panel")).toBeNull();
    await flushMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.locale)).toBe("en");
  });
});

// U-23: 항목을 눌러 목록을 닫으면 누른 항목이 사라지므로 포커스를 언어 버튼으로 돌려준다. 버튼은 다시 마운트되지 않아 커밋 직후에 옮긴다.
describe("U-23 [unit] 언어 목록을 닫은 뒤 포커스", () => {
  it.each(["ios", "android"] as const)(
    "U-23 [unit] %s에서 목록의 日本語를 누르면 화면 낭독기 포커스가 언어 버튼으로 1번 돌아오고, 버튼으로 열고 닫을 때는 옮기지 않는다",
    async (os) => {
      const header = await renderHeader();
      const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
      sendEvent.mockClear();
      const replaced = jest.replaceProperty(Platform, "OS", os);
      const languageButton = header.getByTestId("header-language-button");

      await fireEvent.press(languageButton);
      await fireEvent.press(languageButton);
      expect(sendEvent).not.toHaveBeenCalled();

      await fireEvent.press(languageButton);
      await fireEvent.press(header.getByTestId("header-locale-option-ja"));

      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith(
        hostWithProps({ testID: "header-language-button" }),
        "focus"
      );
      replaced.restore();
    }
  );

  it("U-23 [unit] 웹에서 목록의 中文을 누르면 언어 버튼에 focus()를 준다", async () => {
    const focus = await sharedHostFocus();
    const header = await renderHeader();
    const replaced = jest.replaceProperty(Platform, "OS", "web");
    await fireEvent.press(header.getByTestId("header-language-button"));
    focus.mockClear();

    await fireEvent.press(header.getByTestId("header-locale-option-zh"));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toEqual(
      hostWithProps({ testID: "header-language-button" })
    );
    replaced.restore();
  });
});

// U-25: 언어 메뉴는 헤더 높이를 바꾸지 않고 본문 위에 덮인다. 덮개 층은 헤더의 형제(Screen 프레임의 자식)이고, 헤더 높이(onLayout)에서
// 시작해 화면 끝까지 덮으며 zIndex로 본문 위에 그린다. 메뉴 밖(투명 덮개)을 누르면 언어를 바꾸지 않고 닫는다.
describe("U-25 [unit] 덮이는 언어 메뉴", () => {
  it("U-25 [unit] 메뉴를 열어도 헤더(app-header) 안에는 아무것도 더해지지 않고, 덮개 층은 헤더 밖에서 절대 위치·zIndex 10이며 top이 잰 헤더 높이다", async () => {
    const scope = await renderHeader();
    const header = scope.getByTestId("app-header");
    await fireLayout(header, 57);

    await fireEvent.press(scope.getByTestId("header-language-button"));

    expect(within(header).queryByTestId("header-language-panel")).toBeNull();
    expect(within(header).queryByTestId("header-language-overlay")).toBeNull();
    const overlay = scope.getByTestId("header-language-overlay");
    expect(overlay).toHaveStyle({
      position: "absolute",
      top: 57,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10,
    });
    expect(
      within(overlay).getByTestId("header-language-panel")
    ).toBeOnTheScreen();
  });

  it("U-25 [unit] 메뉴 밖 덮개는 보조기기·Tab에서 숨겨지고(aria-hidden, focusable false, tabIndex -1), 누르면 언어를 바꾸지 않고 메뉴를 닫는다", async () => {
    const scope = await renderHeader();
    await fireEvent.press(scope.getByTestId("header-language-button"));
    const backdrop = scope.getByTestId("header-language-backdrop", {
      includeHiddenElements: true,
    });
    expect(backdrop).toHaveProp("aria-hidden", true);
    expect(backdrop).toHaveProp("focusable", false);
    expect(backdrop).toHaveProp("tabIndex", -1);

    await fireEvent.press(backdrop);

    expect(scope.queryByTestId("header-language-overlay")).toBeNull();
    expect(scope.getByTestId("header-language-button")).not.toBeExpanded();
    expect(scope.getByTestId("header-app-name")).toHaveTextContent(
      "아기 예방접종 일정"
    );
    await flushMacrotask();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it.each(["ios", "web"] as const)(
    "U-25 [unit] %s에서 메뉴 밖을 눌러 닫아도 포커스를 언어 버튼으로 돌려준다",
    async (os) => {
      const focus = await sharedHostFocus();
      const scope = await renderHeader();
      const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
      sendEvent.mockClear();
      const replaced = jest.replaceProperty(Platform, "OS", os);
      await fireEvent.press(scope.getByTestId("header-language-button"));
      focus.mockClear();

      await fireEvent.press(
        scope.getByTestId("header-language-backdrop", {
          includeHiddenElements: true,
        })
      );

      const target = hostWithProps({ testID: "header-language-button" });
      if (os === "web") {
        expect(focus.mock.contexts).toEqual([target]);
      } else {
        expect(sendEvent).toHaveBeenCalledWith(target, "focus");
      }
      replaced.restore();
    }
  );
});

// U-30: 아이가 한 명 이상이면 헤더에 "아이 추가" 버튼이 있고, 누르면 본문 위에 덮이는 추가 폼(생년월일 → 이름)이 열린다.
// 버튼 바로 뒤가 메뉴가 아니므로 열면 포커스를 메뉴로 옮긴다: 웹은 메뉴 상자(커밋 직후), 네이티브는 폼 제목이 배치된 뒤(V-01).
// 메뉴 밖을 누르면 닫고 포커스를 추가 버튼으로 돌려준다. 제출(아이 추가 → 일정 화면 이동)은 app/(tabs)/__test__/schedule.test.tsx R1-06.
describe("U-30 [unit] 헤더 아이 추가", () => {
  const ONE_CHILD = JSON.stringify({
    v: 1,
    activeId: "c1",
    children: [{ id: "c1", birthdate: "2026-04-30", completed: [] }],
  });

  it("U-30 [unit] 아이가 없으면 '아이 추가' 버튼이 없고, 있으면 버튼(expanded=false)이 있으며 누르면 header-add-panel 안에 생년월일 → 이름 순의 추가 폼이 뜬다", async () => {
    const empty = await renderHeader();
    expect(empty.queryByTestId("header-add-child-button")).toBeNull();
    await screen.unmount();

    await seedStorage({ [STORAGE_KEYS.children]: ONE_CHILD });
    const scope = await renderHeader();
    const button = scope.getByRole("button", {
      name: "아이 추가",
      expanded: false,
    });

    await fireEvent.press(button);

    expect(button).toBeExpanded();
    const panel = within(scope.getByTestId("header-add-panel"));
    expect(scope.getByTestId("header-add-panel")).toHaveProp("role", "region");
    expect(
      panel
        .getAllByTestId(/^(birthdate-picker-button|child-name-input)$/)
        .map((node) => String(node.props.testID))
    ).toEqual(["birthdate-picker-button", "child-name-input"]);
    expect(panel.getByTestId("birthdate-submit")).toBeDisabled();
    expect(
      within(scope.getByTestId("app-header")).queryByTestId("header-add-panel")
    ).toBeNull();
  });

  it("U-30 [unit] ios에서 메뉴를 열면 폼 제목이 배치된 뒤 그리로 화면 낭독기 포커스를 옮기고, 메뉴 밖을 눌러 닫으면 추가 버튼으로 돌려준다", async () => {
    await seedStorage({ [STORAGE_KEYS.children]: ONE_CHILD });
    const scope = await renderHeader();
    const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    sendEvent.mockClear();
    const replaced = jest.replaceProperty(Platform, "OS", "ios");
    const sentTo = () =>
      sendEvent.mock.calls.map(([node]) => describeHost(node));

    await fireEvent.press(scope.getByTestId("header-add-child-button"));
    expect(sendEvent).not.toHaveBeenCalled();
    const heading = within(scope.getByTestId("header-add-panel")).getByRole(
      "heading",
      { name: "아이 추가" }
    );
    await fireLayout(heading);
    await fireLayout(heading);

    // 폼 제목(Text)으로 1번 옮긴다(제목은 testID가 없어 내용으로 확인한다)
    expect(sendEvent).toHaveBeenCalledTimes(1);
    expect(propsOf(sendEvent.mock.calls[0]?.[0]).children).toBe("아이 추가");

    await fireEvent.press(
      scope.getByTestId("header-add-backdrop", { includeHiddenElements: true })
    );

    expect(scope.queryByTestId("header-add-panel")).toBeNull();
    expect(sentTo().at(-1)).toBe("header-add-child-button(아이 추가)");
    replaced.restore();
  });

  it("U-30 [unit] 웹에서 메뉴를 열면 메뉴 상자(tabIndex -1)에 커밋 직후 focus()를 준다", async () => {
    const focus = await sharedHostFocus();
    await seedStorage({ [STORAGE_KEYS.children]: ONE_CHILD });
    const scope = await renderHeader();
    const replaced = jest.replaceProperty(Platform, "OS", "web");
    focus.mockClear();

    await fireEvent.press(scope.getByTestId("header-add-child-button"));

    expect(focus.mock.contexts.map(describeHost)).toEqual(["header-add-panel"]);
    replaced.restore();
  });
});
