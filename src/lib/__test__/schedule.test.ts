import { addDays, addMonthsClamped, startOfDay, toIsoDate } from "@/lib/date";
import {
  calculateScheduleDate,
  determineStatus,
  filterSchedule,
  flattenSections,
  focusTargetAfterToggle,
  formatMonthsLabel,
  generateSchedule,
  groupScheduleByAge,
  sectionKindOf,
  sectionSchedule,
} from "@/lib/schedule";
import { VACCINATIONS } from "@/lib/vaccinationData";
import type {
  Locale,
  ScheduleItem,
  ScheduleItemId,
  ScheduleStatus,
} from "@/types";
import { day, FIXED_NOW } from "../../../test-utils/render";

function countStatuses(
  items: readonly ScheduleItem[]
): Record<ScheduleStatus, number> {
  const counts: Record<ScheduleStatus, number> = {
    past: 0,
    soon: 0,
    upcoming: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/** 실제 vaccinations.json + 기본 주입 시각으로 만든 일정 */
function scheduleFor(birthdate: string, now: Date = FIXED_NOW): ScheduleItem[] {
  return generateSchedule(day(birthdate), VACCINATIONS, now);
}

function itemById(items: readonly ScheduleItem[], id: string): ScheduleItem {
  const found = items.find((item) => item.id === id);
  if (!found) throw new Error(`일정에 ${id}가 없다`);
  return found;
}

// AC-4.3 (FR-03): 생년월일 + 권장 월령 → 시작일/종료일(원본 calculateScheduleDate 2건 의도 이식)
describe("AC-4.3 calculateScheduleDate", () => {
  it("AC-4.3 생년월일 2024-01-15, {minMonths: 2} → start 2024-03-15, end undefined", () => {
    const result = calculateScheduleDate(day("2024-01-15"), { minMonths: 2 });

    expect(toIsoDate(result.start)).toBe("2024-03-15");
    expect(result.end).toBeUndefined();
  });

  it("AC-4.3 생년월일 2024-01-15, {minMonths: 15, maxMonths: 18} → start 2025-04-15, end 2025-07-15", () => {
    const result = calculateScheduleDate(day("2024-01-15"), {
      minMonths: 15,
      maxMonths: 18,
    });

    expect(toIsoDate(result.start)).toBe("2025-04-15");
    expect(result.end).toBeDefined();
    expect(result.end && toIsoDate(result.end)).toBe("2025-07-15");
  });
});

// AC-5.3 (FR-03 · T6 결함 3: 시각 의존). 시스템 시각을 2030-01-01로 바꿔도 주입한 now(2026-10-18 15:00)로만 판정해야 한다.
// 원본 determineStatus 5건의 의도를 now 주입으로 옮긴 것이다(원본 이식 ORIG #8~#12와 대응).
describe("AC-5.3 determineStatus는 시스템 시각이 아니라 주입한 now로 판정한다", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2030, 0, 1));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("AC-5.3 전제: 시스템 시각은 2030-01-01이고 주입 시각은 2026-10-18이다", () => {
    expect(new Date().getFullYear()).toBe(2030);
    expect(toIsoDate(FIXED_NOW)).toBe("2026-10-18");
  });

  it("AC-5.3 start 2020-01-01 → past", () => {
    expect(determineStatus(day("2020-01-01"), undefined, FIXED_NOW)).toBe(
      "past"
    );
  });

  it("AC-5.3 start now+15일(2026-11-02) → soon", () => {
    const start = addDays(startOfDay(FIXED_NOW), 15);

    expect(toIsoDate(start)).toBe("2026-11-02");
    expect(determineStatus(start, undefined, FIXED_NOW)).toBe("soon");
  });

  it("AC-5.3 start now+60일(2026-12-17) → upcoming", () => {
    const start = addDays(startOfDay(FIXED_NOW), 60);

    expect(toIsoDate(start)).toBe("2026-12-17");
    expect(determineStatus(start, undefined, FIXED_NOW)).toBe("upcoming");
  });

  it("AC-5.3 기간 2020-01-01~2020-06-01 → past", () => {
    expect(
      determineStatus(day("2020-01-01"), day("2020-06-01"), FIXED_NOW)
    ).toBe("past");
  });

  it("AC-5.3 기간 2020-01-01~2027-10-18(접종 기간 중) → soon", () => {
    expect(
      determineStatus(day("2020-01-01"), day("2027-10-18"), FIXED_NOW)
    ).toBe("soon");
  });

  it("AC-5.3 generateSchedule(2026-04-30, data, now)의 상태 집계는 past 13 / soon 8 / upcoming 20이다", () => {
    const schedule = generateSchedule(
      day("2026-04-30"),
      VACCINATIONS,
      FIXED_NOW
    );

    expect(countStatuses(schedule)).toEqual({
      past: 13,
      soon: 8,
      upcoming: 20,
    });
  });
});

