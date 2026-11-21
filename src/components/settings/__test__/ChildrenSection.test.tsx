import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, screen, within } from "@testing-library/react-native";
import { AccessibilityInfo, Platform } from "react-native";

import { ChildrenSection } from "@/components/settings/ChildrenSection";
import { encodeChildren, isChildId } from "@/lib/children";
import { toIsoDate } from "@/lib/date";
import { STORAGE_KEYS } from "@/lib/storage";
import type { ChildId, ChildrenState } from "@/types";

import {
  day,
  describeHost,
  fireLayout,
  flushMacrotask,
  renderWithProviders,
  seedStorage,
  sharedHostFocus,
} from "../../../../test-utils/render";

// 아기 정보: 저장된 아이 목록과 아이별 삭제(FR-16 U-28). v1.6까지의 BabyInfoSection 테스트(R1-03 포커스, V-01 시점, R2-06 결과 고지)를
// 아이별 삭제로 옮겼다. 확인 단계 안의 포커스(열면 확인 문구, 취소하면 그 줄의 삭제 버튼)는 대상이 새로 마운트되므로 네이티브는 onLayout,
// 웹은 커밋 직후다. 삭제 뒤의 포커스(다음·앞 아이의 삭제 버튼 또는 아이 수 문구)는 대상이 그대로 있으므로 둘 다 커밋 직후다.
// 포커스 대상은 describeHost(testID·접근 이름 문자열)로 비교한다. 호스트 객체를 직접 비교하면 실패 diff가 끝나지 않는다.

/** sendAccessibilityEvent 호출 대상 요약 */
function sentTo(
  sendEvent:
    | jest.Mock
    | jest.MockedFunction<typeof AccessibilityInfo.sendAccessibilityEvent>
): string[] {
  return sendEvent.mock.calls.map(
    ([node, type]) => `${describeHost(node)}:${String(type)}`
  );
}

function childId(value: string): ChildId {
  if (!isChildId(value)) throw new Error(`아이 id 형식이 아니다: ${value}`);
  return value;
}

const TWO: ChildrenState = {
  activeId: childId("c1"),
  children: [
    {
      id: childId("c1"),
      name: "첫째",
      birthdate: toIsoDate(day("2024-01-31")),
      completed: ["hepb-1"],
    },
    {
      id: childId("c2"),
      birthdate: toIsoDate(day("2026-04-30")),
      completed: [],
    },
  ],
};

async function renderSection(state: ChildrenState | null = TWO) {
  if (state !== null) {
    await seedStorage({ [STORAGE_KEYS.children]: encodeChildren(state) });
  }
  await renderWithProviders(<ChildrenSection />);
  return screen.findByTestId("settings-children-count");
}

/** 이름표가 label인 줄 */
function rowOf(label: string) {
  const row = screen
    .getAllByTestId("child-row")
    .find(
      (node) =>
        within(node).getByTestId("child-row-label").props.children === label
    );
  if (!row) throw new Error(`줄이 없다: ${label}`);
  return within(row);
}

/** 프리셋 AccessibilityInfo 함수는 jest.fn이라 restoreAllMocks가 기록을 지우지 않으므로 테스트마다 비운다 */
function clearedAccessibilityMocks() {
  const announceWithOptions = jest.mocked(
    AccessibilityInfo.announceForAccessibilityWithOptions
  );
  const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  for (const fn of [announceWithOptions, sendEvent]) fn.mockClear();
  return { announceWithOptions, sendEvent };
}

