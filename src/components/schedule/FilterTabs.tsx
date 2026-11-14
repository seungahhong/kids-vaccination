import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRovingFocus } from "@/hooks/useRovingFocus";
import type { TranslationKey } from "@/i18n/types";
import { FONT_SIZE, MIN_TOUCH_TARGET, RADIUS, SPACING } from "@/theme/tokens";
import type { ScheduleFilter } from "@/types";

// 필터 3종(FR-05, 설계서 §5.8): role="tablist" 안의 role="tab" + aria-selected, testID filter-{all|upcoming|past}.
// 선택/비선택 색은 CONTRAST_PAIRS 등록 쌍(onPrimary/primary, chipText/chipBackground)만 쓴다. 최소 44×44.
// 리뷰 라운드 1 접근성 보완:
// - tablist는 aria-label(schedule.filterLabel)로 이름 붙여 같은 화면의 하단 탭 바(역시 tablist)와 구분한다(R1-07).
// - 탭마다 id(nativeID)와 aria-controls를 둔다. 일정 화면이 목록을 role="tabpanel"(id FILTER_PANEL_ID,
//   aria-labelledby = 선택 탭 id)로 감싸 탭과 패널을 잇는다(R1-05, 비평 C-18·PRD 부록 B-4 재검토).
// - 웹 키보드(Space 선택, ←·→·Home·End 이동과 선택, 선택 탭만 Tab 정지)는 useRovingFocus가 맡는다(R1-04, 네이티브는 no-op).
//   가로 탭 목록이라 ↑·↓는 페이지 스크롤에 남긴다(orientation "horizontal", APG 탭 패턴).
export type FilterTabsProps = {
  readonly value: ScheduleFilter;
  readonly onChange: (next: ScheduleFilter) => void;
};

/** 필터 목록 패널(role="tabpanel")의 id(웹 DOM id, 네이티브 nativeID). 탭의 aria-controls가 가리킨다 */
export const FILTER_PANEL_ID = "schedule-filter-panel";

/** 필터 탭의 id(웹 DOM id, 네이티브 nativeID). 패널의 aria-labelledby가 선택된 탭을 가리킬 때 쓴다 */
export function filterTabId(filter: ScheduleFilter): string {
  return `schedule-filter-tab-${filter}`;
}

const FILTERS = [
  { key: "all", labelKey: "schedule.filterAll" },
  { key: "upcoming", labelKey: "schedule.filterUpcoming" },
  { key: "past", labelKey: "schedule.filterPast" },
] as const satisfies readonly {
  key: ScheduleFilter;
  labelKey: TranslationKey;
}[];

/** 필터 값(화면 순서) */
const FILTER_KEYS: readonly ScheduleFilter[] = FILTERS.map(({ key }) => key);

export function FilterTabs({ value, onChange }: FilterTabsProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const itemProps = useRovingFocus({
    values: FILTER_KEYS,
    selected: value,
    onSelect: onChange,
    orientation: "horizontal",
  });

  return (
    <View
      role="tablist"
      aria-label={t("schedule.filterLabel")}
      style={styles.list}
    >
      {FILTERS.map(({ key, labelKey }) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            {...itemProps(key)}
            testID={`filter-${key}`}
            nativeID={filterTabId(key)}
            role="tab"
            aria-selected={selected}
            aria-controls={FILTER_PANEL_ID}
            onPress={() => onChange(key)}
            style={[
              styles.tab,
              {
                backgroundColor: selected
                  ? tokens.primary
                  : tokens.chipBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? tokens.onPrimary : tokens.chipText },
              ]}
            >
              {t(labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.xl },
  tab: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
  },
  label: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