// AC-5.1 (FR-03): 오늘 기준 경계. 두 TZ 모두 동일.
describe("AC-5.1 determineStatus 경계(now = 2026-10-18 15:00 로컬)", () => {
  const cases: readonly (readonly [
    string,
    string | undefined,
    ScheduleStatus,
  ])[] = [
    ["2026-10-17", undefined, "past"],
    ["2026-10-18", undefined, "soon"],
    ["2026-11-17", undefined, "soon"],
    ["2026-11-18", undefined, "upcoming"],
    ["2026-09-01", "2026-10-18", "soon"],
    ["2026-09-01", "2026-10-17", "past"],
    ["2026-09-01", "2027-01-01", "soon"],
    ["2026-12-01", "2027-01-01", "upcoming"],
  ];

  it.each(cases)("AC-5.1 start %s, end %s → %s", (start, end, expected) => {
    expect(
      determineStatus(
        day(start),
        end === undefined ? undefined : day(end),
        FIXED_NOW
      )
    ).toBe(expected);
  });

  it("AC-5.1 오늘 시작(2026-10-18)은 시각과 무관하게 soon이다(오늘은 지남이 아님)", () => {
    expect(
      determineStatus(
        day("2026-10-18"),
        undefined,
        new Date(2026, 9, 18, 23, 59)
      )
    ).toBe("soon");
    expect(
      determineStatus(day("2026-10-18"), undefined, new Date(2026, 9, 18, 0, 0))
    ).toBe("soon");
  });
});

// AC-5.2 (FR-03 · §0 주의점 4): +30일은 달력 일 덧셈. America/New_York 실행에서는 DST 종료일 2026-11-01을 경유한다.
describe("AC-5.2 DST 종료일(2026-11-01)을 경유하는 +30일 판정", () => {
  it("AC-5.2 start 2026-11-17 → soon, 2026-11-18 → upcoming (ms 덧셈이면 어긋나는 경계)", () => {
    expect(toIsoDate(addDays(startOfDay(FIXED_NOW), 30))).toBe("2026-11-17");
    expect(determineStatus(day("2026-11-17"), undefined, FIXED_NOW)).toBe(
      "soon"
    );
    expect(determineStatus(day("2026-11-18"), undefined, FIXED_NOW)).toBe(
      "upcoming"
    );
  });
});

