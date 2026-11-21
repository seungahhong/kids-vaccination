import type { Locator, Page } from "@playwright/test";

import {
  bgColor,
  CHILDREN_KEY,
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

const THEME_NAMES_KO = ["라이트", "다크"] as const;
const LOCALE_NAMES = ["한국어", "English", "日本語", "中文"] as const;
const TAB_NAMES_EN = ["Home", "Schedule", "Settings"] as const;
const TAB_NAMES_JA = ["ホーム", "接種日程", "設定"] as const;
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
const DISCLAIMER_EN =
  "This information is for reference only. Please consult a pediatrician for accurate medical advice.";
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

// v1.5(U-24): "시스템"을 없애고 라이트로 합쳤다. 선택지는 라이트·다크 2개, 기본값 라이트이고 OS 색 모드(colorScheme)를 따르지 않는다.

test("AC-11.1 라이트 OS·저장값 없음으로 /settings에 진입하면 테마 옵션 2개(라이트·다크)가 radio이고 theme-option-light만 aria-checked=true이며 '시스템' 옵션은 없고 배경은 rgb(250, 250, 249)다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);

  await expectRadiosInOrder(settings, THEME_NAMES_KO);
  await expect(
    settings
      .getByRole("radiogroup")
      .filter({ has: page.getByTestId("theme-option-light") })
  ).toHaveCount(1);
  await expect(settings.getByRole("radio", { name: "시스템" })).toHaveCount(0);
  await expect(settings.getByTestId("theme-option-system")).toHaveCount(0);
  await expectChecked(settings, "theme-option-light", true);
  await expectChecked(settings, "theme-option-dark", false);
  await expectBackground(settings, LIGHT_BG);
});

test.describe("AC-11.2 다크 OS", () => {
  test.use({ colorScheme: "dark" });

  test("AC-11.2 다크 OS·저장값 없음으로 /settings에 진입해도 theme-option-light가 aria-checked=true이고 배경은 rgb(250, 250, 249)다(OS 색 모드를 따르지 않음)", async ({
    page,
    screenOf,
  }) => {
    const settings = await openSettings(page, screenOf);

    await expectChecked(settings, "theme-option-light", true);
    await expectBackground(settings, LIGHT_BG);
  });
});

test("AC-11.3 '다크'를 누르면 배경 rgb(28, 25, 23), 저장값 'dark', theme-option-dark aria-checked=true이고 새로고침 뒤에도 유지된다", async ({
  page,
  screenOf,
}) => {
  const settings = await openSettings(page, screenOf);
  await expectBackground(settings, LIGHT_BG);

  await settings.getByRole("radio", { name: "다크", exact: true }).click();

  await expectBackground(settings, DARK_BG);
  expect(await readStorage(page, "vaccination-app-theme")).toBe("dark");
  await expectChecked(settings, "theme-option-dark", true);
  await expectChecked(settings, "theme-option-light", false);

  await page.reload();
  const reloaded = screenOf("settings");
  await expect(reloaded).toBeVisible();
  await expectBackground(reloaded, DARK_BG);
  await expectChecked(reloaded, "theme-option-dark", true);
});

test("AC-11.4 저장값 'dark'에서 '라이트'를 누르면 배경 rgb(250, 250, 249)·저장값 'light'·theme-option-light aria-checked=true다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ "vaccination-app-theme": "dark" });
  const settings = await openSettings(page, screenOf);
  await expectBackground(settings, DARK_BG);

  await settings.getByRole("radio", { name: "라이트", exact: true }).click();

  await expectBackground(settings, LIGHT_BG);
  expect(await readStorage(page, "vaccination-app-theme")).toBe("light");
  await expectChecked(settings, "theme-option-light", true);
  await expectChecked(settings, "theme-option-dark", false);
});

test("AC-11.7 예전 저장값 'system'(v1.4까지의 기본값)으로 진입하면 theme-option-light가 checked·배경 rgb(250, 250, 249)이고, 새로고침 없이 emulateMedia로 OS 색 모드를 dark로 바꿔도 배경은 그대로이며 저장값 'system'은 덮어쓰지 않는다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ "vaccination-app-theme": "system" });
  const settings = await openSettings(page, screenOf);
  await expectBackground(settings, LIGHT_BG);
  await expectChecked(settings, "theme-option-light", true);

  await page.emulateMedia({ colorScheme: "dark" });

  // OS 변경 이벤트가 처리될 틈을 준 뒤에도 라이트다
  await page.waitForTimeout(300);
  await expectBackground(settings, LIGHT_BG);
  await expectChecked(settings, "theme-option-light", true);
  expect(await readStorage(page, "vaccination-app-theme")).toBe("system");
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

// v1.7(FR-16 U-28): "아기 정보"는 저장된 아이 목록과 아이별 삭제다. 예전 생년월일 키 시드는 이름 없는 아이 1명(이름표 = 생년월일)이 된다.
const CHILD_CONFIRM_KO = "2024-01-31 정보를 삭제할까요?";

test.describe("AC-14.1 설정 아기 정보 표시", () => {
  test("AC-14.1 (a) 저장값 생년월일 '2024-01-31'로 /settings에 진입하면 아이 수가 '저장된 아이 1명 (최대 10명)'이고 이름표 '2024-01-31' 줄과 '2024-01-31 삭제' 버튼이 있다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({ "vaccination-app-birthdate": "2024-01-31" });
    const settings = await openSettings(page, screenOf);

    await expect(settings.getByTestId("settings-children-count")).toHaveText(
      "저장된 아이 1명 (최대 10명)"
    );
    await expect(settings.getByTestId("child-row-label")).toHaveText(
      "2024-01-31"
    );
    await expect(
      settings.getByRole("button", { name: "2024-01-31 삭제", exact: true })
    ).toBeVisible();
  });

  test("AC-14.1 (b) 저장값이 없는 컨텍스트에서는 아이 수가 '저장된 아이 0명 (최대 10명)'이고 아이 줄이 0개다", async ({
    page,
    screenOf,
  }) => {
    const settings = await openSettings(page, screenOf);

    await expect(settings.getByTestId("settings-children-count")).toHaveText(
      "저장된 아이 0명 (최대 10명)"
    );
    await expect(settings.getByTestId("child-row")).toHaveCount(0);
  });
});

