import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { formatMonthsLabel } from "@/lib/schedule";
import { FONT_SIZE, SPACING } from "@/theme/tokens";

// 월령 구분선(FR-04, 설계서 §5.8): 가운데 라벨(formatMonthsLabel, 로케일별) 양옆에 border 색 선을 둔다(원본 구분선 승계).
// 라벨은 role="heading" + aria-level={2}다. RNW가 <h2>로 렌더해 화면 제목(<h1>)과 구분된다
// (aria-level은 RN 타입에 없지만 하이픈 JSX 속성이라 타입 검사를 통과하고, 네이티브에서는 무시된다).
// 라벨은 화면 배경 위에 놓이므로 textSecondary on background(CONTRAST_PAIRS 등록 쌍)다.
export type GroupHeaderProps = {
  readonly minMonths: number;
};

export function GroupHeader({ minMonths }: GroupHeaderProps): ReactElement {
  const { locale } = useI18n();
  const { tokens } = useTheme();
  const line = [styles.line, { backgroundColor: tokens.border }];

  return (
    <View style={styles.row}>
      <View style={line} />
      <Text
        testID={`group-header-${minMonths}`}
        role="heading"
        aria-level={2}
        style={[styles.label, { color: tokens.textSecondary }]}
      >
        {formatMonthsLabel(minMonths, locale)}
      </Text>
      <View style={line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  label: { fontSize: FONT_SIZE.xs, fontWeight: "600" },
});
