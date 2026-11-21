import {
  expect,
  type Locator,
  type Page,
  test as base,
} from "@playwright/test";

import type { StorageKey } from "@/lib/storage";

// E2E 공용 fixture(설계서 §9.8, PRD §2.3.0 ENV-E2E).
// - page: 모든 테스트의 기본 시계를 2026-10-18 10:00(KST)로 고정한다. 시계가 다른 AC는 goto 전에 다시 부른다.
// - seed: "저장값 X" 전제를 localStorage에 1회만 주입한다(reload 시 재주입하지 않아 사용자 변경이 보존된다).
//   AsyncStorage 웹 구현은 localStorage에 같은 키·원시 문자열로 저장한다(P-02).
// - screenOf: 떠난 탭 화면이 DOM에 남으므로(aria-hidden) testID·텍스트 조회는 활성 화면 범위로 한정한다(AD-08).

export const FIXED_NOW = new Date("2026-10-18T10:00:00+09:00");

export type ScreenName = "home" | "schedule" | "settings";
export type SeedValues = Partial<Record<StorageKey, string>>;

type Fixtures = {
  seed: (values: SeedValues) => Promise<void>;
  screenOf: (name: ScreenName) => Locator;
};

const SEEDED_FLAG = "__e2e_seeded";

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(FIXED_NOW);
    await use(page);
  },
  seed: async ({ context }, use) => {
    await use(async (values) => {
      const entries = Object.entries(values).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      );
      await context.addInitScript(
        ({ pairs, flag }) => {
          if (window.sessionStorage.getItem(flag)) return;
          for (const [key, value] of pairs) {
            window.localStorage.setItem(key, value);
          }
          window.sessionStorage.setItem(flag, "1");
        },
        { pairs: entries, flag: SEEDED_FLAG }
      );
    });
  },
  screenOf: async ({ page }, use) => {
    await use((name) => page.getByTestId(`screen-${name}`));
  },
});

/** 화면 배경(tokens.background)의 computed 색: 라이트 #fafaf9, 다크 #1c1917 */
export const LIGHT_BG = "rgb(250, 250, 249)";
export const DARK_BG = "rgb(28, 25, 23)";

/** 하단 탭의 한국어 접근 이름(탭 순서) */
export const TAB_NAMES_KO = ["홈", "접종 일정", "설정"] as const;

/** role=tab 요소가 정확히 names 개수이고 접근 이름이 순서대로 일치한다 */
export async function expectTabsInOrder(
  page: Page,
  names: readonly string[]
): Promise<void> {
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(tabs.nth(index)).toHaveAccessibleName(name);
  }
}

/** computed backgroundColor, "rgb(r, g, b)" 형식(배경색 판정 AC) */
export async function bgColor(locator: Locator): Promise<string> {
  return locator.evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );
}

/** computed color, "rgb(r, g, b)" 형식(AC-15.2 탭 라벨 색) */
export async function textColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

/** localStorage의 원시 저장값(없으면 null) */
export async function readStorage(
  page: Page,
  key: StorageKey
): Promise<string | null> {
  return page.evaluate((k) => window.localStorage.getItem(k), key);
}

/** 저장된 아이 목록 키(FR-16, U-29: 버전이 붙은 JSON) */
export const CHILDREN_KEY = "vaccination-app-children";

/** localStorage의 아이 목록을 JSON으로 읽는다(없으면 null) */
export async function readChildren(page: Page): Promise<unknown> {
  const raw = await readStorage(page, CHILDREN_KEY);
  return raw === null ? null : JSON.parse(raw);
}

/**
 * 웹 생년월일 피커(연·월·일 <select> 3개, v1.8 U-32)에서 'YYYY-MM-DD'를 고른다. scope는 피커를 담은 범위(홈 화면·헤더 추가 메뉴)다.
 * 앞 칸이 뒤 칸의 선택지를 정하므로(올해는 이번 달까지, 그 달의 날 수 등) 연 → 월 → 일 순서로 고른다. 값(option value)으로 고른다.
 * v1.7까지의 <input type="date">.fill('YYYY-MM-DD')를 대신한다.
 */
export async function fillBirthdate(
  scope: Locator,
  iso: string
): Promise<void> {
  const [year, month, day] = iso.split("-").map((part) => String(Number(part)));
  await scope.getByTestId("birthdate-year").selectOption({ value: year ?? "" });
  await scope
    .getByTestId("birthdate-month")
    .selectOption({ value: month ?? "" });
  await scope.getByTestId("birthdate-day").selectOption({ value: day ?? "" });
}

/** 웹 생년월일 피커 세 칸이 보여 주는 값(연·월·일 option value, 고르지 않은 칸은 "") */
export async function birthdateParts(scope: Locator): Promise<string[]> {
  return Promise.all(
    ["birthdate-year", "birthdate-month", "birthdate-day"].map((testId) =>
      scope.getByTestId(testId).inputValue()
    )
  );
}

/** AC-17.2가 허용하는 origin: 개발 서버(http)와 그 HMR 소켓(ws) */
const LOCAL_ORIGINS = ["http://localhost:8081", "ws://localhost:8081"];

/** URL의 origin(파싱할 수 없으면 URL 그대로) */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * 이후 발생하는 모든 요청 URL을 모은다(AC-17.2 외부 요청 0건).
 * WebSocket 연결(Metro HMR)은 request가 아니라 websocket 이벤트로 오므로 같은 목록에 넣어 함께 판정한다.
 */
export function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    urls.push(request.url());
  });
  page.on("websocket", (socket) => {
    urls.push(socket.url());
  });
  return urls;
}

/**
 * recordRequests로 모은 요청이 1건 이상이고 모든 origin이 LOCAL_ORIGINS다(외부 호스트 요청 0건, AC-17.2 기준).
 * 요청 수와 origin 목록은 판정 근거로 테스트 annotation("requests")에 남긴다.
 */
export function expectOnlyLocalRequests(requests: readonly string[]): void {
  const origins = [...new Set(requests.map(originOf))];
  test.info().annotations.push({
    type: "requests",
    description: `${requests.length}건 기록, origin: ${origins.join(", ")}`,
  });
  expect(requests.length).toBeGreaterThan(0);
  const external = requests.filter(
    (url) => !LOCAL_ORIGINS.includes(originOf(url))
  );
  expect(external).toEqual([]);
}

/** 이후의 pageerror와 console error를 모은다(AC-14.4) */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error: ${message.text()}`);
    }
  });
  return errors;
}

export { expect };
