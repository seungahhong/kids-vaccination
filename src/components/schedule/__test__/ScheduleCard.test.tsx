import { fireEvent, screen, within } from "@testing-library/react-native";
import { View } from "react-native";

import { ScheduleCard } from "@/components/schedule/ScheduleCard";
import { generateSchedule } from "@/lib/schedule";
import { STORAGE_KEYS } from "@/lib/storage";
import { VACCINATIONS } from "@/lib/vaccinationData";
import { lightTokens } from "@/theme/tokens";
import type { ScheduleItem } from "@/types";

import {
  FIXED_NOW,
  renderWithProviders,
  seedStorage,
} from "../../../../test-utils/render";

// 일정 카드 컴포넌트 수준 거울 테스트(FR-06 US-8·US-9, [unit] — 공식 판정은 e2e/schedule.spec.ts, PRD §2.3.0).
// 항목은 실제 접종 데이터로 만든다: 생년월일 2026-04-30, 기준 시각 FIXED_NOW(2026-10-18 15:00) → bcg-1 지남, hepb-3 곧 접종, hib-4 예정.
// 카드 구조(U-02): 컨테이너 schedule-card-{id}(role 없음) > 헤더 토글 card-toggle(role=button, expanded) + 펼침 시 형제 card-details.

const ITEMS = generateSchedule(new Date(2026, 3, 30), VACCINATIONS, FIXED_NOW);

function itemOf(id: string): ScheduleItem {
  const item = ITEMS.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`일정 항목이 없다: ${id}`);
  return item;
}

/** 카드 여러 장을 Provider 트리 안에 렌더하고 하이드레이션(LoadingGate)이 끝나길 기다린다 */
async function renderCards(ids: readonly string[]): Promise<void> {
  await renderWithProviders(
    <View>
      {ids.map((id) => (
        <ScheduleCard key={id} item={itemOf(id)} />
      ))}
    </View>
  );
  await screen.findByTestId(`schedule-card-${ids[0] ?? ""}`);
}

function cardScope(id: string) {
  return within(screen.getByTestId(`schedule-card-${id}`));
}

/** 카드 안에 texts가 각각 정확히 일치하는 텍스트 요소로 있다 */
function expectCardTexts(id: string, texts: readonly string[]): void {
  const card = cardScope(id);
  for (const text of texts) {
    expect(card.getByText(text)).toBeOnTheScreen();
  }
}

describe("AC-8.1 [unit] 카드 이름+회차·배지·질병·날짜", () => {
  it("AC-8.1 [unit] 생년월일 2026-04-30이면 bcg-1은 'BCG(피내용) 1차'·'지남'·'결핵'·'2026년 4월 30일 ~ 2026년 5월 30일'(4주 이내), hib-4는 'Hib(뇌수막염) 4차'·'예정'·'2027년 4월 30일 ~ 2027년 7월 30일', hepb-3은 'B형간염 3차'·'곧 접종'·'2026년 10월 30일'을 포함한다", async () => {
    await renderCards(["bcg-1", "hib-4", "hepb-3"]);

    expectCardTexts("bcg-1", [
      "BCG(피내용) 1차",
      "지남",
      "결핵",
      "2026년 4월 30일 ~ 2026년 5월 30일",
    ]);
    expectCardTexts("hib-4", [
      "Hib(뇌수막염) 4차",
      "예정",
      "2027년 4월 30일 ~ 2027년 7월 30일",
    ]);
    expectCardTexts("hepb-3", ["B형간염 3차", "곧 접종", "2026년 10월 30일"]);
  });
});

// 상태 점 색은 원본 그대로다(비텍스트, P-08): 곧 접종 #f97316 = rgb(249, 115, 22), 예정 #14b8a6 = rgb(20, 184, 166),
// 지남(라이트) #d6d3d1 = rgb(214, 211, 209). jest useColorScheme mock은 light다.
describe("AC-8.2 [unit] 상태 점 색(라이트)", () => {
  it("AC-8.2 [unit] 라이트 테마에서 status-dot 배경색이 hepb-3(곧 접종) #f97316, hib-4(예정) #14b8a6, bcg-1(지남) #d6d3d1이다", async () => {
    await renderCards(["bcg-1", "hib-4", "hepb-3"]);

    expect(cardScope("hepb-3").getByTestId("status-dot")).toHaveStyle({
      backgroundColor: "#f97316",
    });
    expect(cardScope("hib-4").getByTestId("status-dot")).toHaveStyle({
      backgroundColor: "#14b8a6",
    });
    expect(cardScope("bcg-1").getByTestId("status-dot")).toHaveStyle({
      backgroundColor: "#d6d3d1",
    });
  });
});

