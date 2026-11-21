import { useIsFocused } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import type {
  RequestTitleFocus,
  UseScreenDocument,
} from "./useScreenDocument.types";

// 화면 단위 문서 상태 훅의 웹 구현(리뷰 R4-03). Metro는 웹 번들에서 이 .web.ts를 고르고, iOS·Android와 jest는 같은 이름의
// .ts(no-op)를 쓴다(설계서 §7.1 플랫폼 확장자 분기). 포커스 여부는 useBlurInert.web.ts와 같이 expo-router의 useIsFocused로 읽는다.
// - 제목: 보이는 화면이 될 때와 제목(언어)이 바뀔 때 document.title을 둔다. <html lang>은 useDocumentLanguage가 맡는다.
// - 제목 포커스 요청: requestTitleFocus(화면)는 대기 목록에 넣고, 그 화면이 마운트돼 있으면 다시 렌더하게 깨운다. 화면은 커밋 뒤
//   effect에서(보이는 화면일 때만) 첫 h1에 tabindex -1을 주고 포커스한다(Tab 순서에는 들어가지 않음). 아직 마운트되지 않은 화면(첫 방문
//   전의 일정 탭)은 마운트 때 대기 목록을 보고 옮긴다. 요청은 한 번 쓰면 지운다.
// DOM 타입 검사는 instanceof 대신 필드로 한다: jest(DOM 없음)에서 가짜 객체로 검증하기 위해서다.

/** 제목 포커스를 기다리는 화면 */
const pendingScreens = new Set<string>();
/** 마운트된 화면을 다시 렌더하게 깨우는 함수 */
const wakers = new Map<string, () => void>();

/** 포커스를 받을 수 있는 DOM 요소 흉내 */
type Focusable = {
  setAttribute: (name: string, value: string) => void;
  focus: () => void;
};

function isFocusable(value: unknown): value is Focusable {
  return (
    typeof value === "object" &&
    value !== null &&
    "setAttribute" in value &&
    typeof value.setAttribute === "function" &&
    "focus" in value &&
    typeof value.focus === "function"
  );
}

/** frame 안의 첫 h1. 없거나 DOM 요소가 아니면 null */
function headingIn(frame: unknown): Focusable | null {
  if (
    typeof frame !== "object" ||
    frame === null ||
    !("querySelector" in frame) ||
    typeof frame.querySelector !== "function"
  ) {
    return null;
  }
  const heading: unknown = frame.querySelector("h1");
  return isFocusable(heading) ? heading : null;
}

/** screen 화면이 보이게 된 뒤 그 화면 제목으로 포커스를 옮기도록 요청한다 */
export const requestTitleFocus: RequestTitleFocus = (screen) => {
  pendingScreens.add(screen);
  wakers.get(screen)?.();
};

/** 보이는 화면의 제목을 문서 제목으로 두고, 요청이 있으면 화면 제목으로 포커스를 옮긴다 */
export const useScreenDocument: UseScreenDocument = ({
  screen,
  frameRef,
  title,
}) => {
  const focused = useIsFocused();
  const [wake, setWake] = useState(0);

  const wakeUp = useCallback(() => setWake((count) => count + 1), []);

  useEffect(() => {
    wakers.set(screen, wakeUp);
    return () => {
      if (wakers.get(screen) === wakeUp) wakers.delete(screen);
    };
  }, [screen, wakeUp]);

  useEffect(() => {
    if (focused) document.title = title;
  }, [focused, title]);

  useEffect(() => {
    if (!focused || !pendingScreens.has(screen)) return;
    pendingScreens.delete(screen);
    const heading = headingIn(frameRef.current);
    if (heading === null) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus();
  }, [focused, wake, screen, frameRef]);
};
