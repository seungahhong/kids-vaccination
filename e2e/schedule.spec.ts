import type { Locator, Page } from "@playwright/test";

import {
  bgColor,
  expect,
  type ScreenName,
  type SeedValues,
  test,
} from "./fixtures";

// 일정 화면 E2E 판정 테스트: FR-03(AC-4.6, 5.4, 5.5), FR-04(AC-6.1, 6.2), FR-05(AC-7.1~7.4), FR-06(AC-8.1~8.3, 9.1~9.3),
// FR-07(AC-10.1), FR-09(AC-12.2), FR-12(AC-16.1), 영속화 공통(AC-18.5). 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙).
// 기준일은 fixture가 고정한 2026-10-18 10:00 KST다. 화면 요소는 screenOf('schedule') 범위에서 찾는다(AD-08).
// 카드는 컨테이너 schedule-card-{id}(role 없음) 안의 토글 버튼 card-toggle(role=button, aria-expanded)과
// 펼쳤을 때만 있는 형제 영역 card-details로 판정한다(U-02, 설계서 §9.8 규약 7).

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const LOCALE_KEY = "vaccination-app-locale";
const CARD_SELECTOR = '[data-testid^="schedule-card-"]';
const GROUP_HEADER_SELECTOR = '[data-testid^="group-header-"]';
const EMPTY_TEXT_KO = "생년월일을 먼저 입력해주세요";
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
const DISCLAIMER_JA =
  "この情報は参考用です。正確な内容は小児科医にご相談ください。";
// 2026-04-30 출생·필터 "전체"의 화면 순서(AC-6.1, U-13·U-15): 접종할 구역(출생 시 RSV 항체주사 ~ 만 12세 6개월 HPV 2차)
// 다음 지난 구역(출생 시~생후 4개월). 출생 시(group-header-0)는 두 구역에 나뉘어 두 번 나온다.
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
const GROUP_LABELS_JA = [
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
] as const;
const PAST_SECTION_KO = "지난 접종";
const PAST_SECTION_JA = "過去の接種";

type FilterKey = "all" | "upcoming" | "past";
type ScreenOf = (name: ScreenName) => Locator;

/** 저장값을 넣고(선택) /schedule로 진입해 일정 화면 컨테이너를 돌려준다 */
async function openSchedule(
  page: Page,
  screenOf: ScreenOf,
  seed?: (values: SeedValues) => Promise<void>,
  values?: SeedValues
): Promise<Locator> {
  if (seed && values) await seed(values);
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  return schedule;
}

function cards(scope: Locator): Locator {
  return scope.locator(CARD_SELECTOR);
}

function card(scope: Locator, id: string): Locator {
  return scope.getByTestId(`schedule-card-${id}`);
}

function groupHeaders(scope: Locator): Locator {
  return scope.locator(GROUP_HEADER_SELECTOR);
}

/** "전체"에서 지난 구역 앞의 구역 제목 */
function pastSection(scope: Locator): Locator {
  return scope.getByTestId("schedule-past-section");
}

/** 텍스트가 정확히 label인 카드 내 배지 */
function badges(scope: Locator, label: string): Locator {
  return scope
    .getByTestId("status-badge")
    .filter({ hasText: new RegExp(`^${label}$`) });
}

/** 선택한 필터만 aria-selected="true"이고 나머지는 "false"다 */
async function expectSelectedFilter(
  scope: Locator,
  selected: FilterKey
): Promise<void> {
  for (const key of ["all", "upcoming", "past"] as const) {
    await expect(scope.getByTestId(`filter-${key}`)).toHaveAttribute(
      "aria-selected",
      key === selected ? "true" : "false"
    );
  }
}

type GroupLayout = { label: string; cards: string[] }[];

