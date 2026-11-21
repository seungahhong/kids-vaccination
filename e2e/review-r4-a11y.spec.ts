import type { Locator, Page } from "@playwright/test";

import {
  CHILDREN_KEY,
  expect,
  fillBirthdate,
  readChildren,
  test,
} from "./fixtures";

// 리뷰 라운드 4(웹 접근성 재검토) 회귀 테스트. axe-core(e2e/axe.spec.ts)가 볼 수 없는 키보드·포커스·고지 동작이다.
// R4-01 헤더 메뉴 Escape 닫기 · R4-02 메뉴 밖으로 나간 포커스에 메뉴 닫기 · R4-03 화면 제목·잃은 포커스·완료 토글 고지
// R4-05 랜드마크 · R4-06 아이 삭제 확인 Escape 취소. (R4-04 필수 표시는 e2e/home.spec.ts AC-1.1이 함께 본다.)

const APP_NAME = "아기 예방접종 일정";

const ONE_CHILD = JSON.stringify({
  v: 1,
  activeId: "c1",
  children: [
    { id: "c1", name: "서준", birthdate: "2026-04-30", completed: [] },
  ],
});

/** 포커스된 요소가 locator 안(자신 포함)에 있는지 */
async function focusInside(locator: Locator): Promise<boolean> {
  return locator.evaluate((root) => {
    const active = document.activeElement;
    return active !== null && root.contains(active);
  });
}

async function headerOf(page: Page, screen: string): Promise<Locator> {
  return page.getByTestId(`screen-${screen}`).getByTestId("app-header");
}

test.describe("R4-01 헤더 메뉴는 Escape로 닫힌다", () => {
  test("R4-01 언어 버튼에 Enter로 메뉴를 열고 메뉴 안(선택된 언어)으로 Tab한 뒤 Escape를 누르면 메뉴가 닫히고 포커스가 언어 버튼으로 돌아온다. 버튼에 포커스가 있을 때 Escape도 닫는다", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    const home = screenOf("home");
    const button = home.getByTestId("header-language-button");
    const panel = home.getByTestId("header-language-panel");

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await focusInside(panel)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("R4-01 아이 추가 메뉴를 열면 포커스가 메뉴 안에 있고, Escape를 누르면 메뉴가 닫히며 포커스가 '아이 추가' 버튼으로 돌아온다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [CHILDREN_KEY]: ONE_CHILD });
    await page.goto("/");
    const home = screenOf("home");
    const button = home.getByTestId("header-add-child-button");
    const panel = home.getByTestId("header-add-panel");

    await button.click();
    await expect(panel).toBeVisible();
    await expect.poll(() => focusInside(panel)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(button).toBeFocused();
  });
});

test.describe("R4-02 포커스가 메뉴 밖으로 나가면 메뉴가 닫힌다", () => {
  test("R4-02 아이 추가 메뉴 안에서 Tab을 계속 누르면 메뉴의 마지막 컨트롤 다음에서 메뉴가 닫혀, 포커스가 메뉴에 가려진 본문 컨트롤에 머물지 않는다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [CHILDREN_KEY]: ONE_CHILD });
    await page.goto("/");
    const home = screenOf("home");
    const overlay = home.getByTestId("header-add-overlay");
    await home.getByTestId("header-add-child-button").click();
    await expect.poll(() => focusInside(overlay)).toBe(true);

    let left = false;
    for (let i = 0; i < 12 && !left; i += 1) {
      await page.keyboard.press("Tab");
      left = (await overlay.count()) === 0 || !(await focusInside(overlay));
    }

    expect(left).toBe(true);
    await expect(overlay).toHaveCount(0);
  });

  test("R4-02 언어 메뉴 안(라디오)에서 Tab으로 나가면 메뉴가 닫힌다", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    const home = screenOf("home");
    const panel = home.getByTestId("header-language-panel");
    await home.getByTestId("header-language-button").focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    expect(await focusInside(panel)).toBe(true);

    await page.keyboard.press("Tab");

    await expect(panel).toHaveCount(0);
  });
});

