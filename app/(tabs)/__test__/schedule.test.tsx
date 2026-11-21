import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, AppState, Platform } from "react-native";

import { STORAGE_KEYS, type StorageKey } from "@/lib/storage";
import { MIN_TOUCH_TARGET } from "@/theme/tokens";

import {
  deferStorage,
  flushRouterMacrotask,
  hostWithProps,
  renderApp,
  restoreDefaultImplementationAfterEach,
  seedStorage,
  sharedHostFocus,
  spyAppState,
} from "../../../test-utils/render";

// 일정 화면 수준(FR-03·04·05·07·09·12, 영속화 공통). TDD 판정: AC-5.6(앱 복귀 시 상태 재계산), AC-10.2(하이드레이션 게이트).
// 거울([unit], 공식 판정 미사용 — PRD §2.3.0): AC-4.6, 5.4, 5.5, 6.1, 6.2, 7.1~7.4, 10.1, 12.2, 16.1, 18.5.
// 카드 내부(AC-8.x, 9.x) 거울은 src/components/schedule/__test__/ScheduleCard.test.tsx에 있다.
// renderApp은 실제 app/ 디렉터리를 renderRouter로 로드한다(루트 레이아웃·LoadingGate·탭 포함, 설계서 §9.5).
// 기본 주입 시각은 로컬 2026-10-18 15:00(FIXED_NOW)이다. jest iOS 프리셋에서 하단 탭의 host role은 button이라
// 일정 화면의 role=tab은 필터 3개뿐이다(웹은 하단 탭도 tab이므로 E2E는 이름·범위로 한정한다).

const EMPTY_TEXT_KO = "생년월일을 먼저 입력해주세요";
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
// 2026-04-30 출생·필터 "전체"의 화면 순서(AC-6.1, U-13·U-15): 접종할 구역(출생 시 RSV 항체주사 ~ 만 12세 6개월 HPV 2차)
// 다음 지난 구역(출생 시~생후 4개월). 출생 시(0) 그룹은 두 구역에 나뉘어 두 번 나온다.
const GROUP_MONTHS = [
  0, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150, 0, 1, 2, 4,
] as const;
const GROUP_LABELS_KO = [
  "출생 시",
  "생후 6개월",
  "생후 7개월",
  "생후 12개월",
  "생후 15개월",
  "생후 18개월",
  "만 2세",
  "만 4세",
  "만 6세",
  "만 11세",
  "만 12세",
  "만 12세 6개월",
  "출생 시",
  "생후 1개월",
  "생후 2개월",
  "생후 4개월",
] as const;
const PAST_SECTION_KO = "지난 접종";

type Scope = ReturnType<typeof within>;

// jest 프리셋의 AppState.addEventListener는 이미 jest.fn이라 spyAppState의 구현 설정이 restoreAllMocks로 되돌아가지 않는다(P4 메모).
// 기본 구현을 테스트마다 복원한다.
restoreDefaultImplementationAfterEach(jest.mocked(AppState.addEventListener));

/** 저장값을 시드하고 /schedule을 열어 하이드레이션이 끝난 일정 화면 범위 질의를 돌려준다 */
async function openSchedule(
  values: Partial<Record<StorageKey, string>> = {}
): Promise<Scope> {
  await seedStorage(values);
  await renderApp({ initialUrl: "/schedule" });
  return within(await screen.findByTestId("screen-schedule"));
}

/** 숨김 요소까지 포함해 testID가 pattern과 맞는 요소 수(E2E의 toHaveCount처럼 센다) */
function countByTestId(pattern: string | RegExp): number {
  return screen.queryAllByTestId(pattern, { includeHiddenElements: true })
    .length;
}

/** 카드 안의 testID 요소(배지·날짜 등) */
function inCard(schedule: Scope, id: string, testID: string) {
  return within(schedule.getByTestId(`schedule-card-${id}`)).getByTestId(
    testID
  );
}

/** 카드 내 배지(status-badge) 중 텍스트가 정확히 label인 개수 */
function countBadges(schedule: Scope, label: string): number {
  return schedule
    .queryAllByTestId("status-badge")
    .filter((badge) => within(badge).queryByText(label) !== null).length;
}

/** 선택한 필터 탭만 selected다(role tab = testID filter-*) */
function expectSelectedFilter(
  schedule: Scope,
  selected: "all" | "upcoming" | "past"
): void {
  const names = { all: "전체", upcoming: "예정", past: "지남" } as const;
  for (const key of ["all", "upcoming", "past"] as const) {
    const tab = schedule.getByRole("tab", { name: names[key] });
    expect(tab).toBe(schedule.getByTestId(`filter-${key}`));
    if (key === selected) {
      expect(tab).toBeSelected();
    } else {
      expect(tab).not.toBeSelected();
    }
  }
}

/** 트리(문서) 순서대로 그룹 헤더와 카드를 읽어 그룹 헤더 testID별 카드 id 목록으로 묶는다(AC-6.1 그룹별 카드 수) */
function groupLayout(schedule: Scope) {
  const groups: { header: string; cards: string[] }[] = [];
  for (const node of schedule.getAllByTestId(
    /^(group-header-|schedule-card-)/
  )) {
    const testID = String(node.props.testID);
    if (testID.startsWith("group-header-")) {
      groups.push({ header: testID, cards: [] });
      continue;
    }
    const current = groups[groups.length - 1];
    if (!current) throw new Error(`그룹 헤더 앞에 카드가 있다: ${testID}`);
    current.cards.push(testID.replace("schedule-card-", ""));
  }
  return groups;
}

// ---------------------------------------------------------------------------
// TDD 판정 AC
// ---------------------------------------------------------------------------

