import { chromium, type FullConfig } from "@playwright/test";

// 워밍업(설계서 §9.8, 비평 C-06): webServer.url은 index.html 응답만 보고 준비 완료로 판단하지만
// Metro 웹 번들은 첫 page.goto에서 빌드된다. 첫 테스트가 번들링 시간 때문에 거짓 FAIL이 나지 않도록
// '/'를 열어 screen-home이 렌더될 때까지 기다린다(최대 180s). 실패하면 테스트가 0개 실행되고
// JSON 최상위 errors[]에 남아 PRD §7.3의 "인프라 실패"로 보고된다.
const WARMUP_TIMEOUT_MS = 180_000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:8081";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/`, { timeout: WARMUP_TIMEOUT_MS });
    await page
      .getByTestId("screen-home")
      .waitFor({ timeout: WARMUP_TIMEOUT_MS });
  } finally {
    await browser.close();
  }
}
