import type { Locator, Page } from "@playwright/test";

import {
  bgColor,
  DARK_BG,
  expect,
  LIGHT_BG,
  type SeedValues,
  test,
} from "./fixtures";

// G-6(NFR-05) 접근성 보조 테스트(PRD §7.2 G-6 (b)·(d), §4 Phase 11, 설계서 §9.8). AC 판정 테스트가 아니므로
// 제목은 "G-6 …"로 시작해 PRD §7.3 AC 집계(^AC-n.m)에서 빠진다.
// (d) 터치 영역: G-6 표에서 웹 role 열이 "—"가 아닌 상호작용 요소의 boundingBox가 모두 44×44 이상이다(뷰포트 390×844).
//     네이티브 전용 행(birthdate-picker-button, iOS 모달 확인·취소)은 웹에 없으므로 제외한다.
// (b) 렌더 대비: 홈(birthdate-input에 2024-01-31 입력 포함)·일정(bcg-1 펼침, 지남 카드 포함)·설정 × 라이트·다크에서
//     직접 텍스트 노드를 가진 모든 요소와 모든 input 요소의 computed color와, 자신 또는 가장 가까운 조상의 불투명
//     backgroundColor 사이의 WCAG 대비가 4.5 이상이다. aria-disabled="true" 하위는 제외한다(WCAG 1.4.3 비활성 예외).
//     범위는 활성 화면 컨테이너(screen-*)와 하단 탭 바다. 떠난 화면은 aria-hidden 상태로 DOM에 남으므로 범위로 한정한다(AD-08).

const BIRTHDATE_KEY = "vaccination-app-birthdate";
const MIN_TARGET_PX = 44;
const MIN_CONTRAST = 4.5;
const SCREEN_BACKGROUND = { light: LIGHT_BG, dark: DARK_BG } as const;
const SCHEMES = ["light", "dark"] as const;

type Scheme = (typeof SCHEMES)[number];

/** 하단 탭(이름이 홈·접종 일정·설정인 role=tab). 일정 화면의 필터도 role=tab이라 이름으로 한정한다 */
function bottomTabs(page: Page): Locator {
  return page.getByRole("tab", { name: /^(홈|접종 일정|설정)$/ });
}

/** 하단 탭 바(하단 탭을 담은 tablist) */
function bottomTabBar(page: Page): Locator {
  return page
    .getByRole("tablist")
    .filter({ has: page.getByRole("tab", { name: "홈", exact: true }) });
}

// ---------------------------------------------------------------------------
// (d) 터치 영역 ≥ 44×44
// ---------------------------------------------------------------------------

type TargetSize = {
  readonly target: string;
  readonly width: number;
  readonly height: number;
};

/** locator가 정확히 expectedCount개이고, 각 요소의 크기(px)를 돌려준다. boundingBox가 없으면 0×0으로 기록해 실패로 드러낸다 */
async function measureTargets(
  target: string,
  locator: Locator,
  expectedCount: number
): Promise<TargetSize[]> {
  await expect(locator).toHaveCount(expectedCount);
  const sizes: TargetSize[] = [];
  for (let index = 0; index < expectedCount; index += 1) {
    const box = await locator.nth(index).boundingBox();
    sizes.push({
      target: `${target}[${index}]`,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    });
  }
  return sizes;
}

function expectTouchTargets(sizes: readonly TargetSize[]): void {
  const smallest = (key: "width" | "height") =>
    Math.min(...sizes.map((size) => size[key]));
  test.info().annotations.push({
    type: "touch-target",
    description: `${sizes.length}개 측정, 최소 너비 ${smallest("width")}px · 최소 높이 ${smallest("height")}px`,
  });
  const tooSmall = sizes.filter(
    (size) => size.width < MIN_TARGET_PX || size.height < MIN_TARGET_PX
  );
  expect(tooSmall, `${MIN_TARGET_PX}×${MIN_TARGET_PX}px 미만 요소`).toEqual([]);
}

test("G-6 (d) 홈: 하단 탭 3개·birthdate-input·birthdate-submit·existing-birthdate-shortcut의 boundingBox가 모두 44×44 이상이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/");
  const home = screenOf("home");
  await expect(home).toBeVisible();

  expectTouchTargets([
    ...(await measureTargets("하단 탭", bottomTabs(page), 3)),
    ...(await measureTargets(
      "birthdate-input",
      home.getByTestId("birthdate-input"),
      1
    )),
    ...(await measureTargets(
      "birthdate-submit",
      home.getByTestId("birthdate-submit"),
      1
    )),
    ...(await measureTargets(
      "existing-birthdate-shortcut",
      home.getByTestId("existing-birthdate-shortcut"),
      1
    )),
  ]);
});

test("G-6 (d) 일정: 필터 3개(filter-all·upcoming·past)와 card-toggle 41개의 boundingBox가 모두 44×44 이상이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule).toBeVisible();

  expectTouchTargets([
    ...(await measureTargets(
      "filter",
      schedule.getByTestId(/^filter-(all|upcoming|past)$/),
      3
    )),
    ...(await measureTargets(
      "card-toggle",
      schedule.getByTestId("card-toggle"),
      41
    )),
  ]);
});

