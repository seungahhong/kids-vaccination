import type { PressableProps } from "react-native";

// 켜고 끄는 컨트롤의 키보드 조작 훅 공통 계약(U-22·U-23, WAI-ARIA APG 체크박스·스위치 패턴: Space로 상태를 뒤집는다).
// 대상은 일정 카드의 완료 체크박스(role="checkbox")와 헤더 테마 스위치(role="switch") Pressable이다. react-native-web 0.21의 Pressable은 Space를
// role="button"에서만 onPress로 바꾸므로(Enter는 모든 role에서 onPress) 웹(useToggleKeys.web.ts)이 Space를 직접 처리하고,
// 네이티브(useToggleKeys.ts)는 아무 props도 더하지 않는다. 두 구현이 이 타입을 따르므로 tsc가 웹 구현도
// 같은 계약으로 검사한다(useRovingFocus.types.ts와 같은 방식, 설계서 §7.1 플랫폼 확장자 분기).

/** 체크박스·스위치 Pressable에 펼쳐 넣는 props. 이름과 타입은 RN 0.88 PressableProps 그대로다 */
export type ToggleKeyProps = Pick<PressableProps, "onKeyDown">;

/** Space를 누르면 onToggle을 부르는 props를 만든다 */
export type UseToggleKeys = (onToggle: () => void) => ToggleKeyProps;
