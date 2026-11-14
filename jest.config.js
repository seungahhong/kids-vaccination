/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/e2e/",
    "<rootDir>/src/types/__test__/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // lucide-react-native의 "react-native" export 조건이 .mjs를 가리켜 jest-expo가 변환하지 못한다 → CJS 빌드로 매핑
    "^lucide-react-native$":
      "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
  },
  // .web.tsx는 커버리지 분모에서 뺀다(설계서 §9.1). 웹 동작은 E2E가 커버하고, 일부는 jest가 직접 import해 검증한다
  // (BirthdatePicker.web.tsx — 리뷰 R2-02. LanguagePressable.web.tsx는 E2E만). 웹 훅 .web.ts(useBlurInert·useDocumentLanguage·
  // useRovingFocus)는 jest가 직접 테스트하므로 분모에 남는다(리뷰 R3-06).
  // 대상 파일 옆 __test__/(U-08)와 src/mocks/의 수동 mock(U-09)은 제품 코드가 아니므로 분모에서 뺀다
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "app/**/*.{ts,tsx}",
    "!**/*.web.tsx",
    "!**/*.types.ts",
    "!src/types/**",
    "!src/i18n/types.ts",
    "!**/__test__/**",
    "!src/mocks/**",
  ],
  // global은 "./src/lib/" 경로 그룹 밖의 수집 대상 파일로만 계산된다(G-5, 설계서 §9.1).
  // "./src/lib/" 4지표 95는 P3 첫 GREEN(AC-4.1) 뒤 추가했다(파일이 없는 경로 그룹은 jest가 실패하므로 P2에는 두지 않음, 비평 C-01).
  coverageThreshold: {
    global: { lines: 80 },
    "./src/lib/": {
      statements: 95,
      branches: 95,
      functions: 95,
      lines: 95,
    },
  },
  // resetMocks/restoreMocks는 쓰지 않는다(Jest 30에서 수동 mock 구현까지 지움, F-07). 복원은 jest.setup.ts가 한다.
};
