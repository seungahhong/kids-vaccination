import type { Locator, Page } from "@playwright/test";

import {
  bgColor,
  collectErrors,
  DARK_BG,
  expect,
  expectTabsInOrder,
  LIGHT_BG,
  readStorage,
  TAB_NAMES_KO,
  test,
} from "./fixtures";

// 설정 화면 E2E 판정 테스트(FR-08 테마, FR-09 언어, FR-10 아기 정보·초기화, FR-12 면책, 영속화 공통).
// 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙). context 옵션이 다른 AC는 describe 수준 test.use로만 바꾼다(비평 N-04).
// 화면 요소는 screenOf('settings') 범위에서 찾고(AD-08), role=tab 전역 조회는 aria-hidden 하위를 제외하므로 허용한다.
// AC-14.3·16.3은 홈·일정 화면이 있어야 판정되므로 P11에서 PASS한다(PRD §4 Phase 10).

const THEME_NAMES_KO = ["시스템", "라이트", "다크"] as const;
const LOCALE_NAMES = ["한국어", "English", "日本語", "中文"] as const;
const TAB_NAMES_EN = ["Home", "Schedule", "Settings"] as const;
const TAB_NAMES_JA = ["ホーム", "接種日程", "設定"] as const;
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
const DISCLAIMER_EN =
  "This information is for reference only. Please consult a pediatrician for accurate medical advice.";
const RESET_CONFIRM_KO = "아기 생년월일 정보를 삭제할까요?";
const LEGACY_RESET_CONFIRM_KO = "모든 데이터를 초기화하시겠습니까?";

/** 화면 범위 안의 role=radio 요소가 names 개수·순서대로 있다 */
async function expectRadiosInOrder(
  scope: Locator,
  names: readonly string[]
): Promise<void> {
  const radios = scope.getByRole("radio", {
    name: new RegExp(`^(${names.join("|")})$`),
  });
  await expect(radios).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(radios.nth(index)).toHaveAccessibleName(name);
  }
}

/** 배경색은 상태 변경 뒤 비동기로 바뀔 수 있으므로 poll로 판정한다 */
async function expectBackground(
  locator: Locator,
  expected: string
): Promise<void> {
  await expect.poll(() => bgColor(locator)).toBe(expected);
}

async function expectChecked(
  scope: Locator,
  testId: string,
  checked: boolean
): Promise<void> {
  await expect(scope.getByTestId(testId)).toHaveAttribute(
    "aria-checked",
    checked ? "true" : "false"
  );
}

async function openSettings(
  page: Page,
  screenOf: (name: "settings") => Locator
): Promise<Locator> {
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  return settings;
}

// ---------------------------------------------------------------------------
// FR-08 테마 (US-11)
// ---------------------------------------------------------------------------

test("AC-11.1 라이트 OS·저장값 없음으로 /settings에 진입하면 테마 옵션 3개(시스템·라이트·다크)가 radio이고 theme-option-system만 aria-checked=true이며 배경은 rgb(250, 250, 249)다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);

  await expectRadiosInOrder(settings, THEME_NAMES_KO);
  await expect(
    settings
      .getByRole("radiogroup")
      .filter({ has: page.getByTestId("theme-option-system") })
  ).toHaveCount(1);
  await expectChecked(settings, "theme-option-system", true);
  await expectChecked(settings, "theme-option-light", false);
  await expectChecked(settings, "theme-option-dark", false);
  await expectBackground(settings, LIGHT_BG);
});

test.describe("AC-11.2 다크 OS", () => {
  test.use({ colorScheme: "dark" });

  test("AC-11.2 다크 OS·저장값 없음으로 /settings에 진입하면 theme-option-system이 aria-checked=true이고 배경은 rgb(28, 25, 23)이다", async ({
    page,
    screenOf,
  }) => {
    const settings = await openSettings(page, screenOf);

    await expectChecked(settings, "theme-option-system", true);
    await expectBackground(settings, DARK_BG);
  });
});

