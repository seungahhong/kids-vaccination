import type { Locator, Page } from "@playwright/test";

import {
  birthdateParts,
  CHILDREN_KEY,
  expect,
  fillBirthdate,
  readChildren,
  readStorage,
  test,
} from "./fixtures";

// 리뷰 라운드 1 회귀 테스트(그룹 A: 홈·날짜 입력·웹 템플릿). AC 판정용이 아니므로 제목은 AC ID가 아니라 리뷰 ID(R1-nn)로
// 시작한다(PRD §7.3 집계: AC 접두가 없는 테스트는 보조 테스트로 따로 보고된다).
// 스크롤은 사용자 동작(마우스 휠)으로만 한다. Playwright의 click·scrollIntoViewIfNeeded는 overflow:hidden 상자도 스크립트로
// 스크롤하므로, 그것으로는 "사용자가 닿을 수 없음"을 재현하지 못한다(리뷰 R1-02 실측: 휠 뒤에도 위치 그대로).

// ---------------------------------------------------------------------------
// R1-01 키보드로 날짜 입력
// ---------------------------------------------------------------------------

// v1.8(U-32): 웹 피커는 연·월·일 <select> 3개다. v1.7까지의 <input type="date"> 타이핑 중간값(0002-… → 2024-…) 문제는 사라졌고,
// 키보드 사용자는 Tab으로 칸을 옮기며 선택 상자의 글자 찾기(type-ahead: 앞글자를 치면 그 글자로 시작하는 항목을 고름)로 고른다.
test.describe("R1-01 웹 날짜 선택 키보드 입력", () => {
  /** 홈을 열고 연도 칸과 제출 버튼을 돌려준다 */
  async function openHome(
    page: Page,
    screenOf: (name: "home") => Locator
  ): Promise<{ home: Locator; submit: Locator }> {
    await page.goto("/");
    const home = screenOf("home");
    await expect(home).toBeVisible();
    return { home, submit: home.getByTestId("birthdate-submit") };
  }

  test("R1-01 연도 칸에 포커스를 두고 키보드로 2024 → Tab → 3 → Tab → 15를 치면 세 칸이 2024년·3월·15일이 되고, 일을 고르기 전까지 제출은 비활성·저장 없음이며, 다 고르면 제출 활성이고 제출하면 그 날짜가 저장된다", async ({
    page,
    screenOf,
  }) => {
    const { home, submit } = await openHome(page, screenOf);
    expect(await birthdateParts(home)).toEqual(["", "", ""]);

    await home.getByTestId("birthdate-year").focus();
    await page.keyboard.type("2024");
    await page.keyboard.press("Tab");
    await expect(home.getByTestId("birthdate-month")).toBeFocused();
    await page.keyboard.type("3");
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(await readStorage(page, CHILDREN_KEY)).toBeNull();

    await page.keyboard.press("Tab");
    await expect(home.getByTestId("birthdate-day")).toBeFocused();
    await page.keyboard.type("15");

    await expect.poll(() => birthdateParts(home)).toEqual(["2024", "3", "15"]);
    await expect(submit).not.toHaveAttribute("aria-disabled");
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page).toHaveURL("/schedule");
    // v1.7(FR-16): 아이 목록 키(JSON)에 그 날짜의 아이가 저장된다
    await expect
      .poll(() => readChildren(page))
      .toMatchObject({ children: [{ birthdate: "2024-03-15" }] });
  });

  test("R1-01 2024-01-31을 고른 뒤 연도 칸만 키보드로 2025로 고치면 월·일은 그대로 2025-01-31이 되고 제출 버튼이 활성이다", async ({
    page,
    screenOf,
  }) => {
    const { home, submit } = await openHome(page, screenOf);
    await fillBirthdate(home, "2024-01-31");
    expect(await birthdateParts(home)).toEqual(["2024", "1", "31"]);

    await home.getByTestId("birthdate-year").focus();
    await page.keyboard.type("2025");

    await expect.poll(() => birthdateParts(home)).toEqual(["2025", "1", "31"]);
    await expect(submit).not.toHaveAttribute("aria-disabled");
    await expect(submit).toBeEnabled();
  });

  test("R1-01 2024-01-31을 고른 뒤 월만 2월로 바꾸면 없는 날(2월 31일)이 되지 않고 2024-02-29로 맞춰지며, 연도를 2026년으로 바꾸면 2026-02-28이 된다", async ({
    page,
    screenOf,
  }) => {
    const { home, submit } = await openHome(page, screenOf);
    await fillBirthdate(home, "2024-01-31");

    await home.getByTestId("birthdate-month").selectOption({ value: "2" });
    await expect.poll(() => birthdateParts(home)).toEqual(["2024", "2", "29"]);

    await home.getByTestId("birthdate-year").selectOption({ value: "2026" });
    await expect.poll(() => birthdateParts(home)).toEqual(["2026", "2", "28"]);
    await expect(submit).toBeEnabled();
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
      screenOf,
    }) => {
      await page.setViewportSize(viewport);
      // v1.7(U-30): 아이 추가 폼은 아이가 없을 때만 홈에 있다. 생년월일을 넣어 제출 버튼을 활성으로 만든다
      await page.goto("/");
      const home = screenOf("home");
      await expect(home).toBeVisible();
      await fillBirthdate(home, "2024-01-31");
      const submit = home.getByTestId("birthdate-submit");
      await expect(submit).toBeEnabled();
      // 입력 때문에 내려간 스크롤을 맨 위로 돌린 뒤 사용자처럼 휠로 내린다
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, -4000);
      const tabBar = page.getByRole("tablist");
      await expect(tabBar).toHaveCount(1);

      // 사용자 스크롤: 본문 위쪽(스크롤 밖에 고정된 앱 헤더 바로 아래, FR-15)에 마우스를 두고 휠을 굴린다
      const header = await home.getByTestId("app-header").boundingBox();
      if (header === null) throw new Error("헤더 bounding box 없음");
      await page.mouse.move(viewport.width / 2, header.y + header.height + 20);
      await page.mouse.wheel(0, 2000);

      await expect(submit).toBeInViewport({ ratio: 1 });
      const box = await submit.boundingBox();
      const bar = await tabBar.boundingBox();
      if (box === null || bar === null) throw new Error("bounding box 없음");
      // 고정 헤더 아래, 탭 바 위에 온전히 있다
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
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
