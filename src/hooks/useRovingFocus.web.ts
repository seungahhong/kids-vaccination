import { type RefCallback, useRef } from "react";
import type { KeyDownEvent, PressableInstance } from "react-native";

import type { UseRovingFocus } from "./useRovingFocus.types";

// 선택 그룹 키보드 조작의 웹 구현(리뷰 R1-04, WAI-ARIA APG 라디오 그룹·탭 패턴). Metro는 웹 번들에서 이 .web.ts를 고르고,
// iOS·Android와 jest는 같은 이름의 .ts(no-op)를 쓴다(설계서 §7.1 플랫폼 확장자 분기).
// react-native-web 0.21의 Pressable은 Space를 role="button"에서만 onPress로 바꾸므로 radio·tab은 Space로 고를 수 없고
// 방향키 이동도 없다. 그래서 항목마다 다음을 준다.
//   tabIndex  : 선택 항목만 0, 나머지 -1(roving tabindex — Tab은 그룹에서 한 번만 멈춘다)
//   onKeyDown : Space는 그 항목을, →·↓는 다음, ←·↑는 이전(끝에서 반대쪽 끝으로 순환), Home·End는 처음·마지막 항목을
//               고르고 그 항목으로 포커스를 옮긴다. 가로 탭 목록(orientation "horizontal")은 ←·→만 쓰고 ↑·↓는 페이지 스크롤에
//               남긴다. 처리한 키는 preventDefault로 페이지 스크롤을 막는다.
//               Alt·Ctrl·Meta 조합과 그 밖의 키(Enter 포함 — 항목의 onPress가 맡음)는 건드리지 않는다.
// 이동과 동시에 고르는 것은 APG 라디오 그룹 규칙이고, 필터 탭도 패널이 즉시 바뀌므로 "자동 활성화" 방식을 쓴다.

type Orientation = "both" | "horizontal";

const SPACE_KEYS: ReadonlySet<string> = new Set([" ", "Spacebar"]);

/** 방향키 → 이동 칸 수와 세로 축 여부 */
const ARROWS: Readonly<
  Record<string, { readonly step: 1 | -1; readonly vertical: boolean }>
> = {
  ArrowRight: { step: 1, vertical: false },
  ArrowDown: { step: 1, vertical: true },
  ArrowLeft: { step: -1, vertical: false },
  ArrowUp: { step: -1, vertical: true },
};

/** 키에 따라 고를 항목의 위치. 처리하지 않는 키면 null */
function targetIndex(
  key: string,
  index: number,
  count: number,
  orientation: Orientation
): number | null {
  if (SPACE_KEYS.has(key)) return index;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  const arrow = ARROWS[key];
  if (arrow === undefined) return null;
  if (arrow.vertical && orientation === "horizontal") return null;
  return (index + arrow.step + count) % count;
}

/** 웹에서 선택 그룹 항목에 roving tabindex와 Space·방향키·Home·End 조작을 준다 */
export const useRovingFocus: UseRovingFocus = ({
  values,
  selected,
  onSelect,
  orientation = "both",
}) => {
  // 항목 값 → DOM 요소. 방향키로 옮겨 간 항목에 focus()를 주려고 ref 콜백으로 모은다(렌더 중에는 읽지 않는다)
  const nodes = useRef(new Map<string, PressableInstance>());
  // 선택값이 목록에 없으면 첫 항목을 Tab 정지점으로 둬 그룹이 Tab 순서에서 사라지지 않게 한다
  const tabStop = values.includes(selected) ? selected : values[0];

  return (value) => {
    const setNode: RefCallback<PressableInstance> = (node) => {
      if (node === null) nodes.current.delete(value);
      else nodes.current.set(value, node);
    };
    const handleKeyDown = (event: KeyDownEvent): void => {
      const { key, altKey, ctrlKey, metaKey } = event.nativeEvent;
      if (altKey || ctrlKey || metaKey) return;
      const next = targetIndex(
        key,
        values.indexOf(value),
        values.length,
        orientation
      );
      const target = next === null ? undefined : values[next];
      if (target === undefined) return;
      event.preventDefault();
      onSelect(target);
      if (target !== value) nodes.current.get(target)?.focus();
    };

    return {
      tabIndex: value === tabStop ? 0 : -1,
      onKeyDown: handleKeyDown,
      ref: setNode,
    };
  };
};
