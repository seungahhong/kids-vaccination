import type { DateRange, IsoDate } from "@/types";

/** 올해를 포함한 선택 가능 연도 수(원본 page.tsx의 연도 select와 동일, U-05) */
export const BIRTHDATE_YEAR_SPAN = 10;

// 순수 날짜 유틸(설계서 §5.1). 모든 비교는 로컬 일 단위, 모든 덧셈은 달력 연산이다.
// `new Date('YYYY-MM-DD')`는 UTC로 파싱되어 서쪽 시간대에서 하루가 밀린다(T6 결함 1) → 여기서만 파싱한다.
// 연·월·일로 만드는 Date는 모두 localDate를 거친다(0~99년 보정).

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

/**
 * year년 monthIndex월 day일 로컬 자정. Date 생성자는 0~99년을 1900~1999년으로 바꾸므로(ECMAScript MakeFullYear)
 * setFullYear로 연도를 다시 넣는다. 웹 날짜 입력은 연도를 치는 동안 "0002-03-15" 같은 값을 거친다(R1-01).
 * 넘치는 월·일은 생성자와 같이 다음 달·해로 넘어간다.
 */
function localDate(year: number, monthIndex: number, day: number): Date {
  const date = new Date(year, monthIndex, day);
  date.setFullYear(year, monthIndex, day);
  return date;
}

/** 'YYYY-MM-DD'를 로컬 자정 Date로. 형식 불일치·달력상 무효(2024-02-30 등)는 null */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = localDate(year, month - 1, day);
  // 왕복 검증: Date 생성자는 넘치는 일·월을 다음 달로 넘기므로 되돌려 비교한다
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isIsoDate(value: string): value is IsoDate {
  return parseIsoDate(value) !== null;
}

/** 로컬 Y-M-D, 0 패딩(연도 4자리, 월·일 2자리) */
export function toIsoDate(date: Date): IsoDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}` as IsoDate;
}

/** 브랜드가 'YYYY-MM-DD' 형식과 달력 유효성을 보장하므로 total 함수다(자릿수 고정 슬라이스) */
export function isoDateToDate(iso: IsoDate): Date {
  return localDate(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10))
  );
}

/** 로컬 자정으로 자른 새 Date */
export function startOfDay(date: Date): Date {
  return localDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 달력 일 덧셈. ms 덧셈은 DST 전환일에 하루가 어긋나므로 쓰지 않는다(§0 주의점 4) */
export function addDays(date: Date, days: number): Date {
  return localDate(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  // 다음 달 0일 = 이번 달 말일
  return localDate(year, monthIndex + 1, 0).getDate();
}

/**
 * 말일 고정 월 덧셈: 결과 달에 같은 일이 없으면 그 달의 말일로 고정한다(2024-01-31 +1 → 2024-02-29).
 * 원본의 `setMonth`는 넘치는 일을 다음 달로 밀었다(T6 결함 2). 입력은 변경하지 않는다.
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const totalMonths = date.getMonth() + months;
  const year = date.getFullYear() + Math.floor(totalMonths / 12);
  const monthIndex = ((totalMonths % 12) + 12) % 12;
  const day = Math.min(date.getDate(), lastDayOfMonth(year, monthIndex));
  return localDate(year, monthIndex, day);
}

/** 로컬 Y/M/D만 비교한다(시각 무시) */
export function compareDay(a: Date, b: Date): -1 | 0 | 1 {
  const left = startOfDay(a).getTime();
  const right = startOfDay(b).getTime();
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** 생년월일 허용 범위: (현재 연도 − 9)년 1월 1일 ~ 오늘(둘 다 로컬 자정, U-05) */
export function getBirthdateRange(now: Date): DateRange {
  const year = now.getFullYear();
  return {
    min: localDate(year - (BIRTHDATE_YEAR_SPAN - 1), 0, 1),
    max: startOfDay(now),
  };
}

/** 양 끝 포함, 일 단위 */
export function isWithinRange(date: Date, range: DateRange): boolean {
  return compareDay(date, range.min) >= 0 && compareDay(date, range.max) <= 0;
}

/** 유효한 ISO 날짜이면서 허용 범위 안이면 true(AC-1.6) */
export function isSelectableBirthdate(
  value: string,
  now: Date
): value is IsoDate {
  const parsed = parseIsoDate(value);
  return parsed !== null && isWithinRange(parsed, getBirthdateRange(now));
}