// AC-4.4 (FR-03): 실제 데이터로 만든 일정(원본 generateSchedule 3건 의도 이식)
describe("AC-4.4 generateSchedule(2024-01-15, vaccinations.json, now)", () => {
  it("AC-4.4 길이는 41이다", () => {
    expect(scheduleFor("2024-01-15")).toHaveLength(41);
  });

  it("AC-4.4 시작일은 비내림차순이다", () => {
    const schedule = scheduleFor("2024-01-15");

    for (let i = 1; i < schedule.length; i += 1) {
      const previous = schedule[i - 1];
      const current = schedule[i];
      if (!previous || !current) throw new Error("일정 항목이 없다");
      expect(current.scheduledDate.getTime()).toBeGreaterThanOrEqual(
        previous.scheduledDate.getTime()
      );
    }
  });

  it("AC-4.4 [0]은 bcg 1회차 2024-01-15, [1]은 hepb 1회차 2024-01-15다(동일 날짜는 데이터 순서 유지)", () => {
    const [first, second] = scheduleFor("2024-01-15");

    expect(first?.id).toBe("bcg-1");
    expect(first?.vaccination.id).toBe("bcg");
    expect(first?.dose.doseNumber).toBe(1);
    expect(first && toIsoDate(first.scheduledDate)).toBe("2024-01-15");
    expect(second?.id).toBe("hepb-1");
    expect(second && toIsoDate(second.scheduledDate)).toBe("2024-01-15");
  });

  it("AC-4.4 hepb 2회차는 2024-02-15, 마지막 항목은 hpv 2회차 2036-07-15 ~ 2037-01-15다", () => {
    const schedule = scheduleFor("2024-01-15");
    const last = schedule[schedule.length - 1];

    expect(toIsoDate(itemById(schedule, "hepb-2").scheduledDate)).toBe(
      "2024-02-15"
    );
    expect(last?.id).toBe("hpv-2");
    expect(last && toIsoDate(last.scheduledDate)).toBe("2036-07-15");
    expect(last?.scheduledEndDate && toIsoDate(last.scheduledEndDate)).toBe(
      "2037-01-15"
    );
  });

  it("AC-4.4 기간이 있는 회차는 scheduledEndDate를 가진다(dtap-4: 2025-04-15 ~ 2025-07-15)", () => {
    const item = itemById(scheduleFor("2024-01-15"), "dtap-4");

    expect(toIsoDate(item.scheduledDate)).toBe("2025-04-15");
    expect(item.scheduledEndDate && toIsoDate(item.scheduledEndDate)).toBe(
      "2025-07-15"
    );
  });
});

// AC-6.4 (FR-04): 월령 그룹(원본 groupScheduleByAge 1건 의도 이식). 반환은 ScheduleGroup[](설계서 §10.1).
describe("AC-6.4 groupScheduleByAge", () => {
  it("AC-6.4 2024-01-15 일정의 그룹 키는 [0, 1, 2, 4, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150] 순서 15개이고 0 그룹은 bcg-1, hepb-1, nirsevimab-1 3개다", () => {
    const groups = groupScheduleByAge(scheduleFor("2024-01-15"));

    expect(groups.map((group) => group.minMonths)).toEqual([
      0, 1, 2, 4, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150,
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "bcg-1",
      "hepb-1",
      "nirsevimab-1",
    ]);
    expect(groups.reduce((sum, group) => sum + group.items.length, 0)).toBe(41);
  });

  it("AC-6.4 빈 배열을 넣으면 그룹 0개다", () => {
    expect(groupScheduleByAge([])).toEqual([]);
  });

  it("AC-6.4 그룹은 minMonths 오름차순이고 그룹 안에서는 입력 순서를 유지한다", () => {
    const schedule = scheduleFor("2024-01-15");
    const reversed = [...schedule].reverse();
    const groups = groupScheduleByAge(reversed);

    expect(groups.map((group) => group.minMonths)).toEqual([
      0, 1, 2, 4, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150,
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "nirsevimab-1",
      "hepb-1",
      "bcg-1",
    ]);
  });
});

