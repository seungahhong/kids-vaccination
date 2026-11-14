import type { ReactElement, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Disclaimer } from "@/components/common/Disclaimer";
import { Screen } from "@/components/common/Screen";
import { BabyInfoSection } from "@/components/settings/BabyInfoSection";
import { LanguageSelector } from "@/components/settings/LanguageSelector";
import { ThemeSelector } from "@/components/settings/ThemeSelector";
import { useBirthdate } from "@/contexts/BirthdateContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { FONT_SIZE, RADIUS, SPACING } from "@/theme/tokens";

// 설정 화면(설계서 §2.2·§5.9): 제목(role=heading) → 테마·언어·아기 정보 섹션 → 면책 문구(맨 아래, FR-12).
// 세 Context의 setter를 섹션에 그대로 연결하고 저장은 Context가 맡는다(§2.1 규칙 4).
// 초기화는 clearBirthdate만 호출한다 — 언어·테마 저장값은 건드리지 않는다(§5.9 D-13, AC-14.5).
// 제목 계층: 화면 제목은 role="heading"(웹 <h1>), 섹션 제목은 role="heading" + aria-level={2}(웹 <h2>)다(리뷰 R1-09).
// aria-level은 RN 0.88 타입에 선언돼 있지 않지만 하이픈 JSX 속성이라 타입 검사를 통과하고 네이티브에서는 무시된다
// (GroupHeader·ScheduleCard와 같은 방식). E2E는 화면 제목을 screen-settings 범위의 level 1 heading으로 찾는다(§5.8).
// 테마·언어 radiogroup은 aria-label로도 이름이 붙는다.
export default function SettingsScreen(): ReactElement {
  const { t, locale, setLocale } = useI18n();
  const { tokens, preference, setPreference } = useTheme();
  const { birthdate, clearBirthdate } = useBirthdate();

  return (
    <Screen testID="screen-settings" scroll>
      <Text role="heading" style={[styles.title, { color: tokens.text }]}>
        {t("settings.title")}
      </Text>
      <SettingsSection title={t("settings.theme")}>
        <ThemeSelector value={preference} onChange={setPreference} />
      </SettingsSection>
      <SettingsSection title={t("settings.language")}>
        <LanguageSelector value={locale} onChange={setLocale} />
      </SettingsSection>
      <SettingsSection title={t("settings.babyInfo")}>
        <BabyInfoSection birthdate={birthdate} onReset={clearBirthdate} />
      </SettingsSection>
      <Disclaimer />
    </Screen>
  );
}

/** 설정 섹션 카드: surface 배경 + border, 제목(level 2 heading)은 text on surface(CONTRAST_PAIRS 등록 쌍) */
function SettingsSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  const { tokens } = useTheme();

  return (
    <View
      style={[
        styles.section,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text
        role="heading"
        aria-level={2}
        style={[styles.sectionTitle, { color: tokens.text }]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FONT_SIZE.xl, fontWeight: "700" },
  section: {
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
  },
  sectionTitle: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
});
