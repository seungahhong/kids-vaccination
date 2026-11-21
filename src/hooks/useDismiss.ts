import type {
  EscapeKeyProps,
  FocusLeaveProps,
  UseEscapeKey,
  UseFocusLeave,
} from "./useDismiss.types";

// 메뉴·확인 단계 닫기 훅의 네이티브 구현(no-op, 리뷰 R4). iOS·Android 화면 낭독기는 문지르기·뒤로 제스처로 닫고 Tab 포커스 개념이
// 없어 더할 props가 없다. 웹 번들은 Metro가 useDismiss.web.ts를 고른다(설계서 §7.1).

const NO_KEY_PROPS: EscapeKeyProps = {};
const NO_FOCUS_PROPS: FocusLeaveProps = {};

/** 네이티브에서는 아무 props도 더하지 않는다 */
export const useEscapeKey: UseEscapeKey = () => NO_KEY_PROPS;

/** 네이티브에서는 아무 props도 더하지 않는다 */
export const useFocusLeave: UseFocusLeave = () => NO_FOCUS_PROPS;
