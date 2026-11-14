import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useBirthdate } from "@/contexts/BirthdateContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";

// 하이드레이션 게이트(설계서 §6.1·§10.3, P-07): 테마·언어·생년월일 세 Provider의 isReady가 모두 true가 될 때까지
// 자식(Slot) 대신 로딩 표시만 렌더해 기본값 → 저장값 깜빡임을 막는다. 읽기 실패·손상 값도 isReady=true로 끝나므로
// 게이트가 영원히 닫히지는 않는다(AC-18.2·18.4). 배경은 테마 미확정 시 system 해석값 토큰을 그대로 쓴다.
export function LoadingGate({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const theme = useTheme();
  const i18n = useI18n();
  const birthdate = useBirthdate();
  const ready = theme.isReady && i18n.isReady && birthdate.isReady;

  if (!ready) {
    return (
      <View
        testID="loading-gate"
        style={[styles.gate, { backgroundColor: theme.tokens.background }]}
      >
        <ActivityIndicator size="large" color={theme.tokens.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  gate: { flex: 1, alignItems: "center", justifyContent: "center" },
});
