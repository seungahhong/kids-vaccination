import { useRouter } from "expo-router";
import {
  Fragment,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  type HostInstance,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Disclaimer } from "@/components/common/Disclaimer";
import { moveFocus } from "@/components/common/moveFocus";
import { Screen } from "@/components/common/Screen";
import { EmptySchedule } from "@/components/schedule/EmptySchedule";
import {
  FILTER_PANEL_ID,
  FilterTabs,
  filterTabId,
} from "@/components/schedule/FilterTabs";
import { GroupHeader } from "@/components/schedule/GroupHeader";
import { ScheduleCard } from "@/components/schedule/ScheduleCard";
import { ChildSelector } from "@/components/schedule/ChildSelector";
import { useChildren } from "@/contexts/ChildrenContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToday } from "@/hooks/useToday";
import { formatMessage } from "@/i18n/translate";
import { formatDoseLabel } from "@/lib/format";
import { isoDateToDate, toIsoDate } from "@/lib/date";
import type { TranslationKey } from "@/i18n/types";
import {
  focusTargetAfterToggle,
  generateSchedule,
  sectionSchedule,
} from "@/lib/schedule";
import { VACCINATIONS } from "@/lib/vaccinationData";
import { FONT_SIZE, MIN_TOUCH_TARGET, SPACING } from "@/theme/tokens";
import type {
  Child,
  ScheduleFilter,
  ScheduleItemId,
  ScheduleSectionKind,
} from "@/types";

// 일정 화면(FR-03~07·12·16, 설계서 §2.2·§5.9). 저장된 아이가 없으면(손상 값 포함, AC-18.5) 제목과 EmptySchedule만 렌더한다
// (필터·면책 미표시, P-12). 제목은 빈 상태에도 둔다 — 다른 화면처럼 화면 제목 heading으로 탐색할 수 있게 한다(리뷰 R1-08).
// 있으면 제목(role=heading → 웹 <h1>) · 아이 선택 ChildSelector(FR-16, v1.6까지는 schedule-birthdate 줄) · Disclaimer(placement "top", U-14) · FilterTabs ·
// 목록 패널(role="tabpanel": 월령 그룹 GroupHeader + ScheduleCard) 순이다. 패널은 aria-labelledby로 선택된 필터 탭에 이어진다(리뷰 R1-05).
// 패널은 sectionSchedule의 구역 순서다: "전체"는 접종할 구역(곧 접종·예정) → 완료 구역(완료 체크한 곧 접종·예정, U-19)
// → 지난 구역이고(U-13), "예정"은 접종할 구역 → 완료 구역이다. 첫 구역이 아닌 구역 앞에만 구역 제목 SectionTitle
// ("접종 완료" schedule-completed-section / "지난 접종" schedule-past-section)을 둔다(월령 그룹이 출생 시부터 다시 시작하므로).
// 완료 체크(FR-14): 카드의 체크박스가 ChildrenContext.toggleCompleted를 부르고, 완료 기록은 선택된 아이에 저장된다(FR-16).
// 체크로 카드가 다른 구역으로 옮겨 가면 그 카드는 새로 마운트되어 포커스가 사라진다. 그래서 토글 전에 그 카드 바로 다음 카드
// (마지막이면 바로 앞 카드)를 계산해 두고(focusTargetAfterToggle), 커밋 뒤 그 카드의 체크박스로 포커스를 옮긴다(U-22).
// 시점(V-01): 웹과 "다시 마운트되지 않은 카드"는 커밋 직후(effect)에, 네이티브에서 새로 마운트된 카드(목록에 그 카드 하나뿐이라
// 자신이 대상인 경우)는 그 체크박스의 onLayout에서 옮긴다.
// 결과 0건이면 패널이 비어 Tab 정지점이 없으므로 패널 자체를 Tab 정지점(tabIndex 0)으로 둔다(APG 탭 패턴, 리뷰 R2-05).
// 그때 패널은 최소 높이 MIN_TOUCH_TARGET의 상자다. 높이 0이면 포커스 링이 그려지지 않아 포커스가 사라진 것처럼 보인다
// (WCAG 2.4.7, 리뷰 R3-01). 안내 문구는 넣지 않는다(AC-7.4·A-6: 안내 없이 빈 목록).
// 결과가 있으면 첫 정지점이 카드 토글이라 패널에는 두지 않고, 높이도 카드가 정한다.
// 목록은 Screen의 ScrollView + map으로 카드(41장)를 모두 렌더한다(비가상화, P-16 — 가상화하면 카드 수 판정이 불가능).
// 일정은 [선택된 아이의 생년월일, todayKey]에만 의존한다: todayKey는 useToday()의 날짜 문자열이라 같은 날에는 재계산하지 않고,
// 앱 복귀 시 날짜가 바뀌면 상태를 다시 판정한다(AC-5.6). 구역은 [schedule, filter, 완료]에 의존하고 0건 필터는 필터·면책만 남는다(AC-7.4).
export default function ScheduleScreen(): ReactElement {
  const { children, activeChild, selectChild } = useChildren();
  const router = useRouter();

  if (activeChild === null) {
    return (
      <Screen testID="screen-schedule" scroll>
        <ScheduleTitle />
        <EmptySchedule onGoHome={() => router.navigate("/")} />
      </Screen>
    );
  }

  // 탭 화면은 언마운트되지 않으므로, 선택된 아이(또는 그 생년월일)가 바뀌면 key로 본문을 다시 마운트해 필터("전체")·카드 펼침을
  // 처음 상태로 되돌린다(원본은 진입마다 "전체", 리뷰 R1-06). 아이 선택 칩은 key 밖에 둔다 — 함께 다시 마운트되면 방향키로 칩을
  // 고를 때 키보드 포커스가 사라진다. 홈 HomeForm의 key 방식과 같다(설계서 §5.9).
  return (
    <Screen testID="screen-schedule" scroll>
      <ScheduleTitle />
      <ChildSelector
        items={children}
        selected={activeChild.id}
        onSelect={selectChild}
      />
      <ScheduleBody
        key={`${activeChild.id}:${activeChild.birthdate}`}
        child={activeChild}
      />
    </Screen>
  );
}

