import { Check, ChevronDown } from "lucide-react-native";
import { type ReactElement, useCallback, useState } from "react";
import {
  type HostInstance,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToggleKeys } from "@/hooks/useToggleKeys";
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
  ScheduleItemId,
  ScheduleStatus,
  Vaccination,
  VaccinationCategory,
} from "@/types";

// 일정 카드(FR-06, 설계서 §5.8·§10.10, 사용자 결정 U-02). 원본처럼 카드 헤더만 토글 버튼이고, 그 왼쪽에 완료 체크박스가 있다(FR-14):
//   컨테이너 View schedule-card-{vaccinationId}-{doseNumber}(role 없음)
//   ├─ 헤더 줄 View
//   │   ├─ Pressable complete-checkbox(role="checkbox", aria-checked, 이름 "{이름+회차}: 접종 완료") — 44×44 터치 영역
//   │   └─ Pressable card-toggle(role="button", aria-expanded): status-dot · 이름+회차 · status-badge · category-badge · 질병 · schedule-date
//   └─ (펼쳤을 때만) 형제 View card-details: 소제목 3개(role="heading", aria-level 3) + 본문
// 체크박스는 토글 버튼 안에 넣지 않는다(버튼 안의 상호작용 요소는 접근성 트리에서 이름·동작이 겹친다). 그래서 토글의 접근 이름은
// 여전히 헤더 텍스트뿐이고, 상세는 제목 단위로 탐색된다. AI 버튼은 없다(FR-13). 펼침 state는 카드별로 독립이다.
// 완료 체크(U-19~U-22): completed면 상태 점·status-badge가 "완료"(statusCompleted, badgeCompleted*)로 바뀌고 카드는 지난 카드처럼
// 옅은 배경(surfaceMuted + textPast)이 된다. 구역 이동(완료 구역·지난 구역)은 화면이 정하고, 카드는 표시와 알림만 한다.
// 체크를 누르면 onToggleCompleted(id)를 부른다. 웹 Space는 useToggleKeys가, Enter·탭·화면 낭독기 두 번 탭은 onPress가 받는다.
// 화면은 registerCheckbox로 체크박스 호스트를 모아 토글 뒤 포커스를 옮기고(U-22), 네이티브에서 새로 마운트된 체크박스는
// onCheckboxLayout(네이티브 뷰 배치 뒤, V-01) 시점에 옮긴다.
// 제목은 로케일별 회차 표기 formatDoseLabel(lt(name), doseNumber, locale)이다(U-07, AD-28).
// 색은 CONTRAST_PAIRS 등록 쌍만 쓴다: 지남 카드(surfaceMuted) 글자는 textPast, 그 밖의 카드(surface)는 text/textSecondary,
// 상세 소제목은 text(surface·surfaceMuted 둘 다 등록), 배지는 badge*Text on badge*Background. 상태 점은 비텍스트 원본 색(P-08).
// category-badge는 분류(필수 = 국가예방접종, 선택 = 기타예방접종, U-15)다. 회차 category가 있으면 그것이(수두 2차),
// 없으면 백신 category다. 상태·완료와 무관하게 지남 카드에서도 같은 색이다.
// 체크박스 색: 체크 전 테두리는 카드 보조 글자색(surface 위 textSecondary, 옅은 카드 위 textPast), 체크 후 채움은 checkboxChecked,
// 체크 표시는 onCheckboxChecked(CONTRAST_PAIRS 등록 쌍)다.
export type ScheduleCardProps = {
  readonly item: ScheduleItem;
  /** 지금 생년월일에서 이 항목을 완료 체크했는가 */
  readonly completed: boolean;
  /** 완료 체크박스를 눌렀을 때(체크·해제 모두) */
  readonly onToggleCompleted: (id: ScheduleItemId) => void;
  /** 체크박스 호스트를 등록(마운트)·해제(null)한다. 토글 뒤 포커스 이동 대상으로 쓴다(U-22) */
  readonly registerCheckbox?: (
    id: ScheduleItemId,
    node: HostInstance | null
  ) => void;
  /** 체크박스의 네이티브 배치가 끝났을 때(onLayout, V-01) */
  readonly onCheckboxLayout?: (id: ScheduleItemId) => void;
};

/** 카드 표시 상태: 일정 상태에 완료 체크를 덮어쓴 값(U-19·U-20) */
type CardStatus = ScheduleStatus | "completed";

