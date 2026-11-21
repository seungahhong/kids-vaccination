import { getBirthdateRange, toIsoDate } from "@/lib/date";
import {
  dayOptions,
  daysInMonth,
  EMPTY_DATE_PARTS,
  monthOptions,
  normalizeParts,
  partsOf,
  partsToIsoDate,
  yearOptions,
} from "@/lib/dateParts";
import { formatDayPart, formatMonthPart, formatYearPart } from "@/lib/format";
import type { Locale } from "@/types";

import { day, FIXED_NOW } from "../../../test-utils/render";

// 연·월·일 나눠 고르기(v1.8 U-32). 기준 범위는 FIXED_NOW(2026-10-18)의 생년월일 허용 범위 2017-01-01 ~ 2026-10-18이다(U-05).
const RANGE = getBirthdateRange(FIXED_NOW);
/** 하한이 1월 1일이 아닌 범위(하한 쪽 자르기 확인용): 2024-03-15 ~ 2026-10-18 */
const MID_RANGE = { min: day("2024-03-15"), max: RANGE.max };

describe("U-32 선택지(허용 범위 안만)", () => {
  it("U-32 yearOptions는 2026부터 2017까지 최근 연도가 먼저인 10개다", () => {
    expect(yearOptions(RANGE)).toEqual([
      2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017,
    ]);
  });

  it("U-32 monthOptions: 연도 미선택·중간 연도는 1~12, 올해(2026)는 10월까지, 하한 연도(2024-03-15)는 3월부터", () => {
    const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(monthOptions(RANGE, null)).toEqual(all);
    expect(monthOptions(RANGE, 2020)).toEqual(all);
    expect(monthOptions(RANGE, 2026)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(monthOptions(MID_RANGE, 2024)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("U-32 dayOptions: 월 미선택은 1~31, 연 미선택 2월은 29일까지, 2024-02는 29일·2025-02는 28일까지, 2026-10은 오늘 18일까지, 하한 2024-03은 15일부터", () => {
    expect(dayOptions(RANGE, null, null)).toHaveLength(31);
    expect(dayOptions(RANGE, 2025, null)).toHaveLength(31);
    expect(dayOptions(RANGE, null, 2).at(-1)).toBe(29);
    expect(dayOptions(RANGE, 2024, 2).at(-1)).toBe(29);
    expect(dayOptions(RANGE, 2025, 2).at(-1)).toBe(28);
    expect(dayOptions(RANGE, 2026, 10)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1)
    );
    expect(dayOptions(MID_RANGE, 2024, 3)[0]).toBe(15);
    expect(dayOptions(MID_RANGE, 2024, 3).at(-1)).toBe(31);
  });

  it("U-32 daysInMonth는 윤년을 반영한다", () => {
    expect(
      [
        [2024, 2],
        [2025, 2],
        [2026, 4],
        [2026, 12],
      ].map(([y, m]) => daysInMonth(y ?? 0, m ?? 0))
    ).toEqual([29, 28, 30, 31]);
  });
});

describe("U-32 맞추기·합치기", () => {
  it("U-32 normalizeParts: 고르지 않은 칸은 그대로 두고, 범위 밖 월·없는 날은 가장 가까운 고를 수 있는 값으로 당긴다", () => {
    expect(normalizeParts(EMPTY_DATE_PARTS, RANGE)).toEqual(EMPTY_DATE_PARTS);
    // 2025-12-31에서 연도를 2026으로 바꾸면 월은 10월, 날은 18일(오늘)까지로 당긴다
    expect(normalizeParts({ year: 2026, month: 12, day: 31 }, RANGE)).toEqual({
      year: 2026,
      month: 10,
      day: 18,
    });
    // 31일에서 월을 2월로 바꾸면 그 해 2월의 마지막 날
    expect(normalizeParts({ year: 2024, month: 2, day: 31 }, RANGE)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
    // 하한보다 앞이면 하한 쪽 끝으로 당긴다
    expect(normalizeParts({ year: 2024, month: 1, day: 1 }, MID_RANGE)).toEqual(
      { year: 2024, month: 3, day: 15 }
    );
    expect(normalizeParts({ year: 2010, month: null, day: 5 }, RANGE)).toEqual({
      year: 2017,
      month: null,
      day: 5,
    });
    expect(normalizeParts({ year: 2030, month: 6, day: 1 }, RANGE)).toEqual({
      year: 2026,
      month: 6,
      day: 1,
    });
  });

  it("U-32 partsToIsoDate: 세 칸을 다 골랐고 실제 있는 날짜면 IsoDate, 아니면 null이고 partsOf와 왕복한다", () => {
    expect(partsToIsoDate({ year: 2024, month: 1, day: 31 })).toBe(
      "2024-01-31"
    );
    expect(partsToIsoDate({ year: 2024, month: 2, day: 30 })).toBeNull();
    expect(partsToIsoDate({ year: 2024, month: null, day: 1 })).toBeNull();
    expect(partsToIsoDate({ year: null, month: 1, day: 1 })).toBeNull();
    expect(partsToIsoDate({ year: 2024, month: 1, day: null })).toBeNull();
    const iso = toIsoDate(day("2026-04-30"));
    expect(partsOf(iso)).toEqual({ year: 2026, month: 4, day: 30 });
    expect(partsToIsoDate(partsOf(iso))).toBe(iso);
    expect(partsOf(null)).toBe(EMPTY_DATE_PARTS);
  });
});

describe("U-32 선택지 표기(4개 언어)", () => {
  it.each([
    ["ko", "2024년", "1월", "12월", "31일"],
    ["en", "2024", "January", "December", "31"],
    ["ja", "2024年", "1月", "12月", "31日"],
    ["zh", "2024年", "1月", "12月", "31日"],
  ] as const)(
    "U-32 %s: 연 %s · 1월 %s · 12월 %s · 31일 %s",
    (locale: Locale, year, january, december, lastDay) => {
      expect(formatYearPart(2024, locale)).toBe(year);
      expect(formatMonthPart(1, locale)).toBe(january);
      expect(formatMonthPart(12, locale)).toBe(december);
      expect(formatDayPart(31, locale)).toBe(lastDay);
    }
  );

  it("U-32 en 월 이름은 1~12 밖이면 가장 가까운 끝으로 맞춘다(방어)", () => {
    expect(formatMonthPart(0, "en")).toBe("January");
    expect(formatMonthPart(13, "en")).toBe("December");
  });
});
