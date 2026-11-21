import { fireEvent, screen, within } from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BirthdatePicker } from "@/components/home/BirthdatePicker";
import { BirthdatePicker as WebBirthdatePicker } from "@/components/home/BirthdatePicker.web";
import { getBirthdateRange, toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";
import type { IsoDate } from "@/types";

import {
  day,
  FIXED_NOW,
  type HostElement,
  propsOf,
  renderWithProviders,
  seedStorage,
} from "../../../../test-utils/render";

// FR-01 US-2 네이티브 피커 컴포넌트 수준: AC-2.1(iOS Modal + spinner), AC-2.5(Android 연·월·일 시트 + 취소, v1.8 U-32).
// Platform.OS는 컴포넌트가 렌더 시점에 읽으므로 jest.replaceProperty로 분기를 바꾼다(AD-05, 설계서 §7.1).
// jest.setup.ts의 restoreAllMocks가 테스트마다 되돌린다. DateTimePicker는 src/mocks/의 수동 mock(jest.setup.ts가 연결, U-09)이 props를
// host View(testID datetimepicker-mock)에 노출하고 fireEvent(el, 'valueChange' | 'dismiss')로 조작한다(설계서 §9.3).

/** 항목(radio)의 보이는 텍스트 */
function describeLabel(node: HostElement): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : describeLabel(child)))
    .join("");
}

/** 연·월·일 열(radiogroup)의 이름. RNTL은 접근성 요소가 아닌 radiogroup 컨테이너를 role로 찾지 않으므로 testID로 찾는다 */
function columnLabels(scope: ReturnType<typeof within>): unknown[] {
  return ["year", "month", "day"].map((part) => {
    const column = scope.getByTestId(`birthdate-column-${part}`);
    expect(propsOf(column).role).toBe("radiogroup");
    return propsOf(column)["aria-label"];
  });
}

/** 연·월·일 열에서 checked인 항목의 텍스트가 차례로 expected다 */
function expectChecked(
  scope: ReturnType<typeof within>,
  expected: readonly string[]
): void {
  expect(
    scope.getAllByRole("radio", { checked: true }).map(describeLabel)
  ).toEqual(expected);
}

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

