// 떠난 탭 화면 비활성화 훅의 공통 계약(리뷰 R2-01, WCAG 2.4.3·2.4.7·4.1.2).
// 화면 셸(Screen)이 최외곽 View에 이 props를 준다. 웹(useBlurInert.web.ts)은 포커스되지 않은 탭 화면이면 inert를 주고,
// 네이티브(useBlurInert.ts)는 아무 props도 더하지 않는다. 두 구현이 이 타입을 따르므로 tsc가 웹 구현도 같은 계약으로
// 검사한다(useRovingFocus.types.ts와 같은 방식, 설계서 §7.1 플랫폼 확장자 분기).

/**
 * 화면 셸 최외곽 View에 펼쳐 넣는 props. inert는 RN 0.88 View 타입에 없지만 react-native-web View가 DOM 속성으로 넘긴다
 * (forwardedProps의 inert). inert 하위는 Tab 순서·focus()·클릭·접근성 트리에서 빠지고, 화면 state는 그대로 남는다.
 */
export type BlurInertProps = { readonly inert?: boolean };

/** 지금 화면(탭)이 포커스되지 않았으면 그 화면을 비활성(inert)으로 만드는 props를 돌려준다 */
export type UseBlurInert = () => BlurInertProps;
