import { useCallback, useMemo } from "react";
import type { BlurEvent, KeyDownEvent } from "react-native";

import type { UseEscapeKey, UseFocusLeave } from "./useDismiss.types";

// 메뉴·확인 단계 닫기 훅의 웹 구현(리뷰 R4-01·R4-02·R4-06). Metro는 웹 번들에서 이 .web.ts를 고르고, iOS·Android와 jest는
// 같은 이름의 .ts(no-op)를 쓴다(설계서 §7.1 플랫폼 확장자 분기).
// - Escape: keydown이 이 View 안(또는 View 자신)에서 일어나면 onEscape를 부르고 preventDefault한다. Alt·Ctrl·Meta 조합은 건드리지
//   않는다(useToggleKeys.web.ts와 같은 규칙). 펼친 <select> 목록 안의 Escape는 브라우저가 목록을 닫는 데 쓰고 페이지로 오지 않는다.
// - 포커스 이탈: react-native-web View의 onBlur는 React DOM의 focusout(하위 요소에서도 올라옴)이다. 새 포커스 대상(relatedTarget)이
//   이 View 안이면 안쪽 이동이라 무시하고, 밖이면 onLeave(새 대상)를 부른다. 새 대상이 없고 문서도 포커스를 잃었으면(창 전환) 무시한다.
//   RN 타입의 BlurEvent에는 DOM 필드가 없어 이벤트 객체에서 이름으로 꺼낸다(타입 단언 없음).

const ESCAPE_KEYS: ReadonlySet<string> = new Set(["Escape", "Esc"]);

/** 이벤트 객체의 DOM 필드(currentTarget·relatedTarget). 없으면 null */
function eventField(
  event: object,
  name: "currentTarget" | "relatedTarget"
): unknown {
  return name in event ? (Reflect.get(event, name) ?? null) : null;
}

/** container(DOM 요소)가 next를 하위에 품고 있는지. jest처럼 DOM이 없는 환경에서도 throw하지 않는다 */
function containsNode(container: unknown, next: unknown): boolean {
  if (next === null || typeof container !== "object" || container === null) {
    return false;
  }
  return (
    "contains" in container &&
    typeof container.contains === "function" &&
    container.contains(next) === true
  );
}

/** 창(문서)이 포커스를 잃었는지. 문서가 없으면 false */
function documentLostFocus(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.hasFocus === "function" &&
    !document.hasFocus()
  );
}

/** 웹에서 Escape로 메뉴·확인 단계를 닫는다 */
export const useEscapeKey: UseEscapeKey = (onEscape) => {
  const onKeyDown = useCallback(
    (event: KeyDownEvent): void => {
      if (onEscape === null) return;
      const { key, altKey, ctrlKey, metaKey } = event.nativeEvent;
      if (altKey || ctrlKey || metaKey || !ESCAPE_KEYS.has(key)) return;
      event.preventDefault();
      onEscape();
    },
    [onEscape]
  );

  return useMemo(() => ({ onKeyDown }), [onKeyDown]);
};

/** 웹에서 포커스가 이 View 밖으로 나가면 onLeave를 부른다 */
export const useFocusLeave: UseFocusLeave = (onLeave) => {
  const onBlur = useCallback(
    (event: BlurEvent): void => {
      const next = eventField(event, "relatedTarget");
      if (containsNode(eventField(event, "currentTarget"), next)) return;
      if (next === null && documentLostFocus()) return;
      onLeave(next);
    },
    [onLeave]
  );

  return useMemo(() => ({ onBlur }), [onBlur]);
};
