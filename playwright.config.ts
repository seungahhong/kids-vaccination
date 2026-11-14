/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

// E2E 하네스(PRD §7.3 판정 계약, 설계서 §9.8). ENV-E2E 기본 context를 여기에 고정하고,
// AC별 차이는 파일/describe 수준의 test.use와 테스트 안의 page.clock·seed·emulateMedia로만 바꾼다.
// `npm run e2e` = `CI=1 playwright test`라 reuseExistingServer는 항상 false다: 8081을 다른 프로세스가 쓰면
// webServer 기동이 실패해 JSON errors[]에 남고(테스트 0개), "인프라 실패"로 드러난다(비평 N-01).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: "http://localhost:8081",
    ...devices["Desktop Chrome"],
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Seoul",
    locale: "ko-KR",
    colorScheme: "light",
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },
  webServer: {
    command: "npx expo start --web --port 8081",
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { CI: "1", BROWSER: "none" },
  },
});
