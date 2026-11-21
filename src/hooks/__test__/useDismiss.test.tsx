import { renderHook } from "@testing-library/react-native";
import type { BlurEvent } from "react-native";

import {
  useEscapeKey as useNativeEscapeKey,
  useFocusLeave as useNativeFocusLeave,
} from "@/hooks/useDismiss";
import {
  useEscapeKey as useWebEscapeKey,
  useFocusLeave as useWebFocusLeave,
} from "@/hooks/useDismiss.web";

import { keyDown } from "../../../test-utils/render";

// 리뷰 R4-01·R4-02·R4-06: 메뉴·확인 단계 닫기 훅(useDismiss). jest(iOS 프리셋)는 '@/hooks/useDismiss'를 네이티브 no-op으로 풀므로
// 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다(같은 폴더의 useToggleKeys.test.tsx와 같은 방식).
// 실제 브라우저의 Escape·Tab 이탈은 e2e/review-r4-a11y.spec.ts가 본다.

/** DOM 요소 흉내: 자기 자신과 children에 든 것만 품는다 */
function fakeNode(children: readonly object[] = []): {
  contains: (other: unknown) => boolean;
} {
  const node = {
    contains: (other: unknown) =>
      other === node || children.includes(other as object),
  };
  return node;
}

/** react-native-web View onBlur가 받는 React focusout 이벤트 흉내(currentTarget = View, relatedTarget = 새 포커스 대상) */
function blurEvent(
  currentTarget: object,
  relatedTarget: object | null
): BlurEvent {
  const base: BlurEvent = {
    bubbles: true,
    cancelable: false,
    currentTarget: 0,
    defaultPrevented: false,
    dispatchConfig: { registrationName: "onBlur" },
    eventPhase: 2,
    isDefaultPrevented: () => false,
    isPropagationStopped: () => false,
    isTrusted: true,
    nativeEvent: { target: 0 },
    persist: () => undefined,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
    target: 0,
    timeStamp: 0,
    type: "blur",
  };
  return Object.assign(base, { currentTarget, relatedTarget });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("R4 Escape 닫기 훅(useEscapeKey)", () => {
  it.each(["Escape", "Esc"])(
    "R4-01 웹: %j keydown은 onEscape를 1번 부르고 preventDefault한다",
    async (key) => {
      const onEscape = jest.fn();
      const { result } = await renderHook(() => useWebEscapeKey(onEscape));
      const escape = keyDown(key);

      result.current.onKeyDown?.(escape.event);

      expect(onEscape).toHaveBeenCalledTimes(1);
      expect(escape.preventDefault).toHaveBeenCalledTimes(1);
    }
  );

  it("R4-01 웹: 다른 키와 Alt·Ctrl·Meta 조합의 Escape는 무시하고 기본 동작도 막지 않는다", async () => {
    const onEscape = jest.fn();
    const { result } = await renderHook(() => useWebEscapeKey(onEscape));
    const events = [
      keyDown("Enter"),
      keyDown(" "),
      keyDown("Escape", { altKey: true }),
      keyDown("Escape", { ctrlKey: true }),
      keyDown("Escape", { metaKey: true }),
    ];

    for (const { event } of events) result.current.onKeyDown?.(event);

    expect(onEscape).not.toHaveBeenCalled();
    for (const { preventDefault } of events) {
      expect(preventDefault).not.toHaveBeenCalled();
    }
  });

  it("R4-01 웹: onEscape가 null(닫을 것이 없음)이면 Escape도 무시한다", async () => {
    const { result } = await renderHook(() => useWebEscapeKey(null));
    const escape = keyDown("Escape");

    result.current.onKeyDown?.(escape.event);

    expect(escape.preventDefault).not.toHaveBeenCalled();
  });

  it("R4-01 네이티브 구현은 props를 더하지 않는다", async () => {
    const { result } = await renderHook(() => useNativeEscapeKey(jest.fn()));
    expect(result.current).toEqual({});
  });
});

describe("R4 포커스 이탈 닫기 훅(useFocusLeave)", () => {
  it("R4-02 웹: 포커스가 View 밖의 요소로 나가면 onLeave(새 대상)를 부른다", async () => {
    const onLeave = jest.fn();
    const { result } = await renderHook(() => useWebFocusLeave(onLeave));
    const outside = fakeNode();

    result.current.onBlur?.(blurEvent(fakeNode(), outside));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenCalledWith(outside);
  });

  it("R4-02 웹: View 안쪽 요소끼리의 이동은 무시한다", async () => {
    const onLeave = jest.fn();
    const { result } = await renderHook(() => useWebFocusLeave(onLeave));
    const inside = fakeNode();

    result.current.onBlur?.(blurEvent(fakeNode([inside]), inside));

    expect(onLeave).not.toHaveBeenCalled();
  });

  it("R4-02 웹: 새 대상이 없을 때 문서가 포커스를 가진 채면(빈 곳 클릭) onLeave(null), 문서가 포커스를 잃었으면(창 전환) 무시한다", async () => {
    const onLeave = jest.fn();
    const { result } = await renderHook(() => useWebFocusLeave(onLeave));
    let hasFocus = true;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: { hasFocus: () => hasFocus },
    });

    result.current.onBlur?.(blurEvent(fakeNode(), null));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(onLeave).toHaveBeenLastCalledWith(null);

    hasFocus = false;
    result.current.onBlur?.(blurEvent(fakeNode(), null));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("R4-02 웹: DOM 필드가 없는 이벤트(document도 없음)는 밖으로 나간 것으로 보고 onLeave(null)를 부른다", async () => {
    const onLeave = jest.fn();
    const { result } = await renderHook(() => useWebFocusLeave(onLeave));
    const event = blurEvent(fakeNode(), null);
    Reflect.deleteProperty(event, "relatedTarget");

    result.current.onBlur?.(event);

    expect(onLeave).toHaveBeenCalledWith(null);
  });

  it("R4-02 네이티브 구현은 props를 더하지 않는다", async () => {
    const { result } = await renderHook(() => useNativeFocusLeave(jest.fn()));
    expect(result.current).toEqual({});
  });
});
