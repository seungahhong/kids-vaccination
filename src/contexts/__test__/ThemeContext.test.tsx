import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { ReactNode } from "react";
import * as ReactNative from "react-native";

import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { STORAGE_KEYS } from "@/lib/storage";
import { darkTokens, lightTokens } from "@/theme/tokens";

import {
  deferStorage,
  flushMacrotask,
  mockSystemScheme,
  restoreDefaultImplementationAfterEach,
  seedStorage,
} from "../../../test-utils/render";

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}

// jest 프리셋(@react-native/jest-preset)의 useColorScheme은 jest.fn(() => 'light')라 mockSystemScheme의 반환값 설정이
// restoreAllMocks로 되돌아가지 않는다. 기본 구현을 테스트마다 복원한다.
restoreDefaultImplementationAfterEach(jest.mocked(ReactNative.useColorScheme));

/** 화면 컨테이너처럼 tokens.background를 배경색으로 쓰는 소비자 */
function ThemedContainer() {
  const { tokens, scheme, isReady } = useTheme();
  return (
    <ReactNative.View
      testID="container"
      style={{ backgroundColor: tokens.background }}
    >
      <ReactNative.Text testID="scheme">{scheme}</ReactNative.Text>
      <ReactNative.Text testID="ready">{String(isReady)}</ReactNative.Text>
    </ReactNative.View>
  );
}

// AC-11.5 (FR-08) ThemeProvider 네이티브 경로: (선호, 시스템) 조합 해석과, 선호가 system일 때 OS 테마 변경의 재시작 없는 반영.
// 순수 함수 조합 5건은 src/lib/__test__/themePreference.test.ts가, 웹 실시간 반영은 E2E AC-11.7이 판정한다.
describe("AC-11.5 ThemeProvider (선호, 시스템) 해석과 OS 테마 실시간 반영", () => {
  /** [저장 선호(null = 저장값 없음 → system), useColorScheme 반환값, 기대 scheme] */
  const combos = [
    [null, "dark", "dark"],
    [null, "light", "light"],
    [null, null, "light"],
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
  ] as const;

  it.each(combos)(
    "AC-11.5 저장 선호 %j + useColorScheme %j → useTheme().scheme %j, tokens는 THEMES[scheme]",
    async (stored, system, expected) => {
      if (stored) await seedStorage({ [STORAGE_KEYS.theme]: stored });
      mockSystemScheme(system);

      const { result } = await renderHook(() => useTheme(), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.preference).toBe(stored ?? "system");
      expect(result.current.scheme).toBe(expected);
      expect(result.current.tokens).toBe(
        expected === "dark" ? darkTokens : lightTokens
      );
    }
  );

  it("AC-11.5 선호 system: useColorScheme mock을 light→dark로 바꿔 재렌더하면 컨테이너 backgroundColor가 #fafaf9→#1c1917로 바뀐다(앱 재시작 없이)", async () => {
    const spy = mockSystemScheme("light");
    const view = await render(
      <ThemeProvider>
        <ThemedContainer />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true")
    );
    expect(screen.getByTestId("container")).toHaveStyle({
      backgroundColor: "#fafaf9",
    });
    expect(screen.getByTestId("scheme")).toHaveTextContent("light");

    spy.mockReturnValue("dark");
    await view.rerender(
      <ThemeProvider>
        <ThemedContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("container")).toHaveStyle({
      backgroundColor: "#1c1917",
    });
    expect(screen.getByTestId("scheme")).toHaveTextContent("dark");
    // OS 변경은 선호가 아니므로 저장하지 않는다(E2E AC-11.7의 localStorage null과 같은 의미)
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    spy.mockReturnValue("light");
    await view.rerender(
      <ThemeProvider>
        <ThemedContainer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("container")).toHaveStyle({
      backgroundColor: "#fafaf9",
    });
  });

  it("AC-11.5 선호 light가 저장돼 있으면 OS가 dark로 바뀌어도 #fafaf9를 유지한다", async () => {
    await seedStorage({ [STORAGE_KEYS.theme]: "light" });
    const spy = mockSystemScheme("light");
    const view = await render(
      <ThemeProvider>
        <ThemedContainer />
      </ThemeProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("ready")).toHaveTextContent("true")
    );

    spy.mockReturnValue("dark");
    await view.rerender(
      <ThemeProvider>
        <ThemedContainer />
      </ThemeProvider>
    );

    expect(screen.getByTestId("container")).toHaveStyle({
      backgroundColor: "#fafaf9",
    });
    expect(screen.getByTestId("scheme")).toHaveTextContent("light");
  });
});

