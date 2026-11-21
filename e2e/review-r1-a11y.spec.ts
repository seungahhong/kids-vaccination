import type { Locator, Page } from "@playwright/test";

import {
  CHILDREN_KEY,
  collectErrors,
  expect,
  fillBirthdate,
  readStorage,
  test,
} from "./fixtures";

// 리뷰 라운드 1 접근성·동작 회귀 테스트(그룹 B: 설정·일정·키보드). AC 판정 테스트가 아니므로 제목은 리뷰 ID(R1-xx)로
// 시작해 PRD §7.3 AC 집계(^AC-n.m)에 들어가지 않는다. 기준 환경은 fixtures(ENV-E2E, 시계 2026-10-18 10:00 KST)와 같고,
// 화면 요소는 screenOf(...) 범위에서 찾는다(AD-08). 하단 탭은 이름으로 한정해 전역 조회한다.
// 새 웹 전용 속성(lang·tabindex·aria-controls 등)이 React DOM 경고로 새지 않는지 주요 흐름에서 pageerror·console error 0건도 본다.

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const THEME_KEY = "vaccination-app-theme";
const LOCALE_KEY = "vaccination-app-locale";
const CARD_SELECTOR = '[data-testid^="schedule-card-"]';
const CHILD_CONFIRM_KO = "2024-01-31 정보를 삭제할까요?";

/** document.activeElement 요약: body면 "body", 아니면 data-testid 또는 "role:{role}" */
async function activeElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) return "body";
    const testId = element.getAttribute("data-testid");
    if (testId !== null) return testId;
    return `role:${element.getAttribute("role") ?? element.tagName.toLowerCase()}`;
  });
}

/** document.activeElement의 computed outline-style(포커스 표시 확인, WCAG 2.4.7) */
async function activeOutlineStyle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    return element === null ? "none" : getComputedStyle(element).outlineStyle;
  });
}

/** 항목마다 tabindex 속성이 expected(문서 순서)와 같다 */
async function expectTabIndexes(
  items: readonly Locator[],
  expected: readonly string[]
): Promise<void> {
  expect(items).toHaveLength(expected.length);
  for (const [index, item] of items.entries()) {
    await expect(item).toHaveAttribute("tabindex", expected[index] ?? "");
  }
}

// ---------------------------------------------------------------------------
// R1-03 초기화 확인 단계의 포커스
// ---------------------------------------------------------------------------

