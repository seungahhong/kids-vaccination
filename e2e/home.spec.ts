import type { Locator } from "@playwright/test";

import {
  birthdateParts,
  CHILDREN_KEY,
  expect,
  fillBirthdate,
  readChildren,
  readStorage,
  test,
} from "./fixtures";

// 홈 화면 E2E 판정 테스트: FR-01 US-1(AC-1.1~1.5), FR-02 US-3(AC-3.1·3.2), FR-03 US-4(AC-4.7). 제목은 AC ID로 시작한다(PRD §7.3).
// 웹 피커는 BirthdatePicker.web.tsx의 연·월·일 <select> 3개(묶음 birthdate-input, 칸 birthdate-year·-month·-day)이고 날짜 입력은
// fixtures.ts의 fillBirthdate(scope, 'YYYY-MM-DD')다(v1.8 U-32, v1.7까지는 <input type="date">.fill — R-12). 선택지는 허용 범위 안만 있어
// 범위 밖 날짜(미래·2017년 이전)는 고를 수 없다.
// 비활성 판정은 aria-disabled="true", 활성 판정은 "속성 없음"(toBeEnabled)이다(AD-07). 화면 요소는 screenOf 범위에서 찾는다(AD-08).
// AC-1.2·3.1·4.7은 일정 화면(P9)을 관찰하므로 P9 산출물 전에는 FAIL이 정상이다(PRD §4.13). 실행은 병렬 그룹 종료 뒤 P9가 1회 한다.
// v1.7(FR-16): 홈은 아이가 없을 때만 추가 폼, 있으면 저장된 아이 목록이다(U-30). 저장은 아이 목록 키 하나(JSON)이고, 예전 생년월일 키
// 시드는 하이드레이션에서 이름 없는 아이 1명(이름표 = 생년월일)으로 옮겨진다(U-29). 일정 화면의 아이는 선택 칩(radio)으로 확인한다.

const BIRTHDATE_KEY = "vaccination-app-birthdate";

/** select의 선택지 표기(option label) */
async function optionLabels(select: Locator): Promise<string[]> {
  return select
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) =>
        option instanceof HTMLOptionElement ? option.label : ""
      )
    );
}

test("AC-1.1 저장값 없이 '/'에 진입하면 birthdate-input이 '생년월일' 묶음 안의 연·월·일 선택 상자 3개(모두 고르지 않음)이고, 연도 선택지는 '연도 선택' 다음 2026년~2017년 10개이며 birthdate-submit은 aria-disabled=true다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  const input = home.getByTestId("birthdate-input");
  await expect(input).toHaveAttribute("role", "group");
  await expect(input).toHaveAccessibleName("생년월일");
  await expect(input.getByRole("combobox")).toHaveCount(3);
  await expect(home.getByRole("combobox", { name: "연도 선택" })).toBeVisible();
  await expect(home.getByRole("combobox", { name: "월 선택" })).toBeVisible();
  await expect(home.getByRole("combobox", { name: "일 선택" })).toBeVisible();
  expect(await birthdateParts(home)).toEqual(["", "", ""]);
  expect(await optionLabels(home.getByTestId("birthdate-year"))).toEqual([
    "연도 선택",
    "2026년",
    "2025년",
    "2024년",
    "2023년",
    "2022년",
    "2021년",
    "2020년",
    "2019년",
    "2018년",
    "2017년",
  ]);
  await expect(home.getByTestId("birthdate-submit")).toHaveAttribute(
    "aria-disabled",
    "true"
  );
});

test("AC-1.2 birthdate-input에서 2026-04-30을 고르고 일정 확인하기를 누르면 경로가 /schedule, 아이 선택 칩 '2026-04-30'이 checked이고 localStorage 아이 목록에 이름 없는 2026-04-30 아이가 있다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  await fillBirthdate(home, "2026-04-30");
  const submit = home.getByTestId("birthdate-submit");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL("/schedule");
  await expect(
    screenOf("schedule").getByRole("radio", { name: "2026-04-30" })
  ).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => readChildren(page))
    .toMatchObject({
      v: 1,
      children: [{ birthdate: "2026-04-30", completed: [] }],
    });
  expect(await readStorage(page, BIRTHDATE_KEY)).toBeNull();
});