// FR-07 US-10. 루트 LoadingGate가 세 키 하이드레이션까지 Slot을 막으므로(P-07) 지연 중에는 일정 화면 자체가 없다.
describe("AC-10.2 하이드레이션 게이트와 빈 상태", () => {
  it("AC-10.2 (a) getItem이 지연 Promise인 동안 일정 화면을 렌더하면 '생년월일을 먼저 입력해주세요'가 렌더되지 않고, null로 resolve하면 빈 상태 텍스트가 렌더된다", async () => {
    const storage = deferStorage([STORAGE_KEYS.birthdate]);
    await renderApp({ initialUrl: "/schedule" });

    expect(
      screen.queryByText(EMPTY_TEXT_KO, { includeHiddenElements: true })
    ).toBeNull();
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();

    await storage.resolve(STORAGE_KEYS.birthdate, null);

    expect(await screen.findByText(EMPTY_TEXT_KO)).toBeOnTheScreen();
    expect(screen.getByTestId("screen-schedule")).toBeOnTheScreen();
    expect(screen.queryByTestId("loading-gate")).toBeNull();
  });

  it("AC-10.2 (b) 별도 렌더에서 getItem을 '2024-01-31'로 resolve하면 빈 상태 텍스트 없이 카드 41개가 렌더된다", async () => {
    const storage = deferStorage([STORAGE_KEYS.birthdate]);
    await renderApp({ initialUrl: "/schedule" });

    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();
    expect(countByTestId(/^schedule-card-/)).toBe(0);

    await storage.resolve(STORAGE_KEYS.birthdate, "2024-01-31");

    expect(await screen.findAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expect(
      screen.queryByText(EMPTY_TEXT_KO, { includeHiddenElements: true })
    ).toBeNull();
    expect(countByTestId("schedule-empty")).toBe(0);
  });
});

// FR-03 US-5. 일정 useMemo는 todayKey(toIsoDate(useToday()))에 의존하므로 앱 복귀 시 날짜가 바뀌면 상태를 다시 계산한다(설계서 §5.9).
describe("AC-5.6 앱 복귀 시 날짜가 바뀌면 상태 재계산", () => {
  it("AC-5.6 저장값 2026-09-18, 시계 2026-10-18 15:00에서 hepb-2(시작 2026-10-18) 배지가 '곧 접종'이고, (1) 같은 날 23:00에 background→active면 그대로, (2) 2026-10-19 09:00에 background→active면 '지남'으로 바뀐다", async () => {
    const appState = spyAppState();
    let clockNow = new Date(2026, 9, 18, 15, 0, 0);
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2026-09-18" });
    await renderApp({ initialUrl: "/schedule", now: () => clockNow });
    await screen.findByTestId("schedule-card-hepb-2");
    const hepb2Badge = () =>
      within(screen.getByTestId("schedule-card-hepb-2")).getByTestId(
        "status-badge"
      );

    expect(hepb2Badge()).toHaveTextContent("곧 접종");
    expect(appState.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );

    // (1) 같은 날 밤: 날짜가 그대로라 상태도 그대로다
    clockNow = new Date(2026, 9, 18, 23, 0, 0);
    await appState.emit("background");
    await appState.emit("active");
    expect(hepb2Badge()).toHaveTextContent("곧 접종");

    // (2) 다음 날 아침 복귀: 오늘이 2026-10-19가 되어 2026-10-18 시작 항목은 지남이다(앱 재시작 불필요)
    clockNow = new Date(2026, 9, 19, 9, 0, 0);
    await appState.emit("background");
    await appState.emit("active");
    expect(hepb2Badge()).toHaveTextContent("지남");
  });
});

// ---------------------------------------------------------------------------
// 거울 테스트(E2E AC의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0)
// ---------------------------------------------------------------------------

// 말일 고정 월 덧셈(T6 결함 2)이 화면 날짜에 반영된다.
describe("AC-4.6 [unit] 말일 출생 일정 날짜", () => {
  it("AC-4.6 [unit] 생년월일 2024-01-31을 저장하고 일정 화면을 보면 hepb-2 날짜가 '2024년 2월 29일'(원본 결함이면 3월 2일), dtap-1이 '2024년 3월 31일'이고 카드가 41개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2024-01-31",
    });

    expect(inCard(schedule, "hepb-2", "schedule-date")).toHaveTextContent(
      "2024년 2월 29일"
    );
    expect(inCard(schedule, "dtap-1", "schedule-date")).toHaveTextContent(
      "2024년 3월 31일"
    );
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
  });
});

// 기준일 2026-10-18의 상태 집계는 lib AC-5.3과 같다(past 13 / soon 8 / upcoming 20).
describe("AC-5.4 [unit] 2026-04-30 출생 상태 배지", () => {
  it("AC-5.4 [unit] 생년월일 2026-04-30·필터 전체이면 카드 내 배지가 지남 13·곧 접종 8·예정 20이고 bcg-1은 지남, hepb-3은 곧 접종, hib-4는 예정이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    expect(schedule.getAllByTestId("status-badge")).toHaveLength(41);
    expect(countBadges(schedule, "지남")).toBe(13);
    expect(countBadges(schedule, "곧 접종")).toBe(8);
    expect(countBadges(schedule, "예정")).toBe(20);
    expect(inCard(schedule, "bcg-1", "status-badge")).toHaveTextContent("지남");
    expect(inCard(schedule, "hepb-3", "status-badge")).toHaveTextContent(
      "곧 접종"
    );
    expect(inCard(schedule, "hib-4", "status-badge")).toHaveTextContent("예정");
  });
});

// 오늘 시작은 지남이 아니라 곧 접종이고, 오늘+31일은 예정이다(lib AC-5.1).
describe("AC-5.5 [unit] 오늘 출생 상태 배지", () => {
  it("AC-5.5 [unit] 생년월일 2026-10-18(오늘)이면 bcg-1·hepb-1 배지가 곧 접종, hepb-2는 '2026년 11월 18일'·예정이고 배지가 지남 0·곧 접종 3(bcg-1·hepb-1·nirsevimab-1)·예정 38이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-10-18",
    });

    expect(inCard(schedule, "bcg-1", "status-badge")).toHaveTextContent(
      "곧 접종"
    );
    expect(inCard(schedule, "hepb-1", "status-badge")).toHaveTextContent(
      "곧 접종"
    );
    expect(inCard(schedule, "hepb-2", "schedule-date")).toHaveTextContent(
      "2026년 11월 18일"
    );
    expect(inCard(schedule, "hepb-2", "status-badge")).toHaveTextContent(
      "예정"
    );
    expect(schedule.getAllByTestId("status-badge")).toHaveLength(41);
    expect(countBadges(schedule, "지남")).toBe(0);
    expect(countBadges(schedule, "곧 접종")).toBe(3);
    expect(countBadges(schedule, "예정")).toBe(38);
  });
});