// AC-6.5 (FR-04, U-13): 화면 구역. '전체'는 접종할 구역(soon|upcoming)이 위, 지난 구역이 아래다.
describe("AC-6.5 sectionSchedule", () => {
  /** 구역별 그룹 키 */
  function sectionKeys(sections: ReturnType<typeof sectionSchedule>) {
    return sections.map((section) => ({
      kind: section.kind,
      months: section.groups.map((group) => group.minMonths),
    }));
  }

  /** 구역 안 항목 상태(중복 제거·정렬) */
  function statusesOf(section: ReturnType<typeof sectionSchedule>[number]) {
    const statuses = section.groups.flatMap((group) =>
      group.items.map((item) => item.status)
    );
    return [...new Set(statuses)].sort();
  }

  it("AC-6.5 2026-04-30 일정·필터 'all'이면 upcoming 구역(그룹 0·6~150, 28건) 다음 past 구역(그룹 0~4, 13건) 순서다", () => {
    const sections = sectionSchedule(scheduleFor("2026-04-30"), "all");

    expect(sectionKeys(sections)).toEqual([
      {
        kind: "upcoming",
        months: [0, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150],
      },
      { kind: "past", months: [0, 1, 2, 4] },
    ]);
    const [upcoming, past] = sections;
    if (!upcoming || !past) throw new Error("구역이 2개가 아니다");
    expect(statusesOf(upcoming)).toEqual(["soon", "upcoming"]);
    expect(statusesOf(past)).toEqual(["past"]);
    expect(upcoming.groups.flatMap((group) => group.items)).toHaveLength(28);
    expect(past.groups.flatMap((group) => group.items)).toHaveLength(13);
  });

  it("AC-6.5 필터 'upcoming'·'past'면 그 구역 하나뿐이다", () => {
    const schedule = scheduleFor("2026-04-30");

    expect(sectionKeys(sectionSchedule(schedule, "upcoming"))).toEqual([
      {
        kind: "upcoming",
        months: [0, 6, 7, 12, 15, 18, 24, 48, 72, 132, 144, 150],
      },
    ]);
    expect(sectionKeys(sectionSchedule(schedule, "past"))).toEqual([
      { kind: "past", months: [0, 1, 2, 4] },
    ]);
  });

  it("AC-6.5 2025-01-01 출생이면 생후 12개월 그룹이 두 구역에 나뉜다(hepa-1·ijev-1·ijev-2는 위, hib-4·pcv-4·mmr-1·var-1은 아래)", () => {
    const sections = sectionSchedule(scheduleFor("2025-01-01"), "all");

    expect(
      sections.map((section) =>
        section.groups
          .find((group) => group.minMonths === 12)
          ?.items.map((item) => item.id)
      )
    ).toEqual([
      ["hepa-1", "ijev-1", "ijev-2"],
      ["hib-4", "pcv-4", "mmr-1", "var-1"],
    ]);
  });

  it("AC-6.5 빈 구역은 뺀다: 오늘 출생이면 'all'이 upcoming 구역 하나, 'past'와 빈 입력은 []다", () => {
    const schedule = scheduleFor("2026-10-18");

    expect(sectionSchedule(schedule, "all").map((s) => s.kind)).toEqual([
      "upcoming",
    ]);
    expect(sectionSchedule(schedule, "past")).toEqual([]);
    expect(sectionSchedule([], "all")).toEqual([]);
  });
});