/** DOM 순서대로 그룹 헤더와 카드를 읽어 그룹별 카드 id 목록으로 묶는다(AC-6.1 그룹별 카드 수) */
async function groupLayout(scope: Locator): Promise<GroupLayout> {
  const nodes = await scope
    .locator(`${GROUP_HEADER_SELECTOR}, ${CARD_SELECTOR}`)
    .evaluateAll((elements) =>
      [...elements]
        .sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
            ? -1
            : 1
        )
        .map((element) => ({
          testId: element.getAttribute("data-testid") ?? "",
          text: (element.textContent ?? "").trim(),
        }))
    );
  const groups: GroupLayout = [];
  for (const node of nodes) {
    if (node.testId.startsWith("group-header-")) {
      groups.push({ label: node.text, cards: [] });
    } else {
      const current = groups[groups.length - 1];
      if (!current)
        throw new Error(`그룹 헤더 앞에 카드가 있다: ${node.testId}`);
      current.cards.push(node.testId.replace("schedule-card-", ""));
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// FR-03 일정 계산 (US-4, US-5)
// ---------------------------------------------------------------------------

test("AC-4.6 생년월일 2024-01-31을 저장하고 일정 화면을 보면 hepb-2 날짜가 '2024년 2월 29일'(원본 결함이면 3월 2일), dtap-1이 '2024년 3월 31일'이고 카드가 총 41개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2024-01-31",
  });

  await expect(
    card(schedule, "hepb-2").getByTestId("schedule-date")
  ).toHaveText("2024년 2월 29일");
  await expect(card(schedule, "hepb-2")).not.toContainText("2024년 3월 2일");
  await expect(
    card(schedule, "dtap-1").getByTestId("schedule-date")
  ).toHaveText("2024년 3월 31일");
  await expect(cards(schedule)).toHaveCount(41);
});

test("AC-5.4 생년월일 2026-04-30·필터 전체이면 카드 내 배지가 지남 13·곧 접종 8·예정 20이고 bcg-1은 지남, hepb-3은 곧 접종, hib-4는 예정이다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  await expect(cards(schedule)).toHaveCount(41);
  await expect(schedule.getByTestId("status-badge")).toHaveCount(41);
  await expect(badges(schedule, "지남")).toHaveCount(13);
  await expect(badges(schedule, "곧 접종")).toHaveCount(8);
  await expect(badges(schedule, "예정")).toHaveCount(20);
  await expect(card(schedule, "bcg-1").getByTestId("status-badge")).toHaveText(
    "지남"
  );
  await expect(card(schedule, "hepb-3").getByTestId("status-badge")).toHaveText(
    "곧 접종"
  );
  await expect(card(schedule, "hib-4").getByTestId("status-badge")).toHaveText(
    "예정"
  );
});

test("AC-5.5 오늘(2026-10-18) 출생이면 bcg-1·hepb-1 배지가 곧 접종, hepb-2는 '2026년 11월 18일'·예정이고 배지가 지남 0·곧 접종 3(bcg-1·hepb-1·nirsevimab-1)·예정 38이다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-10-18",
  });

  await expect(card(schedule, "bcg-1").getByTestId("status-badge")).toHaveText(
    "곧 접종"
  );
  await expect(card(schedule, "hepb-1").getByTestId("status-badge")).toHaveText(
    "곧 접종"
  );
  await expect(
    card(schedule, "hepb-2").getByTestId("schedule-date")
  ).toHaveText("2026년 11월 18일");
  await expect(card(schedule, "hepb-2").getByTestId("status-badge")).toHaveText(
    "예정"
  );
  await expect(schedule.getByTestId("status-badge")).toHaveCount(41);
  await expect(badges(schedule, "지남")).toHaveCount(0);
  await expect(badges(schedule, "곧 접종")).toHaveCount(3);
  await expect(badges(schedule, "예정")).toHaveCount(38);
});

// ---------------------------------------------------------------------------
// FR-04 월령 그룹 (US-6)
// ---------------------------------------------------------------------------

