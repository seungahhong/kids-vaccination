import type { BlurInertProps, UseBlurInert } from "./useBlurInert.types";

// 떠난 탭 화면 비활성화의 네이티브 구현(no-op, 리뷰 R2-01). iOS·Android는 react-native-screens가 떠난 화면을 분리해
// 키보드·화면 낭독기 포커스가 닿지 않으므로 더할 props가 없다. 웹 번들은 Metro가 같은 이름의 useBlurInert.web.ts를 고른다
// (설계서 §7.1). 내비게이션 문맥을 읽지 않으므로 Provider만으로 Screen을 렌더하는 jest 테스트도 그대로 동작한다.

const NO_PROPS: BlurInertProps = {};

/** 네이티브에서는 화면 셸에 아무 props도 더하지 않는다 */
export const useBlurInert: UseBlurInert = () => NO_PROPS;