test("AC-14.2 '2024-01-31 삭제'를 누르면 확인 문구('2024-01-31 정보를 삭제할까요?')와 확인·취소가 보이고 원본 문구는 0개이며, '취소'를 누르면 확인 UI가 0개가 되고 아이와 저장값이 유지된다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ "vaccination-app-birthdate": "2024-01-31" });
  const settings = await openSettings(page, screenOf);
  await expect.poll(() => readStorage(page, CHILDREN_KEY)).not.toBeNull();
  const stored = await readStorage(page, CHILDREN_KEY);

  await settings.getByTestId("child-delete").click();

  await expect(settings.getByText(CHILD_CONFIRM_KO)).toBeVisible();
  await expect(settings.getByText(LEGACY_RESET_CONFIRM_KO)).toHaveCount(0);
  await expect(
    settings.getByRole("group", { name: CHILD_CONFIRM_KO })
  ).toBeVisible();
  const confirm = settings.getByTestId("child-delete-confirm");
  const cancel = settings.getByTestId("child-delete-cancel");
  await expect(confirm).toHaveAccessibleName("확인");
  await expect(cancel).toHaveAccessibleName("취소");

  await cancel.click();

  await expect(settings.getByTestId("child-delete-confirm")).toHaveCount(0);
  await expect(settings.getByText(CHILD_CONFIRM_KO)).toHaveCount(0);
  await expect(settings.getByTestId("child-row")).toHaveCount(1);
  expect(await readStorage(page, CHILDREN_KEY)).toBe(stored);
});

test("AC-14.3 생년월일·theme dark·locale ko 저장 상태에서 아이 삭제→확인을 누르면 그 아이만 지워지고(아이 목록 키 null) theme 'dark'·locale 'ko'·다크 배경이 유지되며 홈은 아이 추가 폼(목록 0개), 일정은 빈 상태 문구다", async ({
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

  await settings.getByTestId("child-delete").click();
  await settings.getByTestId("child-delete-confirm").click();

  await expect(settings.getByTestId("settings-children-count")).toHaveText(
    "저장된 아이 0명 (최대 10명)"
  );
  await expect.poll(() => readStorage(page, CHILDREN_KEY)).toBeNull();
  expect(await readStorage(page, "vaccination-app-birthdate")).toBeNull();
  expect(await readStorage(page, "vaccination-app-theme")).toBe("dark");
  expect(await readStorage(page, "vaccination-app-locale")).toBe("ko");
  await expectBackground(settings, DARK_BG);

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(page).toHaveURL("/");
  const home = screenOf("home");
  await expect(home.getByTestId("home-add-child")).toBeVisible();
  await expect(home.getByTestId("child-shortcut")).toHaveCount(0);

  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();
  await expect(
    schedule.getByText("생년월일을 먼저 입력해주세요")
  ).toBeVisible();
});

test("AC-14.4 저장값 없이 /settings에 진입하면 지울 아이가 없어 삭제 버튼·확인 UI가 0개이고 screen-settings가 계속 보이며 pageerror·console error가 0건이다", async ({
  page,
  screenOf,
}) => {
  const errors = collectErrors(page);
  const settings = await openSettings(page, screenOf);

  await expect(settings.getByTestId("settings-children-count")).toHaveText(
    "저장된 아이 0명 (최대 10명)"
  );
  await expect(settings.getByTestId("child-delete")).toHaveCount(0);
  await expect(settings.getByTestId("child-delete-confirm")).toHaveCount(0);
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

  test("AC-18.6 다크 OS·en-US에서 저장값 theme 'blue'·locale 'fr'(손상)로 /settings에 진입하면 배경 rgb(250, 250, 249)(기본값 라이트, U-24), theme-option-light·locale-option-en이 checked, 탭 라벨 Home·Schedule·Settings이고 저장값은 'blue'·'fr' 그대로다", async ({
    page,
    seed,
    screenOf,
  }) => {
    await seed({
      "vaccination-app-theme": "blue",
      "vaccination-app-locale": "fr",
    });
    const settings = await openSettings(page, screenOf);

    await expectBackground(settings, LIGHT_BG);
    await expectChecked(settings, "theme-option-light", true);
    await expectChecked(settings, "locale-option-en", true);
    await expectTabsInOrder(page, TAB_NAMES_EN);
    expect(await readStorage(page, "vaccination-app-theme")).toBe("blue");
    expect(await readStorage(page, "vaccination-app-locale")).toBe("fr");
  });
});
