import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { Platform } from "react-native";

import { toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";

import {
  closestScrollView,
  deferStorage,
  flushRouterMacrotask,
  renderApp,
  seedStorage,
} from "../../../test-utils/render";

// 홈 화면 수준(FR-01 US-2, FR-02 US-3): AC-2.2~2.4(iOS 확인·취소, Android 선택), AC-3.3(하이드레이션 게이트와 바로가기),
// 거울 AC-1.5·3.2 [unit](P8), AC-1.2·3.1 [unit](P9, 일정 화면 관찰)(공식 판정은 e2e/home.spec.ts). renderApp은 실제 app/ 디렉터리를 renderRouter로 로드한다(설계서 §9.5).
// Platform.OS는 홈이 렌더하는 BirthdatePicker가 렌더 시점에 읽으므로 jest.replaceProperty로 iOS/Android를 바꾼다(AD-05).
// 제출 버튼 활성 판정은 toBeEnabled()/toBeDisabled()(Pressable disabled → host accessibilityState.disabled, F-02).

/** DateTimePicker onValueChange의 첫 인자(설계서 §9.3) */
const PICK_EVENT = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
const JAN_31_2024 = new Date(2024, 0, 31);

async function renderHome(): Promise<void> {
  await renderApp({ initialUrl: "/" });
  expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
}

describe("AC-2.2 iOS 홈: 피커에서 날짜를 고르고 확인", () => {
  it("AC-2.2 iOS·선택값 없음·모달 열림: onValueChange(event, 2024-01-31) 뒤 '확인'을 누르면 모달이 사라지고, 선택 버튼 텍스트가 '2024-01-31'·접근 이름이 '생년월일, 2024-01-31'이며 birthdate-submit이 활성(toBeEnabled)이다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await renderHome();

    expect(screen.getByTestId("birthdate-submit")).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일, 생년월일 선택" })
    );
    const modal = screen.getByTestId("birthdate-picker-modal");
    expect(modal).toHaveProp("visible", true);

    await fireEvent(
      within(modal).getByTestId("datetimepicker-mock"),
      "valueChange",
      PICK_EVENT,
      JAN_31_2024
    );
    await fireEvent.press(within(modal).getByRole("button", { name: "확인" }));

    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
    expect(screen.queryByTestId("datetimepicker-mock")).toBeNull();
    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "2024-01-31"
    );
    expect(
      screen.getByRole("button", { name: "생년월일, 2024-01-31" })
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "일정 확인하기" })).toBeEnabled();
    expect(screen.getByTestId("birthdate-submit")).toBeEnabled();
  });
});

describe("AC-2.3 iOS 홈: 피커에서 날짜를 고르고 취소", () => {
  it("AC-2.3 iOS·선택값 없음·모달 열림: onValueChange(event, 2024-01-31) 뒤 '취소'를 누르면 모달이 사라지고, 선택 버튼 텍스트는 '생년월일 선택'으로 유지되며 birthdate-submit은 비활성(toBeDisabled)이다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    await renderHome();

    const pickerButton = screen.getByRole("button", {
      name: "생년월일, 생년월일 선택",
    });
    await fireEvent.press(pickerButton);
    const modal = screen.getByTestId("birthdate-picker-modal");
    await fireEvent(
      within(modal).getByTestId("datetimepicker-mock"),
      "valueChange",
      PICK_EVENT,
      JAN_31_2024
    );
    await fireEvent.press(within(modal).getByRole("button", { name: "취소" }));

    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "생년월일 선택"
    );
    expect(
      screen.getByRole("button", { name: "생년월일, 생년월일 선택" })
    ).toBeOnTheScreen();
    expect(
      screen.queryByRole("button", { name: "생년월일, 2024-01-31" })
    ).toBeNull();
    expect(screen.getByTestId("birthdate-submit")).toBeDisabled();

    // 취소된 초안은 폐기된다: 다시 열면 spinner 초기값이 오늘(range.max)이다
    await fireEvent.press(pickerButton);
    expect(
      toIsoDate(
        within(screen.getByTestId("birthdate-picker-modal")).getByTestId(
          "datetimepicker-mock"
        ).props.value
      )
    ).toBe("2026-10-18");
  });
});

