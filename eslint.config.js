// https://docs.expo.dev/guides/using-eslint/
// 설계서 §7.4(실측 통과본). no-restricted-syntax처럼 같은 규칙은 한 files 블록의 한 배열에 모은다(flat config는 뒤 블록이 덮어씀).
// no-restricted-imports도 같다: 순수 레이어 파일은 제품 블록과 순수 레이어 블록에 모두 걸리고 뒤 블록의 설정만 남으므로,
// 두 블록이 테스트 코드 import 금지(TEST_CODE_IMPORTS)를 각자 함께 가진다.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

// 제품 코드가 아닌 테스트·mock. 단위 테스트는 대상 파일 옆 __test__/(U-08), 수동 mock은 src/mocks/(U-09)라 app/·src/ 안에 있어도
// 아래 제품 코드 규칙·순수 레이어 규칙을 받지 않고, 테스트 전용 규칙(require 허용 등)만 받는다.
const TEST_AND_MOCK_FILES = ["**/__test__/**", "src/mocks/**"];

// 제품 코드(app/·src/의 테스트·mock 밖)가 테스트 전용 코드를 import하지 못하게 한다(리뷰 R3-04). 수동 mock은 별칭 @/ 범위(src/mocks)라
// 실수로 import해도 tsc·jest(같은 mock 인스턴스)·export는 통과하고, 앱만 시작하자마자 깨진다(웹 "jest is not defined").
// 별칭(@/mocks)과 상대 경로(../mocks/…, ../../test-utils/…, ./__test__/…)를 모두 막는다(gitignore 형식, ESLint가 대소문자 무시로 비교).
const TEST_CODE_IMPORTS = {
  group: [
    "@/mocks",
    "@/mocks/**",
    "**/mocks/**",
    "**/test-utils",
    "**/test-utils/**",
    "**/__test__",
    "**/__test__/**",
  ],
  message:
    "U-08·U-09: 제품 코드는 테스트 전용 코드(src/mocks·test-utils·__test__)를 import하지 않는다",
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      ".expo/*",
      "coverage/*",
      "playwright-report/*",
      "test-results/*",
      "expo-env.d.ts",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // NFR-01 우회 차단(G-1)
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-nocheck": true, "ts-expect-error": true },
      ],
    },
  },
  {
    // 타입 테스트(G-3)만 설명 붙은 @ts-expect-error를 허용한다
    files: ["src/types/__test__/**"],
    rules: {
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": true,
          "ts-nocheck": true,
          "ts-expect-error": "allow-with-description",
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}"],
    ignores: TEST_AND_MOCK_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Alert"],
              message: "FR-10: 앱 내 확인 UI",
            },
          ],
          patterns: [TEST_CODE_IMPORTS],
        },
      ],
      "no-restricted-globals": ["error", "fetch", "XMLHttpRequest"],
      "no-restricted-properties": [
        "error",
        { property: "toLocaleDateString", message: "P-05: src/lib/format.ts" },
        {
          object: "Date",
          property: "parse",
          message: "T6 결함 1(UTC 파싱): parseIsoDate 사용",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXAttribute[name.name='accessibilityState']",
          message: "F-01: aria-* 사용",
        },
        {
          selector: "JSXAttribute[name.name='accessibilityRole']",
          message: "role prop 사용",
        },
        {
          // 인자 1개는 리터럴·변수·템플릿 모두 금지한다(원본 결함 형태는 new Date(birthdate), 리뷰 R1-11).
          // 날짜 문자열은 parseIsoDate·isoDateToDate, 날짜 복사·자르기는 startOfDay, 현재 시각은 인자 없는 new Date()
          selector: "NewExpression[callee.name='Date'][arguments.length=1]",
          message:
            "T6 결함 1(UTC 파싱): parseIsoDate·isoDateToDate·startOfDay 사용",
        },
        {
          selector:
            "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
          message: "NFR-01: as unknown as 금지",
        },
      ],
    },
  },
  {
    // 순수 레이어: React·RN·expo와 상위 레이어 import 금지(storage.ts만 예외). 위 제품 블록의 no-restricted-imports를 덮어쓰므로
    // 테스트 코드 import 금지(TEST_CODE_IMPORTS)도 여기에 다시 둔다(react-native 전체 금지라 Alert 금지는 이 패턴에 포함된다)
    files: ["src/lib/**/*.ts", "src/theme/**/*.ts", "src/i18n/**/*.ts"],
    ignores: ["src/lib/storage.ts", ...TEST_AND_MOCK_FILES],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-native",
                "expo-*",
                "@/contexts/*",
                "@/components/*",
                "@/hooks/*",
              ],
              message: "순수 레이어",
            },
            TEST_CODE_IMPORTS,
          ],
        },
      ],
    },
  },
  {
    files: ["e2e/**", "playwright.config.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    files: ["jest.setup.ts", "test-utils/**", ...TEST_AND_MOCK_FILES],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
