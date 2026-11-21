import { AccessibilityInfo, type HostInstance, Platform } from "react-native";

// 포커스 이동 공용 함수(리뷰 R1-03 BabyInfoSection에서 분리, 일정 완료 체크 U-22가 함께 쓴다).
// 웹은 DOM 포커스(focus()), 네이티브는 화면 낭독기 포커스를 옮긴다. 네이티브 API는 RN 0.88에서 deprecated된
// AccessibilityInfo.setAccessibilityFocus(reactTag) 대신 그 대체 API인 sendAccessibilityEvent(node, 'focus')다.
// 시점은 호출하는 쪽이 정한다(V-01): 그 커밋에서 새로 마운트된 네이티브 대상은 effect가 아니라 대상의 onLayout에서 부른다.
// Platform.OS는 호출 시점에 읽는다(jest replaceProperty로 웹 분기를 검증, 설계서 §7.1).

/** 대상으로 포커스를 옮긴다. 대상이 없으면(ref 미연결 null, 등록 안 된 id undefined) 아무것도 하지 않는다 */
export function moveFocus(node: HostInstance | null | undefined): void {
  if (!node) return;
  if (Platform.OS === "web") node.focus();
  else AccessibilityInfo.sendAccessibilityEvent(node, "focus");
}
