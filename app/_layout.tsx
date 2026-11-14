import {
  DarkTheme,
  DefaultTheme,
  Slot,
  type Theme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactElement, useMemo } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoadingGate } from "@/components/common/LoadingGate";
import { BirthdateProvider } from "@/contexts/BirthdateContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import type { ThemeTokens } from "@/theme/tokens";
import type { ColorScheme } from "@/types";

// 루트 레이아웃(설계서 §2.2): SafeAreaProvider → ThemeProvider → I18nProvider → BirthdateProvider → nav theme·StatusBar → LoadingGate → Slot.
// 세 Provider는 서로 의존하지 않는다. Theme을 가장 바깥에 두어 탭 바와 게이트가 토큰을 쓸 수 있게 하고,
// 게이트는 세 Provider 안쪽에 두어 isReady를 모두 읽는다. 3개 키 하이드레이션 전에는 로딩 표시만 렌더한다(P-07).
// 렌더 중 예외는 expo-router 기본 ErrorBoundary(재시도 화면)가 받는다(AD-24, 비평 C-14).
export { ErrorBoundary } from "expo-router";

export default function RootLayout(): ReactElement {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <BirthdateProvider>
            <AppChrome />
          </BirthdateProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** nav theme과 StatusBar는 테마 토큰을 읽어야 하므로 Provider 안쪽에 둔다(설계서 §6.2) */
function AppChrome(): ReactElement {
  const { scheme, tokens } = useTheme();
  const navigationTheme = useMemo(
    () => toNavigationTheme(scheme, tokens),
    [scheme, tokens]
  );

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <LoadingGate>
        <Slot />
      </LoadingGate>
    </NavigationThemeProvider>
  );
}

/** 토큰 기반 nav theme: background, card=surface, text, border, primary=tabActive(설계서 §6.2) */
function toNavigationTheme(scheme: ColorScheme, tokens: ThemeTokens): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: scheme === "dark",
    colors: {
      ...base.colors,
      primary: tokens.tabActive,
      background: tokens.background,
      card: tokens.surface,
      text: tokens.text,
      border: tokens.border,
    },
  };
}
