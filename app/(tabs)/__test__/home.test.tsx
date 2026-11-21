import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { Platform } from "react-native";

import { encodeChildren, isChildId, MAX_CHILDREN } from "@/lib/children";
import { toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";
import type { ChildId, ChildrenState } from "@/types";

import {
  closestScrollView,
  deferStorage,
  flushRouterMacrotask,
  getTabButtons,
  renderApp,
  seedStorage,
} from "../../../test-utils/render";

// 홈 화면 수준(FR-01 US-2, FR-02 US-3, FR-16 US-21): AC-2.2~2.4(iOS 확인·취소, Android 연·월·일 선택 창), AC-3.3(하이드레이션 게이트와 아이 목록),
// 거울 AC-1.5·3.2 [unit](P8), AC-1.2·3.1 [unit](P9, 일정 화면 관찰), AC-21.1·21.4 [unit](공식 판정은 e2e/home.spec.ts·children.spec.ts). renderApp은 실제 app/ 디렉터리를 renderRouter로 로드한다(설계서 §9.5).
// Platform.OS는 홈이 렌더하는 BirthdatePicker가 렌더 시점에 읽으므로 jest.replaceProperty로 iOS/Android를 바꾼다(AD-05).
// 제출 버튼 활성 판정은 toBeEnabled()/toBeDisabled()(Pressable disabled → host accessibilityState.disabled, F-02).

/** DateTimePicker onValueChange의 첫 인자(설계서 §9.3) */
const PICK_EVENT = { nativeEvent: { timestamp: 0, utcOffset: 0 } };
const JAN_31_2024 = new Date(2024, 0, 31);

async function renderHome(): Promise<void> {
  await renderApp({ initialUrl: "/" });
  expect(await screen.findByTestId("screen-home")).toBeOnTheScreen();
}

function childId(value: string): ChildId {
  if (!isChildId(value)) throw new Error(`아이 id 형식이 아니다: ${value}`);
  return value;
}

/** 이름 없는 아이 1명(2024-01-31) */
const ONE_CHILD: ChildrenState = {
  activeId: childId("c1"),
  children: [
    { id: childId("c1"), birthdate: toIsoDate(JAN_31_2024), completed: [] },
  ],
};

/**
 * Android 선택 창으로 날짜를 고른다(선택 버튼 → 연·월·일 항목 → 확인, v1.8 U-32). 초안이 오늘(2026-10-18)에서 시작하므로
 * 연 → 월 → 일 순서로 고른다(올해 10월에는 19일 이후가 없어 일을 먼저 고를 수 없다)
 */
async function pickAndroid(date: Date): Promise<void> {
  await fireEvent.press(screen.getByTestId("birthdate-picker-button"));
  const modal = within(screen.getByTestId("birthdate-picker-modal"));
  const parts = [
    ["year", date.getFullYear()],
    ["month", date.getMonth() + 1],
    ["day", date.getDate()],
  ] as const;
  for (const [part, value] of parts) {
    await fireEvent.press(
      modal.getByTestId(`birthdate-option-${part}-${value}`)
    );
  }
  await fireEvent.press(modal.getByRole("button", { name: "확인" }));
}

/** 저장된 아이 목록 JSON(쓰기 큐가 끝난 뒤) */
async function storedChildren(): Promise<unknown> {
  await flushRouterMacrotask();
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.children);
  return raw === null ? null : JSON.parse(raw);
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

describe("AC-2.4 Android 홈: 연·월·일 선택 창에서 선택", () => {
  it("AC-2.4 Android·선택값 없음: 선택 버튼을 누르면 시트(birthdate-picker-modal)에 연·월·일 항목이 열리고(시스템 DateTimePicker 없음, 초안 2026년·10월·18일 checked), 2024년·1월·31일을 고른 뒤 '확인'을 누르면 시트가 닫히며 선택 버튼 텍스트 '2024-01-31'·birthdate-submit 활성(toBeEnabled)이다(v1.8 U-32)", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderHome();

    expect(screen.getByTestId("birthdate-submit")).toBeDisabled();
    await fireEvent.press(
      screen.getByRole("button", { name: "생년월일, 생년월일 선택" })
    );

    const modal = within(screen.getByTestId("birthdate-picker-modal"));
    expect(modal.queryByTestId("datetimepicker-mock")).toBeNull();
    expect(
      modal.getByRole("radio", { name: "2026년", checked: true })
    ).toBeOnTheScreen();
    expect(
      modal.getByRole("radio", { name: "10월", checked: true })
    ).toBeOnTheScreen();
    expect(
      modal.getByRole("radio", { name: "18일", checked: true })
    ).toBeOnTheScreen();
    // 허용 범위 2017-01-01 ~ 2026-10-18 밖의 연도는 항목이 없다
    expect(modal.queryByTestId("birthdate-option-year-2016")).toBeNull();
    expect(modal.queryByTestId("birthdate-option-year-2027")).toBeNull();

    await fireEvent.press(modal.getByRole("radio", { name: "2024년" }));
    await fireEvent.press(modal.getByRole("radio", { name: "1월" }));
    await fireEvent.press(modal.getByRole("radio", { name: "31일" }));
    await fireEvent.press(modal.getByRole("button", { name: "확인" }));

    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
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
// FR-16(v1.7): 홈은 저장된 아이 목록(home-children, 아이마다 child-shortcut "{이름표} 일정 바로 보기")과 새 아이 추가 폼이다.
// 이름표는 이름이 있으면 이름, 없으면 생년월일이다(U-27). 예전 생년월일 키 시드는 하이드레이션에서 아이 1명으로 옮겨진다(U-29).
describe("AC-3.3 하이드레이션 게이트와 저장된 아이 목록", () => {
  it("AC-3.3 AsyncStorage.getItem이 아직 resolve되지 않은 동안 홈을 렌더하면 목록이 렌더되지 않고, 아이 1명(2024-01-31) 목록으로 resolve하면 '2024-01-31 일정 바로 보기' 바로가기가 렌더된다", async () => {
    const storage = deferStorage([STORAGE_KEYS.children]);
    await renderApp({ initialUrl: "/" });

    expect(screen.queryByTestId("home-children")).toBeNull();
    expect(screen.getByTestId("loading-gate")).toBeOnTheScreen();

    await storage.resolve(STORAGE_KEYS.children, encodeChildren(ONE_CHILD));

    const list = await screen.findByTestId("home-children");
    expect(
      within(list).getByRole("heading", { name: "저장된 아이" })
    ).toBeOnTheScreen();
    expect(
      within(list).getByRole("button", { name: "2024-01-31 일정 바로 보기" })
    ).toBe(within(list).getByTestId("child-shortcut"));
    expect(screen.queryByTestId("loading-gate")).toBeNull();
  });
});

// 거울 테스트(E2E AC의 회귀 확인용, 공식 판정 아님 — PRD §2.3.0).
describe("AC-1.5 [unit] 아이가 있으면 홈에 추가 폼이 없다", () => {
  it("AC-1.5 [unit] 저장된 아이(2024-01-31)가 있으면 홈에는 저장된 아이 목록만 있고 아이 추가 폼(home-add-child·child-name-input·birthdate-submit)은 없으며, 헤더에 '아이 추가' 버튼이 있다(U-30)", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    await renderHome();
    const home = within(screen.getByTestId("screen-home"));

    expect(home.getByTestId("home-children")).toBeOnTheScreen();
    for (const testID of [
      "home-add-child",
      "child-name-input",
      "birthdate-submit",
    ]) {
      expect(home.queryByTestId(testID)).toBeNull();
    }
    expect(
      home.getByRole("button", { name: "아이 추가", expanded: false })
    ).toBe(home.getByTestId("header-add-child-button"));
  });
});

describe("U-30 [unit] 추가 폼의 칸 순서", () => {
  it("U-30 [unit] 아이가 없으면 홈 추가 폼이 생년월일(필수) → 이름(선택) 순이고 헤더에는 '아이 추가' 버튼이 없다", async () => {
    await renderHome();
    const form = within(screen.getByTestId("home-add-child"));

    const order = form
      .getAllByTestId(/^(birthdate-picker-button|child-name-input)$/)
      .map((node) => String(node.props.testID));
    expect(order).toEqual(["birthdate-picker-button", "child-name-input"]);
    const labels = form
      .getAllByText(/^(생년월일|이름|필수|선택)$/)
      .map((node) => String(node.props.children));
    expect(labels).toEqual(["생년월일", "필수", "이름", "선택"]);
    expect(screen.queryByTestId("header-add-child-button")).toBeNull();
  });
});

describe("AC-3.2 [unit] 저장값 없음 → 목록 없음", () => {
  it("AC-3.2 [unit] 저장값 없이 홈에 진입하면 home-children·child-shortcut이 0개이고 '저장된 아이' 텍스트도 0개이며 아이 추가 폼만 있다", async () => {
    await renderHome();
    expect(screen.getByTestId("birthdate-submit")).toBeOnTheScreen();

    for (const testID of ["home-children", "child-shortcut"]) {
      expect(
        screen.queryAllByTestId(testID, { includeHiddenElements: true })
      ).toHaveLength(0);
    }
    expect(
      screen.queryAllByText("저장된 아이", { includeHiddenElements: true })
    ).toHaveLength(0);
    expect(
      screen.getByRole("heading", { name: "아이 추가" })
    ).toBeOnTheScreen();
  });
});

describe("AC-1.2 [unit] 아이 추가 후 일정 화면 이동", () => {
  it("AC-1.2 [unit] Android 피커로 2026-04-30을 고르고 '일정 확인하기'를 누르면 경로가 /schedule이고 아이 선택 칩 '2026-04-30'이 checked이며 저장된 아이 목록에 이름 없는 2026-04-30 아이가 있다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderHome();

    await pickAndroid(new Date(2026, 3, 30));
    await fireEvent.press(
      screen.getByRole("button", { name: "일정 확인하기" })
    );

    expect(screen).toHavePathname("/schedule");
    expect(
      await screen.findByRole("radio", { name: "2026-04-30", checked: true })
    ).toBeOnTheScreen();
    expect(await storedChildren()).toMatchObject({
      children: [{ birthdate: "2026-04-30", completed: [] }],
    });
  });
});

describe("AC-3.1 [unit] 저장된 아이 바로가기로 일정 이동", () => {
  it("AC-3.1 [unit] 예전 저장값 '2024-01-31'로 홈에 진입하면 바로가기가 1개('2024-01-31 일정 바로 보기')이고, 누르면 경로가 /schedule·칩 '2024-01-31'이 checked다", async () => {
    await seedStorage({ [STORAGE_KEYS.birthdate]: "2024-01-31" });
    await renderHome();

    expect(screen.getAllByTestId("child-shortcut")).toHaveLength(1);
    await fireEvent.press(
      screen.getByRole("button", { name: "2024-01-31 일정 바로 보기" })
    );

    expect(screen).toHavePathname("/schedule");
    expect(
      await screen.findByRole("radio", { name: "2024-01-31", checked: true })
    ).toBeOnTheScreen();
  });
});

describe("AC-21.1 [unit] 이름을 넣어 아이 추가", () => {
  it("AC-21.1 [unit] 이름 '  민준 '·생년월일 2024-01-31로 추가하면 일정 칩·홈 바로가기 이름표가 '민준'이고 저장값 이름은 '민준'이며, 홈으로 돌아오면 폼 대신 목록이 있다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await renderHome();
    expect(screen.getByLabelText("이름 (선택)")).toBe(
      screen.getByTestId("child-name-input")
    );

    await fireEvent.changeText(
      screen.getByTestId("child-name-input"),
      "  민준 "
    );
    await pickAndroid(JAN_31_2024);
    await fireEvent.press(
      screen.getByRole("button", { name: "일정 확인하기" })
    );

    expect(
      await screen.findByRole("radio", { name: "민준", checked: true })
    ).toBeOnTheScreen();
    expect(await storedChildren()).toMatchObject({
      children: [{ name: "민준", birthdate: "2024-01-31" }],
    });

    const [homeTab] = getTabButtons(["홈"]);
    if (!homeTab) throw new Error("홈 탭이 없다");
    await fireEvent.press(homeTab);
    const home = within(await screen.findByTestId("screen-home"));
    expect(
      home.getByRole("button", { name: "민준 일정 바로 보기" })
    ).toBeOnTheScreen();
    expect(home.queryByTestId("home-add-child")).toBeNull();
  });
});

describe("AC-21.4 [unit] 10명 제한", () => {
  it("AC-21.4 [unit] 아이 10명이 저장돼 있으면 헤더 '아이 추가' 메뉴에 안내 문구 '최대 10명까지 저장할 수 있어요…'가 보이고 생년월일을 골라도 birthdate-submit은 비활성이다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await seedStorage({
      [STORAGE_KEYS.children]: encodeChildren({
        activeId: null,
        children: Array.from({ length: MAX_CHILDREN }, (_, index) => ({
          id: childId(`c${index + 10}`),
          birthdate: toIsoDate(new Date(2026, 3, 30)),
          completed: [],
        })),
      }),
    });
    await renderHome();
    expect(screen.getAllByTestId("child-shortcut")).toHaveLength(10);
    await fireEvent.press(screen.getByTestId("header-add-child-button"));

    expect(screen.getByTestId("home-children-full")).toHaveTextContent(
      "최대 10명까지 저장할 수 있어요. 설정에서 아이를 삭제한 뒤 추가해 주세요."
    );
    await pickAndroid(JAN_31_2024);
    expect(screen.getByTestId("birthdate-submit")).toBeDisabled();
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
