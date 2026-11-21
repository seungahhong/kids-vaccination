import {
  type ChangeEvent,
  type CSSProperties,
  type ReactElement,
  useState,
} from "react";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  type DateParts,
  dayOptions,
  monthOptions,
  normalizeParts,
  partsOf,
  partsToIsoDate,
  yearOptions,
} from "@/lib/dateParts";
import { toLanguageTag } from "@/lib/locale";
import { FONT_SIZE, MIN_CONTROL_HEIGHT, RADIUS, SPACING } from "@/theme/tokens";
import type { BirthdatePickerProps } from "./BirthdatePicker.types";
import { type DatePart, DATE_PART_FIELDS } from "./datePartFields";

// 웹 생년월일 피커(설계서 §7.1·§5.8, v1.8 U-32): 연·월·일 <select> 3개. Metro가 웹 번들에서만 이 파일을 고르므로
// 네이티브 datetimepicker가 웹 번들에 들어가지 않는다. 커버리지 수집 대상이 아니고(설계서 §9.1) E2E(AC-1.x·4.7·21.x)와
// jest(src/components/home/__test__/BirthdatePicker.test.tsx, 이 파일을 직접 불러 봄)가 검증한다.
// v1.7까지는 브라우저 기본 <input type="date">였다. 그 표시 형식·달력 팝업은 브라우저 언어로만 나오고 lang 속성도 따르지 않아
// 앱 언어를 바꿔도 한국어(브라우저 언어)로 보였다. 그래서 선택지를 앱이 만들고 앱 언어로 표기한다(formatYearPart 등, U-32).
//   birthdate-input(role group, 이름 "생년월일", lang = 앱 언어)
//   └─ birthdate-year / birthdate-month / birthdate-day: <select>(이름 "연도 선택"·"월 선택"·"일 선택", 첫 항목은 고르지 않음)
// 선택지는 허용 범위 안만 낸다(미래·하한 이전 날짜는 고를 수 없음, src/lib/dateParts.ts). 한 칸을 바꾸면 나머지 칸을 범위 안으로
// 맞추고(normalizeParts), 세 칸이 다 골라져 실제 날짜가 되면 그 IsoDate를, 아니면 null을 올린다. 범위 판정은 그대로 Home도 한다.
// 고른 칸은 로컬 state로 들고, 상위 value가 바뀌면(프리필·초기화) 그 값으로 맞춘다(리뷰 R2-02와 같은 계약).
// 선택지 표기는 option의 label 속성에 둔다(브라우저가 보여 주는 글자이자 접근 이름). 자식 텍스트로 두면 jest의 RN 렌더러가
// "Text strings must be rendered within a <Text>"로 거부해 이 파일을 jest에서 렌더할 수 없다.
// 글자색·배경은 토큰(text on surface)으로 지정한다 — G-6 (b) 렌더 대비 스캔이 select·option도 검사한다.

/** 칸별 select testID */
const SELECT_TEST_IDS: Readonly<Record<DatePart, string>> = {
  year: "birthdate-year",
  month: "birthdate-month",
  day: "birthdate-day",
};

export function BirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const { t, locale } = useI18n();
  const { tokens, scheme } = useTheme();
  const [parts, setParts] = useState<DateParts>(() => partsOf(value));

  // 자기 onChange가 돌아온 value는 고른 칸과 늘 맞는다(다 골랐으면 같은 날짜, 아니면 null).
  // 그 밖의 차이는 상위에서 값을 바꾼 것(프리필·초기화 등)이므로 렌더 중에 칸을 상위 값으로 맞춘다(리뷰 R2-02).
  const current = partsToIsoDate(parts);
  const changedByParent = value === null ? current !== null : value !== current;
  if (changedByParent) {
    setParts(partsOf(value));
  }

  const options: Readonly<Record<DatePart, readonly number[]>> = {
    year: yearOptions(range),
    month: monthOptions(range, parts.year),
    day: dayOptions(range, parts.year, parts.month),
  };

  const handleChange =
    (part: DatePart) =>
    (event: ChangeEvent<HTMLSelectElement>): void => {
      const raw = event.currentTarget.value;
      const next = normalizeParts(
        { ...parts, [part]: raw === "" ? null : Number(raw) },
        range
      );
      setParts(next);
      onChange(partsToIsoDate(next));
    };

  const selectStyle: CSSProperties = {
    height: MIN_CONTROL_HEIGHT,
    minWidth: 0,
    boxSizing: "border-box",
    paddingLeft: SPACING.sm,
    paddingRight: SPACING.sm,
    fontSize: FONT_SIZE.md,
    fontFamily: "inherit",
    color: tokens.text,
    backgroundColor: tokens.surface,
    border: `1px solid ${tokens.border}`,
    borderRadius: RADIUS.md,
    // 브라우저 기본 펼침 목록이 앱 테마의 밝기를 따르게 한다
    colorScheme: scheme,
  };

  return (
    <div
      data-testid="birthdate-input"
      role="group"
      // 필수 입력임을 이름에도 담는다(화면의 "필수" 표시는 보조기기에 연결되지 않음, 리뷰 R4-04 WCAG 3.3.2)
      aria-label={`${t("home.birthdateLabel")} (${t("home.required")})`}
      lang={toLanguageTag(locale)}
      style={{ display: "flex", gap: SPACING.sm, width: "100%" }}
    >
      {DATE_PART_FIELDS.map(({ part, labelKey, format }) => (
        <select
          key={part}
          data-testid={SELECT_TEST_IDS[part]}
          aria-label={t(labelKey)}
          aria-required
          value={parts[part] ?? ""}
          onChange={handleChange(part)}
          style={{ ...selectStyle, flex: part === "year" ? 1.3 : 1 }}
        >
          <option value="" label={t(labelKey)} />
          {options[part].map((option) => (
            <option
              key={option}
              value={option}
              label={format(option, locale)}
            />
          ))}
        </select>
      ))}
    </div>
  );
}
