import {
  bgColor,
  collectErrors,
  DARK_BG,
  expect,
  LIGHT_BG,
  readStorage,
  TAB_NAMES_KO,
  test,
} from "./fixtures";

// 앱 헤더 E2E 판정 테스트: FR-15(US-20, U-23). 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙).
// 헤더는 각 탭 화면(screen-*) 맨 위에 있으므로 screenOf(...) 범위에서 찾는다(떠난 탭 화면의 헤더도 DOM에 남음, AD-08).
// 테마 스위치(role switch)와 언어 버튼(role button + aria-expanded, 펼치면 버튼 바로 뒤에 언어 radiogroup)이 설정 화면과
// 같은 상태를 바꾼다. 테마는 라이트·다크 2개다(v1.5 U-24).

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const THEME_KEY = "vaccination-app-theme";
const LOCALE_KEY = "vaccination-app-locale";
const SCREENS = [
  ["홈", "/", "home"],
  ["접종 일정", "/schedule", "schedule"],
  ["설정", "/settings", "settings"],
] as const;

test("AC-20.1 홈·일정·설정 화면마다 맨 위 헤더에 앱 이름 '아기 예방접종 일정', 테마 스위치(role switch '다크모드', aria-checked=false), 언어 버튼(이름 '언어: 한국어', aria-expanded=false)이 있고 헤더는 화면 제목(level 1 heading)보다 위에 있다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/");

  for (const [tab, path, name] of SCREENS) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    await expect(page).toHaveURL(path);
    const scope = screenOf(name);
    const header = scope.getByTestId("app-header");
    await expect(header).toBeVisible();
    await expect(header.getByTestId("header-app-name")).toHaveText(
      "아기 예방접종 일정"
    );
    await expect(header.getByRole("heading")).toHaveCount(0);
    const themeSwitch = header.getByRole("switch", {
      name: "다크모드",
      exact: true,
    });
    await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
    const languageButton = header.getByRole("button", {
      name: "언어: 한국어",
      exact: true,
    });
    await expect(languageButton).toHaveAttribute("aria-expanded", "false");
    const headerBox = await header.boundingBox();
    const titleBox = await scope
      .getByRole("heading", { level: 1 })
      .boundingBox();
    expect(headerBox && titleBox && headerBox.y < titleBox.y).toBe(true);
  }
  await expect(
    page.getByRole("tab", { name: /^(홈|접종 일정|설정)$/ })
  ).toHaveText([...TAB_NAMES_KO]);
});

test("AC-20.2 일정 화면 헤더의 테마 스위치를 누르면 aria-checked=true·배경 rgb(28, 25, 23)·저장값 'dark'이고 설정 화면의 theme-option-dark가 checked이며, 새로고침 뒤에도 다크이고 다시 누르면 라이트·저장값 'light'다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const themeSwitch = schedule.getByTestId("header-theme-toggle");
  await expect.poll(() => bgColor(schedule)).toBe(LIGHT_BG);

  await themeSwitch.click();

  await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => bgColor(schedule)).toBe(DARK_BG);
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("dark");
  await page.getByRole("tab", { name: "설정", exact: true }).click();
  const settings = screenOf("settings");
  await expect(settings.getByTestId("theme-option-dark")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(settings.getByTestId("header-theme-toggle")).toHaveAttribute(
    "aria-checked",
    "true"
  );

  await page.reload();
  await expect(settings).toBeVisible();
  await expect.poll(() => bgColor(settings)).toBe(DARK_BG);

  await settings.getByTestId("header-theme-toggle").click();

  await expect.poll(() => bgColor(settings)).toBe(LIGHT_BG);
  await expect(settings.getByTestId("theme-option-light")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("light");
});

