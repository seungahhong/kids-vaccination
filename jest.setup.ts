/// <reference path="./node_modules/expo-router/build/ts-declarations/expect.d.ts" />
// 설계서 §9.2(실측 통과본) 기반. 첫 줄은 expo-router matcher(toHavePathname 등)의 타입 참조다(F-13).
import AsyncStorage from "@react-native-async-storage/async-storage";

// 기본 구현 복원 대상(getLocales·useLocales)은 패키지가 아니라 mock 모듈에서 읽는다. 아래 팩토리가 돌려주는 것과 같은 객체이고,
// setup이 패키지를 먼저 불러 두지 않아야 테스트 파일의 jest.mock(팩토리)이 연결을 덮어쓸 수 있다(jest는 만든 팩토리 mock을 캐시한다).
import { getLocales, useLocales } from "./src/mocks/expo-localization";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
// SafeAreaProvider는 jest에서 자식을 렌더하지 않는다 → 공식 jest mock(설계서 §1.1 (b))
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default
);
// 수동 mock(U-09): src/mocks/에 패키지 이름 그대로 두고 모든 테스트에 연결한다(이전 루트 __mocks__ 자동 적용과 같은 동작).
// jest.mock(이름, 팩토리)라 jest.requireActual·jest.unmock은 실제 패키지를 준다. moduleNameMapper는 둘 다 mock 파일로 풀어 쓰지 않았다.
jest.mock("expo-localization", () => require("./src/mocks/expo-localization"));
jest.mock("@react-native-community/datetimepicker", () =>
  require("./src/mocks/@react-native-community/datetimepicker")
);

// 공유 mock의 기본 구현을 스냅숏해 테스트마다 복원한다. Jest 30의 resetMocks는 수동 mock 구현까지 지우고,
// restoreAllMocks는 spy만 복원하므로 mockReturnValue 등이 다음 테스트로 새기 때문이다(F-07).
// 공식 AsyncStorage mock의 setItem/removeItem은 내부에서 multiSet/multiRemove를 부르므로 함께 복원한다.
const storageMethods = [
  "getItem",
  "setItem",
  "removeItem",
  "clear",
  "getAllKeys",
  "multiGet",
  "multiSet",
  "multiRemove",
] as const;
const sharedMocks: jest.Mock[] = [
  ...storageMethods.map((m) => jest.mocked(AsyncStorage[m]) as jest.Mock),
  jest.mocked(getLocales) as jest.Mock,
  jest.mocked(useLocales) as jest.Mock,
];
const defaults = sharedMocks.map(
  (fn) => [fn, fn.getMockImplementation()] as const
);

beforeEach(() => {
  for (const [fn, impl] of defaults) {
    fn.mockReset();
    if (impl) fn.mockImplementation(impl);
  }
});

afterEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
});