/** 화면 제목(role=heading → 웹 <h1>) */
function ScheduleTitle(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <Text role="heading" style={[styles.title, { color: tokens.text }]}>
      {t("schedule.title")}
    </Text>
  );
}

/** 첫 구역 뒤에 오는 구역의 제목(testID·번역 키). 접종할 구역은 항상 첫 구역이라 제목이 없다 */
const SECTION_TITLES = {
  completed: {
    testID: "schedule-completed-section",
    key: "schedule.completedSection",
  },
  past: { testID: "schedule-past-section", key: "schedule.pastSection" },
} as const satisfies Readonly<
  Record<
    Exclude<ScheduleSectionKind, "upcoming">,
    { readonly testID: string; readonly key: TranslationKey }
  >
>;

/** 첫 구역 뒤 구역 제목(role=heading + aria-level 2 → 웹 <h2>, 월령 GroupHeader와 같은 단계) */
function SectionTitle({
  kind,
}: {
  readonly kind: Exclude<ScheduleSectionKind, "upcoming">;
}): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const { testID, key } = SECTION_TITLES[kind];

  return (
    <Text
      testID={testID}
      role="heading"
      aria-level={2}
      style={[styles.sectionTitle, { color: tokens.text }]}
    >
      {t(key)}
    </Text>
  );
}

/** 완료 토글 뒤 포커스를 받을 체크박스. remounted = 그 카드가 이번 커밋에서 새로 마운트된다(토글한 카드 자신) */
type PendingFocus = {
  readonly target: ScheduleItemId;
  readonly remounted: boolean;
};

