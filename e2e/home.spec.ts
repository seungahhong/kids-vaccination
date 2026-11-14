import { expect, readStorage, test } from "./fixtures";

// 홈 화면 E2E 판정 테스트: FR-01 US-1(AC-1.1~1.5), FR-02 US-3(AC-3.1·3.2), FR-03 US-4(AC-4.7). 제목은 AC ID로 시작한다(PRD §7.3).
// 웹 피커는 BirthdatePicker.web.tsx의 <input type="date">(data-testid birthdate-input)이고 날짜 입력은 fill('YYYY-MM-DD')다(R-12).
// 비활성 판정은 aria-disabled="true", 활성 판정은 "속성 없음"(toBeEnabled)이다(AD-07). 화면 요소는 screenOf 범위에서 찾는다(AD-08).
// AC-1.2·3.1·4.7은 일정 화면(P9)을 관찰하므로 P9 산출물 전에는 FAIL이 정상이다(PRD §4.13). 실행은 병렬 그룹 종료 뒤 P9가 1회 한다.

const BIRTHDATE_KEY = "vaccination-app-birthdate";

test("AC-1.1 저장값 없이 '/'에 진입하면 birthdate-input이 type=date·min=2017-01-01·max=2026-10-18·value=''이고 birthdate-submit은 aria-disabled=true다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  const input = home.getByTestId("birthdate-input");
  await expect(input).toHaveAttribute("type", "date");
  await expect(input).toHaveAttribute("min", "2017-01-01");
  await expect(input).toHaveAttribute("max", "2026-10-18");
  await expect(input).toHaveValue("");
  await expect(home.getByTestId("birthdate-submit")).toHaveAttribute(
    "aria-disabled",
    "true"
  );
});

test("AC-1.2 birthdate-input에 2026-04-30을 입력하고 일정 확인하기를 누르면 경로가 /schedule, schedule-birthdate가 '생년월일: 2026-04-30', localStorage 생년월일이 '2026-04-30'이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  await home.getByTestId("birthdate-input").fill("2026-04-30");
  const submit = home.getByTestId("birthdate-submit");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page).toHaveURL("/schedule");
  await expect(
    screenOf("schedule").getByTestId("schedule-birthdate")
  ).toHaveText("생년월일: 2026-04-30");
  expect(await readStorage(page, BIRTHDATE_KEY)).toBe("2026-04-30");
});

test("AC-1.3 2026-10-19(오늘+1일)를 입력하고 일정 확인하기를 클릭해도 버튼은 aria-disabled=true, 경로는 / 유지, localStorage 생년월일은 null이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  await home.getByTestId("birthdate-input").fill("2026-10-19");
  const submit = home.getByTestId("birthdate-submit");
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  // 비활성 <button>/role=button에 일반 click은 활성 대기로 타임아웃 → force(PRD §2.3.0)
  await submit.click({ force: true });

  // 이동이 비동기로 일어나지 않았음을 확인하는 짧은 정착 시간 뒤 부정 단언
  await page.waitForTimeout(500);
  await expect(page).toHaveURL("/");
  await expect(home).toBeVisible();
  await expect(submit).toHaveAttribute("aria-disabled", "true");
  expect(await readStorage(page, BIRTHDATE_KEY)).toBeNull();
});

test("AC-1.4 입력값을 2016-12-31, 2017-01-01, 2026-10-18로 바꾸면 버튼이 각각 비활성(aria-disabled=true), 활성(속성 없음), 활성(속성 없음)이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  const input = home.getByTestId("birthdate-input");
  const submit = home.getByTestId("birthdate-submit");

  // 하한 경계 미포함(2016-12-31)
  await input.fill("2016-12-31");
  await expect(input).toHaveValue("2016-12-31");
  await expect(submit).toHaveAttribute("aria-disabled", "true");

  // 하한 경계 포함(2017-01-01)
  await input.fill("2017-01-01");
  await expect(input).toHaveValue("2017-01-01");
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await expect(submit).toBeEnabled();

  // 오늘 포함(2026-10-18)
  await input.fill("2026-10-18");
  await expect(input).toHaveValue("2026-10-18");
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await expect(submit).toBeEnabled();
});

test("AC-1.5 저장값 '2024-01-31'로 홈에 진입하면 birthdate-input value가 '2024-01-31'이고 버튼은 활성(aria-disabled 속성 없음)이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  await expect(home.getByTestId("birthdate-input")).toHaveValue("2024-01-31");
  const submit = home.getByTestId("birthdate-submit");
  await expect(submit).not.toHaveAttribute("aria-disabled");
  await expect(submit).toBeEnabled();
});

test("AC-3.1 저장값 '2024-01-31'로 홈에 진입하면 existing-birthdate-shortcut이 1개('이전에 입력한 생년월일이 있어요 (2024-01-31)')이고, 클릭하면 경로가 /schedule·schedule-birthdate가 '생년월일: 2024-01-31'이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2024-01-31" });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  const shortcut = home.getByTestId("existing-birthdate-shortcut");
  await expect(shortcut).toHaveCount(1);
  await expect(shortcut).toHaveText(
    "이전에 입력한 생년월일이 있어요 (2024-01-31)"
  );

  await shortcut.click();
  await expect(page).toHaveURL("/schedule");
  await expect(
    screenOf("schedule").getByTestId("schedule-birthdate")
  ).toHaveText("생년월일: 2024-01-31");
});

test("AC-3.2 저장값 없이 홈에 진입하면 existing-birthdate-shortcut 요소가 0개이고 '이전에 입력한 생년월일이 있어요' 텍스트도 0개다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  // 홈이 완전히 렌더된 뒤(폼 표시) 0개를 판정한다
  await expect(home.getByTestId("birthdate-input")).toBeVisible();

  await expect(home.getByTestId("existing-birthdate-shortcut")).toHaveCount(0);
  await expect(home.getByText("이전에 입력한 생년월일이 있어요")).toHaveCount(
    0
  );
  await expect(page.getByText("이전에 입력한 생년월일이 있어요")).toHaveCount(
    0
  );
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

    await home.getByTestId("birthdate-input").fill("2024-01-15");
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
