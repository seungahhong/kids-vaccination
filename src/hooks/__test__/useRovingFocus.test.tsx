import {
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { Pressable, View } from "react-native";

import { useRovingFocus as useNativeRovingFocus } from "@/hooks/useRovingFocus";
import { useRovingFocus as useWebRovingFocus } from "@/hooks/useRovingFocus.web";

import {
  hostWithProps,
  keyDown,
  openSettings,
  sharedHostFocus,
} from "../../../test-utils/render";

// 리뷰 라운드 1 회귀 테스트(그룹 B). 제목은 리뷰 ID(R1-xx)로 시작한다(AC 집계 ^AC-와 섞이지 않음).
// 라운드 2 리뷰 R2-04·U-08: app/(tabs)/__test__/settings.test.tsx에 있던 훅 테스트 8건과 전용 헬퍼를 대상 훅 옆으로 옮겼다
// (테스트 이름·단언 그대로). 설정 화면 테스트와 함께 쓰는 헬퍼(openSettings·hostWithProps·sharedHostFocus)는 test-utils에 있다.

// R1-04: 선택 그룹 키보드 조작 훅(useRovingFocus). jest(iOS 프리셋)는 '@/hooks/useRovingFocus'를 네이티브 no-op으로 풀므로
// 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다(같은 폴더의 useDocumentLanguage.test.tsx와 같은 방식).
// 실제 브라우저의 Space·방향키·Tab 순서는 e2e/review-r1-a11y.spec.ts가 본다.
const ROVING_VALUES = ["system", "light", "dark"] as const;
type RovingValue = (typeof ROVING_VALUES)[number];

/** 웹 roving 훅을 쓰는 radio 묶음. 화면처럼 선택 state를 부모가 들고, 고를 때마다 onSelect에도 알린다 */
function WebRovingGroup({
  initial,
  values = ROVING_VALUES,
  orientation,
  onSelect,
}: {
  readonly initial: RovingValue;
  readonly values?: readonly RovingValue[];
  readonly orientation?: "horizontal";
  readonly onSelect: (next: RovingValue) => void;
}): ReactElement {
  const [selected, setSelected] = useState<RovingValue>(initial);
  const itemProps = useWebRovingFocus({
    values,
    selected,
    orientation,
    onSelect: (next) => {
      onSelect(next);
      setSelected(next);
    },
  });

  return (
    <View role="radiogroup">
      {values.map((value) => (
        <Pressable
          key={value}
          {...itemProps(value)}
          testID={`roving-${value}`}
          role="radio"
          aria-checked={value === selected}
        />
      ))}
    </View>
  );
}

/** WebRovingGroup 항목의 tabIndex(문서 순서) */
function rovingTabIndexes(): unknown[] {
  return ROVING_VALUES.map(
    (value) => screen.getByTestId(`roving-${value}`).props.tabIndex
  );
}

describe("R1-04 웹 roving 훅(useRovingFocus.web): Space·방향키 선택과 roving tabindex", () => {
  it("R1-04 선택된 항목만 tabIndex 0이고 나머지는 -1이라 Tab은 그룹에서 한 번만 멈추며, 선택이 바뀌면 tabIndex 0도 따라간다", async () => {
    await render(<WebRovingGroup initial="light" onSelect={jest.fn()} />);

    expect(rovingTabIndexes()).toEqual([-1, 0, -1]);

    await fireEvent(
      screen.getByTestId("roving-light"),
      "keyDown",
      keyDown("ArrowRight").event
    );

    expect(rovingTabIndexes()).toEqual([-1, -1, 0]);
    expect(screen.getByTestId("roving-dark")).toBeChecked();
  });

  it("R1-04 Space(' '·'Spacebar')는 키를 받은 항목을 고르고 기본 동작(페이지 스크롤)을 막는다", async () => {
    const onSelect = jest.fn();
    await render(<WebRovingGroup initial="system" onSelect={onSelect} />);

    const space = keyDown(" ");
    await fireEvent(screen.getByTestId("roving-dark"), "keyDown", space.event);

    expect(onSelect).toHaveBeenLastCalledWith("dark");
    expect(space.preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("roving-dark")).toBeChecked();

    const legacySpace = keyDown("Spacebar");
    await fireEvent(
      screen.getByTestId("roving-light"),
      "keyDown",
      legacySpace.event
    );

    expect(onSelect).toHaveBeenLastCalledWith("light");
    expect(legacySpace.preventDefault).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("roving-light")).toBeChecked();
  });

  it("R1-04 ArrowRight·ArrowDown은 다음, ArrowLeft·ArrowUp은 이전 항목을 고르고 그 항목에 focus()를 주며, 끝에서는 반대쪽 끝으로 순환하고 기본 동작을 막는다", async () => {
    const focus = await sharedHostFocus();
    const onSelect = jest.fn();
    await render(<WebRovingGroup initial="system" onSelect={onSelect} />);
    const steps = [
      ["system", "ArrowRight", "light"],
      ["light", "ArrowDown", "dark"],
      ["dark", "ArrowRight", "system"],
      ["system", "ArrowLeft", "dark"],
      ["dark", "ArrowUp", "light"],
    ] as const;

    for (const [from, key, expected] of steps) {
      const { event, preventDefault } = keyDown(key);
      await fireEvent(screen.getByTestId(`roving-${from}`), "keyDown", event);

      expect([key, onSelect.mock.lastCall]).toEqual([key, [expected]]);
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(focus.mock.contexts.at(-1)).toEqual(
        hostWithProps({ testID: `roving-${expected}` })
      );
      expect(screen.getByTestId(`roving-${expected}`)).toBeChecked();
    }
    expect(focus).toHaveBeenCalledTimes(steps.length);
  });

  it("R1-04 Home·End는 처음·마지막 항목을 고르고 그 항목에 focus()를 준다", async () => {
    const focus = await sharedHostFocus();
    const onSelect = jest.fn();
    await render(<WebRovingGroup initial="light" onSelect={onSelect} />);

    const end = keyDown("End");
    await fireEvent(screen.getByTestId("roving-light"), "keyDown", end.event);

    expect(onSelect).toHaveBeenLastCalledWith("dark");
    expect(end.preventDefault).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts.at(-1)).toEqual(
      hostWithProps({ testID: "roving-dark" })
    );

    const home = keyDown("Home");
    await fireEvent(screen.getByTestId("roving-dark"), "keyDown", home.event);

    expect(onSelect).toHaveBeenLastCalledWith("system");
    expect(home.preventDefault).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts.at(-1)).toEqual(
      hostWithProps({ testID: "roving-system" })
    );
  });

  it("R1-04 Alt·Ctrl·Meta 조합과 그 밖의 키(Enter·Tab·문자)는 처리하지 않아 선택·focus()·preventDefault가 없다(Enter·클릭은 항목의 onPress가 맡는다)", async () => {
    const focus = await sharedHostFocus();
    const onSelect = jest.fn();
    await render(<WebRovingGroup initial="system" onSelect={onSelect} />);
    expect(rovingTabIndexes()).toEqual([0, -1, -1]);

    const ignored = [
      keyDown("ArrowRight", { altKey: true }),
      keyDown(" ", { ctrlKey: true }),
      keyDown("End", { metaKey: true }),
      keyDown("Enter"),
      keyDown("Tab"),
      keyDown("a"),
    ];
    for (const { event, preventDefault } of ignored) {
      await fireEvent(screen.getByTestId("roving-system"), "keyDown", event);
      expect([event.nativeEvent.key, preventDefault.mock.calls]).toEqual([
        event.nativeEvent.key,
        [],
      ]);
    }

    expect(onSelect).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(rovingTabIndexes()).toEqual([0, -1, -1]);
  });

  it("R1-04 orientation 'horizontal'(가로 탭 목록)은 ←·→만 처리하고 ↑·↓는 선택·preventDefault 없이 두어 페이지 스크롤을 막지 않는다", async () => {
    const onSelect = jest.fn();
    await render(
      <WebRovingGroup
        initial="light"
        orientation="horizontal"
        onSelect={onSelect}
      />
    );

    for (const key of ["ArrowDown", "ArrowUp"]) {
      const { event, preventDefault } = keyDown(key);
      await fireEvent(screen.getByTestId("roving-light"), "keyDown", event);
      expect([key, preventDefault.mock.calls]).toEqual([key, []]);
    }
    expect(onSelect).not.toHaveBeenCalled();

    const right = keyDown("ArrowRight");
    await fireEvent(screen.getByTestId("roving-light"), "keyDown", right.event);

    expect(onSelect).toHaveBeenLastCalledWith("dark");
    expect(right.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("R1-04 선택값이 values에 없으면 첫 항목이 tabIndex 0이라 그룹이 Tab 순서에서 사라지지 않는다", async () => {
    await render(
      <WebRovingGroup
        initial="system"
        values={["light", "dark"]}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByTestId("roving-light")).toHaveProp("tabIndex", 0);
    expect(screen.getByTestId("roving-dark")).toHaveProp("tabIndex", -1);
  });

  it("R1-04 네이티브 구현(no-op)은 항목 props를 더하지 않아 설정 화면의 테마·언어 옵션에 tabIndex·onKeyDown이 없다", async () => {
    const { result } = await renderHook(() =>
      useNativeRovingFocus({
        values: ROVING_VALUES,
        selected: "light",
        onSelect: jest.fn(),
      })
    );
    expect(result.current("light")).toEqual({});
    expect(result.current("dark")).toEqual({});

    const { settings } = await openSettings();

    for (const option of settings.getAllByTestId(/^(theme|locale)-option-/)) {
      expect(option).not.toHaveProp("tabIndex");
      expect(option).not.toHaveProp("onKeyDown");
    }
  });
});
