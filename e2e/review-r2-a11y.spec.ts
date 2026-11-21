import type { Page } from "@playwright/test";

import {
  CHILDREN_KEY,
  collectErrors,
  expect,
  fillBirthdate,
  readStorage,
  test,
} from "./fixtures";

// 리뷰 라운드 2 회귀 테스트: R2-01 떠난 탭 화면의 키보드 포커스, R2-05 0건 필터의 빈 tabpanel, R2-06 삭제 결과 고지.
// AC 판정 테스트가 아니므로 제목은 리뷰 ID(R2-xx)로 시작해 PRD §7.3 AC 집계(^AC-n.m)에 들어가지 않는다.
// 기준 환경은 fixtures(ENV-E2E, 시계 2026-10-18 10:00 KST)와 같고, 화면 요소는 screenOf(...) 범위에서 찾는다(AD-08).
// 웹에서 떠난 탭 화면은 언마운트되지 않고 활성 화면 뒤에 겹쳐 남는다(조상 aria-hidden="true"만 붙음, 리뷰 R2-01 원인 사슬).
// "떠난 화면 안"은 그 라이브러리 표시(aria-hidden 조상)로 판정한다. 그래서 수정 방식과 무관하게 같은 기준으로 RED·GREEN을 본다.

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const CARD_SELECTOR = '[data-testid^="schedule-card-"]';

/** Tab 한 번 뒤의 포커스 위치 */
type FocusStop = {
  /** 포커스가 있는 화면(screen-*)의 testID. 화면 밖이면 하단 탭 "tab-bar", 아무것도 없으면 "body", 그 밖은 "other" */
  readonly where: string;
  /** 자신이나 조상에 aria-hidden="true"가 있다(떠난 탭 화면 안이다) */
  readonly hidden: boolean;
  /** 요소 요약: data-testid, 없으면 "role:텍스트" */
  readonly element: string;
};

/** document.activeElement의 위치를 요약한다 */
async function focusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null || element === document.body) {
      return { where: "body", hidden: false, element: "body" };
    }
    const screen = element.closest('[data-testid^="screen-"]');
    const role = element.getAttribute("role");
    const outside = role === "tab" ? "tab-bar" : "other";
    return {
      where: screen?.getAttribute("data-testid") ?? outside,
      hidden: element.closest('[aria-hidden="true"]') !== null,
      element:
        element.getAttribute("data-testid") ??
        `${role ?? element.tagName.toLowerCase()}:${(element.textContent ?? "").trim()}`,
    };
  });
}

/** keys를 차례로 누르고 매번 포커스 위치를 기록한다 */
async function pressAndTrack(
  page: Page,
  keys: readonly string[]
): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  for (const key of keys) {
    await page.keyboard.press(key);
    stops.push(await focusStop(page));
  }
  return stops;
}

