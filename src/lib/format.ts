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
