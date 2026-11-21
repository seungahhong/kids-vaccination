import type {
  RequestTitleFocus,
  UseScreenDocument,
} from "./useScreenDocument.types";

// 화면 단위 문서 상태 훅의 네이티브 구현(no-op, 리뷰 R4-03). 네이티브에는 문서 제목이 없고, 화면 낭독기 포커스 이동은 대상의
// onLayout에서 따로 한다(V-01). 웹 번들은 Metro가 useScreenDocument.web.ts를 고른다(설계서 §7.1).

/** 네이티브에서는 아무것도 하지 않는다 */
export const useScreenDocument: UseScreenDocument = () => undefined;

/** 네이티브에서는 아무것도 하지 않는다 */
export const requestTitleFocus: RequestTitleFocus = () => undefined;
