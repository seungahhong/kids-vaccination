import type { ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRovingFocus } from "@/hooks/useRovingFocus";
import { childLabel } from "@/lib/children";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { Child, ChildId } from "@/types";

// 일정 화면의 아이 선택(FR-16, U-26·U-27). 화면 제목 아래, v1.6까지 "생년월일: …" 줄이 있던 자리다.
//   가로 ScrollView(아이가 많으면 가로로 스크롤, 최대 10명)
//   └─ schedule-child-selector: role="radiogroup"(이름 "아이 선택") 안에 아이마다 role="radio" 칩(child-option, aria-checked)
// 칩 글자는 아이 이름표(이름이 있으면 이름, 없으면 생년월일)다.
// 웹 키보드(Space 선택·방향키 이동·선택 칩만 Tab 정지)는 useRovingFocus가 맡는다(리뷰 R1-04와 같은 방식, 네이티브는 no-op).
// 색: 선택 onPrimary on primary, 비선택 chipText on chipBackground(CONTRAST_PAIRS 등록 쌍, 필터 탭과 같다).

export type ChildSelectorProps = {
  readonly items: readonly Child[];
  readonly selected: ChildId;
  readonly onSelect: (id: ChildId) => void;
};

export function ChildSelector({
  items,
  selected,
  onSelect,
}: ChildSelectorProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const itemProps = useRovingFocus({
    values: items.map((child) => child.id),
    selected,
    onSelect,
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
    >
      <View
        testID="schedule-child-selector"
        role="radiogroup"
        aria-label={t("schedule.childSelector")}
        style={styles.row}
      >
        {items.map((child) => {
          const checked = child.id === selected;
          return (
            <Pressable
              key={child.id}
              {...itemProps(child.id)}
              testID="child-option"
              role="radio"
              aria-checked={checked}
              onPress={() => onSelect(child.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: checked
                    ? tokens.primary
                    : tokens.chipBackground,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: checked ? tokens.onPrimary : tokens.chipText },
                ]}
              >
                {childLabel(child)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, marginTop: SPACING.sm, marginBottom: SPACING.lg },
  row: { flexDirection: "row", gap: SPACING.sm },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    maxWidth: 200,
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
  },
  label: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