// 그룹 헤더는 role=heading이고 라벨은 formatMonthsLabel(lib AC-6.3)이다.
describe("AC-6.1 [unit] 월령 그룹 타임라인", () => {
  it("AC-6.1 [unit] 생년월일 2026-04-30·필터 전체이면 그룹 헤더가 접종할 출생 시 ~ 만 12세 6개월, 구역 제목 '지난 접종', 지난 출생 시 ~ 생후 4개월 순서로 16개, 그룹별 카드 수가 1·7·1·7·2·1·1·3·1·1·2·1·2·1·5·5이고 생후 2개월 그룹은 dtap-1·ipv-1·hib-1·pcv-1·rv-1이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    const headers = schedule.getAllByTestId(/^group-header-/);
    expect(headers).toHaveLength(16);
    GROUP_LABELS_KO.forEach((label, index) => {
      expect(headers[index]).toHaveTextContent(label);
      // 출생 시는 두 구역에 한 번씩 있어 같은 이름의 heading이 둘이다
      expect(schedule.getAllByRole("heading", { name: label })).toContain(
        headers[index]
      );
    });
    const layout = groupLayout(schedule);
    expect(layout.map((group) => group.header)).toEqual(
      GROUP_MONTHS.map((months) => `group-header-${months}`)
    );
    expect(layout.map((group) => group.cards.length)).toEqual([
      1, 7, 1, 7, 2, 1, 1, 3, 1, 1, 2, 1, 2, 1, 5, 5,
    ]);
    expect(layout[0]?.cards).toEqual(["nirsevimab-1"]);
    expect(layout[14]?.cards).toEqual([
      "dtap-1",
      "ipv-1",
      "hib-1",
      "pcv-1",
      "rv-1",
    ]);
    // 구역 제목은 1개이고 트리 순서상 만 12세 6개월(150) 그룹 헤더 다음, 두 번째 출생 시(0) 그룹 헤더 앞이다
    const pastSection = schedule.getByTestId("schedule-past-section");
    expect(schedule.getByRole("heading", { name: PAST_SECTION_KO })).toBe(
      pastSection
    );
    const outline = schedule
      .getAllByTestId(/^(group-header-|schedule-past-section$)/)
      .map((node) => String(node.props.testID));
    expect(outline.slice(11, 14)).toEqual([
      "group-header-150",
      "schedule-past-section",
      "group-header-0",
    ]);
  });
});

// 라벨은 현재 로케일의 formatMonthsLabel이다.
describe("AC-6.2 [unit] 일본어 그룹 라벨", () => {
  it("AC-6.2 [unit] AC-6.1에 저장값 locale 'ja'를 더하면 그룹 헤더가 出生時 ~ 12歳6ヶ月, 出生時 ~ 生後4ヶ月 순서의 일본어 라벨이고 구역 제목은 過去の接種다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.locale]: "ja",
    });

    const labels = [
      "出生時",
      "生後6ヶ月",
      "生後7ヶ月",
      "生後12ヶ月",
      "生後15ヶ月",
      "生後18ヶ月",
      "2歳",
      "4歳",
      "6歳",
      "11歳",
      "12歳",
      "12歳6ヶ月",
      "出生時",
      "生後1ヶ月",
      "生後2ヶ月",
      "生後4ヶ月",
    ];
    const headers = schedule.getAllByTestId(/^group-header-/);
    expect(headers).toHaveLength(16);
    labels.forEach((label, index) => {
      expect(headers[index]).toHaveTextContent(label);
    });
    expect(schedule.getByTestId("schedule-past-section")).toHaveTextContent(
      "過去の接種"
    );
  });
});

// 필터는 role=tablist 안의 role=tab + selected 상태다(설계서 §5.8).
describe("AC-7.1 [unit] 필터 초기 상태", () => {
  it("AC-7.1 [unit] 생년월일 2026-04-30으로 처음 진입하면 필터가 전체·예정·지남 3개(role tab)이고 filter-all만 selected이며 카드는 41개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    const tabs = schedule.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    ["전체", "예정", "지남"].forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
    expectSelectedFilter(schedule, "all");
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
  });
});

// '예정' = soon + upcoming(lib AC-7.5).
describe("AC-7.2 [unit] 예정 필터", () => {
  it("AC-7.2 [unit] '예정'을 누르면 filter-upcoming만 selected, 카드 28개(곧 접종 8 + 예정 20, 지남 0), 그룹 헤더 12개(첫 출생 시, 마지막 만 12세 6개월)이고 구역 제목 schedule-past-section은 0개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    await fireEvent.press(schedule.getByRole("tab", { name: "예정" }));

    expectSelectedFilter(schedule, "upcoming");
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(28);
    expect(countBadges(schedule, "곧 접종")).toBe(8);
    expect(countBadges(schedule, "예정")).toBe(20);
    expect(countBadges(schedule, "지남")).toBe(0);
    const headers = schedule.getAllByTestId(/^group-header-/);
    expect(headers).toHaveLength(12);
    expect(headers[0]).toHaveTextContent("출생 시");
    expect(headers[headers.length - 1]).toHaveTextContent("만 12세 6개월");
    expect(countByTestId("schedule-past-section")).toBe(0);
  });
});

// '지남' = past만, '전체'로 돌아오면 41개다.
describe("AC-7.3 [unit] 지남 필터와 전체 복귀", () => {
  it("AC-7.3 [unit] '지남'을 누르면 카드 13개 전부 배지가 지남이고 그룹 헤더는 출생 시·생후 1개월·생후 2개월·생후 4개월 4개이며 구역 제목은 0개이고, 이어서 '전체'를 누르면 카드 41개·filter-all selected로 돌아온다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    expectSelectedFilter(schedule, "past");
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(13);
    expect(schedule.getAllByTestId("status-badge")).toHaveLength(13);
    expect(countBadges(schedule, "지남")).toBe(13);
    const headers = schedule.getAllByTestId(/^group-header-/);
    expect(headers).toHaveLength(4);
    ["출생 시", "생후 1개월", "생후 2개월", "생후 4개월"].forEach(
      (label, index) => {
        expect(headers[index]).toHaveTextContent(label);
      }
    );
    expect(countByTestId("schedule-past-section")).toBe(0);

    await fireEvent.press(schedule.getByRole("tab", { name: "전체" }));

    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expectSelectedFilter(schedule, "all");
  });
});

