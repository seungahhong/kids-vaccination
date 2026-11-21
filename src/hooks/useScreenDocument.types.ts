import type { RefObject } from "react";
import type { HostInstance } from "react-native";

// 화면 단위 문서 상태 훅의 공통 계약(리뷰 R4-03, WCAG 2.4.2 페이지 제목·2.4.3 포커스 순서).
// 탭 화면은 언마운트되지 않고 겹쳐 남으므로(CLAUDE.md "탭 화면은 언마운트되지 않는다") 화면이 바뀌어도 문서는 저절로 바뀌지 않는다.
// - 제목: 포커스된(보이는) 화면이 document.title을 자기 제목으로 둔다.
// - 제목 포커스 요청: 포커스를 가진 컨트롤이 사라지며 화면이 바뀌는 동작(아이 추가 제출 → 일정 화면)은 requestTitleFocus(대상 화면)를
//   부른다. 대상 화면은 보이게 된 뒤(커밋 후) 자기 제목(h1)으로 포커스를 옮긴다. 예전에는 포커스가 body로 빠져 화면 낭독기가 아무것도
//   읽지 않았다. 일정 탭은 처음 방문할 때 마운트되고(지연 마운트), 이미 보이는 화면에서 추가할 수도 있어서(헤더 메뉴) "포커스를 잃었는지"를
//   추측하지 않고 명시적으로 요청한다.
// 웹(useScreenDocument.web.ts)만 동작하고 네이티브(useScreenDocument.ts)는 아무것도 하지 않는다. 네이티브에는 문서 제목이 없고,
// 네이티브 낭독기 포커스 이동은 대상의 onLayout에서 따로 한다(V-01).

export type ScreenDocumentOptions = {
  /** 화면 식별자(Screen의 testID). requestTitleFocus의 대상 이름이다 */
  readonly screen: string;
  /** 화면 최외곽 View(웹에서는 DOM 요소). 제목 h1을 이 안에서 찾는다 */
  readonly frameRef: RefObject<HostInstance | null>;
  /** 이 화면이 보일 때의 문서 제목 */
  readonly title: string;
};

export type UseScreenDocument = (options: ScreenDocumentOptions) => void;

/** screen 화면이 보이게 된 뒤 그 화면 제목으로 포커스를 옮기도록 요청한다 */
export type RequestTitleFocus = (screen: string) => void;