// AC-18.4 (US-18) 테마: 손상 저장값 'blue'는 useTheme().preference === 'system'으로 처리되고, 다른 값으로 덮어쓰지 않는다(setItem 0회).
describe("AC-18.4 ThemeProvider 하이드레이션 — 손상 저장값", () => {
  // 공식 AsyncStorage jest mock은 getItem에서 truthy 검사를 해 ''를 null로 돌려주므로 빈 문자열은 변형에서 뺐다(공백 포함 값으로 대체)
  it.each(["blue", "DARK", " light "])(
    "AC-18.4 저장값 %j → useTheme().preference === 'system', isReady === true, setItem 0회, 저장값 그대로",
    async (raw) => {
      await seedStorage({ [STORAGE_KEYS.theme]: raw });

      const { result } = await renderHook(() => useTheme(), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(result.current.isReady).toBe(true));

      expect(result.current.preference).toBe("system");
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
      expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
      expect(await AsyncStorage.getItem(STORAGE_KEYS.theme)).toBe(raw);
    }
  );

  it("AC-18.4 유효한 저장값 'dark'는 그대로 하이드레이션된다(preference 'dark', setItem 0회)", async () => {
    await seedStorage({ [STORAGE_KEYS.theme]: "dark" });

    const { result } = await renderHook(() => useTheme(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    expect(result.current.preference).toBe("dark");
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

// 지원(설계서 §5.7·§6.1): 테마 상태 — 하이드레이션 전 기본값(LoadingGate가 쓰는 system 해석값), 늦은 저장값 반영,
// setPreference의 즉시 반영 + 원시 문자열 저장, Context 참조 안정성, Provider 밖 사용 금지.
describe("G-5 ThemeContext 테마 상태", () => {
  it("G-5 읽기 전에는 isReady=false·preference='system'이고 OS 해석값(light) 토큰이며, 저장값이 없으면 isReady=true·preference='system'이다", async () => {
    const storage = deferStorage([STORAGE_KEYS.theme]);
    const { result } = await renderHook(() => useTheme(), {
      wrapper: Wrapper,
    });

    expect(result.current.isReady).toBe(false);
    expect(result.current.preference).toBe("system");
    expect(result.current.scheme).toBe("light");
    expect(result.current.tokens).toBe(lightTokens);

    await storage.resolve(STORAGE_KEYS.theme, null);

    expect(result.current.isReady).toBe(true);
    expect(result.current.preference).toBe("system");
    expect(result.current.tokens).toBe(lightTokens);
  });

  it("G-5 늦게 도착한 저장값 'dark'가 preference·scheme·tokens에 반영되고 다시 저장하지 않는다", async () => {
    mockSystemScheme("light");
    const storage = deferStorage([STORAGE_KEYS.theme]);
    const { result } = await renderHook(() => useTheme(), {
      wrapper: Wrapper,
    });
    expect(result.current.scheme).toBe("light");

    await storage.resolve(STORAGE_KEYS.theme, "dark");

    expect(result.current.isReady).toBe(true);
    expect(result.current.preference).toBe("dark");
    expect(result.current.scheme).toBe("dark");
    expect(result.current.tokens).toBe(darkTokens);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it("G-5 setPreference('dark')는 즉시 preference·scheme·tokens를 바꾸고 vaccination-app-theme에 원시 문자열 'dark'로 저장한다(AC-11.4 저장값)", async () => {
    mockSystemScheme("light");
    const { result } = await renderHook(() => useTheme(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      result.current.setPreference("dark");
    });

    expect(result.current.preference).toBe("dark");
    expect(result.current.scheme).toBe("dark");
    expect(result.current.tokens).toBe(darkTokens);
    await flushMacrotask();
    expect(await AsyncStorage.getItem("vaccination-app-theme")).toBe("dark");
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.setPreference("system");
    });

    expect(result.current.preference).toBe("system");
    expect(result.current.scheme).toBe("light");
    expect(result.current.tokens).toBe(lightTokens);
    await flushMacrotask();
    expect(await AsyncStorage.getItem("vaccination-app-theme")).toBe("system");
  });

  it("G-5 Context 값은 상태가 바뀌지 않으면 같은 참조이고 setPreference는 안정적이다(useMemo·useCallback)", async () => {
    const { result, rerender } = await renderHook(() => useTheme(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    const first = result.current;

    await rerender(undefined);

    expect(result.current).toBe(first);
    expect(result.current.setPreference).toBe(first.setPreference);
  });

  it("G-5 useTheme을 ThemeProvider 밖에서 쓰면 throw한다", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(renderHook(() => useTheme())).rejects.toThrow(/ThemeProvider/);
  });
});
