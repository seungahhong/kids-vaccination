import type { Locator } from "@playwright/test";

import {
  CHILDREN_KEY,
  collectErrors,
  expect,
  fillBirthdate,
  readChildren,
  readStorage,
  test,
} from "./fixtures";

// 여러 아이 E2E 판정 테스트: FR-16(US-21, U-26~U-30). 제목은 AC ID로 시작한다(PRD §7.3 집계 규칙).
// - 아이는 최대 10명이다. 생년월일은 필수, 이름은 선택이고, 화면 이름표는 이름이 있으면 이름, 없으면 생년월일이다.
// - 아이가 없으면 홈 화면에 추가 폼(생년월일 → 이름)이 있고, 한 명이라도 있으면 홈에는 목록만, 추가는 헤더 "아이 추가" 메뉴에서 한다.
// - 저장은 웹 localStorage의 vaccination-app-children 키 하나(버전이 붙은 JSON)다. 아이를 지우면 저장값에서도 빠지고, 마지막 아이를
//   지우면 키 자체가 없어진다.

/** 아이 2명: 이름 있는 첫째(2024-01-31, hepb-1 완료) + 이름 없는 2026-04-30(선택됨) */
const TWO_CHILDREN = JSON.stringify({
  v: 1,
  activeId: "c2",
  children: [
    { id: "c1", name: "첫째", birthdate: "2024-01-31", completed: ["hepb-1"] },
    { id: "c2", birthdate: "2026-04-30", completed: [] },
  ],
});

function chip(scope: Locator, name: string): Locator {
  return scope.getByRole("radio", { name, exact: true });
}

test("AC-21.1 아이가 없으면 홈 추가 폼에 생년월일 2024-01-31(필수)과 이름 '민준'(선택)을 넣고 일정 확인하기를 누르면 일정 화면의 아이 칩 '민준'이 checked이고, 홈은 폼 대신 '민준 일정 바로 보기' 목록이 되며 localStorage에 이름·생년월일이 JSON으로 저장된다", async ({
  page,
  screenOf,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  const home = screenOf("home");
  const form = home.getByTestId("home-add-child");
  await expect(form).toBeVisible();

  await fillBirthdate(form, "2024-01-31");
  await form.getByLabel("이름 (선택)").fill("민준");
  await form.getByTestId("birthdate-submit").click();

  await expect(page).toHaveURL("/schedule");
  await expect(chip(screenOf("schedule"), "민준")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect
    .poll(() => readChildren(page))
    .toMatchObject({
      v: 1,
      children: [{ name: "민준", birthdate: "2024-01-31", completed: [] }],
    });

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(home.getByTestId("home-add-child")).toHaveCount(0);
  await expect(
    home.getByRole("button", { name: "민준 일정 바로 보기", exact: true })
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("AC-21.2 아이가 있으면 헤더 '아이 추가'를 눌러 본문 위에 뜬 폼에서 이름 없이 생년월일 2026-04-30만 넣어 추가하면, 메뉴가 닫히고 새 아이가 선택되며 칩·홈 목록·설정 줄의 이름표가 생년월일 '2026-04-30'이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({
    [CHILDREN_KEY]: JSON.stringify({
      v: 1,
      activeId: "c1",
      children: [
        { id: "c1", name: "첫째", birthdate: "2024-01-31", completed: [] },
      ],
    }),
  });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const header = schedule.getByTestId("app-header");
  const headerBox = await header.boundingBox();

  await schedule
    .getByRole("button", { name: "아이 추가", exact: true })
    .click();
  const panel = schedule.getByTestId("header-add-panel");
  await expect(panel).toBeVisible();
  // 본문 위에 덮인다: 헤더 높이가 그대로다(U-25)
  expect(await header.boundingBox()).toEqual(headerBox);
  await fillBirthdate(panel, "2026-04-30");
  await panel.getByTestId("birthdate-submit").click();

  await expect(panel).toHaveCount(0);
  await expect(chip(schedule, "2026-04-30")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(chip(schedule, "첫째")).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() => readChildren(page))
    .toMatchObject({
      children: [
        { name: "첫째", birthdate: "2024-01-31" },
        { birthdate: "2026-04-30", completed: [] },
      ],
    });

  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(
    screenOf("home").getByRole("button", {
      name: "2026-04-30 일정 바로 보기",
      exact: true,
    })
  ).toBeVisible();
  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(screenOf("settings").getByTestId("child-row-label")).toHaveText([
    "첫째",
    "2026-04-30",
  ]);
});

test("AC-21.3 아이 2명이면 일정 칩으로 아이를 바꿀 때마다 그 아이의 생년월일로 계산한 일정과 그 아이의 완료 기록이 보이고, 선택이 저장되어 새로고침 뒤에도 유지된다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [CHILDREN_KEY]: TWO_CHILDREN });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  const selector = schedule.getByRole("radiogroup", { name: "아이 선택" });
  await expect(selector.getByRole("radio")).toHaveCount(2);
  // 2026-04-30(선택됨): hepb-1은 지남이고 완료 체크 0개
  await expect(chip(schedule, "2026-04-30")).toHaveAttribute(
    "aria-checked",
    "true"
  );
  await expect(
    schedule.locator('[role="checkbox"][aria-checked="true"]')
  ).toHaveCount(0);
  await expect(
    schedule.getByTestId("schedule-card-hpv-2").getByTestId("schedule-date")
  ).toHaveText("2038년 10월 30일 ~ 2039년 4월 30일");

  await chip(schedule, "첫째").click();

  await expect(chip(schedule, "첫째")).toHaveAttribute("aria-checked", "true");
  await expect(
    schedule.getByTestId("schedule-card-hpv-2").getByTestId("schedule-date")
  ).toHaveText("2036년 7월 31일 ~ 2037년 1월 31일");
  await expect(
    schedule.getByRole("checkbox", { name: "B형간염 1차: 접종 완료" })
  ).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() => readChildren(page))
    .toMatchObject({
      activeId: "c1",
    });

  await page.reload();
  await expect(chip(screenOf("schedule"), "첫째")).toHaveAttribute(
    "aria-checked",
    "true"
  );
});

