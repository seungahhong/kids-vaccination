import { render } from "@testing-library/react-native";
import { createRef } from "react";
import {
  AccessibilityInfo,
  type HostInstance,
  Platform,
  View,
} from "react-native";

import { moveFocus } from "@/components/common/moveFocus";

// 포커스 이동 공용 함수(R1-03에서 분리, U-22). 웹은 대상의 focus(), 네이티브는 화면 낭독기 포커스 이벤트다.
// 실제 화면에서의 시점은 BabyInfoSection·일정 화면 테스트가 보고, 여기서는 플랫폼 분기와 대상 없음만 본다.
// 프리셋 mock 호스트의 focus는 모든 인스턴스가 공유하는 jest.fn이다(test-utils sharedHostFocus와 같은 전제).

/** View 하나를 렌더해 그 호스트와 (공유) focus mock을 돌려준다 */
async function renderHost() {
  const ref = createRef<HostInstance>();
  await render(<View ref={ref} testID="target" />);
  if (ref.current === null) throw new Error("대상 View가 렌더되지 않았다");
  const focus = jest.mocked(ref.current.focus);
  focus.mockClear();
  return { host: ref.current, focus };
}

describe("U-22 moveFocus", () => {
  const sendEvent = jest.mocked(AccessibilityInfo.sendAccessibilityEvent);
  beforeEach(() => sendEvent.mockClear());

  it("U-22 웹이면 대상의 focus()를 부르고 화면 낭독기 이벤트는 보내지 않는다", async () => {
    const { host, focus } = await renderHost();
    const replaced = jest.replaceProperty(Platform, "OS", "web");

    moveFocus(host);

    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus.mock.contexts[0]).toBe(host);
    expect(sendEvent).not.toHaveBeenCalled();
    replaced.restore();
  });

  it.each(["ios", "android"] as const)(
    "U-22 %s면 sendAccessibilityEvent(대상, 'focus')를 보내고 focus()는 부르지 않는다",
    async (os) => {
      const { host, focus } = await renderHost();
      const replaced = jest.replaceProperty(Platform, "OS", os);

      moveFocus(host);

      expect(sendEvent).toHaveBeenCalledWith(host, "focus");
      expect(focus).not.toHaveBeenCalled();
      replaced.restore();
    }
  );

  it.each([null, undefined])(
    "U-22 대상이 %s면 아무것도 하지 않는다",
    async (node) => {
      const { focus } = await renderHost();

      moveFocus(node);

      expect(sendEvent).not.toHaveBeenCalled();
      expect(focus).not.toHaveBeenCalled();
    }
  );
});