// AC-19.2·19.3·19.5 (FR-14, U-19·U-20): 완료 체크한 곧 접종·예정 항목은 완료 구역으로 옮겨 간다.
// '전체'는 접종할 구역 → 완료 구역 → 지난 구역, '예정'은 접종할 구역 → 완료 구역이다. 지난 항목은 완료해도 지난 구역 제자리다.
// 2026-04-30 출생·기준일 2026-10-18: 생후 6개월 그룹 = hepb-3(곧 접종)·dtap-3·ipv-3·hib-3·pcv-3·rv-3·flu-1, 지난 출생 시 = bcg-1·hepb-1.
describe("AC-19.2 sectionSchedule 완료 구역", () => {
  const completedOf = (...ids: ScheduleItemId[]) =>
    new Set<ScheduleItemId>(ids);

  /** 구역별 [kind, 그룹별 카드 id] */
  function layout(sections: ReturnType<typeof sectionSchedule>) {
    return sections.map((section) => [
      section.kind,
      section.groups.map((group) => [
        group.minMonths,
        group.items.map((item) => item.id),
      ]),
    ]);
  }

  it("AC-19.2 '전체'에서 hepb-3(곧 접종)·hpv-2(예정)를 완료하면 완료 구역(그룹 6·150)이 접종할 구역 뒤, 지난 구역 앞에 오고 카드 수는 41 그대로다", () => {
    const sections = sectionSchedule(
      scheduleFor("2026-04-30"),
      "all",
      completedOf("hpv-2", "hepb-3")
    );

    expect(sections.map((section) => section.kind)).toEqual([
      "upcoming",
      "completed",
      "past",
    ]);
    const [upcoming, completed, past] = layout(sections);
    expect(upcoming?.[1]).toContainEqual([
      6,
      ["dtap-3", "ipv-3", "hib-3", "pcv-3", "rv-3", "flu-1"],
    ]);
    expect(upcoming?.[1]).not.toContainEqual([150, ["hpv-2"]]);
    expect(completed).toEqual([
      "completed",
      [
        [6, ["hepb-3"]],
        [150, ["hpv-2"]],
      ],
    ]);
    expect(past?.[1]).toEqual([
      [0, ["bcg-1", "hepb-1"]],
      [1, ["hepb-2"]],
      [2, ["dtap-1", "ipv-1", "hib-1", "pcv-1", "rv-1"]],
      [4, ["dtap-2", "ipv-2", "hib-2", "pcv-2", "rv-2"]],
    ]);
    expect(flattenSections(sections)).toHaveLength(41);
  });

  it("AC-19.3 '예정'에서는 완료 구역이 맨 아래(마지막 구역)이고 카드 수는 28 그대로다", () => {
    const sections = sectionSchedule(
      scheduleFor("2026-04-30"),
      "upcoming",
      completedOf("hepb-3")
    );

    expect(layout(sections).slice(1)).toEqual([
      ["completed", [[6, ["hepb-3"]]]],
    ]);
    const order = flattenSections(sections);
    expect(order).toHaveLength(28);
    expect(order[order.length - 1]).toBe("hepb-3");
  });

  it("AC-19.5 지난 항목(bcg-1)은 완료해도 지난 구역 제자리이고 완료 구역은 생기지 않으며, '지남' 필터도 그대로다", () => {
    const schedule = scheduleFor("2026-04-30");
    const completed = completedOf("bcg-1");

    expect(layout(sectionSchedule(schedule, "all", completed))).toEqual(
      layout(sectionSchedule(schedule, "all"))
    );
    expect(layout(sectionSchedule(schedule, "past", completed))).toEqual(
      layout(sectionSchedule(schedule, "past"))
    );
    expect(sectionKindOf(itemById(schedule, "bcg-1"), completed)).toBe("past");
  });

  it("AC-19.2 모든 남은 항목을 완료하면 '전체'는 완료 구역 → 지난 구역, '예정'은 완료 구역 하나다(빈 접종할 구역은 뺀다)", () => {
    const schedule = scheduleFor("2026-04-30");
    const completed = new Set(
      schedule.filter((item) => item.status !== "past").map((item) => item.id)
    );

    expect(
      sectionSchedule(schedule, "all", completed).map((s) => s.kind)
    ).toEqual(["completed", "past"]);
    expect(
      sectionSchedule(schedule, "upcoming", completed).map((s) => s.kind)
    ).toEqual(["completed"]);
  });

  it("AC-19.2 sectionKindOf: 곧 접종·예정은 완료면 completed, 아니면 upcoming이고 지난 항목은 past다", () => {
    const schedule = scheduleFor("2026-04-30");
    const completed = completedOf("hepb-3", "hib-4", "bcg-1");

    expect(
      ["hepb-3", "hib-4", "dtap-3", "bcg-1", "hepb-1"].map((id) =>
        sectionKindOf(itemById(schedule, id), completed)
      )
    ).toEqual(["completed", "completed", "upcoming", "past", "past"]);
  });
});