// 0건 필터는 필터·면책 문구만 남고 빈 상태는 생년월일 없음 전용이다(설계서 §5.9).
describe("AC-7.4 [unit] 결과 0건 필터", () => {
  it("AC-7.4 [unit] 생년월일 2026-10-18에서 '지남'을 누르면 카드·그룹 헤더 0개이고 필터 3개와 disclaimer는 그대로이며 schedule-empty는 0개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-10-18",
    });
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);

    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    expectSelectedFilter(schedule, "past");
    expect(countByTestId(/^schedule-card-/)).toBe(0);
    expect(countByTestId(/^group-header-/)).toBe(0);
    expect(schedule.getAllByRole("tab")).toHaveLength(3);
    expect(schedule.getByTestId("disclaimer")).toHaveTextContent(DISCLAIMER_KO);
    expect(countByTestId("schedule-empty")).toBe(0);
    expect(
      screen.queryByText(EMPTY_TEXT_KO, { includeHiddenElements: true })
    ).toBeNull();
  });
});

// 빈 상태에서는 필터·면책 문구를 표시하지 않는다(P-12).
describe("AC-10.1 [unit] 생년월일 없음 → 빈 상태와 홈 이동", () => {
  it("AC-10.1 [unit] 저장값 없이 /schedule에 진입하면 schedule-empty 안에 안내 문구와 '홈으로 이동' 버튼이 있고 카드·필터·disclaimer는 0개이며, 버튼을 누르면 경로가 /다", async () => {
    await renderApp({ initialUrl: "/schedule" });
    const empty = await screen.findByTestId("schedule-empty");

    expect(within(empty).getByText(EMPTY_TEXT_KO)).toBeOnTheScreen();
    const goHome = within(empty).getByRole("button", { name: "홈으로 이동" });
    expect(goHome).toBe(within(empty).getByTestId("go-home"));
    expect(countByTestId(/^schedule-card-/)).toBe(0);
    expect(countByTestId(/^filter-/)).toBe(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(countByTestId("disclaimer")).toBe(0);

    await fireEvent.press(goHome);

    expect(screen).toHavePathname("/");
    expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
  });
});

// 제목·필터·배지·날짜·면책 문구가 모두 저장 로케일(ja)을 따른다.
describe("AC-12.2 [unit] 일본어 일정 화면", () => {
  it("AC-12.2 [unit] 저장값 locale 'ja'·생년월일 2026-04-30이면 제목 予防接種日程, 필터 全て·予定·過去, hepb-3 배지 もうすぐ, bcg-1은 過去·2026年4月30日 ~ 2026年5月30日을 포함하고 disclaimer는 일본어다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.locale]: "ja",
    });

    expect(
      schedule.getByRole("heading", { name: "予防接種日程" })
    ).toBeOnTheScreen();
    const tabs = schedule.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    ["全て", "予定", "過去"].forEach((name, index) => {
      expect(tabs[index]).toHaveAccessibleName(name);
    });
    expect(inCard(schedule, "hepb-3", "status-badge")).toHaveTextContent(
      "もうすぐ"
    );
    const bcg1 = within(schedule.getByTestId("schedule-card-bcg-1"));
    expect(bcg1.getByText("過去")).toBeOnTheScreen();
    expect(bcg1.getByText("2026年4月30日 ~ 2026年5月30日")).toBeOnTheScreen();
    expect(schedule.getByTestId("disclaimer")).toHaveTextContent(
      "この情報は参考用です。正確な内容は小児科医にご相談ください。"
    );
  });
});

// E2E의 boundingBox 비교 대신 트리(문서) 순서로 "목록 위"를 본다.
describe("AC-16.1 [unit] 일정 화면 면책 문구", () => {
  it("AC-16.1 [unit] 생년월일 2026-04-30이면 disclaimer가 1개(한국어 문구)이고 트리 순서상 아이 선택(schedule-child-selector, v1.7) 바로 뒤, 필터 filter-all과 첫 카드 schedule-card-nirsevimab-1 앞에 있다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    const disclaimers = schedule.getAllByTestId("disclaimer");
    expect(disclaimers).toHaveLength(1);
    expect(disclaimers[0]).toHaveTextContent(DISCLAIMER_KO);
    const order = schedule
      .getAllByTestId(
        /^(schedule-child-selector|disclaimer|filter-all|schedule-card-.+)$/
      )
      .map((node) => String(node.props.testID));
    expect(order).toHaveLength(44);
    expect(order.slice(0, 4)).toEqual([
      "schedule-child-selector",
      "disclaimer",
      "filter-all",
      "schedule-card-nirsevimab-1",
    ]);
  });
});

// 손상된 생년월일은 birthdateCodec이 null로 읽어 "값 없음"과 같다(AC-18.4).
describe("AC-18.5 [unit] 손상된 생년월일 저장값", () => {
  it("AC-18.5 [unit] 저장값 생년월일 'abc'로 /schedule에 진입하면 '생년월일을 먼저 입력해주세요'가 보이고 카드는 0개이며, 홈 탭에서 existing-birthdate-shortcut은 0개다", async () => {
    const schedule = await openSchedule({ [STORAGE_KEYS.birthdate]: "abc" });

    expect(schedule.getByText(EMPTY_TEXT_KO)).toBeOnTheScreen();
    expect(countByTestId(/^schedule-card-/)).toBe(0);

    await fireEvent.press(screen.getByRole("button", { name: "홈" }));

    expect(screen).toHavePathname("/");
    const home = within(await screen.findByTestId("screen-home"));
    // 홈이 완전히 렌더된 뒤(제출 버튼 표시) 0개를 판정한다
    expect(home.getByTestId("birthdate-submit")).toBeOnTheScreen();
    expect(countByTestId("existing-birthdate-shortcut")).toBe(0);
  });
});

