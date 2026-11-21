import type { Locator, Page } from "@playwright/test";

import { collectErrors, DARK_BG, expect, LIGHT_BG, test } from "./fixtures";

// 리뷰 라운드 3 회귀 테스트: R3-01 결과 0건 필터의 빈 tabpanel 포커스 표시(WCAG 2.4.7 Focus Visible).
// AC 판정 테스트가 아니므로 제목은 리뷰 ID(R3-xx)로 시작해 PRD §7.3 AC 집계(^AC-n.m)에 들어가지 않는다.
// R2-05로 0건일 때 빈 패널이 Tab 정지점(tabindex 0)이 됐지만 패널 높이가 0이라 브라우저 포커스 링이 그려지지 않았다
// (포커스 전후 패널 영역 스크린숏이 바이트 단위로 같음, 리뷰 실측). 패널 영역을 포커스 상태와 blur 상태로 찍어 실제로 달라지는지 본다.

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const CARD_SELECTOR = '[data-testid^="schedule-card-"]';
/** 상호작용 요소 최소 터치 영역(px, MIN_TOUCH_TARGET). 0건 패널도 이만큼의 보이는 상자를 가진다 */
const MIN_BOX = 44;
/** 포커스 링은 요소 상자 바깥에 그려지므로 그만큼 넓혀 찍는다(필터 탭과는 24px 떨어져 있어 탭의 링은 들어오지 않는다) */
const RING_MARGIN = 8;

/** 요소의 computed outline(스타일·두께·색) */
async function outlineOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
  });
}

/** 패널 상자를 RING_MARGIN만큼 넓힌 영역의 스크린숏(포커스 링 포함) */
async function shotAround(page: Page, locator: Locator): Promise<Buffer> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("패널 boundingBox가 없다");
  return page.screenshot({
    clip: {
      x: Math.max(0, box.x - RING_MARGIN),
      y: Math.max(0, box.y - RING_MARGIN),
      width: box.width + RING_MARGIN * 2,
      height: box.height + RING_MARGIN * 2,
    },
    animations: "disabled",
    caret: "hide",
  });
}

test("R3-01 결과 0건 필터(생년월일 2026-10-18 + '지남')에서 Tab으로 빈 목록 패널(tabpanel)에 포커스하면 패널은 높이 44px 이상의 보이는 상자이고, 라이트·다크 모두 포커스 표시가 실제로 그려진다(포커스 전후 outline과 패널 영역 스크린숏이 다르다)", async ({
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
  const pastFilter = schedule.getByTestId("filter-past");
  await expect(cards).toHaveCount(41);
  // R2-05와 같은 키보드 경로: '전체'에서 End로 '지남'(0건)을 고른다
  await schedule.getByTestId("filter-all").focus();
  await page.keyboard.press("End");
  await expect(pastFilter).toBeFocused();
  await expect(cards).toHaveCount(0);

  for (const [scheme, background] of [
    ["light", LIGHT_BG],
    ["dark", DARK_BG],
  ] as const) {
    // 테마는 헤더 테마 스위치로 바꾼다(v1.5 U-24: 앱이 OS 색 모드를 따르지 않음). 기본값은 라이트다
    if (scheme === "dark") {
      await schedule.getByTestId("header-theme-toggle").click();
      await pastFilter.focus();
    }
    await expect(schedule).toHaveCSS("background-color", background);
    await expect(pastFilter).toBeFocused();
    const blurredOutline = await outlineOf(panel);

    await page.keyboard.press("Tab");
    await expect(panel).toBeFocused();
    await expect(panel).toHaveAccessibleName("지남");
    // 보이는 상자: 높이 0이면 Playwright가 보이지 않는 요소로 본다
    await expect.soft(panel, `${scheme}: 패널이 보인다`).toBeVisible();
    const box = await panel.boundingBox();
    expect
      .soft(box?.height ?? 0, `${scheme}: 패널 높이 ≥ ${MIN_BOX}px`)
      .toBeGreaterThanOrEqual(MIN_BOX);
    const focusedOutline = await outlineOf(panel);
    const focusedShot = await shotAround(page, panel);

    // blur 상태(포커스는 body)로 같은 영역을 다시 찍는다
    await panel.evaluate((element) => {
      if (element instanceof HTMLElement) element.blur();
    });
    await expect(panel).not.toBeFocused();
    const blurredShot = await shotAround(page, panel);

    test.info().annotations.push({
      type: `focus-${scheme}`,
      description: JSON.stringify({
        box,
        blurredOutline,
        focusedOutline,
        shotBytes: [focusedShot.length, blurredShot.length],
      }),
    });
    expect
      .soft(focusedOutline, `${scheme}: 포커스되면 outline이 생긴다`)
      .not.toBe(blurredOutline);
    expect
      .soft(
        focusedShot.equals(blurredShot),
        `${scheme}: 포커스 전후 패널 영역 스크린숏이 같다(포커스 표시가 안 보임)`
      )
      .toBe(false);

    // 다음 테마 반복을 위해 선택 탭으로 포커스를 되돌린다
    await pastFilter.focus();
  }
  expect(errors).toEqual([]);
});
