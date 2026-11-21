import {
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react-native";
import { Pressable } from "react-native";

import { useToggleKeys as useNativeCheckboxKeys } from "@/hooks/useToggleKeys";
import { useToggleKeys as useWebCheckboxKeys } from "@/hooks/useToggleKeys.web";

import { keyDown } from "../../../test-utils/render";

// U-22·U-23: 완료 체크박스·헤더 테마 스위치 키보드 조작 훅(useToggleKeys). jest(iOS 프리셋)는 '@/hooks/useToggleKeys'를 네이티브 no-op으로 풀므로
// 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다(같은 폴더의 useRovingFocus.test.tsx와 같은 방식).
// 실제 브라우저의 Space·Enter·포커스 이동은 e2e/schedule.spec.ts(AC-19.9)가 본다.

/** 웹 키 훅을 단 체크박스 하나 */
function WebCheckbox({ onToggle }: { readonly onToggle: () => void }) {
  const keys = useWebCheckboxKeys(onToggle);
  return (
    <Pressable
      testID="checkbox"
      role="checkbox"
      aria-checked={false}
      onPress={onToggle}
      {...keys}
    />
  );
}

async function renderCheckbox() {
  const onToggle = jest.fn();
  await render(<WebCheckbox onToggle={onToggle} />);
  return { onToggle, checkbox: screen.getByTestId("checkbox") };
}

describe("U-22 체크박스 키 훅(useToggleKeys)", () => {
  it.each([" ", "Spacebar"])(
    "U-22 웹: Space(%j) keydown은 onToggle을 1번 부르고 preventDefault로 페이지 스크롤을 막는다",
    async (key) => {
      const { onToggle, checkbox } = await renderCheckbox();
      const space = keyDown(key);

      await fireEvent(checkbox, "keyDown", space.event);

      expect(onToggle).toHaveBeenCalledTimes(1);
      expect(space.preventDefault).toHaveBeenCalledTimes(1);
    }
  );

  it("U-22 웹: Space를 누르고 있어 반복되는 keydown(repeat)은 스크롤만 막고 다시 뒤집지 않는다", async () => {
    const { onToggle, checkbox } = await renderCheckbox();
    const repeated = keyDown(" ", { repeat: true });

    await fireEvent(checkbox, "keyDown", repeated.event);

    expect(onToggle).not.toHaveBeenCalled();
    expect(repeated.preventDefault).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Enter", {}],
    ["a", {}],
    [" ", { altKey: true }],
    [" ", { ctrlKey: true }],
    [" ", { metaKey: true }],
  ] as const)(
    "U-22 웹: %j(%j)는 건드리지 않는다(Enter는 Pressable onPress, 조합 키는 브라우저·보조기기 몫)",
    async (key, modifiers) => {
      const { onToggle, checkbox } = await renderCheckbox();
      const other = keyDown(key, modifiers);

      await fireEvent(checkbox, "keyDown", other.event);

      expect(onToggle).not.toHaveBeenCalled();
      expect(other.preventDefault).not.toHaveBeenCalled();
    }
  );

  it("U-22 웹: onToggle이 같으면 같은 props 객체를 돌려준다(useMemo)", async () => {
    const onToggle = jest.fn();
    const { result, rerender } = await renderHook(() =>
      useWebCheckboxKeys(onToggle)
    );
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
  });

  it("U-22 네이티브: 아무 props도 더하지 않는다(화면 낭독기·하드웨어 키는 onPress)", async () => {
    const { result } = await renderHook(() => useNativeCheckboxKeys(jest.fn()));

    expect(result.current).toEqual({});
  });
});