// G-6 (c)(PRD §7.2): 카드 토글은 카드 컴포넌트 거울(src/components/schedule/__test__/ScheduleCard.test.tsx)만 role + 이름으로 찾고 있었다.
// 화면 수준에서도 접근 이름(헤더 텍스트: 이름+회차, 배지, 질병, 날짜)과 상태 열(expanded)로 조회한다(P12 보강).
describe("G-6 (c) 일정 카드 토글 role·접근 이름 조회", () => {
  it("G-6 (c) 생년월일 2026-04-30이면 schedule-card-bcg-1의 card-toggle을 getByRole('button', { name: 'BCG(피내용) 1차 지남 필수 결핵 2026년 4월 30일 ~ 2026년 5월 30일', expanded: false })로 찾고, 누르면 같은 이름의 expanded=true 버튼이 된다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    const card = within(schedule.getByTestId("schedule-card-bcg-1"));

    const toggle = card.getByRole("button", {
      name: "BCG(피내용) 1차 지남 필수 결핵 2026년 4월 30일 ~ 2026년 5월 30일",
      expanded: false,
    });
    expect(toggle).toBe(card.getByTestId("card-toggle"));

    await fireEvent.press(toggle);

    expect(
      card.getByRole("button", {
        name: "BCG(피내용) 1차 지남 필수 결핵 2026년 4월 30일 ~ 2026년 5월 30일",
        expanded: true,
      })
    ).toBe(card.getByTestId("card-toggle"));
  });
});

// ---------------------------------------------------------------------------
// 리뷰 라운드 1 회귀 테스트(그룹 B). 제목은 리뷰 ID(R1-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// ---------------------------------------------------------------------------

/** 일정 화면 컨테이너 안에서 role prop이 role인 host 요소(jest에서 tablist·tabpanel 컨테이너는 접근성 요소가 아니라 getByRole 대상이 아님) */
async function findScheduleContainerRoles(role: string) {
  const container = await screen.findByTestId("screen-schedule");
  return container.queryAll((node) => node.props.role === role);
}

// R1-05: 필터 role="tab"마다 id(nativeID)와 aria-controls가 있고, 일정 목록은 role="tabpanel" + aria-labelledby(선택된 탭)다.
// 면책 문구는 필터와 무관하게 항상 보이므로 패널 밖에 둔다. 웹 DOM 속성은 e2e/review-r1-a11y.spec.ts가 본다.
describe("R1-05 필터 탭과 일정 목록 tabpanel 연결", () => {
  it("R1-05 생년월일 2026-04-30이면 필터 탭마다 nativeID와 aria-controls(목록 패널 nativeID)가 있고, 목록 패널은 role tabpanel·aria-labelledby가 선택된 탭이라 이름이 '전체'(카드 41개)이며, '지남'을 누르면 이름 '지남'·카드 13개가 되고 면책 문구는 패널 밖이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    const panels = await findScheduleContainerRoles("tabpanel");
    expect(panels).toHaveLength(1);
    const panel = panels[0];
    if (panel === undefined) throw new Error("tabpanel이 없다");
    const panelId: unknown = panel.props.nativeID;
    expect(typeof panelId).toBe("string");

    const tabIds = schedule.getAllByRole("tab").map((tab) => {
      expect(tab).toHaveProp("aria-controls", panelId);
      const id: unknown = tab.props.nativeID;
      expect(typeof id).toBe("string");
      return id;
    });
    expect(new Set(tabIds).size).toBe(3);
    expect(panel).toHaveProp(
      "aria-labelledby",
      schedule.getByRole("tab", { name: "전체" }).props.nativeID
    );
    expect(panel).toHaveAccessibleName("전체");
    expect(within(panel).getAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expect(within(panel).queryAllByTestId("disclaimer")).toHaveLength(0);

    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    expect(panel).toHaveProp(
      "aria-labelledby",
      schedule.getByRole("tab", { name: "지남" }).props.nativeID
    );
    expect(panel).toHaveAccessibleName("지남");
    expect(within(panel).getAllByTestId(/^schedule-card-/)).toHaveLength(13);
    expect(schedule.getByTestId("disclaimer")).toBeOnTheScreen();
  });
});

/** DateTimePicker onValueChange의 첫 인자(설계서 §9.3) */
const PICK_EVENT = { nativeEvent: { timestamp: 0, utcOffset: 0 } };

// R1-06: 생년월일이 바뀌면 일정 화면의 필터·카드 펼침이 처음 상태로 돌아간다(원본은 진입마다 "전체").
// 탭 화면은 언마운트되지 않으므로 생년월일을 key로 본문을 다시 마운트한다. 홈의 날짜 입력은 iOS 피커 모달로 한다(AC-2.2와 같은 경로).
describe("U-33 일정 화면의 생년월일", () => {
  it("U-33 이름 있는 아이 '첫째'(2024-01-31)가 선택돼 있으면 아이 선택 아래 '생년월일: 2024-01-31'이 보이고, 이름 없는 아이(칩이 곧 생년월일)를 고르면 그 줄이 사라진다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.children]: JSON.stringify({
        v: 1,
        activeId: "c1",
        children: [
          { id: "c1", name: "첫째", birthdate: "2024-01-31", completed: [] },
          { id: "c2", birthdate: "2026-04-30", completed: [] },
        ],
      }),
    });

    expect(schedule.getByTestId("schedule-birthdate")).toHaveTextContent(
      "생년월일: 2024-01-31"
    );

    await fireEvent.press(schedule.getByRole("radio", { name: "2026-04-30" }));

    expect(
      schedule.getByRole("radio", { name: "2026-04-30", checked: true })
    ).toBeOnTheScreen();
    expect(schedule.queryByTestId("schedule-birthdate")).toBeNull();
  });
});

