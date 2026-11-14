import { fireEvent, renderHook, screen } from "@testing-library/react-native";
import { Tabs } from "expo-router/js-tabs";
import { renderRouter, testRouter } from "expo-router/testing-library";
import type { ComponentType, ReactElement } from "react";
import { View, type ViewProps } from "react-native";

import { useBlurInert as useNativeBlurInert } from "@/hooks/useBlurInert";
import type { BlurInertProps } from "@/hooks/useBlurInert.types";
import { useBlurInert as useWebBlurInert } from "@/hooks/useBlurInert.web";

import { renderApp } from "../../../test-utils/render";

// 리뷰 라운드 2 회귀 테스트. 제목은 리뷰 ID(R2-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// R2-01: 웹에서 떠난 탭 화면은 언마운트되지 않고 활성 화면 뒤에 남으므로, 화면 셸(Screen)이 useBlurInert의 props(웹: 포커스되지
// 않은 화면이면 inert)를 받아 그 화면을 Tab 순서·보조기기에서 뺀다. jest(iOS 프리셋)는 '@/hooks/useBlurInert'를 네이티브 no-op으로
// 풀므로 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다(같은 폴더의 useRovingFocus.test.tsx와 같은 방식).
// 실제 브라우저의 Tab 순서·focus()는 e2e/review-r2-a11y.spec.ts가 본다.

/** Screen처럼 inert를 받는 View. RN 타입에는 inert가 없어 더 많은 props를 받는 타입으로 대입한다(단언 없음) */
const InertView: ComponentType<ViewProps & BlurInertProps> = View;

/** 웹 훅의 props를 화면 셸처럼 최외곽 View에 주는 탭 화면 */
function WebProbeScreen({ name }: { readonly name: string }): ReactElement {
  return <InertView testID={`probe-${name}`} {...useWebBlurInert()} />;
}

/** probe 화면의 inert prop. 떠난 탭 화면은 화면 낭독기에서 숨겨지므로 includeHiddenElements로 찾는다 */
function inertOf(name: string): unknown {
  return screen.getByTestId(`probe-${name}`, { includeHiddenElements: true })
    .props.inert;
}

describe("R2-01 떠난 탭 화면의 inert(useBlurInert)", () => {
  it("R2-01 웹 구현(useBlurInert.web)은 포커스된 탭 화면에 inert false, 다른 탭으로 떠난 화면에 inert true를 주고, 그 화면으로 돌아오면 다시 false다(떠난 화면은 언마운트되지 않고 남는다)", async () => {
    // SDK 58 탭은 선언한 화면만 렌더한다(app/(tabs)/_layout.tsx와 같은 이유로 Tabs.Screen을 명시)
    await renderRouter(
      {
        _layout: () => (
          <Tabs screenOptions={{ headerShown: false }}>
            <Tabs.Screen name="index" />
            <Tabs.Screen name="second" />
          </Tabs>
        ),
        index: () => <WebProbeScreen name="first" />,
        second: () => <WebProbeScreen name="second" />,
      },
      { initialUrl: "/" }
    );

    expect(inertOf("first")).toBe(false);

    await testRouter.navigate("/second");

    expect(inertOf("second")).toBe(false);
    expect(inertOf("first")).toBe(true);

    await testRouter.navigate("/");

    expect(inertOf("first")).toBe(false);
    expect(inertOf("second")).toBe(true);
  });

  it("R2-01 네이티브 구현(no-op)은 props를 더하지 않아 앱의 세 화면 셸(screen-home·schedule·settings)에 inert가 없다(네이티브는 react-native-screens가 떠난 화면을 분리한다)", async () => {
    const { result } = await renderHook(() => useNativeBlurInert());
    expect(result.current).toEqual({});

    await renderApp({ initialUrl: "/" });
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "접종 일정" }));
    expect(await screen.findByTestId("screen-schedule")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "설정" }));
    expect(await screen.findByTestId("screen-settings")).toBeOnTheScreen();

    for (const testID of [
      "screen-home",
      "screen-schedule",
      "screen-settings",
    ]) {
      expect(
        screen.getByTestId(testID, { includeHiddenElements: true })
      ).not.toHaveProp("inert");
    }
  });
});
