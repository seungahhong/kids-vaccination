import {
  DarkTheme,
  DefaultTheme,
  Slot,
  type Theme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { type ReactElement, useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoadingGate } from "@/components/common/LoadingGate";
import { ChildrenProvider } from "@/contexts/ChildrenContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { MAX_CONTENT_WIDTH, type ThemeTokens } from "@/theme/tokens";
import type { ColorScheme } from "@/types";

// 루트 레이아웃(설계서 §2.2): SafeAreaProvider → ThemeProvider → I18nProvider → ChildrenProvider → nav theme·StatusBar
// → LoadingGate → Slot. 세 Provider는 서로 의존하지 않는다. ChildrenProvider(FR-16)는 v1.6까지의 Birthdate·Completion Provider를
// 대신한다(아이 목록과 아이별 완료 기록, 예전 키 이전 포함). Theme을 가장 바깥에 두어 탭 바와 게이트가 토큰을 쓸 수 있게 하고,
// 게이트는 세 Provider 안쪽에 두어 isReady를 모두 읽는다. 하이드레이션 전에는 로딩 표시만 렌더한다(P-07).
// 렌더 중 예외는 expo-router 기본 ErrorBoundary(재시도 화면)가 받는다(AD-24, 비평 C-14).
export { ErrorBoundary } from "expo-router";

export default function RootLayout(): ReactElement {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <ChildrenProvider>
            <AppChrome />
          </ChildrenProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * nav theme과 StatusBar는 테마 토큰을 읽어야 하므로 Provider 안쪽에 둔다(설계서 §6.2).
 * 앱 전체(헤더·본문·하단 탭 바)는 가운데 칼럼(app-frame, 최대 MAX_CONTENT_WIDTH = iPad 세로 768)에 담는다(v1.8 U-31).
 * 화면이 그보다 넓을 때(데스크톱 웹·iPad 가로)만 칼럼 좌우에 border를 그어 모바일 화면처럼 경계를 보이고, 휴대폰에서는 그대로 꽉 찬다.
 */
function AppChrome(): ReactElement {
  const { scheme, tokens } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width > MAX_CONTENT_WIDTH;
  const navigationTheme = useMemo(
    () => toNavigationTheme(scheme, tokens),
    [scheme, tokens]
  );

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View
        testID="app-backdrop"
        style={[styles.backdrop, { backgroundColor: tokens.background }]}
      >
        <View
          testID="app-frame"
          style={[
            styles.frame,
            wide ? [styles.frameEdges, { borderColor: tokens.border }] : null,
          ]}
        >
          <LoadingGate>
            <Slot />
          </LoadingGate>
        </View>
      </View>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center" },
  frame: { flex: 1, width: "100%", maxWidth: MAX_CONTENT_WIDTH },
  frameEdges: { borderLeftWidth: 1, borderRightWidth: 1 },
});
