import type { TranslationKey } from "@/i18n/types";
import type { DateParts } from "@/lib/dateParts";
import { formatDayPart, formatMonthPart, formatYearPart } from "@/lib/format";
import type { Locale } from "@/types";

// 연·월·일 칸 정의(v1.8 U-32). 웹 선택 상자(BirthdatePicker.web.tsx)와 Android 선택 창(BirthdatePicker.tsx)이 같은 순서·이름·표기를 쓴다.

export type DatePart = keyof DateParts;

export type DatePartField = {
  readonly part: DatePart;
  /** 칸 이름(웹 select·Android 열 radiogroup의 접근 이름, 웹 첫 항목) */
  readonly labelKey: TranslationKey;
  /** 앱 언어 표기 */
  readonly format: (value: number, locale: Locale) => string;
};

export const DATE_PART_FIELDS: readonly DatePartField[] = [
  { part: "year", labelKey: "home.selectYear", format: formatYearPart },
  { part: "month", labelKey: "home.selectMonth", format: formatMonthPart },
  { part: "day", labelKey: "home.selectDay", format: formatDayPart },
];
