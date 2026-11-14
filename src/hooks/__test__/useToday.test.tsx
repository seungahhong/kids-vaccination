import { renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { useToday } from "@/hooks/useToday";
import { toIsoDate } from "@/lib/date";

import {
  createClockWrapper,
  FIXED_NOW,
  restoreDefaultImplementationAfterEach,
  spyAppState,
} from "../../../test-utils/render";

// jest 프리셋의 AppState.addEventListener는 이미 jest.fn이라 spyAppState의 구현 설정이 restoreAllMocks로 되돌아가지 않는다.
// 기본 구현을 테스트마다 복원한다(jest.setup.ts와 같은 방식).
restoreDefaultImplementationAfterEach(jest.mocked(AppState.addEventListener));

// 지원(AC-5.6 · 설계서 §5.6·§10.2): useToday는 주입 시계의 로컬 자정을 돌려주고, 앱이 'active'로 돌아올 때 날짜가 바뀌었으면 갱신한다.
describe("AC-5.6 [hook] useToday", () => {
  it("AC-5.6 [hook] Provider가 없으면 기본 시계(new Date)의 오늘 자정을 돌려준다", async () => {
    const before = toIsoDate(new Date());
    const { result } = await renderHook(() => useToday());
    const after = toIsoDate(new Date());

    expect([before, after]).toContain(toIsoDate(result.current));
    expect(result.current.getHours()).toBe(0);
    expect(result.current.getMinutes()).toBe(0);
  });

  it("AC-5.6 [hook] 주입 시계 2026-10-18 15:00이면 today는 2026-10-18 자정이다", async () => {
    const { result } = await renderHook(() => useToday(), {
      wrapper: createClockWrapper(() => new Date(FIXED_NOW)),
    });

    expect(toIsoDate(result.current)).toBe("2026-10-18");
    expect(result.current.getHours()).toBe(0);
    expect(result.current.getMinutes()).toBe(0);
    expect(result.current.getSeconds()).toBe(0);
  });

  it("AC-5.6 [hook] (a) 같은 날 23:00에 background→active로 돌아오면 같은 Date 참조를 유지한다", async () => {
    const appState = spyAppState();
    let clockNow = new Date(FIXED_NOW);
    const { result } = await renderHook(() => useToday(), {
      wrapper: createClockWrapper(() => clockNow),
    });
    const first = result.current;
    expect(appState.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    );

    clockNow = new Date(2026, 9, 18, 23, 0, 0);
    await appState.emit("background");
    await appState.emit("active");

    expect(result.current).toBe(first);
    expect(toIsoDate(result.current)).toBe("2026-10-18");
  });

  it("AC-5.6 [hook] (b) 다음 날 09:00에 active로 돌아오면 today가 2026-10-19 자정으로 갱신된다(background만으로는 갱신하지 않음)", async () => {
    const appState = spyAppState();
    let clockNow = new Date(FIXED_NOW);
    const { result } = await renderHook(() => useToday(), {
      wrapper: createClockWrapper(() => clockNow),
    });
    const first = result.current;

    clockNow = new Date(2026, 9, 19, 9, 0, 0);
    await appState.emit("background");
    expect(result.current).toBe(first);

    await appState.emit("active");

    expect(result.current).not.toBe(first);
    expect(toIsoDate(result.current)).toBe("2026-10-19");
    expect(result.current.getHours()).toBe(0);
  });

  it("AC-5.6 [hook] (c) 언마운트하면 AppState 구독을 remove한다", async () => {
    const appState = spyAppState();
    const { unmount } = await renderHook(() => useToday(), {
      wrapper: createClockWrapper(() => new Date(FIXED_NOW)),
    });
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);
    expect(appState.remove).not.toHaveBeenCalled();

    await unmount();

    expect(appState.remove).toHaveBeenCalledTimes(1);
  });
});
