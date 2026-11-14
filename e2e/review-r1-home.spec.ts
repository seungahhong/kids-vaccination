import type { Locator, Page } from "@playwright/test";

import { expect, readStorage, test } from "./fixtures";

// 리뷰 라운드 1 회귀 테스트(그룹 A: 홈·날짜 입력·웹 템플릿). AC 판정용이 아니므로 제목은 AC ID가 아니라 리뷰 ID(R1-nn)로
// 시작한다(PRD §7.3 집계: AC 접두가 없는 테스트는 보조 테스트로 따로 보고된다).
// 스크롤은 사용자 동작(마우스 휠)으로만 한다. Playwright의 click·scrollIntoViewIfNeeded는 overflow:hidden 상자도 스크립트로
// 스크롤하므로, 그것으로는 "사용자가 닿을 수 없음"을 재현하지 못한다(리뷰 R1-02 실측: 휠 뒤에도 위치 그대로).

const BIRTHDATE_KEY = "vaccination-app-birthdate";

// ---------------------------------------------------------------------------
// R1-01 키보드로 날짜 입력
// ---------------------------------------------------------------------------

test.describe("R1-01 웹 날짜 입력 키보드 타이핑", () => {
  // Chromium의 en-US <input type="date">는 월/일/연 칸 순서이고 focus()는 월 칸에서 시작한다. 연도 칸은 ArrowRight 2번이다.
  // 연도를 한 자리씩 치는 동안 브라우저 값은 0002-… → 0020-… → 0202-… → 2024-…를 거친다(리뷰 로그 01, 그룹 A 탐침 01).
  test.use({ locale: "en-US" });

  /** 홈을 열고 날짜 입력과 제출 버튼을 돌려준다 */
  async function openHome(
    page: Page,
    screenOf: (name: "home") => Locator
  ): Promise<{ input: Locator; submit: Locator }> {
    await page.goto("/");
    const home = screenOf("home");
    await expect(home).toBeVisible();
    return {
      input: home.getByTestId("birthdate-input"),
      submit: home.getByTestId("birthdate-submit"),
    };
  }

  test("R1-01 빈 입력에 키보드로 월·일(03·15)을 치고 연도를 치면 중간값 0002-03-15에서도 입력이 지워지지 않고, 2024까지 치면 2024-03-15·제출 활성이며 제출하면 그 날짜가 저장된다", async ({
    page,
    screenOf,
  }) => {
    const { input, submit } = await openHome(page, screenOf);
    await expect(input).toHaveValue("");

    await input.focus();
    await page.keyboard.type("0315");
    // 연도가 비어 있어 아직 미완성(브라우저 값 "")
    await expect(input).toHaveValue("");
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.press("2");
    await expect(input).toHaveValue("0002-03-15");
    // 유효한 날짜지만 허용 범위(2017-01-01 ~ 2026-10-18) 밖이라 비활성
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.type("024");
    await expect(input).toHaveValue("2024-03-15");
    await expect(submit).not.toHaveAttribute("aria-disabled");
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page).toHaveURL("/schedule");
    await expect
      .poll(() => readStorage(page, BIRTHDATE_KEY))
      .toBe("2024-03-15");
  });

  test("R1-01 저장값 2024-01-31의 연도만 키보드로 2025로 고치면 중간값(0002-01-31 등)을 거쳐 2025-01-31이 되고 제출 버튼이 활성이다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
    const { input, submit } = await openHome(page, screenOf);
    await expect(input).toHaveValue("2024-01-31");

    await input.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("2");
    await expect(input).toHaveValue("0002-01-31");
    await expect(submit).toHaveAttribute("aria-disabled", "true");

    await page.keyboard.type("025");
    await expect(input).toHaveValue("2025-01-31");
    await expect(submit).not.toHaveAttribute("aria-disabled");
    await expect(submit).toBeEnabled();
  });

  test("R1-01 저장값 2024-01-31의 연도를 키보드로 범위 밖 2030으로 고치면 입력값 2030-01-31은 그대로 보이고 제출 버튼은 비활성이다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
    const { input, submit } = await openHome(page, screenOf);
    await expect(input).toHaveValue("2024-01-31");

    await input.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("2030");

    await expect(input).toHaveValue("2030-01-31");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    // 저장값은 제출 전까지 바뀌지 않는다
    expect(await readStorage(page, BIRTHDATE_KEY)).toBe("2024-01-31");
  });
});

// ---------------------------------------------------------------------------
// R1-02 짧은 화면에서 홈 제출 버튼 도달
// ---------------------------------------------------------------------------

test.describe("R1-02 짧은 화면의 홈 스크롤", () => {
  // 844×390 = 가로 모드 휴대폰, 195×422 = 390×844를 200% 확대(WCAG 1.4.4), 320×256 = 세로 리플로 기준 높이(WCAG 1.4.10)
  const VIEWPORTS = [
    { width: 844, height: 390 },
    { width: 195, height: 422 },
    { width: 320, height: 256 },
  ] as const;

  for (const viewport of VIEWPORTS) {
    test(`R1-02 ${viewport.width}×${viewport.height}에서 홈 본문을 휠로 스크롤하면 제출 버튼이 탭 바에 가리지 않고 온전히 보이며, 눌러 일정 화면으로 이동한다`, async ({
      page,
      seed,
      screenOf,
    }) => {
      await page.setViewportSize(viewport);
      // 저장값이 있으면 바로가기 버튼까지 보여 본문이 가장 길다. 제출 버튼은 프리필로 활성이다
      await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
      await page.goto("/");
      const home = screenOf("home");
      await expect(home).toBeVisible();
      const submit = home.getByTestId("birthdate-submit");
      await expect(submit).toBeEnabled();
      const tabBar = page.getByRole("tablist");
      await expect(tabBar).toHaveCount(1);

      // 사용자 스크롤: 본문 위쪽에 마우스를 두고 휠을 굴린다
      await page.mouse.move(viewport.width / 2, 40);
      await page.mouse.wheel(0, 2000);

      await expect(submit).toBeInViewport({ ratio: 1 });
      const box = await submit.boundingBox();
      const bar = await tabBar.boundingBox();
      if (box === null || bar === null) throw new Error("bounding box 없음");
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(bar.y);
      // 버튼 가운데 점을 실제로 차지하는 요소가 버튼(또는 그 자식)이다
      const hitsSubmit = await submit.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        return top !== null && element.contains(top);
      });
      expect(hitsSubmit).toBe(true);

      await submit.click();
      await expect(page).toHaveURL("/schedule");
    });
  }
});

// ---------------------------------------------------------------------------
// R1-14 JavaScript 없이 읽는 HTML의 noscript 요약
// ---------------------------------------------------------------------------

test.describe("R1-14 JavaScript가 꺼진 짧은 화면의 noscript 요약", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 256 } });

  test("R1-14 JS가 꺼진 320×256 화면에서 휠로 스크롤하면 noscript 요약의 마지막 문장까지 보인다(body overflow:hidden에 잘리지 않음)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const lastParagraph = page.locator("body noscript p").last();
    await expect(lastParagraph).toHaveText(
      "앱을 사용하려면 브라우저에서 JavaScript를 켜 주세요."
    );
    // 전제: 처음에는 화면 아래에 있다(스크롤해야 보인다)
    await expect(lastParagraph).not.toBeInViewport();

    await page.mouse.move(160, 128);
    await page.mouse.wheel(0, 2000);

    await expect(lastParagraph).toBeInViewport({ ratio: 1 });
  });
});