// U-22: 완료를 뒤집어 카드가 구역을 옮기면 토글 전 목록에서 바로 다음 카드(마지막이면 앞 카드, 혼자면 자신)로 포커스를 옮긴다.
describe("U-22 focusTargetAfterToggle", () => {
  const schedule = scheduleFor("2026-04-30");
  const none: ReadonlySet<ScheduleItemId> = new Set();

  it("U-22 '전체'에서 hepb-3을 체크하면 바로 다음 카드 dtap-3, 접종할 구역 마지막 hpv-2를 체크하면 지난 구역 첫 카드 bcg-1이다", () => {
    expect(focusTargetAfterToggle(schedule, "all", none, "hepb-3")).toBe(
      "dtap-3"
    );
    expect(focusTargetAfterToggle(schedule, "all", none, "hpv-2")).toBe(
      "bcg-1"
    );
  });

  it("U-22 완료 구역의 hepb-3을 해제하면 완료 구역의 다음 카드 dtap-3이고, '예정' 맨 아래 마지막 카드를 해제하면 바로 앞 카드다", () => {
    const completed = new Set<ScheduleItemId>(["hepb-3", "dtap-3"]);

    expect(focusTargetAfterToggle(schedule, "all", completed, "hepb-3")).toBe(
      "dtap-3"
    );
    expect(
      focusTargetAfterToggle(schedule, "upcoming", completed, "dtap-3")
    ).toBe("hepb-3");
  });

  it("U-22 목록에 그 카드 하나뿐이면 그 카드 자신이다(새 구역에서 다시 마운트된 카드)", () => {
    const only = schedule.filter((item) => item.id === "hpv-2");

    expect(focusTargetAfterToggle(only, "upcoming", none, "hpv-2")).toBe(
      "hpv-2"
    );
  });

  it("U-22 구역이 그대로인 지난 카드, 필터에 보이지 않는 카드, 일정에 없는 id는 undefined다(포커스를 옮기지 않음)", () => {
    expect(focusTargetAfterToggle(schedule, "all", none, "bcg-1")).toBe(
      undefined
    );
    expect(focusTargetAfterToggle(schedule, "past", none, "hepb-3")).toBe(
      undefined
    );
    expect(focusTargetAfterToggle(schedule, "all", none, "nope-1")).toBe(
      undefined
    );
  });
});

// AC-7.5 (FR-05): 필터. past/soon/upcoming이 섞인 배열은 2026-04-30 일정(13/8/20, AC-5.3)이다.
describe("AC-7.5 filterSchedule", () => {
  it("AC-7.5 전제: 입력은 past 13 / soon 8 / upcoming 20이 섞인 41개다", () => {
    expect(countStatuses(scheduleFor("2026-04-30"))).toEqual({
      past: 13,
      soon: 8,
      upcoming: 20,
    });
  });

  it("AC-7.5 'all'은 입력 전체를 원래 순서대로 반환한다(새 배열)", () => {
    const items = scheduleFor("2026-04-30");
    const result = filterSchedule(items, "all");

    expect(result).toEqual(items);
    expect(result).not.toBe(items);
  });

  it("AC-7.5 'upcoming'은 status가 soon 또는 upcoming인 항목만 원래 순서대로 반환한다", () => {
    const items = scheduleFor("2026-04-30");
    const result = filterSchedule(items, "upcoming");

    expect(result).toHaveLength(28);
    expect(countStatuses(result)).toEqual({ past: 0, soon: 8, upcoming: 20 });
    expect(result.map((item) => item.id)).toEqual(
      items.filter((item) => item.status !== "past").map((item) => item.id)
    );
  });

  it("AC-7.5 'past'는 past만 원래 순서대로 반환한다", () => {
    const items = scheduleFor("2026-04-30");
    const result = filterSchedule(items, "past");

    expect(result).toHaveLength(13);
    expect(countStatuses(result)).toEqual({ past: 13, soon: 0, upcoming: 0 });
    expect(result.map((item) => item.id)).toEqual(
      items.filter((item) => item.status === "past").map((item) => item.id)
    );
  });

  it("AC-7.5 입력 배열은 변경되지 않는다", () => {
    const items = scheduleFor("2026-04-30");
    const snapshot = items.map((item) => item.id);

    filterSchedule(items, "past");
    filterSchedule(items, "upcoming");
    filterSchedule(items, "all");

    expect(items.map((item) => item.id)).toEqual(snapshot);
    expect(items).toHaveLength(41);
  });
});