test("G-6 (d) 일정 빈 상태: go-home 버튼의 boundingBox가 44×44 이상이다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/schedule");
  const schedule = screenOf("schedule");
  await expect(schedule.getByTestId("schedule-empty")).toBeVisible();

  expectTouchTargets(
    await measureTargets("go-home", schedule.getByTestId("go-home"), 1)
  );
});

test("G-6 (d) 설정: theme-option 3개·locale-option 4개·reset-button, 확인 단계의 reset-confirm·reset-cancel boundingBox가 모두 44×44 이상이다", async ({
  page,
  seed,
  screenOf,
}) => {
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();

  const sizes = [
    ...(await measureTargets(
      "theme-option",
      settings.getByTestId(/^theme-option-/),
      3
    )),
    ...(await measureTargets(
      "locale-option",
      settings.getByTestId(/^locale-option-/),
      4
    )),
    ...(await measureTargets(
      "reset-button",
      settings.getByTestId("reset-button"),
      1
    )),
  ];
  await settings.getByTestId("reset-button").click();
  sizes.push(
    ...(await measureTargets(
      "reset-confirm",
      settings.getByTestId("reset-confirm"),
      1
    )),
    ...(await measureTargets(
      "reset-cancel",
      settings.getByTestId("reset-cancel"),
      1
    ))
  );

  expectTouchTargets(sizes);
});

// ---------------------------------------------------------------------------
// (b) 렌더 대비 ≥ 4.5:1
// ---------------------------------------------------------------------------

type ContrastViolation = {
  readonly text: string;
  readonly color: string;
  readonly background: string;
  readonly ratio: number;
};

type ContrastScan = {
  /** 검사한 요소의 텍스트(input은 <input value="…">) */
  readonly checked: string[];
  readonly violations: ContrastViolation[];
  /** 검사한 요소 중 가장 낮은 대비(소수 둘째 자리) */
  readonly lowest: number;
};

/**
 * 브라우저 안에서 실행된다(page 함수라 바깥 식별자를 참조하지 않는다).
 * scope와 그 하위에서 직접 텍스트 노드를 가진 요소와 input·textarea·select 요소마다, computed color를 자신부터 위로
 * 올라가며 처음 만나는 불투명(알파 1) backgroundColor 위에 합성해 WCAG 대비를 계산한다. 그 배경 아래 요소들의
 * opacity와 글자색 알파는 합성에 반영한다. aria-disabled="true" 하위는 건너뛴다.
 */