test("AC-6.1 생년월일 2026-04-30·필터 전체이면 그룹 헤더가 접종할 출생 시~만 12세 6개월, 구역 제목 '지난 접종'(heading), 지난 출생 시~생후 4개월 순서로 16개, 그룹별 카드 수가 1·7·1·7·2·1·1·3·1·1·2·1·2·1·5·5이고 생후 2개월 그룹은 dtap-1·ipv-1·hib-1·pcv-1·rv-1이다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  await expect(groupHeaders(schedule)).toHaveCount(16);
  await expect(groupHeaders(schedule)).toHaveText([...GROUP_LABELS_KO]);
  const layout = await groupLayout(schedule);
  expect(layout.map((group) => group.label)).toEqual([...GROUP_LABELS_KO]);
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
  // 구역 제목은 웹 <h2>이고 DOM 순서상 만 12세 6개월 그룹 헤더 뒤, 지난 구역의 출생 시 그룹 헤더(두 번째 group-header-0) 앞이다
  await expect(pastSection(schedule)).toHaveCount(1);
  await expect(
    schedule.getByRole("heading", { level: 2, name: PAST_SECTION_KO })
  ).toHaveAttribute("data-testid", "schedule-past-section");
  const between = await pastSection(schedule).evaluate(
    (section, [before, after]) =>
      before !== null &&
      after !== null &&
      (before.compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0 &&
      (section.compareDocumentPosition(after) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    [
      await schedule.getByTestId("group-header-150").elementHandle(),
      await schedule.getByTestId("group-header-0").last().elementHandle(),
    ] as const
  );
  expect(between).toBe(true);
});

test("AC-6.2 AC-6.1에 저장값 locale 'ja'를 더하면 그룹 헤더가 出生時~12歳6ヶ月, 出生時~生後4ヶ月 순서의 일본어 라벨이고 구역 제목은 過去の接種다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
    [LOCALE_KEY]: "ja",
  });

  await expect(groupHeaders(schedule)).toHaveCount(16);
  await expect(groupHeaders(schedule)).toHaveText([...GROUP_LABELS_JA]);
  await expect(pastSection(schedule)).toHaveText(PAST_SECTION_JA);
});

// ---------------------------------------------------------------------------
// FR-05 필터 (US-7)
// ---------------------------------------------------------------------------

test("AC-7.1 생년월일 2026-04-30으로 처음 진입하면 필터가 전체·예정·지남 3개이고 filter-all만 aria-selected=true이며 카드는 41개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  await expect(schedule.getByRole("tablist")).toHaveCount(1);
  const filters = schedule.getByRole("tab");
  await expect(filters).toHaveCount(3);
  await expect(filters).toHaveText(["전체", "예정", "지남"]);
  await expectSelectedFilter(schedule, "all");
  await expect(cards(schedule)).toHaveCount(41);
});

test("AC-7.2 '예정'을 누르면 filter-upcoming만 selected, 카드 28개(곧 접종 8 + 예정 20, 지남 0), 그룹 헤더 12개(출생 시 ~ 만 12세 6개월)이고 구역 제목은 0개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });
  await expect(cards(schedule)).toHaveCount(41);

  await schedule.getByRole("tab", { name: "예정", exact: true }).click();

  await expectSelectedFilter(schedule, "upcoming");
  await expect(cards(schedule)).toHaveCount(28);
  await expect(badges(schedule, "곧 접종")).toHaveCount(8);
  await expect(badges(schedule, "예정")).toHaveCount(20);
  await expect(badges(schedule, "지남")).toHaveCount(0);
  await expect(groupHeaders(schedule)).toHaveCount(12);
  await expect(groupHeaders(schedule).first()).toHaveText("출생 시");
  await expect(groupHeaders(schedule).last()).toHaveText("만 12세 6개월");
  await expect(pastSection(schedule)).toHaveCount(0);
});

test("AC-7.3 '지남'을 누르면 카드 13개 전부 지남이고 그룹 헤더는 출생 시·생후 1·2·4개월 4개이며 구역 제목은 0개이고, 이어서 '전체'를 누르면 카드 41개·filter-all selected로 돌아온다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });
  await expect(cards(schedule)).toHaveCount(41);

  await schedule.getByRole("tab", { name: "지남", exact: true }).click();

  await expectSelectedFilter(schedule, "past");
  await expect(cards(schedule)).toHaveCount(13);
  await expect(schedule.getByTestId("status-badge")).toHaveCount(13);
  await expect(badges(schedule, "지남")).toHaveCount(13);
  await expect(groupHeaders(schedule)).toHaveText([
    "출생 시",
    "생후 1개월",
    "생후 2개월",
    "생후 4개월",
  ]);
  await expect(pastSection(schedule)).toHaveCount(0);

  await schedule.getByRole("tab", { name: "전체", exact: true }).click();

  await expect(cards(schedule)).toHaveCount(41);
  await expectSelectedFilter(schedule, "all");
});

