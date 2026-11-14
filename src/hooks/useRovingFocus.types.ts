import type { Ref } from "react";
import type { PressableInstance, PressableProps } from "react-native";

// 선택 그룹 키보드 조작 훅의 공통 계약(리뷰 R1-04, WAI-ARIA APG 라디오 그룹·탭 패턴).
// 대상은 role="radiogroup" 안의 role="radio"(테마·언어)와 role="tablist" 안의 role="tab"(일정 필터)이다.
// 웹(useRovingFocus.web.ts)은 Space 선택, 방향키·Home·End 이동과 선택, roving tabindex(선택 항목만 Tab 정지)를 구현하고,
// 네이티브(useRovingFocus.ts)는 아무 props도 더하지 않는다. 두 구현이 이 타입을 따르므로 tsc가 웹 구현도
// 같은 계약으로 검사한다(BirthdatePicker.types.ts와 같은 방식, 설계서 §7.1 플랫폼 확장자 분기).

/** 항목 Pressable에 펼쳐 넣는 props. 이름과 타입은 RN 0.88 PressableProps 그대로다 */
export type RovingItemProps = Pick<PressableProps, "tabIndex" | "onKeyDown"> & {
  readonly ref?: Ref<PressableInstance>;
};

export type RovingFocusOptions<T extends string> = {
  /** 화면(문서) 순서의 항목 값 */
  readonly values: readonly T[];
  /** 지금 선택된 값. Tab 순서에는 이 항목만 들어간다 */
  readonly selected: T;
  /** Space·방향키·Home·End로 고른 값(클릭·Enter는 각 항목의 onPress가 맡는다) */
  readonly onSelect: (next: T) => void;
  /**
   * 방향키 축. "both"(기본, APG 라디오 그룹)는 →·↓ 다음, ←·↑ 이전이다.
   * "horizontal"(가로 탭 목록)은 ←·→만 쓰고 ↑·↓는 페이지 스크롤에 남긴다(APG 탭 패턴)
   */
  readonly orientation?: "both" | "horizontal";
};

/** 값마다 그 항목의 props를 돌려주는 함수를 만든다 */
export type UseRovingFocus = <T extends string>(
  options: RovingFocusOptions<T>
) => (value: T) => RovingItemProps;
