import { ArrowRight, Calendar } from "lucide-react-native";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { IsoDate } from "@/types";

// 이전 생년월일 바로가기(FR-02, 설계서 §5.8): 저장값이 있을 때만 홈이 렌더한다.
// 문구는 home.existingBirthdate + " (YYYY-MM-DD)"(원본 승계)이고 접근 이름은 그 텍스트다. 색은 onPrimarySoft on primarySoft(CONTRAST_PAIRS 등록 쌍).
export type ExistingBirthdateShortcutProps = {
  readonly birthdate: IsoDate;
  readonly onPress: () => void;
};

export function ExistingBirthdateShortcut({
  birthdate,
  onPress,
}: ExistingBirthdateShortcutProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <Pressable
      testID="existing-birthdate-shortcut"
      role="button"
      onPress={onPress}
      style={[styles.chip, { backgroundColor: tokens.primarySoft }]}
    >
      <Calendar color={tokens.onPrimarySoft} size={16} />
      <Text style={[styles.text, { color: tokens.onPrimarySoft }]}>
        {`${t("home.existingBirthdate")} (${birthdate})`}
      </Text>
      <ArrowRight color={tokens.onPrimarySoft} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.lg,
  },
  text: { fontSize: FONT_SIZE.sm },
});
