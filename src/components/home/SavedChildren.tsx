import { ArrowRight, Baby } from "lucide-react-native";
import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { childLabel } from "@/lib/children";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { Child, ChildId } from "@/types";

// 저장된 아이 목록(FR-16, U-26·U-27). v1.6까지의 "이전에 입력한 생년월일" 바로가기 하나를 아이별 바로가기로 바꿨다.
//   home-children: 제목(level 2 heading "저장된 아이") + 아이마다 child-shortcut 버튼
// 버튼 내용은 아이 이름표(이름이 있으면 이름, 없으면 생년월일) + "일정 바로 보기"이고, 접근 이름은 그 두 텍스트다.
// 누르면 그 아이를 선택하고 일정 화면으로 간다(onOpen). 색은 onPrimarySoft on primarySoft(CONTRAST_PAIRS 등록 쌍).

export type SavedChildrenProps = {
  readonly items: readonly Child[];
  readonly onOpen: (id: ChildId) => void;
};

export function SavedChildren({
  items,
  onOpen,
}: SavedChildrenProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <View testID="home-children" style={styles.section}>
      <Text
        role="heading"
        aria-level={2}
        style={[styles.heading, { color: tokens.text }]}
      >
        {t("home.savedChildren")}
      </Text>
      {items.map((child) => (
        <Pressable
          key={child.id}
          testID="child-shortcut"
          role="button"
          onPress={() => onOpen(child.id)}
          style={[styles.item, { backgroundColor: tokens.primarySoft }]}
        >
          <Baby color={tokens.onPrimarySoft} size={18} />
          <Text
            numberOfLines={1}
            style={[styles.label, { color: tokens.onPrimarySoft }]}
          >
            {childLabel(child)}
          </Text>
          <Text style={[styles.action, { color: tokens.onPrimarySoft }]}>
            {t("home.goToSchedule")}
          </Text>
          <ArrowRight color={tokens.onPrimarySoft} size={16} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.sm, marginBottom: SPACING.xl },
  heading: { fontSize: FONT_SIZE.md, fontWeight: "700" },
  item: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
  },
  label: { flex: 1, fontSize: FONT_SIZE.md, fontWeight: "600" },
  action: { fontSize: FONT_SIZE.sm },
});