const DOT_TOKENS = {
  past: "statusPast",
  soon: "statusSoon",
  upcoming: "statusUpcoming",
  completed: "statusCompleted",
} as const satisfies Readonly<Record<CardStatus, ThemeTokenKey>>;

const BADGE_TOKENS = {
  past: { background: "badgePastBackground", text: "badgePastText" },
  soon: { background: "badgeSoonBackground", text: "badgeSoonText" },
  upcoming: {
    background: "badgeUpcomingBackground",
    text: "badgeUpcomingText",
  },
  completed: {
    background: "badgeCompletedBackground",
    text: "badgeCompletedText",
  },
} as const satisfies Readonly<
  Record<
    CardStatus,
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

export function ScheduleCard({
  item,
  completed,
  onToggleCompleted,
  registerCheckbox,
  onCheckboxLayout,
}: ScheduleCardProps): ReactElement {
  const { t, lt, locale } = useI18n();
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { id, vaccination, dose, status } = item;
  const cardStatus: CardStatus = completed ? "completed" : status;
  // 지난 카드와 완료 카드는 옅은 배경(surfaceMuted) + textPast다(textPast on surfaceMuted 등록 쌍)
  const muted = status === "past" || completed;
  const primaryText = muted ? tokens.textPast : tokens.text;
  const secondaryText = muted ? tokens.textPast : tokens.textSecondary;
  const badge = BADGE_TOKENS[cardStatus];
  const category = dose.category ?? vaccination.category;
  const categoryBadge = CATEGORY_BADGE_TOKENS[category];
  const title = formatDoseLabel(lt(vaccination.name), dose.doseNumber, locale);

  const toggleCompleted = useCallback(
    () => onToggleCompleted(id),
    [onToggleCompleted, id]
  );
  const checkboxKeys = useToggleKeys(toggleCompleted);
  const checkboxRef = useCallback(
    (node: HostInstance | null) => registerCheckbox?.(id, node),
    [registerCheckbox, id]
  );

  return (
    <View
      testID={`schedule-card-${id}`}
      style={[
        styles.card,
        {
          backgroundColor: muted ? tokens.surfaceMuted : tokens.surface,
          borderColor: tokens.border,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          ref={checkboxRef}
          testID="complete-checkbox"
          role="checkbox"
          aria-checked={completed}
          aria-label={`${title}: ${t("schedule.markCompleted")}`}
          onPress={toggleCompleted}
          onLayout={() => onCheckboxLayout?.(id)}
          {...checkboxKeys}
          style={styles.checkbox}
        >
          <View
            testID="complete-checkbox-box"
            style={[
              styles.checkboxBox,
              completed
                ? {
                    backgroundColor: tokens.checkboxChecked,
                    borderColor: tokens.checkboxChecked,
                  }
                : { borderColor: secondaryText },
            ]}
          >
            {completed ? (
              <Check
                color={tokens.onCheckboxChecked}
                size={16}
                strokeWidth={3}
              />
            ) : null}
          </View>
        </Pressable>
        <Pressable
          testID="card-toggle"
          role="button"
          aria-expanded={expanded}
          onPress={() => setExpanded((previous) => !previous)}
          style={styles.header}
        >
          <View
            testID="status-dot"
            style={[
              styles.dot,
              { backgroundColor: tokens[DOT_TOKENS[cardStatus]] },
            ]}
          />
          <View style={styles.summary}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: primaryText }]}>
                {title}
              </Text>
              <View
                testID="status-badge"
                style={[
                  styles.badge,
                  { backgroundColor: tokens[badge.background] },
                ]}
              >
                <Text style={[styles.badgeText, { color: tokens[badge.text] }]}>
                  {t(`schedule.${cardStatus}`)}
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
              {formatDateRange(
                item.scheduledDate,
                item.scheduledEndDate,
                locale
              )}
            </Text>
          </View>
          <View style={expanded ? styles.chevronOpen : undefined}>
            <ChevronDown color={secondaryText} size={16} />
          </View>
        </Pressable>
      </View>
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
  headerRow: { flexDirection: "row", alignItems: "flex-start" },
  // 44×44 터치 영역. 안의 22pt 상자가 제목 줄(헤더 padding lg) 높이에 오도록 위 여백을 xs만 둔다
  checkbox: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: RADIUS.sm / 2,
  },
  header: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingRight: SPACING.lg,
    paddingLeft: SPACING.xs,
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