describe("AC-2.4 Android 홈: 기본 다이얼로그에서 선택", () => {
  it("AC-2.4 Android·선택값 없음: 선택 버튼을 누르면 DateTimePicker가 display=default·min 2017-01-01·max 2026-10-18로 렌더되고, onValueChange({ nativeEvent: { timestamp, utcOffset } }, 2024-01-31)를 호출하면 피커가 언마운트되며 선택 버튼 텍스트 '2024-01-31'·birthdate-submit 활성(toBeEnabled)이다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderHome();

    expect(screen.getByTestId("birthdate-submit")).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일, 생년월일 선택" })
    );

    const picker = screen.getByTestId("datetimepicker-mock");
    expect(picker).toHaveProp("display", "default");
    expect(picker).toHaveProp("mode", "date");
    expect(toIsoDate(picker.props.minimumDate)).toBe("2017-01-01");
    expect(toIsoDate(picker.props.maximumDate)).toBe("2026-10-18");
    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();

    await fireEvent(picker, "valueChange", PICK_EVENT, JAN_31_2024);

    expect(screen.queryByTestId("datetimepicker-mock")).toBeNull();
    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "2024-01-31"
    );
    expect(
      screen.getByRole("button", { name: "생년월일, 2024-01-31" })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("birthdate-submit")).toBeEnabled();
  });
});

// FR-02 US-3. 루트 LoadingGate가 세 키 하이드레이션까지 Slot을 막으므로(P-07) 지연 중에는 홈 자체가 없고, resolve 뒤 저장값으로 렌더된다.
describe("AC-3.3 하이드레이션 게이트와 이전 생년월일 바로가기", () => {
  it("AC-3.3 AsyncStorage.getItem이 아직 resolve되지 않은 동안 홈을 렌더하면 바로가기가 렌더되지 않고, '2024-01-31'로 resolve하면 '이전에 입력한 생년월일이 있어요 (2024-01-31)'가 렌더된다", async () => {
    const storage = deferStorage([STORAGE_KEYS.birthdate]);
    await renderApp({ initialUrl: "/" });

    expect(screen.queryByTestId("existing-birthdate-shortcut")).toBeNull();
    expect(screen.queryByText(/이전에 입력한 생년월일이 있어요/)).toBeNull();
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();

    await storage.resolve(STORAGE_KEYS.birthdate, "2024-01-31");

    const shortcut = await screen.findByTestId("existing-birthdate-shortcut");
    expect(shortcut).toHaveTextContent(
      "이전에 입력한 생년월일이 있어요 (2024-01-31)"
    );
    expect(
      screen.getByRole("button", {
        name: "이전에 입력한 생년월일이 있어요 (2024-01-31)",
      })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("screen-home")).toBeOnTheScreen();
    expect(screen.queryByTestId("loading-gate")).toBeNull();
  });
});

// 거울 테스트(E2E AC의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0). 웹 input value 대신 네이티브 선택 버튼 텍스트로 프리필을 본다.
describe("AC-1.5 [unit] 저장값 프리필", () => {
  it("AC-1.5 [unit] 저장값 '2024-01-31'로 홈에 진입하면 선택 버튼 텍스트가 '2024-01-31'(접근 이름 '생년월일, 2024-01-31')이고 birthdate-submit이 활성(toBeEnabled)이다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    await renderHome();

    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "2024-01-31"
    );
    expect(
      screen.getByRole("button", { name: "생년월일, 2024-01-31" })
    ).toBeOnTheScreen();
    expect(screen.getByTestId("birthdate-submit")).toBeEnabled();
  });
});

