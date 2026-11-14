import { screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useToday } from "@/hooks/useToday";
import { toIsoDate } from "@/lib/date";

import {
  appRoutes,
  type Clock,
  FIXED_NOW,
  renderWithProviders,
  TEST_DIR,
} from "../render";

// test-utils renderWithProviders(설계서 §9.4)의 시계 주입 테스트: now 옵션(생략·Date·함수)이 ClockContext로 들어가 useToday()에 닿는다.
// 리뷰 R3-02(U-08): app/(tabs)/__test__/tabs.test.tsx의 G-5 지원 테스트를 대상(test-utils/render.tsx) 옆으로 옮겼다.
// describe·it 제목은 그대로라 fullName이 같다(같은 describe의 Screen·Disclaimer 테스트는 src/components/common/__test__/에 있다).

/** ClockContext 주입 확인용 프로브: useToday()를 YYYY-MM-DD로 표시한다 */
function TodayProbe() {
  const today = useToday();
  return <Text testID="today">{toIsoDate(today)}</Text>;
}

describe("G-5 공통 컴포넌트와 renderWithProviders", () => {
  // [now 설명, 기대 YYYY-MM-DD, now] — 제목의 %s는 앞 두 인자를 쓴다
  it.each<[string, string, Clock | undefined]>([
    ["생략(FIXED_NOW)", toIsoDate(FIXED_NOW), undefined],
    ["Date(2030-01-15 09:30)", "2030-01-15", new Date(2030, 0, 15, 9, 30)],
    ["() => Date(2031-06-01)", "2031-06-01", () => new Date(2031, 5, 1)],
  ])(
    "G-5 renderWithProviders now %s → useToday()가 %s를 돌려준다",
    async (_label, expected, now) => {
      await renderWithProviders(<TodayProbe />, now ? { now } : {});

      expect(await screen.findByTestId("today")).toHaveTextContent(expected);
    }
  );
});

// U-17: 라우트 화면 테스트가 app/(tabs)/__test__/에 있으므로 renderApp의 라우트 목록은 __test__/를 빼야 한다.
// 빼지 않으면 jest의 라우트 트리에 /__test__/… 라우트가 생겨, Metro가 이 폴더를 빼는 실제 앱과 달라진다.
describe("U-17 renderApp 라우트 목록(appRoutes)", () => {
  it("U-17 app/의 라우트 파일만 담고 __test__/ 안의 파일은 뺀다", () => {
    const keys = Object.keys(appRoutes());

    // 범위 가드: 루트·탭 레이아웃과 탭 화면이 들어 있다
    expect(keys).toEqual(
      expect.arrayContaining([
        "_layout",
        "(tabs)/_layout",
        "(tabs)/index",
        "(tabs)/schedule",
        "(tabs)/settings",
      ])
    );
    expect(keys.filter((key) => key.split("/").includes(TEST_DIR))).toEqual([]);
  });
});
