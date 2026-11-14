import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/theme/tokens";

// 의료 면책 문구(FR-12, 설계서 §5.8): 일정·설정 화면 공용. testID disclaimer, 텍스트는 t('common.disclaimer').
// placement "bottom"(기본, 설정 화면 하단)은 자체 배경 없이 화면 배경 위에 가운데 정렬로 놓인다 → textSecondary on background.
// "top"(일정 화면 목록 위, U-14)은 surface 배경 + border 안내 상자다 → textSecondary on surface. 둘 다 CONTRAST_PAIRS 등록 쌍이다.
export type DisclaimerProps = {
  readonly placement?: "top" | "bottom";
};

export function Disclaimer({
  placement = "bottom",
}: DisclaimerProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const top = placement === "top";

  return (
    <View
      style={
        top
          ? [
              styles.topContainer,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]
          : styles.container
      }
    >
      <Text
        testID="disclaimer"
        style={[
          styles.text,
          top && styles.topText,
          { color: tokens.textSecondary },
        ]}
      >
        {t("common.disclaimer")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: SPACING.xl },
  topContainer: {
    padding: SPACING.md,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xl,
  },
  text: { fontSize: FONT_SIZE.sm, lineHeight: 20, textAlign: "center" },
  topText: { textAlign: "left" },
});