test("AC-7.4 오늘 출생(2026-10-18)에서 '지남'을 누르면 카드·그룹 헤더 0개이고 필터 3개와 disclaimer는 그대로이며 schedule-empty는 0개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-10-18",
  });
  await expect(cards(schedule)).toHaveCount(41);

  await schedule.getByRole("tab", { name: "지남", exact: true }).click();

  await expectSelectedFilter(schedule, "past");
  await expect(cards(schedule)).toHaveCount(0);
  await expect(groupHeaders(schedule)).toHaveCount(0);
  await expect(schedule.getByRole("tab")).toHaveCount(3);
  await expect(schedule.getByTestId("disclaimer")).toBeVisible();
  await expect(schedule.getByTestId("schedule-empty")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// FR-06 일정 카드 (US-8, US-9)
// ---------------------------------------------------------------------------

test("AC-8.1 생년월일 2026-04-30이면 bcg-1·hib-4·hepb-3 카드가 이름+회차·배지·질병·날짜(범위) 텍스트를 포함한다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  const bcg1 = card(schedule, "bcg-1");
  for (const text of [
    "BCG(피내용) 1차",
    "지남",
    "결핵",
    "2026년 4월 30일 ~ 2026년 5월 30일",
  ]) {
    await expect(bcg1).toContainText(text);
  }
  const hib4 = card(schedule, "hib-4");
  for (const text of [
    "Hib(뇌수막염) 4차",
    "예정",
    "2027년 4월 30일 ~ 2027년 7월 30일",
  ]) {
    await expect(hib4).toContainText(text);
  }
  const hepb3 = card(schedule, "hepb-3");
  for (const text of ["B형간염 3차", "곧 접종", "2026년 10월 30일"]) {
    await expect(hepb3).toContainText(text);
  }
});

test("AC-8.2 라이트 테마에서 status-dot 배경색이 hepb-3(곧 접종) rgb(249, 115, 22), hib-4(예정) rgb(20, 184, 166), bcg-1(지남) rgb(214, 211, 209)다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  const dot = (id: string) => card(schedule, id).getByTestId("status-dot");
  await expect(dot("hepb-3")).toHaveCount(1);
  await expect.poll(() => bgColor(dot("hepb-3"))).toBe("rgb(249, 115, 22)");
  await expect.poll(() => bgColor(dot("hib-4"))).toBe("rgb(20, 184, 166)");
  await expect.poll(() => bgColor(dot("bcg-1"))).toBe("rgb(214, 211, 209)");
});

test("AC-8.3 저장값 locale 'en'이면 카드가 영어 이름+회차(Dose n)·배지·날짜를 포함하고 bcg-1에 원본 표기 '1dose'는 없다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
    [LOCALE_KEY]: "en",
  });

  const bcg1 = card(schedule, "bcg-1");
  for (const text of [
    "BCG (Intradermal) Dose 1",
    "Past",
    "April 30, 2026 ~ May 30, 2026",
  ]) {
    await expect(bcg1).toContainText(text);
  }
  await expect(bcg1).not.toContainText("1dose");
  const hib4 = card(schedule, "hib-4");
  for (const text of [
    "Hib (Meningitis) Dose 4",
    "April 30, 2027 ~ July 30, 2027",
  ]) {
    await expect(hib4).toContainText(text);
  }
  const hepb3 = card(schedule, "hepb-3");
  for (const text of ["Hepatitis B Dose 3", "Coming Soon"]) {
    await expect(hepb3).toContainText(text);
  }
});