function scanContrast(scope: Element, minimum: number): ContrastScan {
  type Rgba = { r: number; g: number; b: number; a: number };
  const parse = (value: string): Rgba | null => {
    const body = /rgba?\(([^)]*)\)/.exec(value)?.[1];
    if (body === undefined) return null;
    const [r, g, b, a = 1] = body
      .split(/[\s,/]+/)
      .filter((part) => part !== "")
      .map(Number);
    if (r === undefined || g === undefined || b === undefined) return null;
    return { r, g, b, a };
  };
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (c: Rgba): number =>
    0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
  const format = (c: Rgba): string =>
    `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

  const checked: string[] = [];
  const violations: ContrastViolation[] = [];
  let lowest = Number.POSITIVE_INFINITY;
  for (const element of [scope, ...Array.from(scope.querySelectorAll("*"))]) {
    const isField =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement;
    const hasDirectText = Array.from(element.childNodes).some(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        (node.textContent ?? "").trim() !== ""
    );
    if (!isField && !hasDirectText) continue;
    if (element.closest('[aria-disabled="true"]') !== null) continue;

    const text = isField
      ? `<${element.tagName.toLowerCase()} value="${element.value}">`
      : (element.textContent ?? "").trim().slice(0, 60);
    checked.push(text);

    let background: Rgba | null = null;
    let opacity = 1;
    for (
      let node: Element | null = element;
      node !== null;
      node = node.parentElement
    ) {
      const nodeStyle = getComputedStyle(node);
      const nodeBackground = parse(nodeStyle.backgroundColor);
      if (nodeBackground !== null && nodeBackground.a === 1) {
        background = nodeBackground;
        break;
      }
      opacity *= Number(nodeStyle.opacity);
    }
    const color = getComputedStyle(element).color;
    const foreground = parse(color);
    if (background === null || foreground === null) {
      violations.push({
        text,
        color,
        background: background === null ? "(불투명 배경 없음)" : "",
        ratio: 0,
      });
      lowest = 0;
      continue;
    }
    const alpha = foreground.a * opacity;
    const shown: Rgba = {
      r: foreground.r * alpha + background.r * (1 - alpha),
      g: foreground.g * alpha + background.g * (1 - alpha),
      b: foreground.b * alpha + background.b * (1 - alpha),
      a: 1,
    };
    const lighter = Math.max(luminance(shown), luminance(background));
    const darker = Math.min(luminance(shown), luminance(background));
    const ratio = (lighter + 0.05) / (darker + 0.05);
    lowest = Math.min(lowest, ratio);
    if (ratio < minimum) {
      violations.push({
        text,
        color: format(shown),
        background: format(background),
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }
  return { checked, violations, lowest: Math.round(lowest * 100) / 100 };
}

/** 활성 화면 컨테이너와 하단 탭 바를 스캔한다 */
async function scanScreen(
  page: Page,
  screen: Locator
): Promise<ContrastScan[]> {
  const tabBar = bottomTabBar(page);
  await expect(tabBar).toHaveCount(1);
  return [
    await screen.evaluate(scanContrast, MIN_CONTRAST),
    await tabBar.evaluate(scanContrast, MIN_CONTRAST),
  ];
}

/** 위반 0건이고, 검사 대상에 markers(렌더 확인용 텍스트)가 모두 들어 있다(빈 스캔으로 통과하지 않게) */
function expectContrast(
  label: string,
  scans: readonly ContrastScan[],
  markers: readonly string[]
): void {
  const checked = scans.flatMap((scan) => scan.checked);
  const lowest = Math.min(...scans.map((scan) => scan.lowest));
  test.info().annotations.push({
    type: "contrast",
    description: `${label}: ${checked.length}개 검사, 최저 대비 ${lowest}`,
  });
  expect(
    scans.flatMap((scan) => scan.violations),
    `${label}: 대비 ${MIN_CONTRAST}:1 미만 요소`
  ).toEqual([]);
  for (const marker of markers) {
    expect(
      checked.some((text) => text.includes(marker)),
      `${label}: 검사 대상에 "${marker}"가 없다`
    ).toBe(true);
  }
}

/** OS 색 모드를 emulateMedia로 바꾸고(선호 system), 저장값 생년월일 2026-04-30으로 path에 진입한다 */
async function openInScheme(
  page: Page,
  seed: (values: SeedValues) => Promise<void>,
  scheme: Scheme,
  path: string,
  screen: Locator
): Promise<void> {
  await page.emulateMedia({ colorScheme: scheme });
  await seed({ [BIRTHDATE_KEY]: "2026-04-30" });
  await page.goto(path);
  await expect(screen).toBeVisible();
  // 스캔 전에 해당 테마가 실제로 적용됐는지 확인한다
  await expect.poll(() => bgColor(screen)).toBe(SCREEN_BACKGROUND[scheme]);
}

for (const scheme of SCHEMES) {
  test(`G-6 (b) ${scheme} 홈: 생년월일 프리필 상태와 birthdate-input에 2024-01-31을 넣은 상태에서 텍스트·input 요소의 대비가 모두 4.5:1 이상이다`, async ({
    page,
    seed,
    screenOf,
  }) => {
    const home = screenOf("home");
    await openInScheme(page, seed, scheme, "/", home);
    const prefilled = await scanScreen(page, home);

    const input = home.getByTestId("birthdate-input");
    await input.fill("2024-01-31");
    await expect(input).toHaveValue("2024-01-31");
    const filled = await scanScreen(page, home);

    expectContrast(
      `${scheme} 홈`,
      [...prefilled, ...filled],
      [
        "아기 예방접종",
        "이전에 입력한 생년월일이 있어요 (2026-04-30)",
        '<input value="2024-01-31">',
        "일정 확인하기",
        "접종 일정",
      ]
    );
  });

  test(`G-6 (b) ${scheme} 일정: schedule-card-bcg-1(지남)을 펼친 상태에서 텍스트 요소의 대비가 모두 4.5:1 이상이다`, async ({
    page,
    seed,
    screenOf,
  }) => {
    const schedule = screenOf("schedule");
    await openInScheme(page, seed, scheme, "/schedule", schedule);
    const bcg1 = schedule.getByTestId("schedule-card-bcg-1");
    await bcg1.getByTestId("card-toggle").click();
    await expect(bcg1.getByTestId("card-details")).toBeVisible();

    expectContrast(`${scheme} 일정`, await scanScreen(page, schedule), [
      "예방접종 일정",
      "생년월일: 2026-04-30",
      "출생 시",
      "BCG(피내용) 1차",
      "상세 정보",
      "결핵을 예방하는 백신으로",
      "곧 접종",
      "이 정보는 참고용이며",
      "접종 일정",
    ]);
  });

  test(`G-6 (b) ${scheme} 설정: 기본 상태와 삭제 확인 단계에서 텍스트 요소의 대비가 모두 4.5:1 이상이다`, async ({
    page,
    seed,
    screenOf,
  }) => {
    const settings = screenOf("settings");
    await openInScheme(page, seed, scheme, "/settings", settings);
    const idle = await scanScreen(page, settings);

    await settings.getByTestId("reset-button").click();
    await expect(settings.getByTestId("reset-confirm")).toBeVisible();
    const confirming = await scanScreen(page, settings);

    expectContrast(
      `${scheme} 설정`,
      [...idle, ...confirming],
      [
        "시스템",
        "English",
        "생년월일: 2026-04-30",
        "생년월일 삭제",
        "아기 생년월일 정보를 삭제할까요?",
        "확인",
        "취소",
        "이 정보는 참고용이며",
        "설정",
      ]
    );
  });
}
