import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

import { usePersistentState } from "@/hooks/usePersistentState";
import { STORAGE_KEYS, themeCodec } from "@/lib/storage";
import { DEFAULT_THEME } from "@/lib/themePreference";
import { THEMES, type ThemeTokens } from "@/theme/tokens";
import type { ColorScheme, ThemePreference } from "@/types";

// 테마 선호·토큰 공급(설계서 §5.7·§6.2). v1.5(U-24): 선호는 라이트·다크 2개이고 그대로 화면 색 모드(scheme)가 된다.
// OS 색 모드(useColorScheme)는 읽지 않는다 — 저장값이 없거나 손상됐으면(예전 'system' 포함) 기본값 라이트다(AC-11.2·11.5·11.7).
// 손상 저장값은 덮어쓰지 않는다(AC-18.4). 설정 화면 ThemeSelector와 헤더 테마 스위치가 같은 setPreference를 쓴다(FR-15).

export type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly setPreference: (p: ThemePreference) => void;
  /** 화면 색 모드. 선호와 같은 값이다(시스템 해석 단계가 없어짐, U-24) */
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
  const preference: ThemePreference = value ?? DEFAULT_THEME;

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setPreference: setValue,
      scheme: preference,
      tokens: THEMES[preference],
      isReady,
    }),
    [preference, setValue, isReady]
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