test.describe("R4-03 화면 제목·잃은 포커스·완료 토글 고지", () => {
  test("R4-03 문서 제목은 홈이 앱 이름, 일정·설정은 '화면 · 앱 이름'이고, 언어를 바꾸면 그 언어로 바뀐다", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(APP_NAME);

    await page.getByRole("tab", { name: "접종 일정" }).click();
    await expect(page).toHaveTitle(`접종 일정 · ${APP_NAME}`);

    await page.getByRole("tab", { name: "설정" }).click();
    await expect(page).toHaveTitle(`설정 · ${APP_NAME}`);

    await page
      .getByTestId("screen-settings")
      .getByRole("radio", { name: "English", exact: true })
      .click();
    await expect(page).toHaveTitle("Settings · Baby Vaccination Schedule");
  });

  test("R4-03 홈 추가 폼으로 아이를 추가하면 일정 화면으로 가며 포커스가 일정 화면 제목(h1)으로 옮겨 간다", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    await fillBirthdate(screenOf("home"), "2024-01-31");
    await screenOf("home").getByTestId("birthdate-submit").press("Enter");

    await expect(page).toHaveURL("/schedule");
    const title = screenOf("schedule").getByRole("heading", { level: 1 });
    await expect(title).toBeFocused();
    await expect(page).toHaveTitle(`접종 일정 · ${APP_NAME}`);
  });

  test("R4-03 일정 화면 헤더의 '아이 추가' 메뉴로 아이를 추가해도(화면은 그대로) 사라진 제출 버튼 대신 일정 화면 제목에 포커스가 간다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [CHILDREN_KEY]: ONE_CHILD });
    await page.goto("/schedule");
    const schedule = screenOf("schedule");
    await schedule.getByTestId("header-add-child-button").click();
    const panel = schedule.getByTestId("header-add-panel");
    await fillBirthdate(panel, "2024-01-31");
    await panel.getByTestId("birthdate-submit").press("Enter");

    await expect(panel).toHaveCount(0);
    await expect(schedule.getByRole("heading", { level: 1 })).toBeFocused();
    await expect
      .poll(async () => {
        const stored = await readChildren(page);
        return typeof stored === "object" &&
          stored !== null &&
          "children" in stored &&
          Array.isArray(stored.children)
          ? stored.children.length
          : 0;
      })
      .toBe(2);
  });

  test("R4-03 완료 체크박스를 누르면 보이지 않는 라이브 영역(aria-live polite)이 '{카드}: 접종 완료로 표시했어요'를, 다시 누르면 '…해제했어요'를 알린다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [CHILDREN_KEY]: ONE_CHILD });
    await page.goto("/schedule");
    const schedule = screenOf("schedule");
    const live = schedule.getByTestId("schedule-announcement");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveText("");

    const checkbox = schedule.getByTestId("complete-checkbox").first();
    const label = (await checkbox.getAttribute("aria-label")) ?? "";
    const name = label.replace(/: 접종 완료$/, "");
    expect(name).not.toBe(label);
    const card = schedule.getByRole("checkbox", { name: label });

    await checkbox.click();
    await expect(live).toHaveText(`${name}: 접종 완료로 표시했어요`);

    await card.click();
    await expect(live).toHaveText(`${name}: 접종 완료 표시를 해제했어요`);
  });
});

test("R4-05 보이는 화면마다 헤더는 banner, 본문은 main 랜드마크가 하나씩이다(웹 <header>·<main>)", async ({
  page,
}) => {
  await page.goto("/");
  for (const [tab, screen] of [
    ["홈", "home"],
    ["접종 일정", "schedule"],
    ["설정", "settings"],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(await headerOf(page, screen)).toHaveJSProperty(
      "tagName",
      "HEADER"
    );
    await expect(
      page.getByTestId(`screen-${screen}`).getByRole("main")
    ).toHaveJSProperty("tagName", "MAIN");
  }
});

test("R4-06 설정에서 아이 삭제 확인을 연 뒤 Escape를 누르면 취소와 같아 확인 상자가 닫히고 포커스가 삭제 버튼으로 돌아오며 아이는 그대로다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [CHILDREN_KEY]: ONE_CHILD });
  await page.goto("/settings");
  const settings = screenOf("settings");
  await settings.getByTestId("child-delete").click();
  const group = settings.getByTestId("child-delete-group");
  await expect(group).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(group).toHaveCount(0);
  await expect(settings.getByTestId("child-delete")).toBeFocused();
  expect(await readChildren(page)).toMatchObject({
    children: [{ id: "c1" }],
  });
});