test.describe("AC-11.3 다크 OS에서 라이트 고정", () => {
  test.use({ colorScheme: "dark" });

  test("AC-11.3 다크 OS에서 '라이트'를 누르면 배경 rgb(250, 250, 249), 저장값 'light', theme-option-light aria-checked=true이고 새로고침 뒤에도 유지된다", async ({
    page,
    screenOf,
  }) => {
    const settings = await openSettings(page, screenOf);
    await expectBackground(settings, DARK_BG);

    await settings.getByRole("radio", { name: "라이트", exact: true }).click();

    await expectBackground(settings, LIGHT_BG);
    expect(await readStorage(page, "vaccination-app-theme")).toBe("light");
    await expectChecked(settings, "theme-option-light", true);
    await expectChecked(settings, "theme-option-system", false);

    await page.reload();
    const reloaded = screenOf("settings");
    await expect(reloaded).toBeVisible();
    await expectBackground(reloaded, LIGHT_BG);
    await expectChecked(reloaded, "theme-option-light", true);
  });
});

test("AC-11.4 라이트 OS에서 '다크'를 누르면 배경 rgb(28, 25, 23)·저장값 'dark', 이어서 '시스템'을 누르면 배경 rgb(250, 250, 249)·저장값 'system'·theme-option-system aria-checked=true다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);

  await settings.getByRole("radio", { name: "다크", exact: true }).click();
  await expectBackground(settings, DARK_BG);
  expect(await readStorage(page, "vaccination-app-theme")).toBe("dark");
  await expectChecked(settings, "theme-option-dark", true);

  await settings.getByRole("radio", { name: "시스템", exact: true }).click();
  await expectBackground(settings, LIGHT_BG);
  expect(await readStorage(page, "vaccination-app-theme")).toBe("system");
  await expectChecked(settings, "theme-option-system", true);
  await expectChecked(settings, "theme-option-dark", false);
});

test("AC-11.7 선호 system에서 새로고침 없이 emulateMedia로 OS 색 모드를 dark→light로 바꾸면 배경이 rgb(28, 25, 23)→rgb(250, 250, 249)로 따라가고 저장값은 null이다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);
  await expectBackground(settings, LIGHT_BG);
  await expectChecked(settings, "theme-option-system", true);

  await page.emulateMedia({ colorScheme: "dark" });

  await expectBackground(settings, DARK_BG);
  await expectChecked(settings, "theme-option-system", true);
  expect(await readStorage(page, "vaccination-app-theme")).toBeNull();

  await page.emulateMedia({ colorScheme: "light" });

  await expectBackground(settings, LIGHT_BG);
});

// ---------------------------------------------------------------------------
// FR-09 언어 (US-12, US-13)
// ---------------------------------------------------------------------------

test("AC-12.1 언어 옵션 4개(한국어·English·日本語·中文)가 radio이고 locale-option-ko가 checked이며, 'English'를 누르면 탭 라벨 Home·Schedule·Settings, 제목 Settings, 저장값 'en', locale-option-en checked이고 새로고침 뒤에도 영어 탭이다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);

  await expectRadiosInOrder(settings, LOCALE_NAMES);
  await expect(
    settings
      .getByRole("radiogroup")
      .filter({ has: page.getByTestId("locale-option-ko") })
  ).toHaveCount(1);
  await expectChecked(settings, "locale-option-ko", true);
  await expectTabsInOrder(page, TAB_NAMES_KO);

  await settings.getByRole("radio", { name: "English", exact: true }).click();

  await expectTabsInOrder(page, TAB_NAMES_EN);
  await expect(settings.getByRole("heading", { level: 1 })).toHaveText(
    "Settings"
  );
  expect(await readStorage(page, "vaccination-app-locale")).toBe("en");
  await expectChecked(settings, "locale-option-en", true);
  await expectChecked(settings, "locale-option-ko", false);

  await page.reload();
  await expect(screenOf("settings")).toBeVisible();
  await expectTabsInOrder(page, TAB_NAMES_EN);
});