test("AC-1.3 2026-10-19(오늘+1일)는 고를 수 없다: 2026년·10월을 고르면 일 선택지는 18일까지이고(19일 없음) 연도에 2027년이 없으며, 일을 고르지 않은 동안 일정 확인하기를 클릭해도 버튼은 aria-disabled=true, 경로는 / 유지, localStorage 아이 목록은 null이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  await home.getByTestId("birthdate-year").selectOption({ value: "2026" });
  await home.getByTestId("birthdate-month").selectOption({ value: "10" });
  const days = home.getByTestId("birthdate-day");
  expect((await optionLabels(days)).at(-1)).toBe("18일");
  await expect(days.locator('option[value="19"]')).toHaveCount(0);
  await expect(
    home.getByTestId("birthdate-year").locator('option[value="2027"]')
  ).toHaveCount(0);
  // 월 선택지도 이번 달(10월)까지다
  await expect(
    home.getByTestId("birthdate-month").locator('option[value="11"]')
  ).toHaveCount(0);

  const submit = home.getByTestId("birthdate-submit");
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  // 비활성 <button>/role=button에 일반 click은 활성 대기로 타임아웃 → force(PRD §2.3.0)
  await submit.click({ force: true });

  // 이동이 비동기로 일어나지 않았음을 확인하는 짧은 정착 시간 뒤 부정 단언
  await page.waitForTimeout(500);
  await expect(page).toHaveURL("/");
  await expect(home).toBeVisible();
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  expect(await readStorage(page, CHILDREN_KEY)).toBeNull();
});

test("AC-1.4 연도 선택지에 2016년이 없어 2016-12-31은 고를 수 없고, 2017-01-01(하한)과 2026-10-18(오늘)을 고르면 버튼이 활성(속성 없음)이며, 연·월만 고른 동안은 비활성(aria-disabled=true)이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  const submit = home.getByTestId("birthdate-submit");

  // 하한 경계 미포함(2016-12-31): 2016년이 선택지에 없다
  await expect(
    home.getByTestId("birthdate-year").locator('option[value="2016"]')
  ).toHaveCount(0);

  // 하한 경계 포함(2017-01-01). 일을 고르기 전까지는 비활성
  await home.getByTestId("birthdate-year").selectOption({ value: "2017" });
  await home.getByTestId("birthdate-month").selectOption({ value: "1" });
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  await home.getByTestId("birthdate-day").selectOption({ value: "1" });
  expect(await birthdateParts(home)).toEqual(["2017", "1", "1"]);
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await expect(submit).toBeEnabled();

  // 오늘 포함(2026-10-18)
  await fillBirthdate(home, "2026-10-18");
  expect(await birthdateParts(home)).toEqual(["2026", "10", "18"]);
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await expect(submit).toBeEnabled();
});

test("AC-1.5 저장값 '2024-01-31'로 홈에 진입하면 저장된 아이 목록만 있고 아이 추가 폼(birthdate-input·birthdate-submit)은 없으며 헤더에 '아이 추가' 버튼이 있다(v1.7 U-30: 폼은 아이가 없을 때만)", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home.getByTestId("home-children")).toBeVisible();

  await expect(home.getByTestId("birthdate-input")).toHaveCount(0);
  await expect(home.getByTestId("birthdate-submit")).toHaveCount(0);
  await expect(
    home.getByRole("button", { name: "아이 추가", exact: true })
  ).toHaveAttribute("aria-expanded", "false");
});

test("AC-3.1 저장값 '2024-01-31'로 홈에 진입하면 저장된 아이 바로가기가 1개('2024-01-31 일정 바로 보기')이고, 클릭하면 경로가 /schedule·칩 '2024-01-31'이 checked다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  const shortcut = home.getByTestId("child-shortcut");
  await expect(shortcut).toHaveCount(1);
  await expect(shortcut).toHaveAccessibleName("2024-01-31 일정 바로 보기");

  await shortcut.click();
  await expect(page).toHaveURL("/schedule");
  await expect(
    screenOf("schedule").getByRole("radio", { name: "2024-01-31" })
  ).toHaveAttribute("aria-checked", "true");
  // 예전 생년월일 키는 아이 목록으로 옮긴 뒤 지워진다(U-29)
  await expect.poll(() => readStorage(page, BIRTHDATE_KEY)).toBeNull();
  expect(await readStorage(page, CHILDREN_KEY)).not.toBeNull();
});

