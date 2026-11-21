import { isIsoDate } from "@/lib/date";
import type { DateRange, IsoDate } from "@/types";

// 연·월·일 나눠 고르기 순수 모듈(v1.8 U-32). 웹(연·월·일 선택 상자)과 Android(앱이 그리는 선택 창) 생년월일 피커가 쓴다.
// 브라우저 <input type="date">와 Android 시스템 날짜 대화상자는 브라우저·기기 언어로만 표시되어 앱 언어를 따를 수 없으므로,
// 앱이 선택지를 직접 만들고 표기는 src/lib/format.ts의 formatYearPart·formatMonthPart·formatDayPart가 맡는다.
// 선택지는 허용 범위(range, 둘 다 로컬 자정) 안의 날짜만 낸다: 범위 끝 연도에서는 월을, 범위 끝 연·월에서는 일을 잘라 낸다.
// 그래서 범위 밖 날짜(미래·하한 이전)는 고를 수 없다. 시각은 인자로 받은 range만 쓴다(오늘을 직접 읽지 않는다).

/** 고른 연·월·일. 아직 고르지 않은 칸은 null이다. month는 1~12 */
export type DateParts = {
  readonly year: number | null;
  readonly month: number | null;
  readonly day: number | null;
};

export const EMPTY_DATE_PARTS: DateParts = {
  year: null,
  month: null,
  day: null,
};

/** IsoDate를 연·월·일로 나눈다. null이면 모두 null */
export function partsOf(iso: IsoDate | null): DateParts {
  if (iso === null) return EMPTY_DATE_PARTS;
  // IsoDate는 'YYYY-MM-DD' 형식이 보장된다(isIsoDate로만 만든다)
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

/** 그 달의 날 수(윤년 반영). month는 1~12 */
export function daysInMonth(year: number, month: number): number {
  // 다음 달 0일 = 이 달 마지막 날(로컬 날짜 계산, 문자열 파싱 아님)
  return new Date(year, month, 0).getDate();
}

function range1(from: number, to: number): number[] {
  const values: number[] = [];
  for (let value = from; value <= to; value += 1) values.push(value);
  return values;
}

/** 고를 수 있는 연도: 범위 끝 연도부터 시작 연도까지(최근 연도가 먼저) */
export function yearOptions(range: DateRange): number[] {
  return range1(range.min.getFullYear(), range.max.getFullYear()).reverse();
}

/** 고를 수 있는 월(1~12). 연도를 아직 안 골랐으면 1~12 전부, 범위 끝 연도면 범위 밖 월을 뺀다 */
export function monthOptions(range: DateRange, year: number | null): number[] {
  const first = year === range.min.getFullYear() ? range.min.getMonth() + 1 : 1;
  const last = year === range.max.getFullYear() ? range.max.getMonth() + 1 : 12;
  return range1(first, last);
}

/**
 * 고를 수 있는 일. 연·월을 다 고르지 않았으면 1~31(연을 고르지 않았으면 2월도 29일까지), 다 골랐으면 그 달의 날 수까지이고
 * 범위 끝 연·월이면 범위 밖 날을 뺀다
 */
export function dayOptions(
  range: DateRange,
  year: number | null,
  month: number | null
): number[] {
  if (month === null) return range1(1, 31);
  // 연을 모르면 윤년(2000년)으로 셈해 2월 29일까지 남겨 둔다
  const last = daysInMonth(year ?? 2000, month);
  const atMin =
    year === range.min.getFullYear() && month === range.min.getMonth() + 1;
  const atMax =
    year === range.max.getFullYear() && month === range.max.getMonth() + 1;
  return range1(
    atMin ? range.min.getDate() : 1,
    atMax ? Math.min(last, range.max.getDate()) : last
  );
}

/** value를 options(비어 있지 않음) 안으로 맞춘다: 있으면 그대로, 작으면 첫 값, 크면 마지막 값. null은 그대로 */
function clampTo(
  value: number | null,
  options: readonly number[]
): number | null {
  if (value === null || options.includes(value)) return value;
  const lowest = Math.min(...options);
  return value < lowest ? lowest : Math.max(...options);
}

/**
 * 한 칸을 바꾼 뒤 나머지 칸을 범위 안으로 맞춘다(U-32). 연도를 바꿔 그 월이 범위 밖이 되거나(예: 올해 12월), 월을 바꿔 그 날이
 * 없어지면(예: 31일 → 2월) 가장 가까운 고를 수 있는 값으로 당긴다. 고르지 않은 칸(null)은 그대로 둔다
 */
export function normalizeParts(parts: DateParts, range: DateRange): DateParts {
  const year = clampTo(parts.year, yearOptions(range));
  const month = clampTo(parts.month, monthOptions(range, year));
  const day = clampTo(parts.day, dayOptions(range, year, month));
  return { year, month, day };
}

/** 세 칸을 다 골랐고 실제 있는 날짜면 그 IsoDate, 아니면 null */
export function partsToIsoDate(parts: DateParts): IsoDate | null {
  const { year, month, day } = parts;
  if (year === null || month === null || day === null) return null;
  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(text) ? text : null;
}
