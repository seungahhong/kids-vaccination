import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { type ReactElement, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useI18n } from "@/contexts/I18nContext";
import { useTheme } from "@/contexts/ThemeContext";
import { isoDateToDate, toIsoDate } from "@/lib/date";
import { toLanguageTag } from "@/lib/locale";
import {
  FONT_SIZE,
  MIN_CONTROL_HEIGHT,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACING,
} from "@/theme/tokens";

import type { BirthdatePickerProps } from "./BirthdatePicker.types";

// 네이티브 생년월일 피커(설계서 §7.1). iOS: 선택 버튼 → Modal 안의 spinner + 확인/취소(초안은 확인 때만 반영).
// Android: 선택 버튼 → 기본 다이얼로그(onValueChange → 닫고 반영, onDismiss → 닫기만).
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

function AndroidBirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <View>
      <PickerButton value={value} onPress={() => setOpen(true)} />
      {open && (
        <DateTimePicker
          value={initialDraft(value, range)}
          mode="date"
          display="default"
          minimumDate={range.min}
          maximumDate={range.max}
          onValueChange={(_event, date) => {
            setOpen(false);
            onChange(toIsoDate(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </View>
  );
}

function IosBirthdatePicker({
  value,
  onChange,
  range,
}: BirthdatePickerProps): ReactElement {
  const { t, locale } = useI18n();
  const { tokens, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  // 시트는 화면 맨 아래에 붙으므로 하단 여백이 홈 인디케이터 영역(safe-area 하단 inset)보다 작으면 겹친다(리뷰 R1-18)
  const sheetBottom = Math.max(SPACING.xl, insets.bottom);
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
      <Modal
        testID="birthdate-picker-modal"
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={cancel}
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
                onPress={cancel}
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
                onPress={confirm}
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
          </View>
        </View>
      </Modal>
    </View>
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
});