test("AC-20.3 홈 헤더의 언어 버튼을 누르면 aria-expanded=true이고 언어 radio 4개(한국어 checked) 목록이 펼쳐지며, English를 누르면 목록이 닫히고 포커스가 언어 버튼(이름 'Language: English')으로 돌아오며 하단 탭·헤더 앱 이름이 영어, 저장값 'en', 설정의 locale-option-en이 checked다", async ({
  page,
  screenOf,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const home = screenOf("home");
  const languageButton = home.getByTestId("header-language-button");

  await languageButton.click();

  await expect(languageButton).toHaveAttribute("aria-expanded", "true");
  const panel = home.getByTestId("header-language-panel");
  await expect(panel.getByRole("radio")).toHaveCount(4);
  const radios = panel.getByRole("radio");
  for (const [index, name] of [
    "한국어",
    "English",
    "日本語",
    "中文",
  ].entries()) {
    await expect(radios.nth(index)).toHaveAccessibleName(name);
  }
  await expect(
    panel.getByRole("radio", { name: "한국어", exact: true })
  ).toHaveAttribute("aria-checked", "true");

  await panel.getByRole("radio", { name: "English", exact: true }).click();

  await expect(panel).toHaveCount(0);
  await expect(languageButton).toBeFocused();
  await expect(languageButton).toHaveAttribute("aria-expanded", "false");
  await expect(languageButton).toHaveAccessibleName("Language: English");
  await expect(home.getByTestId("header-app-name")).toHaveText(
    "Baby Vaccination Schedule"
  );
  await expect(
    page.getByRole("tab", { name: "Settings", exact: true })
  ).toBeVisible();
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("en");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(
    screenOf("settings").getByTestId("locale-option-en")
  ).toHaveAttribute("aria-checked", "true");
  expect(errors).toEqual([]);
});

test("AC-20.4 키보드: 헤더 테마 스위치는 Space로 켜고 끄며, 언어 버튼에서 Enter로 목록을 연 뒤 Tab은 선택된 한국어로 가고 ↓는 English를 고르되 목록을 닫지 않으며, Enter로 고르면 목록이 닫히고 포커스가 언어 버튼으로 돌아온다", async ({
  page,
  screenOf,
}) => {
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  const themeSwitch = settings.getByTestId("header-theme-toggle");
  const languageButton = settings.getByTestId("header-language-button");
  await expect(settings).toBeVisible();

  await themeSwitch.focus();
  await page.keyboard.press("Space");
  await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => bgColor(settings)).toBe(DARK_BG);
  await page.keyboard.press("Space");
  await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => bgColor(settings)).toBe(LIGHT_BG);

  await page.keyboard.press("Tab");
  await expect(languageButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(languageButton).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Tab");
  const option = (code: string) =>
    settings.getByTestId(`header-locale-option-${code}`);
  await expect(option("ko")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(option("en")).toBeFocused();
  await expect(option("en")).toHaveAttribute("aria-checked", "true");
  await expect(settings.getByTestId("header-language-panel")).toBeVisible();
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("en");

  await page.keyboard.press("Enter");

  await expect(settings.getByTestId("header-language-panel")).toHaveCount(0);
  await expect(languageButton).toBeFocused();
  await expect(languageButton).toHaveAccessibleName("Language: English");
  expect(errors).toEqual([]);
});

test("AC-20.5 일정 화면에서 언어 메뉴를 열면 헤더 높이와 본문(화면 제목·필터) 위치가 그대로이고 메뉴는 헤더 바로 아래 본문 위에 겹쳐 그려지며, 메뉴 밖(필터 '예정' 위)을 누르면 필터는 바뀌지 않고 메뉴만 닫히며 포커스가 언어 버튼으로 돌아온다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  const errors = collectErrors(page);
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const header = schedule.getByTestId("app-header");
  const title = schedule.getByRole("heading", { level: 1 });
  const upcomingFilter = schedule.getByTestId("filter-upcoming");
  await expect(upcomingFilter).toBeVisible();
  const before = {
    header: await header.boundingBox(),
    title: await title.boundingBox(),
    filter: await upcomingFilter.boundingBox(),
  };

  await schedule.getByTestId("header-language-button").click();

  const panel = schedule.getByTestId("header-language-panel");
  await expect(panel).toBeVisible();
  // 메뉴 밖 덮개는 Tab 정지점이 아니고 보조기기에서 숨겨진다
  const backdrop = schedule.getByTestId("header-language-backdrop");
  await expect(backdrop).toHaveAttribute("tabindex", "-1");
  await expect(backdrop).toHaveAttribute("aria-hidden", "true");
  const after = {
    header: await header.boundingBox(),
    title: await title.boundingBox(),
    filter: await upcomingFilter.boundingBox(),
    panel: await panel.boundingBox(),
  };
  test.info().annotations.push({
    type: "layout",
    description: JSON.stringify({ before, after }),
  });
  expect(after.header).toEqual(before.header);
  expect(after.title).toEqual(before.title);
  expect(after.filter).toEqual(before.filter);
  if (after.header === null || after.title === null || after.panel === null) {
    throw new Error("bounding box 없음");
  }
  // 메뉴는 헤더 아래에서 시작해 화면 제목과 겹친다(본문을 밀지 않고 위에 덮음)
  expect(after.panel.y).toBeGreaterThanOrEqual(
    after.header.y + after.header.height
  );
  expect(after.panel.y).toBeLessThan(after.title.y + after.title.height);
  // 겹친 자리의 맨 위 요소가 메뉴다
  const panelOnTop = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + 20
    );
    return top !== null && element.contains(top);
  });
  expect(panelOnTop).toBe(true);

  // 메뉴 밖(왼쪽의 '예정' 필터 자리)을 누르면 덮개가 받아 메뉴만 닫는다
  if (after.filter === null) throw new Error("필터 bounding box 없음");
  await page.mouse.click(
    after.filter.x + after.filter.width / 2,
    after.filter.y + after.filter.height / 2
  );

  await expect(panel).toHaveCount(0);
  await expect(schedule.getByTestId("filter-all")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(upcomingFilter).toHaveAttribute("aria-selected", "false");
  await expect(schedule.getByTestId("header-language-button")).toBeFocused();
  await expect(schedule.getByTestId("header-app-name")).toHaveText(
    "아기 예방접종 일정"
  );
  expect(await readStorage(page, LOCALE_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test.describe("U-25 낮은 화면의 언어 메뉴", () => {
  test.use({ viewport: { width: 320, height: 256 } });

  test("U-25 320×256(WCAG 1.4.10 리플로 높이)에서 언어 메뉴는 하단 탭 바 위에서 끝나고, 안을 스크롤해 마지막 항목 中文을 눌러 고를 수 있다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
    await page.goto("/schedule");
    const schedule = screenOf("schedule");
    await schedule.getByTestId("header-language-button").click();
    const panel = schedule.getByTestId("header-language-panel");
    await expect(panel).toBeVisible();

    const panelBox = await panel.boundingBox();
    const tabBar = await page
      .getByRole("tablist")
      .filter({ has: page.getByRole("tab", { name: "홈", exact: true }) })
      .boundingBox();
    if (panelBox === null || tabBar === null) {
      throw new Error("bounding box 없음");
    }
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(tabBar.y);

    const last = schedule.getByTestId("header-locale-option-zh");
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport({ ratio: 1 });
    await last.click();

    await expect(panel).toHaveCount(0);
    await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("zh");
  });
});
