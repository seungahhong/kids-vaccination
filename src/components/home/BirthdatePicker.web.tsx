import { type ChangeEvent, type ReactElement, useState } from "react";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { isIsoDate, toIsoDate } from "@/lib/date";
import { FONT_SIZE, MIN_CONTROL_HEIGHT, RADIUS, SPACING } from "@/theme/tokens";

import type { BirthdatePickerProps } from "./BirthdatePicker.types";

// 웹 생년월일 피커(설계서 §7.1·§5.8): 브라우저 기본 <input type="date">. Metro가 웹 번들에서만 이 파일을 고르므로
// 네이티브 datetimepicker가 웹 번들에 들어가지 않는다. 커버리지 수집 대상이 아니고(설계서 §9.1) E2E AC-1.1~1.5·4.7이 검증한다.
// 아래 원문 state는 jest가 이 파일을 직접 불러 지킨다(src/components/home/__test__/BirthdatePicker.test.tsx, 리뷰 R2-02).
// 입력 원문은 로컬 state로 들고, 유효한 날짜일 때만 그 IsoDate를 올린다(비었거나 미완성·무효면 null). 범위 판정은 Home이 한다.
// 키보드로 칸을 채우는 동안 브라우저 값은 ""(미완성)이나 "0002-03-15"(연도 입력 중) 같은 중간값을 거친다. 제어 value를
// 상위 값에 묶으면 그때마다 React가 input을 상위 값("")으로 다시 써서 입력이 지워진다(리뷰 R1-01, e2e/review-r1-home.spec.ts).
// 입력 글자색·배경은 토큰(text on surface)으로 지정한다 — G-6 (b) 렌더 대비 스캔이 input도 검사한다(비평 N-06).
export function BirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const { t } = useI18n();
  const { tokens, scheme } = useTheme();
  const [text, setText] = useState<string>(value ?? "");

  // 자기 onChange가 돌아온 value는 원문과 늘 맞는다(유효하면 같은 문자열, 아니면 null).
  // 그 밖의 차이는 상위에서 값을 바꾼 것(프리필·초기화 등)이므로 렌더 중에 원문을 상위 값으로 맞춘다.
  // 지금 홈은 저장값이 바뀌면 HomeForm을 key로 다시 마운트해 이 분기를 타지 않지만, value가 상위 제어 값이라는 피커 공통
  // 계약(네이티브 피커는 늘 value를 표시)을 지키려고 둔다(리뷰 R2-02).
  const changedByParent = value === null ? isIsoDate(text) : value !== text;
  if (changedByParent) {
    setText(value ?? "");
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.currentTarget.value;
    setText(next);
    onChange(isIsoDate(next) ? next : null);
  };

  return (
    <input
      type="date"
      data-testid="birthdate-input"
      aria-label={t("home.birthdateLabel")}
      min={toIsoDate(range.min)}
      max={toIsoDate(range.max)}
      value={text}
      onChange={handleChange}
      style={{
        height: MIN_CONTROL_HEIGHT,
        width: "100%",
        boxSizing: "border-box",
        paddingLeft: SPACING.lg,
        paddingRight: SPACING.lg,
        fontSize: FONT_SIZE.md,
        fontFamily: "inherit",
        color: tokens.text,
        backgroundColor: tokens.surface,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.md,
        // 브라우저 기본 달력 팝업·아이콘이 앱 테마의 밝기를 따르게 한다
        colorScheme: scheme,
      }}
    />
  );
}