test("AC-3.2 저장값 없이 홈에 진입하면 저장된 아이 목록(home-children·child-shortcut)과 '저장된 아이' 텍스트가 0개이고 아이 추가 폼(생년월일 → 이름)이 있으며 헤더에 '아이 추가' 버튼은 없다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  // 홈이 완전히 렌더된 뒤(폼 표시) 0개를 판정한다
  await expect(home.getByTestId("birthdate-input")).toBeVisible();

  await expect(home.getByTestId("home-children")).toHaveCount(0);
  await expect(home.getByTestId("child-shortcut")).toHaveCount(0);
  await expect(home.getByText("저장된 아이", { exact: true })).toHaveCount(0);
  await expect(home.getByTestId("header-add-child-button")).toHaveCount(0);
  // 칸 순서: 생년월일(필수)이 먼저, 이름(선택)이 다음이다(U-30)
  const birthdateBox = await home.getByTestId("birthdate-input").boundingBox();
  const nameBox = await home.getByTestId("child-name-input").boundingBox();
  expect(birthdateBox && nameBox && birthdateBox.y < nameBox.y).toBe(true);
});

// context 옵션(timezoneId)은 테스트 함수 안에서 바꿀 수 없으므로 describe 수준 test.use로 둔다(비평 N-04).
test.describe("AC-4.7 뉴욕 시간대(America/New_York)", () => {
  test.use({ timezoneId: "America/New_York" });

  test("AC-4.7 timezoneId America/New_York·시계 2026-10-18T10:00:00-04:00에서 홈에 2024-01-15를 입력·저장하면 schedule-card-bcg-1 날짜가 '2024년 1월 15일'(UTC 파싱 결함이면 1월 14일), schedule-card-hepb-2는 '2024년 2월 15일'이다", async ({
    page,
    screenOf,
  }) => {
    // 시계가 다른 AC는 goto 전에 다시 고정한다(설계서 §9.8 규약 1)
    await page.clock.setFixedTime(new Date("2026-10-18T10:00:00-04:00"));
    await page.goto("/");
    const home = screenOf("home");
    await expect(home).toBeVisible();

    await fillBirthdate(home, "2024-01-15");
    await home.getByTestId("birthdate-submit").click();
    await expect(page).toHaveURL("/schedule");

    const schedule = screenOf("schedule");
    const bcg1 = schedule.getByTestId("schedule-card-bcg-1");
    await expect(bcg1).toContainText("2024년 1월 15일");
    await expect(bcg1).not.toContainText("2024년 1월 14일");
    await expect(schedule.getByTestId("schedule-card-hepb-2")).toContainText(
      "2024년 2월 15일"
    );
  });
});

// v1.8 U-32 보조 테스트: 웹 생년월일 피커는 브라우저 기본 날짜 입력(브라우저 언어로만 표시) 대신 앱이 만든 선택지라 앱 언어를 따른다.
test("U-32 헤더에서 언어를 English로 바꾸면 생년월일 선택 상자의 이름·선택지가 영어(Select year·January·31)가 되고, 日本語로 바꾸면 일본어(年を選択·2024年·1月·31日)가 되며 고른 값은 그대로다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  await fillBirthdate(home, "2024-01-31");

  const chooseLanguage = async (code: string) => {
    await home.getByTestId("header-language-button").click();
    await home.getByTestId(`header-locale-option-${code}`).click();
  };

  await chooseLanguage("en");
  await expect(home.getByTestId("birthdate-input")).toHaveAccessibleName(
    "Date of birth"
  );
  await expect(home.getByTestId("birthdate-input")).toHaveAttribute(
    "lang",
    "en-US"
  );
  await expect(
    home.getByRole("combobox", { name: "Select year" })
  ).toBeVisible();
  expect(await optionLabels(home.getByTestId("birthdate-year"))).toContain(
    "2024"
  );
  expect(
    (await optionLabels(home.getByTestId("birthdate-month"))).slice(0, 3)
  ).toEqual(["Select month", "January", "February"]);
  expect((await optionLabels(home.getByTestId("birthdate-day"))).at(-1)).toBe(
    "31"
  );
  expect(await birthdateParts(home)).toEqual(["2024", "1", "31"]);

  await chooseLanguage("ja");
  await expect(home.getByRole("combobox", { name: "年を選択" })).toBeVisible();
  expect(await optionLabels(home.getByTestId("birthdate-year"))).toContain(
    "2024年"
  );
  expect(
    (await optionLabels(home.getByTestId("birthdate-month"))).slice(0, 2)
  ).toEqual(["月を選択", "1月"]);
  expect((await optionLabels(home.getByTestId("birthdate-day"))).at(-1)).toBe(
    "31日"
  );
  expect(await birthdateParts(home)).toEqual(["2024", "1", "31"]);
});
