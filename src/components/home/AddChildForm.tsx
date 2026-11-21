import { ArrowRight } from "lucide-react-native";
import { type ReactElement, type Ref, useMemo, useState } from "react";
import {
  type HostInstance,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BirthdatePicker } from "@/components/home/BirthdatePicker";
import { useChildren } from "@/contexts/ChildrenContext";
import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToday } from "@/hooks/useToday";
import { formatMessage } from "@/i18n/translate";
import { MAX_CHILD_NAME_LENGTH, MAX_CHILDREN } from "@/lib/children";
import {
  getBirthdateRange,
  isoDateToDate,
  isWithinRange,
  toIsoDate,
} from "@/lib/date";
import { FONT_SIZE, MIN_CONTROL_HEIGHT, RADIUS, SPACING } from "@/theme/tokens";
import type { ChildId, IsoDate } from "@/types";

// 아이 추가 폼(FR-16, U-26·U-30). 아이가 없을 때 홈 화면에, 아이가 있을 때는 헤더 "아이 추가" 메뉴(AppHeader) 안에 나온다.
//   제목(level 2 heading "아이 추가") → (가득 찼으면) 안내 home-children-full → 생년월일(필수, 플랫폼별 BirthdatePicker)
//   → 이름(선택, child-name-input, 최대 MAX_CHILD_NAME_LENGTH자) → 제출 birthdate-submit("일정 확인하기")
// 칸 순서는 생년월일이 먼저, 이름이 다음이다(U-30). 칸 위에 보이는 라벨(이름 + "필수"/"선택" 표시)을 두고, 입력 요소의 접근 이름은
// 그 라벨 텍스트를 포함한다(WCAG 2.5.3). 생년월일 허용 범위는 useToday() 기준 getBirthdateRange(U-05)이고, 제출은 생년월일이
// 범위 안이고 아이가 MAX_CHILDREN(10)명 미만일 때만 활성이다. 제출하면 새 아이를 더하고(그 아이가 선택됨) onAdded를 부른다.
// 폼은 새 아이용이라 저장값을 프리필하지 않는다. 헤더 메뉴는 열 때마다 새로 마운트되므로 입력도 비어 있다.
// 헤더 메뉴가 열릴 때 포커스를 줄 수 있게 제목 Text의 ref·nativeID·onLayout을 받는다(웹은 메뉴 상자, 네이티브는 제목, V-01 규칙).

export type AddChildFormProps = {
  /** 폼 컨테이너 testID(홈 home-add-child, 헤더 메뉴 header-add-child) */
  readonly testID: string;
  /** 아이를 더한 뒤(그 아이가 선택된 상태) */
  readonly onAdded: (id: ChildId) => void;
  readonly headingRef?: Ref<HostInstance>;
  readonly headingNativeID?: string;
  readonly onHeadingLayout?: () => void;
};

/** 입력 칸 위의 보이는 라벨: 이름 + "필수"/"선택" 표시 */
function FieldLabel({
  label,
  marker,
}: {
  readonly label: string;
  readonly marker: string;
}): ReactElement {
  const { tokens } = useTheme();
  return (
    <View style={styles.fieldLabel}>
      <Text style={[styles.fieldLabelText, { color: tokens.text }]}>
        {label}
      </Text>
      <Text style={[styles.fieldMarker, { color: tokens.textSecondary }]}>
        {marker}
      </Text>
    </View>
  );
}

export function AddChildForm({
  testID,
  onAdded,
  headingRef,
  headingNativeID,
  onHeadingLayout,
}: AddChildFormProps): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const { canAddChild, addChild } = useChildren();
  // 의존성은 Date identity가 아니라 날짜 문자열(설계서 §5.6·§5.9)
  const todayKey = toIsoDate(useToday());
  const range = useMemo(
    () => getBirthdateRange(isoDateToDate(todayKey)),
    [todayKey]
  );
  const [draft, setDraft] = useState<IsoDate | null>(null);
  const [name, setName] = useState("");
  const canSubmit =
    canAddChild && draft !== null && isWithinRange(isoDateToDate(draft), range);
  const nameLabel = t("home.childName");

  const submit = () => {
    if (!canSubmit) return;
    const id = addChild({ name, birthdate: draft });
    if (id !== null) onAdded(id);
  };

  return (
    <View testID={testID} style={styles.form}>
      <Text
        ref={headingRef}
        nativeID={headingNativeID}
        onLayout={onHeadingLayout}
        role="heading"
        aria-level={2}
        style={[styles.heading, { color: tokens.text }]}
      >
        {t("home.addChild")}
      </Text>
      {canAddChild ? null : (
        <Text
          testID="home-children-full"
          style={[styles.full, { color: tokens.textSecondary }]}
        >
          {formatMessage(t("home.childrenFull"), { max: MAX_CHILDREN })}
        </Text>
      )}
      <View style={styles.field}>
        <FieldLabel
          label={t("home.birthdateLabel")}
          marker={t("home.required")}
        />
        <BirthdatePicker value={draft} onChange={setDraft} range={range} />
      </View>
      <View style={styles.field}>
        <FieldLabel label={nameLabel} marker={t("home.optional")} />
        <TextInput
          testID="child-name-input"
          aria-label={`${nameLabel} (${t("home.optional")})`}
          value={name}
          onChangeText={setName}
          maxLength={MAX_CHILD_NAME_LENGTH}
          placeholder={t("home.childNamePlaceholder")}
          placeholderTextColor={tokens.textSecondary}
          editable={canAddChild}
          style={[
            styles.nameInput,
            {
              color: tokens.text,
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
            },
          ]}
        />
      </View>
      <Pressable
        testID="birthdate-submit"
        role="button"
        disabled={!canSubmit}
        onPress={submit}
        style={[
          styles.submit,
          { backgroundColor: tokens.primary, opacity: canSubmit ? 1 : 0.4 },
        ]}
      >
        <Text style={[styles.submitText, { color: tokens.onPrimary }]}>
          {t("home.submit")}
        </Text>
        <ArrowRight color={tokens.onPrimary} size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACING.md },
  heading: { fontSize: FONT_SIZE.md, fontWeight: "700" },
  full: { fontSize: FONT_SIZE.sm, lineHeight: 20 },
  field: { gap: SPACING.xs },
  fieldLabel: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm },
  fieldLabelText: { fontSize: FONT_SIZE.sm, fontWeight: "600" },
  fieldMarker: { fontSize: FONT_SIZE.xs },
  nameInput: {
    minHeight: MIN_CONTROL_HEIGHT,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.md,
  },
  submit: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
  },
  submitText: { fontSize: FONT_SIZE.md, fontWeight: "600" },
});
