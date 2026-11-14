import { fireEvent, screen, within } from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BirthdatePicker } from "@/components/home/BirthdatePicker";
import { BirthdatePicker as WebBirthdatePicker } from "@/components/home/BirthdatePicker.web";
import { getBirthdateRange, toIsoDate } from "@/lib/date";
import type { IsoDate } from "@/types";

import {
  day,
  FIXED_NOW,
  renderWithProviders,
} from "../../../../test-utils/render";

// FR-01 US-2 네이티브 피커 컴포넌트 수준: AC-2.1(iOS Modal + spinner), AC-2.5(Android onDismiss).
// Platform.OS는 컴포넌트가 렌더 시점에 읽으므로 jest.replaceProperty로 분기를 바꾼다(AD-05, 설계서 §7.1).
// jest.setup.ts의 restoreAllMocks가 테스트마다 되돌린다. DateTimePicker는 src/mocks/의 수동 mock(jest.setup.ts가 연결, U-09)이 props를
// host View(testID datetimepicker-mock)에 노출하고 fireEvent(el, 'valueChange' | 'dismiss')로 조작한다(설계서 §9.3).

/** ENV-TDD now = 2026-10-18 15:00 → 2017-01-01 ~ 2026-10-18(AC-1.6, U-05) */
const RANGE = getBirthdateRange(FIXED_NOW);

