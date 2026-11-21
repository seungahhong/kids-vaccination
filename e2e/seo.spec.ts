import type { Locator, Page } from "@playwright/test";

import {
  expect,
  expectOnlyLocalRequests,
  readStorage,
  recordRequests,
  test,
} from "./fixtures";

// SEO/GEO 보조 테스트(frontend-guidelines 2-B, seo-geo-optimizer). AC 판정용이 아니므로 제목은 AC ID가 아니라 "SEO"로 시작한다
// (PRD §7.3 집계 규칙: AC 접두가 없는 테스트는 보조 테스트로 따로 보고된다).
// 대상: SPA 템플릿 public/index.html(head 메타·JSON-LD·noscript)과 런타임 <html lang>·문서 제목 동기화(useDocumentLanguage.web.ts).
// dev 서버는 '/'와 그 밖의 경로(history fallback) 모두 이 템플릿으로 HTML을 만든다. export 결과(dist/index.html)는 verify 단계에서 확인한다.

const LOCALE_KEY = "vaccination-app-locale";
const TITLE_KO = "아기 예방접종 일정";
/** 언어별 문서 제목 = i18n common.appName */
const TITLES = {
  en: "Baby Vaccination Schedule",
  ja: "赤ちゃん予防接種スケジュール",
  zh: "宝宝疫苗接种日程",
} as const;
const DISCLAIMER_KO =
  "이 정보는 참고용이며, 정확한 내용은 소아과 의사와 상담하세요.";
/** noscript 요약에 든 사실 문구(JS 없이 HTML만 읽는 크롤러·생성형 검색용, GEO) */
const NOSCRIPT_FACT = "14종 백신 41회차";
const KDCA_URL = "https://nip.kdca.go.kr";

function htmlOf(page: Page): Locator {
  return page.locator("html");
}

/** head 안에서 selector에 맞는 <meta>가 정확히 1개이고, 그 content를 돌려준다 */
async function metaContent(
  page: Page,
  selector: string
): Promise<string | null> {
  const meta = page.locator(`head > meta${selector}`);
  await expect(meta).toHaveCount(1);
  return meta.getAttribute("content");
}

test("SEO 기본 진입('/')에서 html lang이 ko, 문서 제목이 '아기 예방접종 일정'이고 noscript 요약은 JS 실행 중 본문 텍스트에 섞이지 않는다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  await expect(htmlOf(page)).toHaveAttribute("lang", "ko");
  await expect(page).toHaveTitle(TITLE_KO);
  // noscript는 JS가 켜져 있으면 렌더되지 않는다 → AC-17.1의 body.innerText 판정·화면 읽기에 영향이 없어야 한다
  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).not.toContain(NOSCRIPT_FACT);
});

test("SEO 설정에서 English를 고르면 html lang이 en·영어 제목, 中文을 고르면 zh·중국어 제목이 되고 새로고침 뒤에도 유지된다(설정 화면 제목은 '화면 · 앱 이름', 리뷰 R4-03)", async ({
  page,
  screenOf,
}) => {
  await page.goto("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  await expect(htmlOf(page)).toHaveAttribute("lang", "ko");

  await settings.getByRole("radio", { name: "English", exact: true }).click();
  await expect(htmlOf(page)).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(`Settings · ${TITLES.en}`);

  await settings.getByRole("radio", { name: "中文", exact: true }).click();
  await expect(htmlOf(page)).toHaveAttribute("lang", "zh");
  await expect(page).toHaveTitle(`设置 · ${TITLES.zh}`);
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("zh");

  await page.reload();
  await expect(screenOf("settings")).toBeVisible();
  await expect(htmlOf(page)).toHaveAttribute("lang", "zh");
  await expect(page).toHaveTitle(`设置 · ${TITLES.zh}`);
});

test.describe("SEO 기기 언어 ja-JP", () => {
  test.use({ locale: "ja-JP" });

  test("SEO 기기 언어 ja-JP·저장값 없음으로 진입하면 html lang이 ja이고 문서 제목이 일본어다", async ({
    page,
    screenOf,
  }) => {
    await page.goto("/");
    await expect(screenOf("home")).toBeVisible();

    await expect(htmlOf(page)).toHaveAttribute("lang", "ja");
    await expect(page).toHaveTitle(TITLES.ja);
  });
});

test("SEO head에 meta description·theme-color(라이트 #fafaf9·다크 #1c1917)·Open Graph 기본 태그(ko_KR + 대체 언어 3개)가 있다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  const description = await metaContent(page, '[name="description"]');
  expect(description).toContain("생년월일");
  expect(description).toContain("예방접종");
  expect(description?.length ?? 0).toBeLessThanOrEqual(160);

  expect(
    await metaContent(
      page,
      '[name="theme-color"][media="(prefers-color-scheme: light)"]'
    )
  ).toBe("#fafaf9");
  expect(
    await metaContent(
      page,
      '[name="theme-color"][media="(prefers-color-scheme: dark)"]'
    )
  ).toBe("#1c1917");

  expect(await metaContent(page, '[property="og:title"]')).toBe(TITLE_KO);
  expect(await metaContent(page, '[property="og:description"]')).toContain(
    "예방접종"
  );
  expect(await metaContent(page, '[property="og:type"]')).toBe("website");
  expect(await metaContent(page, '[property="og:locale"]')).toBe("ko_KR");
  const alternates = await page
    .locator('head > meta[property="og:locale:alternate"]')
    .evaluateAll((metas) => metas.map((meta) => meta.getAttribute("content")));
  expect(alternates).toEqual(["en_US", "ja_JP", "zh_CN"]);
});

