import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Disclaimer } from "@/components/common/Disclaimer";
import { Screen } from "@/components/common/Screen";
import { lightTokens } from "@/theme/tokens";

import {
  closestScrollView,
  renderWithProviders,
} from "../../../../test-utils/render";

// 화면 셸 Screen(설계서 §5.8) 컴포넌트 테스트. 라우터 없이 renderWithProviders(루트 레이아웃과 같은 Provider 트리 + LoadingGate)로 렌더한다.
// 리뷰 R3-02(U-08): 라우트 화면 테스트 파일에 있던 지원 테스트를 대상 옆으로 옮겼다. describe·it 제목은 그대로라 fullName이 같다.
// - G-5: app/(tabs)/__test__/tabs.test.tsx(P7 당시 유일한 jest 파일)에서 옮김. 같은 describe의 Disclaimer 테스트는 Disclaimer.test.tsx,
//   renderWithProviders now 주입 테스트는 test-utils/__test__/render.test.tsx에 있다.
// - R1-02 [지원]: app/(tabs)/__test__/home.test.tsx에서 옮김. 홈 화면 자체의 스크롤 구조(R1-02)는 그 파일에 남아 있다.

describe("G-5 공통 컴포넌트와 renderWithProviders", () => {
  it("G-5 renderWithProviders: Screen 셸과 Disclaimer를 Provider 트리(LoadingGate 포함) 안에서 렌더한다 — screen-* 배경은 background 토큰, disclaimer 텍스트는 common.disclaimer(ko)", async () => {
    await renderWithProviders(
      <Screen testID="screen-settings" scroll>
        <Disclaimer />
      </Screen>
    );

    expect(await screen.findByTestId("disclaimer")).toHaveTextContent(
      "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요."
    );
    expect(screen.getByTestId("screen-settings")).toHaveStyle({
      backgroundColor: lightTokens.background,
    });
    expect(screen.queryByTestId("loading-gate")).toBeNull();
  });
});

describe("R1-02 홈 본문 스크롤", () => {
  it("R1-02 [지원] Screen은 scroll을 주지 않으면(기본값 false) 본문을 ScrollView에 담지 않는다(설계서 §5.8 scroll?: boolean)", async () => {
    await renderWithProviders(
      <Screen testID="screen-home">
        <Text testID="screen-body">본문</Text>
      </Screen>
    );

    expect(closestScrollView(await screen.findByTestId("screen-body"))).toBe(
      null
    );
    expect(screen.getByTestId("screen-home")).toBeOnTheScreen();
  });
});
