import type { Page } from "@playwright/test";

import {
  expect,
  expectTabsInOrder,
  TAB_NAMES_KO,
  test,
  textColor,
} from "./fixtures";

// FR-11 하단 탭(US-15) E2E 판정 테스트. 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙).
// 하단 탭은 웹에서 role="tab" + aria-selected로 렌더되고 접근 이름은 tabBarAccessibilityLabel이다(R-10 실측).

type TabName = (typeof TAB_NAMES_KO)[number];

/** 이름이 selected인 탭만 aria-selected="true"이고 나머지는 "false"다 */
async function expectOnlySelected(
  page: Page,
  selected: TabName
): Promise<void> {
  for (const name of TAB_NAMES_KO) {
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute(
      "aria-selected",
      name === selected ? "true" : "false"
    );
  }
}

test("AC-15.1 '/'에 진입하면 role=tab이 정확히 3개(홈·접종 일정·설정 순)이고 홈 탭만 aria-selected=true다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  await expectTabsInOrder(page, TAB_NAMES_KO);
  await expectOnlySelected(page, "홈");
});

test("AC-15.2 접종 일정 탭을 누르면 경로가 /schedule이 되고 그 탭만 selected이며 활성 라벨 rgb(15, 118, 110)·비활성 라벨 rgb(120, 113, 108)이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();

  await expect(page).toHaveURL("/schedule");
  await expectOnlySelected(page, "접종 일정");

  const activeLabel = page
    .getByRole("tab", { name: "접종 일정", exact: true })
    .getByText("접종 일정", { exact: true });
  const inactiveLabel = page
    .getByRole("tab", { name: "홈", exact: true })
    .getByText("홈", { exact: true });
  expect(await textColor(activeLabel)).toBe("rgb(15, 118, 110)");
  expect(await textColor(inactiveLabel)).toBe("rgb(120, 113, 108)");
});

test("AC-15.3 /schedule에서 설정 탭, 이어서 홈 탭을 누르면 경로가 /settings, /가 되고 각 시점의 활성 탭이 selected다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/schedule");
  await expect(screenOf("schedule")).toBeVisible();
  await expectOnlySelected(page, "접종 일정");

  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  await expectOnlySelected(page, "설정");

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expectOnlySelected(page, "홈");
});

test("AC-15.4 저장값 locale 'zh'로 '/'에 진입하면 탭 라벨이 순서대로 首页·接种日程·设置다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ "vaccination-app-locale": "zh" });
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  await expectTabsInOrder(page, ["首页", "接种日程", "设置"]);
});