describe("AC-2.1 iOS 선택 버튼 → Modal 안의 spinner DateTimePicker", () => {
  it("AC-2.1 iOS·선택값 없음: 접근 이름 '생년월일, 생년월일 선택'(보이는 텍스트 '생년월일 선택') 버튼을 누르면 Modal이 visible=true로 렌더되고, 그 안의 DateTimePicker props가 mode=date·display=spinner·min 2017-01-01·max 2026-10-18이며 확인·취소 버튼이 각 1개다", async () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const onChange = jest.fn();
    await renderWithProviders(
      <BirthdatePicker value={null} onChange={onChange} range={RANGE} />
    );

    const button = await screen.findByRole("button", {
      name: "생년월일, 생년월일 선택",
    });
    expect(button).toHaveTextContent("생년월일 선택");
    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
    expect(screen.queryByTestId("datetimepicker-mock")).toBeNull();

    await fireEvent.press(button);

    const modal = screen.getByTestId("birthdate-picker-modal");
    expect(modal).toHaveProp("visible", true);
    const picker = within(modal).getByTestId("datetimepicker-mock");
    expect(picker).toHaveProp("mode", "date");
    expect(picker).toHaveProp("display", "spinner");
    expect(toIsoDate(picker.props.minimumDate)).toBe("2017-01-01");
    expect(toIsoDate(picker.props.maximumDate)).toBe("2026-10-18");
    // 설계서 §7.1: 휠은 앱 테마·언어를 따른다(기본 mock: OS light, 기기 ko-KR). 수동 AC-2.6의 다크 가독성 전제
    expect(picker).toHaveProp("themeVariant", "light");
    expect(picker).toHaveProp("locale", "ko-KR");
    expect(within(modal).getAllByRole("button", { name: "확인" })).toHaveLength(
      1
    );
    expect(within(modal).getAllByRole("button", { name: "취소" })).toHaveLength(
      1
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AC-2.5 Android 기존 선택값 + onDismiss", () => {
  it("AC-2.5 Android·기존 선택값 2024-01-31: 선택 버튼을 눌러 피커(display=default)를 연 뒤 onDismiss()를 호출하면 DateTimePicker가 언마운트되고 선택 버튼 텍스트는 '2024-01-31'로 유지된다(onChange 호출 없음)", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onChange = jest.fn();
    const value = toIsoDate(new Date(2024, 0, 31));
    await renderWithProviders(
      <BirthdatePicker value={value} onChange={onChange} range={RANGE} />
    );

    const button = await screen.findByRole("button", {
      name: "생년월일, 2024-01-31",
    });
    expect(button).toHaveTextContent("2024-01-31");
    expect(screen.queryByTestId("datetimepicker-mock")).toBeNull();

    await fireEvent.press(button);

    const picker = screen.getByTestId("datetimepicker-mock");
    expect(picker).toHaveProp("display", "default");
    expect(toIsoDate(picker.props.value)).toBe("2024-01-31");
    // Android는 기본 다이얼로그라 iOS 모달이 없다
    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();

    await fireEvent(picker, "dismiss");

    expect(screen.queryByTestId("datetimepicker-mock")).toBeNull();
    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "2024-01-31"
    );
    expect(
      screen.getByRole("button", { name: "생년월일, 2024-01-31" })
    ).toBeOnTheScreen();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// R1-18 (리뷰 라운드 1): iOS 모달 시트는 화면 맨 아래에 붙으므로 하단 여백이 홈 인디케이터 영역(safe-area 하단 inset)보다
// 작으면 spinner 아래쪽이 인디케이터와 겹친다. 여백은 24(SPACING.xl)와 하단 inset 중 큰 값이다.
// inset은 safe-area jest mock의 SafeAreaProvider initialMetrics로 바꾼다(가장 가까운 Provider 값이 쓰인다).
describe("R1-18 iOS 시트 하단 여백과 safe-area 하단 inset", () => {
  const FRAME = { x: 0, y: 0, width: 390, height: 844 };

  it.each([
    [0, 24],
    [20, 24],
    [34, 34],
  ])(
    "R1-18 하단 inset이 %i이면 spinner를 담은 시트의 paddingBottom은 %i다",
    async (bottom, expected) => {
      jest.replaceProperty(Platform, "OS", "ios");
      await renderWithProviders(
        <SafeAreaProvider
          initialMetrics={{
            frame: FRAME,
            insets: { top: 47, left: 0, right: 0, bottom },
          }}
        >
          <BirthdatePicker value={null} onChange={jest.fn()} range={RANGE} />
        </SafeAreaProvider>
      );

      await fireEvent.press(
        await screen.findByRole("button", { name: "생년월일, 생년월일 선택" })
      );

      const picker = within(
        screen.getByTestId("birthdate-picker-modal")
      ).getByTestId("datetimepicker-mock");
      // 시트 = spinner(DateTimePicker)를 직접 담은 View
      expect(picker.parent).toHaveStyle({ paddingBottom: expected });
    }
  );
});

// R2-02 (리뷰 라운드 2): 웹 피커(BirthdatePicker.web)의 입력 원문 state(리뷰 R1-01). jest(iOS 프리셋)는 '@/components/home/BirthdatePicker'를
// 네이티브 구현으로 풀므로 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다(src/hooks/__test__/useRovingFocus.test.tsx와 같은 방식).
// 호스트 <input>은 RN 렌더러에서 props를 가진 host 요소라 change 이벤트를 onChange에 직접 넘긴다(브라우저 값 = event.currentTarget.value).
// 실제 Chromium 키보드 입력은 e2e/review-r1-home.spec.ts(R1-01)가 본다. 그 E2E는 date.ts의 0~99년 보정만으로도 통과하므로
// (리뷰 R2-02) 피커가 원문을 지키는 동작과 상위 값 변경 반영(changedByParent)은 여기서 지킨다.

/** 홈 HomeForm처럼 피커가 올린 값을 상위 state로 들고 다시 value로 내려 준다 */
function WebPickerHarness({
  initial,
  onChange,
}: {
  readonly initial: IsoDate | null;
  readonly onChange: (next: IsoDate | null) => void;
}): ReactElement {
  const [value, setValue] = useState<IsoDate | null>(initial);
  return (
    <WebBirthdatePicker
      value={value}
      onChange={(next) => {
        onChange(next);
        setValue(next);
      }}
      range={RANGE}
    />
  );
}

/** 웹 피커의 host <input>(접근 이름 = home.birthdateLabel "생년월일") */
async function findDateInput() {
  return screen.findByLabelText("생년월일");
}

/** 날짜 입력의 change 이벤트. 브라우저는 미완성이면 "", 그 밖에는 검증 전 원문을 준다 */
function changeEvent(value: string) {
  return { currentTarget: { value } };
}

describe("R2-02 웹 피커(BirthdatePicker.web) 입력 원문 state", () => {
  it("R2-02 유효한 날짜(2024-03-15)를 입력하면 그 IsoDate를 onChange로 올리고 입력란은 그 값을 보여 준다", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <WebPickerHarness initial={null} onChange={onChange} />
    );
    const input = await findDateInput();
    expect(input).toHaveProp("value", "");

    await fireEvent(input, "change", changeEvent("2024-03-15"));

    expect(onChange.mock.calls).toEqual([["2024-03-15"]]);
    expect(input).toHaveProp("value", "2024-03-15");
  });

  it("R2-02 검증기가 거부하는 원문(연도 다섯 자리 20245-03-15)과 미완성 값('')은 null을 올리지만 입력란은 원문을 그대로 두고, 이어서 유효한 날짜가 되면 그 값을 올린다(상위 값 null로 덮어써 지우지 않음, R1-01)", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <WebPickerHarness
        initial={toIsoDate(day("2024-01-31"))}
        onChange={onChange}
      />
    );
    const input = await findDateInput();
    expect(input).toHaveProp("value", "2024-01-31");

    await fireEvent(input, "change", changeEvent("20245-03-15"));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveProp("value", "20245-03-15");

    await fireEvent(input, "change", changeEvent(""));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveProp("value", "");

    await fireEvent(input, "change", changeEvent("2025-03-15"));

    expect(onChange).toHaveBeenLastCalledWith("2025-03-15");
    expect(input).toHaveProp("value", "2025-03-15");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("R2-02 상위가 value를 바꾸면(프리필·초기화) 입력란이 새 값을 보여 주고 onChange는 부르지 않는다(changedByParent: 다른 날짜 → 그 날짜, null → 빈 입력)", async () => {
    const onChange = jest.fn();
    // 렌더마다 상위 제어 값(value)만 바뀐다
    const webPicker = (value: IsoDate | null) => (
      <WebBirthdatePicker value={value} onChange={onChange} range={RANGE} />
    );
    const { rerender } = await renderWithProviders(
      webPicker(toIsoDate(day("2024-01-31")))
    );
    const input = await findDateInput();
    expect(input).toHaveProp("value", "2024-01-31");

    await rerender(webPicker(toIsoDate(day("2025-05-05"))));

    expect(input).toHaveProp("value", "2025-05-05");

    await rerender(webPicker(null));

    expect(input).toHaveProp("value", "");
    expect(onChange).not.toHaveBeenCalled();
  });
});