test("AC-9.1 bcg-1 카드의 토글 버튼(aria-expanded=false)을 누르면 aria-expanded=true가 되고 상세 정보·부작용·참고사항(heading 각 1개)과 본문이 토글 버튼 밖 card-details에 표시되며 'AI에게 더 물어보기'는 0개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });
  const bcg1 = card(schedule, "bcg-1");
  const toggle = bcg1.getByTestId("card-toggle");
  await expect(toggle).toHaveRole("button");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(bcg1.getByText("상세 정보")).toHaveCount(0);

  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  for (const text of [
    "상세 정보",
    "결핵을 예방하는 백신으로, 출생 후 4주 이내에 접종합니다.",
    "부작용",
    "접종 부위 궤양, 림프절 비대 (드물게)",
    "참고사항",
    "국가 지원 백신은 피내용 BCG이며, 경피용 BCG는 국가 지원 대상이 아니라 비용을 본인이 부담합니다. 미숙아는 담당 의사와 상담 후 접종 시기를 결정합니다.",
  ]) {
    await expect(bcg1.getByText(text, { exact: true })).toBeVisible();
  }
  for (const name of ["상세 정보", "부작용", "참고사항"]) {
    await expect(bcg1.getByRole("heading", { name, exact: true })).toHaveCount(
      1
    );
  }
  await expect(bcg1.getByTestId("card-details")).toHaveCount(1);
  await expect(toggle.getByTestId("card-details")).toHaveCount(0);
  await expect(page.getByText("AI에게 더 물어보기")).toHaveCount(0);
});

test("AC-9.2 펼친 bcg-1의 토글 버튼을 다시 누르면 aria-expanded=false이고 상세 정보 0개이며, bcg-1이 펼쳐진 동안에도 hepb-1 토글은 aria-expanded=false다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });
  const bcg1 = card(schedule, "bcg-1");
  const toggle = bcg1.getByTestId("card-toggle");
  const hepb1Toggle = card(schedule, "hepb-1").getByTestId("card-toggle");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(bcg1.getByText("상세 정보", { exact: true })).toBeVisible();
  await expect(hepb1Toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(bcg1.getByText("상세 정보")).toHaveCount(0);
  await expect(bcg1.getByTestId("card-details")).toHaveCount(0);
  await expect(hepb1Toggle).toHaveAttribute("aria-expanded", "false");
});

test("AC-9.3 저장값 locale 'en'에서 bcg-1을 펼치면 영어 설명과 부작용이 표시된다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
    [LOCALE_KEY]: "en",
  });
  const bcg1 = card(schedule, "bcg-1");

  await bcg1.getByTestId("card-toggle").click();

  await expect(
    bcg1.getByText(
      "A vaccine to prevent tuberculosis, administered within 4 weeks of birth.",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    bcg1.getByText("Injection site ulcer, lymph node enlargement (rare)", {
      exact: true,
    })
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// FR-07 빈 상태 (US-10)
// ---------------------------------------------------------------------------

test("AC-10.1 저장값 없이 /schedule에 진입하면 schedule-empty 안에 안내 문구와 '홈으로 이동' 버튼이 있고 카드·필터·disclaimer는 0개이며, 버튼을 누르면 경로가 /다", async ({
  page,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf);

  const empty = schedule.getByTestId("schedule-empty");
  await expect(empty).toBeVisible();
  await expect(empty.getByText(EMPTY_TEXT_KO, { exact: true })).toBeVisible();
  const goHome = empty.getByTestId("go-home");
  await expect(goHome).toHaveRole("button");
  await expect(goHome).toHaveAccessibleName("홈으로 이동");
  await expect(cards(schedule)).toHaveCount(0);
  await expect(schedule.getByTestId(/^filter-/)).toHaveCount(0);
  await expect(schedule.getByRole("tab")).toHaveCount(0);
  await expect(schedule.getByTestId("disclaimer")).toHaveCount(0);

  await goHome.click();

  await expect(page).toHaveURL("/");
  await expect(screenOf("home")).toBeVisible();
});

// ---------------------------------------------------------------------------
// FR-09 언어 (US-12)
// ---------------------------------------------------------------------------

test("AC-12.2 저장값 locale 'ja'·생년월일 2026-04-30이면 제목 予防接種日程, 필터 全て·予定·過去, hepb-3 배지 もうすぐ, bcg-1은 過去·2026年4月30日 ~ 2026年5月30日을 포함하고 disclaimer는 일본어다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
    [LOCALE_KEY]: "ja",
  });

  await expect(schedule.getByRole("heading", { level: 1 })).toHaveText(
    "予防接種日程"
  );
  await expect(schedule.getByRole("tab")).toHaveText(["全て", "予定", "過去"]);
  await expect(card(schedule, "hepb-3").getByTestId("status-badge")).toHaveText(
    "もうすぐ"
  );
  await expect(card(schedule, "bcg-1")).toContainText("過去");
  await expect(card(schedule, "bcg-1")).toContainText(
    "2026年4月30日 ~ 2026年5月30日"
  );
  await expect(schedule.getByTestId("disclaimer")).toHaveText(DISCLAIMER_JA);
});

