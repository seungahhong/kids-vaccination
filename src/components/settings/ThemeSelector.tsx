import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRovingFocus } from "@/hooks/useRovingFocus";
import type { TranslationKey } from "@/i18n/types";
import { THEME_PREFERENCES } from "@/lib/themePreference";
import { FONT_SIZE, MIN_CONTROL_HEIGHT, RADIUS, SPACING } from "@/theme/tokens";
import type { ThemePreference } from "@/types";

// 테마 선택(FR-08, 설계서 §5.8): role="radiogroup" 안의 role="radio" + aria-checked, testID theme-option-{light|dark}.
// v1.5(U-24)에서 "시스템"을 없애고 라이트·다크 2개가 됐다. 옵션 순서는 THEME_PREFERENCES다.
// 선택/비선택 색은 CONTRAST_PAIRS 등록 쌍(onPrimary/primary, chipText/chipBackground)만 쓴다.
// 저장은 호출자가 넘긴 onChange(ThemeContext.setPreference)가 맡는다(AC-11.3·11.4). 헤더 테마 스위치(FR-15)와 같은 상태다.
// 웹 키보드(Space 선택·방향키 이동·선택 항목만 Tab 정지)는 useRovingFocus가 맡는다(리뷰 R1-04, 네이티브는 no-op).

export type ThemeSelectorProps = {
  readonly value: ThemePreference;
  readonly onChange: (next: ThemePreference) => void;
};

const LABEL_KEYS = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
} as const satisfies Readonly<Record<ThemePreference, TranslationKey>>;

export function ThemeSelector({
  value,
  onChange,
}: ThemeSelectorProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const itemProps = useRovingFocus({
    values: THEME_PREFERENCES,
    selected: value,
    onSelect: onChange,
  });

  return (
    <View
      role="radiogroup"
      aria-label={t("settings.theme")}
      style={styles.group}
    >
      {THEME_PREFERENCES.map((preference) => {
        const checked = preference === value;
        return (
          <Pressable
            key={preference}
            {...itemProps(preference)}
            testID={`theme-option-${preference}`}
            role="radio"
            aria-checked={checked}
            onPress={() => onChange(preference)}
            style={[
              styles.option,
              {
                backgroundColor: checked
                  ? tokens.primary
                  : tokens.chipBackground,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: checked ? tokens.onPrimary : tokens.chipText },
              ]}
            >
              {t(LABEL_KEYS[preference])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", gap: SPACING.sm },
  option: {
    flex: 1,
    minHeight: MIN_CONTROL_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
  },
  label: { fontSize: FONT_SIZE.md, fontWeight: "600" },
});
