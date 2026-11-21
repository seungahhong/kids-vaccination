import { act, renderHook } from "@testing-library/react-native";
import { useIsFocused } from "expo-router";
import type { RefObject } from "react";
import type { HostInstance } from "react-native";

import {
  requestTitleFocus as requestNativeTitleFocus,
  useScreenDocument as useNativeScreenDocument,
} from "@/hooks/useScreenDocument";
import {
  requestTitleFocus,
  useScreenDocument as useWebScreenDocument,
} from "@/hooks/useScreenDocument.web";

// 리뷰 R4-03: 화면 단위 문서 상태 훅(useScreenDocument). jest(iOS 프리셋)는 '@/hooks/useScreenDocument'를 네이티브 no-op으로 풀므로
// 웹 구현은 경로에 .web을 붙여 직접 불러 검증한다. jest에는 DOM이 없어 title만 가진 가짜 document와 querySelector·focus만 가진
// 가짜 요소를 쓴다(useDocumentLanguage.test.tsx와 같은 방식). 실제 브라우저의 제목·포커스 이동은 e2e/review-r4-a11y.spec.ts가 본다.

jest.mock("expo-router", () => ({
  ...jest.requireActual<object>("expo-router"),
  useIsFocused: jest.fn(),
}));

let fakeDocument: { title: string };
let focused = true;
/** 테스트마다 다른 화면 이름을 써서 모듈 수준 대기 목록이 테스트끼리 섞이지 않게 한다 */
let screenSeq = 0;

function makeHeading() {
  return { setAttribute: jest.fn(), focus: jest.fn() };
}

/** 화면 프레임 흉내: querySelector("h1")이 heading을 돌려준다 */
function frameRefWith(heading: object | null): RefObject<HostInstance | null> {
  const frame = {
    querySelector: (selector: string) => (selector === "h1" ? heading : null),
  };
  return { current: Object.assign(frame) };
}

type Props = { title: string };

async function renderWebHook(
  screen: string,
  frameRef: RefObject<HostInstance | null>,
  title = "t"
) {
  return renderHook(
    (props: Props) =>
      useWebScreenDocument({ screen, frameRef, title: props.title }),
    { initialProps: { title } }
  );
}

beforeEach(() => {
  focused = true;
  screenSeq += 1;
  jest.mocked(useIsFocused).mockImplementation(() => focused);
  fakeDocument = { title: "템플릿" };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: fakeDocument,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "document");
});

describe("R4-03 화면별 문서 제목", () => {
  it("R4-03 웹: 보이는 화면은 문서 제목을 자기 제목으로 두고, 제목(언어)이 바뀌면 따라 바꾼다", async () => {
    const { rerender } = await renderWebHook(
      `s${screenSeq}`,
      frameRefWith(null),
      "접종 일정 · 아기 예방접종 일정"
    );
    expect(fakeDocument.title).toBe("접종 일정 · 아기 예방접종 일정");

    await rerender({ title: "Schedule · Baby Vaccination Schedule" });
    expect(fakeDocument.title).toBe("Schedule · Baby Vaccination Schedule");
  });

  it("R4-03 웹: 떠난(보이지 않는) 화면은 문서 제목을 바꾸지 않는다", async () => {
    focused = false;
    await renderWebHook(`s${screenSeq}`, frameRefWith(null), "설정");
    expect(fakeDocument.title).toBe("템플릿");
  });
});

describe("R4-03 제목 포커스 요청(requestTitleFocus)", () => {
  it("R4-03 웹: 요청이 없으면 마운트·다시 렌더에도 포커스를 옮기지 않는다", async () => {
    const heading = makeHeading();
    const { rerender } = await renderWebHook(
      `s${screenSeq}`,
      frameRefWith(heading)
    );
    await rerender({ title: "t2" });
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it("R4-03 웹: 아직 마운트되지 않은 화면에 요청하면, 그 화면이 보이는 채로 마운트될 때 제목 h1에 tabindex -1을 주고 한 번만 포커스한다", async () => {
    const screen = `s${screenSeq}`;
    requestTitleFocus(screen);
    const heading = makeHeading();

    const { rerender } = await renderWebHook(screen, frameRefWith(heading));
    await rerender({ title: "t2" });

    expect(heading.setAttribute).toHaveBeenCalledWith("tabindex", "-1");
    expect(heading.focus).toHaveBeenCalledTimes(1);
  });

  it("R4-03 웹: 떠나 있는 화면에 요청하면 보이게 될 때까지 기다렸다가 옮긴다", async () => {
    const screen = `s${screenSeq}`;
    focused = false;
    const heading = makeHeading();
    const { rerender } = await renderWebHook(screen, frameRefWith(heading));

    await act(() => requestTitleFocus(screen));
    expect(heading.focus).not.toHaveBeenCalled();

    focused = true;
    await rerender({ title: "t" });
    expect(heading.focus).toHaveBeenCalledTimes(1);
  });

  it("R4-03 웹: 이미 보이는 화면에 요청하면(헤더 메뉴로 추가) 다시 렌더한 뒤 커밋 후에 옮긴다", async () => {
    const screen = `s${screenSeq}`;
    const heading = makeHeading();
    await renderWebHook(screen, frameRefWith(heading));

    await act(() => requestTitleFocus(screen));

    expect(heading.focus).toHaveBeenCalledTimes(1);
  });

  it("R4-03 웹: 다른 화면에 대한 요청에는 반응하지 않는다", async () => {
    const heading = makeHeading();
    await renderWebHook(`s${screenSeq}`, frameRefWith(heading));

    await act(() => requestTitleFocus(`other${screenSeq}`));

    expect(heading.focus).not.toHaveBeenCalled();
  });

  it("R4-03 웹: 프레임에 h1이 없거나 프레임이 DOM 요소가 아니면 요청만 지우고 아무것도 하지 않는다(throw 없음)", async () => {
    const refs: RefObject<HostInstance | null>[] = [
      frameRefWith(null),
      { current: null },
    ];
    for (const [index, frameRef] of refs.entries()) {
      const screen = `s${screenSeq}-${index}`;
      requestTitleFocus(screen);
      await renderWebHook(screen, frameRef);
    }
    const heading = makeHeading();
    await renderWebHook(`s${screenSeq}-0`, frameRefWith(heading));
    expect(heading.focus).not.toHaveBeenCalled();
  });

  it("R4-03 웹: 화면이 언마운트되면 깨우기 함수를 지워, 그 뒤의 요청은 다음 마운트 때 처리된다", async () => {
    const screen = `s${screenSeq}`;
    const first = makeHeading();
    const { unmount } = await renderWebHook(screen, frameRefWith(first));
    await unmount();

    requestTitleFocus(screen);
    const second = makeHeading();
    await renderWebHook(screen, frameRefWith(second));

    expect(first.focus).not.toHaveBeenCalled();
    expect(second.focus).toHaveBeenCalledTimes(1);
  });
});

describe("R4-03 네이티브 구현", () => {
  it("R4-03 네이티브(no-op)는 문서 제목을 바꾸지 않고 요청도 무시한다", async () => {
    requestNativeTitleFocus("screen-schedule");
    await renderHook(() =>
      useNativeScreenDocument({
        screen: "screen-schedule",
        frameRef: { current: null },
        title: "x",
      })
    );
    expect(fakeDocument.title).toBe("템플릿");
  });
});