// U-15: 분류 배지(필수 = 국가예방접종, 선택 = 학회 권장 비지원 접종). 대비는 a11y.spec.ts의 렌더 대비 스캔이 본다.
test("U-15 생년월일 2026-04-30이면 카드마다 category-badge가 1개(41개)이고 '선택'은 var-2·nirsevimab-1 2개, '필수'는 39개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  const categoryBadges = schedule.getByTestId("category-badge");
  await expect(categoryBadges).toHaveCount(41);
  await expect(categoryBadges.filter({ hasText: /^선택$/ })).toHaveCount(2);
  await expect(categoryBadges.filter({ hasText: /^필수$/ })).toHaveCount(39);
  for (const id of ["var-2", "nirsevimab-1"]) {
    await expect(card(schedule, id).getByTestId("category-badge")).toHaveText(
      "선택"
    );
  }
  await expect(
    card(schedule, "var-1").getByTestId("category-badge")
  ).toHaveText("필수");
});

// ---------------------------------------------------------------------------
// FR-12 면책 문구 (US-16)
// ---------------------------------------------------------------------------

test("AC-16.1 생년월일 2026-04-30이면 disclaimer가 1개(한국어 문구)이고 DOM 순서상 schedule-birthdate 뒤, 필터 filter-all과 첫 카드 nirsevimab-1 앞(boundingBox y가 더 작음)에 있다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "2026-04-30",
  });

  const disclaimer = schedule.getByTestId("disclaimer");
  await expect(disclaimer).toHaveCount(1);
  await expect(disclaimer).toHaveText(DISCLAIMER_KO);
  await expect(cards(schedule).first()).toHaveAttribute(
    "data-testid",
    "schedule-card-nirsevimab-1"
  );
  const birthdate = schedule.getByTestId("schedule-birthdate");
  const filterAll = schedule.getByTestId("filter-all");
  const firstCard = card(schedule, "nirsevimab-1");
  const between = await disclaimer.evaluate(
    (element, [before, ...after]) =>
      before !== null &&
      (before.compareDocumentPosition(element) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0 &&
      after.every(
        (next) =>
          next !== null &&
          (element.compareDocumentPosition(next) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0
      ),
    [
      await birthdate.elementHandle(),
      await filterAll.elementHandle(),
      await firstCard.elementHandle(),
    ] as const
  );
  expect(between).toBe(true);
  const [disclaimerBox, filterBox, cardBox] = await Promise.all([
    disclaimer.boundingBox(),
    filterAll.boundingBox(),
    firstCard.boundingBox(),
  ]);
  if (disclaimerBox === null || filterBox === null || cardBox === null) {
    throw new Error("boundingBox를 읽지 못했다");
  }
  expect(disclaimerBox.y).toBeLessThan(filterBox.y);
  expect(disclaimerBox.y).toBeLessThan(cardBox.y);
});

// ---------------------------------------------------------------------------
// 영속화 공통 (US-18)
// ---------------------------------------------------------------------------

test("AC-18.5 저장값 생년월일 'abc'(손상)로 /schedule에 진입하면 안내 문구가 보이고 카드는 0개이며, 홈에서 existing-birthdate-shortcut은 0개다", async ({
  page,
  seed,
  screenOf,
}) => {
  const schedule = await openSchedule(page, screenOf, seed, {
    [BIRTHDATE_KEY]: "abc",
  });

  await expect(
    schedule.getByText(EMPTY_TEXT_KO, { exact: true })
  ).toBeVisible();
  await expect(cards(schedule)).toHaveCount(0);

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(page).toHaveURL("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  // 홈이 완전히 렌더된 뒤(입력 표시) 0개를 판정한다
  await expect(home.getByTestId("birthdate-input")).toBeVisible();
  await expect(home.getByTestId("existing-birthdate-shortcut")).toHaveCount(0);
});