// 거울 테스트(E2E AC-3.2의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0). E2E의 toHaveCount(0)처럼 숨김 요소까지 센다.
describe("AC-3.2 [unit] 저장값 없음 → 바로가기 없음", () => {
  it("AC-3.2 [unit] 저장값 없이 홈에 진입하면 existing-birthdate-shortcut 요소가 0개이고 '이전에 입력한 생년월일이 있어요' 텍스트도 0개다", async () => {
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBeNull();
    await renderHome();
    // 홈이 완전히 렌더된 뒤(폼 표시) 0개를 판정한다
    expect(screen.getByTestId("birthdate-picker-button")).toBeOnTheScreen();
    expect(screen.getByTestId("birthdate-submit")).toBeOnTheScreen();

    expect(
      screen.queryAllByTestId("existing-birthdate-shortcut", {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);
    expect(
      screen.queryAllByText(/이전에 입력한 생년월일이 있어요/, {
        includeHiddenElements: true,
      })
    ).toHaveLength(0);
  });
});

// 거울 테스트(E2E AC-1.2의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0). 웹 input 대신 Android 피커로 같은 저장·이동 흐름을 본다.
describe("AC-1.2 [unit] 생년월일 저장 후 일정 화면 이동", () => {
  it("AC-1.2 [unit] Android 피커로 2026-04-30을 고르고 '일정 확인하기'를 누르면 경로가 /schedule, schedule-birthdate가 '생년월일: 2026-04-30'이고 저장값이 '2026-04-30'이다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderHome();

    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일, 생년월일 선택" })
    );
    await fireEvent(
      screen.getByTestId("datetimepicker-mock"),
      "valueChange",
      PICK_EVENT,
      new Date(2026, 3, 30)
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "일정 확인하기" })
    );

    expect(screen).toHavePathname("/schedule");
    expect(await screen.findByTestId("schedule-birthdate")).toHaveTextContent(
      "생년월일: 2026-04-30"
    );
    await flushRouterMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.birthdate)).toBe(
      "2026-04-30"
    );
  });
});

// 거울 테스트(E2E AC-3.1의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0).
describe("AC-3.1 [unit] 이전 생년월일 바로가기로 일정 이동", () => {
  it("AC-3.1 [unit] 저장값 '2024-01-31'로 홈에 진입하면 existing-birthdate-shortcut이 1개('이전에 입력한 생년월일이 있어요 (2024-01-31)')이고, 누르면 경로가 /schedule·schedule-birthdate가 '생년월일: 2024-01-31'이다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    await renderHome();

    const shortcuts = screen.getAllByTestId("existing-birthdate-shortcut");
    expect(shortcuts).toHaveLength(1);
    expect(shortcuts[0]).toHaveTextContent(
      "이전에 입력한 생년월일이 있어요 (2024-01-31)"
    );

    await fireEvent.press(
      screen.getByRole("button", {
        name: "이전에 입력한 생년월일이 있어요 (2024-01-31)",
      })
    );

    expect(screen).toHavePathname("/schedule");
    expect(await screen.findByTestId("schedule-birthdate")).toHaveTextContent(
      "생년월일: 2024-01-31"
    );
  });
});

// R1-02 (리뷰 라운드 1): 홈만 본문 스크롤이 없어 짧은 화면(가로 모드·200% 확대)이나 큰 글꼴에서 제출 버튼에 닿을 수 없었다.
// 실제 배치와 도달(휠 스크롤 → 탭 바 위에 보임 → 누름)은 e2e/review-r1-home.spec.ts가 보고, 여기서는 구조를 고정한다.
// Screen 컴포넌트의 비스크롤 분기 지원 테스트(R1-02 [지원])는 대상 옆 src/components/common/__test__/Screen.test.tsx로
// 옮겼다(리뷰 R3-02, U-08). ScrollView 조상 찾기(closestScrollView)는 두 파일이 test-utils에서 함께 쓴다.
describe("R1-02 홈 본문 스크롤", () => {
  it("R1-02 홈의 제목·생년월일 선택 버튼·제출 버튼은 screen-home 안의 같은 세로 ScrollView 안에 있다", async () => {
    await renderHome();

    const scrollView = closestScrollView(
      screen.getByTestId("birthdate-submit")
    );
    expect(scrollView).not.toBeNull();
    expect(scrollView?.props.horizontal).toBeFalsy();
    expect(
      within(screen.getByTestId("screen-home")).getAllByTestId(
        "birthdate-submit"
      )
    ).toHaveLength(1);
    expect(closestScrollView(screen.getByTestId("screen-home"))).toBeNull();
    for (const element of [
      screen.getByRole("heading", { name: /아기 예방접종\s+일정 관리/ }),
      screen.getByTestId("birthdate-picker-button"),
    ]) {
      expect(closestScrollView(element)).toBe(scrollView);
    }
  });
});