// v1.7(FR-16 U-28): "생년월일 삭제"는 아이별 삭제(child-delete "{이름표} 삭제")가 됐다. 같은 포커스 계약을 아이 줄에서 본다.
// 확인으로 마지막 아이를 지우면 그 줄이 사라지므로 포커스는 아이 수 문구(settings-children-count)로 간다.
test("R1-03 '2024-01-31 삭제'를 Enter로 열면 포커스가 확인 문구로 이름 붙은 확인 상자(role group)로 가고 Tab으로 확인·취소에 닿으며, 취소 뒤에는 삭제 버튼으로, 확인(마지막 아이) 뒤에는 아이 수 문구로 간다(document.activeElement가 body로 떨어지지 않음)", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  const deleteButton = settings.getByTestId("child-delete");
  const confirmBox = settings.getByRole("group", { name: CHILD_CONFIRM_KO });

  await deleteButton.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => activeElement(page)).toBe("child-delete-group");
  await expect(confirmBox).toBeFocused();
  await expect(confirmBox).toHaveAttribute("tabindex", "-1");
  // 키보드로 연 경우 옮겨 간 포커스 위치가 보인다(브라우저 기본 포커스 링이 꺼져 있지 않음, WCAG 2.4.7)
  expect(await activeOutlineStyle(page)).not.toBe("none");
  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("child-delete-confirm")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("child-delete-cancel")).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(confirmBox).toHaveCount(0);
  await expect.poll(() => activeElement(page)).toBe("child-delete");
  await expect(deleteButton).toBeFocused();
  expect(await activeOutlineStyle(page)).not.toBe("none");
  expect(await readStorage(page, CHILDREN_KEY)).not.toBeNull();

  await page.keyboard.press("Enter");
  await expect(confirmBox).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("child-delete-confirm")).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(settings.getByTestId("child-row")).toHaveCount(0);
  await expect.poll(() => activeElement(page)).toBe("settings-children-count");
  await expect(settings.getByTestId("settings-children-count")).toHaveText(
    "저장된 아이 0명 (최대 10명)"
  );
  await expect.poll(() => readStorage(page, CHILDREN_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test("R1-03 마우스로 '2024-01-31 삭제'와 '취소'를 눌러도 포커스가 body로 떨어지지 않고 확인 상자 → 삭제 버튼으로 이어진다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();

  await settings.getByTestId("child-delete").click();

  await expect.poll(() => activeElement(page)).toBe("child-delete-group");
  await expect(
    settings.getByRole("group", { name: CHILD_CONFIRM_KO })
  ).toBeFocused();

  await settings.getByTestId("child-delete-cancel").click();

  await expect.poll(() => activeElement(page)).toBe("child-delete");
  await expect(settings.getByTestId("child-delete")).toBeFocused();
});

// ---------------------------------------------------------------------------
// R1-04 radio·tab 키보드 조작(APG 라디오 그룹·탭 패턴)
// ---------------------------------------------------------------------------

test("R1-04 설정 테마·언어 radio는 Space로 선택되고 방향키(→·←·↓·↑)로 포커스와 선택이 함께 이동하며(끝에서 순환), 선택 항목만 tabindex 0이라 Tab·Shift+Tab은 그룹마다 선택 항목에만 멈춘다", async ({
  page,
  seed,
  screenOf,
}) => {
  // 아이 1명(언어 그룹 다음 Tab 정지점 = 그 아이의 삭제 버튼, v1.7 FR-16)
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  const theme = (preference: string) =>
    settings.getByTestId(`theme-option-${preference}`);
  const locale = (code: string) =>
    settings.getByTestId(`locale-option-${code}`);
  const title = settings.getByRole("heading", { level: 1 });

  // Space로 선택한다(react-native-web은 Space를 button에만 연결한다)
  await theme("dark").focus();
  await page.keyboard.press("Space");

  await expect(theme("dark")).toHaveAttribute("aria-checked", "true");
  await expect(theme("light")).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("dark");
  // 테마는 라이트·다크 2개다(v1.5 U-24: '시스템' 없음)
  await expectTabIndexes([theme("light"), theme("dark")], ["-1", "0"]);
  await expectTabIndexes(
    [locale("ko"), locale("en"), locale("ja"), locale("zh")],
    ["0", "-1", "-1", "-1"]
  );

  // 방향키는 포커스와 선택을 함께 옮기고 끝에서 반대쪽 끝으로 순환한다
  await page.keyboard.press("ArrowRight");
  await expect(theme("light")).toBeFocused();
  await expect(theme("light")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowRight");
  await expect(theme("dark")).toBeFocused();
  await expect(theme("dark")).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(theme("light")).toBeFocused();
  await expect(theme("light")).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("light");

  // Tab은 다음 그룹의 선택 항목(한국어)으로 간다. 세로 목록은 ↓·↑로 이동한다
  await page.keyboard.press("Tab");
  await expect(locale("ko")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(locale("en")).toBeFocused();
  await expect(locale("en")).toHaveAttribute("aria-checked", "true");
  await expect(title).toHaveText("Settings");
  await page.keyboard.press("ArrowUp");
  await expect(locale("ko")).toBeFocused();
  await expect(locale("ko")).toHaveAttribute("aria-checked", "true");
  await expect(title).toHaveText("설정");
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("ko");

  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("child-delete")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(locale("ko")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(theme("light")).toBeFocused();
  // 그 앞은 화면 맨 위 헤더의 언어 버튼이다(FR-15: 헤더 테마 스위치 → 언어 버튼 → 화면 본문 순)
  await page.keyboard.press("Shift+Tab");
  await expect(settings.getByTestId("header-language-button")).toBeFocused();
  expect(errors).toEqual([]);
});

test("R1-04 일정 필터 tab은 Space로 선택되고 ArrowRight·ArrowLeft(순환)·Home·End로 포커스와 선택이 이동하며(↓·↑는 탭을 바꾸지 않음), 선택 탭만 tabindex 0이라 Tab은 필터에서 한 번만 멈추고 첫 카드의 완료 체크박스 → 토글 순으로 간다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  const errors = collectErrors(page);
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  const filter = (key: string) => schedule.getByTestId(`filter-${key}`);
  const cards = schedule.locator(CARD_SELECTOR);
  await expect(cards).toHaveCount(41);

  await filter("past").focus();
  await page.keyboard.press("Space");

  await expect(filter("past")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(13);
  await expectTabIndexes(
    [filter("all"), filter("upcoming"), filter("past")],
    ["-1", "-1", "0"]
  );

  await page.keyboard.press("ArrowRight");
  await expect(filter("all")).toBeFocused();
  await expect(filter("all")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(41);
  await page.keyboard.press("ArrowRight");
  await expect(filter("upcoming")).toBeFocused();
  await expect(filter("upcoming")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(28);
  await page.keyboard.press("ArrowLeft");
  await expect(filter("all")).toBeFocused();
  await expect(filter("all")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(filter("past")).toBeFocused();
  await expect(filter("past")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(filter("all")).toBeFocused();
  await expect(filter("all")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(41);
  // 가로 탭 목록이라 ↓·↑는 탭을 바꾸지 않는다(페이지 스크롤용, APG 탭 패턴)
  await page.keyboard.press("ArrowDown");
  await expect(filter("all")).toBeFocused();
  await expect(filter("all")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(41);
  await expectTabIndexes(
    [filter("all"), filter("upcoming"), filter("past")],
    ["0", "-1", "-1"]
  );

  // "전체"의 첫 카드는 접종할 구역의 첫 카드 nirsevimab-1(출생 시 RSV 항체주사)이다(지난 구역은 아래, U-13·U-15).
  // 카드 안에서는 왼쪽 완료 체크박스가 토글 버튼보다 먼저다(FR-14)
  const firstCard = schedule.getByTestId("schedule-card-nirsevimab-1");
  await page.keyboard.press("Tab");
  await expect(firstCard.getByTestId("complete-checkbox")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(firstCard.getByTestId("card-toggle")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(filter("all")).toBeFocused();
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// R1-05 필터 tabpanel, R1-06 생년월일 변경 시 초기화, R1-07 tablist 이름, R1-08 빈 상태 제목
// ---------------------------------------------------------------------------

test("R1-05 일정 필터 tab마다 id·aria-controls가 있고 목록은 role tabpanel(aria-labelledby = 선택 탭 id)이라 이름이 선택 탭을 따르며, 카드는 패널 안·면책 문구는 패널 밖이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  const errors = collectErrors(page);
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  const panel = schedule.getByRole("tabpanel");

  await expect(panel).toHaveCount(1);
  const panelId = await panel.getAttribute("id");
  expect(panelId).toEqual(expect.any(String));
  const tabIds: string[] = [];
  for (const key of ["all", "upcoming", "past"] as const) {
    const tab = schedule.getByTestId(`filter-${key}`);
    await expect(tab).toHaveAttribute("aria-controls", panelId ?? "(없음)");
    tabIds.push((await tab.getAttribute("id")) ?? "");
  }
  expect(new Set(tabIds).size).toBe(3);
  expect(tabIds).not.toContain("");
  await expect(panel).toHaveAttribute("aria-labelledby", tabIds[0] ?? "");
  await expect(panel).toHaveAccessibleName("전체");
  await expect(panel.locator(CARD_SELECTOR)).toHaveCount(41);
  await expect(panel.getByTestId("disclaimer")).toHaveCount(0);
  await expect(schedule.getByTestId("disclaimer")).toBeVisible();

  await schedule.getByRole("tab", { name: "지남", exact: true }).click();

  await expect(panel).toHaveAttribute("aria-labelledby", tabIds[2] ?? "");
  await expect(panel).toHaveAccessibleName("지남");
  await expect(panel.locator(CARD_SELECTOR)).toHaveCount(13);
  expect(errors).toEqual([]);
});

test("R1-06 일정에서 '지남'을 고르고 bcg-1을 펼친 뒤 헤더 '아이 추가'로 다른 아이(2026-10-18)를 더하면 그 아이가 선택되고 일정 필터는 '전체'·카드 41개이며 bcg-1은 접혀 있다(v1.7 U-30)", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  const cards = schedule.locator(CARD_SELECTOR);
  const bcg1Toggle = schedule
    .getByTestId("schedule-card-bcg-1")
    .getByTestId("card-toggle");
  await schedule.getByRole("tab", { name: "지남", exact: true }).click();
  await expect(cards).toHaveCount(13);
  await bcg1Toggle.click();
  await expect(bcg1Toggle).toHaveAttribute("aria-expanded", "true");

  await schedule.getByTestId("header-add-child-button").click();
  const panel = schedule.getByTestId("header-add-panel");
  await fillBirthdate(panel, "2026-10-18");
  await panel.getByTestId("birthdate-submit").click();

  await expect(page).toHaveURL("/schedule");
  await expect(panel).toHaveCount(0);
  await expect(
    schedule.getByRole("radio", { name: "2026-10-18" })
  ).toHaveAttribute("aria-checked", "true");
  await expect(schedule.getByTestId("filter-all")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(schedule.getByTestId("filter-past")).toHaveAttribute(
    "aria-selected",
    "false"
  );
  await expect(cards).toHaveCount(41);
  await expect(bcg1Toggle).toHaveAttribute("aria-expanded", "false");
});

test("R1-07 일정 필터 tablist의 접근 이름이 '접종 상태 필터'라 이름 없는 하단 탭 바와 구분된다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();

  await expect(schedule.getByRole("tablist")).toHaveAccessibleName(
    "접종 상태 필터"
  );
  const filterList = page.getByRole("tablist", {
    name: "접종 상태 필터",
    exact: true,
  });
  await expect(filterList).toHaveCount(1);
  await expect(filterList.getByRole("tab")).toHaveText([
    "전체",
    "예정",
    "지남",
  ]);
});

test("R1-08 생년월일이 없는 일정 빈 상태에도 화면 제목 '예방접종 일정'이 level 1 heading으로 있고 필터·면책 문구는 없다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule.getByTestId("schedule-empty")).toBeVisible();

  await expect(schedule.getByRole("heading", { level: 1 })).toHaveText(
    "예방접종 일정"
  );
  await expect(schedule.getByRole("tab")).toHaveCount(0);
  await expect(schedule.getByTestId("disclaimer")).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// R1-09 설정 섹션 제목, R1-16 언어 옵션의 언어 표시
// ---------------------------------------------------------------------------

test("R1-09 설정 섹션 제목 테마·언어·아기 정보는 level 2 heading이고 level 1 heading은 화면 제목 '설정' 하나다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();

  await expect(settings.getByRole("heading", { level: 2 })).toHaveText([
    "테마",
    "언어",
    "아기 정보",
  ]);
  await expect(settings.getByRole("heading", { level: 1 })).toHaveText([
    "설정",
  ]);
});

test("R1-16 언어 옵션 4개는 lang 속성(ko-KR·en-US·ja-JP·zh-CN)으로 이름의 언어를 알리고 접근 이름은 그대로다", async ({
  page,
  screenOf,
}) => {
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  const options = [
    ["ko", "ko-KR", "한국어"],
    ["en", "en-US", "English"],
    ["ja", "ja-JP", "日本語"],
    ["zh", "zh-CN", "中文"],
  ] as const;

  for (const [code, lang, name] of options) {
    const option = settings.getByTestId(`locale-option-${code}`);
    await expect(option).toHaveAttribute("lang", lang);
    await expect(option).toHaveAccessibleName(name);
  }
  expect(errors).toEqual([]);
});
