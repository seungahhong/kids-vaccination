import { useIsFocused } from "expo-router";

import type { BlurInertProps, UseBlurInert } from "./useBlurInert.types";

// 떠난 탭 화면 비활성화의 웹 구현(리뷰 R2-01). Metro는 웹 번들에서 이 .web.ts를 고르고, iOS·Android와 jest는
// 같은 이름의 .ts(no-op)를 쓴다(설계서 §7.1 플랫폼 확장자 분기).
// 웹에서는 react-native-screens가 꺼져 있어(지원 플랫폼은 ios·android·windows) 하단 탭이 떠난 화면을 활성 화면 뒤에
// absoluteFill + zIndex −1로 남기고 조상에 aria-hidden만 붙인다. aria-hidden은 Tab 순서를 바꾸지 않으므로 보이지 않는
// 버튼에 키보드 포커스가 닿고 Enter로 실행됐다(생년월일 삭제까지). 포커스되지 않은 화면에 inert를 주면 그 하위는
// Tab 순서·focus()·클릭·접근성 트리에서 빠진다. 화면을 언마운트하지 않으므로 필터·펼침 같은 화면 state는 그대로 남는다.
// 포커스 여부는 expo-router의 useIsFocused(내비게이터가 탭 화면마다 주는 문맥)로 읽는다. 문맥 밖에서는 throw하므로
// 탭 화면 안에서만 렌더되는 화면 셸(Screen)이 부른다.

const ACTIVE: BlurInertProps = { inert: false };
const INERT: BlurInertProps = { inert: true };

/** 포커스되지 않은(떠난) 탭 화면이면 inert를 준다 */
export const useBlurInert: UseBlurInert = () =>
  useIsFocused() ? ACTIVE : INERT;