/** 위치별 정지 횟수(판정 근거로 annotation에 남긴다) */
function countByWhere(stops: readonly FocusStop[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { where } of stops) counts[where] = (counts[where] ?? 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// R2-01 떠난 탭 화면은 Tab 순서·보조기기에서 빠진다(웹)
// ---------------------------------------------------------------------------

test("R2-01 홈 → 설정 → 일정 순으로 세 탭을 연 뒤 일정 화면에서 Tab을 220번(두 바퀴 이상) 눌러도 포커스는 보이는 일정 화면·하단 탭과 한 바퀴 끝의 body에만 가고, 떠난 홈·설정 화면(aria-hidden) 안의 컨트롤에는 한 번도 가지 않는다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  const errors = collectErrors(page);
  await page.goto("/");
  // v1.7(FR-16): 아이가 있으면 홈은 저장된 아이 목록(child-shortcut), 설정은 아이별 삭제 버튼(child-delete)이다
  await expect(screenOf("home").getByTestId("child-shortcut")).toBeVisible();
  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(screenOf("settings").getByTestId("child-delete")).toBeVisible();
  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule.locator(CARD_SELECTOR)).toHaveCount(41);
  // 전제(리뷰 실측 1): 떠난 두 화면은 포커스 가능한 컨트롤과 함께 DOM에 남아 있다
  await expect(screenOf("home").getByTestId("child-shortcut")).toHaveCount(1);
  await expect(screenOf("settings").getByTestId("child-delete")).toHaveCount(1);

  // 한 바퀴 ≈ 헤더 3(아이 추가·테마·언어, FR-15·16) + 아이 칩 1 + 필터 1 + 카드마다 완료 체크박스·토글 2 × 41(FR-14) + 하단 탭 + body.
  // 90 → 180 → 200 → 220
  const stops = await pressAndTrack(page, Array<string>(220).fill("Tab"));

  const counts = countByWhere(stops);
  test.info().annotations.push({
    type: "tab-stops",
    description: JSON.stringify(counts),
  });
  expect(stops.filter((stop) => stop.hidden)).toEqual([]);
  expect(Object.keys(counts).sort()).toEqual(
    ["body", "screen-schedule", "tab-bar"].sort()
  );
  // 한 바퀴의 끝(body)을 두 번 이상 지났다
  expect(counts.body ?? 0).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("R2-01 일정 화면 마지막 카드에서 리뷰가 실측한 키 순서(Tab×3 → Enter → Tab → Enter)를 눌러도 떠난 설정 화면의 삭제 버튼·확인 상자·확인에 닿지 않아 아이가 삭제되지 않는다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings.getByTestId("child-delete")).toBeVisible();
  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  const schedule = screenOf("schedule");
  const toggles = schedule.getByTestId("card-toggle");
  await expect(toggles).toHaveCount(41);
  await toggles.last().focus();
  await expect(toggles.last()).toBeFocused();

  const keys = ["Tab", "Tab", "Tab", "Enter", "Tab", "Enter"] as const;
  const stops = await pressAndTrack(page, keys);

  test.info().annotations.push({
    type: "key-path",
    description: stops
      .map((stop, index) => `${keys[index]} → ${stop.where}/${stop.element}`)
      .join(" | "),
  });
  expect(stops.filter((stop) => stop.hidden)).toEqual([]);
  // 확인 단계가 열리지 않았고 아이·저장값이 그대로다(예전에는 일정 화면이 갑자기 빈 상태가 됐다)
  await expect(settings.getByTestId("child-row")).toHaveCount(1);
  await expect(settings.getByTestId("child-delete-confirm")).toHaveCount(0);
  await expect(schedule.getByTestId("schedule-empty")).toHaveCount(0);
  expect(await readStorage(page, CHILDREN_KEY)).not.toBeNull();
});

test("R2-01 탭을 오가도 화면 상태(필터 '지남'·bcg-1 펼침)는 그대로이고, 다시 연 화면의 컨트롤은 Tab으로 차례로 포커스되며 떠난 화면의 컨트롤은 focus()로도 포커스되지 않는다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const settings = screenOf("settings");
  const cards = schedule.locator(CARD_SELECTOR);
  const pastFilter = schedule.getByTestId("filter-past");
  const bcg1Toggle = schedule
    .getByTestId("schedule-card-bcg-1")
    .getByTestId("card-toggle");
  await expect(cards).toHaveCount(41);
  await schedule.getByRole("tab", { name: "지남", exact: true }).click();
  await expect(cards).toHaveCount(13);
  await bcg1Toggle.click();
  await expect(bcg1Toggle).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  await settings.getByTestId("theme-option-light").focus();
  await expect(settings.getByTestId("theme-option-light")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("locale-option-ko")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(settings.getByTestId("child-delete")).toBeFocused();
  // 떠난 일정 화면의 컨트롤은 스크립트 focus()로도 포커스되지 않는다
  await pastFilter.focus();
  await expect(pastFilter).not.toBeFocused();
  await expect(settings.getByTestId("child-delete")).toBeFocused();

  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  // 화면을 언마운트하지 않으므로 필터·펼침 상태가 그대로다
  await expect(pastFilter).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(13);
  await expect(bcg1Toggle).toHaveAttribute("aria-expanded", "true");
  // 다시 연 일정 화면의 컨트롤은 다시 포커스되고 Tab 순서도 돌아온다(카드 안에서는 완료 체크박스 → 토글, FR-14)
  await pastFilter.focus();
  await expect(pastFilter).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    schedule.getByTestId("schedule-card-bcg-1").getByTestId("complete-checkbox")
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(bcg1Toggle).toBeFocused();
  // 이번에는 떠난 설정 화면의 컨트롤이 포커스되지 않는다
  await settings.getByTestId("child-delete").focus();
  await expect(settings.getByTestId("child-delete")).not.toBeFocused();
  await expect(bcg1Toggle).toBeFocused();
});

test("R2-01 홈 추가 폼에 2024-01-31을 넣고 제출 버튼에 Enter를 눌러 일정 화면으로 가면 포커스가 떠난 홈 화면(aria-hidden)의 제출 버튼에 남지 않고, 다음 Tab은 보이는 일정 화면의 첫 컨트롤(헤더 '아이 추가' 버튼, FR-15·16)로 간다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await fillBirthdate(screenOf("home"), "2024-01-31");
  const submit = screenOf("home").getByTestId("birthdate-submit");
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await submit.focus();
  await expect(submit).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/schedule");
  await expect(screenOf("schedule").locator(CARD_SELECTOR)).toHaveCount(41);
  // 리뷰 실측 3: 예전에는 activeElement가 떠난 홈 화면의 birthdate-submit에 남았다
  await expect.poll(async () => (await focusStop(page)).hidden).toBe(false);
  await page.keyboard.press("Tab");
  expect(await focusStop(page)).toEqual({
    where: "screen-schedule",
    hidden: false,
    element: "header-add-child-button",
  });
});

