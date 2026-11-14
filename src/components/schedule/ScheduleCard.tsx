import { ChevronDown } from "lucide-react-native";
import { type ReactElement, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import type { TranslationKey } from "@/i18n/types";
import { formatDateRange, formatDoseLabel } from "@/lib/format";
import {
  FONT_SIZE,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACING,
  type ThemeTokenKey,
} from "@/theme/tokens";
import type {
  ScheduleItem,
  ScheduleStatus,
  Vaccination,
  VaccinationCategory,
} from "@/types";

// 일정 카드(FR-06, 설계서 §5.8·§10.10, 사용자 결정 U-02). 원본처럼 카드 헤더만 토글 버튼이다:
//   컨테이너 View schedule-card-{vaccinationId}-{doseNumber}(role 없음)
//   ├─ 헤더 Pressable card-toggle(role="button", aria-expanded): status-dot · 이름+회차 · status-badge · category-badge · 질병 · schedule-date
//   └─ (펼쳤을 때만) 형제 View card-details: 소제목 3개(role="heading", aria-level 3) + 본문
// 그래서 토글의 접근 이름은 헤더 텍스트뿐이고, 상세는 제목 단위로 탐색된다. AI 버튼은 없다(FR-13). 펼침 state는 카드별로 독립이다.
// 제목은 로케일별 회차 표기 formatDoseLabel(lt(name), doseNumber, locale)이다(U-07, AD-28).
// 색은 CONTRAST_PAIRS 등록 쌍만 쓴다: 지남 카드(surfaceMuted) 글자는 textPast, 그 밖의 카드(surface)는 text/textSecondary,
// 상세 소제목은 text(surface·surfaceMuted 둘 다 등록), 배지는 badge*Text on badge*Background. 상태 점은 비텍스트 원본 색(P-08).
// category-badge는 분류(필수 = 국가예방접종, 선택 = 기타예방접종, U-15)다. 회차 category가 있으면 그것이(수두 2차),
// 없으면 백신 category다. 상태와 무관하게 지남 카드에서도 같은 색이다.
export type ScheduleCardProps = {
  readonly item: ScheduleItem;
};

const DOT_TOKENS = {
  past: "statusPast",
  soon: "statusSoon",
  upcoming: "statusUpcoming",
} as const satisfies Readonly<Record<ScheduleStatus, ThemeTokenKey>>;

const BADGE_TOKENS = {
  past: { background: "badgePastBackground", text: "badgePastText" },
  soon: { background: "badgeSoonBackground", text: "badgeSoonText" },
  upcoming: {
    background: "badgeUpcomingBackground",
    text: "badgeUpcomingText",
  },
} as const satisfies Readonly<
  Record<
    ScheduleStatus,
    { readonly background: ThemeTokenKey; readonly text: ThemeTokenKey }
  >
>;

const CATEGORY_BADGE_TOKENS = {
  national: {
    background: "badgeNationalBackground",
    text: "badgeNationalText",
  },
  optional: {
    background: "badgeOptionalBackground",
    text: "badgeOptionalText",
  },
} as const satisfies Readonly<
  Record<
    VaccinationCategory,
    { readonly background: ThemeTokenKey; readonly text: ThemeTokenKey }
  >
>;

/** 펼침 상세의 소제목 키와 본문 필드(화면 순서) */
const DETAIL_SECTIONS = [
  { titleKey: "schedule.detail", field: "description" },
  { titleKey: "schedule.sideEffects", field: "sideEffects" },
  { titleKey: "schedule.notes", field: "notes" },
] as const satisfies readonly {
  titleKey: TranslationKey;
  field: keyof Vaccination;
}[];

export function ScheduleCard({ item }: ScheduleCardProps): ReactElement {
  const { t, lt, locale } = useI18n();
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { vaccination, dose, status } = item;
  const isPast = status === "past";
  const primaryText = isPast ? tokens.textPast : tokens.text;
  const secondaryText = isPast ? tokens.textPast : tokens.textSecondary;
  const badge = BADGE_TOKENS[status];
  const category = dose.category ?? vaccination.category;
  const categoryBadge = CATEGORY_BADGE_TOKENS[category];

  return (
    <View
      testID={`schedule-card-${item.id}`}
      style={[
        styles.card,
        {
          backgroundColor: isPast ? tokens.surfaceMuted : tokens.surface,
          borderColor: tokens.border,
        },
      ]}
    >
      <Pressable
        testID="card-toggle"
        role="button"
        aria-expanded={expanded}
        onPress={() => setExpanded((previous) => !previous)}
        style={styles.header}
      >
        <View
          testID="status-dot"
          style={[styles.dot, { backgroundColor: tokens[DOT_TOKENS[status]] }]}
        />
        <View style={styles.summary}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: primaryText }]}>
              {formatDoseLabel(lt(vaccination.name), dose.doseNumber, locale)}
            </Text>
            <View
              testID="status-badge"
              style={[
                styles.badge,
                { backgroundColor: tokens[badge.background] },
              ]}
            >
              <Text style={[styles.badgeText, { color: tokens[badge.text] }]}>
                {t(`schedule.${status}`)}
              </Text>
            </View>
            <View
              testID="category-badge"
              style={[
                styles.badge,
                { backgroundColor: tokens[categoryBadge.background] },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: tokens[categoryBadge.text] },
                ]}
              >
                {t(`schedule.${category}`)}
              </Text>
            </View>
          </View>
          <Text style={[styles.disease, { color: secondaryText }]}>
            {lt(vaccination.disease)}
          </Text>
          <Text
            testID="schedule-date"
            style={[styles.date, { color: primaryText }]}
          >
            {formatDateRange(item.scheduledDate, item.scheduledEndDate, locale)}
          </Text>
        </View>
        <View style={expanded ? styles.chevronOpen : undefined}>
          <ChevronDown color={secondaryText} size={16} />
        </View>
      </Pressable>
      {expanded && (
        <View
          testID="card-details"
          style={[styles.details, { borderTopColor: tokens.border }]}
        >
          {DETAIL_SECTIONS.map(({ titleKey, field }) => (
            <View key={titleKey} style={styles.section}>
              <Text
                role="heading"
                aria-level={3}
                style={[styles.sectionTitle, { color: tokens.text }]}
              >
                {t(titleKey)}
              </Text>
              <Text style={[styles.sectionBody, { color: secondaryText }]}>
                {lt(vaccination[field])}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.md,
  },
  header: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  dot: {
    width: 12,
    height: 12,
    marginTop: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  summary: { flex: 1, gap: SPACING.xs },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: SPACING.sm,
  },
  title: { fontSize: FONT_SIZE.sm, fontWeight: "600", flexShrink: 1 },
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: FONT_SIZE.xs, fontWeight: "600" },
  disease: { fontSize: FONT_SIZE.xs },
  date: { fontSize: FONT_SIZE.xs },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  details: {
    gap: SPACING.md,
    borderTopWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  section: { gap: SPACING.xs },
  sectionTitle: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
  sectionBody: { fontSize: FONT_SIZE.sm, lineHeight: 20 },
});
