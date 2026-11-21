import type { ViewProps } from "react-native";

// 펼친 메뉴·확인 단계를 닫는 키보드·포커스 훅의 공통 계약(리뷰 R4-01·R4-02·R4-06, WAI-ARIA APG disclosure·menu·dialog 패턴).
// - useEscapeKey: Escape로 닫는다. 대상은 헤더 언어·아이 추가 메뉴와 설정의 아이 삭제 확인 단계다.
// - useFocusLeave: 키보드 포커스가 메뉴 층 밖으로 나가면 닫는다. 열린 아이 추가 메뉴 뒤에서 Tab이 메뉴 아래에 가려진 본문 컨트롤로
//   넘어가 포커스가 보이지 않던 문제(WCAG 2.4.7)를 막는다.
// 웹(useDismiss.web.ts)만 이 props를 채우고, 네이티브(useDismiss.ts)는 아무것도 더하지 않는다. iOS·Android 화면 낭독기는 문지르기
// (Z 제스처·뒤로)로 닫고, 포커스가 메뉴 밖으로 나가는 Tab 개념이 없기 때문이다. 두 구현이 이 타입을 따르므로 tsc가 웹 구현도
// 같은 계약으로 검사한다(useToggleKeys.types.ts와 같은 방식, 설계서 §7.1 플랫폼 확장자 분기).

/** 메뉴 층·확인 상자 View에 펼쳐 넣는 props. 이름과 타입은 RN 0.88 ViewProps 그대로다 */
export type EscapeKeyProps = Pick<ViewProps, "onKeyDown">;
export type FocusLeaveProps = Pick<ViewProps, "onBlur">;

/** Escape를 누르면 onEscape를 부른다. null이면(닫을 것이 없으면) 아무것도 하지 않는다 */
export type UseEscapeKey = (onEscape: (() => void) | null) => EscapeKeyProps;

/**
 * 포커스가 이 View 밖으로 나가면 onLeave(새 포커스 대상, 없으면 null)를 부른다. 안쪽 요소끼리의 이동과
 * 창 자체가 포커스를 잃은 경우(다른 앱·탭으로 전환)는 무시한다
 */
export type UseFocusLeave = (
  onLeave: (next: unknown) => void
) => FocusLeaveProps;
