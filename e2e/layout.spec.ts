import type { Locator } from "@playwright/test";

import { expect, test } from "./fixtures";

// v1.8 U-31 보조 테스트: 데스크톱처럼 창이 넓어도 앱은 iPad 세로 너비(768px, MAX_CONTENT_WIDTH) 이하의 가운데 열로 보이고 더 늘어나지
// 않는다. 루트 레이아웃(app/_layout.tsx)이 창 전체 app-backdrop 안에 app-frame(maxWidth 768, 가운데)을 두고, 창이 더 넓을 때만 열
// 양옆에 경계선을 그린다. 헤더·본문·하단 탭 바가 모두 이 열 안에 있다. AC 판정이 아니므로 제목은 U-31로 시작한다.

const MAX_CONTENT_WIDTH = 768;

/** 요소의 boundingBox(없으면 실패) */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("boundingBox 없음");
  return box;
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`U-31 ${viewport.width}×${viewport.height} 창에서 앱 열(app-frame)은 너비 768로 가운데에 있고, 헤더·홈 본문·하단 탭 바가 그 열 안에 있으며 열 양옆에 경계선이 있다`, async ({
    page,
    screenOf,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const home = screenOf("home");
    await expect(home).toBeVisible();

    const frame = await boxOf(page.getByTestId("app-frame"));
    expect(frame.width).toBe(MAX_CONTENT_WIDTH);
    expect(frame.x).toBeCloseTo((viewport.width - MAX_CONTENT_WIDTH) / 2, 0);
    for (const [name, locator] of [
      ["app-header", home.getByTestId("app-header")],
      ["screen-home", home],
      ["tablist", page.getByRole("tablist")],
    ] as const) {
      const box = await boxOf(locator);
      expect(box.x, name).toBeGreaterThanOrEqual(frame.x);
      expect(box.x + box.width, name).toBeLessThanOrEqual(
        frame.x + frame.width + 0.5
      );
    }
    const borders = await page.getByTestId("app-frame").evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderLeftWidth, style.borderRightWidth];
    });
    expect(borders).toEqual(["1px", "1px"]);
  });
}

test("U-31 390×844(휴대폰)과 768×1024(iPad 세로) 창에서는 앱 열이 창 너비를 꽉 채우고 양옆 경계선이 없다", async ({
  page,
  screenOf,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(screenOf("home")).toBeVisible();

    const frame = await boxOf(page.getByTestId("app-frame"));
    expect(frame.x).toBe(0);
    expect(frame.width).toBe(viewport.width);
    const borders = await page
      .getByTestId("app-frame")
      .evaluate((element) => getComputedStyle(element).borderLeftWidth);
    expect(borders).toBe("0px");
  }
});