test("SEO JSON-LD가 JSON으로 파싱되고 @type이 WebApplication이며 언어 4개·무료·근거 출처(질병관리청 예방접종도우미)·의료 면책 문구를 담는다", async ({
  page,
  screenOf,
}) => {
  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();

  const scripts = page.locator('head > script[type="application/ld+json"]');
  await expect(scripts).toHaveCount(1);
  const data: unknown = JSON.parse((await scripts.textContent()) ?? "");

  expect(data).toMatchObject({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: TITLE_KO,
    inLanguage: ["ko", "en", "ja", "zh"],
    applicationCategory: "HealthApplication",
    operatingSystem: "iOS, Android, Web",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
    isBasedOn: { url: KDCA_URL },
    usageInfo: { text: DISCLAIMER_KO },
  });
});

test.describe("SEO JavaScript 없이 읽는 HTML", () => {
  test.use({ javaScriptEnabled: false });

  test("SEO JavaScript 없이 '/'·'/settings'를 열면 lang이 ko이고 noscript의 한국어 앱 요약(질병관리청·14종 백신 41회차)·면책 문구와 meta description이 보인다", async ({
    page,
  }) => {
    for (const path of ["/", "/settings"]) {
      await page.goto(path);
      await expect(htmlOf(page)).toHaveAttribute("lang", "ko");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        TITLE_KO
      );
      // Playwright의 기본 텍스트 매칭은 <noscript>를 건너뛰므로, 실제로 렌더된 텍스트(innerText)로 판정한다
      const body = page.locator("body");
      for (const text of [NOSCRIPT_FACT, "질병관리청", DISCLAIMER_KO]) {
        await expect(body).toContainText(text, { useInnerText: true });
      }
      expect(await metaContent(page, '[name="description"]')).toContain(
        "예방접종"
      );
    }
  });
});

test("SEO 템플릿과 언어 동기화는 외부 요청을 만들지 않는다: 진입·탭 이동·언어 전환·새로고침 동안 모든 요청 origin이 localhost:8081이다", async ({
  page,
  screenOf,
}) => {
  // WebSocket(Metro HMR)도 같은 목록에 기록되고, 판정 기준은 AC-17.2와 같다(fixtures의 recordRequests·expectOnlyLocalRequests)
  const requests = recordRequests(page);

  await page.goto("/");
  await expect(screenOf("home")).toBeVisible();
  await page.getByRole("tab", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL("/settings");
  const settings = screenOf("settings");
  await expect(settings).toBeVisible();
  await settings.getByRole("radio", { name: "日本語", exact: true }).click();
  await expect.poll(() => readStorage(page, LOCALE_KEY)).toBe("ja");
  await page.reload();
  await expect(screenOf("settings")).toBeVisible();

  expectOnlyLocalRequests(requests);
});
