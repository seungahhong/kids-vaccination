import type { ComponentType, ReactElement, ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/contexts/ThemeContext";
import { useBlurInert } from "@/hooks/useBlurInert";
import type { BlurInertProps } from "@/hooks/useBlurInert.types";
import { SPACING } from "@/theme/tokens";

// 화면 셸(설계서 §5.8): 최외곽 View에 testID(screen-*)와 배경 토큰, SafeArea top/left/right 패딩.
// 하단 inset은 탭 바가 처리한다. 색은 렌더 시 tokens에서 인라인으로 합친다(§7.3).
// 최외곽 View는 useBlurInert의 props도 받는다. 웹에서 하단 탭으로 떠난 화면은 inert라 Tab 순서·보조기기에서 빠지고
// (활성 화면 뒤에 남아 있어도 키보드로 닿지 않음), 네이티브는 아무것도 더하지 않는다(리뷰 R2-01).

/**
 * 최외곽 View. RN 0.88 View 타입에는 inert가 없지만 react-native-web View는 inert를 DOM 속성으로 넘긴다.
 * 더 많은 props를 받는 타입으로의 대입이라 tsc가 매개변수 호환성으로 검사한다(단언 없음, LanguagePressable.web.tsx와 같은 방식).
 */
const ScreenFrame: ComponentType<ViewProps & BlurInertProps> = View;

export type ScreenTestID =
  "screen-home" | "screen-schedule" | "screen-settings";

export type ScreenProps = {
  readonly testID: ScreenTestID;
  /** true면 본문을 ScrollView에 담는다(홈·일정·설정 화면 모두. 홈은 리뷰 R1-02에서 추가) */
  readonly scroll?: boolean;
  readonly children: ReactNode;
};

export function Screen({
  testID,
  scroll = false,
  children,
}: ScreenProps): ReactElement {
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const blurInert = useBlurInert();
  const frame = {
    backgroundColor: tokens.background,
    paddingTop: insets.top,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  };

  return (
    <ScreenFrame testID={testID} style={[styles.fill, frame]} {...blurInert}>
      {scroll ? (
        <ScrollView style={styles.fill} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, styles.content]}>{children}</View>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: SPACING.lg },
});