/** 선택된 아이의 일정 본문(면책·필터·목록). 필터 state는 아이마다 새로 시작한다(부모의 key) */
function ScheduleBody({ child }: { readonly child: Child }): ReactElement {
  const { toggleCompleted } = useChildren();
  const { t, lt, locale } = useI18n();
  const { tokens } = useTheme();
  const { birthdate } = child;
  const completedIds = useMemo(
    () => new Set(child.completed),
    [child.completed]
  );
  const [filter, setFilter] = useState<ScheduleFilter>("all");
  // 의존성은 Date identity가 아니라 날짜 문자열이다(설계서 §5.6). 본문도 todayKey만 써서 의존성 배열과 일치시킨다
  const todayKey = toIsoDate(useToday());
  const schedule = useMemo(
    () =>
      generateSchedule(
        isoDateToDate(birthdate),
        VACCINATIONS,
        isoDateToDate(todayKey)
      ),
    [birthdate, todayKey]
  );
  const sections = useMemo(
    () => sectionSchedule(schedule, filter, completedIds),
    [schedule, filter, completedIds]
  );
  const empty = sections.length === 0;

  // 완료 체크박스 호스트(id → 노드)와 토글 뒤 포커스 요청. 렌더 중에는 읽지 않는다(ref 콜백·effect·onLayout에서만)
  const checkboxes = useRef(new Map<ScheduleItemId, HostInstance>());
  const pendingFocus = useRef<PendingFocus | null>(null);

  const registerCheckbox = useCallback(
    (id: ScheduleItemId, node: HostInstance | null) => {
      if (node === null) checkboxes.current.delete(id);
      else checkboxes.current.set(id, node);
    },
    []
  );

  /** 남은 요청이 id면 그 체크박스로 포커스를 옮기고 요청을 비운다 */
  const flushFocus = useCallback((id: ScheduleItemId) => {
    if (pendingFocus.current?.target !== id) return;
    pendingFocus.current = null;
    moveFocus(checkboxes.current.get(id));
  }, []);

  // 완료 토글 결과 고지(리뷰 R4-03, WCAG 4.1.3): 토글한 카드는 다른 구역으로 옮겨 가고 포커스는 다음 카드로 가므로, 무엇이 바뀌었는지
  // 따로 알린다. 웹·Android는 아래의 보이지 않는 라이브 영역 글자가 바뀌면 낭독하고, iOS에는 라이브 영역이 없어 같은 문구를
  // 낭독 대기열 뒤에 보낸다(포커스 이동 낭독을 끊지 않음, ChildrenSection의 삭제 결과 고지와 같은 방식)
  const [announcement, setAnnouncement] = useState("");

  const handleToggleCompleted = useCallback(
    (id: ScheduleItemId) => {
      const target = focusTargetAfterToggle(schedule, filter, completedIds, id);
      pendingFocus.current =
        target === undefined ? null : { target, remounted: target === id };
      const item = schedule.find((entry) => entry.id === id);
      if (item !== undefined) {
        const name = formatDoseLabel(
          lt(item.vaccination.name),
          item.dose.doseNumber,
          locale
        );
        const key = completedIds.has(id)
          ? "schedule.unmarkedAnnouncement"
          : "schedule.markedAnnouncement";
        setAnnouncement(formatMessage(t(key), { name }));
      }
      toggleCompleted(id);
    },
    [schedule, filter, completedIds, toggleCompleted, t, lt, locale]
  );

  useEffect(() => {
    if (announcement === "" || Platform.OS !== "ios") return;
    AccessibilityInfo.announceForAccessibilityWithOptions(announcement, {
      queue: true,
    });
  }, [announcement]);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    // 네이티브에서 새로 마운트된 체크박스는 아직 네이티브 뷰가 없으므로 onLayout까지 기다린다(V-01)
    if (pending.remounted && Platform.OS !== "web") return;
    flushFocus(pending.target);
  }, [sections, flushFocus]);

  /** 체크박스 onLayout. 웹은 effect가 이미 옮겼으므로 무시한다 */
  const handleCheckboxLayout = useCallback(
    (id: ScheduleItemId) => {
      if (Platform.OS !== "web") flushFocus(id);
    },
    [flushFocus]
  );

  return (
    <>
      <Disclaimer placement="top" />
      <FilterTabs value={filter} onChange={setFilter} />
      <View
        role="tabpanel"
        nativeID={FILTER_PANEL_ID}
        aria-labelledby={filterTabId(filter)}
        tabIndex={empty ? 0 : undefined}
        style={empty ? styles.emptyPanel : undefined}
      >
        {sections.map((section, index) => (
          <Fragment key={section.kind}>
            {index > 0 && section.kind !== "upcoming" ? (
              <SectionTitle kind={section.kind} />
            ) : null}
            {section.groups.map((group) => (
              <View key={group.minMonths} style={styles.group}>
                <GroupHeader minMonths={group.minMonths} />
                {group.items.map((item) => (
                  <ScheduleCard
                    key={item.id}
                    item={item}
                    completed={completedIds.has(item.id)}
                    onToggleCompleted={handleToggleCompleted}
                    registerCheckbox={registerCheckbox}
                    onCheckboxLayout={handleCheckboxLayout}
                  />
                ))}
              </View>
            ))}
          </Fragment>
        ))}
      </View>
      <Text
        testID="schedule-announcement"
        accessibilityLiveRegion="polite"
        style={[styles.visuallyHidden, { color: tokens.text }]}
      >
        {announcement}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FONT_SIZE.xl, fontWeight: "700" },
  group: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: "700",
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  emptyPanel: { minHeight: MIN_TOUCH_TARGET },
  // 화면에는 보이지 않지만 접근성 트리에는 남는 1×1 영역(라이브 영역 낭독용). opacity 0·display none은 낭독기가 건너뛴다
  visuallyHidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    left: -10000,
  },
});