// ---------------------------------------------------------------------------
// R2-05 결과 0건 필터의 빈 tabpanel(WAI-ARIA APG 탭 패턴)
// ---------------------------------------------------------------------------

test("R2-05 결과 0건 필터(생년월일 2026-10-18 + '지남')에서는 빈 목록 패널(role tabpanel, 이름 '지남')이 tabindex 0이라 선택 탭에서 Tab을 누르면 패널에 포커스가 가고, 결과가 있는 필터에서는 패널이 Tab 정지점이 아니라 첫 카드의 완료 체크박스로 간다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-10-18" });
  const errors = collectErrors(page);
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const panel = schedule.getByRole("tabpanel");
  const cards = schedule.locator(CARD_SELECTOR);
  const filter = (key: string) => schedule.getByTestId(`filter-${key}`);
  await expect(cards).toHaveCount(41);

  await filter("all").focus();
  await page.keyboard.press("End");
  await expect(filter("past")).toBeFocused();
  await expect(filter("past")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(panel).toBeFocused();
  await expect(panel).toHaveAccessibleName("지남");
  await expect(panel).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Shift+Tab");
  await expect(filter("past")).toBeFocused();

  // 결과가 있는 필터에서는 패널이 Tab 정지점이 아니다(첫 정지점은 첫 카드의 완료 체크박스, R1-04 계약·FR-14)
  await page.keyboard.press("Home");
  await expect(filter("all")).toHaveAttribute("aria-selected", "true");
  await expect(cards).toHaveCount(41);
  await expect(panel).not.toHaveAttribute("tabindex");
  await page.keyboard.press("Tab");
  await expect(
    schedule.getByTestId("schedule-card-bcg-1").getByTestId("complete-checkbox")
  ).toBeFocused();
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// R2-06 생년월일 삭제 결과 고지(WCAG 4.1.3 상태 메시지)
// ---------------------------------------------------------------------------

test("R2-06 설정의 아이 수 문구(settings-children-count)는 aria-live='polite' 영역이라 아이 삭제 → '확인'으로 지우면 같은 요소의 내용이 '저장된 아이 0명 (최대 10명)'으로 바뀌어 결과가 화면 낭독기에 알려진다(v1.7 FR-16)", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  const value = settings
    .getByTestId("settings-children-count")
    .locator('[aria-live="polite"]');
  await expect(value).toHaveText("저장된 아이 1명 (최대 10명)");
  const before = await value.elementHandle();

  await settings.getByTestId("child-delete").click();
  await settings.getByTestId("child-delete-confirm").click();

  await expect(value).toHaveText("저장된 아이 0명 (최대 10명)");
  // 삭제 전부터 있던 바로 그 요소의 내용이 바뀌었다(영역을 새로 만들면 변경이 알려지지 않을 수 있다)
  expect(
    await before.evaluate((element) => [
      element.isConnected,
      element.textContent,
    ])
  ).toEqual([true, "저장된 아이 0명 (최대 10명)"]);
  await expect.poll(() => readStorage(page, CHILDREN_KEY)).toBeNull();
  expect(errors).toEqual([]);
});
