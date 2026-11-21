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

// 면책 문구 아래 줄: 데이터 출처와 마지막 업데이트 날짜(vaccinations.json의 updatedAt)를 앱 언어로 보여 준다.
describe("Disclaimer 출처·업데이트 날짜", () => {
  it("한국어면 disclaimer-source가 질병관리청·대한소아청소년과학회 출처와 '최종 업데이트: 2026년 11월 7일'을 보여 주고 면책 문구는 그대로다", async () => {
    await renderWithProviders(<Disclaimer />);

    expect(await screen.findByTestId("disclaimer-source")).toHaveTextContent(
      "출처: 질병관리청 「2026년 국가예방접종 지침」, 대한소아청소년과학회 권장 일정 · 최종 업데이트: 2026년 11월 7일"
    );
    expect(screen.getByTestId("disclaimer")).toHaveTextContent(
      "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요."
    );
  });

  it("저장 로케일 en이면 날짜가 영어 표기(November 7, 2026)이고 글자색은 textSecondary다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderWithProviders(<Disclaimer placement="top" />);

    const source = await screen.findByTestId("disclaimer-source");
    expect(source).toHaveTextContent(/Last updated: November 7, 2026$/);
    expect(source).toHaveStyle({
      textAlign: "left",
      color: lightTokens.textSecondary,
    });
  });
});
