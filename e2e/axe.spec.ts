import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { CHILDREN_KEY, expect, test } from "./fixtures";

// axe-core 자동 검사(WCAG 2.1 A·AA + best-practice): 사람이 정한 항목만 보던 a11y 스펙(G-6·R1~R3)이 놓치는 규칙 위반을 화면 상태별로 잡는다.
// 떠난 탭은 DOM에 남지만 useBlurInert가 inert를 붙이므로 axe도 숨은 것으로 본다. 그래서 페이지 전체를 검사한다.

// best-practice는 WCAG 조항은 아니지만 랜드마크(region)·제목 구조 같은 화면 낭독기 탐색 품질을 본다(리뷰 R4-05)
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];

const TWO_CHILDREN = JSON.stringify({
  v: 1,
  activeId: "c2",
  children: [
    {
      id: "c1",
      name: "서준",
      birthdate: "2024-01-31",
      completed: ["bcg-1", "hepb-1"],
    },
    { id: "c2", birthdate: "2026-04-30", completed: ["hepb-1"] },
  ],
});

// 하단 탭 바는 region 규칙에서만 뺀다. 탭 바 뿌리 View는 expo-router(react-navigation BottomTabBar) 내부라 role을 줄 수 없고,
// BottomTabBar를 감싸 navigation 랜드마크를 주려면 공개되지 않은 경로를 import해야 한다. 탭 바 자체는 role tablist·tab이라
// 키보드·화면 낭독기로 쓸 수 있다(G-6·R2-01). 다른 규칙(대비·이름 등)은 탭 바에도 그대로 적용한다.
const TAB_BAR_MARK = "data-axe-tab-bar";

async function markTabBar(page: Page): Promise<void> {
  await page.evaluate((mark) => {
    for (const tab of document.querySelectorAll('a[role="tab"]')) {
      tab.closest('[role="tablist"]')?.parentElement?.setAttribute(mark, "");
    }
  }, TAB_BAR_MARK);
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await markTabBar(page);
  const rest = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .disableRules(["region"])
    .analyze();
  const region = await new AxeBuilder({ page })
    .withRules(["region"])
    .exclude(`[${TAB_BAR_MARK}]`)
    .analyze();
  const violations = [...rest.violations, ...region.violations];
  const summary = violations.map(
    (v) =>
      `${v.id} [${v.impact ?? "-"}] ${v.help}\n` +
      v.nodes
        .slice(0, 5)
        .map((n) => `    ${n.target.join(" ")} :: ${n.failureSummary ?? ""}`)
        .join("\n")
  );
  expect(summary, summary.join("\n")).toEqual([]);
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole("tab", { name }).click();
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`AXE ${theme}`, () => {
    test.beforeEach(async ({ seed }) => {
      await seed({ "vaccination-app-theme": theme });
    });

    test(`AXE-1 ${theme} 아이 없는 홈(아이 추가 폼)`, async ({
      page,
      screenOf,
    }) => {
      await page.goto("/");
      await expect(screenOf("home")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test(`AXE-2 ${theme} 아이 없는 일정(빈 상태)`, async ({
      page,
      screenOf,
    }) => {
      await page.goto("/");
      await openTab(page, "접종 일정");
      await expect(screenOf("schedule").getByTestId("go-home")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });

  test.describe(`AXE ${theme} 아이 2명`, () => {
    test.beforeEach(async ({ seed }) => {
      await seed({
        "vaccination-app-theme": theme,
        [CHILDREN_KEY]: TWO_CHILDREN,
      });
    });

    test(`AXE-3 ${theme} 홈 목록`, async ({ page, screenOf }) => {
      await page.goto("/");
      await expect(screenOf("home").getByTestId("home-children")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test(`AXE-4 ${theme} 헤더 아이 추가 메뉴`, async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("header-add-child-button").first().click();
      await expect(page.getByTestId("header-add-panel")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test(`AXE-5 ${theme} 헤더 언어 메뉴`, async ({ page }) => {
      await page.goto("/");
      await page.getByTestId("header-language-button").first().click();
      await expect(page.getByTestId("header-language-panel")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test(`AXE-6 ${theme} 일정 전체·카드 펼침·완료 체크`, async ({
      page,
      screenOf,
    }) => {
      await page.goto("/");
      await openTab(page, "접종 일정");
      const schedule = screenOf("schedule");
      await schedule.getByTestId("card-toggle").first().click();
      await expect(schedule.getByTestId("card-details").first()).toBeVisible();
      await expectNoAxeViolations(page);
    });

    for (const filter of ["upcoming", "past"] as const) {
      test(`AXE-7 ${theme} 일정 필터 ${filter}`, async ({ page, screenOf }) => {
        await page.goto("/");
        await openTab(page, "접종 일정");
        await screenOf("schedule").getByTestId(`filter-${filter}`).click();
        await expectNoAxeViolations(page);
      });
    }

    test(`AXE-8 ${theme} 설정·아이 삭제 확인`, async ({ page, screenOf }) => {
      await page.goto("/");
      await openTab(page, "설정");
      const settings = screenOf("settings");
      await expectNoAxeViolations(page);
      await settings.getByTestId("child-delete").first().click();
      await expect(
        settings.getByTestId("child-delete-question").first()
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}