test.describe("AC-13.1 기기 언어 ja-JP", () => {
  test.use({ locale: "ja-JP" });

  test("AC-13.1 locale ja-JP·저장값 없음으로 '/'에 진입하면 탭 라벨이 ホーム·接種日程·設定이고 저장값은 null이며 /settings에서 locale-option-ja가 aria-checked=true다", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    await expect(screenOf("home")).toBeVisible();

    await expectTabsInOrder(page, TAB_NAMES_JA);
    expect(await readStorage(page, "vaccination-app-locale")).toBeNull();

    await page.getByRole("tab", { name: "設定", exact: true }).click();
    await expect(page).toHaveURL("/settings");
    const settings = screenOf("settings");
    await expect(settings).toBeVisible();
    await expectChecked(settings, "locale-option-ja", true);
    expect(await readStorage(page, "vaccination-app-locale")).toBeNull();
  });
});

test.describe("AC-13.2 기기 언어 fr-FR", () => {
  test.use({ locale: "fr-FR" });

  test("AC-13.2 locale fr-FR·저장값 없음으로 '/'에 진입하면 탭 라벨이 홈·접종 일정·설정이다(ko 폴백)", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    await expect(screenOf("home")).toBeVisible();

    await expectTabsInOrder(page, TAB_NAMES_KO);
  });
});

test.describe("AC-13.3 기기 언어 en-US + 저장값 ko", () => {
  test.use({ locale: "en-US" });

  test("AC-13.3 locale en-US이지만 저장값 vaccination-app-locale='ko'면 '/'의 탭 라벨이 홈·접종 일정·설정이다(저장값 우선)", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ "vaccination-app-locale": "ko" });
    await page.goto("/");
    await expect(screenOf("home")).toBeVisible();

    await expectTabsInOrder(page, TAB_NAMES_KO);
  });
});

// ---------------------------------------------------------------------------
// FR-10 아기 정보·초기화 (US-14)
// ---------------------------------------------------------------------------

test.describe("AC-14.1 설정 생년월일 표시", () => {
  test("AC-14.1 (a) 저장값 생년월일 '2024-01-31'로 /settings에 진입하면 settings-birthdate 텍스트가 '생년월일: 2024-01-31'이다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ "vaccination-app-birthdate": "2024-01-31" });
    const settings = await openSettings(page, screenOf);

    await expect(settings.getByTestId("settings-birthdate")).toHaveText(
      "생년월일: 2024-01-31"
    );
  });

  test("AC-14.1 (b) 저장값이 없는 컨텍스트에서는 settings-birthdate 텍스트가 '생년월일: -'다", async ({
    page,
    screenOf,
  }) => {
    const settings = await openSettings(page, screenOf);

    await expect(settings.getByTestId("settings-birthdate")).toHaveText(
      "생년월일: -"
    );
  });
});

test("AC-14.2 '생년월일 삭제'를 누르면 확인 문구와 확인(reset-confirm)·취소(reset-cancel)가 보이고 원본 문구는 0개이며, '취소'를 누르면 확인 UI가 0개가 되고 생년월일 표시·저장값 '2024-01-31'이 유지된다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ "vaccination-app-birthdate": "2024-01-31" });
  const settings = await openSettings(page, screenOf);

  await settings.getByTestId("reset-button").click();

  await expect(settings.getByText(RESET_CONFIRM_KO)).toBeVisible();
  await expect(settings.getByText(LEGACY_RESET_CONFIRM_KO)).toHaveCount(0);
  const confirm = settings.getByTestId("reset-confirm");
  const cancel = settings.getByTestId("reset-cancel");
  await expect(confirm).toBeVisible();
  await expect(confirm).toHaveAccessibleName("확인");
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveAccessibleName("취소");

  await cancel.click();

  await expect(settings.getByTestId("reset-confirm")).toHaveCount(0);
  await expect(settings.getByTestId("reset-cancel")).toHaveCount(0);
  await expect(settings.getByText(RESET_CONFIRM_KO)).toHaveCount(0);
  await expect(settings.getByTestId("settings-birthdate")).toHaveText(
    "생년월일: 2024-01-31"
  );
  expect(await readStorage(page, "vaccination-app-birthdate")).toBe(
    "2024-01-31"
  );
});

