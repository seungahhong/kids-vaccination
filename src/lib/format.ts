import type { Locale } from "@/types";

// 로케일 템플릿 포매터(설계서 §5.3, P-05). Intl·toLocaleDateString은 엔진별 ICU 차이가 있어 쓰지 않는다(R-07).

type MonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

const MONTHS_EN: Readonly<Record<MonthIndex, string>> = {
  0: "January",
  1: "February",
  2: "March",
  3: "April",
  4: "May",
  5: "June",
  6: "July",
  7: "August",
  8: "September",
  9: "October",
  10: "November",
  11: "December",
};

/** ko `${y}년 ${m}월 ${d}일` · en `${Month} ${d}, ${y}` · ja/zh `${y}年${m}月${d}日` */
export function formatDisplayDate(date: Date, locale: Locale): string {
  const year = date.getFullYear();
  // Date.getMonth()는 0~11만 반환한다
  const monthIndex = date.getMonth() as MonthIndex;
  const month = monthIndex + 1;
  const day = date.getDate();
  switch (locale) {
    case "ko":
      return `${year}년 ${month}월 ${day}일`;
    case "en":
      return `${MONTHS_EN[monthIndex]} ${day}, ${year}`;
    case "ja":
    case "zh":
      return `${year}年${month}月${day}日`;
  }
}

/** end가 있으면 `${start} ~ ${end}`, 없으면 start만 */
export function formatDateRange(
  start: Date,
  end: Date | undefined,
  locale: Locale
): string {
  const startText = formatDisplayDate(start, locale);
  return end === undefined
    ? startText
    : `${startText} ~ ${formatDisplayDate(end, locale)}`;
}

/** 로케일별 회차 표기(U-07 · AD-28). 언어 누락·초과는 컴파일 오류다 */
export const DOSE_LABELS = {
  ko: (n: number) => `${n}차`,
  en: (n: number) => `Dose ${n}`,
  ja: (n: number) => `${n}回目`,
  zh: (n: number) => `${n}次`,
} as const satisfies Readonly<Record<Locale, (n: number) => string>>;

/** 예: ("BCG(피내용)", 1, ko) → "BCG(피내용) 1차", ("BCG (Intradermal)", 1, en) → "BCG (Intradermal) Dose 1" */
export function formatDoseLabel(
  name: string,
  doseNumber: number,
  locale: Locale
): string {
  return `${name} ${DOSE_LABELS[locale](doseNumber)}`;
}

// 연·월·일 선택지 표기(v1.8 U-32). 웹 선택 상자·Android 선택 창이 앱 언어로 보이게 한다(브라우저·기기 날짜 UI는 앱 언어를 따르지 않음).

/** ko `${y}년` · en `${y}` · ja/zh `${y}年` */
export function formatYearPart(year: number, locale: Locale): string {
  switch (locale) {
    case "ko":
      return `${year}년`;
    case "en":
      return String(year);
    case "ja":
    case "zh":
      return `${year}年`;
  }
}

/** month 1~12. ko `${m}월` · en 영문 월 이름 · ja/zh `${m}月` */
export function formatMonthPart(month: number, locale: Locale): string {
  switch (locale) {
    case "ko":
      return `${month}월`;
    case "en":
      return MONTHS_EN[toMonthIndex(month)];
    case "ja":
    case "zh":
      return `${month}月`;
  }
}

/** ko `${d}일` · en `${d}` · ja/zh `${d}日` */
export function formatDayPart(day: number, locale: Locale): string {
  switch (locale) {
    case "ko":
      return `${day}일`;
    case "en":
      return String(day);
    case "ja":
    case "zh":
      return `${day}日`;
  }
}

/** 1~12 → 0~11(범위 밖은 가장 가까운 끝) */
function toMonthIndex(month: number): MonthIndex {
  const index = Math.min(11, Math.max(0, Math.round(month) - 1));
  // 0~11로 잘랐으므로 MonthIndex다
  return index as MonthIndex;
}
