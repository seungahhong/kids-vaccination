// https://docs.expo.dev/guides/customizing-metro/
// 테스트는 대상 파일 옆 __test__/에 둔다(app/ 라우트 화면 테스트 포함). Metro 기본 blockList는 __tests__(복수)만 빼므로
// __test__/를 직접 막는다. 막지 않으면 expo-router의 require.context가 app/**/__test__/*.test.tsx를 실제 라우트로 번들하려 해
// `expo export`가 실패한다(실측: test-utils/render.tsx의 동적 require). 이 패턴은 test-utils/__test__/test-layout.test.ts가 지킨다.
const { getDefaultConfig } = require("expo/metro-config");

const TEST_DIR_BLOCK = /[\\/]__test__[\\/].*/;

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...[config.resolver.blockList ?? []].flat(),
  TEST_DIR_BLOCK,
];

module.exports = config;