describe("R1-06 아이가 바뀌면 일정 필터·카드 펼침 초기화", () => {
  it("R1-06 생년월일 2026-04-30 일정에서 '지남'을 고르고 bcg-1을 펼친 뒤 헤더 '아이 추가'로 2026-10-18 아이를 더하면 그 아이가 선택되고 일정 필터는 '전체'·카드 41개이며 bcg-1은 접혀 있다(v1.7: 홈 대신 헤더에서 추가, U-30)", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));
    expectSelectedFilter(schedule, "past");
    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(13);
    const bcg1 = within(schedule.getByTestId("schedule-card-bcg-1"));
    await fireEvent.press(bcg1.getByRole("button", { expanded: false }));
    expect(bcg1.getByTestId("card-details")).toBeOnTheScreen();

    await fireEvent.press(
      schedule.getByRole("button", { name: "아이 추가", expanded: false })
    );
    const panel = within(schedule.getByTestId("header-add-panel"));
    await fireEvent.press(
      panel.getByRole("button", { name: "생년월일, 생년월일 선택" })
    );
    const modal = within(screen.getByTestId("birthdate-picker-modal"));
    await fireEvent(
      modal.getByTestId("datetimepicker-mock"),
      "valueChange",
      PICK_EVENT,
      new Date(2026, 9, 18)
    );
    await fireEvent.press(modal.getByRole("button", { name: "확인" }));
    await fireEvent.press(panel.getByRole("button", { name: "일정 확인하기" }));

    expect(screen).toHavePathname("/schedule");
    const next = within(await screen.findByTestId("screen-schedule"));
    expect(next.queryByTestId("header-add-panel")).toBeNull();
    expect(
      next.getByRole("radio", { name: "2026-10-18", checked: true })
    ).toBeOnTheScreen();
    expectSelectedFilter(next, "all");
    expect(next.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expect(
      within(next.getByTestId("schedule-card-bcg-1")).getByRole("button", {
        expanded: false,
      })
    ).toBeOnTheScreen();
    expect(next.queryAllByTestId("card-details")).toHaveLength(0);
  });

  it("R1-06 아이 선택 칩으로 다른 아이를 고르면 그 아이의 일정(생년월일 2024-01-31 → bcg-1 지남·hpv-2 예정)과 완료 기록으로 바뀌고 필터는 '전체'로 돌아온다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.children]: JSON.stringify({
        v: 1,
        activeId: "c2",
        children: [
          {
            id: "c1",
            name: "첫째",
            birthdate: "2024-01-31",
            completed: ["hepb-1"],
          },
          { id: "c2", birthdate: "2026-04-30", completed: [] },
        ],
      }),
    });
    expect(
      schedule.getByRole("radio", { name: "2026-04-30", checked: true })
    ).toBeOnTheScreen();
    expect(schedule.queryAllByRole("checkbox", { checked: true })).toHaveLength(
      0
    );
    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    await fireEvent.press(schedule.getByRole("radio", { name: "첫째" }));

    expect(
      schedule.getByRole("radio", { name: "첫째", checked: true })
    ).toBeOnTheScreen();
    expectSelectedFilter(schedule, "all");
    expect(
      schedule
        .getAllByRole("checkbox", { checked: true })
        .map((node) => String(node.props.accessibilityLabel))
    ).toEqual(["B형간염 1차: 접종 완료"]);
    expect(await storedActiveId()).toBe("c1");
  });
});

// R1-07: 일정 화면에는 tablist가 둘(필터, 하단 탭 바)이라 필터 tablist에 접근 이름(schedule.filterLabel)을 붙여 구분한다.
// 하단 탭 바(app/(tabs)/_layout.tsx)의 이름은 이 그룹 범위 밖이다(보고서 권고).
describe("R1-07 필터 tablist 접근 이름", () => {
  it("R1-07 생년월일 2026-04-30이면 일정 화면의 필터 tablist가 1개이고 aria-label이 '접종 상태 필터'다", async () => {
    await openSchedule({ [STORAGE_KEYS.birthdate]: "2026-04-30" });

    const tablists = await findScheduleContainerRoles("tablist");
    expect(tablists).toHaveLength(1);
    expect(tablists[0]).toHaveProp("aria-label", "접종 상태 필터");
  });

  it("R1-07 저장값 locale 'en'이면 필터 tablist의 aria-label이 'Vaccination status filter'다", async () => {
    await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.locale]: "en",
    });

    const tablists = await findScheduleContainerRoles("tablist");
    expect(tablists).toHaveLength(1);
    expect(tablists[0]).toHaveProp("aria-label", "Vaccination status filter");
  });
});