test("AC-14.3 생년월일·theme dark·locale ko 저장 상태에서 '생년월일 삭제'→'확인'을 누르면 생년월일만 지워지고(저장값 null) theme 'dark'·locale 'ko'·다크 배경이 유지되며 홈 바로가기 0개, 일정은 빈 상태 문구다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({
    "vaccination-app-birthdate": "2024-01-31",
    "vaccination-app-theme": "dark",
    "vaccination-app-locale": "ko",
  });
  const settings = await openSettings(page, screenOf);
  await expectBackground(settings, DARK_BG);

  await settings.getByTestId("reset-button").click();
  await settings.getByTestId("reset-confirm").click();

  await expect(settings.getByTestId("settings-birthdate")).toHaveText(
    "생년월일: -"
  );
  await expect
    .poll(() => readStorage(page, "vaccination-app-birthdate"))
    .toBeNull();
  expect(await readStorage(page, "vaccination-app-theme")).toBe("dark");
  expect(await readStorage(page, "vaccination-app-locale")).toBe("ko");
  await expectBackground(settings, DARK_BG);

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(page).toHaveURL("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  await expect(home.getByTestId("existing-birthdate-shortcut")).toHaveCount(0);

  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  await expect(
    schedule.getByText("생년월일을 먼저 입력해주세요")
  ).toBeVisible();
});

test("AC-14.4 저장값 없이 '생년월일 삭제'→'확인'을 눌러도 settings-birthdate는 '생년월일: -'로 유지되고 확인 UI 0개, screen-settings가 계속 보이며 pageerror·console error가 0건이다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);
  await expect(settings.getByTestId("settings-birthdate")).toHaveText(
    "생년월일: -"
  );
  const errors = collectErrors(page);

  await settings.getByTestId("reset-button").click();
  await settings.getByTestId("reset-confirm").click();

  await expect(settings.getByTestId("settings-birthdate")).toHaveText(
    "생년월일: -"
  );
  await expect(settings.getByTestId("reset-confirm")).toHaveCount(0);
  await expect(settings.getByTestId("reset-cancel")).toHaveCount(0);
  await expect(settings).toBeVisible();
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------
// FR-12 면책 문구 (US-16)
// ---------------------------------------------------------------------------

test("AC-16.2 /settings에 진입하면 disclaimer가 1개이고 텍스트가 한국어 면책 문구다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);

  const disclaimer = settings.getByTestId("disclaimer");
  await expect(disclaimer).toHaveCount(1);
  await expect(disclaimer).toHaveText(DISCLAIMER_KO);
});

test("AC-16.3 저장값 locale 'en'·생년월일 '2026-04-30'이면 일정 화면과 설정 화면의 disclaimer 텍스트가 모두 영어 면책 문구다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({
    "vaccination-app-locale": "en",
    "vaccination-app-birthdate": "2026-04-30",
  });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  await expect(schedule.getByTestId("disclaimer")).toHaveText(DISCLAIMER_EN);

  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  await expect(settings.getByTestId("disclaimer")).toHaveText(DISCLAIMER_EN);
});

// ---------------------------------------------------------------------------
// 영속화 공통 (US-18)
// ---------------------------------------------------------------------------

test.describe("AC-18.6 손상된 테마·언어 저장값", () => {
  test.use({ colorScheme: "dark", locale: "en-US" });

  test("AC-18.6 다크 OS·en-US에서 저장값 theme 'blue'·locale 'fr'(손상)로 /settings에 진입하면 배경 rgb(28, 25, 23), theme-option-system·locale-option-en이 checked, 탭 라벨 Home·Schedule·Settings이고 저장값은 'blue'·'fr' 그대로다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({
      "vaccination-app-theme": "blue",
      "vaccination-app-locale": "fr",
    });
    const settings = await openSettings(page, screenOf);

    await expectBackground(settings, DARK_BG);
    await expectChecked(settings, "theme-option-system", true);
    await expectChecked(settings, "locale-option-en", true);
    await expectTabsInOrder(page, TAB_NAMES_EN);
    expect(await readStorage(page, "vaccination-app-theme")).toBe("blue");
    expect(await readStorage(page, "vaccination-app-locale")).toBe("fr");
  });
});
