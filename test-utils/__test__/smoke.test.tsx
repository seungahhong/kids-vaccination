import { render, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { Text, View } from "react-native";

// 지원 테스트(ENV smoke, 설계서 §9.9): jest-expo + RNTL 14 + expo-router 테스트 환경이 동작하는지 확인한다.
// P7 이후에도 그대로 성립하는 단언만 둔다.
it("ENV smoke RNTL 14 render가 host 컴포넌트를 렌더한다", async () => {
  await render(
    <View testID="smoke-root">
      <Text>smoke</Text>
    </View>
  );

  expect(screen.getByTestId("smoke-root")).toBeOnTheScreen();
  expect(screen.getByText("smoke")).toBeOnTheScreen();
});

it("ENV smoke renderRouter('./app')가 '/'에서 screen-home을 렌더한다", async () => {
  await renderRouter("./app", { initialUrl: "/" });

  // P7부터는 하이드레이션 게이트 뒤에 홈이 나타나므로 findBy로 기다린다
  expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
  expect(screen).toHavePathname("/");
});