// AC-6.3 (FR-04 · U-07 · U-15): 월령 라벨. 원본 규칙(0 → 출생 시 / <24 → 생후 N개월 / ≥24 → 만 ⌊N/12⌋세) + en 단수 "1 month"
// + ≥24개월에서 12의 배수가 아니면 남은 개월을 붙인다(U-15, 예: 150 → 만 12세 6개월). 12의 배수 결과는 원본과 같다
// (원본 formatMonthsLabel 3건 의도 포함).
describe("AC-6.3 formatMonthsLabel", () => {
  const cases: readonly (readonly [number, Locale, string])[] = [
    [0, "ko", "출생 시"],
    [0, "en", "At birth"],
    [0, "ja", "出生時"],
    [0, "zh", "出生时"],
    [1, "ko", "생후 1개월"],
    [1, "en", "1 month"],
    [2, "en", "2 months"],
    [2, "ko", "생후 2개월"],
    [6, "en", "6 months"],
    [6, "ja", "生後6ヶ月"],
    [6, "zh", "出生后6个月"],
    [23, "ko", "생후 23개월"],
    [24, "ko", "만 2세"],
    [35, "ko", "만 2세 11개월"],
    [48, "ko", "만 4세"],
    [48, "ja", "4歳"],
    [48, "zh", "4岁"],
    [72, "en", "6 years"],
    [144, "ko", "만 12세"],
    [150, "ko", "만 12세 6개월"],
    [150, "en", "12 years 6 months"],
    [150, "ja", "12歳6ヶ月"],
    [150, "zh", "12岁6个月"],
    [25, "en", "2 years 1 month"],
  ];

  it("AC-6.3 입력은 모두 24개다", () => {
    expect(cases).toHaveLength(24);
  });

  it.each(cases)(
    "AC-6.3 formatMonthsLabel(%i, %s) → %s",
    (months, locale, expected) => {
      expect(formatMonthsLabel(months, locale)).toBe(expected);
    }
  );
});

