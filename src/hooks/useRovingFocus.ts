import type { RovingItemProps, UseRovingFocus } from "./useRovingFocus.types";

// 선택 그룹 키보드 조작의 네이티브 구현(no-op, 리뷰 R1-04). iOS·Android 화면 낭독기는 radio·tab 항목을 하나씩 탐색하고
// 두 번 탭으로 고르므로 더할 props가 없다. 웹 번들은 Metro가 같은 이름의 useRovingFocus.web.ts를 고른다(설계서 §7.1).

const NO_PROPS: RovingItemProps = {};

function noProps(): RovingItemProps {
  return NO_PROPS;
}

/** 네이티브에서는 항목에 아무 props도 더하지 않는다 */
export const useRovingFocus: UseRovingFocus = () => noProps;
