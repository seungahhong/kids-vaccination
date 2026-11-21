import { useCallback, useMemo } from "react";
import type { KeyDownEvent } from "react-native";

import type { UseToggleKeys } from "./useToggleKeys.types";

// 체크박스·스위치 키보드 조작의 웹 구현(U-22·U-23, WAI-ARIA APG 체크박스·스위치 패턴). Metro는 웹 번들에서 이 .web.ts를 고르고,
// iOS·Android와 jest는 같은 이름의 .ts(no-op)를 쓴다(설계서 §7.1 플랫폼 확장자 분기).
// react-native-web 0.21의 Pressable은 Space를 role="button"에서만 onPress로 바꾸므로 role="checkbox"·"switch"는 Space로 뒤집히지 않는다.
// 그래서 Space keydown에서 onToggle을 부르고 preventDefault로 페이지 스크롤을 막는다. 키를 누르고 있어 반복되는
// keydown(repeat)은 스크롤만 막고 다시 뒤집지 않는다(누를 때마다 한 번). Enter는 Pressable의 onPress가 맡고,
// Alt·Ctrl·Meta 조합과 그 밖의 키는 건드리지 않는다(useRovingFocus.web.ts와 같은 규칙).

const SPACE_KEYS: ReadonlySet<string> = new Set([" ", "Spacebar"]);

/** 웹에서 체크박스·스위치가 Space로 뒤집히게 한다 */
export const useToggleKeys: UseToggleKeys = (onToggle) => {
  const onKeyDown = useCallback(
    (event: KeyDownEvent): void => {
      const { key, altKey, ctrlKey, metaKey, repeat } = event.nativeEvent;
      if (altKey || ctrlKey || metaKey || !SPACE_KEYS.has(key)) return;
      event.preventDefault();
      if (repeat !== true) onToggle();
    },
    [onToggle]
  );

  return useMemo(() => ({ onKeyDown }), [onKeyDown]);
};