// R1-08: 생년월일이 없는 빈 상태에도 화면 제목(schedule.title)이 heading으로 있다(다른 화면과 같은 heading 탐색 규약).
// 필터·면책 문구를 표시하지 않는 P-12·AC-10.1은 그대로다.
describe("R1-08 일정 빈 상태의 화면 제목", () => {
  it("R1-08 저장값 없이 /schedule에 진입하면 schedule-empty와 함께 화면 제목 '예방접종 일정'이 aria-level 없는(웹 h1) heading 1개로 있고 필터·면책 문구는 0개다", async () => {
    await renderApp({ initialUrl: "/schedule" });
    const schedule = within(await screen.findByTestId("screen-schedule"));

    expect(schedule.getByTestId("schedule-empty")).toBeOnTheScreen();
    const headings = schedule.getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAccessibleName("예방접종 일정");
    expect(headings[0]).not.toHaveProp("aria-level");
    expect(countByTestId(/^filter-/)).toBe(0);
    expect(countByTestId("disclaimer")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 리뷰 라운드 2 회귀 테스트. 제목은 리뷰 ID(R2-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// ---------------------------------------------------------------------------

// R2-05: 결과 0건 필터(AC-7.4 상황)에서는 목록 패널(role tabpanel)이 비어 있어 Tab 정지점이 없다. WAI-ARIA APG 탭 패턴대로 그때만
// 패널에 tabIndex 0을 줘 선택 탭 다음 Tab이 패널(이름 = 선택 탭)에 멈추게 한다. 결과가 있으면 첫 정지점이 카드 토글이라
// 패널에 tabIndex를 주지 않는다(R1-04 E2E 계약). 웹 키보드 동작은 e2e/review-r2-a11y.spec.ts가 본다.
describe("R2-05 결과 0건 필터의 빈 tabpanel", () => {
  it("R2-05 생년월일 2026-10-18에서 '지남'(0건)을 고르면 목록 패널이 tabIndex 0이고, '전체'(41건)로 돌아오면 tabIndex가 없다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-10-18",
    });
    const panels = await findScheduleContainerRoles("tabpanel");
    expect(panels).toHaveLength(1);
    const panel = panels[0];
    if (panel === undefined) throw new Error("tabpanel이 없다");
    expect(panel.props.tabIndex).toBeUndefined();

    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    expect(countByTestId(/^schedule-card-/)).toBe(0);
    expect(panel).toHaveProp("tabIndex", 0);
    expect(panel).toHaveAccessibleName("지남");

    await fireEvent.press(schedule.getByRole("tab", { name: "전체" }));

    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expect(panel.props.tabIndex).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 리뷰 라운드 3 회귀 테스트. 제목은 리뷰 ID(R3-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// ---------------------------------------------------------------------------

// R3-01(WCAG 2.4.7): R2-05로 Tab 정지점이 된 0건 패널은 높이가 0이라 포커스 표시가 보이지 않았다(웹 포커스 링이 그려질 상자가 없고,
// Android에서도 같은 0 높이 뷰가 포커스된다). 0건이면 패널이 최소 높이 MIN_TOUCH_TARGET의 상자를 갖는다. 결과가 있으면 카드가
// 높이를 정하므로 최소 높이를 두지 않는다. 실제 포커스 링(라이트·다크 스크린숏 비교)은 e2e/review-r3-a11y.spec.ts가 본다.
describe("R3-01 결과 0건 필터의 빈 tabpanel 포커스 표시", () => {
  it("R3-01 생년월일 2026-10-18에서 '지남'(0건)을 고르면 Tab 정지점인 목록 패널이 최소 높이 MIN_TOUCH_TARGET(44)의 상자이고, '전체'(41건)로 돌아오면 최소 높이를 두지 않는다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-10-18",
    });
    const panels = await findScheduleContainerRoles("tabpanel");
    expect(panels).toHaveLength(1);
    const panel = panels[0];
    if (panel === undefined) throw new Error("tabpanel이 없다");

    await fireEvent.press(schedule.getByRole("tab", { name: "지남" }));

    expect(countByTestId(/^schedule-card-/)).toBe(0);
    expect(panel).toHaveProp("tabIndex", 0);
    expect(panel).toHaveStyle({ minHeight: MIN_TOUCH_TARGET });

    await fireEvent.press(schedule.getByRole("tab", { name: "전체" }));

    expect(schedule.getAllByTestId(/^schedule-card-/)).toHaveLength(41);
    expect(panel).not.toHaveStyle({ minHeight: MIN_TOUCH_TARGET });
  });
});

// ---------------------------------------------------------------------------
// FR-14 접종 완료 체크(US-19, U-19~U-22). 공식 판정은 e2e/schedule.spec.ts(AC-19.1~19.5·19.9·19.10), 여기는 거울([unit])이다.
// 2026-04-30 출생·기준일 2026-10-18: hepb-3 = 생후 6개월 그룹 첫 카드(곧 접종), 그 다음 카드 dtap-3, bcg-1 = 지난 구역 첫 카드.
// ---------------------------------------------------------------------------

const COMPLETED_SECTION_KO = "접종 완료";
/** hepb-3 다음 카드 dtap-3의 체크박스 접근 이름(포커스 이동 대상, U-22) */
const DTAP3_CHECKBOX_KO = "DTaP(디프테리아/파상풍/백일해) 3차: 접종 완료";
/** "전체" 필터의 접종할 구역 그룹(AC-6.1 앞 12개) */
const UPCOMING_MONTHS = [0, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150];

/** 트리 순서의 구역 제목·그룹 헤더 testID(구역 제목은 이름 그대로, 그룹 헤더는 월령 숫자) */
function outlineOf(schedule: Scope): (string | number)[] {
  return schedule
    .getAllByTestId(/^(group-header-\d+|schedule-(completed|past)-section)$/)
    .map((node) => {
      const testID = String(node.props.testID);
      return testID.startsWith("group-header-")
        ? Number(testID.replace("group-header-", ""))
        : testID;
    });
}

/** 저장된 아이 목록 JSON에서 아이별 완료 기록(쓰기 큐가 끝난 뒤, FR-16: 완료 기록은 아이 안에 있다) */
async function storedCompleted(): Promise<unknown> {
  await flushRouterMacrotask();
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.children);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("children" in parsed)
  ) {
    return null;
  }
  const { children } = parsed;
  return Array.isArray(children)
    ? children.map((child: unknown) =>
        typeof child === "object" && child !== null && "completed" in child
          ? child.completed
          : null
      )
    : null;
}

/** 저장된 아이 목록 JSON의 activeId */
async function storedActiveId(): Promise<unknown> {
  await flushRouterMacrotask();
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.children);
  const parsed: unknown = raw === null ? null : JSON.parse(raw);
  return typeof parsed === "object" && parsed !== null && "activeId" in parsed
    ? parsed.activeId
    : null;
}

/** 카드 id의 완료 체크박스 */
function checkboxOf(schedule: Scope, id: string) {
  return within(schedule.getByTestId(`schedule-card-${id}`)).getByTestId(
    "complete-checkbox"
  );
}

/** 트리 순서의 카드 id */
function cardOrder(schedule: Scope): string[] {
  return schedule
    .getAllByTestId(/^schedule-card-/)
    .map((node) => String(node.props.testID).replace("schedule-card-", ""));
}

describe("AC-19.1 [unit] 완료 체크박스·저장", () => {
  it("AC-19.1 [unit] 생년월일 2026-04-30이면 체크박스가 41개 모두 미체크이고, hepb-3을 누르면 체크되고 배지가 '완료'이며 저장값 vaccination-app-completed가 '2026-04-30|hepb-3'이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    const checkboxes = schedule.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(41);
    for (const checkbox of checkboxes) expect(checkbox).not.toBeChecked();

    await fireEvent.press(checkboxOf(schedule, "hepb-3"));
    await flushRouterMacrotask();

    expect(
      schedule.getByRole("checkbox", { name: "B형간염 3차: 접종 완료" })
    ).toBeChecked();
    expect(
      within(schedule.getByTestId("schedule-card-hepb-3")).getByTestId(
        "status-badge"
      )
    ).toHaveTextContent("완료");
    expect(schedule.getAllByRole("checkbox", { checked: true })).toHaveLength(
      1
    );
    expect(await storedCompleted()).toEqual([["hepb-3"]]);
  });

  it("AC-19.1 [unit] 저장값 '2026-04-30|hepb-3'으로 다시 열면 hepb-3만 체크된 채로 완료 구역에 있다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2026-04-30|hepb-3",
    });

    expect(
      schedule
        .getAllByRole("checkbox", { checked: true })
        .map((node) => String(node.props.accessibilityLabel))
    ).toEqual(["B형간염 3차: 접종 완료"]);
    expect(outlineOf(schedule)).toContain("schedule-completed-section");
  });
});

