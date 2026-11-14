import { useRouter } from "expo-router";
import { Fragment, type ReactElement, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Disclaimer } from "@/components/common/Disclaimer";
import { Screen } from "@/components/common/Screen";
import { EmptySchedule } from "@/components/schedule/EmptySchedule";
import {
  FILTER_PANEL_ID,
  FilterTabs,
  filterTabId,
} from "@/components/schedule/FilterTabs";
import { GroupHeader } from "@/components/schedule/GroupHeader";
import { ScheduleCard } from "@/components/schedule/ScheduleCard";
import { useBirthdate } from "@/contexts/BirthdateContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToday } from "@/hooks/useToday";
import { isoDateToDate, toIsoDate } from "@/lib/date";
import { generateSchedule, sectionSchedule } from "@/lib/schedule";
import { VACCINATIONS } from "@/lib/vaccinationData";
import { FONT_SIZE, MIN_TOUCH_TARGET, SPACING } from "@/theme/tokens";
import type { IsoDate, ScheduleFilter } from "@/types";

// 일정 화면(FR-03~07·12, 설계서 §2.2·§5.9). 생년월일이 없으면(손상 값 포함, AC-18.5) 제목과 EmptySchedule만 렌더한다
// (필터·면책 미표시, P-12). 제목은 빈 상태에도 둔다 — 다른 화면처럼 화면 제목 heading으로 탐색할 수 있게 한다(리뷰 R1-08).
// 있으면 제목(role=heading → 웹 <h1>) · schedule-birthdate · Disclaimer(placement "top", U-14) · FilterTabs ·
// 목록 패널(role="tabpanel": 월령 그룹 GroupHeader + ScheduleCard) 순이다. 패널은 aria-labelledby로 선택된 필터 탭에 이어진다(리뷰 R1-05).
// 패널은 sectionSchedule의 구역 순서다: "전체"는 접종할 구역(곧 접종·예정)이 위, 지난 구역이 아래이고(U-13),
// 지난 구역이 접종할 구역 뒤에 올 때만 그 앞에 구역 제목 PastSectionTitle을 둔다(월령 그룹이 출생 시부터 다시 시작하므로).
// 결과 0건이면 패널이 비어 Tab 정지점이 없으므로 패널 자체를 Tab 정지점(tabIndex 0)으로 둔다(APG 탭 패턴, 리뷰 R2-05).
// 그때 패널은 최소 높이 MIN_TOUCH_TARGET의 상자다. 높이 0이면 포커스 링이 그려지지 않아 포커스가 사라진 것처럼 보인다
// (WCAG 2.4.7, 리뷰 R3-01). 안내 문구는 넣지 않는다(AC-7.4·A-6: 안내 없이 빈 목록).
// 결과가 있으면 첫 정지점이 카드 토글이라 패널에는 두지 않고, 높이도 카드가 정한다.
// 목록은 Screen의 ScrollView + map으로 카드(41장)를 모두 렌더한다(비가상화, P-16 — 가상화하면 카드 수 판정이 불가능).
// 일정은 [birthdate, todayKey]에만 의존한다: todayKey는 useToday()의 날짜 문자열이라 같은 날에는 재계산하지 않고,
// 앱 복귀 시 날짜가 바뀌면 상태를 다시 판정한다(AC-5.6). 구역은 [schedule, filter]에 의존하고 0건 필터는 필터·면책만 남는다(AC-7.4).
export default function ScheduleScreen(): ReactElement {
  const { birthdate } = useBirthdate();
  const router = useRouter();

  if (birthdate === null) {
    return (
      <Screen testID="screen-schedule" scroll>
        <ScheduleTitle />
        <EmptySchedule onGoHome={() => router.navigate("/")} />
      </Screen>
    );
  }

  // 탭 화면은 언마운트되지 않으므로, 생년월일이 바뀌면 key로 본문을 다시 마운트해 필터("전체")·카드 펼침·스크롤 위치를
  // 처음 상태로 되돌린다(원본은 진입마다 "전체", 리뷰 R1-06). 홈 HomeForm의 key 방식과 같다(설계서 §5.9).
  return <ScheduleBody key={birthdate} birthdate={birthdate} />;
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

/** "전체"에서 지난 구역 앞의 구역 제목(role=heading + aria-level 2 → 웹 <h2>, 월령 GroupHeader와 같은 단계) */
function PastSectionTitle(): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();

  return (
    <Text
      testID="schedule-past-section"
      role="heading"
      aria-level={2}
      style={[styles.sectionTitle, { color: tokens.text }]}
    >
      {t("schedule.pastSection")}
    </Text>
  );
}

/** 생년월일이 있을 때의 일정 본문. 필터 state는 생년월일마다 새로 시작한다(부모의 key) */
function ScheduleBody({
  birthdate,
}: {
  readonly birthdate: IsoDate;
}): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
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
    () => sectionSchedule(schedule, filter),
    [schedule, filter]
  );
  const empty = sections.length === 0;

  return (
    <Screen testID="screen-schedule" scroll>
      <ScheduleTitle />
      <Text
        testID="schedule-birthdate"
        style={[styles.birthdate, { color: tokens.textSecondary }]}
      >
        {`${t("schedule.birthdate")}: ${birthdate}`}
      </Text>
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
            {index > 0 ? <PastSectionTitle /> : null}
            {section.groups.map((group) => (
              <View key={group.minMonths} style={styles.group}>
                <GroupHeader minMonths={group.minMonths} />
                {group.items.map((item) => (
                  <ScheduleCard key={item.id} item={item} />
                ))}
              </View>
            ))}
          </Fragment>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: FONT_SIZE.xl, fontWeight: "700" },
  birthdate: {
    fontSize: FONT_SIZE.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.xl,
  },
  group: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: "700",
    marginTop: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  emptyPanel: { minHeight: MIN_TOUCH_TARGET },
});