// ORIG: 원본 /Users/seungah.hong/workspace/vaccination/__tests__/schedule.test.ts의 it 17개를 새 시그니처로 이식(G-2 (a)).
// 새 시그니처: addMonthsToDate → addMonthsClamped(date.ts), calculateScheduleDate(birthdate, recommendedAge),
// determineStatus(start, end, now), generateSchedule(birthdate, vaccinations, now), groupScheduleByAge → ScheduleGroup[].
// 날짜 입력은 원본의 new Date("YYYY-MM-DD")(UTC 파싱) 대신 parseIsoDate(로컬 자정)를 쓴다.
// 매핑(원본 describe → AC): addMonthsToDate #1~#3 → AC-4.2 / calculateScheduleDate #4~#5 → AC-4.3 /
// determineStatus #6~#10 → AC-5.3 / generateSchedule #11~#13 → AC-4.4 / groupScheduleByAge #14 → AC-6.4 / formatMonthsLabel #15~#17 → AC-6.3.
describe("ORIG", () => {
  const SINGLE_DOSE = {
    doseNumber: 1,
    recommendedAge: {
      minMonths: 2,
      label: {
        ko: "생후 2개월",
        en: "2 months",
        ja: "生後2ヶ月",
        zh: "出生后2个月",
      },
    },
  };
  const RANGE_DOSE = {
    doseNumber: 4,
    recommendedAge: {
      minMonths: 15,
      maxMonths: 18,
      label: {
        ko: "생후 15~18개월",
        en: "15-18 months",
        ja: "生後15〜18ヶ月",
        zh: "出生后15-18个月",
      },
    },
  };

  it("#1 addMonthsToDate adds months correctly", () => {
    const result = addMonthsClamped(day("2024-01-15"), 2);

    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2); // March (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it("#2 addMonthsToDate handles year rollover", () => {
    const result = addMonthsClamped(day("2024-11-15"), 3);

    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1); // February
  });

  it("#3 addMonthsToDate handles 0 months (birth)", () => {
    const result = addMonthsClamped(day("2024-03-15"), 0);

    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(15);
  });

  it("#4 calculateScheduleDate calculates single date without range", () => {
    const result = calculateScheduleDate(
      day("2024-01-15"),
      SINGLE_DOSE.recommendedAge
    );

    expect(result.start.getMonth()).toBe(2); // March
    expect(result.end).toBeUndefined();
  });

  it("#5 calculateScheduleDate calculates date range with maxMonths", () => {
    const result = calculateScheduleDate(
      day("2024-01-15"),
      RANGE_DOSE.recommendedAge
    );

    expect(result.start.getMonth()).toBe(3); // April 2025
    expect(result.end).toBeDefined();
    expect(result.end?.getMonth()).toBe(6); // July 2025
  });

  it("#6 determineStatus returns 'past' for past dates", () => {
    expect(determineStatus(day("2020-01-01"), undefined, FIXED_NOW)).toBe(
      "past"
    );
  });

  it("#7 determineStatus returns 'soon' for dates within 30 days", () => {
    const soonDate = new Date(FIXED_NOW);
    soonDate.setDate(soonDate.getDate() + 15);

    expect(determineStatus(soonDate, undefined, FIXED_NOW)).toBe("soon");
  });

  it("#8 determineStatus returns 'upcoming' for future dates beyond 30 days", () => {
    const futureDate = new Date(FIXED_NOW);
    futureDate.setDate(futureDate.getDate() + 60);

    expect(determineStatus(futureDate, undefined, FIXED_NOW)).toBe("upcoming");
  });

  it("#9 determineStatus handles date ranges - past if end date is past", () => {
    expect(
      determineStatus(day("2020-01-01"), day("2020-06-01"), FIXED_NOW)
    ).toBe("past");
  });

  // 원본 제목 "handles date ranges - upcoming if end date is future"는 실제로 soon을 기대하므로 동작에 맞게 고쳤다
  it("#10 determineStatus handles date ranges - soon while the vaccination period is ongoing (end date is future)", () => {
    const endDate = new Date(FIXED_NOW);
    endDate.setFullYear(endDate.getFullYear() + 1);

    expect(determineStatus(day("2020-01-01"), endDate, FIXED_NOW)).toBe("soon");
  });

  it("#11 generateSchedule generates schedule items from vaccination data", () => {
    expect(scheduleFor("2024-01-15").length).toBeGreaterThan(0);
  });

  it("#12 generateSchedule sorts items by scheduled date", () => {
    const schedule = scheduleFor("2024-01-15");

    for (let i = 1; i < schedule.length; i += 1) {
      const previous = schedule[i - 1];
      const current = schedule[i];
      if (!previous || !current) throw new Error("일정 항목이 없다");
      expect(current.scheduledDate.getTime()).toBeGreaterThanOrEqual(
        previous.scheduledDate.getTime()
      );
    }
  });

  it("#13 generateSchedule includes BCG at birth", () => {
    const bcg = scheduleFor("2024-01-15").find(
      (item) => item.vaccination.id === "bcg"
    );

    expect(bcg).toBeDefined();
    expect(bcg?.scheduledDate.getDate()).toBe(15);
    expect(bcg?.scheduledDate.getMonth()).toBe(0); // January
  });

  it("#14 groupScheduleByAge groups schedule items by recommended age", () => {
    const groups = groupScheduleByAge(scheduleFor("2024-01-15"));

    expect(groups.length).toBeGreaterThan(0);
    expect(groups.find((group) => group.minMonths === 0)).toBeDefined(); // Birth vaccines
  });

  it("#15 formatMonthsLabel returns birth label for 0 months", () => {
    expect(formatMonthsLabel(0, "ko")).toBe("출생 시");
    expect(formatMonthsLabel(0, "en")).toBe("At birth");
  });

  it("#16 formatMonthsLabel returns month label for < 24 months", () => {
    expect(formatMonthsLabel(2, "ko")).toBe("생후 2개월");
    expect(formatMonthsLabel(6, "en")).toBe("6 months");
  });

  it("#17 formatMonthsLabel returns year label for >= 24 months", () => {
    expect(formatMonthsLabel(48, "ko")).toBe("만 4세");
    expect(formatMonthsLabel(72, "en")).toBe("6 years");
  });
});
