import { screen } from "@testing-library/react-native";

import { Disclaimer } from "@/components/common/Disclaimer";
import { STORAGE_KEYS } from "@/lib/storage";
import { lightTokens } from "@/theme/tokens";

import {
  renderWithProviders,
  seedStorage,
} from "../../../../test-utils/render";

// 의료 면책 문구 Disclaimer(FR-12, 설계서 §5.8) 컴포넌트 테스트. 라우터 없이 renderWithProviders로 렌더한다.
// 리뷰 R3-02(U-08): app/(tabs)/__test__/tabs.test.tsx의 G-5 지원 테스트를 대상 옆으로 옮겼다. describe·it 제목은 그대로라 fullName이 같다.
// 한국어 문구는 Screen.test.tsx(G-5 Screen 셸 + Disclaimer), 화면별 표시는 라우트 테스트(AC-16.x 거울)가 본다.

describe("G-5 공통 컴포넌트와 renderWithProviders", () => {
  it("G-5 Disclaimer: 저장 로케일 en이면 영어 면책 문구다(t('common.disclaimer'))", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderWithProviders(<Disclaimer />);

    expect(await screen.findByTestId("disclaimer")).toHaveTextContent(
      "This information is for reference only. Please consult a pediatrician for accurate medical advice."
    );
  });
});

// U-14: 일정 화면 목록 위에 두는 안내 상자. 상자 배경이 surface라 글자는 textSecondary on surface(CONTRAST_PAIRS 등록 쌍)다.
describe("U-14 Disclaimer placement", () => {
  it("U-14 placement 'top'이면 문구가 왼쪽 정렬이고 감싼 상자가 surface 배경·border 테두리다(라이트 테마)", async () => {
    await renderWithProviders(<Disclaimer placement="top" />);

    const text = await screen.findByTestId("disclaimer");
    expect(text).toHaveStyle({
      textAlign: "left",
      color: lightTokens.textSecondary,
    });
    expect(text.parent).toHaveStyle({
      backgroundColor: lightTokens.surface,
      borderColor: lightTokens.border,
      borderWidth: 1,
    });
  });

  it("U-14 placement를 생략하면(설정 화면 하단) 문구가 가운데 정렬이고 상자 배경이 없다", async () => {
    await renderWithProviders(<Disclaimer />);

    const text = await screen.findByTestId("disclaimer");
    expect(text).toHaveStyle({ textAlign: "center" });
    expect(text.parent).not.toHaveStyle({
      backgroundColor: lightTokens.surface,
    });
  });
});
