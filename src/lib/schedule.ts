import { addDays, addMonthsClamped, compareDay, startOfDay } from "@/lib/date";
import type {
  Locale,
  RecommendedAge,
  ScheduleFilter,
  ScheduleGroup,
  ScheduleItem,
  ScheduleSection,
  ScheduleStatus,
  Vaccination,
} from "@/types";

// 일정 계산 순수 모듈(설계서 §5.2). 시각은 항상 인자 `now`로 받는다(T6 결함 3 — 내부 `new Date()` 금지).

/** 시작일이 오늘부터 이 일수 안이면 "곧 접종" */
export const SOON_WINDOW_DAYS = 30;

export function calculateScheduleDate(
  birthdate: Date,
  age: Pick<RecommendedAge, "minMonths" | "maxMonths">
): { start: Date; end?: Date } {
  const start = addMonthsClamped(birthdate, age.minMonths);
  const end =
    age.maxMonths === undefined
      ? undefined
      : addMonthsClamped(birthdate, age.maxMonths);
  return { start, end };
}

/**
 * past: (종료일 ?? 시작일)이 오늘보다 앞 · soon: 시작일이 오늘+30일 이내(접종 기간 중 포함, 오늘 시작 포함) · 그 밖은 upcoming.
 * 모든 비교는 로컬 일 단위다(AC-5.1). +30일은 달력 일 덧셈이라 DST 전환일을 지나도 어긋나지 않는다(AC-5.2).
 */
export function determineStatus(
  start: Date,
  end: Date | undefined,
  now: Date
): ScheduleStatus {
  const today = startOfDay(now);
  const limit = addDays(today, SOON_WINDOW_DAYS);
  if (compareDay(end ?? start, today) < 0) return "past";
  if (compareDay(start, limit) <= 0) return "soon";
  return "upcoming";
}

export function generateSchedule(
  birthdate: Date,
  vaccinations: readonly Vaccination[],
  now: Date
): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  for (const vaccination of vaccinations) {
    for (const dose of vaccination.doses) {
      const { start, end } = calculateScheduleDate(
        birthdate,
        dose.recommendedAge
      );
      items.push({
        id: `${vaccination.id}-${dose.doseNumber}`,
        vaccination,
        dose,
        scheduledDate: start,
        scheduledEndDate: end,
        status: determineStatus(start, end, now),
      });
    }
  }

  // (시작일, 원래 인덱스) 2단 키로 명시 정렬한다. 엔진의 안정 정렬에 기대지 않는다(AC-4.4: bcg-1 → hepb-1)
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        a.item.scheduledDate.getTime() - b.item.scheduledDate.getTime() ||
        a.index - b.index
    )
    .map(({ item }) => item);
}

/** 'all' → 복사본, 'upcoming' → soon|upcoming, 'past' → past. 원래 순서 유지, 입력 불변(AC-7.5) */
export function filterSchedule(
  items: readonly ScheduleItem[],
  filter: ScheduleFilter
): ScheduleItem[] {
  switch (filter) {
    case "all":
      return [...items];
    case "upcoming":
      return items.filter(
        (item) => item.status === "soon" || item.status === "upcoming"
      );
    case "past":
      return items.filter((item) => item.status === "past");
  }
}

/** 권장 월령(minMonths)별 그룹. minMonths 오름차순, 그룹 안에서는 입력 순서 유지. 빈 입력 → [] (AC-6.4) */
export function groupScheduleByAge(
  items: readonly ScheduleItem[]
): ScheduleGroup[] {
  const groups = new Map<number, ScheduleItem[]>();
  for (const item of items) {
    const key = item.dose.recommendedAge.minMonths;
    const existing = groups.get(key);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([minMonths, groupItems]) => ({ minMonths, items: groupItems }));
}

/**
 * 화면 목록 구역(AC-6.5, U-13). 'all'은 접종할 구역(soon|upcoming)을 위, 지난 구역(past)을 아래에 둔다.
 * 'upcoming'·'past'는 그 구역 하나다. 구역마다 groupScheduleByAge로 묶으므로 지난 항목과 남은 항목이 섞인
 * 월령 그룹은 두 구역에 나뉜다. 빈 구역은 뺀다(빈 입력 → [])
 */
export function sectionSchedule(
  items: readonly ScheduleItem[],
  filter: ScheduleFilter
): ScheduleSection[] {
  const kinds: readonly ScheduleSection["kind"][] =
    filter === "all" ? ["upcoming", "past"] : [filter];
  return kinds
    .map((kind) => ({
      kind,
      groups: groupScheduleByAge(filterSchedule(items, kind)),
    }))
    .filter((section) => section.groups.length > 0);
}

type MonthsLabels = {
  readonly birth: string;
  readonly months: (n: number) => string;
  /** rest = 남은 개월(0~11). 0이면 연만 쓴다 */
  readonly years: (n: number, rest: number) => string;
};

// 원본 규칙에 두 가지를 더했다. en은 months === 1일 때 단수 "1 month"(U-07). ≥24개월에서 12의 배수가 아니면 남은 개월을
// 붙인다(U-15: HPV 2차 150개월이 144개월과 같은 "만 12세" 헤더로 겹치지 않게). 연 단위는 ≥24개월이라 항상 2 이상(단수 불필요).
const MONTHS_LABELS: Readonly<Record<Locale, MonthsLabels>> = {
  ko: {
    birth: "출생 시",
    months: (n) => `생후 ${n}개월`,
    years: (n, rest) => (rest === 0 ? `만 ${n}세` : `만 ${n}세 ${rest}개월`),
  },
  en: {
    birth: "At birth",
    months: (n) => (n === 1 ? "1 month" : `${n} months`),
    years: (n, rest) =>
      rest === 0
        ? `${n} years`
        : `${n} years ${rest === 1 ? "1 month" : `${rest} months`}`,
  },
  ja: {
    birth: "出生時",
    months: (n) => `生後${n}ヶ月`,
    years: (n, rest) => (rest === 0 ? `${n}歳` : `${n}歳${rest}ヶ月`),
  },
  zh: {
    birth: "出生时",
    months: (n) => `出生后${n}个月`,
    years: (n, rest) => (rest === 0 ? `${n}岁` : `${n}岁${rest}个月`),
  },
};

/** 0 → 출생 시 / <24 → 생후 N개월 / ≥24 → 만 ⌊N/12⌋세(나머지가 있으면 + N%12개월) (4개 언어, AC-6.3) */
export function formatMonthsLabel(months: number, locale: Locale): string {
  const labels = MONTHS_LABELS[locale];
  if (months === 0) return labels.birth;
  if (months >= 24) return labels.years(Math.floor(months / 12), months % 12);
  return labels.months(months);
}
