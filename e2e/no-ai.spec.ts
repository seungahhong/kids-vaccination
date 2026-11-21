import type { Page } from "@playwright/test";

import {
  bgColor,
  DARK_BG,
  expect,
  expectOnlyLocalRequests,
  fillBirthdate,
  LIGHT_BG,
  readChildren,
  readStorage,
  recordRequests,
  test,
} from "./fixtures";

// FR-13 AI 상담 제외(US-17) E2E 판정 테스트. 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙).
// 하단 탭으로 떠난 화면은 DOM에 남으므로(AD-08) document.body.innerText는 그때까지 연 화면의 텍스트를 모두 포함한다.
// "AI" 0회 판정은 그 전체 텍스트에 대해 한다(대소문자 구분).

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const THEME_KEY = "vaccination-app-theme";
const LOCALE_KEY = "vaccination-app-locale";
const CARD_SELECTOR = '[data-testid^="schedule-card-"]';

/** document.body.innerText와, 그중 문자열 "AI"(대소문자 구분)가 나오는 횟수·줄 */
async function readBodyText(
  page: Page
): Promise<{ text: string; aiCount: number; aiLines: string[] }> {
  const text = await page.evaluate(() => document.body.innerText);
  return {
    text,
    aiCount: text.split("AI").length - 1,
    aiLines: text.split("\n").filter((line) => line.includes("AI")),
  };
}

/** 현재 화면 텍스트(marker로 렌더 완료 확인)에 "AI"가 0회이고, 이름이 홈·접종 일정·설정인 하단 탭이 3개다 */
async function expectNoAiAndBottomTabs(
  page: Page,
  marker: string
): Promise<void> {
  const { text, aiCount, aiLines } = await readBodyText(page);
  expect(text).toContain(marker);
  expect(aiCount, `"AI"가 든 줄: ${aiLines.join(" | ")}`).toBe(0);
  // 일정 화면은 필터도 role=tab이라(총 6개) 하단 탭은 이름으로 한정해 센다
  await expect(
    page.getByRole("tab", { name: /^(홈|접종 일정|설정)$/ })
  ).toHaveCount(3);
}

test("AC-17.1 생년월일 2026-04-30으로 홈 → 일정(schedule-card-bcg-1 펼침) → 설정 순으로 이동하면 세 화면 모두 document.body.innerText에 'AI'가 0회이고 하단 탭(홈·접종 일정·설정 role=tab)은 3개다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();
  // 아이가 있으면 홈은 저장된 아이 목록이다(v1.7 U-30)
  await expectNoAiAndBottomTabs(page, "저장된 아이");

  await page.getByRole("tab", { name: "접종 일정", exact: true }).click();
  await expect(page).toHaveURL("/schedule");
  const bcg1 = screenOf("schedule").getByTestId("schedule-card-bcg-1");
  const toggle = bcg1.getByTestId("card-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(bcg1.getByTestId("card-details")).toBeVisible();
  await expectNoAiAndBottomTabs(
    page,
    "결핵을 예방하는 백신으로, 출생 후 4주 이내에 접종합니다."
  );

  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  await expect(screenOf("settings")).toBeVisible();
  await expectNoAiAndBottomTabs(page, "저장된 아이 1명 (최대 10명)");
});

test("AC-17.2 page.on('request')로 요청 URL을 기록하며 AC-1.2 → AC-7.2 → AC-9.1 → AC-11.4 → AC-12.1 흐름을 한 컨텍스트에서 연속 수행하면 기록된 모든 요청의 origin이 http://localhost:8081(또는 ws://localhost:8081)이고 외부 호스트 요청은 0건이다", async ({
  page,
  screenOf,
}) => {
  // WebSocket 연결(Metro HMR)도 같은 목록에 기록된다(recordRequests)
  const requests = recordRequests(page);

  // AC-1.2: 홈에서 생년월일 입력 → 일정 확인하기
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();
  await fillBirthdate(home, "2026-04-30");
  await home.getByTestId("birthdate-submit").click();
  await expect(page).toHaveURL("/schedule");
  const schedule = screenOf("schedule");
  await expect(
    schedule.getByRole("radio", { name: "2026-04-30" })
  ).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => readChildren(page))
    .toMatchObject({ children: [{ birthdate: "2026-04-30" }] });

  // AC-7.2: '예정' 필터
  await schedule.getByRole("tab", { name: "예정", exact: true }).click();
  await expect(schedule.getByTestId("filter-upcoming")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(schedule.locator(CARD_SELECTOR)).toHaveCount(28);

  // AC-9.1: bcg-1(지남)은 '예정' 목록에 없으므로 '전체'로 돌아와 펼친다
  await schedule.getByRole("tab", { name: "전체", exact: true }).click();
  await expect(schedule.locator(CARD_SELECTOR)).toHaveCount(41);
  const bcg1 = schedule.getByTestId("schedule-card-bcg-1");
  const toggle = bcg1.getByTestId("card-toggle");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(bcg1.getByTestId("card-details")).toBeVisible();

  // AC-11.3·11.4: 설정에서 '다크' → '라이트'(v1.5 U-24: '시스템' 없음)
  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  await settings.getByRole("radio", { name: "다크", exact: true }).click();
  await expect.poll(() => bgColor(settings)).toBe(DARK_BG);
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("dark");
  await settings.getByRole("radio", { name: "라이트", exact: true }).click();
  await expect.poll(() => bgColor(settings)).toBe(LIGHT_BG);
  await expect.poll(() => readStorage(page, THEME_KEY)).toBe("light");

  // AC-12.1: 'English' → 새로고침 뒤에도 영어
  await settings.getByRole("radio", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Settings", exact: true })
  ).toBeVisible();
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("en");
  await page.reload();
  await expect(screenOf("settings")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Settings", exact: true })
  ).toBeVisible();

  expectOnlyLocalRequests(requests);
});

test("AC-17.3 /chat(http://localhost:8081/chat)으로 직접 이동하면 textbox 역할 요소 0개, 문자열 'AI' 0회이고 채팅 화면 대신 expo-router 기본 미정의 경로 화면(Unmatched Route)이 렌더된다", async ({
  page,
}) => {
  await page.goto("/chat");
  // 렌더 완료 대기: 하이드레이션 게이트(텍스트 없음)가 걷히고 경로 화면의 텍스트가 생길 때까지(채팅 화면이든 미정의 경로 화면이든)
  await expect
    .poll(() => page.evaluate(() => document.body.innerText.trim().length))
    .toBeGreaterThan(0);

  await expect(page.getByRole("textbox")).toHaveCount(0);
  const { aiCount, aiLines } = await readBodyText(page);
  expect(aiCount, `"AI"가 든 줄: ${aiLines.join(" | ")}`).toBe(0);
  // 채팅 화면이 아니라 expo-router 기본 미정의 경로 화면이다(P-13, `+not-found` 미생성). 앱 탭 화면도 없다
  await expect(
    page.getByRole("heading", { name: "Unmatched Route", exact: true })
  ).toBeVisible();
  await expect(page.locator('[data-testid^="screen-"]')).toHaveCount(0);
});
