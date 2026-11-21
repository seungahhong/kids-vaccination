import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { type ReactElement, type ReactNode, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { isoDateToDate, toIsoDate } from "@/lib/date";
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
import {
  FONT_SIZE,
  MIN_CONTROL_HEIGHT,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACING,
} from "@/theme/tokens";

import type { BirthdatePickerProps } from "./BirthdatePicker.types";
import { type DatePart, DATE_PART_FIELDS } from "./datePartFields";

// 네이티브 생년월일 피커(설계서 §7.1). iOS: 선택 버튼 → Modal 안의 spinner + 확인/취소(초안은 확인 때만 반영). spinner는
// locale prop으로 앱 언어를 따른다.
// Android(v1.8 U-32): 선택 버튼 → iOS와 같은 아래 시트 안의 연·월·일 세 열(앱이 그리는 선택지) + 확인/취소. 시스템 날짜 대화상자는
// 기기 언어로만 나오고 언어를 지정할 방법이 없어 앱 언어를 바꿔도 한국어(기기 언어)로 보였다. 열마다 role="radiogroup"(birthdate-column-{part}, 이름
// "연도 선택" 등) 안의 role="radio" 항목(birthdate-option-{year|month|day}-{값}, 앱 언어 표기)이고, 선택지·맞추기는 웹 선택 상자와
// 같은 src/lib/dateParts.ts다(범위 밖 날짜는 고를 수 없음). 초안은 열 때 현재 값(없으면 오늘)으로 시작해 확인 때만 반영한다.
// Platform.OS는 렌더 시점에 읽는다(모듈 최상위 금지 — jest.replaceProperty로 분기를 검증하기 위함, AD-05).
// 콜백은 onValueChange/onDismiss만 쓴다(9.x에서 onChange는 deprecated, F-04 — mock이 throw).
// 선택 버튼의 접근 이름은 "{생년월일}, {선택값 또는 생년월일 선택}"으로 보이는 텍스트를 포함한다(AD-27, 비평 N-02).

export function BirthdatePicker(props: BirthdatePickerProps): ReactElement {
  return Platform.OS === "ios" ? (
    <IosBirthdatePicker {...props} />
  ) : (
    <AndroidBirthdatePicker {...props} />
  );
}

/** Android 열 항목 높이(터치 영역) */
const OPTION_HEIGHT = MIN_TOUCH_TARGET;
/** Android 열에서 한 번에 보이는 항목 수 */
const VISIBLE_OPTIONS = 5;

function AndroidBirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const { t, locale } = useI18n();
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  // 초안: 열 때마다 현재 값(없으면 range.max = 오늘)으로 다시 시작한다
  const [draft, setDraft] = useState<DateParts>(() =>
    partsOf(toIsoDate(initialDraft(value, range)))
  );
  const draftIso = partsToIsoDate(draft);
  const options: Readonly<Record<DatePart, readonly number[]>> = {
    year: yearOptions(range),
    month: monthOptions(range, draft.year),
    day: dayOptions(range, draft.year, draft.month),
  };

  const show = () => {
    setDraft(partsOf(toIsoDate(initialDraft(value, range))));
    setOpen(true);
  };
  const cancel = () => setOpen(false);
  const confirm = () => {
    if (draftIso === null) return;
    setOpen(false);
    onChange(draftIso);
  };
  const pick = (part: DatePart, next: number) =>
    setDraft((previous) =>
      normalizeParts({ ...previous, [part]: next }, range)
    );

  return (
    <View>
      <PickerButton value={value} onPress={show} />
      <PickerSheet open={open} onCancel={cancel} onConfirm={confirm}>
        <View style={styles.columns}>
          {DATE_PART_FIELDS.map(({ part, labelKey, format }) => {
            const selectedIndex = options[part].indexOf(draft[part] ?? -1);
            return (
              <View
                key={part}
                testID={`birthdate-column-${part}`}
                role="radiogroup"
                aria-label={t(labelKey)}
                style={styles.column}
              >
                <ScrollView
                  style={styles.columnScroll}
                  // 고른 항목이 가운데쯤 보이게 연다
                  contentOffset={{
                    x: 0,
                    y: Math.max(0, selectedIndex - 2) * OPTION_HEIGHT,
                  }}
                >
                  {options[part].map((option) => {
                    const checked = draft[part] === option;
                    return (
                      <Pressable
                        key={option}
                        testID={`birthdate-option-${part}-${option}`}
                        role="radio"
                        aria-checked={checked}
                        onPress={() => pick(part, option)}
                        style={[
                          styles.option,
                          checked
                            ? { backgroundColor: tokens.primarySoft }
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionText,
                            {
                              color: checked
                                ? tokens.onPrimarySoft
                                : tokens.text,
                            },
                          ]}
                        >
                          {format(option, locale)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}
        </View>
      </PickerSheet>
    </View>
  );
}

function IosBirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const { locale } = useI18n();
  const { scheme } = useTheme();
  const [open, setOpen] = useState(false);
  // 초안: 열 때마다 현재 값(없으면 range.max = 오늘)으로 다시 시작한다
  const [draft, setDraft] = useState<Date>(() => initialDraft(value, range));

  const show = () => {
    setDraft(initialDraft(value, range));
    setOpen(true);
  };
  const cancel = () => setOpen(false);
  const confirm = () => {
    setOpen(false);
    onChange(toIsoDate(draft));
  };

  return (
    <View>
      <PickerButton value={value} onPress={show} />
      <PickerSheet open={open} onCancel={cancel} onConfirm={confirm}>
        <DateTimePicker
          value={draft}
          mode="date"
          display="spinner"
          minimumDate={range.min}
          maximumDate={range.max}
          themeVariant={scheme}
          locale={toLanguageTag(locale)}
          onValueChange={(_event, date) => setDraft(date)}
        />
      </PickerSheet>
    </View>
  );
}

/** 아래 시트(Modal): 머리에 취소·확인 버튼, 본문에 피커. iOS spinner와 Android 연·월·일 열이 함께 쓴다 */
function PickerSheet({
  open,
  onCancel,
  onConfirm,
  children,
}: {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const insets = useSafeAreaInsets();
  // 시트는 화면 맨 아래에 붙으므로 하단 여백이 홈 인디케이터 영역(safe-area 하단 inset)보다 작으면 겹친다(리뷰 R1-18)
  const sheetBottom = Math.max(SPACING.xl, insets.bottom);

  return (
    <Modal
      testID="birthdate-picker-modal"
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              paddingBottom: sheetBottom,
            },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Pressable
              role="button"
              onPress={onCancel}
              style={styles.sheetButton}
            >
              <Text
                style={[
                  styles.sheetButtonText,
                  { color: tokens.textSecondary },
                ]}
              >
                {t("home.pickerCancel")}
              </Text>
            </Pressable>
            <Pressable
              role="button"
              onPress={onConfirm}
              style={styles.sheetButton}
            >
              <Text
                style={[
                  styles.sheetButtonText,
                  styles.sheetConfirmText,
                  { color: tokens.tabActive },
                ]}
              >
                {t("home.pickerConfirm")}
              </Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** 선택 버튼: 보이는 텍스트는 선택값(YYYY-MM-DD) 또는 "생년월일 선택", 접근 이름은 라벨 + 보이는 텍스트 */
function PickerButton({
  value,
  onPress,
}: {
  readonly value: BirthdatePickerProps["value"];
  readonly onPress: () => void;
}): ReactElement {
  const { t } = useI18n();
  const { tokens } = useTheme();
  const visibleText = value ?? t("home.selectBirthdate");

  return (
    <Pressable
      testID="birthdate-picker-button"
      role="button"
      aria-label={`${t("home.birthdateLabel")}, ${visibleText}`}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Calendar color={tokens.textSecondary} size={20} />
      <Text
        style={[
          styles.buttonText,
          { color: value === null ? tokens.textSecondary : tokens.text },
        ]}
      >
        {visibleText}
      </Text>
    </Pressable>
  );
}

function initialDraft(
  value: BirthdatePickerProps["value"],
  range: BirthdatePickerProps["range"]
): Date {
  return value === null ? range.max : isoDateToDate(value);
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderWidth: 1,
    borderRadius: RADIUS.md,
  },
  buttonText: { fontSize: FONT_SIZE.md },
  backdrop: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderTopWidth: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.sm,
  },
  sheetButton: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: SPACING.md,
  },
  sheetButtonText: { fontSize: FONT_SIZE.md },
  sheetConfirmText: { fontWeight: "600" },
  columns: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  column: { flex: 1 },
  columnScroll: { height: OPTION_HEIGHT * VISIBLE_OPTIONS },
  option: {
    height: OPTION_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  optionText: { fontSize: FONT_SIZE.md },
});