// v1.8 U-32: Android는 시스템 날짜 대화상자(기기 언어로만 표시) 대신 iOS와 같은 아래 시트 안에 앱이 그리는 연·월·일 세 열이다.
// 열마다 radiogroup("연도 선택"·"월 선택"·"일 선택") 안의 radio 항목(birthdate-option-{part}-{값}, 앱 언어 표기)이다.
describe("AC-2.5 Android 기존 선택값 + 취소", () => {
  it("AC-2.5 Android·기존 선택값 2024-01-31: 선택 버튼을 누르면 시트(birthdate-picker-modal)에 연·월·일 radiogroup 3개가 열리고 2024년·1월·31일이 checked다. 2025년·2월을 고르면 날은 28일로 맞춰지고(29일 이후 없음), '취소'를 누르면 시트가 닫히며 선택 버튼 텍스트는 '2024-01-31'로 유지되고(onChange 호출 없음) 다시 열면 초안이 2024-01-31로 돌아간다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onChange = jest.fn();
    const value = toIsoDate(day("2024-01-31"));
    await renderWithProviders(
      <BirthdatePicker value={value} onChange={onChange} range={RANGE} />
    );

    const button = await screen.findByRole("button", {
      name: "생년월일, 2024-01-31",
    });
    expect(button).toHaveTextContent("2024-01-31");
    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();

    await fireEvent.press(button);

    const modal = within(screen.getByTestId("birthdate-picker-modal"));
    // 시스템 대화상자(DateTimePicker)는 쓰지 않는다
    expect(modal.queryByTestId("datetimepicker-mock")).toBeNull();
    expect(columnLabels(modal)).toEqual(["연도 선택", "월 선택", "일 선택"]);
    expectChecked(modal, ["2024년", "1월", "31일"]);

    await fireEvent.press(modal.getByRole("radio", { name: "2025년" }));
    await fireEvent.press(modal.getByRole("radio", { name: "2월" }));

    expectChecked(modal, ["2025년", "2월", "28일"]);
    expect(modal.queryByTestId("birthdate-option-day-29")).toBeNull();

    await fireEvent.press(modal.getByRole("button", { name: "취소" }));

    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
    expect(screen.getByTestId("birthdate-picker-button")).toHaveTextContent(
      "2024-01-31"
    );
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(button);
    expectChecked(within(screen.getByTestId("birthdate-picker-modal")), [
      "2024년",
      "1월",
      "31일",
    ]);
  });

  it("U-32 Android 선택지는 허용 범위 안만 있다: 연도는 2026년~2017년 10개(최근 연도가 먼저), 선택값 없이 열면 초안은 오늘 2026-10-18이라 월은 10월까지·일은 18일까지이고, 2024년을 고르면 12월까지 생긴다. '확인'을 누르면 초안 날짜를 onChange로 올린다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const onChange = jest.fn();
    await renderWithProviders(
      <BirthdatePicker value={null} onChange={onChange} range={RANGE} />
    );

    await fireEvent.press(
      await screen.findByRole("button", { name: "생년월일, 생년월일 선택" })
    );
    const modal = within(screen.getByTestId("birthdate-picker-modal"));
    const years = within(modal.getByTestId("birthdate-column-year"));
    expect(years.getAllByRole("radio").map(describeLabel)).toEqual([
      "2026년",
      "2025년",
      "2024년",
      "2023년",
      "2022년",
      "2021년",
      "2020년",
      "2019년",
      "2018년",
      "2017년",
    ]);
    expectChecked(modal, ["2026년", "10월", "18일"]);
    expect(modal.queryByTestId("birthdate-option-month-11")).toBeNull();
    expect(modal.queryByTestId("birthdate-option-day-19")).toBeNull();

    await fireEvent.press(modal.getByTestId("birthdate-option-year-2024"));

    expect(modal.getByTestId("birthdate-option-month-12")).toBeOnTheScreen();
    expect(modal.getByTestId("birthdate-option-day-31")).toBeOnTheScreen();

    await fireEvent.press(modal.getByRole("button", { name: "확인" }));

    expect(onChange.mock.calls).toEqual([["2024-10-18"]]);
    expect(screen.queryByTestId("birthdate-picker-modal")).toBeNull();
  });

  it("U-32 Android 선택 창은 앱 언어를 따른다: 언어가 영어면 열 이름이 'Select year'·'Select month'·'Select day', 항목이 '2026'·'October'·'18', 머리 버튼이 'Cancel'·'Done'이다", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderWithProviders(
      <BirthdatePicker value={null} onChange={jest.fn()} range={RANGE} />
    );

    await fireEvent.press(
      await screen.findByRole("button", {
        name: "Date of birth, Select date of birth",
      })
    );
    const modal = within(screen.getByTestId("birthdate-picker-modal"));
    expect(columnLabels(modal)).toEqual([
      "Select year",
      "Select month",
      "Select day",
    ]);
    expectChecked(modal, ["2026", "October", "18"]);
    expect(modal.getByRole("radio", { name: "January" })).toBeOnTheScreen();
    expect(modal.getByRole("button", { name: "Cancel" })).toBeOnTheScreen();
    expect(modal.getByRole("button", { name: "Done" })).toBeOnTheScreen();
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

// R2-02 (리뷰 라운드 2) → v1.8 U-32: 웹 피커(BirthdatePicker.web)는 연·월·일 <select> 3개다. jest(iOS 프리셋)는
// '@/components/home/BirthdatePicker'를 네이티브 구현으로 풀므로 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다
// (src/hooks/__test__/useRovingFocus.test.tsx와 같은 방식). 호스트 <select>는 RN 렌더러에서 props를 가진 host 요소라
// change 이벤트를 onChange에 직접 넘긴다(브라우저 값 = event.currentTarget.value). 실제 Chromium 선택은 E2E가 본다.

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

/** 웹 피커의 연·월·일 select(접근 이름 = home.selectYear 등) */
async function findSelects(
  names: readonly [string, string, string] = ["연도 선택", "월 선택", "일 선택"]
): Promise<[HostElement, HostElement, HostElement]> {
  return [
    await screen.findByLabelText(names[0]),
    await screen.findByLabelText(names[1]),
    await screen.findByLabelText(names[2]),
  ];
}

/** select가 보여 주는 값 세 개(연·월·일). 고르지 않은 칸은 "" */
function selectedValues(selects: readonly HostElement[]): string[] {
  return selects.map((select) => String(propsOf(select).value));
}

/** select의 선택지 표기(option label, 첫 항목 = 고르지 않음 안내) */
function optionLabels(select: HostElement): string[] {
  return select.children.flatMap((option) =>
    typeof option === "string" ? [] : [String(propsOf(option).label)]
  );
}

/** select의 change 이벤트 */
function changeEvent(value: string | number) {
  return { currentTarget: { value: String(value) } };
}

describe("U-32 웹 피커(BirthdatePicker.web) 연·월·일 선택 상자", () => {
  it("U-32 그룹 이름은 '생년월일 (필수)'이고(R4-04), 세 칸 모두 aria-required이며, 선택값 없이 열면 세 칸이 비어 있고 연도는 2026년~2017년 10개(첫 항목 '연도 선택')다. 연·월만 고르면 null, 일까지 고르면 그 IsoDate(2024-03-15)를 onChange로 올린다", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <WebPickerHarness initial={null} onChange={onChange} />
    );
    expect(await screen.findByLabelText("생년월일 (필수)")).toHaveProp(
      "role",
      "group"
    );
    const [year, month, dayOfMonth] = await findSelects();
    for (const select of [year, month, dayOfMonth]) {
      expect(select).toHaveProp("aria-required", true);
    }
    expect(selectedValues([year, month, dayOfMonth])).toEqual(["", "", ""]);
    expect(optionLabels(year)).toEqual([
      "연도 선택",
      "2026년",
      "2025년",
      "2024년",
      "2023년",
      "2022년",
      "2021년",
      "2020년",
      "2019년",
      "2018년",
      "2017년",
    ]);

    await fireEvent(year, "change", changeEvent(2024));
    await fireEvent(month, "change", changeEvent(3));

    expect(onChange.mock.calls).toEqual([[null], [null]]);

    await fireEvent(dayOfMonth, "change", changeEvent(15));

    expect(onChange).toHaveBeenLastCalledWith("2024-03-15");
    expect(selectedValues([year, month, dayOfMonth])).toEqual([
      "2024",
      "3",
      "15",
    ]);
  });

  it("U-32 한 칸을 바꾸면 나머지 칸을 범위 안으로 맞춘다: 2024-01-31에서 2월 → 2024-02-29, 2026년 → 2026-02-28, 12월은 2026년에 없어 선택지가 10월까지다. 연도를 고르지 않음('')으로 되돌리면 null을 올리고 월·일 칸은 그대로 둔다", async () => {
    const onChange = jest.fn();
    await renderWithProviders(
      <WebPickerHarness
        initial={toIsoDate(day("2024-01-31"))}
        onChange={onChange}
      />
    );
    const [year, month, dayOfMonth] = await findSelects();
    expect(selectedValues([year, month, dayOfMonth])).toEqual([
      "2024",
      "1",
      "31",
    ]);
    expect(optionLabels(month)).toHaveLength(13);

    await fireEvent(month, "change", changeEvent(2));

    expect(onChange).toHaveBeenLastCalledWith("2024-02-29");

    await fireEvent(year, "change", changeEvent(2026));

    expect(onChange).toHaveBeenLastCalledWith("2026-02-28");
    expect(optionLabels(month).at(-1)).toBe("10월");

    await fireEvent(year, "change", changeEvent(""));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(selectedValues([year, month, dayOfMonth])).toEqual(["", "2", "28"]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("R2-02 상위가 value를 바꾸면(프리필·초기화) 칸이 새 값을 보여 주고 onChange는 부르지 않는다(changedByParent: 다른 날짜 → 그 날짜, null → 빈 칸)", async () => {
    const onChange = jest.fn();
    // 렌더마다 상위 제어 값(value)만 바뀐다
    const webPicker = (value: IsoDate | null) => (
      <WebBirthdatePicker value={value} onChange={onChange} range={RANGE} />
    );
    const { rerender } = await renderWithProviders(
      webPicker(toIsoDate(day("2024-01-31")))
    );
    const selects = await findSelects();
    expect(selectedValues(selects)).toEqual(["2024", "1", "31"]);

    await rerender(webPicker(toIsoDate(day("2025-05-05"))));

    expect(selectedValues(selects)).toEqual(["2025", "5", "5"]);

    await rerender(webPicker(null));

    expect(selectedValues(selects)).toEqual(["", "", ""]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("U-32 선택지와 이름은 앱 언어를 따른다: 영어면 칸 이름 'Select year'·'Select month'·'Select day', 월은 'January'~'December', 그룹 lang은 'en-US'다", async () => {
    await seedStorage({ [STORAGE_KEYS.locale]: "en" });
    await renderWithProviders(
      <WebPickerHarness initial={null} onChange={jest.fn()} />
    );
    const [year, month, dayOfMonth] = await findSelects([
      "Select year",
      "Select month",
      "Select day",
    ]);
    expect(optionLabels(year).slice(0, 2)).toEqual(["Select year", "2026"]);
    expect(optionLabels(month).slice(1, 3)).toEqual(["January", "February"]);
    expect(optionLabels(month).at(-1)).toBe("December");
    expect(optionLabels(dayOfMonth).at(-1)).toBe("31");
    expect(screen.getByLabelText("Date of birth (Required)")).toHaveProp(
      "lang",
      "en-US"
    );
  });
});
