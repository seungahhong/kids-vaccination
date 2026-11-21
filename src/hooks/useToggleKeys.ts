import type { ToggleKeyProps, UseToggleKeys } from "./useToggleKeys.types";

// 체크박스·스위치 키보드 조작의 네이티브 구현(no-op, U-22·U-23). iOS·Android 화면 낭독기는 두 번 탭으로 컨트롤을 누르고
// 하드웨어 키보드 활성화도 onPress로 오므로 더할 props가 없다. 웹 번들은 Metro가 useToggleKeys.web.ts를 고른다(설계서 §7.1).

const NO_PROPS: ToggleKeyProps = {};

/** 네이티브에서는 아무 props도 더하지 않는다 */
export const useToggleKeys: UseToggleKeys = () => NO_PROPS;