describe("AC-21.5 [unit] 아이 목록과 삭제 확인", () => {
  it("AC-21.5 [unit] 아이 2명이면 아이 수 '저장된 아이 2명 (최대 10명)'과 이름표 '첫째'·'2026-04-30'(이름 없으면 생년월일) 줄이 있고, 줄마다 삭제 버튼 이름이 '{이름표} 삭제'다", async () => {
    const count = await renderSection();

    expect(count).toHaveTextContent("저장된 아이 2명 (최대 10명)");
    expect(
      screen
        .getAllByTestId("child-row-label")
        .map((node) => node.props.children)
    ).toEqual(["첫째", "2026-04-30"]);
    expect(screen.getByRole("button", { name: "첫째 삭제" })).toBe(
      rowOf("첫째").getByTestId("child-delete")
    );
    expect(screen.getByRole("button", { name: "2026-04-30 삭제" })).toBe(
      rowOf("2026-04-30").getByTestId("child-delete")
    );
  });

  it("AC-21.5 [unit] '첫째 삭제'를 누르면 그 줄만 확인 상자(확인 문구 '첫째 정보를 삭제할까요?'·확인·취소)가 되고, 취소하면 삭제 버튼으로 돌아오며 아무것도 지우지 않는다", async () => {
    await renderSection();

    await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));

    const first = rowOf("첫째");
    expect(first.getByText("첫째 정보를 삭제할까요?")).toBeOnTheScreen();
    expect(first.getByTestId("child-delete-confirm")).toBeOnTheScreen();
    expect(first.queryByTestId("child-delete")).toBeNull();
    expect(rowOf("2026-04-30").getByTestId("child-delete")).toBeOnTheScreen();

    await fireEvent.press(first.getByTestId("child-delete-cancel"));

    expect(first.queryByTestId("child-delete-confirm")).toBeNull();
    expect(first.getByTestId("child-delete")).toBeOnTheScreen();
    await flushMacrotask();
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it("AC-21.5 [unit] 확인을 누르면 그 아이 줄이 사라지고 아이 수가 1명이 되며 저장값에서도 빠지고, 남은 아이까지 지우면 저장 키가 없어진다", async () => {
    const count = await renderSection();

    await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));
    await fireEvent.press(rowOf("첫째").getByTestId("child-delete-confirm"));

    expect(screen.getAllByTestId("child-row")).toHaveLength(1);
    expect(count).toHaveTextContent("저장된 아이 1명 (최대 10명)");
    await flushMacrotask();
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.children);
    expect(stored).not.toContain("첫째");
    expect(stored).not.toContain("c1");

    await fireEvent.press(
      screen.getByRole("button", { name: "2026-04-30 삭제" })
    );
    await fireEvent.press(
      rowOf("2026-04-30").getByTestId("child-delete-confirm")
    );

    expect(screen.queryAllByTestId("child-row")).toHaveLength(0);
    expect(count).toHaveTextContent("저장된 아이 0명 (최대 10명)");
    await flushMacrotask();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.children)).toBeNull();
  });

  it("AC-21.5 [unit] 아이가 없으면 아이 수 '저장된 아이 0명 (최대 10명)'만 있다", async () => {
    const count = await renderSection(null);

    expect(count).toHaveTextContent("저장된 아이 0명 (최대 10명)");
    expect(screen.queryAllByTestId("child-row")).toHaveLength(0);
  });
});

// R1-03·V-01(아이별로 옮김): 확인 상자는 확인 문구로 이름 붙은 role group이다. 네이티브는 대상이 배치된 뒤(onLayout) 화면 낭독기
// 포커스를 옮기고, 웹은 커밋 직후 DOM 포커스를 준다.
describe("R1-03 아이 삭제 확인 단계의 포커스", () => {
  it.each(["ios", "android"] as const)(
    "R1-03·V-01 %s: 열면 확인 문구가 배치된 뒤 그리로, 취소하면 그 줄의 삭제 버튼이 배치된 뒤 그리로 1번씩 옮긴다(첫 렌더·재배치에서는 옮기지 않음)",
    async (os) => {
      await renderSection();
      const { sendEvent } = clearedAccessibilityMocks();
      const replaced = jest.replaceProperty(Platform, "OS", os);
      await fireLayout(rowOf("첫째").getByTestId("child-delete"));
      expect(sendEvent).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));
      // 확인 상자는 확인 문구(nativeID)로 이름 붙은 role group이다(RNTL은 aria-labelledby 이름을 계산하지 않아 연결을 직접 본다)
      const group = rowOf("첫째").getByTestId("child-delete-group");
      const question = within(group).getByTestId("child-delete-question");
      expect(group).toHaveProp("role", "group");
      expect(group.props["aria-labelledby"]).toBe(question.props.nativeID);
      expect(question).toHaveTextContent("첫째 정보를 삭제할까요?");
      expect(sendEvent).not.toHaveBeenCalled();
      await fireLayout(question);
      await fireLayout(question);

      expect(sentTo(sendEvent)).toEqual(["child-delete-question:focus"]);

      await fireEvent.press(rowOf("첫째").getByTestId("child-delete-cancel"));
      await fireLayout(rowOf("첫째").getByTestId("child-delete"));

      expect(sentTo(sendEvent)).toEqual([
        "child-delete-question:focus",
        "child-delete(첫째 삭제):focus",
      ]);
      replaced.restore();
    }
  );

  it("R1-03 웹: 열면 확인 상자(role group, tabIndex -1)에, 취소하면 삭제 버튼에 커밋 직후 focus()를 1번 주고 화면 낭독기 이벤트는 보내지 않는다", async () => {
    const focus = await sharedHostFocus();
    await renderSection();
    const { sendEvent } = clearedAccessibilityMocks();
    const replaced = jest.replaceProperty(Platform, "OS", "web");
    focus.mockClear();

    await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));

    expect(focus.mock.contexts.map(describeHost)).toEqual([
      "child-delete-group",
    ]);

    await fireEvent.press(rowOf("첫째").getByTestId("child-delete-cancel"));
    await fireLayout(rowOf("첫째").getByTestId("child-delete"));

    expect(focus.mock.contexts.map(describeHost)).toEqual([
      "child-delete-group",
      "child-delete(첫째 삭제)",
    ]);
    expect(sendEvent).not.toHaveBeenCalled();
    replaced.restore();
  });
});