describe("AC-19.2 [unit] '전체'에서 완료 항목은 지난 접종 위", () => {
  it("AC-19.2 [unit] '전체'에서 hepb-3을 체크하면 접종할 구역(생후 6개월 6장) → 구역 제목 '접종 완료' → 생후 6개월 [hepb-3] → '지난 접종' → 지난 구역 순이고 카드는 41개 그대로다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });

    await fireEvent.press(checkboxOf(schedule, "hepb-3"));

    expect(outlineOf(schedule)).toEqual([
      ...UPCOMING_MONTHS,
      "schedule-completed-section",
      6,
      "schedule-past-section",
      0,
      1,
      2,
      4,
    ]);
    const layout = groupLayout(schedule);
    expect(layout[1]?.cards).toEqual([
      "dtap-3",
      "ipv-3",
      "hib-3",
      "pcv-3",
      "rv-3",
      "flu-1",
    ]);
    expect(layout[12]).toEqual({
      header: "group-header-6",
      cards: ["hepb-3"],
    });
    expect(schedule.getByRole("heading", { name: COMPLETED_SECTION_KO })).toBe(
      schedule.getByTestId("schedule-completed-section")
    );
    expect(cardOrder(schedule)).toHaveLength(41);
  });
});

describe("AC-19.3 [unit] '예정'에서 완료 항목은 맨 아래", () => {
  it("AC-19.3 [unit] '예정'에서 hepb-3을 체크하면 마지막 카드가 hepb-3이고 그 앞에 구역 제목 '접종 완료'가 있으며, 카드 28개·지난 구역 제목 0개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    await fireEvent.press(schedule.getByRole("tab", { name: "예정" }));

    await fireEvent.press(checkboxOf(schedule, "hepb-3"));

    const order = cardOrder(schedule);
    expect(order).toHaveLength(28);
    expect(order[order.length - 1]).toBe("hepb-3");
    expect(outlineOf(schedule).slice(-3)).toEqual([
      150,
      "schedule-completed-section",
      6,
    ]);
    expect(countByTestId("schedule-past-section")).toBe(0);
  });
});

describe("AC-19.4 [unit] 체크 해제", () => {
  it("AC-19.4 [unit] 완료한 hepb-3을 다시 누르면 생후 6개월 그룹 첫 자리로 돌아오고 '접종 완료' 구역 제목은 0개이며 저장값은 '2026-04-30|'이다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2026-04-30|hepb-3",
    });

    await fireEvent.press(checkboxOf(schedule, "hepb-3"));
    await flushRouterMacrotask();

    expect(groupLayout(schedule)[1]?.cards[0]).toBe("hepb-3");
    expect(countByTestId("schedule-completed-section")).toBe(0);
    expect(checkboxOf(schedule, "hepb-3")).not.toBeChecked();
    expect(await storedCompleted()).toEqual([[]]);
  });
});

describe("AC-19.5 [unit] 지난 카드 완료", () => {
  it("AC-19.5 [unit] 지난 카드 bcg-1을 체크하면 지난 구역 첫 카드 자리에 그대로 있고 배지는 '완료', '접종 완료' 구역 제목은 0개다", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    const before = cardOrder(schedule);

    await fireEvent.press(checkboxOf(schedule, "bcg-1"));

    expect(cardOrder(schedule)).toEqual(before);
    expect(before[28]).toBe("bcg-1");
    expect(checkboxOf(schedule, "bcg-1")).toBeChecked();
    expect(
      within(schedule.getByTestId("schedule-card-bcg-1")).getByTestId(
        "status-badge"
      )
    ).toHaveTextContent("완료");
    expect(countByTestId("schedule-completed-section")).toBe(0);
  });
});

describe("AC-19.6 [unit] 다른 생년월일의 예전 완료 기록", () => {
  it("AC-19.6 [unit] 예전 저장값 완료 '2024-01-31|hepb-3'·생년월일 2026-04-30이면 아이 1명으로 옮길 때 그 기록을 버려 체크된 카드가 0개이고, 예전 완료 키는 지워진다(v1.7 AC-21.7)", async () => {
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
      [STORAGE_KEYS.completed]: "2024-01-31|hepb-3",
    });

    expect(schedule.queryAllByRole("checkbox", { checked: true })).toHaveLength(
      0
    );
    expect(countByTestId("schedule-completed-section")).toBe(0);
    expect(await storedCompleted()).toEqual([[]]);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.completed)).toBeNull();
  });
});

// U-22: 체크로 카드가 구역을 옮기면(새로 마운트) 토글 전 목록의 바로 다음 카드 체크박스로 포커스를 옮긴다.
// 다음 카드는 다시 마운트되지 않으므로 커밋 직후(effect)에 옮긴다. 웹은 DOM focus(), 네이티브는 화면 낭독기 포커스 이벤트다.
describe("AC-19.9 [unit] 체크 뒤 포커스", () => {
  /** 프리셋 AccessibilityInfo.sendAccessibilityEvent는 jest.fn이라 restoreAllMocks가 기록을 지우지 않으므로 비운다 */
  function clearedSendEvent() {
    const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
    sendEvent.mockClear();
    return sendEvent;
  }

  it.each(["ios", "android"] as const)(
    "AC-19.9 [unit] %s에서 hepb-3을 체크하면 화면 낭독기 포커스가 다음 카드 dtap-3의 체크박스로 1번 옮겨 가고, 지난 카드 bcg-1을 체크하면 옮기지 않는다",
    async (os) => {
      const schedule = await openSchedule({
        [STORAGE_KEYS.birthdate]: "2026-04-30",
      });
      const sendEvent = clearedSendEvent();
      const replaced = jest.replaceProperty(Platform, "OS", os);

      await fireEvent.press(checkboxOf(schedule, "hepb-3"));

      expect(sendEvent).toHaveBeenCalledTimes(1);
      expect(sendEvent).toHaveBeenCalledWith(
        hostWithProps({ accessibilityLabel: DTAP3_CHECKBOX_KO }),
        "focus"
      );

      sendEvent.mockClear();
      await fireEvent.press(checkboxOf(schedule, "bcg-1"));
      expect(sendEvent).not.toHaveBeenCalled();
      replaced.restore();
    }
  );

  it("AC-19.9 [unit] 웹에서 hepb-3을 체크하면 다음 카드 dtap-3의 체크박스에 focus()를 준다", async () => {
    const focus = await sharedHostFocus();
    const schedule = await openSchedule({
      [STORAGE_KEYS.birthdate]: "2026-04-30",
    });
    const replaced = jest.replaceProperty(Platform, "OS", "web");
    focus.mockClear();

    await fireEvent.press(checkboxOf(schedule, "hepb-3"));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toEqual(
      hostWithProps({ accessibilityLabel: DTAP3_CHECKBOX_KO })
    );
    replaced.restore();
  });
});