describe("AC-8.3 [unit] 영어 카드 텍스트", () => {
  it("AC-8.3 [unit] 저장값 locale 'en'이면 bcg-1은 'BCG (Intradermal) Dose 1'·'Past'·'April 30, 2026 ~ May 30, 2026', hib-4는 'Hib (Meningitis) Dose 4'·'April 30, 2027 ~ July 30, 2027', hepb-3은 'Hepatitis B Dose 3'·'Coming Soon'을 포함하고 bcg-1에 원본 표기 '1dose'는 없다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderCards(["bcg-1", "hib-4", "hepb-3"]);

    expectCardTexts("bcg-1", [
      "BCG (Intradermal) Dose 1",
      "Past",
      "April 30, 2026 ~ May 30, 2026",
    ]);
    expect(
      cardScope("bcg-1").queryAllByText(/1dose/, {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);
    expectCardTexts("hib-4", [
      "Hib (Meningitis) Dose 4",
      "April 30, 2027 ~ July 30, 2027",
    ]);
    expectCardTexts("hepb-3", ["Hepatitis B Dose 3", "Coming Soon"]);
  });
});

const DETAIL_HEADINGS_KO = ["상세 정보", "부작용", "참고사항"] as const;

// U-02: 헤더만 토글 버튼이고 상세는 토글 버튼 밖 형제 영역이다. 토글의 접근 이름은 헤더 텍스트(이름+회차·배지·질병·날짜)다(G-6 (c)).
describe("AC-9.1 [unit] 카드 펼치기", () => {
  it("AC-9.1 [unit] 접힌 bcg-1의 토글 버튼(expanded=false, 상세 정보 0개)을 누르면 expanded=true가 되고 상세 정보·부작용·참고사항 heading 각 1개와 본문이 토글 버튼 밖 card-details에 표시되며 'AI에게 더 물어보기'는 0개다", async () => {
    await renderCards(["bcg-1"]);
    const card = cardScope("bcg-1");
    const toggle = card.getByRole("button", {
      name: /^BCG\(피내용\) 1차 지남 필수 결핵 2026년 4월 30일 ~ 2026년 5월 30일$/,
      expanded: false,
    });
    expect(toggle).toBe(card.getByTestId("card-toggle"));
    expect(card.queryAllByText("상세 정보")).toHaveLength(0);
    expect(card.queryByTestId("card-details")).toBeNull();

    await fireEvent.press(toggle);

    expect(card.getByTestId("card-toggle")).toBeExpanded();
    for (const text of [
      "상세 정보",
      "결핵을 예방하는 백신으로, 출생 후 4주 이내에 접종합니다.",
      "부작용",
      "접종 부위 궤양, 림프절 비대 (드물게)",
      "참고사항",
      "국가 지원 백신은 피내용 BCG이며, 경피용 BCG는 국가 지원 대상이 아니라 비용을 본인이 부담합니다. 미숙아는 담당 의사와 상담 후 접종 시기를 결정합니다.",
    ]) {
      expect(card.getByText(text)).toBeOnTheScreen();
    }
    for (const name of DETAIL_HEADINGS_KO) {
      expect(card.getAllByRole("heading", { name })).toHaveLength(1);
    }
    const details = card.getByTestId("card-details");
    expect(
      within(card.getByTestId("card-toggle")).queryByTestId("card-details")
    ).toBeNull();
    expect(within(details).getByText("상세 정보")).toBeOnTheScreen();
    expect(
      screen.queryAllByText("AI에게 더 물어보기", {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);
  });
});

describe("AC-9.2 [unit] 카드 접기와 카드별 독립", () => {
  it("AC-9.2 [unit] 펼친 bcg-1의 토글 버튼을 다시 누르면 expanded=false이고 상세 정보 0개이며, bcg-1이 펼쳐진 동안에도 hepb-1 토글은 expanded=false다", async () => {
    await renderCards(["bcg-1", "hepb-1"]);
    const bcg1 = cardScope("bcg-1");
    const hepb1Toggle = cardScope("hepb-1").getByTestId("card-toggle");

    await fireEvent.press(bcg1.getByTestId("card-toggle"));
    expect(bcg1.getByTestId("card-toggle")).toBeExpanded();
    expect(bcg1.getByText("상세 정보")).toBeOnTheScreen();
    expect(hepb1Toggle).not.toBeExpanded();
    expect(cardScope("hepb-1").queryByTestId("card-details")).toBeNull();

    await fireEvent.press(bcg1.getByTestId("card-toggle"));

    expect(bcg1.getByTestId("card-toggle")).not.toBeExpanded();
    expect(
      bcg1.getByRole("button", { name: /^BCG\(피내용\) 1차/, expanded: false })
    ).toBeOnTheScreen();
    expect(bcg1.queryAllByText("상세 정보")).toHaveLength(0);
    expect(bcg1.queryByTestId("card-details")).toBeNull();
    expect(hepb1Toggle).not.toBeExpanded();
  });
});

describe("AC-9.3 [unit] 영어 상세 정보", () => {
  it("AC-9.3 [unit] 저장값 locale 'en'에서 bcg-1을 펼치면 영어 설명과 부작용이 표시된다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderCards(["bcg-1"]);
    const card = cardScope("bcg-1");

    await fireEvent.press(card.getByRole("button", { expanded: false }));

    expect(
      card.getByText(
        "A vaccine to prevent tuberculosis, administered within 4 weeks of birth."
      )
    ).toBeOnTheScreen();
    expect(
      card.getByText("Injection site ulcer, lymph node enlargement (rare)")
    ).toBeOnTheScreen();
    for (const name of ["Details", "Side Effects", "Notes"]) {
      expect(card.getAllByRole("heading", { name })).toHaveLength(1);
    }
  });
});

// U-15: 분류 배지 category-badge(필수 = national, 선택 = optional)는 상태 배지 옆, 토글 버튼 안에 있다.
// 실제 데이터의 선택 접종에 기대지 않도록 선택 카드는 bcg-1 항목의 category만 바꿔 만든다.
describe("U-15 [unit] 분류 배지", () => {
  /** bcg-1 항목을 category optional로 바꾼 사본(id는 optionalbcg-1) */
  function optionalItem(): ScheduleItem {
    const item = itemOf("bcg-1");
    return {
      ...item,
      id: "optionalbcg-1",
      vaccination: { ...item.vaccination, category: "optional" },
    };
  }

  it("U-15 [unit] 라이트 테마에서 national 카드(bcg-1)는 '필수'(badgeNational 색), optional 카드는 '선택'(badgeOptional 색)이고 둘 다 토글 버튼 안에 있다", async () => {
    await renderWithProviders(
      <View>
        <ScheduleCard item={itemOf("bcg-1")} />
        <ScheduleCard item={optionalItem()} />
      </View>
    );
    await screen.findByTestId("schedule-card-bcg-1");

    const national = cardScope("bcg-1").getByTestId("category-badge");
    const optional = cardScope("optionalbcg-1").getByTestId("category-badge");
    expect(national).toHaveTextContent("필수");
    expect(national).toHaveStyle({
      backgroundColor: lightTokens.badgeNationalBackground,
    });
    expect(within(national).getByText("필수")).toHaveStyle({
      color: lightTokens.badgeNationalText,
    });
    expect(optional).toHaveTextContent("선택");
    expect(optional).toHaveStyle({
      backgroundColor: lightTokens.badgeOptionalBackground,
    });
    expect(within(optional).getByText("선택")).toHaveStyle({
      color: lightTokens.badgeOptionalText,
    });
    for (const id of ["bcg-1", "optionalbcg-1"]) {
      const card = cardScope(id);
      expect(
        within(card.getByTestId("card-toggle")).getByTestId("category-badge")
      ).toBeOnTheScreen();
    }
  });

  it("U-15 [unit] 저장값 locale 'en'이면 분류 배지가 'Required'·'Optional'이다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderWithProviders(
      <View>
        <ScheduleCard item={itemOf("bcg-1")} />
        <ScheduleCard item={optionalItem()} />
      </View>
    );
    await screen.findByTestId("schedule-card-bcg-1");

    expect(cardScope("bcg-1").getByTestId("category-badge")).toHaveTextContent(
      "Required"
    );
    expect(
      cardScope("optionalbcg-1").getByTestId("category-badge")
    ).toHaveTextContent("Optional");
  });
});

// U-15: 실제 데이터의 분류. 수두는 백신이 필수이고 2차만 회차 category가 선택이다. RSV 항체주사는 백신 전체가 선택이다.
describe("U-15 [unit] 실제 데이터 분류 배지", () => {
  it("U-15 [unit] 생년월일 2026-04-30이면 var-1은 '필수', var-2(회차 category)와 nirsevimab-1은 '선택'이다", async () => {
    await renderCards(["var-1", "var-2", "nirsevimab-1"]);

    expect(cardScope("var-1").getByTestId("category-badge")).toHaveTextContent(
      "필수"
    );
    expect(cardScope("var-2").getByTestId("category-badge")).toHaveTextContent(
      "선택"
    );
    expect(
      cardScope("nirsevimab-1").getByTestId("category-badge")
    ).toHaveTextContent("선택");
    expectCardTexts("nirsevimab-1", [
      "RSV 항체주사(니르세비맙) 1차",
      "RSV(호흡기세포융합바이러스) 감염",
    ]);
  });
});