// U-28: 확인으로 줄이 사라지면 다음 아이(마지막이면 앞 아이)의 삭제 버튼, 아무도 남지 않으면 아이 수 문구로 포커스를 옮긴다.
// 이 대상들은 다시 마운트되지 않으므로 네이티브도 커밋 직후(effect)에 옮긴다.
describe("U-28 아이를 지운 뒤 포커스", () => {
  it.each(["ios", "android"] as const)(
    "U-28 %s: 첫째를 지우면 다음 아이 '2026-04-30 삭제' 버튼으로, 그 아이까지 지우면 아이 수 문구로 화면 낭독기 포커스를 옮긴다",
    async (os) => {
      await renderSection();
      const { sendEvent } = clearedAccessibilityMocks();
      const replaced = jest.replaceProperty(Platform, "OS", os);

      await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));
      sendEvent.mockClear();
      await fireEvent.press(rowOf("첫째").getByTestId("child-delete-confirm"));

      expect(sentTo(sendEvent)).toEqual([
        "child-delete(2026-04-30 삭제):focus",
      ]);

      await fireEvent.press(
        screen.getByRole("button", { name: "2026-04-30 삭제" })
      );
      sendEvent.mockClear();
      await fireEvent.press(
        rowOf("2026-04-30").getByTestId("child-delete-confirm")
      );

      expect(sentTo(sendEvent)).toEqual(["settings-children-count:focus"]);
      replaced.restore();
    }
  );

  it("U-28 웹: 마지막 줄(2026-04-30)을 지우면 앞 아이 '첫째 삭제' 버튼에 focus()를 준다", async () => {
    const focus = await sharedHostFocus();
    await renderSection();
    const replaced = jest.replaceProperty(Platform, "OS", "web");

    await fireEvent.press(
      screen.getByRole("button", { name: "2026-04-30 삭제" })
    );
    focus.mockClear();
    await fireEvent.press(
      rowOf("2026-04-30").getByTestId("child-delete-confirm")
    );

    expect(focus.mock.contexts.map(describeHost)).toEqual([
      "child-delete(첫째 삭제)",
    ]);
    replaced.restore();
  });
});

// R2-06(아이별로 옮김, WCAG 4.1.3): 아이 수 문구는 polite 라이브 영역이라 삭제 결과(줄어든 수)가 Android·웹에서 스스로 알려진다.
// iOS에는 라이브 영역이 없어 같은 문구를 queue 고지로 보낸다(포커스를 옮긴 뒤).
describe("R2-06 아이 삭제 결과 고지", () => {
  it("R2-06 아이 수 문구는 polite 라이브 영역이고 iOS에서는 확인 뒤 줄어든 수 '저장된 아이 1명 (최대 10명)'을 포커스 이동 다음에 queue로 1번 알린다", async () => {
    const count = await renderSection();
    expect(within(count).getByText("저장된 아이 2명 (최대 10명)")).toHaveProp(
      "accessibilityLiveRegion",
      "polite"
    );
    const { announceWithOptions, sendEvent } = clearedAccessibilityMocks();
    const replaced = jest.replaceProperty(Platform, "OS", "ios");

    await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));
    expect(announceWithOptions).not.toHaveBeenCalled();
    sendEvent.mockClear();
    await fireEvent.press(rowOf("첫째").getByTestId("child-delete-confirm"));

    expect(announceWithOptions).toHaveBeenCalledTimes(1);
    expect(announceWithOptions).toHaveBeenCalledWith(
      "저장된 아이 1명 (최대 10명)",
      { queue: true }
    );
    expect(sendEvent.mock.invocationCallOrder[0]).toBeLessThan(
      announceWithOptions.mock.invocationCallOrder[0] ?? 0
    );
    replaced.restore();
  });

  it.each(["android", "web"] as const)(
    "R2-06 %s에서는 라이브 영역이 알리므로 announceForAccessibility 계열을 부르지 않는다",
    async (os) => {
      await renderSection();
      const { announceWithOptions } = clearedAccessibilityMocks();
      const replaced = jest.replaceProperty(Platform, "OS", os);

      await fireEvent.press(screen.getByRole("button", { name: "첫째 삭제" }));
      await fireEvent.press(rowOf("첫째").getByTestId("child-delete-confirm"));

      expect(announceWithOptions).not.toHaveBeenCalled();
      replaced.restore();
    }
  );
});
