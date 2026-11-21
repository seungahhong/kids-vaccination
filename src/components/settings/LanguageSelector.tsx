import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useRovingFocus } from "@/hooks/useRovingFocus";
import { LOCALE_OPTIONS } from "@/lib/locale";
import { FONT_SIZE, MIN_CONTROL_HEIGHT, RADIUS, SPACING } from "@/theme/tokens";
import type { Locale } from "@/types";

import { LanguagePressable } from "./LanguagePressable";

// 언어 4개 선택(FR-09, 설계서 §5.8): role="radiogroup" 안의 role="radio" + aria-checked, testID locale-option-{ko|en|ja|zh}.
// 보이는 내용은 국기 + 자국어명(LOCALE_OPTIONS, P3)이고 접근 이름은 aria-label={nativeName}로 국기 이모지를 이름에서 뺀다.
// 색은 CONTRAST_PAIRS 등록 쌍만 쓴다(선택: onPrimarySoft/primarySoft, 비선택: text/surface). 국기 텍스트에도 같은 색을 지정해
// 웹 기본 검정 글자가 다크 배경 위에 남지 않게 한다(G-6 (b) 렌더 대비 스캔). 저장은 onChange(I18nContext.setLocale)가 맡는다.
// 항목은 자기 언어로 읽히도록 LanguagePressable(iOS accessibilityLanguage·웹 lang)이다(리뷰 R1-16, WCAG 3.1.2).
// 웹 키보드(Space 선택·방향키 이동·선택 항목만 Tab 정지)는 useRovingFocus가 맡는다(리뷰 R1-04, 네이티브는 no-op).
// 헤더 언어 목록(FR-15, AppHeader)도 이 컴포넌트를 쓴다. 그때는 testID 접두어를 바꿔 설정 화면 항목과 겹치지 않게 하고,
// 항목을 눌렀을 때(탭·클릭·Enter)만 onPick으로 알려 목록을 닫는다. 방향키·Space는 고르기만 하고 닫지 않는다(라디오 그룹 이동 유지).

/** 언어 옵션 값(화면 순서) */
const LOCALE_CODES: readonly Locale[] = LOCALE_OPTIONS.map(({ code }) => code);

export type LanguageSelectorProps = {
  readonly value: Locale;
  readonly onChange: (next: Locale) => void;
  /** 항목을 눌러 고른 뒤(onChange 다음) 부른다. 헤더 언어 목록이 닫을 때 쓴다 */
  readonly onPick?: (picked: Locale) => void;
  /** 항목 testID 접두어(기본 locale-option → locale-option-ko) */
  readonly testIDPrefix?: string;
};

export function LanguageSelector({
  value,
  onChange,
  onPick,
  testIDPrefix = "locale-option",
}: LanguageSelectorProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const itemProps = useRovingFocus({
    values: LOCALE_CODES,
    selected: value,
    onSelect: onChange,
  });

  return (
    <View
      role="radiogroup"
      aria-label={t("settings.language")}
      style={styles.group}
    >
      {LOCALE_OPTIONS.map(({ code, flag, nativeName }) => {
        const checked = code === value;
        const color = checked ? tokens.onPrimarySoft : tokens.text;
        return (
          <LanguagePressable
            key={code}
            {...itemProps(code)}
            language={code}
            testID={`${testIDPrefix}-${code}`}
            role="radio"
            aria-checked={checked}
            aria-label={nativeName}
            onPress={() => {
              onChange(code);
              onPick?.(code);
            }}
            style={[
              styles.option,
              {
                backgroundColor: checked ? tokens.primarySoft : tokens.surface,
              },
            ]}
          >
            <Text style={[styles.flag, { color }]}>{flag}</Text>
            <Text style={[styles.label, { color }]}>{nativeName}</Text>
            {checked ? <Text style={[styles.check, { color }]}>✓</Text> : null}
          </LanguagePressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACING.xs },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: MIN_CONTROL_HEIGHT,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
  },
  flag: { fontSize: FONT_SIZE.lg },
  label: { flex: 1, fontSize: FONT_SIZE.md },
  check: { fontSize: FONT_SIZE.md, fontWeight: "700" },
});
