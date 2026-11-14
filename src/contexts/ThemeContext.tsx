import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { useColorScheme } from "react-native";

import { usePersistentState } from "@/hooks/usePersistentState";
import { STORAGE_KEYS, themeCodec } from "@/lib/storage";
import { resolveColorScheme } from "@/lib/themePreference";
import { THEMES, type ThemeTokens } from "@/theme/tokens";
import type { ColorScheme, ThemePreference } from "@/types";

// 테마 선호·해석·토큰 공급(설계서 §5.7·§6.2 3단 해석): preference(저장, 기본 system) × useColorScheme()(OS) → resolveColorScheme → THEMES[scheme].
// 선호가 system이면 OS 변경이 useColorScheme 구독으로 재시작 없이 반영된다(AC-11.5·11.7). Appearance.setColorScheme override는 쓰지 않는다.
// 손상 저장값은 system으로 읽고 덮어쓰지 않는다(AC-18.4).

export type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly setPreference: (p: ThemePreference) => void;
  readonly scheme: ColorScheme;
  readonly tokens: ThemeTokens;
  readonly isReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider(props: { children: ReactNode }): ReactElement {
  const { value, isReady, setValue } = usePersistentState(
    STORAGE_KEYS.theme,
    themeCodec
  );
  // RN 0.88 useColorScheme(): 'light' | 'dark' | null(네이티브 Appearance 없음) — null/undefined는 light로 해석
  const systemScheme = useColorScheme();
  const preference: ThemePreference = value ?? "system";
  const scheme = resolveColorScheme(preference, systemScheme);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference: setValue,
      scheme,
      tokens: THEMES[scheme],
      isReady,
    }),
    [preference, setValue, scheme, isReady]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {props.children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error("useTheme은 ThemeProvider 안에서만 쓸 수 있습니다");
  }
  return context;
}
