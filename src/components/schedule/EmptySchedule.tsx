import { Calendar, House } from "lucide-react-native";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";

// 빈 상태(FR-07, 설계서 §5.8): 생년월일이 없을 때 일정 화면이 이것만 렌더한다(필터·면책 문구 미표시, P-12).
// 라우팅은 화면이 넘긴 onGoHome이 맡는다(컴포넌트는 app/·useRouter를 쓰지 않는다, 설계서 §2.1 규칙 3).
// 색은 CONTRAST_PAIRS 등록 쌍만 쓴다: 안내 문구 textSecondary on background(자체 배경 없음), 버튼 onPrimary on primary.
export type EmptyScheduleProps = {
  readonly onGoHome: () => void;
};

export function EmptySchedule({ onGoHome }: EmptyScheduleProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <View testID="schedule-empty" style={styles.container}>
      <Calendar color={tokens.textSecondary} size={48} />
      <Text style={[styles.message, { color: tokens.textSecondary }]}>
        {t("schedule.noBirthdate")}
      </Text>
      <Pressable
        testID="go-home"
        role="button"
        onPress={onGoHome}
        style={[styles.button, { backgroundColor: tokens.primary }]}
      >
        <House color={tokens.onPrimary} size={16} />
        <Text style={[styles.buttonText, { color: tokens.onPrimary }]}>
          {t("schedule.goHome")}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: SPACING.lg,
    paddingVertical: SPACING.xxl * 2,
  },
  message: { fontSize: FONT_SIZE.md, textAlign: "center" },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  buttonText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