test("AC-21.4 아이 10명이 저장돼 있으면 헤더 '아이 추가' 메뉴에 '최대 10명까지 저장할 수 있어요…' 안내가 보이고 생년월일을 넣어도 일정 확인하기는 aria-disabled=true라 11번째 아이가 저장되지 않는다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({
    [CHILDREN_KEY]: JSON.stringify({
      v: 1,
      activeId: "c10",
      children: Array.from({ length: 10 }, (_, index) => ({
        id: `c${index + 10}`,
        name: `아이${index + 1}`,
        birthdate: "2026-04-30",
        completed: [],
      })),
    }),
  });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home.getByTestId("child-shortcut")).toHaveCount(10);

  await home.getByTestId("header-add-child-button").click();
  const panel = home.getByTestId("header-add-panel");
  await expect(panel.getByTestId("home-children-full")).toHaveText(
    "최대 10명까지 저장할 수 있어요. 설정에서 아이를 삭제한 뒤 추가해 주세요."
  );
  await fillBirthdate(panel, "2025-01-01");
  await expect(panel.getByTestId("birthdate-submit")).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  const stored = await readChildren(page);
  expect(stored).toMatchObject({ children: expect.any(Array) });
  expect(
    typeof stored === "object" &&
      stored !== null &&
      "children" in stored &&
      Array.isArray(stored.children)
      ? stored.children.length
      : -1
  ).toBe(10);
});

test("AC-21.5 설정에서 '첫째 삭제' → 확인을 누르면 그 아이 줄이 사라지고 localStorage 아이 목록에서도 빠지며(완료 기록 포함), 남은 아이까지 지우면 vaccination-app-children 키가 없어지고 홈은 다시 추가 폼이 된다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [CHILDREN_KEY]: TWO_CHILDREN });
  const errors = collectErrors(page);
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings.getByTestId("settings-children-count")).toHaveText(
    "저장된 아이 2명 (최대 10명)"
  );

  await settings
    .getByRole("button", { name: "첫째 삭제", exact: true })
    .click();
  await expect(
    settings.getByRole("group", { name: "첫째 정보를 삭제할까요?" })
  ).toBeVisible();
  await settings.getByTestId("child-delete-confirm").click();

  await expect(settings.getByTestId("child-row-label")).toHaveText([
    "2026-04-30",
  ]);
  await expect(settings.getByTestId("settings-children-count")).toHaveText(
    "저장된 아이 1명 (최대 10명)"
  );
  await expect
    .poll(() => readStorage(page, CHILDREN_KEY))
    .not.toContain("첫째");
  expect(await readStorage(page, CHILDREN_KEY)).not.toContain("hepb-1");

  await settings
    .getByRole("button", { name: "2026-04-30 삭제", exact: true })
    .click();
  await settings.getByTestId("child-delete-confirm").click();

  await expect(settings.getByTestId("child-row")).toHaveCount(0);
  await expect.poll(() => readStorage(page, CHILDREN_KEY)).toBeNull();
  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await expect(screenOf("home").getByTestId("home-add-child")).toBeVisible();
  await expect(
    screenOf("home").getByTestId("header-add-child-button")
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
